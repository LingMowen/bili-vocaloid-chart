const collector = require("../collector");
const statHistory = require("../statHistory");
const evoStats = require("../evoStats");
const { canonicalGirl, canonicalGirls } = require("../girls");
const {
  ORDER_KEYS,
  chartScore,
  attachRanks,
  classifyLang,
  LANG_NAMES,
  stripHtml,
} = require("../score");

const METRICS = ["view", "favorite", "coin", "like", "danmaku", "reply", "share"];

// ---- 增量榜单：全库歌曲按时间窗口起点快照计算 stat 增量后排名 ----

// 各周期窗口起点（自然边界）。返回 { startTs, endTs, label, issue }
// 边界统一为周期起始日 01:00：日榜=今日01:00、周榜=本周一01:00、月榜=本月1日01:00、年榜=今年1月1日01:00
function windowOf(period, now = new Date()) {
  const fmt = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const pad = (n) => String(n).padStart(2, "0");
  const at1 = (d) => {
    const x = new Date(d);
    x.setHours(1, 0, 0, 0);
    return x;
  };
  if (period === "daily") {
    // 日榜 = 今日 01:00 ~ 明日 01:00
    const s = at1(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
    const e = new Date(s);
    e.setDate(s.getDate() + 1);
    return { start: s, end: e, startTs: Math.floor(s.getTime() / 1000), endTs: Math.floor(e.getTime() / 1000), label: fmt(s), issue: `${s.getFullYear()}${pad(s.getMonth() + 1)}${pad(s.getDate())}` };
  }
  if (period === "weekly") {
    // 周榜 = 本周一 01:00 ~ 下周一 01:00
    const dow = (now.getDay() + 6) % 7; // 周一=0
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow);
    const s = at1(monday);
    const e = new Date(s);
    e.setDate(s.getDate() + 7);
    return { start: s, end: e, startTs: Math.floor(s.getTime() / 1000), endTs: Math.floor(e.getTime() / 1000), label: fmt(s), issue: `${s.getFullYear()}W${String(Math.ceil(((s - new Date(s.getFullYear(), 0, 1)) / 86400000 + 1) / 7)).padStart(2, "0")}` };
  }
  if (period === "monthly") {
    // 月榜 = 本月 1 日 01:00 ~ 下月 1 日 01:00
    const s = at1(new Date(now.getFullYear(), now.getMonth(), 1));
    const e = at1(new Date(now.getFullYear(), now.getMonth() + 1, 1));
    return { start: s, end: e, startTs: Math.floor(s.getTime() / 1000), endTs: Math.floor(e.getTime() / 1000), label: fmt(s), issue: `${s.getFullYear()}${pad(s.getMonth() + 1)}` };
  }
  // annual = 今年 01:00 ~ 明年 01:00
  const s = at1(new Date(now.getFullYear(), 0, 1));
  const e = at1(new Date(now.getFullYear() + 1, 0, 1));
  return { start: s, end: e, startTs: Math.floor(s.getTime() / 1000), endTs: Math.floor(e.getTime() / 1000), label: fmt(s), issue: `${now.getFullYear()}` };
}

function dayKeyOf(ts) {
  const d = new Date(ts * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// 窗口增量基线日 = 窗口起始日的前一天。
// 快照按自然日归档，而周期起点是 01:00，所以不能写成 dayKeyOf(startTs - 1)
// （那会落回起始日当天，即正在被当日采集反复覆盖的那份，导致增量恒为 0）。
// 该口径对四类周期统一成立：日=昨天、周=上周日、月=上月末、年=上一年 12-31。
function baseDayKey(win) {
  return dayKeyOf(win.startTs - 86400);
}

// 期号从全库最早窗口起递增：最早期=1，最新=当前。steps 负数=往后（未来）。
// 基于时间戳运算，避免 Date 本地/UTC 混用丢一天。
function shiftWindow(period, baseWin, steps) {
  const DAY = 86400000;
  const ms = baseWin.startTs * 1000;
  if (period === "daily") {
    return windowOf(period, new Date(ms + steps * DAY));
  }
  if (period === "weekly") {
    return windowOf(period, new Date(ms + steps * 7 * DAY));
  }
  if (period === "monthly") {
    const d = new Date(baseWin.start.getFullYear(), baseWin.start.getMonth() + steps, 1);
    return windowOf(period, d);
  }
  return windowOf(period, new Date(baseWin.start.getFullYear() + steps, 0, 1));
}

// 轻量榜单：计算某窗口下各视频的综合分与名次（aid -> { rank, score }），用于期数回溯对比
// 口径与 buildBoard 保持一致：增量 = 期末快照 - 期初快照（期初 = 窗口起始日的前一天快照）。
// 这样「上一期」在本函数算出的名次，与该期作为当期榜单时 buildBoard 算出的名次一致。
// 返回 null 表示该期首尾快照不全，无法计算（调用方跳过该期，不当作"未上榜"）。
// snapCache（可选）：Map<dayKey, baseSnap>，避免同一窗口多次读盘
function scoreWindow(items, win, snapCache) {
  const load = (k) => {
    if (!k) return null;
    if (snapCache && snapCache.has(k)) return snapCache.get(k);
    const s = statHistory.snapshotAt(k);
    if (snapCache && s) snapCache.set(k, s);
    return s;
  };
  const fromSnap = load(baseDayKey(win));
  const toSnap = load(dayKeyOf(win.endTs - 1));
  if (!fromSnap || !toSnap) return null;
  const deltas = statHistory.deltaSnapshot(fromSnap, toSnap);
  const arr = [];
  for (const it of items) {
    if (!it.aid) continue;
    const aid = String(it.aid);
    const to = toSnap[aid];
    if (!to) continue; // 该期期末还没有这条数据
    const isNewSong = it.pubdate && it.pubdate >= win.startTs && it.pubdate < win.endTs;
    // 有期初基线 → 用期内增量；无基线但属窗口内新歌 → 用期末累计值（与 buildBoard 新歌口径一致）；
    // 无基线且非新歌 → 该期无法还原，跳过。
    const dstat = deltas[aid]
      || (isNewSong
        ? { view: to.view, favorite: to.favorite, coin: to.coin, like: to.like, danmaku: to.danmaku, reply: to.reply, share: to.share }
        : null);
    if (!dstat) continue;
    const score = chartScore(dstat);
    if (score <= 0) continue;
    arr.push({ aid, score });
  }
  arr.sort((a, b) => b.score - a.score);
  const map = new Map();
  arr.forEach((x, i) => map.set(x.aid, { rank: i + 1, score: x.score }));
  return map;
}

// 排行榜数据（全库按增量窗口构建，缓存由 index.js 负责）
// 期号从全库最早窗口起递增：最早期=1，昨天=2，今天=3（最新一期期号最大）
async function buildBoard(period, issue) {
  const nowDate = new Date();
  const curWin = windowOf(period, nowDate);
  const items = await loadLibrary();

  // 全库最早 pubdate 所在窗口作为第 1 期基准。
  // 年刊例外：期号按自然年语义编号 —— 2025=第1期、2026=第2期……（数据起点固定为2025年）
  const pubs = items.map((it) => it.pubdate).filter(Boolean);
  const baseWin = period === "annual"
    ? windowOf("annual", new Date(2025, 0, 1))
    : pubs.length
      ? windowOf(period, new Date(Math.min(...pubs) * 1000))
      : curWin;
  // 当前（最新）期号：从 baseWin 往后推（未来），直到窗口起点 >= curWin 起点
  const latestIssue = (() => {
    let s = 0;
    while (s <= 40000) {
      const w = s === 0 ? baseWin : shiftWindow(period, baseWin, s);
      if (w.startTs >= curWin.startTs) return s + 1;
      s++;
    }
    return 1;
  })();

  const reqIssue = issue != null && String(issue).trim() !== "" ? Number(issue) : null;
  const explicitIssue = reqIssue != null && reqIssue >= 1 && reqIssue <= latestIssue; // 是否由调用方明确指定了某一期（而非默认取最新）
  const issueNum = reqIssue != null && reqIssue >= 1 && reqIssue <= latestIssue ? reqIssue : latestIssue;
  // 期号 N → 从 baseWin 往后推（未来）N-1 个周期
  const win = issueNum === 1 ? baseWin : shiftWindow(period, baseWin, issueNum - 1);
  const startTs = win.startTs;
  const endTs = win.endTs;
  // 基线快照取「窗口起始日的前一天」：该日快照已归档冻结，不会被当日采集刷新，
  // 增量恰好覆盖一个完整周期（日=昨天→今天、周=上周日→本周日、月=上月末→本月末、年=上一年末→今年末）。
  // 首期没有更早的数据，退回用本期起点快照。
  const baseKey = win.startTs === baseWin.startTs ? dayKeyOf(win.startTs) : baseDayKey(win);
  let baseSnap = statHistory.snapshotAt(baseKey);
  // 快照缺失（长周期或采集断层）时，回退用 evocalrank 周增量累加该窗口内每周增长。
  // 仅当 evo 数据确实覆盖该窗口（存在 generate/collectEnd 落在窗口内的期）才可回退。
  let evoSums = null;
  if (!baseSnap) {
    evoSums = evoStats.sumWindow(win.startTs, win.endTs);
    if (Object.keys(evoSums).length === 0) evoSums = null;
  }
  const list = [];
  for (const it of items) {
    if (!it.aid) continue;
    const isNewSong = it.pubdate && it.pubdate >= startTs && it.pubdate < endTs;
    // 老歌：窗口起点前已存在，用增量计分；新歌：无基线，用当前值计分
    const dstat = isNewSong
      ? { view: it.view || 0, favorite: it.favorite || 0, coin: it.coin || 0, like: it.like || 0, danmaku: it.danmaku || 0, reply: it.reply || 0, share: it.share || 0 }
      : baseSnap
        ? statHistory.deltaStat(it, baseSnap)
        // 增量来源：无本地快照(长周期榜)时优先用 evocalrank 周增量累加，其次按发布日起算纯增量
        : evoSums && Object.prototype.hasOwnProperty.call(evoSums, String(it.aid))
          ? evoSums[String(it.aid)]
          : { view: 0, favorite: 0, coin: 0, like: 0, danmaku: 0, reply: 0, share: 0 };
    const score = chartScore(dstat);
    if (score <= 0) continue;
    list.push({
      aid: it.aid,
      bvid: it.bvid || "",
      title: it.title || "",
      pic: String(it.pic || "").replace(/^http:\/\//, "https://"),
      duration: it.duration || 0,
      pubdate: it.pubdate || 0,
      lang: it.lang || classifyLang(it.title || ""),
      tags: it.tags || [],
      girls: it.girls || [],
      owner: it.owner || {},
      score,
      ...dstat,
      period,
      issue: issueNum,
      new: isNewSong,
      prev_rank: null,
      prev_score: null,
      delta: null,
      streak: 0,
    });
  }

  list.sort((a, b) => b.score - a.score);
  attachRanks(list, ORDER_KEYS);
  list.forEach((it, i) => {
    it.score_rank = i + 1;
  });

  // ---- 历史对比与成就：prev_rank / prev_score / delta / streak / peak_rank / achievements ----
  // 从上一期开始独立回看每首歌的历史（最多 LOOKBACK_MAX 期）。
  // 缺失快照的期跳过（不作为"未上榜"处理）。
  // achievements 参考周刊规则：
  //   superhit   SUPERHIT：累计 2 次登上主榜前 3
  //   monban     门番：28 期内 20 次 或 50 期内 30 次登上主榜（前 20），且无连续 8 期未上榜
  //   myth       神话：播放总量突破一千万
  //   annual_top 年榜首位：本期为年榜第 1 名
  const LOOKBACK_MAX = 50;
  const MAIN_TOP = 20; // 主榜 = 前 20 名
  const snapCache = new Map();
  const prevMaps = []; // prevMaps[0]=上一期，序号即往前第 s 期
  for (let s = 1; s <= LOOKBACK_MAX && issueNum - s >= 1; s++) {
    const wPrev = shiftWindow(period, baseWin, issueNum - s - 1);
    const m = scoreWindow(items, wPrev, snapCache);
    if (!m) continue; // 缺失该期快照，跳过（不当作未上榜）
    prevMaps.push(m);
  }
  for (const it of list) {
    const k = String(it.aid);
    // 连续在榜 streak：从当前期往前连续出现
    let streak = 1;
    for (const m of prevMaps) {
      if (!m.get(k)) break;
      streak++;
    }
    it.streak = streak;
    // 上一期（最近一期快照）
    const prev = prevMaps.length ? prevMaps[0].get(k) : null;
    if (prev && prev.score > 0) {
      it.prev_rank = prev.rank;
      it.prev_score = prev.score;
      it.delta = (it.score - prev.score) / prev.score;
    }
    // 历史最高名次（优于当前才标注）
    let br = null;
    for (const m of prevMaps) {
      const h = m.get(k);
      if (h && (br == null || h.rank < br)) br = h.rank;
    }
    if (br != null && it.score_rank > br) it.peak_rank = br;
    // ---- 成就 ----
    let top3Count = it.score_rank <= 3 ? 1 : 0;
    let on28 = it.score_rank <= MAIN_TOP ? 1 : 0;
    let on50 = it.score_rank <= MAIN_TOP ? 1 : 0;
    // 逐期统计（prevMaps[0]=最近，越往后越早）
    for (let idx = 0; idx < prevMaps.length; idx++) {
      const h = prevMaps[idx].get(k);
      if (!h) continue;
      if (h.rank <= 3) top3Count++;
      if (h.rank <= MAIN_TOP) {
        if (idx < 28) on28++;
        on50++;
      }
    }
    // 连续 8 期未上榜检测（按时间从早到晚扫描；仅统计歌曲已存在且快照可用的期）
    let no8Miss = true;
    {
      let run = 0;
      for (let idx = prevMaps.length - 1; idx >= 0; idx--) {
        const h = prevMaps[idx].get(k);
        run = h ? 0 : run + 1;
        if (run >= 8) {
          no8Miss = false;
          break;
        }
      }
    }
    const ach = {
      superhit: top3Count >= 2,
      monban: (on28 >= 20 || on50 >= 30) && no8Miss,
      myth: (it.view || 0) >= 10_000_000,
      annual_top: period === "annual" && it.score_rank === 1,
    };
    it.achievements = ach;
  }

  // 期号 1..latestIssue，越新的日期期号越大（前天=1、昨天=2、今天=3）
  const minIssue = 1;
  const prevIssue = issueNum > 1 ? issueNum - 1 : null; // 更早一期
  const nextIssue = issueNum < latestIssue ? issueNum + 1 : null; // 更新一期

  // 最新一期（未明确指定）若因增量基线过近而无数据（进行中的周期），自动向前回退到最近一期有数据的榜单。
  // 递归时会带上具体期号，下一次即为"明确指定"，不会无限回退；latest_issue 恒为最新期不受影响。
  if (list.length === 0 && !explicitIssue && issueNum > 1) {
    return buildBoard(period, issueNum - 1);
  }

  return {
    issue: issueNum,
    latest_issue: latestIssue,
    min_issue: minIssue,
    prev_issue: prevIssue,
    next_issue: nextIssue,
    date_start: win.label,
    date_end: dayKeyOf(endTs - 1),
    count: list.length,
    new_count: list.filter((it) => it.new).length,
    orders: ORDER_KEYS,
    list,
  };
}

// ---- 本期歌手 / P主排行：按榜期条目聚合 ----
// type = "singer"   按 girls（歌姬）聚合
// type = "producer" 按 owner（投稿 UP 主）聚合
async function buildBoardSingers(period = "daily", issue = null, limit = 10, kind = "all", type = "singer") {
  let d;
  if (issue == null) {
    d = loadBoardCache(period);
  }
  if (!d) d = await buildBoard(period, issue);
  let items = Array.isArray(d?.list) ? d.list : [];
  if (kind !== "all") items = items.filter((it) => (kind === "cn") === (it.lang === "cn"));
  const byProducer = type === "producer";

  // singers.json 提供 vocabili_id（歌手详情页跳转用）
  let singerMap = {};
  try {
    const raw = fs.readFileSync(path.join(CACHE_DIR, "singers.json"), "utf8");
    const parsed = JSON.parse(raw);
    singerMap = parsed?.singers || {};
  } catch {
    singerMap = {};
  }

  const agg = new Map();
  for (const it of items) {
    // 一首歌多歌姬合唱时每个歌姬各计 1 次；P主榜按投稿人唯一计 1 次
    const names = byProducer
      ? [it.owner?.mid || it.owner?.name]
      : canonicalGirls(it.girls || []);
    for (const name of names) {
      if (!name) continue;
      const g = agg.get(name) || { name: byProducer ? it.owner?.name || "未知UP主" : name, count: 0, score: 0, top: [] };
      if (byProducer && !g.mid) {
        g.mid = Number(it.owner?.mid) || null;
        g.face = it.owner?.face || null;
      }
      g.count += 1;
      g.score += it.score || 0;
      if (g.top.length < 5) {
        g.top.push({ aid: it.aid, title: it.title, score: it.score || 0 });
      }
      agg.set(name, g);
    }
  }

  const list = [...agg.values()]
    .sort((a, b) => b.score - a.score || b.count - a.count)
    .slice(0, limit)
    .map((g) =>
      byProducer
        ? { ...g, id: null }
        : {
            ...g,
            id: singerMap[g.name]?.vocabili_id ?? singerMap[g.name]?.vocadb_id ?? null,
            is_vs: Boolean(singerMap[g.name]?.is_vs),
            picture: singerMap[g.name]?.picture ?? singerMap[g.name]?.pic ?? null,
          },
    );

  return {
    issue: d?.issue ?? null,
    latest_issue: d?.latest_issue ?? null,
    prev_issue: d?.prev_issue ?? null,
    next_issue: d?.next_issue ?? null,
    date_start: d?.date_start ?? null,
    date_end: d?.date_end ?? null,
    count: list.length,
    type: byProducer ? "producer" : "singer",
    list,
  };
}

// 读取缓存中的本期榜单（buildBoard 产物，含各期归档）
function loadBoardCache(period) {
  try {
    return JSON.parse(fs.readFileSync(path.join(CACHE_DIR, `board_${period}.json`), "utf8"));
  } catch {
    return null;
  }
}

// ---- 全库（collector 采集结果）----
const path = require("node:path");
const fs = require("node:fs");

const CACHE_DIR = path.join(__dirname, "..", "..", "cache");
const LIBRARY_FILE = path.join(CACHE_DIR, "library.json");
const LIBRARY_TTL = 6 * 3600 * 1000;

let _library = null;
let _libraryAt = 0;
let _libraryLoading = null;

// 读取当前全库（collector.getLibrary 已带内存+磁盘缓存）
async function loadLibrary(force = false) {
  if (!force && _library && Date.now() - _libraryAt < LIBRARY_TTL) return _library;
  if (_libraryLoading) return _libraryLoading;
  _libraryLoading = (async () => {
    const items = await collector.getLibrary();
    _library = items;
    _libraryAt = Date.now();
    return items;
  })();
  try {
    return await _libraryLoading;
  } finally {
    _libraryLoading = null;
  }
}

// 全库 item 已是 board item 结构（collector 产出），此处透传
async function buildLibraryItem(row) {
  return row;
}

async function evostats(order = "score", pn = 1, ps = 20) {
  const items = await loadLibrary();
  const key = ORDER_KEYS.includes(order) ? order : "score";
  items.sort((a, b) => (b[key] || 0) - (a[key] || 0));
  const start = (pn - 1) * ps;
  return {
    order: key,
    count: items.length,
    orders: ORDER_KEYS,
    list: items.slice(start, start + ps),
  };
}

async function tags() {
  const items = await loadLibrary();
  const counter = {};
  const girlCounter = {};
  for (const it of items) {
    for (const t of [...new Set(it.tags || [])]) counter[t] = (counter[t] || 0) + 1;
    for (const g of canonicalGirls(it.girls || [])) girlCounter[g] = (girlCounter[g] || 0) + 1;
  }
  const tagsArr = Object.entries(counter)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));
  const girlsArr = Object.entries(girlCounter)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));
  return { total: tagsArr.length, tags: tagsArr, girls: girlsArr };
}

// 所有分组的共用逻辑：输入 "歌曲条目列表"，输出按歌手分组的统计
function groupGirls(items, singerMap) {
  const nameToSinger = {};
  for (const [name, info] of Object.entries(singerMap)) {
    nameToSinger[name.toLowerCase()] = { ...info, _key: name };
  }
  const groups = new Map();
  for (const it of items) {
    for (const rawName of [...new Set(it.girls || [])]) {
      // 先归一并展开（初音ミク/miku → 初音未来；镜音双子 → 镜音铃+镜音连），再查索引：
      // 否则别名/合称写法会因 singerMap 查不到 id 而掉进 name: 独立组，又变回重复统计
      for (const name of canonicalGirls([rawName])) {
      const s = nameToSinger[name.toLowerCase()] || nameToSinger[String(rawName).toLowerCase()] || {};
      const gid = s.vocabili_id ?? s.vocadb_id ?? null;
      const key = gid != null ? `id:${gid}` : `name:${name}`;
      const g = groups.get(key) || {
        name,
        count: 0,
        view: 0,
        favorite: 0,
        like: 0,
        engines: {},
        partners: {},
        songs: [],
        picture: s.picture ?? s.pic ?? null,
        id: gid,
      };
      g.count += 1;
      g.view += it.view || 0;
      g.favorite += it.favorite || 0;
      g.like += it.like || 0;
      const owner = it.owner?.name || "未知P主";
      g.partners[owner] = (g.partners[owner] || 0) + 1;
      if (g.songs.length < 100 && !g._seenAids?.has(it.aid)) {
        (g._seenAids ??= new Set()).add(it.aid);
        g.songs.push({
          aid: it.aid,
          bvid: it.bvid,
          title: it.title,
          pic: it.pic,
          score: it.score,
          view: it.view,
        });
      }
      groups.set(key, g);
      }
    }
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}

// archive 全历史聚合兜底源：按 aid 去重，并集 girls、取最新 stats
function girlsFromArchive() {
  const byAid = new Map();
  for (const period of ["daily", "weekly", "monthly", "annual"]) {
    const dir = path.join(CACHE_DIR, "board_archive", period);
    let files = [];
    try {
      files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
    } catch (e) {
      continue;
    }
    for (const f of files) {
      let d = null;
      try {
        d = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      } catch (e) {
        continue;
      }
      for (const it of d.list || []) {
        const aid = String(it.aid);
        const prev = byAid.get(aid);
        if (!prev) {
          byAid.set(aid, it);
        } else {
          prev.girls = [...new Set([...prev.girls, ...it.girls])];
          if (it.view > prev.view) prev.view = it.view;
          if (it.favorite > prev.favorite) prev.favorite = it.favorite;
          if (it.like > prev.like) prev.like = it.like;
          if (it.score > prev.score) prev.score = it.score;
        }
      }
    }
  }
  return [...byAid.values()];
}

async function girls() {
  const items = await loadLibrary();
  let singerMap = {};
  try {
    const raw = fs.readFileSync(path.join(CACHE_DIR, "singers.json"), "utf8");
    const parsed = JSON.parse(raw);
    singerMap = parsed?.singers || {};
  } catch {
    singerMap = {};
  }
  const list =
    libraryReady()
      ? groupGirls(items, singerMap)
      : groupGirls(girlsFromArchive(), singerMap);
  return { status: "ready", count: list.length, list };
}

// 库已完整（complete 且规模达标）时才用实时库，否则用 archive 兜底
function libraryReady() {
  try {
    const raw = JSON.parse(fs.readFileSync(LIBRARY_FILE, "utf8"));
    return raw.complete === true && Array.isArray(raw.data) && raw.data.length >= 100;
  } catch (e) {
    return false;
  }
}

async function stats() {
  const items = await loadLibrary();
  const langCounter = {};
  const girlCounter = {};
  const ownerCounter = {};
  const sums = { view: 0, favorite: 0, coin: 0, like: 0, danmaku: 0, reply: 0, share: 0 };
  let topScore = 0;
  let topView = 0;
  for (const it of items) {
    const lang = it.lang || "other";
    langCounter[lang] = (langCounter[lang] || 0) + 1;
    for (const g of canonicalGirls(it.girls || [])) girlCounter[g] = (girlCounter[g] || 0) + 1;
    const owner = it.owner?.name || "未知P主";
    ownerCounter[owner] = (ownerCounter[owner] || 0) + 1;
    for (const k of Object.keys(sums)) sums[k] += it[k] || 0;
    topScore = Math.max(topScore, it.score || 0);
    topView = Math.max(topView, it.view || 0);
  }
  return {
    total: items.length,
    langs: Object.entries(langCounter)
      .sort((a, b) => b[1] - a[1])
      .map(([k, c]) => ({ name: LANG_NAMES[k] || k, count: c })),
    girls: Object.entries(girlCounter)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 40)
      .map(([n, c]) => ({ name: n, count: c })),
    owners: Object.entries(ownerCounter)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([n, c]) => ({ name: n, count: c })),
    sums,
    top_score: topScore,
    top_view: topView,
  };
}

async function random() {
  const items = await loadLibrary();
  const picks = items.filter((it) => it.score);
  const source = picks.length ? picks : items;
  const it = source[Math.floor(Math.random() * source.length)];
  return {
    aid: it.aid,
    bvid: it.bvid,
    title: it.title,
    pic: it.pic,
    score: it.score,
    owner: it.owner || {},
    girls: it.girls || [],
  };
}

async function today() {
  const items = await loadLibrary();
  const now = new Date();
  const md = `${now.getMonth() + 1}-${now.getDate()}`;
  const matched = items.filter((it) => {
    if (!it.pubdate) return false;
    const d = new Date(it.pubdate * 1000);
    return `${d.getMonth() + 1}-${d.getDate()}` === md;
  });
  matched.sort((a, b) => (b.score || 0) - (a.score || 0));
  return {
    month: now.getMonth() + 1,
    day: now.getDate(),
    count: matched.length,
    list: matched.slice(0, 20),
  };
}

async function search(keyword, searchType = "video", page = 1) {
  const q = String(keyword || "").trim().toLowerCase();
  const items = await loadLibrary();
  const out = [];
  for (const it of items) {
    const hay = [
      it.title || "",
      ...(it.tags || []),
      ...(it.girls || []),
      it.owner?.name || "",
    ]
      .join(" ")
      .toLowerCase();
    if (q && hay.includes(q)) {
      out.push({
        aid: it.aid,
        bvid: it.bvid,
        title: stripHtml(it.title),
        pic: it.pic,
        pubdate: it.pubdate || 0,
        view: it.view,
        duration: it.duration || 0,
        score: it.score,
        tags: it.tags,
        girls: it.girls,
        owner: it.owner,
      });
    }
  }
  const ps = 20;
  const start = (page - 1) * ps;
  return { num_results: out.length, page, items: out.slice(start, start + ps) };
}

// 历史上榜记录：基于每日存档的榜单（board_archive）重建；无存档历史时返回空，由前端兜底实时数据
const PERIODS_ALL = ["daily", "weekly", "monthly", "annual"];
const ARCHIVE_DIR = path.join(CACHE_DIR, "board_archive");

function readBoardCache(period, issueFile) {
  try {
    const f = path.join(CACHE_DIR, "board_archive", period, issueFile);
    return JSON.parse(fs.readFileSync(f, "utf8"));
  } catch (e) {
    return null;
  }
}

async function songHistory(aid) {
  const out = {};
  for (const period of PERIODS_ALL) {
    const merged = [];
    const cur = readCacheJson(`board_${period}.json`);
    if (cur && Array.isArray(cur.list)) merged.push(cur);
    try {
      const dir = path.join(ARCHIVE_DIR, period);
      const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")) : [];
      for (const f of files) {
        const d = readBoardCache(period, f);
        if (d && Array.isArray(d.list)) merged.push(d);
      }
    } catch (e) {
      /* ignore */
    }
    const byDate = new Map();
    for (const d of merged) {
      const key = d.date_start ?? String(d.issue);
      const prev = byDate.get(key);
      if (!prev || (Number(d.issue) || 0) > (Number(prev.issue) || 0)) byDate.set(key, d);
    }
    const entries = [];
    for (const d of byDate.values()) {
      const hit = (d.list || []).find((it) => String(it.aid) === String(aid));
      if (hit) entries.push({ ...hit, _date: d.date_start ?? null });
    }
    entries.sort((a, b) => (Number(a.issue) || 0) - (Number(b.issue) || 0));
    const records = entries.map((it) => ({
      issue: it.issue,
      period,
      date: it._date ?? null,
      rank: it.score_rank ?? null,
      score: it.score ?? 0,
      view: it.view ?? 0,
      favorite: it.favorite ?? 0,
      coin: it.coin ?? 0,
      like: it.like ?? 0,
      danmaku: it.danmaku ?? 0,
      reply: it.reply ?? 0,
      share: it.share ?? 0,
      rank_score: it.rank_score ?? null,
      rank_view: it.rank_view ?? null,
      rank_favorite: it.rank_favorite ?? null,
      rank_coin: it.rank_coin ?? null,
      rank_like: it.rank_like ?? null,
      rank_danmaku: it.rank_danmaku ?? null,
      rank_reply: it.rank_reply ?? null,
      rank_share: it.rank_share ?? null,
      new: !!it.new,
      prev_rank: it.prev_rank ?? null,
      delta: it.delta ?? null,
      streak: it.streak ?? 0,
    }));
    const stats = {};
    const ranked = records.filter((r) => r.rank != null);
    if (ranked.length) {
      stats.total = ranked.length;
      stats.best_rank = Math.min(...ranked.map((r) => r.rank));
      stats.best_issue = ranked.find((r) => r.rank === stats.best_rank)?.issue ?? null;
      stats.latest_rank = ranked[ranked.length - 1].rank;
      stats.latest_issue = ranked[ranked.length - 1].issue ?? null;
      stats.top1_count = ranked.filter((r) => r.rank === 1).length;
      stats.avg_rank = Math.round((ranked.reduce((s, r) => s + r.rank, 0) / ranked.length) * 10) / 10;
      stats.avg_window = `近 ${ranked.length} 期`;
    }
    const scored = records.filter((r) => r.score > 0);
    if (scored.length) {
      stats.max_score = Math.max(...scored.map((r) => r.score));
      stats.max_score_issue = scored.find((r) => r.score === stats.max_score)?.issue ?? null;
    }
    if (records.length) {
      stats.first_issue = records[0].issue ?? null;
      stats.first_rank = records[0].rank ?? null;
    }
    out[period] = { records, stats };
  }
  return out;
}

// ---- 成就（周刊成就 / 日刊门番）----
// 数据源为缓存的最新一期榜单（daily / weekly / monthly）。由于没有逐期历史快照，
// "连续 N 期" 类判定无法真实计算：能基于当期排名/跨期(榜)共存推导的才返回，否则为空。

function readCacheJson(name) {
  try {
    return JSON.parse(fs.readFileSync(path.join(CACHE_DIR, name), "utf8"));
  } catch (e) {
    return null;
  }
}

function toSongItem(it) {
  const name = it.owner?.name || "";
  return {
    aid: it.aid,
    bvid: it.bvid || "",
    title: it.title || "",
    display_name: it.title || "",
    thumbnail: it.pic || "",
    producers: name ? [{ producer: { name } }] : [],
    vocalists: (it.girls || []).map((g) => ({ vocalist: { name: g }, is_support: false })),
  };
}

// ---- 永久成就（参考周刊规则）----
// 数据源为 board_archive 全部历史期归档 + 最新一期缓存（board_{period}.json）。
// 永久成就按"历史任一时刻达成即成立"判定，不要求歌曲当前仍在榜。
// 类别定义（四类永久成就，按周期通用）：
const ACH_CATEGORIES = [
  { key: "superhit", label: "SUPERHIT", description: "累计 2 次登上主榜前 3 名", maxRank: 3 },
  { key: "monban", label: "门番达成", description: "28 期内 20 次 或 50 期内 30 次登上主榜（前 20），且无连续 8 期未上榜", maxRank: 20 },
  { key: "myth", label: "神话达成", description: "播放总量突破一千万", maxRank: 20 },
  { key: "annual_top", label: "年榜首位", description: "首次成为年榜首位", maxRank: 1 },
];

// 归档期号可能不连续，门番的"无连续 8 期未上榜"按相邻上榜期号差近似判定
function hasNo8Miss(recs) {
  for (let i = 1; i < recs.length; i++) {
    const gap = recs[i].issue - recs[i - 1].issue;
    if (gap >= 9) return false;
  }
  return true;
}

// 从全部历史期归档中，按成就类别筛选（含掉榜歌曲）
function buildAchievementsByBoard(board, type) {
  const periods = [];
  const cur = readCacheJson(`board_${board}.json`);
  if (cur && Array.isArray(cur.list)) periods.push(cur);
  try {
    const dir = path.join(ARCHIVE_DIR, board);
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")) : [];
    for (const f of files) {
      const d = readBoardCache(board, f);
      if (d && Array.isArray(d.list)) periods.push(d);
    }
  } catch (e) {
    /* ignore */
  }
  const byIssue = new Map();
  for (const p of periods) {
    const k = String(p.issue);
    const prev = byIssue.get(k);
    if (!prev || (p.list || []).length >= (prev.list || []).length) byIssue.set(k, p);
  }
  const merged = [...byIssue.values()].sort((a, b) => Number(a.issue) - Number(b.issue));
  const songMap = new Map();
  for (const p of merged) {
    const issue = Number(p.issue);
    for (const it of p.list || []) {
      const aid = String(it.aid);
      let s = songMap.get(aid);
      if (!s) {
        s = { it, aid, records: [], views: [] };
        songMap.set(aid, s);
      }
      s.records.push({ issue, rank: Number(it.score_rank) || 0, score: it.score || 0, view: it.view || 0 });
      s.views.push(it.view || 0);
      s.it = it; // 保留最新，便于取标题/封面/播放
    }
  }
  const items = [];
  for (const s of songMap.values()) {
    const recs = s.records.sort((a, b) => a.issue - b.issue);
    let top3Count = 0;
    let onBoardCount = 0;
    let achieved = null;
    let achievedRank = 0;
    for (const r of recs) {
      if (r.rank >= 1 && r.rank <= 3) {
        top3Count++;
        if (type === "superhit" && top3Count >= 2) {
          achieved = achieved ?? r.issue;
          achievedRank = r.rank;
        }
      }
      if (r.rank >= 1 && r.rank <= 20) {
        onBoardCount++;
        if (type === "monban" && onBoardCount >= 20) {
          achieved = achieved ?? r.issue;
          achievedRank = r.rank;
        }
      }
      if (type === "myth" && r.view >= 10_000_000) {
        achieved = achieved ?? r.issue;
        achievedRank = r.rank;
      }
    }
    const ach = {
      superhit: top3Count >= 2,
      monban: onBoardCount >= 20 && hasNo8Miss(recs),
      myth: Math.max(0, ...s.views) >= 10_000_000,
      annual_top: board === "annual" && recs.some((r) => r.rank === 1),
    };
    if (!ach[type]) continue;
    const it = s.it;
    const rank = Number(it.score_rank) || 0;
    const ranks = {};
    for (const r of recs) ranks[r.issue] = r.rank;
    if (type === "annual_top" && achieved == null) {
      const hit = recs.find((r) => r.rank === 1);
      achieved = hit ? hit.issue : null;
      achievedRank = 1;
    }
    if (achieved == null) {
      achieved = recs[recs.length - 1].issue;
      achievedRank = rank;
    }
    items.push({
      category: type,
      song_id: s.aid,
      song: toSongItem(it),
      ranks,
      progress: achievedRank ? String(achievedRank) : "1",
      start_issue: recs[0].issue,
      end_issue: recs[recs.length - 1].issue,
      achieved_issue: achieved,
      dropped_issue: null,
    });
  }
  items.sort((a, b) => Number(a.achieved_issue) - Number(b.achieved_issue));
  return { items, issue: merged.length ? merged[merged.length - 1].issue : null };
}

// opts: { board: 'weekly'|'daily'|'monthly'|'annual', type, status, page, pageSize }
async function achievements(opts = {}) {
  const board = ["daily", "weekly", "monthly", "annual"].includes(opts.board) ? opts.board : "weekly";
  const type = ACH_CATEGORIES.some((c) => c.key === opts.type) ? String(opts.type) : "superhit";
  const page = Math.max(1, Number(opts.page) || 1);
  const pageSize = Math.max(1, Math.min(60, Number(opts.pageSize) || 20));
  const result = buildAchievementsByBoard(board, type);
  const total = result.items.length;
  return {
    board,
    type,
    status: String(opts.status || "active"),
    issue: result.issue,
    categories: ACH_CATEGORIES,
    total,
    data: result.items.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize),
  };
}

// ---- 库内 P主（UP主）搜索：仅能在已被收录的音乐中按 UP主 或合作者检索 ----
async function searchOwners(keyword, page = 1, sort = "works") {
  const q = String(keyword || "").trim().toLowerCase();
  const items = await loadLibrary();
  const map = {};
  const touchUser = (mid, name, face, isOwner, sailiveView, source) => {
    if (!mid || !name) return;
    const key = String(mid);
    const o = map[key] || { mid: Number(mid), name, face: face || "", song_count: 0, coop_count: 0, total_view: 0, samples: [] };
    if (isOwner) {
      o.song_count += 1;
      o.total_view += sailiveView || 0;
    } else {
      o.coop_count += 1;
    }
    if (source && o.samples.length < 12) {
      o.samples.push({ aid: source.aid, title: source.title || "", pic: source.pic || "", score: source.score || 0 });
    }
    map[key] = o;
  };
  for (const it of items) {
    const owner = it.owner;
    if (owner && typeof owner === "object" && owner.name && (!q || owner.name.toLowerCase().includes(q))) {
      touchUser(owner.mid, owner.name, owner.face, true, it.view || 0, it);
    }
    const staff = Array.isArray(it.staff) ? it.staff : [];
    for (const s of staff) {
      if (!s.name) continue;
      if (q && !s.name.toLowerCase().includes(q)) continue;
      touchUser(s.mid, s.name, s.face, false, 0, it);
    }
  }
  for (const o of Object.values(map)) {
    o.samples = (o.samples || []).sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 6).map((s) => ({
      aid: s.aid,
      title: s.title,
      pic: s.pic,
    }));
  }
  const list = Object.values(map).sort((a, b) =>
    sort === "view"
      ? b.total_view - a.total_view
      : (b.song_count + b.coop_count) - (a.song_count + a.coop_count) || b.total_view - a.total_view,
  );
  const ps = 20;
  const start = (page - 1) * ps;
  return {
    num_results: list.length,
    pages: Math.ceil(list.length / ps),
    page,
    items: list.slice(start, start + ps) ,
  };
}

// ---- 库内 P主 详情：返回该 P主 已收录的音乐、合作者及作为合作者参与的视频 ----
async function ownerDetail(mid) {
  const target = Number(mid);
  const items = await loadLibrary();
  const songs = [];
  const coop = [];
  let owner = null;
  let view = 0, favorite = 0, coin = 0, like = 0;
  for (const it of items) {
    const staff = Array.isArray(it.staff) ? it.staff : [];
    if (Number(it.owner?.mid) === target) {
      if (!owner) owner = { mid: it.owner.mid, name: it.owner.name || "", face: it.owner.face || "" };
      view += it.view || 0;
      favorite += it.favorite || 0;
      coin += it.coin || 0;
      like += it.like || 0;
      songs.push({
        aid: it.aid,
        bvid: it.bvid || "",
        title: it.title || "",
        pic: it.pic || "",
        pubdate: it.pubdate || 0,
        score: it.score,
        view: it.view || 0,
        girls: it.girls || [],
        staff: staff.map((s) => ({ mid: s.mid, name: s.name || "", title: s.title || "", face: s.face || "" })),
      });
    } else if (staff.some((s) => Number(s.mid) === target)) {
      const me = staff.find((s) => Number(s.mid) === target) || {};
      coop.push({
        aid: it.aid,
        bvid: it.bvid || "",
        title: it.title || "",
        pic: it.pic || "",
        pubdate: it.pubdate || 0,
        score: it.score,
        view: it.view || 0,
        girls: it.girls || [],
        role: me.title || "",
        me: { mid: me.mid, name: me.name || "", title: me.title || "", face: me.face || "" },
        owner: { mid: it.owner?.mid, name: it.owner?.name || "", face: it.owner?.face || "" },
      });
    }
  }
  if (!owner && coop.length === 0) return null;
  songs.sort((a, b) => (b.score || 0) - (a.score || 0));
  coop.sort((a, b) => (b.score || 0) - (a.score || 0));
  if (!owner) {
    const first = coop[0];
    owner = { mid: target, name: first.owner?.name || "", face: "" };
    const me = first.me || {};
    if (me.name) owner.name = me.name;
    if (me.face) owner.face = me.face;
  }
  return {
    owner,
    summary: { song_count: songs.length, total_view: view, total_favorite: favorite, total_coin: coin, total_like: like },
    songs,
    coop,
  };
}

async function girlsByAid(aid) {
  for (const period of ["daily", "weekly", "monthly", "annual"]) {
    const dir = path.join(CACHE_DIR, "board_archive", period);
    let files = [];
    try {
      files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
    } catch (e) {
      continue;
    }
    for (const f of files) {
      let d = null;
      try {
        d = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      } catch (e) {
        continue;
      }
      const hit = (d.list || []).find((it) => String(it.aid) === String(aid));
      if (hit && Array.isArray(hit.girls) && hit.girls.length) {
        return hit.girls;
      }
    }
  }
  return [];
}

module.exports = {
  buildBoard,
  buildBoardSingers,
  evostats,
  tags,
  girls,
  girlsByAid,
  stats,
  random,
  today,
  search,
  songHistory,
  achievements,
  searchOwners,
  ownerDetail,
  loadLibrary,
};
