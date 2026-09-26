#!/usr/bin/env node
// 歌姬名称归一：把 library.json 里已入库的 girls 统一到标准名（初音ミク/miku → 初音未来）。
// 用法（必须在 apps/api 目录下运行）：
//   node scripts/normalize-girls.js          # 预览（--dry 为默认安全模式，先跑这个看统计）
//   node scripts/normalize-girls.js --apply  # 实际写回（自动备份到 %TEMP% 或 cache/*.bak）
//   node scripts/normalize-girls.js --apply --singers  # 同时清洗 singers.json 的别名条目
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { canonicalGirl, canonicalGirls, GIRL_ALIAS } = require("../src/girls");

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const DO_SINGERS = args.includes("--singers");

const CACHE = path.join(__dirname, "..", "cache");
const LIB = path.join(CACHE, "library.json");
const SINGERS = path.join(CACHE, "singers.json");

function backup(file) {
  const name = path.basename(file) + ".bak-" + new Date().toISOString().replace(/[:.]/g, "-");
  const dst = path.join(os.tmpdir(), name);
  fs.copyFileSync(file, dst);
  return dst;
}

// ---------- 1. library.json ----------
const lib = JSON.parse(fs.readFileSync(LIB, "utf8"));
const items = Array.isArray(lib.data) ? lib.data : [];

const before = new Map();
const after = new Map();
const changedAids = [];
const mergeLog = new Map(); // 标准名 -> Set(被归并的原始写法)

for (const it of items) {
  const src = it.girls || [];
  for (const g of src) before.set(g, (before.get(g) || 0) + 1);
  const norm = canonicalGirls(src);
  for (const g of norm) after.set(g, (after.get(g) || 0) + 1);
  const same = norm.length === src.length && norm.every((v, i) => v === src[i]);
  if (!same) {
    changedAids.push(it.aid);
    for (const g of src) {
      const c = canonicalGirl(g);
      if (c !== g) {
        if (!mergeLog.has(c)) mergeLog.set(c, new Map());
        const m = mergeLog.get(c);
        m.set(g, (m.get(g) || 0) + 1);
      }
    }
    if (APPLY) it.girls = norm;
  }
}

console.log("=== 歌姬名称归一" + (APPLY ? "（已应用）" : "（预览，未写盘）") + " ===");
console.log("库存条目:", items.length, "| 需改动条目:", changedAids.length);
console.log("写法数:", before.size, "→", after.size);

if (mergeLog.size) {
  console.log("\n--- 归并明细 ---");
  for (const [canon, m] of [...mergeLog.entries()].sort((a, b) => {
    const sa = [...a[1].values()].reduce((x, y) => x + y, 0);
    const sb = [...b[1].values()].reduce((x, y) => x + y, 0);
    return sb - sa;
  })) {
    const detail = [...m.entries()].map(([k, v]) => `${k}×${v}`).join(" + ");
    console.log(`  ${canon}  ←  ${detail}`);
  }
}

console.log("\n--- 归一后各歌姬作品数（前 15）---");
[...after.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 15)
  .forEach(([k, v]) => console.log(`  ${String(v).padStart(5)}  ${k}`));

// 别名表中「库里还没出现」的写法（提示识别能力，非错误）
const known = new Set([...after.keys(), ...before.keys()]);
const unused = [];
for (const [canon, aliases] of Object.entries(GIRL_ALIAS)) {
  for (const a of aliases) if (!known.has(a)) unused.push(`${canon} ← ${a}`);
}
if (unused.length) {
  console.log(`\n（别名表中库内暂无的写法 ${unused.length} 条，属正常：这些写法本次未出现）`);
}

if (APPLY && changedAids.length) {
  const bak = backup(LIB);
  const tmp = LIB + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify({ ts: lib.ts, total: lib.total, complete: lib.complete, data: items }), "utf8");
  fs.renameSync(tmp, LIB);
  console.log("\n已写回:", LIB);
  console.log("备份:", bak);
}

// ---------- 2. singers.json 清洗 ----------
if (DO_SINGERS) {
  const s = JSON.parse(fs.readFileSync(SINGERS, "utf8"));
  const singers = s.singers || {};
  const drop = [];
  for (const key of Object.keys(singers)) {
    if (canonicalGirl(key) !== key) drop.push(key);
  }
  console.log("\n=== singers.json ===");
  console.log("条目:", Object.keys(singers).length, "| 别名条目(将被删除):", drop.length, drop.join(", "));
  if (APPLY && drop.length) {
    const bak = backup(SINGERS);
    for (const k of drop) delete singers[k];
    const tmp = SINGERS + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(s, null, 1), "utf8");
    fs.renameSync(tmp, SINGERS);
    console.log("已写回:", SINGERS, "| 备份:", bak);
  }
}

if (!APPLY) console.log("\n[预览模式] 加 --apply 才会写盘；加 --singers 可同时清洗歌手索引。");
