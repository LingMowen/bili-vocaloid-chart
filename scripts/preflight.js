#!/usr/bin/env node
/**
 * preflight —— 推送前门禁
 *
 * 这个项目几乎全部由 AI 改、人工几乎不读代码。传统的人工 review 在这里等于没有，
 * 所以把「每次推送都该做但人在偷懒的检查」固化成机器门禁：跑不过就不许推。
 *
 *   node scripts/preflight.js            完整检查
 *   node scripts/preflight.js --json     机器可读输出
 *   SKIP_PREFLIGHT=1 git push            紧急逃生口（会留下痕迹，见 docs/对接文档.md）
 *
 * 分级：
 *   BLOCK  —— 真实泄密 / 语法错 / 禁入目录被跟踪，直接失败
 *   WARN   —— 通用模式疑似、未跟踪文件、服务不在线，只提醒不拦
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, execSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const JSON_OUT = process.argv.includes("--json");
const results = [];

/* ---------- 小工具 ---------- */

function git(args, opts = {}) {
  return execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    ...opts,
  });
}

/**
 * git grep 的 exit 码：0=有命中，1=无命中，其他=用法错/内部错。
 * 一定要分开：把「命令写错」当成「没查到」会得出假的 0 命中结论——
 * 这类量具事故在这个项目里已经吃过好几次亏。
 */
function gitGrep(args) {
  try {
    return { lines: git(args).split("\n").filter(Boolean), error: null };
  } catch (e) {
    if (e.status === 1) return { lines: [], error: null };
    const msg = `${(e.stderr || "").toString()}`.trim().split("\n")[0] || `exit ${e.status}`;
    return { lines: [], error: msg };
  }
}

function record(level, name, detail, extra = {}) {
  results.push({ level, name, detail, ...extra });
  if (!JSON_OUT) {
    const mark = level === "BLOCK" ? "x" : level === "WARN" ? "!" : "o";
    const line = `  [${mark}] ${name}`;
    console.log(line);
    if (detail) {
      for (const d of String(detail).split("\n")) console.log(`        ${d}`);
    }
  }
}

function section(title) {
  if (!JSON_OUT) console.log(`\n== ${title} ==`);
}

function findPackageType(dir) {
  let cur = dir;
  while (cur.startsWith(ROOT)) {
    const p = path.join(cur, "package.json");
    if (fs.existsSync(p)) {
      try {
        return JSON.parse(fs.readFileSync(p, "utf8")).type || "commonjs";
      } catch {
        return "commonjs";
      }
    }
    const up = path.dirname(cur);
    if (up === cur) break;
    cur = up;
  }
  return "commonjs";
}

function nodeCheck(abs, isModule) {
  const tmp = path.join(os.tmpdir(), `pf-${process.pid}-${Math.random().toString(36).slice(2)}.mjs`);
  try {
    let target = abs;
    if (isModule) {
      fs.copyFileSync(abs, tmp);
      target = tmp;
    }
    execFileSync(process.execPath, ["--check", target], { stdio: "pipe" });
    return null;
  } catch (e) {
    const out = `${(e.stderr || "").toString()}`.trim().split("\n").slice(0, 4).join("\n");
    return out || "语法检查失败（无输出）";
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
}

/* ---------- 0. 前提 ---------- */

section("前提");

let tracked = [];
try {
  tracked = git(["ls-files"]).split("\n").filter(Boolean);
} catch (e) {
  record("BLOCK", "不是 git 仓库 / git 不可用", e.message);
  report();
}
if (!JSON_OUT) console.log(`  受版本控制的文件：${tracked.length}`);
record("ok", "已读取跟踪文件清单", `${tracked.length} 个文件`);

/* ---------- 1. 禁入目录是否被跟踪 ---------- */

section("1. 禁入路径");

const FORBIDDEN = [
  { re: /^old-files\//, why: "归档目录（.gitignore 已排除）" },
  { re: /(^|\/)\.env$/, why: "真实凭据文件" },
  { re: /(^|\/)\.env\.(?!example$)/, why: "凭据备份文件" },
  { re: /^docs\/开发日志\.md$/, why: "本地开发日志" },
  { re: /^\.workbuddy(-ai)?\//, why: "AI 会话记忆" },
  { re: /^\.reference\//, why: "参考站 DOM 快照" },
  { re: /^参考文件\//, why: "参考站页面快照" },
  { re: /(^|\/)SDK\//, why: "第三方参考源码" },
  { re: /(^|\/)home-before\.png$/, why: "一次性页面快照" },
];

const forbiddenHits = tracked.filter((f) => FORBIDDEN.some((r) => r.re.test(f)));
if (forbiddenHits.length) {
  record("BLOCK", "有禁入路径被版本库跟踪", forbiddenHits.slice(0, 10).join("\n"), {
    files: forbiddenHits,
  });
} else {
  record("ok", "无禁入路径被跟踪", `检查 ${FORBIDDEN.length} 条规则`);
}

/* ---------- 2. 真实凭据是否泄进跟踪文件 ---------- */

section("2. 凭据扫描（精确值）");

// 默认读 apps/api/.env；PREFLIGHT_ENV 可指向别的文件（自测与 CI 用）
const ENV_PATH = process.env.PREFLIGHT_ENV
  ? path.resolve(ROOT, process.env.PREFLIGHT_ENV)
  : path.join(ROOT, "apps", "api", ".env");
// 只认「以 _KEY / _SECRET / _TOKEN … 结尾」的 key。
// 早先写成 API_?KEY 之类的具体词，结果 AI_REVIEW_KEY 这种真实密钥被漏掉，
// 扫描报告显示「扫了 2 个字段」，看着像干净，其实是漏检——宁可多扫不可漏扫。
const CRED_KEY =
  /(?:^|_)(?:KEY|SECRET|TOKEN|PASSWORD|PASSWD|PASS|COOKIE|SESSDATA|APPKEY|CREDENTIAL|ACCESSKEY|PRIVATEKEY|SIGNATURE|SIGN)$/i;

if (!fs.existsSync(ENV_PATH)) {
  record("WARN", "读不到 apps/api/.env", "跳过精确值扫描（首次克隆时正常）");
} else {
  const envText = fs.readFileSync(ENV_PATH, "utf8");
  const secrets = [];
  for (const line of envText.split(/\r?\n/)) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    const [, key, rawVal] = m;
    if (!CRED_KEY.test(key)) continue;
    const val = rawVal.trim().replace(/^["']|["']$/g, "");
    if (val.length >= 8) secrets.push({ key, val });
  }

  if (!secrets.length) {
    record("ok", "凭据字段里没有可扫的值", ".env 未填写或字段为空");
  } else {
    const patFile = path.join(os.tmpdir(), `pf-secrets-${process.pid}.txt`);
    fs.writeFileSync(patFile, secrets.map((s) => s.val).join("\n"), "utf8");
    const r = gitGrep(["grep", "-l", "-F", "-f", patFile, "--"]);
    fs.unlinkSync(patFile);
    const hitFiles = r.lines;

    if (r.error) {
      record("BLOCK", "凭据扫描命令本身出错（结论不可信）", r.error);
    } else if (hitFiles.length) {
      const detail = hitFiles.slice(0, 10).join("\n");
      const which = new Set();
      for (const s of secrets) {
        if (gitGrep(["grep", "-l", "-F", "-e", s.val, "--"]).lines.length) which.add(s.key);
      }
      record("BLOCK", `真实凭据值出现在 ${hitFiles.length} 个跟踪文件里`, `${detail}\n涉及字段：${[...which].join(", ")}`, {
        files: hitFiles,
      });
    } else {
      record("ok", "凭据值零命中", `扫了 ${secrets.length} 个字段（${secrets.map((s) => s.key).join(", ")}）`);
    }
  }
}

/* ---------- 3. 通用密钥模式（只提醒） ---------- */

section("3. 凭据扫描（通用模式，只提醒）");

const PATTERNS = [
  { re: "AKIA[0-9A-Z]{16}", label: "AWS Access Key" },
  { re: "gh[pousr]_[A-Za-z0-9]{20,}", label: "GitHub token" },
  { re: "xox[baprs]-[A-Za-z0-9-]{12,}", label: "Slack token" },
  { re: "-----BEGIN [A-Z ]*PRIVATE KEY-----", label: "私钥" },
  { re: "eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}", label: "JWT" },
  { re: "sk-[A-Za-z0-9]{32,}", label: "OpenAI 类密钥" },
];

for (const p of PATTERNS) {
  // -e 必须放在模式前面：像 `-----BEGIN` 这种以连字符开头的模式会被 git 当成选项
  const r = gitGrep([
    "grep", "-n", "-E", "-e", p.re,
    "--", "apps", "scripts", "docs", "README.md", "package.json",
  ]);
  if (r.error) {
    record("BLOCK", `${p.label} 扫描命令出错（结论不可信）`, r.error);
  } else if (r.lines.length) {
    record("WARN", `疑似${p.label} ${r.lines.length} 处`, r.lines.slice(0, 5).join("\n"));
  } else {
    record("ok", `无${p.label}`, "");
  }
}

/* ---------- 4. 语法检查 ---------- */

section("4. 语法检查");

const SYNTAX_RE = /^(apps|scripts)\/.*\.(c|m)?js$/;
const jsFiles = tracked.filter((f) => SYNTAX_RE.test(f));
const syntaxFails = [];
for (const f of jsFiles) {
  const abs = path.join(ROOT, f);
  if (!fs.existsSync(abs)) continue;
  const isModule = f.endsWith(".mjs") || findPackageType(path.dirname(abs)) === "module";
  const err = nodeCheck(abs, isModule);
  if (err) syntaxFails.push({ file: f, err });
}
if (syntaxFails.length) {
  record(
    "BLOCK",
    `${syntaxFails.length} 个 JS 文件语法检查失败`,
    syntaxFails.map((f) => `${f.file}\n${f.err}`).join("\n"),
    { files: syntaxFails.map((f) => f.file) },
  );
} else {
  record("ok", "JS 语法全部通过", `${jsFiles.length} 个文件`);
}

/* ---------- 5. JSON 合法性 ---------- */

section("5. JSON 校验");

const jsonFiles = tracked.filter((f) => f.endsWith(".json") && f !== "package-lock.json");
const jsonFails = [];
for (const f of jsonFiles) {
  const abs = path.join(ROOT, f);
  if (!fs.existsSync(abs)) continue;
  try {
    JSON.parse(fs.readFileSync(abs, "utf8"));
  } catch (e) {
    jsonFails.push(`${f}: ${e.message}`);
  }
}
if (jsonFails.length) record("BLOCK", `${jsonFails.length} 个 JSON 解析失败`, jsonFails.join("\n"));
else record("ok", "JSON 全部合法", `${jsonFiles.length} 个文件`);

/* ---------- 6. 未跟踪文件（只提醒） ---------- */

section("6. 工作区状态");

let dirty = "";
try {
  dirty = git(["status", "--porcelain"]).trim();
} catch { /* ignore */ }
if (!dirty) {
  record("ok", "工作区干净", "");
} else {
  const lines = dirty.split("\n");
  const untracked = lines.filter((l) => l.startsWith("??"));
  if (untracked.length) {
    record("WARN", `${untracked.length} 个未跟踪文件（没被提交，换机器就没了）`, untracked.slice(0, 8).join("\n"));
  } else {
    record("WARN", `${lines.length} 处已改未提交`, lines.slice(0, 8).join("\n"));
  }
}

/* ---------- 7. 服务健康（只提醒） ---------- */

section("7. 服务健康");

function probeCode(url) {
  try {
    return execSync(`curl -s -o NUL -w "%{http_code}" --max-time 5 ${url}`, {
      encoding: "utf8",
      shell: "cmd.exe",
    }).trim();
  } catch {
    return "";
  }
}

const apiCode = probeCode("http://127.0.0.1:1003/api/stats");
if (apiCode === "200") record("ok", "API 1003 在线", "200");
else record("WARN", `API 1003 返回 ${apiCode || "无响应"}`, "http://127.0.0.1:1003/api/stats");

// Web 有两个互斥模式：dev server 在 1005（本机开发用），preview 在 1007（对公网挂隧道）。
// 只要求「至少一个在线」——正在用哪个由 node scripts/dev.js 决定，不是故障。
const WEBS = [
  { url: "http://127.0.0.1:1005/", label: "Web dev 1005" },
  { url: "http://127.0.0.1:1007/", label: "Web preview 1007" },
];
const webUp = WEBS.map((w) => ({ ...w, code: probeCode(w.url) })).filter((w) => w.code === "200");
if (webUp.length > 0) {
  record("ok", `${webUp.map((w) => w.label).join(" / ")} 在线`, "200");
} else {
  record("WARN", "Web 1005/1007 都探不到（服务没起？）", "node scripts/dev.js start [--preview]");
}

/* ---------- 汇总 ---------- */

function report() {
  const blocks = results.filter((r) => r.level === "BLOCK");
  const warns = results.filter((r) => r.level === "WARN");
  if (JSON_OUT) {
    console.log(JSON.stringify({ results, blocks: blocks.length, warns: warns.length }, null, 2));
  } else {
    console.log(`\n${"=".repeat(52)}`);
    console.log(`  BLOCK ${blocks.length} 项   WARN ${warns.length} 项`);
    if (blocks.length) console.log(`  结论：❌ 不许推（${blocks.length} 项硬伤）`);
    else console.log(`  结论：✅ 可以推`);
    console.log(`${"=".repeat(52)}`);
  }
  process.exit(blocks.length ? 1 : 0);
}

report();
