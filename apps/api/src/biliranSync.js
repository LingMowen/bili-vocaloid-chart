// biliran 周刊数据拉取与本地化：为 2022-07 之前的历史期补数。
//
// 来源：CPKaq/vocaloid-china-biliran-data（GitHub Pages，cpk.moe，可直连）。
//   https://cpk.moe/vocaloid-china-biliran-data/vc-weekly/{期号}.json
// 覆盖 ♪118–♪522（2013-06 ~ 2022-08），每期 json = 数组：
//   [{ id(av号), title, isCover, date(歌曲发布时间), rank, point,
//      view, favorite, reply, danmaku, corrA, corrB }]
// 无 coin/like/share —— 缺失项在计分侧置 0 并标记 data_source="biliran"。
//
// view/favorite/reply/danmaku 是「该期累计快照值」（实测 519→520 差分有正有负），
// 与本站 stat_daily 口径一致：期末−期初差分可还原该期增量。
const fs = require("node:fs");
const path = require("node:path");

const CACHE_DIR = path.join(__dirname, "..", "cache", "biliran");
const BASE = "https://cpk.moe/vocaloid-china-biliran-data/vc-weekly";
const RANGE = [118, 522];

let lastReqAt = 0;
async function throttle(ms = 500) {
  const now = Date.now();
  const wait = lastReqAt + ms - now;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastReqAt = Date.now();
}

// 拉取并缓存一期；返回该期数组或 null（404/网络错误）
async function fetchIssue(num) {
  await throttle();
  const res = await fetch(`${BASE}/${num}.json`, {
    headers: { "User-Agent": "bili-vocaloid-chart/1.0", Accept: "application/json" },
  });
  if (!res.ok) return null;
  const arr = await res.json();
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const tmp = path.join(CACHE_DIR, `${num}.json`) + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(arr), "utf8");
  fs.renameSync(tmp, path.join(CACHE_DIR, `${num}.json`));
  return arr;
}

function localIssues() {
  if (!fs.existsSync(CACHE_DIR)) return [];
  return fs
    .readdirSync(CACHE_DIR)
    .filter((f) => /^\d+\.json$/.test(f))
    .map((f) => Number(f.replace(/\.json$/, "")))
    .sort((a, b) => a - b);
}

function loadIssue(num) {
  try {
    return JSON.parse(fs.readFileSync(path.join(CACHE_DIR, `${num}.json`), "utf8"));
  } catch (e) {
    return null;
  }
}

// 拉取全部缺的期（118~522）；onProgress(count,total)
async function syncAll(onProgress) {
  const have = new Set(localIssues());
  const missing = [];
  for (let i = RANGE[0]; i <= RANGE[1]; i++) if (!have.has(i)) missing.push(i);
  let ok = 0;
  for (const n of missing) {
    try {
      const arr = await fetchIssue(n);
      if (arr && arr.length) ok++;
      else console.warn(`[biliran] 第 ${n} 期拉取为空`);
    } catch (e) {
      console.error(`[biliran] 第 ${n} 期失败: ${e.message}`);
    }
    if (onProgress && ok % 10 === 0) onProgress(ok, missing.length);
  }
  if (onProgress) onProgress(ok, missing.length);
  return ok;
}

// 期号 → 时间窗口：biliran 与 evo_delta 同编号系统（周刊虚拟歌手中文曲排行榜，每周一期）。
// 用 evo 520 期精确采集时间作锚点，期号差 × 7 天反推每期窗口（比用歌曲 date 中位数准，
// 老歌 date 跨年会把窗口拖偏）。
const EVO_520_START_TS = 1657911600; // 2022-07-16 03:00（collectStartTs，实测自 cache/evo_delta/520.json）
const ISSUE_ANCHOR = 520;
function issueWindow(num) {
  const offsetDays = (num - ISSUE_ANCHOR) * 7;
  const startTs = EVO_520_START_TS + offsetDays * 86400;
  return { startTs, endTs: startTs + 7 * 86400 };
}

// 找「覆盖时间戳 ts」的最近一期（窗口包含 ts 且期号最大；否则返回窗口最接近 ts 的一期）
function issueNear(ts) {
  let best = null;
  let bestDist = Infinity;
  for (const num of localIssues()) {
    const w = issueWindow(num);
    if (!w) continue;
    if (ts >= w.startTs && ts < w.endTs) return num; // 直接包含
    const dist = Math.min(Math.abs(ts - w.startTs), Math.abs(ts - w.endTs));
    if (dist < bestDist) { bestDist = dist; best = num; }
  }
  return best;
}

// 还原 [startTs, endTs) 窗口增量：期末快照 − 期初快照（biliran 是累计快照，
// 差分口径与本站 stat_daily 一致）。期末期 = 覆盖 endTs-1 的最近期，
// 期初期 = 覆盖 startTs 的最近期；同 aid 两期相减得窗口增量。
// 返回 { sums: {aid: stat}, sources: {aid: {periods,startTs,endTs}} }
// coin/like/share biliran 未记录 → 0（调用方标记 data_source="biliran"）。
function deltaBetween(startTs, endTs) {
  // 覆盖判定：窗口必须与 biliran 期号范围（118~522）有重合；早于最早期/晚于最晚期的窗口
  // 不返回数据（避免 issueNear 把相隔数年的期硬凑进来）。
  const wFirst = issueWindow(localIssues()[0]);
  const wLast = issueWindow(localIssues()[localIssues().length - 1]);
  if (!wFirst || !wLast) return { sums: {}, sources: {} };
  if (endTs <= wFirst.startTs || startTs >= wLast.endTs) return { sums: {}, sources: {} };
  const endIssue = issueNear(Math.max(startTs, endTs - 1));
  const startIssue = issueNear(startTs);
  const arrEnd = endIssue != null ? loadIssue(endIssue) : null;
  const arrStart = startIssue != null && startIssue !== endIssue ? loadIssue(startIssue) : null;
  if (!arrEnd || !arrEnd.length) return { sums: {}, sources: {} };
  const endSnap = new Map(arrEnd.map((r) => [String(r.id).replace(/^av/, ""), r]));
  const startSnap = new Map((arrStart || []).map((r) => [String(r.id).replace(/^av/, ""), r]));
  const sums = {};
  const srcs = {};
  for (const [aid, r] of endSnap) {
    const b = startSnap.get(aid);
    sums[aid] = {
      view: Math.max(0, (Number(r.view) || 0) - (b ? Number(b.view) || 0 : 0)),
      favorite: Math.max(0, (Number(r.favorite) || 0) - (b ? Number(b.favorite) || 0 : 0)),
      reply: Math.max(0, (Number(r.reply) || 0) - (b ? Number(b.reply) || 0 : 0)),
      danmaku: Math.max(0, (Number(r.danmaku) || 0) - (b ? Number(b.danmaku) || 0 : 0)),
      coin: 0,
      like: 0,
      share: 0,
    };
    srcs[aid] = { periods: [startIssue, endIssue].filter((x) => x != null), startTs: startIssue, endTs: endIssue };
  }
  return { sums, sources: srcs };
}

// 累加 [startTs, endTs) 内本地各期（按期窗口与请求窗口重合判定）的增量
// 返回 { sums: {aid: stat}, sources: {aid: {periods,startTs,endTs}} }
// stat 键与 evoStats 对齐：view/favorite/coin/danmaku/like/reply/share（coin/like 恒 0）
function sumWindowWithSource(startTs, endTs) {
  const acc = {};
  const src = {};
  for (const num of localIssues()) {
    const w = issueWindow(num);
    if (!w) continue;
    if (w.endTs <= startTs || w.startTs >= endTs) continue; // 不重合
    const arr = loadIssue(num);
    for (const r of arr || []) {
      if (r.id == null) continue;
      const aid = String(r.id).replace(/^av/, "");
      const cur = (acc[aid] = acc[aid] || {
        view: 0, favorite: 0, coin: 0, danmaku: 0, like: 0, reply: 0, share: 0,
      });
      // 本期累计快照；增量由调用方做期末−期初差分（此处只聚合各期快照值）
      cur.view = Math.max(0, Number(r.view) || 0);
      cur.favorite = Math.max(0, Number(r.favorite) || 0);
      cur.reply = Math.max(0, Number(r.reply) || 0);
      cur.danmaku = Math.max(0, Number(r.danmaku) || 0);
      // coin/like/share biliran 未记录 → 0
      const s = (src[aid] = src[aid] || { periods: [], startTs: null, endTs: null });
      if (!s.periods.includes(num)) s.periods.push(num);
      if (w.startTs != null && (s.startTs == null || w.startTs < s.startTs)) s.startTs = w.startTs;
      if (w.endTs != null && (s.endTs == null || w.endTs > s.endTs)) s.endTs = w.endTs;
    }
  }
  return { sums: acc, sources: src };
}

module.exports = {
  CACHE_DIR,
  BASE,
  RANGE,
  fetchIssue,
  localIssues,
  loadIssue,
  issueWindow,
  issueNear,
  deltaBetween,
  syncAll,
  sumWindowWithSource,
};
