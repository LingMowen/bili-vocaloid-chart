const fs = require("node:fs");
const path = require("node:path");
const biliranSync = require("./biliranSync");

// 达成时间上界回溯（2026-10-05）
//
// 问题：stat_daily 只有 40 多天快照，老歌只能标成「2026-08-13 之前已达成」，等于没说。
// 能不能更早？三个历史榜单源里，evo_delta.items[aid].play 和 biliran[aid].view 都是
// **该期的播放增量**（实测：同一首歌期 118 是 124324、期 127 降到 2316，显然不是累计值），
// 所以把各期增量累加起来，可以还原一条「累计播放量曲线」。
//
// 可靠性论证：只有上过榜的期才有数据，所以累加结果是真实累计值的**下界**。
// 下界达标 ⇒ 现实中必然已经达标 ⇒ 推出来的日期是硬上界，不是猜测。
// 反过来「累加没达标」不能证明没达标，所以未命中的歌什么都不说，交给 stat_daily / 外部源。

const CACHE_DIR = path.join(__dirname, "..", "cache");
const EVO_DIR = path.join(CACHE_DIR, "evo_delta");
const BILI_DIR = path.join(CACHE_DIR, "biliran");
const OUT_FILE = path.join(CACHE_DIR, "view_upper.json");

const THRESHOLDS = [
  ["hall_of_fame", 100000],
  ["legend", 1000000],
  ["myth", 10000000],
];

function num(f) {
  const m = /^(\d+)\.json$/.exec(f);
  return m ? parseInt(m[1], 10) : NaN;
}

let _cache = { fp: null, map: null };

// 扫两个缓存目录，产出 aid -> { catKey: { ts, cum, src } }
function buildViewUpperBounds() {
  let evoFiles = [];
  let biliFiles = [];
  try {
    evoFiles = fs.readdirSync(EVO_DIR).filter((f) => f.endsWith(".json")).sort((a, b) => num(a) - num(b));
    biliFiles = fs.readdirSync(BILI_DIR).filter((f) => f.endsWith(".json")).sort((a, b) => num(a) - num(b));
  } catch (e) {
    return new Map();
  }
  if (!evoFiles.length && !biliFiles.length) return new Map();
  // 指纹只由输入构成：不能带 OUT_FILE 自身的 mtime，否则每次写出都会让下次判定失效。
  const fp = [evoFiles.length, biliFiles.length, evoFiles[evoFiles.length - 1] || "", biliFiles[biliFiles.length - 1] || ""].join("|");
  if (_cache.fp === fp && _cache.map) return _cache.map;

  // 库内 aid 白名单：不在库里的不必算（成就只对库内条目发）
  let libIds = new Set();
  try {
    const lib = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, "library.json"), "utf8"));
    for (const it of lib.data || []) if (it.aid) libIds.add(Number(it.aid));
  } catch (e) {
    libIds = null; // 读不到库就全量算
  }

  const rows = new Map(); // aid -> [{ts, play}]（按 ts 升序）
  const push = (aid, ts, play) => {
    if (!(play > 0)) return;
    if (libIds && !libIds.has(aid)) return;
    let arr = rows.get(aid);
    if (!arr) rows.set(aid, (arr = []));
    arr.push({ ts, play });
  };

  for (const f of biliFiles) {
    const issue = num(f);
    const w = biliranSync.issueWindow(issue);
    let j;
    try {
      j = JSON.parse(fs.readFileSync(path.join(BILI_DIR, f), "utf8"));
    } catch (e) {
      continue;
    }
    for (const row of Object.values(j || {})) {
      push(Number(row.id), w.endTs, Number(row.view) || 0);
    }
  }
  for (const f of evoFiles) {
    const issue = num(f);
    let j;
    try {
      j = JSON.parse(fs.readFileSync(path.join(EVO_DIR, f), "utf8"));
    } catch (e) {
      continue;
    }
    const ts = Number(j.collectEndTs) || 0;
    if (!ts) continue;
    for (const [aid, v] of Object.entries(j.items || {})) {
      push(Number(aid), ts, Number(v.play) || 0);
    }
  }

  const map = new Map();
  for (const [aid, arr] of rows) {
    arr.sort((a, b) => a.ts - b.ts);
    const rec = {};
    let idx = 0;
    let sum = 0;
    for (const e of arr) {
      sum += e.play;
      // 小门槛先判定：一首百万曲同时是殿堂曲，一次遍历点满三档
      while (idx < THRESHOLDS.length && rec[THRESHOLDS[idx][0]] == null && sum >= THRESHOLDS[idx][1]) {
        rec[THRESHOLDS[idx][0]] = { ts: e.ts, cum: sum };
        idx++;
      }
      if (idx >= THRESHOLDS.length) break;
    }
    if (Object.keys(rec).length) map.set(aid, rec);
  }

  _cache.fp = fp;
  _cache.map = map;
  try {
    fs.writeFileSync(
      OUT_FILE,
      JSON.stringify({ builtAt: new Date().toISOString(), evoIssues: evoFiles.length, biliranIssues: biliFiles.length, rows: [...map].map(([aid, rec]) => ({ aid, ...rec })) }),
      "utf8"
    );
  } catch (e) {
    /* 缓存写失败不影响返回 */
  }
  return map;
}

module.exports = { buildViewUpperBounds, THRESHOLDS, OUT_FILE };
