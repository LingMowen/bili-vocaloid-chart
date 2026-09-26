/**
 * 修复全库丢失条目。
 *
 * 场景：collectAll 曾采用「全量覆盖」落盘，某一轮采集通道失效时（如 B 站登录态失效
 * 导致需要 wbi 签名的 UP 投稿扫描全线失败），本轮没抓到的历史收录会静默消失。
 * 典型事故：2026-09-25 快照 7354 首 → 次日库 6975 首，丢 399 首，热门曲「窗」失踪。
 *
 * 做法：取「历史每日快照中出现过、但当前库没有」的 aid 差集，逐个回 B 站拉详情，
 * 用与采集完全相同的 buildItem() 判定（分区/时长/标题过滤/歌姬识别）后补回全库。
 * 已下架或已不再符收录条件的稿件会被自然跳过（不补回）。
 *
 * 用法：
 *   node apps/api/scripts/repair-library.js --dry          只统计不写盘
 *   node apps/api/scripts/repair-library.js                实际修复
 *   node apps/api/scripts/repair-library.js --days=1       只用最近 1 天快照算差集
 *   node apps/api/scripts/repair-library.js --limit=50     最多修复 50 首
 */
const fs = require("fs");
const path = require("path");

const CACHE_DIR = path.join(__dirname, "..", "cache");
const LIBRARY_FILE = path.join(CACHE_DIR, "library.json");
const SNAP_DIR = path.join(CACHE_DIR, "stat_daily");
const VOCA_RID = 30;

const argv = process.argv.slice(2);
const arg = (name, def) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1] : def;
};
const DRY = argv.includes("--dry");
const DAYS = Number(arg("days", 5));
const LIMIT = Number(arg("limit", 0));

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

(async () => {
  const lib = readJson(LIBRARY_FILE);
  if (!lib || !Array.isArray(lib.data)) {
    console.error("library.json 不可用");
    process.exit(1);
  }
  const libAids = new Set(lib.data.map((x) => String(x.aid)));
  console.log(`当前库存：${lib.data.length}`);

  // 1) 差集：历史快照 aid 并集 - 当前库
  const snapFiles = fs
    .readdirSync(SNAP_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .slice(-DAYS);
  const missing = new Map(); // aid -> 最近出现的日期
  for (const f of snapFiles) {
    const snap = readJson(path.join(SNAP_DIR, f));
    if (!snap) continue;
    for (const aid of Object.keys(snap)) {
      const k = String(aid);
      if (!libAids.has(k)) missing.set(k, f.replace(".json", ""));
    }
  }
  const targets = LIMIT ? [...missing.keys()].slice(0, LIMIT) : [...missing.keys()];
  console.log(`参考最近 ${snapFiles.length} 天快照，缺失 ${missing.size} 首，本次处理 ${targets.length} 首`);
  if (!targets.length) {
    console.log("无需修复");
    return;
  }

  if (DRY) {
    console.log("缺失 aid 样例：" + targets.slice(0, 15).join(", "));
    console.log("--dry 模式，未写盘");
    return;
  }

  // 2) 逐个回源补回，复用采集侧同一套判定
  const bili = require("../src/bili.js");
  const collector = require("../src/collector.js");
  const client = await bili.getClient();
  const sdk = await import("@aemeath-projects/bilibili");

  const added = [];
  let failed = 0;
  let rejected = 0;
  let i = 0;
  for (const aid of targets) {
    i++;
    let item = null;
    try {
      item = await collector.buildItem(client, sdk, aid, { aid, title: "", typeid: VOCA_RID });
    } catch (e) {
      failed++;
    }
    if (item) {
      item.stale = false;
      added.push(item);
    } else {
      rejected++;
    }
    if (i % 20 === 0 || i === targets.length) {
      console.log(`  进度 ${i}/${targets.length}：可补回 ${added.length}，稿件失效/不符 ${rejected}，请求异常 ${failed}`);
    }
  }

  // 3) 合并写回（保留 ts，避免误导缓存新鲜度判定）
  const map = new Map();
  for (const it of lib.data) map.set(String(it.aid), it);
  for (const it of added) map.set(String(it.aid), it);
  const merged = [...map.values()].sort((a, b) => (b.score || 0) - (a.score || 0));
  const tmp = LIBRARY_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify({ ts: lib.ts, total: merged.length, complete: true, data: merged }), "utf8");
  fs.renameSync(tmp, LIBRARY_FILE);

  console.log(`\n修复完成：补回 ${added.length} 首，库存 ${lib.data.length} → ${merged.length}`);
  const top = added.sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 10);
  if (top.length) {
    console.log("补回的高分条目 Top10：");
    top.forEach((x) => console.log(`  ${x.score}  ${x.title}  (${missing.get(String(x.aid))})`));
  }
  console.log("请重启后端以重建榜单缓存");
})();
