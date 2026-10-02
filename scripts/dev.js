#!/usr/bin/env node
/**
 * scripts/dev.js —— 本地服务的启停与状态
 *
 * 为什么要它：纯 vibe coding 下最容易出的事故是「重启十几次，留一堆僵尸进程占着端口」，
 * 下一轮 AI 起服务时端口已被占，于是它得出「端口被别的项目用了」的结论，
 * 跑去改配置——而真正的问题只是有个上次的僵尸还活着。
 *
 * 用法：
 *   node scripts/dev.js start     起 API + Web，等健康后打印 pid / 端口
 *   node scripts/dev.js stop      停掉（含按端口兜底清理僵尸）
 *   node scripts/dev.js restart   = stop + start
 *   node scripts/dev.js status    只报告，不改任何东西
 *
 * 运行时文件都落在 <repo>/.tmp/run/（已被 .gitignore 忽略），不污染仓库根目录。
 * 日志：.tmp/run/api.out.log、api.err.log、web.out.log、web.err.log
 */

const { spawn, execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");

const ROOT = path.join(__dirname, "..");
const RUN = path.join(ROOT, ".tmp", "run");

/**
 * 两个服务的定义。
 * 都直接用当前 node 跑入口脚本，不经过 npm —— 少一层进程，多一层可控性，
 * 也避免 Windows 上 spawn .cmd 需要 shell 的坑。
 */
const SERVICES = [
  {
    name: "api",
    label: "API      ",
    ports: [1003, 1006],
    health: "http://127.0.0.1:1003/api/stats",
    cmd: process.execPath,
    args: [path.join(ROOT, "apps", "api", "src", "index.js")],
    cwd: ROOT,
  },
  {
    name: "web",
    label: "Web      ",
    ports: [1005],
    health: "http://127.0.0.1:1005/",
    cmd: process.execPath,
    args: [path.join(ROOT, "node_modules", "vite", "bin", "vite.js")],
    cwd: path.join(ROOT, "apps", "web"),
  },
];

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

function readPid(name) {
  try {
    const raw = fs.readFileSync(pidFile(name), "utf8").trim();
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

// ────────────────────────────────────────────────────────── 动作

async function stop() {
  log(C.bold("停止服务"));
  for (const svc of SERVICES) {
    // 两路取 pid：pid 文件里的，和端口实际占着的。取并集，才能清掉僵尸。
    const fromFile = readPid(svc.name);
    const fromPort = pidsOnPorts(svc.ports);
    const targets = [...new Set([fromFile, ...fromPort].filter(Boolean))];

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
  }
  log();
}

async function start() {
  fs.mkdirSync(RUN, { recursive: true });
  log(C.bold("启动服务"));
  let anyFail = false;

  for (const svc of SERVICES) {
    // 先看端口是不是已经有人了——占着就明确报出来，不要闷头起第二份
    const occupied = pidsOnPorts(svc.ports);
    if (occupied.length > 0) {
      log(`  ${svc.label} ${C.yellow("端口已被占用")} ${svc.ports.join(",")} ← pid ${occupied.join(", ")}`);
      log(`  ${" ".repeat(9)}${C.dim("先跑 node scripts/dev.js stop 再试")}`);
      anyFail = true;
      continue;
    }

    const outFd = fs.openSync(path.join(RUN, `${svc.name}.out.log`), "a");
    const errFd = fs.openSync(path.join(RUN, `${svc.name}.err.log`), "a");

    // 这里刻意不用 `node --watch`。
    // 原因不是嫌它烦，是它会同时把两件事变成假的：
    //   1. --watch 会 fork 一个子进程跑真正的服务，于是「pid 文件里的 pid」和
    //      「占着端口的 pid」永远不同，drift 检查从此一直误报——误报多了，人就不看警告了。
    //   2. 杀掉子进程后 --watch 父进程会把它重新拉起来，于是 stop 之后端口又回来了。
    // 改代码就跑一次 `node scripts/dev.js restart`，比一个会骗人的自动重启可靠。
    const child = spawn(svc.cmd, svc.args, {
      cwd: svc.cwd,
      stdio: ["ignore", outFd, errFd],
      detached: true,
      windowsHide: true,
    });
    child.unref();
    fs.writeFileSync(pidFile(svc.name), String(child.pid), "utf8");

    // 等它真的能用——「进程起了」不等于「服务好了」
    const deadline = Date.now() + 45_000;
    let ok = false;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) break; // 起挂了，别干等
      if (await probe(svc.health)) {
        ok = true;
        break;
      }
      await sleep(500);
    }

    if (ok) {
      log(`  ${svc.label} ${C.green("已启动")} pid ${child.pid}  端口 ${svc.ports.join(" / ")}`);
      log(`  ${" ".repeat(9)}${C.dim(svc.health)}`);
    } else {
      anyFail = true;
      log(`  ${svc.label} ${C.red("45 秒内没就绪")} pid ${child.pid ?? "?"}`);
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
  let allOk = true;
  for (const svc of SERVICES) {
    const pid = readPid(svc.name);
    const onPorts = pidsOnPorts(svc.ports);
    const health = await probe(svc.health);
    if (!health) allOk = false;

    // pid 文件与端口实况可能不一致，那是真信息，不是噪声——说明有僵尸或有人手改了
    const drift =
      onPorts.length > 0 && (pid === null || !onPorts.includes(pid))
        ? C.yellow(`  ⚠ pid 文件(${pid ?? "无"}) 与端口实况(${onPorts.join(",")})不一致`)
        : "";

    log(
      `  ${svc.label} ${health ? C.green("在线") : C.red("离线")}  ` +
        `端口 ${svc.ports.join("/")}  实际 pid ${onPorts.join(",") || C.dim("无")}${drift}`
    );
  }
  log();
  return allOk;
}

// ────────────────────────────────────────────────────────── 入口

const ACTIONS = {
  start: () => start().then((ok) => process.exit(ok ? 0 : 1)),
  stop: () => stop().then(() => process.exit(0)),
  restart: async () => {
    await stop();
    const ok = await start();
    process.exit(ok ? 0 : 1);
  },
  status: () => status().then((ok) => process.exit(ok ? 0 : 1)),
};

const action = process.argv[2];
if (!ACTIONS[action]) {
  log(`${C.bold("用法")} node scripts/dev.js <start|stop|restart|status>`);
  process.exit(2);
}
ACTIONS[action]();