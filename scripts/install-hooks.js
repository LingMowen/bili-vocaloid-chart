#!/usr/bin/env node
/**
 * 装钩子。
 *
 * `.git/hooks/` 不进版本库，所以「把钩子拷进去」这种做法在 clone 之后必然失效，
 * 而且拷过去的那份会和仓库里的源文件悄悄跑偏。这里换一种做法：
 *
 *   git config core.hooksPath scripts/git-hooks
 *
 * 让 git 直接去读仓库里那份被跟踪的钩子。源只有一份，clone 完跑一次本脚本即可恢复，
 * 不会有第二份会腐烂的副本。
 *
 *   node scripts/install-hooks.js          安装/刷新
 *   node scripts/install-hooks.js --check  只检查不修改
 */

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "scripts", "git-hooks");
const check = process.argv.includes("--check");

function git(args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

if (!fs.existsSync(SRC)) {
  console.error(`找不到钩子源目录：${path.relative(ROOT, SRC)}`);
  process.exit(1);
}

const hooks = fs.readdirSync(SRC).filter((f) => fs.statSync(path.join(SRC, f)).isFile());

// Git for Windows 通过 sh 跑钩子；行尾一旦是 CRLF 就报 bad interpreter。
// 源文件在仓库里，.gitattributes 已经兜住，这里再做一次兜底。
let normalized = 0;
for (const f of hooks) {
  const p = path.join(SRC, f);
  const buf = fs.readFileSync(p);
  const fixed = Buffer.from(buf.toString("binary").replace(/\r\n/g, "\n"), "binary");
  if (!fixed.equals(buf)) {
    normalized++;
    if (!check) fs.writeFileSync(p, fixed);
  }
}
if (normalized) console.log(`  行尾已规范为 LF：${normalized} 个钩子`);

const want = "scripts/git-hooks";
const have = (() => {
  try {
    return git(["config", "--local", "core.hooksPath"]);
  } catch {
    return "";
  }
})();

if (check) {
  if (have !== want) {
    console.log(`  ✗ 未安装：core.hooksPath = ${have || "(未设置)"}，应为 ${want}`);
    process.exit(1);
  }
  console.log(`  ✓ 已安装：core.hooksPath = ${have}`);
  console.log(`    钩子：${hooks.join("、")}`);
  process.exit(0);
}

if (have === want) {
  console.log(`  core.hooksPath 已是 ${want}`);
} else {
  git(["config", "--local", "core.hooksPath", want]);
  console.log(`  已设置 core.hooksPath = ${want}（原：${have || "未设置"}）`);
}

if (!hooks.includes("commit-msg") || !hooks.includes("pre-push")) {
  console.error("  ✗ scripts/git-hooks 里缺 commit-msg 或 pre-push");
  process.exit(1);
}

console.log(`  钩子（${hooks.length}）：${hooks.join("、")}`);
console.log("");
console.log("  生效范围：commit-msg 拦不合规提交，pre-push 跑 preflight。");
console.log("  绕过：git commit --no-verify / SKIP_PREFLIGHT=1 git push");