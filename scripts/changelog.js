#!/usr/bin/env node
/**
 * changelog —— 从 git 历史生成《变更史》
 *
 * 要解决的问题很具体：这个项目几乎全是 AI 改的，commit message 常常只写一句
 * 「修了一堆东西」，三个月后没人（包括 AI 自己）说得清动过什么。
 * 把「谁、什么时候、动了哪些文件、加了几行删了几行」自动摊开，
 * 是最低成本的补救——它不能替你 review，但能让你知道该 review 什么。
 *
 *   node scripts/changelog.js              生成 docs/变更史.md
 *   node scripts/changelog.js --since=7d   只看最近 7 天
 *   node scripts/changelog.js --stdout     不写文件，打到屏幕上
 *
 * 作者名用 `%aN`（大写）而不是 `%an` —— 大写才是套用 .mailmap 之后的规范身份，
 * 小写永远是提交里的原始值。用小写会让「作者分布」永远显示那个假身份。
 */

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "docs", "变更史.md");
const args = process.argv.slice(2);
const toStdout = args.includes("--stdout");
const sinceArg = (args.find((a) => a.startsWith("--since=")) || "").split("=")[1];
const gitArgs = ["log", "--no-merges", "--date=short", "--numstat", "--format=%x1e%H%x1f%aN%x1f%ad%x1f%s"];
if (sinceArg) gitArgs.push(`--since=${sinceArg}`);

const raw = execFileSync("git", gitArgs, {
  cwd: ROOT,
  encoding: "utf8",
  maxBuffer: 256 * 1024 * 1024,
});

/* ---------- 解析 ---------- */

const commits = [];
for (const chunk of raw.split("\x1e")) {
  const t = chunk.trim();
  if (!t) continue;
  const [head, ...rest] = t.split("\n");
  const [sha, author, date, subject] = head.split("\x1f");
  if (!sha || !subject) continue;

  const files = [];
  let add = 0;
  let del = 0;
  let binary = false;
  for (const line of rest) {
    if (!line.trim()) continue;
    const m = /^(-|\d+)\t(-|\d+)\t(.+)$/.exec(line);
    if (!m) continue;
    if (m[1] === "-") binary = true;
    else add += Number(m[1]);
    if (m[2] === "-") binary = true;
    else del += Number(m[2]);
    files.push(m[3]);
  }
  commits.push({ sha: sha.slice(0, 7), full: sha, author, date, subject, files, add, del, binary });
}

/* ---------- 汇总统计 ---------- */

const byFile = new Map();
for (const c of commits) {
  for (const f of c.files) byFile.set(f, (byFile.get(f) || 0) + 1);
}
const hotFiles = [...byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

const byAuthor = new Map();
for (const c of commits) byAuthor.set(c.author, (byAuthor.get(c.author) || 0) + 1);

const byType = new Map();
for (const c of commits) {
  const t = /^(\w+)(\(|:)/.exec(c.subject);
  const k = t ? t[1] : "其它";
  byType.set(k, (byType.get(k) || 0) + 1);
}

const days = [...new Set(commits.map((c) => c.date))].sort().reverse();
const first = commits.length ? commits[commits.length - 1].date : "—";
const last = commits.length ? commits[0].date : "—";

/* ---------- 渲染 ---------- */

const L = [];
L.push("# 变更史");
L.push("");
L.push("> 本文件由 `npm run changelog` 从 git 历史自动生成，**请勿手改**。");
L.push("> 目的只有一个：让「到底更新了什么」有据可查。");
L.push("");
L.push(`- 统计范围：${sinceArg ? `最近 ${sinceArg}` : "全部历史"}，共 **${commits.length}** 次提交`);
L.push(`- 时间跨度：${first} → ${last}`);
L.push(`- 作者分布：${[...byAuthor.entries()].map(([a, n]) => `${a} × ${n}`).join("、")}`);
L.push(`- 类型分布：${[...byType.entries()].sort((a, b) => b[1] - a[1]).map(([a, n]) => `${a} × ${n}`).join("、")}`);
L.push("");
L.push("## 改动最频繁的文件");
L.push("");
L.push("| 次数 | 文件 |");
L.push("|---:|---|");
for (const [f, n] of hotFiles) L.push(`| ${n} | \`${f}\` |`);
L.push("");

L.push("## 逐次提交");
L.push("");
for (const day of days) {
  const list = commits.filter((c) => c.date === day);
  L.push(`### ${day}（${list.length} 次）`);
  L.push("");
  for (const c of list) {
    const size = c.binary ? "二进制改动" : `+${c.add} / -${c.del}`;
    L.push(`#### \`${c.sha}\` ${c.subject}`);
    L.push("");
    L.push(`- 作者 ${c.author}，${c.files.length} 个文件，${size}`);
    if (c.files.length) {
      const show = c.files.slice(0, 12).map((f) => `\`${f}\``);
      L.push(`- 文件：${show.join("、")}${c.files.length > 12 ? ` 等 ${c.files.length} 个` : ""}`);
    }
    L.push("");
  }
}

const text = L.join("\n");

if (toStdout) {
  console.log(text);
} else {
  fs.writeFileSync(OUT, text, "utf8");
  console.log(`已生成 ${path.relative(ROOT, OUT).split(path.sep).join("/")}`);
  console.log(`  ${commits.length} 次提交 · ${first} → ${last} · ${hotFiles.length ? `最热文件 ${hotFiles[0][0]}（${hotFiles[0][1]} 次）` : ""}`);
}
