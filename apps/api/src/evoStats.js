// evocalrank 周刊统计数据拉取与本地化：为周/月/年增量榜补充历史基线。
// evocalrank 每期 main_rank+second_rank 的 play/favorite/coin/... 是该周内真实增长量
// （非累计、非官方分数），按 avid 存为 cache/evo_delta/{rankNum}.json。
const fs = require("node:fs");
const path = require("node:path");
const evocalrank = require("./evocalrank");

const CACHE_DIR = path.join(__dirname, "..", "cache");
const EVO_DIR = path.join(CACHE_DIR, "evo_delta");
const DAY = 86400000;

// 解析 evocalrank 时间字符串 → 时间戳(秒)。支持 "2026-09-07 11:25:17" 与 "2026年9月5日 3:00"。
function parseTime(str) {
  if (!str) return null;
  const s = String(str);
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):?(\d{2})?/);
  if (iso) return Math.floor(new Date(+iso[1], +iso[2] - 1, +iso[3], +iso[4], +iso[5], +(iso[6] || 0)).getTime() / 1000);
  const cn = s.match(/(\d{4})年(\d{1,2})月(\d{1,2})日\s*(\d{1,2}):(\d{2})/);
  if (cn) return Math.floor(new Date(+cn[1], +cn[2] - 1, +cn[3], +cn[4], +cn[5]).getTime() / 1000);
  return Math.floor(new Date(s).getTime() / 1000) || null;
}

function readFileSafe(f) {
  try {
    return JSON.parse(fs.readFileSync(f, "utf8"));
  } catch (e) {
    return null;
  }
}

function evoPath(rankNum) {
  return path.join(EVO_DIR, `${rankNum}.json`);
}

function listLocal() {
  fs.mkdirSync(EVO_DIR, { recursive: true });
  return fs
    .readdirSync(EVO_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort((a, b) => Number(a) - Number(b));
}

function loadOne(rankNum) {
  return readFileSafe(evoPath(rankNum));
}

function loadAll() {
  const out = [];
  for (const num of listLocal()) {
    const d = loadOne(num);
    if (d && d.items) out.push(d);
  }
  return out;
}

let _allCache = null;
let _allAt = 0;
const TTL = 10 * 60 * 1000;
// 缓存版 loadAll：buildBoard 多次调用时避免重复解析全套 JSON
function loadAllCached() {
  if (_allCache && Date.now() - _allAt < TTL) return _allCache;
  _allCache = loadAll();
  _allAt = Date.now();
  return _allCache;
}

// 拉取并与本地合并指定期（覆盖写入本地）；返回该期数据或 null
async function syncPeriod(rankNum) {
  const d = await evocalrank.fetchPeriodStats(rankNum);
  if (!d || !d.items) return null;
  d.collectEndTs = parseTime(d.collectEnd);
  d.collectStartTs = parseTime(d.collectStart);
  d.generateTs = parseTime(d.generate);
  // 中文周文本形如 "2026年9月5日 3:00"，日期同步到 collectEnd
  fs.mkdirSync(EVO_DIR, { recursive: true });
  const tmp = evoPath(rankNum) + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(d), "utf8");
  fs.renameSync(tmp, evoPath(rankNum));
  invalidateCache();
  return d;
}

// 拉取全部期（从 evocalrank info.json 的 rank_list）并落盘；返回成功期数。
// onProgress(count,total)
async function syncAll(onProgress) {
  const periods = await evocalrank.fetchPeriodList();
  let ok = 0;
  for (const p of periods) {
    try {
      await syncPeriod(p.rank_num);
      ok++;
    } catch (e) {
      console.error(`[evoStats] 第 ${p.rank_num} 期同步失败: ${e.message}`);
    }
    if (onProgress && ok % 5 === 0) onProgress(ok, periods.length);
  }
  if (onProgress) onProgress(ok, periods.length);
  return ok;
}

// 累加 [startTs, endTs) 时间窗内、本地已同步的所有期的周增量。
// 返回 { aid: {view,favorite,coin,danmaku,like,reply,share} }，键即采集库 aid。
function sumWindow(startTs, endTs) {
  const acc = {};
  for (const d of loadAllCached()) {
    const t = d.generateTs || d.collectEndTs;
    if (t == null) continue;
    if (t < startTs || t >= endTs) continue;
    for (const [aid, st] of Object.entries(d.items || {})) {
      const cur = (acc[aid] = acc[aid] || {
        view: 0,
        favorite: 0,
        coin: 0,
        danmaku: 0,
        like: 0,
        reply: 0,
        share: 0,
      });
      cur.view += Math.max(0, st.play || 0);
      cur.favorite += Math.max(0, st.favorite || 0);
      cur.coin += Math.max(0, st.coin || 0);
      cur.danmaku += Math.max(0, st.danmaku || 0);
      cur.like += Math.max(0, st.like || 0);
      cur.reply += Math.max(0, st.comment || 0);
      cur.share += Math.max(0, st.share || 0);
    }
  }
  return acc;
}

// 同 sumWindow，但额外给出每个 aid 的数据来源期与对应采集时间。
// evocalrank 每一期都有 collect_start_time / collect_end_time，某条记录一旦用了源站采集数据，
// 它的时间归属就应是源站那一期的采集区间，而不是本地窗口起点 —— 否则会出现
// 「数据取自 09-19~09-26，记录却标着 09-21」的时间错位。
// 返回 { sums: {aid: stat}, sources: {aid: {periods, startTs, endTs}} }（时间戳均为秒）。
function sumWindowWithSource(startTs, endTs) {
  const acc = {};
  const src = {};
  for (const d of loadAllCached()) {
    const t = d.generateTs || d.collectEndTs;
    if (t == null) continue;
    if (t < startTs || t >= endTs) continue;
    for (const [aid, st] of Object.entries(d.items || {})) {
      const cur = (acc[aid] = acc[aid] || {
        view: 0,
        favorite: 0,
        coin: 0,
        danmaku: 0,
        like: 0,
        reply: 0,
        share: 0,
      });
      cur.view += Math.max(0, st.play || 0);
      cur.favorite += Math.max(0, st.favorite || 0);
      cur.coin += Math.max(0, st.coin || 0);
      cur.danmaku += Math.max(0, st.danmaku || 0);
      cur.like += Math.max(0, st.like || 0);
      cur.reply += Math.max(0, st.comment || 0);
      cur.share += Math.max(0, st.share || 0);

      const s = (src[aid] = src[aid] || { periods: [], startTs: null, endTs: null });
      if (d.rankNum != null && !s.periods.includes(d.rankNum)) s.periods.push(d.rankNum);
      const cs = d.collectStartTs ?? null;
      const ce = d.collectEndTs ?? null;
      if (cs != null && (s.startTs == null || cs < s.startTs)) s.startTs = cs;
      if (ce != null && (s.endTs == null || ce > s.endTs)) s.endTs = ce;
    }
  }
  return { sums: acc, sources: src };
}

// 清除内存缓存（同步新数据后调用）
function invalidateCache() {
  _allCache = null;
  _allAt = 0;
}

module.exports = {
  EVO_DIR,
  parseTime,
  listLocal,
  loadOne,
  loadAll,
  loadAllCached,
  syncPeriod,
  syncAll,
  sumWindow,
  sumWindowWithSource,
  invalidateCache,
  DAY,
};