#!/usr/bin/env node
// 把库里「镜音双子」等合称词展开为 镜音铃 + 镜音连 两位。
// 背景：此前「镜音双子」被归一到 镜音铃，导致这 6 首双人曲只计入了 铃。
// 2026-09-26 联网查证：镜音铃 / 镜音连 是 Crypton 角色主唱系列第二作里的两位独立角色，
// 「镜音双子」属粉丝二次设定、官方未设定两人关系，vocabili 官方索引也没有「镜音双子」独立条目
// （搜它会同时返回 id=81 镜音铃 与 id=141 镜音连）。因此合称出现时应同时计入两人。
//
// 本脚本只做「并集补位」：对标题/标签含合称词的条目，确保其 girls 同时含 镜音铃 与 镜音连，
// 不会删除或改动其它歌姬归属。
//
// 用法（必须在 apps/api 目录下运行）：
//   node scripts/expand-kagamine.js          # 预览
//   node scripts/expand-kagamine.js --apply  # 写回（自动备份到 %TEMP%）
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { GROUP_EXPAND } = require("../src/girls");

const APPLY = process.argv.includes("--apply");
const CACHE = path.join(__dirname, "..", "cache");
const LIB = path.join(CACHE, "library.json");

const keys = Object.keys(GROUP_EXPAND);
const lowerToMembers = new Map();
for (const k of keys) lowerToMembers.set(k.toLowerCase(), GROUP_EXPAND[k]);

function backup(file) {
  const name = path.basename(file) + ".bak-" + new Date().toISOString().replace(/[:.]/g, "-");
  const dst = path.join(os.tmpdir(), name);
  fs.copyFileSync(file, dst);
  return dst;
}

const lib = JSON.parse(fs.readFileSync(LIB, "utf8"));
const items = Array.isArray(lib.data) ? lib.data : [];

const changed = [];
const matchedByKey = new Map();

for (const it of items) {
  const text = String(it.title || "") + " " + (it.tags || []).map((t) => String(t)).join(" ");
  const low = text.toLowerCase();
  let addMembers = [];
  for (const [k, members] of lowerToMembers) {
    if (low.includes(k)) {
      addMembers = addMembers.concat(members);
      matchedByKey.set(k, (matchedByKey.get(k) || 0) + 1);
    }
  }
  if (!addMembers.length) continue;
  const set = new Set(it.girls || []);
  let added = 0;
  for (const m of addMembers) if (!set.has(m)) { set.add(m); added++; }
  if (added) {
    it.girls = [...set];
    changed.push(it.aid);
  }
}

console.log("=== 镜音双子 展开为 镜音铃+镜音连" + (APPLY ? "（已应用）" : "（预览）") + " ===");
console.log("库存条目:", items.length, "| 命中合称的条目:", [...matchedByKey.values()].reduce((a, b) => a + b, 0), "| 实际改动:", changed.length);
for (const [k, n] of [...matchedByKey.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  含「${k}」: ${n} 条`);
}

if (APPLY && changed.length) {
  const bak = backup(LIB);
  const tmp = LIB + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify({ ts: lib.ts, total: lib.total, complete: lib.complete, data: items }), "utf8");
  fs.renameSync(tmp, LIB);
  console.log("\n已写回:", LIB);
  console.log("备份:", bak);
} else if (!APPLY) {
  console.log("\n[预览模式] 加 --apply 才会写盘。");
}
