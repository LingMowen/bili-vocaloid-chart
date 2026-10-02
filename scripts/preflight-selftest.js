#!/usr/bin/env node
/**
 * preflight 自测 —— 证明这道门禁真的会拦。
 *
 * 一道从没被验证过会亮的警报等于没有。这里用**合成假凭据**（绝不用真 .env 里的值）
 * 走完整条链路：造探针文件 → git add -N（只登记路径，不暂存内容）→ 跑 preflight
 * → 断言它以 exit 1 报出该文件 → 清理。
 *
 * 用 `git add -N` 而不是 `git add`：内容不会进索引，
 * 万一中途出事被别的进程 push 出去，推的也只是一个空 blob。
 *
 * 假凭据用 sha256 运行时算出，不写死在源码里 —— 理由见下方 FAKE 的注释。
 *
 *   node scripts/preflight-selftest.js
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync, spawnSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");

// 合成假凭据：运行时算出来，**源码里不能出现这个完整串**。
// 否则 preflight 会把本脚本自己当成泄漏源报出来 —— 门禁把自己拦了。
// 那种自测永远失败、最后大家学会忽略它的报错，最消耗信任。
const FAKE = "SELFTEST_" + crypto.createHash("sha256").update("preflight-selftest").digest("hex").slice(0, 24);

const PROBE = path.join("apps", "api", "__preflight_selftest_probe.js");
const abs = path.join(ROOT, PROBE);
const tmpEnv = path.join(os.tmpdir(), `pf-selftest-env-${process.pid}.env`);

function git(args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
}

function cleanup() {
  try {
    git(["reset", "-q", "--", PROBE]);
  } catch { /* 可能本来就没登记过 */ }
  if (fs.existsSync(abs)) fs.unlinkSync(abs);
  if (fs.existsSync(tmpEnv)) fs.unlinkSync(tmpEnv);
}

let failed = false;
try {
  // 1) 合成 env
  fs.writeFileSync(tmpEnv, `TEST_TOKEN=${FAKE}\n`, "utf8");

  // 2) 造探针：内容里含该假凭据
  fs.writeFileSync(abs, `// 自测探针，验证完即删\nconst t = "${FAKE}";\nmodule.exports = t;\n`, "utf8");
  git(["add", "-N", "--", PROBE]);

  // 3) 跑 preflight，必须以 1 退出并点名这个文件
  const r = spawnSync(process.execPath, [path.join("scripts", "preflight.js")], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, PREFLIGHT_ENV: tmpEnv },
  });

  const out = `${r.stdout || ""}${r.stderr || ""}`;
  const caught = r.status === 1 && out.includes("真实凭据值出现在") && out.includes("__preflight_selftest_probe.js");

  if (caught) {
    console.log("  [PASS] 凭据泄进跟踪文件 → 被 BLOCK，exit 1");
  } else {
    failed = true;
    console.log(`  [FAIL] 期望 exit 1 且点名探针文件，实际 exit=${r.status}`);
    console.log(out.split("\n").filter((l) => l.includes("凭据")).join("\n"));
  }

  // 4) 反向对照：撤掉探针后必须放行
  git(["reset", "-q", "--", PROBE]);
  fs.unlinkSync(abs);
  const r2 = spawnSync(process.execPath, [path.join("scripts", "preflight.js")], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, PREFLIGHT_ENV: tmpEnv },
  });
  if (r2.status === 0) {
    console.log("  [PASS] 撤掉探针后 → 放行，exit 0（不会误伤）");
  } else {
    failed = true;
    console.log(`  [FAIL] 撤掉探针后仍 exit=${r2.status}，说明门禁误伤`);
  }

  // 5) 通用模式也要能亮
  const generic = "AKIAIOSFODNN7EXAMPLE";
  fs.writeFileSync(abs, `const k = "${generic}";\nmodule.exports = k;\n`, "utf8");
  git(["add", "-N", "--", PROBE]);
  const r3 = spawnSync(process.execPath, [path.join("scripts", "preflight.js")], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, PREFLIGHT_ENV: tmpEnv },
  });
  const out3 = `${r3.stdout || ""}`;
  if (out3.includes("疑似AWS Access Key")) console.log("  [PASS] 通用模式命中 AWS Key → 报 WARN");
  else {
    failed = true;
    console.log("  [FAIL] 通用模式没报出 AWS Key");
  }
} finally {
  cleanup();
}

console.log(failed ? "\n自测失败：门禁不可信" : "\n自测通过：门禁会亮，且不误伤");
process.exit(failed ? 1 : 0);
