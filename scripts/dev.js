#!/usr/bin/env node
/**
 * scripts/dev.js —— 本地服务的启停与状态
 *
 * 为什么要它：纯 vibe coding 下最容易出的事故是「重启十几次，留一堆僵尸进程占着端口」，
 * 下一轮 AI 起服务时端口已被占，于是它得出「端口被别的项目用了」的结论，
 * 跑去改配置——而真正的问题只是有个上次的僵尸还活着。
 *
 * 用法：
 *   node scripts/dev.js start             起 API + Web(dev server)，等健康后打印 pid / 端口
 *   node scripts/dev.js start --preview   起 API + Preview(dist 构建产物，供隧道暴露)
 *   node scripts/dev.js stop              停掉全部（含按端口兜底清理僵尸）
 *   node scripts/dev.js restart           = stop + start
 *   node scripts/dev.js status            只报告，不改任何东西
 *
 * ⚠ dev server 与 preview 的区别（重要）：
 *   dev server 会把整个仓库当静态根，任何人访问 /@fs/<绝对路径> 都能读到
 *   .git/config、apps/api/cache/library.json 等任意文件。所以 dev server 只能
 *   本机自己用；要对公网开隧道，必须用 --preview（只服务 dist/，且不暴露 /@fs/）。
 *
 * ⚠ 脱离 DSH 进程树（重要）：
 *   DSH 用 Windows Job 对象管着它启动的子进程，DSH 一退出 Job 关闭，里面的进程全被带走。
 *   所以这里的服务不是直接 spawn 的，而是经 WMI（Win32_Process.Create）交给
 *   WmiPrvSE.exe 代建 —— 父链在 services.exe 下，实测 InJob=False，关掉 DSH 也不会死。
 *   WMI 失败时自动退回普通 spawn（会留在 DSH 树里，但至少服务能起来）。
 *
 * 运行时文件都落在 <repo>/.tmp/run/（已被 .gitignore 忽略），不污染仓库根目录。
 * 日志：.tmp/run/api.out.log、api.err.log、web.out.log、web.err.log、preview.*.log
 */

const { spawn, execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");

const ROOT = path.join(__dirname, "..");
const RUN = path.join(ROOT, ".tmp", "run");

/**
 * 服务的定义。
 * 都直接用当前 node 跑入口脚本，不经过 npm —— 少一层进程，多一层可控性，
 * 也避免 Windows 上 spawn .cmd 需要 shell 的坑。
 */
const SVC_API = {
  name: "api",
  label: "API      ",
  ports: [1003, 1006],
  health: "http://127.0.0.1:1003/api/stats",
  cmd: process.execPath,
  args: [path.join(ROOT, "apps", "api", "src", "index.js")],
  cwd: ROOT,
};

/** 开发用：热更新，但会把整个仓库暴露成静态根，只能本机自己用。 */
const SVC_WEB_DEV = {
  name: "web",
  label: "Web(dev) ",
  ports: [1005],
  health: "http://127.0.0.1:1005/",
  cmd: process.execPath,
  args: [path.join(ROOT, "node_modules", "vite", "bin", "vite.js")],
  cwd: path.join(ROOT, "apps", "web"),
};

/** 对公网用：只服务 dist/ 构建产物，不暴露 /@fs/，可以安全地挂隧道。 */
const SVC_WEB_PREVIEW = {
  name: "preview",
  label: "Web(prev)",
  ports: [1007],
  health: "http://127.0.0.1:1007/",
  cmd: process.execPath,
  args: [path.join(ROOT, "node_modules", "vite", "bin", "vite.js"), "preview"],
  cwd: path.join(ROOT, "apps", "web"),
};

/** stop / status 覆盖全部，这样切模式时不会留下上一模式的僵尸。 */
const ALL_SERVICES = [SVC_API, SVC_WEB_DEV, SVC_WEB_PREVIEW];
const MODES = {
  dev: [SVC_API, SVC_WEB_DEV],
  preview: [SVC_API, SVC_WEB_PREVIEW],
};

// ────────────────────────────────────────────────────────── 基础设施

const C = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

function log(s = "") {
  process.stdout.write(s + "\n");
}

function pidFile(name) {
  return path.join(RUN, `${name}.pid`);
}

/** WMI 包装进程（cmd.exe）的 pid 单独存一份，stop 时要一并收掉。 */
function wrapPidFile(name) {
  return path.join(RUN, `${name}.wrap.pid`);
}

function readPid(name) {
  try {
    const raw = fs.readFileSync(pidFile(name), "utf8").trim();
    return Number(raw) || null;
  } catch {
    return null;
  }
}

function readWrapPid(name) {
  try {
    const raw = fs.readFileSync(wrapPidFile(name), "utf8").trim();
    return Number(raw) || null;
  } catch {
    return null;
  }
}

function alive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // EPERM = 进程存在但没权限（不是本用户起的），也算活着
    return e.code === "EPERM";
  }
}

/**
 * 找出正在监听指定端口的所有 pid。
 * 用 netstat 而不是「只信 pid 文件」：pid 文件会丢、会过期，
 * 而端口是真的——端口被占才是真正的障碍。
 */
function pidsOnPorts(ports) {
  let out = "";
  try {
    out = execFileSync("netstat", ["-ano", "-p", "tcp"], {
      encoding: "utf8",
      windowsHide: true,
    });
  } catch {
    return [];
  }
  const pids = new Set();
  for (const line of out.split(/\r?\n/)) {
    // 例：  TCP    0.0.0.0:1003    0.0.0.0:0    LISTENING    46372
    const m = line.match(/^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/i);
    if (!m) continue;
    if (ports.includes(Number(m[1]))) pids.add(Number(m[2]));
  }
  return [...pids];
}

function killTree(pid) {
  try {
    execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return true;
  } catch {
    return false;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** 探测 URL 是否返回 2xx。超时短一点，循环调用不会卡死。 */
function probe(url, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 400);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

// ────────────────────────────────────────────── 脱离 DSH 进程树启动

/**
 * 为什么要绕这一圈：DSH 用 Job 对象管着它启动的所有子进程，DSH 一退出 Job 就关闭，
 * 里面的进程全被带走 —— 表现就是「用户不小心关掉 DSH，本地服务跟着一起没了」。
 *
 * 实测（IsProcessInJob）：dev.js 自己、以及它直接 spawn 出来的服务，InJob 全是 True；
 * 而经 WMI `Win32_Process.Create` 创建的进程 InJob=False。原因是 WMI 让
 * WmiPrvSE.exe（services.exe 的子进程）代它创建，父链压根不在 DSH 树里。
 *
 * 两个必须遵守的约束：
 *   1. CommandLine 只用 ASCII。中文路径改由 WMI 的 CurrentDirectory 属性传
 *      （那是属性不是命令行，不吃控制台代码页），命令行里一律用相对路径。
 *      实测经命令行传中文，在部分调用链上会被 GBK 吃掉，变成乱码目录。
 *   2. PowerShell 脚本用 -EncodedCommand（base64/UTF-16LE）传入，
 *      让中文的 CurrentDirectory 全程不经过代码页转换。
 */
function psEncoded(script) {
  return Buffer.from(script, "utf16le").toString("base64");
}

/** 把绝对路径换成相对 svc.cwd 的路径（保证 CommandLine 里没有中文）。 */
function asciiRel(cwd, p) {
  return path.isAbsolute(p) ? path.relative(cwd, p) : p;
}

function psQuote(s) {
  return String(s).replace(/'/g, "''");
}

/** 经 WMI 创建进程，返回 WmiPrvSE 代建出来的那个 cmd 包装进程的 pid。 */
function launchViaWmi(svc) {
  const outLog = asciiRel(svc.cwd, path.join(RUN, `${svc.name}.out.log`));
  const errLog = asciiRel(svc.cwd, path.join(RUN, `${svc.name}.err.log`));
  const args = svc.args.map((a) => asciiRel(svc.cwd, a));
  const resultFile = path.join(RUN, `${svc.name}.wmi.txt`);

  const cli =
    `cmd.exe /c ""${svc.cmd}" ` +
    args.map((a) => `"${a}"`).join(" ") +
    ` >> "${outLog}" 2>> "${errLog}""`;

  // 3. 必须带 DETACHED_PROCESS（0x8），让它彻底没有控制台。
  //    实测：不加时 WMI 建出来的 cmd.exe 仍挂在启动它的那个控制台上，控制台收到
  //    CTRL_C_EVENT 时会一并把它带走 —— 表现是日志里莫名多出一行 `^C`（cmd.exe
  //    自己打印的），然后服务就没了。这不是「DSH 退出才死」，是每次启动它的那条
  //    pwsh 命令结束就可能死，比 Job 对象还阴。
  //    DETACHED_PROCESS 让进程完全脱离控制台，CTRL_C/CTRL_CLOSE 事件根本送不到它，
  //    这才是「脱离」该有的样子。CREATE_NO_WINDOW(0x08000000) 不行：它只是不给窗口，
  //    控制台还在，照样能收到 CTRL_C。
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "$si = New-CimInstance -ClassName Win32_ProcessStartup -Namespace root/cimv2 -ClientOnly -Property @{ CreateFlags = [uint32]0x00000008 }",
    "$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{",
    `  CommandLine = '${psQuote(cli)}'`,
    `  CurrentDirectory = '${psQuote(svc.cwd)}'`,
    "  ProcessStartupInformation = $si",
    "}",
    `Set-Content -LiteralPath '${psQuote(resultFile)}' -Value ("WMIOK " + $r.ProcessId + " " + $r.ReturnValue) -Encoding ASCII`,
  ].join("\n");

  try {
    fs.unlinkSync(resultFile);
  } catch {
    /* 本来就不在 */
  }

  // ⚠ 两个坑，都实测过，别"顺手优化"回去：
  //
  // 1. 不要加 -ExecutionPolicy Bypass。
  //    实测：带 Bypass 时 powershell.exe 会在 4 次里卡死 3 次（ETIMEDOUT 12s/23s/12s，
  //    只有 1 次 OK）；去掉后 4/4 全 OK，约 700ms。Bypass 会触发执行策略重解析，
  //    在本机策略链（含 ConstrainedLanguage/AppLocker 之类）上偶发挂住。
  //    -EncodedCommand 本身不经过 .ps1 文件，本来就不吃执行策略，加了纯属有害。
  //
  // 2. stdio 必须是 "ignore"，不能用管道。
  //    WMI 建出来的 cmd.exe 会继承 PowerShell 的标准句柄，管道写端一直不关，
  //    父进程读 stdout 永远等不到 EOF，spawnSync 直接卡到超时（实测 20s ETIMEDOUT）。
  //    所以结果走文件回传，不走 stdout。
  execFileSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-EncodedCommand", psEncoded(script)],
    { stdio: "ignore", windowsHide: true, timeout: 30_000 }
  );

  let raw = "";
  try {
    raw = fs.readFileSync(resultFile, "utf8");
  } catch {
    throw new Error("WMI 没有回传结果文件");
  }
  const m = raw.match(/WMIOK\s+(\d+)\s+(\d+)/);
  if (!m) throw new Error(`WMI 结果无法解析：${raw.trim().slice(0, 80)}`);
  if (Number(m[2]) !== 0) throw new Error(`Win32_Process.Create 返回 ${m[2]}`);
  try {
    fs.unlinkSync(resultFile);
  } catch {
    /* 无所谓 */
  }
  return Number(m[1]);
}

/** 兜底：老的直接 spawn。会留在 DSH 的 Job 里，但总比起不来强。 */
function launchPlain(svc) {
  const outFd = fs.openSync(path.join(RUN, `${svc.name}.out.log`), "a");
  const errFd = fs.openSync(path.join(RUN, `${svc.name}.err.log`), "a");
  const child = spawn(svc.cmd, svc.args, {
    cwd: svc.cwd,
    stdio: ["ignore", outFd, errFd],
    detached: true,
    windowsHide: true,
  });
  child.unref();
  return child.pid;
}

// ────────────────────────────────────────────────────────── 动作

async function stop() {
  log(C.bold("停止服务"));
  for (const svc of ALL_SERVICES) {
    // 三路取 pid：pid 文件里的、WMI 包装进程的、端口实际占着的。取并集，才能清掉僵尸。
    const fromFile = readPid(svc.name);
    const fromWrap = readWrapPid(svc.name);
    const fromPort = pidsOnPorts(svc.ports);
    const targets = [...new Set([fromFile, fromWrap, ...fromPort].filter(Boolean))];

    if (targets.length === 0) {
      log(`  ${svc.label} ${C.dim("未在运行")}`);
      continue;
    }
    const killed = targets.filter(killTree);
    // 给操作系统一点时间把端口释放掉
    for (let i = 0; i < 20 && pidsOnPorts(svc.ports).length > 0; i++) await sleep(150);

    const still = pidsOnPorts(svc.ports);
    log(
      still.length === 0
        ? `  ${svc.label} ${C.green("已停止")} ${C.dim(`(pid ${killed.join(", ") || "无"})`)}`
        : `  ${svc.label} ${C.red("停止失败")} 仍被占用：pid ${still.join(", ")}`
    );
    try {
      fs.unlinkSync(pidFile(svc.name));
    } catch {
      /* 文件本来就不在，无所谓 */
    }
    try {
      fs.unlinkSync(wrapPidFile(svc.name));
    } catch {
      /* 同上 */
    }
  }
  log();
}

async function start(mode = "dev") {
  fs.mkdirSync(RUN, { recursive: true });
  const services = MODES[mode];
  if (!services) {
    log(`${C.red("未知模式")}：${mode}（可选 dev | preview）`);
    return false;
  }
  log(C.bold(`启动服务 ${C.dim(`[${mode}]`)}`));

  // 切模式前先清掉另一种 web 的残留，否则会出现「两个 web 抢同一个后端」
  const stale = ALL_SERVICES.filter(
    (s) => s.name !== "api" && !services.includes(s)
  );
  for (const s of stale) {
    const onPorts = pidsOnPorts(s.ports);
    if (onPorts.length > 0) {
      log(`  ${s.label} ${C.yellow("清掉另一模式的残留")} pid ${onPorts.join(", ")}`);
      for (const pid of onPorts) killTree(pid);
      for (let i = 0; i < 20 && pidsOnPorts(s.ports).length > 0; i++) await sleep(150);
      try { fs.unlinkSync(pidFile(s.name)); } catch { /* 无所谓 */ }
      try { fs.unlinkSync(wrapPidFile(s.name)); } catch { /* 无所谓 */ }
    }
  }

  let anyFail = false;

  for (const svc of services) {
    // 先看端口是不是已经有人了——占着就明确报出来，不要闷头起第二份
    const occupied = pidsOnPorts(svc.ports);
    if (occupied.length > 0) {
      log(`  ${svc.label} ${C.yellow("端口已被占用")} ${svc.ports.join(",")} ← pid ${occupied.join(", ")}`);
      log(`  ${" ".repeat(9)}${C.dim("先跑 node scripts/dev.js stop 再试")}`);
      anyFail = true;
      continue;
    }

    // 这里刻意不用 `node --watch`。
    // 原因不是嫌它烦，是它会同时把两件事变成假的：
    //   1. --watch 会 fork 一个子进程跑真正的服务，于是「pid 文件里的 pid」和
    //      「占着端口的 pid」永远不同，drift 检查从此一直误报——误报多了，人就不看警告了。
    //   2. 杀掉子进程后 --watch 父进程会把它重新拉起来，于是 stop 之后端口又回来了。
    // 改代码就跑一次 `node scripts/dev.js restart`，比一个会骗人的自动重启可靠。
    let wrapperPid = null;
    let viaWmi = true;
    try {
      wrapperPid = launchViaWmi(svc);
    } catch (e) {
      viaWmi = false;
      log(`  ${svc.label} ${C.yellow("WMI 启动失败，退回普通 spawn")} ${C.dim(String(e.message).slice(0, 80))}`);
      wrapperPid = launchPlain(svc);
    }
    fs.writeFileSync(pidFile(svc.name), String(wrapperPid ?? ""), "utf8");
    if (viaWmi && wrapperPid) {
      fs.writeFileSync(wrapPidFile(svc.name), String(wrapperPid), "utf8");
    }

    // 等它真的能用——「进程起了」不等于「服务好了」
    const deadline = Date.now() + 45_000;
    let ok = false;
    while (Date.now() < deadline) {
      if (await probe(svc.health)) {
        ok = true;
        break;
      }
      await sleep(500);
    }

    if (ok) {
      // 经 WMI 时 wrapperPid 是 cmd 包装进程；真正监听端口的是它的子进程。
      // pid 文件写「真正占端口的那个」，status 的 drift 检查才不会误报。
      const real = pidsOnPorts(svc.ports);
      const showPid = real.length > 0 ? real.join(",") : wrapperPid;
      if (real.length > 0) fs.writeFileSync(pidFile(svc.name), String(real[0]), "utf8");
      log(`  ${svc.label} ${C.green("已启动")} pid ${showPid}  端口 ${svc.ports.join(" / ")}`);
      log(
        `  ${" ".repeat(9)}${C.dim(
          viaWmi ? "已脱离 DSH 进程树（关掉 DSH 也不会被带走）" : "仍在 DSH 进程树内（DSH 退出会带走）"
        )}`
      );
      log(`  ${" ".repeat(9)}${C.dim(svc.health)}`);
    } else {
      anyFail = true;
      log(`  ${svc.label} ${C.red("45 秒内没就绪")} pid ${wrapperPid ?? "?"}`);
      const tail = fs
        .readFileSync(path.join(RUN, `${svc.name}.err.log`), "utf8")
        .split(/\r?\n/)
        .filter(Boolean)
        .slice(-6);
      for (const l of tail) log(`  ${" ".repeat(9)}${C.dim(l.slice(0, 150))}`);
    }
  }

  log(`  ${" ".repeat(9)}${C.dim(`日志与 pid：${path.relative(ROOT, RUN)}/`)}`);
  log();
  return !anyFail;
}

async function status() {
  log(C.bold("服务状态"));
  let apiOk = false;
  let webOk = false;

  for (const svc of ALL_SERVICES) {
    const pid = readPid(svc.name);
    const onPorts = pidsOnPorts(svc.ports);
    const health = await probe(svc.health);
    if (svc.name === "api") apiOk = health;
    else if (health) webOk = true;

    // pid 文件与端口实况可能不一致，那是真信息，不是噪声——说明有僵尸或有人手改了
    const drift =
      onPorts.length > 0 && (pid === null || !onPorts.includes(pid))
        ? C.yellow(`  ⚠ pid 文件(${pid ?? "无"}) 与端口实况(${onPorts.join(",")})不一致`)
        : "";

    // dev 与 preview 互斥，没跑的那个不算故障，标成「未启用」即可
    const idle = svc.name !== "api" && !health && onPorts.length === 0;
    log(
      `  ${svc.label} ${health ? C.green("在线") : idle ? C.dim("未启用") : C.red("离线")}  ` +
        `端口 ${svc.ports.join("/")}  实际 pid ${onPorts.join(",") || C.dim("无")}${drift}`
    );
  }
  log();
  // 判据：API 在线，且至少有一个 web（dev 或 preview）在线
  return apiOk && webOk;
}

// ────────────────────────────────────────────────────────── 入口

const action = process.argv[2];
const flags = process.argv.slice(3);
const MODE = flags.includes("--preview") ? "preview" : "dev";

const ACTIONS = {
  start: () => start(MODE).then((ok) => process.exit(ok ? 0 : 1)),
  stop: () => stop().then(() => process.exit(0)),
  restart: async () => {
    await stop();
    const ok = await start(MODE);
    process.exit(ok ? 0 : 1);
  },
  status: () => status().then((ok) => process.exit(ok ? 0 : 1)),
};

if (!ACTIONS[action]) {
  log(`${C.bold("用法")} node scripts/dev.js <start|stop|restart|status> [--preview]`);
  log(`  ${C.dim("不加 --preview 起 dev server(1005，仅本机)；加了起 preview(1007，可挂隧道)")}`);
  process.exit(2);
}
ACTIONS[action]();