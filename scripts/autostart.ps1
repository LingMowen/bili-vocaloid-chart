<#
.SYNOPSIS
  开机自启：后端 API + 前端 preview + 两条 Cloudflare 隧道。幂等，重复执行不会起多份。

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\autostart.ps1

.EXAMPLE
  # 计划任务以 SYSTEM 跑时必须显式传隧道目录（$env:USERPROFILE 会指向 systemprofile）
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\autostart.ps1 `
    -CloudflaredDir "$env:USERPROFILE\.cloudflared"

.设计说明
  1. 服务本体一律交给 scripts/dev.js 起（自带端口僵尸清理 + 健康探测 + WMI 脱离父进程树），
     本脚本不重复实现启停，避免两处逻辑漂移。
  2. 模式固定 --preview：隧道 ingress 指向 1007（vite preview，只服务 dist/）。
     用 dev 模式 1007 空着 -> 线上 502（踩过，见 docs/云端部署运维手册.md）。
  3. dist 缺失才 build：开机路径不该被几分钟的构建卡住。
  4. 单实例文件锁：开机任务(SYSTEM)与登录任务(用户)可能几乎同时触发，锁保证只跑一个。
  5. 隧道配置目录显式参数化，不靠 $env:USERPROFILE 猜 —— SYSTEM 上下文猜必错且静默。
#>
[CmdletBinding()]
param(
  [string]$RepoRoot = "",
  [string]$NodeExe = "",
  [string]$CloudflaredExe = "",
  [string]$CloudflaredDir = ""
)

$ErrorActionPreference = "Continue"

# PowerShell 捕获外部程序（node / dev.js）的管道输出时按 [Console]::OutputEncoding 解码。
# 默认取控制台代码页（本机 936/GBK），而 node 输出 UTF-8 -> 中文变「鏈嶅姟鐘舵€」乱码。
# 必须在调用任何外部程序前设成 UTF-8（只 chcp 不够）。
try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  $OutputEncoding = [System.Text.Encoding]::UTF8
} catch {}

# ---------- 仓库根 ----------
# 不能在 param 默认值里写 (Split-Path -Parent $PSScriptRoot)：param 块求值时
# $PSScriptRoot 仍是空串，实测 -File 调用直接报 "Cannot bind argument ... empty
# string" 并退出。计划任务正是用 -File 调用，所以必须在脚本体内算。
if (-not $RepoRoot) {
  $selfDir = $PSScriptRoot
  if (-not $selfDir) { $selfDir = Split-Path -Parent $MyInvocation.MyCommand.Path }
  if (-not $selfDir) { Write-Host "无法确定脚本所在目录，请传 -RepoRoot"; exit 1 }
  $RepoRoot = Split-Path -Parent $selfDir
}

# ---------- 可执行文件探测 ----------
# 把本机绝对路径写进默认值会把环境耦合进仓库，换机器静默失败。优先 PATH，
# 其次常见安装位置；node 找不到直接退出（拿空串去 Start-Process 只会得到难懂的报错）。
function Resolve-Exe {
  param([string]$Name, [string[]]$Hints)
  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  foreach ($p in $Hints) { if ($p -and (Test-Path $p)) { return (Resolve-Path $p).Path } }
  return $null
}
if (-not $NodeExe) {
  $NodeExe = Resolve-Exe -Name "node" -Hints @("C:\Program Files\nodejs\node.exe", "D:\ProgramData\node\node.exe")
  if (-not $NodeExe) { Write-Host "找不到 node，请传 -NodeExe"; exit 1 }
}
if (-not $CloudflaredExe) {
  $CloudflaredExe = Resolve-Exe -Name "cloudflared" -Hints @(
    "$env:ProgramFiles\cloudflared\cloudflared.exe",
    "${env:ProgramFiles(x86)}\cloudflared\cloudflared.exe"
  )
}

# ---------- 隧道配置目录 ----------
# 未显式传参时：先看当前用户目录，落空再扫 Users 下带 vocaloid.yml 的目录。
if (-not $CloudflaredDir) {
  $cand = Join-Path $env:USERPROFILE ".cloudflared"
  if (-not (Test-Path (Join-Path $cand "vocaloid.yml"))) {
    $users = Join-Path (Split-Path -Parent $env:SystemRoot) "Users"
    $hit = Get-ChildItem $users -Directory -ErrorAction SilentlyContinue |
      ForEach-Object { Join-Path $_.FullName ".cloudflared\vocaloid.yml" } |
      Where-Object { Test-Path $_ } | Select-Object -First 1
    if ($hit) { $cand = Split-Path -Parent $hit }
  }
  $CloudflaredDir = $cand
}

# ---------- 运行时目录与日志 ----------
$Run = Join-Path $RepoRoot ".tmp\run"
New-Item -ItemType Directory -Force -Path $Run | Out-Null
$LogPath = Join-Path $Run "autostart.log"

function Log {
  param([string]$Msg)
  # dev.js 的输出带 ANSI 颜色转义码，被管道捕获后按控制台代码页解码会乱码
  # （实测日志里出现「鍚姟鏈嶅姟」）。落盘前剥掉转义序列，日志才可读。
  $clean = ($Msg -replace "\x1B\[[0-9;]*[A-Za-z]", "")
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $clean
  Write-Host $line
  try { Add-Content -Path $LogPath -Value $line -Encoding UTF8 } catch {}
}

# ---------- 单实例锁 ----------
$lockFile = Join-Path $Run "autostart.lock"
if (Test-Path $lockFile) {
  $ageMin = ((Get-Date) - (Get-Item $lockFile).LastWriteTime).TotalMinutes
  if ($ageMin -lt 5) {
    Write-Host ("已有 autostart 在运行（锁 {0:N0}s 前创建），本次退出" -f ($ageMin * 60))
    exit 0
  }
  Log "发现陈旧锁（$([int]$ageMin) 分钟前），视为上次异常残留，接管"
}
Set-Content -Path $lockFile -Value "$PID $(Get-Date -Format o)" -Encoding ASCII

try {
  Log "===== autostart 开始 ====="
  Log "repo=$RepoRoot node=$NodeExe cloudflaredDir=$CloudflaredDir"

  # ---------- 1) 等网络（隧道与 B 站采集都依赖外网） ----------
  $netOk = $false
  for ($i = 1; $i -le 12; $i++) {
    try {
      $null = Resolve-DnsName -Name "api.bilibili.com" -ErrorAction Stop -DnsOnly
      $netOk = $true; break
    } catch { Start-Sleep -Seconds 5 }
  }
  if ($netOk) { Log "网络就绪" } else { Log "警告：DNS 解析 12 次均失败，仍继续（服务会自行重试）" }

  # ---------- 2) 前端产物（缺失才构建） ----------
  $dist = Join-Path $RepoRoot "apps\web\dist\index.html"
  if (-not (Test-Path $dist)) {
    Log "dist 缺失，执行 vite build（可能几分钟）"
    Push-Location (Join-Path $RepoRoot "apps\web")
    try {
      & $NodeExe (Join-Path $RepoRoot "node_modules\vite\bin\vite.js") build 2>&1 |
        ForEach-Object { Log ("  build| " + $_.ToString().Trim()) }
    } finally { Pop-Location }
  } else {
    Log "dist 已存在，跳过构建"
  }

  # ---------- 3) 后端 API + 前端 preview ----------
  # 先探健康：服务已在跑时 dev.js start 会报「端口已被占用」并拒绝，日志看着像启动失败。
  # 开机场景端口必然空闲，这里主要是让重复执行（手动补跑、锁过期后重入）输出干净结论。
  function Test-Alive([string]$Url) {
    try { return (Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5).StatusCode -eq 200 } catch { return $false }
  }
  $devjs = Join-Path $RepoRoot "scripts\dev.js"
  $apiUp = Test-Alive "http://127.0.0.1:1003/api/stats"
  $webUp = Test-Alive "http://127.0.0.1:1007/"
  if ($apiUp -and $webUp) {
    Log "API 与 Web(preview) 均已在线，跳过启动"
  } else {
    if ($apiUp -or $webUp) { Log "部分在线（api=$apiUp web=$webUp），交给 dev.js 清僵尸后重启" }
    Log "启动 API + Web(preview)"
    & $NodeExe $devjs start --preview 2>&1 | ForEach-Object { Log ("  dev.js| " + $_.ToString().Trim()) }
  }

  # ---------- 4) Cloudflare 隧道 ----------
  function Start-Tunnel {
    param([string]$Name, [string]$ConfigPath, [string]$ProbeUrl)
    if (-not $CloudflaredExe) { Log "跳过隧道 $Name：找不到 cloudflared"; return }
    if (-not (Test-Path $ConfigPath)) { Log "跳过隧道 $Name：配置不存在 $ConfigPath"; return }
    $running = Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" -ErrorAction SilentlyContinue |
      Where-Object { $_.CommandLine -and $_.CommandLine -match ("run\s+" + [regex]::Escape($Name) + "\b") } |
      Select-Object -First 1
    if ($running) { Log "隧道 $Name 已在运行（pid $($running.ProcessId)），跳过"; return }
    Log "启动隧道 $Name"
    Start-Process -FilePath $CloudflaredExe `
      -ArgumentList @("tunnel", "--config", $ConfigPath, "--no-autoupdate", "run", $Name) `
      -WindowStyle Hidden `
      -RedirectStandardOutput (Join-Path $Run ("tunnel-{0}.out.log" -f $Name)) `
      -RedirectStandardError  (Join-Path $Run ("tunnel-{0}.err.log"  -f $Name)) | Out-Null
    Start-Sleep -Seconds 8
    if ($ProbeUrl) {
      try {
        $code = (Invoke-WebRequest -Uri $ProbeUrl -UseBasicParsing -TimeoutSec 25).StatusCode
        Log "隧道 $Name 探活 $ProbeUrl => $code"
      } catch { Log "隧道 $Name 探活 $ProbeUrl 失败: $($_.Exception.Message)" }
    }
  }

  # 主站：vocaloid.ciallo.ltd -> 1007（preview 静态 + /api 反代）
  Start-Tunnel -Name "vocaloid" -ConfigPath (Join-Path $CloudflaredDir "vocaloid.yml") `
    -ProbeUrl "https://vocaloid.ciallo.ltd/api/stats"
  # 同步：sync.ciallo.ltd -> 1003，云端审核前经此域名反向拉本地
  Start-Tunnel -Name "vocaloid-sync" -ConfigPath (Join-Path $CloudflaredDir "vocaloid-sync.yml") `
    -ProbeUrl "https://sync.ciallo.ltd/api/stats"

  # ---------- 5) 汇总 ----------
  Start-Sleep -Seconds 3
  & $NodeExe $devjs status --preview 2>&1 | ForEach-Object { Log ("  status| " + $_.ToString().Trim()) }
  Log "===== autostart 结束 ====="
}
catch {
  Log "未捕获异常: $($_.Exception.Message)"
}
finally {
  # 释放锁：让下一次触发（含手动重跑）不必等 5 分钟陈旧判定
  try { Remove-Item $lockFile -Force -ErrorAction SilentlyContinue } catch {}
}
