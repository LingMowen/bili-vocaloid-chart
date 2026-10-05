const collector = require("../collector");
const statHistory = require("../statHistory");
const evoStats = require("../evoStats");
const viewTimeline = require("../viewTimeline");
const biliranSync = require("../biliranSync");
const boardIndex = require("../boardIndex");
const { canonicalGirl, canonicalGirls } = require("../girls");
const {
  ORDER_KEYS,
  chartScore,
  sInteract,
  timeFactor,
  fixFactor,
  dailyScore,
  attachRanks,
  classifyLang,
  LANG_NAMES,
  stripHtml,
} = require("../score");

const METRICS = ["view", "favorite", "coin", "like", "danmaku", "reply", "share"];

// 评分异常护栏倍数：无快照基线（仅 evo 估算、非真实基线）的非新歌，
// 其得分若超过「有基线歌曲得分中位数 × 该倍数」即视为异常（如因缺历史被虚高霸榜），
// 本期暂停收录，等它进入当日快照、下一期有了真实基线再正常计入。
const ABNORMAL_SCORE_MULTIPLE = 8;

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
  // 窗口天数（周=7、月=28~31、年=365/366、日=1）；用户拍板「日增量取平均值」：
  // 无逐日快照时整窗增量 ÷ 天数 = 日均增量，周期总分 = Σ 每天 dailyScore(日均, t_d, avgS)
  const days = Math.max(1, Math.round((win.endTs - win.startTs) / 86400));
  // 第一遍：算日均增量与互动分 S，收集全库 S 均值（Avg 全库口径，去语种）
  const pend = [];
  const sList = [];
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
    const dailyStat = scaleStat(dstat, 1 / days);
    const s = sInteract(dailyStat);
    if (s > 0) sList.push(s);
    pend.push({ aid, dstat: dailyStat, pubdate: it.pubdate || 0 });
  }
  const avgS = sList.length ? sList.reduce((a, b) => a + b, 0) / sList.length : 0;
  // 第二遍：按新公式逐日求和（t 逐日递增 → T 每天不同）
  const arr = [];
  for (const p of pend) {
    let score = 0;
    for (let d = 0; d < days; d++) {
      const dayEndTs = win.startTs + (d + 1) * 86400;
      const t = p.pubdate ? Math.max(0, Math.floor((dayEndTs - p.pubdate) / 86400)) : 14;
      score += dailyScore(p.dstat, t, avgS);
    }
    if (score <= 0) continue;
    arr.push({ aid: p.aid, score });
  }
  arr.sort((a, b) => b.score - a.score);
  const map = new Map();
  arr.forEach((x, i) => map.set(x.aid, { rank: i + 1, score: x.score }));
  return map;
}

// 把一组增量按系数缩放：用于日榜把源站「7 天采集量」折算成日均增量。
function scaleStat(s, k) {
  const f = (v) => Math.round((Number(v) || 0) * k);
  return {
    view: f(s?.view),
    favorite: f(s?.favorite),
    coin: f(s?.coin),
    danmaku: f(s?.danmaku),
    like: f(s?.like),
    reply: f(s?.reply),
    share: f(s?.share),
  };
}

// 排行榜数据（全库按增量窗口构建，缓存由 index.js 负责）
// 期号从全库最早窗口起递增：最早期=1，昨天=2，今天=3（最新一期期号最大）
// 秒级时间戳 → YYYY-MM-DD（本地时区）。用于把 evocalrank 每期的采集时间落到上榜记录上。
function tsToDate(sec) {
  if (sec == null) return null;
  const d = new Date(Number(sec) * 1000);
  if (Number.isNaN(d.getTime())) return null;
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

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
  // 惰性加载：仅当确实有条目缺少基线时才计算（sumWindow 要遍历全部期，有开销）。
  // 注意不能只按「快照文件是否存在」判断：快照存在但**不含某个 aid** 时，
  // deltaStat 会把该 aid 的增量算成 0（见 statHistory.deltaStat 的 base ? … : 0 分支），
  // 导致窗口内才被收录的新歌直接被 score<=0 剔除 —— 表现为「明明有数据却不上榜」。
  let evoData = null;
  let evoLoaded = false;
  const ensureEvo = () => {
    if (evoLoaded) return evoData;
    evoLoaded = true;
    const r = evoStats.sumWindowWithSource(win.startTs, win.endTs);
    evoData = Object.keys(r.sums).length ? r : null;
    return evoData;
  };
  // biliran（2022-07 前历史期补数源，用户 m00799 拍板「前面的数据要包含上」）：
  // 无快照基线、evo 也无、但 biliran 覆盖该窗口时，用 biliran 差分（期末−期初累计快照）还原增量。
  // biliran 无 coin/like/share → 缺失项为 0，data_source="biliran"。
  let biliData = null;
  let biliLoaded = false;
  const ensureBili = () => {
    if (biliLoaded) return biliData;
    biliLoaded = true;
    const r = biliranSync.deltaBetween(win.startTs, win.endTs);
    biliData = Object.keys(r.sums).length ? r : null;
    return biliData;
  };
  const list = [];
  const noBaseCandidates = []; // 无快照基线且非窗口内新歌的条目（评分异常护栏候选）
  // 窗口天数（周=7、月=28~31、年=365/366、日=1）；用户拍板「日增量取平均值」：
  // 整窗增量 ÷ 天数 = 日均增量，周期总分 = Σ 每天 dailyScore(日均, t_d, avgS)（t 逐日递增）
  const days = Math.max(1, Math.round((endTs - startTs) / 86400));
  // ---- 第一遍：算每条增量与互动分 S，收集全库 S 均值（Avg 全库口径，去语种） ----
  const pend = [];
  const sList = [];
  for (const it of items) {
    if (!it.aid) continue;
    const isNewSong = it.pubdate && it.pubdate >= startTs && it.pubdate < endTs;
    const aidStr = String(it.aid);
    // 基线是否覆盖该 aid：快照文件存在 ≠ 里面有这首歌。
    // 缺基线时增量无法计算，回落 evocalrank 采集数据（只取它采集到的数值，名次仍由本站计算）。
    const baseHasAid = !!(baseSnap && baseSnap[aidStr]);
    const evo = baseHasAid ? null : ensureEvo();
    const sums = evo && evo.sums;
    const usedEvo = !isNewSong && !baseHasAid && !!(sums && Object.prototype.hasOwnProperty.call(sums, aidStr));
    const evoSrc = usedEvo ? evo.sources?.[aidStr] : null;
    // biliran：evo 也没有时的兜底（2022-07 前历史期）
    const bili = !baseHasAid && !usedEvo ? ensureBili() : null;
    const biliSums = bili && bili.sums;
    const usedBili = !isNewSong && !baseHasAid && !usedEvo && !!(biliSums && Object.prototype.hasOwnProperty.call(biliSums, aidStr));
    const biliSrc = usedBili ? bili.sources?.[aidStr] : null;
    // 源站一期是「跨 7 天的周采集量」（如 738 期 = 09-19 ~ 09-26）。
    // 周/月榜直接取窗口内各期合计值即可；日榜窗口只有 1 天，照搬会把 7 天量当成 1 天增量、
    // 虚高数倍（新歌会霸榜），所以按采集跨度折算成日均增量。
    const evoDays =
      evoSrc && evoSrc.startTs != null && evoSrc.endTs != null
        ? Math.max(1, Math.round((evoSrc.endTs - evoSrc.startTs) / 86400))
        : 0;
    const evoStat =
      usedEvo && period === "daily" && evoDays > 1 ? scaleStat(sums[aidStr], 1 / evoDays) : sums?.[aidStr];
    // 时间归属：只有周榜需要把记录时间替换成源站那一期的采集区间（09-19 ~ 09-26）。
    // 日榜已折算为日均、月榜沿用本地窗口起点，都不覆盖日期，避免与本地期号错位。
    const evoTime = usedEvo && period === "weekly";
    // 口径统一：有基线的歌（含窗口内新歌）一律走「期末-期初」增量，
    // 避免把发布前的存量算进本期增量导致虚高（原逻辑 isNewSong 优先于 baseHasAid，
    // 会让「有基线却被误标新歌」的歌吃到全量累计值而霸榜）。
    const dstat = baseHasAid
      ? statHistory.deltaStat(it, baseSnap)
      : isNewSong
        ? { view: it.view || 0, favorite: it.favorite || 0, coin: it.coin || 0, like: it.like || 0, danmaku: it.danmaku || 0, reply: it.reply || 0, share: it.share || 0 }
        // 增量来源：缺基线且非窗口内新歌时优先用 evocalrank 周增量累加（源站采集到的原始数值）
        : usedEvo
          ? evoStat
          : usedBili
            ? biliSums[aidStr]
            : { view: 0, favorite: 0, coin: 0, like: 0, danmaku: 0, reply: 0, share: 0 };
    const dailyStat = scaleStat(dstat, 1 / days);
    const s = sInteract(dailyStat);
    if (s > 0) sList.push(s);
    pend.push({ it, isNewSong, baseHasAid, usedEvo, usedBili, evoSrc, evoTime, evoDays, dstat, dailyStat });
  }
  const avgS = sList.length ? sList.reduce((a, b) => a + b, 0) / sList.length : 0;
  // ---- 第二遍：按新公式（log2×S×T×Fix）逐日求和出分并构建榜单条目 ----
  for (const p of pend) {
    const { it, isNewSong, baseHasAid, usedEvo, usedBili, evoSrc, evoTime, evoDays, dstat, dailyStat } = p;
    let score = 0;
    for (let d = 0; d < days; d++) {
      const dayEndTs = startTs + (d + 1) * 86400;
      const t = it.pubdate ? Math.max(0, Math.floor((dayEndTs - it.pubdate) / 86400)) : 14;
      score += dailyScore(dailyStat, t, avgS);
    }
    if (score <= 0) continue;
    const entry = {
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
      // 时间归属：用了源站采集数据时，记录源站对应期的采集区间与期号（仅周榜覆盖记录日期）
      evo_periods: evoSrc?.periods ?? null,
      evo_start: evoTime ? tsToDate(evoSrc?.startTs) : null,
      evo_end: evoTime ? tsToDate(evoSrc?.endTs) : null,
      // 日榜折算成日均时记录一下除以了几天的采集跨度，便于核对数值
      avg_days: usedEvo && period === "daily" && evoDays > 1 ? evoDays : null,
      data_source: baseHasAid
        ? "snapshot"
        : usedEvo
          ? period === "daily" && evoDays > 1
            ? "evocalrank-daily-avg"
            : "evocalrank"
          : usedBili
            ? "biliran"
          : isNewSong
            ? "current"
            : "snapshot",
      period,
      issue: issueNum,
      new: isNewSong,
      // 计分口径标记（2026-10-05 新公式切换，用户拍板「日增量取平均值」）：
      //   daily-avg-sum = 整窗增量 ÷ 窗口天数 = 日均增量，周期总分 = Σ 每天 dailyScore(日均, t_d)
      score_mode: "daily-avg-sum",
      prev_rank: null,
      prev_score: null,
      delta: null,
      streak: 0,
    };
    list.push(entry);
    if (!isNewSong && !baseHasAid) noBaseCandidates.push(entry);
  }

  // ---- 评分异常护栏：无基线非新歌本期暂停收录，下一期再计 ----
  // 仅 evo 估算（无快照基线）的非新歌，其得分常因缺历史而虚高（如《花骨朵》类老歌靠周榜估算霸榜）。
  // 以「有真实基线的歌曲得分中位数 × 倍数」为阈值：超过则判定为异常，本期待收录，
  // 等它进了当日快照、下一期有了真实基线再正常计入，避免虚高值污染当期榜单。
  // 若当期没有任何有基线的歌（如首跑且无快照），则不排除任何条目（无可比基准）。
  const baselineScores = list
    .filter((e) => !noBaseCandidates.includes(e))
    .map((e) => e.score)
    .sort((a, b) => a - b);
  if (baselineScores.length) {
    const median = baselineScores[Math.floor(baselineScores.length / 2)];
    const threshold = median * ABNORMAL_SCORE_MULTIPLE;
    for (const e of noBaseCandidates) {
      if (e.score > threshold) {
        const idx = list.indexOf(e);
        if (idx >= 0) list.splice(idx, 1);
      }
    }
  }

  list.sort((a, b) => b.score - a.score);
  attachRanks(list, ORDER_KEYS);
  list.forEach((it, i) => {
    it.score_rank = i + 1;
  });

  // ---- 历史对比与成就：prev_rank / prev_score / delta / streak / peak_rank / achievements ----
  // 从上一期开始独立回看每首歌的历史（最多 LOOKBACK_MAX 期）。
  // 缺失快照的期跳过（不作为"未上榜"处理）。
  // achievements 统一使用 vocabili 口径（见下方 ACH_CATEGORIES）：
  //   emerging_hit / mega_hit 为连续型，potential_regular / regular 为滑窗计数型
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
    // ---- 成就（2026-09-30 统一为 vocabili 体系）----
    //   emerging_hit       连续 3 期主榜前 5
    //   mega_hit           连续 5 期主榜前 3
    //   potential_regular  15 期内有 10 期在前 20（期数不足按 2/3 比例缩放）
    //   regular            30 期内有 20 期在前 20
    // 序列按「早期 → 当前」排列；prevMaps 缺失快照的期按其既有规则跳过。
    const seq = [];
    for (let idx = prevMaps.length - 1; idx >= 0; idx--) {
      const h = prevMaps[idx].get(k);
      seq.push(h ? h.rank : null);
    }
    seq.push(it.score_rank);
    let s5 = 0, s3 = 0, best5 = 0, best3 = 0;
    for (const rk of seq) {
      if (rk != null && rk >= 1 && rk <= 5) { s5++; best5 = Math.max(best5, s5); } else s5 = 0;
      if (rk != null && rk >= 1 && rk <= 3) { s3++; best3 = Math.max(best3, s3); } else s3 = 0;
    }
    const winCount = (window0, need0) => {
      const win = Math.min(window0, seq.length);
      if (!win) return false;
      const need = Math.max(1, Math.ceil((need0 * win) / window0));
      const recent = seq.slice(-win);
      let c = 0;
      for (const rk of recent) if (rk != null && rk >= 1 && rk <= MAIN_TOP) c++;
      return c >= need;
    };
    it.achievements = {
      emerging_hit: best5 >= 3,
      mega_hit: best3 >= 5,
      potential_regular: winCount(15, 10),
      regular: winCount(30, 20),
    };
  }

  // 期号 1..latestIssue，越新的日期期号越大（前天=1、昨天=2、今天=3）
  const minIssue = 1;
  const prevIssue = issueNum > 1 ? issueNum - 1 : null; // 更早一期
  const nextIssue = issueNum < latestIssue ? issueNum + 1 : null; // 更新一期

  // 最新一期（未明确指定）若因增量基线过近而无数据（进行中的周期），自动向前回退到最近一期有数据的榜单。
  // 递归时会带上具体期号，下一次即为"明确指定"，不会无限回退；latest_issue 恒为最新期不受影响。
  if (list.length === 0 && !explicitIssue && issueNum > 1) {
    // P0 回退路径异常护栏：最新一期无数据需向前回退重建时，
    // 若回退重建（递归 buildBoard）抛错，不让异常冒泡导致整次请求崩溃、
    // 也避免调用方落盘被中断。失败时退回当前（空）榜单，
    // issue / latest_issue 仍指向最新期，编号不被回退污染。
    try {
      return await buildBoard(period, issueNum - 1);
    } catch (e) {
      console.error(
        `[buildBoard] 回退至期号 ${issueNum - 1} 失败，返回当前空榜单：`,
        e && e.stack ? e.stack : e
      );
    }
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
    score_mode: "daily-avg-sum",
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
      const g = agg.get(name) || {
        name: byProducer ? it.owner?.name || "未知UP主" : name,
        count: 0,
        score: 0,
        view: 0,
        favorite: 0,
        top: [],
      };
      if (byProducer && !g.mid) {
        g.mid = Number(it.owner?.mid) || null;
        g.face = it.owner?.face || null;
      }
      g.count += 1;
      g.score += it.score || 0;
      // 播放/收藏按投稿累加：/singers 的排序维度要用，
      // 且必须跟着「本期」口径走（此前该页读的是全库 /api/girls，与当期榜对不上）
      g.view += it.view || 0;
      g.favorite += it.favorite || 0;
      if (g.top.length < 5) {
        g.top.push({ aid: it.aid, title: it.title, score: it.score || 0 });
      }
      agg.set(name, g);
    }
  }

  const all = [...agg.values()].sort((a, b) => b.score - a.score || b.count - a.count);
  // limit<=0 表示不限量（/singers 页要全量展示本期）。
  // 备注：本期日刊去重后歌手 ~27 位、P主 ~1018 位，全量体积可控（P主全量约 250KB）。
  const picked = limit > 0 ? all.slice(0, limit) : all;
  const list = picked.map((g) =>
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
    total: all.length,
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

// 歌姬索引：标准名 -> { id, picture }（来自 cache/girls.json）。
// 用于「常合作歌手」头像卡：本站库内只有歌姬名字，头图与 vocalist id 取自这里。
const GIRLS_FILE = path.join(CACHE_DIR, "girls.json");
let _girlIndex = null;
let _girlIndexAt = 0;

function loadGirlIndex() {
  if (_girlIndex && Date.now() - _girlIndexAt < LIBRARY_TTL) return _girlIndex;
  const map = new Map();
  try {
    const d = JSON.parse(fs.readFileSync(GIRLS_FILE, "utf8"));
    for (const g of d?.list || []) {
      if (!g?.name) continue;
      if (!map.has(g.name)) map.set(g.name, { id: g.id ?? null, picture: g.picture || "" });
    }
  } catch {
    // 读不到就沿用旧索引（可能为空 Map），不阻断主流程
    return _girlIndex || map;
  }
  _girlIndex = map;
  _girlIndexAt = Date.now();
  return map;
}

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

// 全量 groupGirls() 重算约 1.4s（变量：全库遍历 + 歌姬归一展开），
// 此前 /api/girls 每个请求都重算一遍。这里做进程内 TTL 缓存；
// 只在真正重算时才回写 cache/girls.json（写盘 ~572KB，不该每次请求都做）。
const GIRLS_TTL = 10 * 60 * 1000;
let _girls = null;
let _girlsAt = 0;

async function girls(force = false) {
  if (!force && _girls && Date.now() - _girlsAt < GIRLS_TTL) return _girls;

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
  const out = { status: "ready", count: list.length, list };

  _girls = out;
  _girlsAt = Date.now();
  try {
    fs.writeFileSync(path.join(CACHE_DIR, "girls.json"), JSON.stringify(out));
  } catch {
    /* 写盘失败不影响响应 */
  }
  return out;
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
  // 走榜单档案索引：此前每次请求都要全量读+解析 149MB 档案（~1.7s 同步 I/O），
  // 且同步 I/O 会独占事件循环，视频页多个接口并发时互相排队（实测端到端 12s）。
  const idx = await boardIndex.get();
  const all = idx.byAid.get(String(aid)) || [];
  const out = {};
  for (const period of PERIODS_ALL) {
    // 索引内已按「(date_start ?? issue) 去重取期号最大者」并期号升序，等价于旧逻辑
    const records = all
      .filter((r) => r.period === period)
      .map((r) => {
        // 去掉索引专用字段，输出结构与旧实现逐字段一致
        const { girls: _g, _archived: _a, ...rest } = r;
        return rest;
      });
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

// ---- 永久成就（2026-09-29 起 1:1 对齐 vocabili 的类型体系）----
// 数据源为 board_archive 全部历史期归档 + 最新一期缓存（board_{period}.json）。
// 永久成就按"历史任一时刻达成即成立"判定，不要求歌曲当前仍在榜。
//
// vocabili 原始定义（自其前端 bundle 提取）：
//   周刊成就（cL）：
//     emerging_hit        Emerging Hit!   连续 3 期主榜前 5 名      maxRank 5  色 #6A0DAD
//     mega_hit            Mega Hit!!!     连续 5 期主榜前 3 名      maxRank 3  色 #CCA300
//     potential_regular   门番候补        15 期内有 10 期在前 20 名  maxRank 20 色 #23AFA4
//     regular             门番            30 期内有 20 期在前 20 名  maxRank 20 色 #127436
//   日刊门番（AO）：
//     daily_regular           日刊门番     色 #127436（阈值同「门番」）
//     daily_potential_regular 日刊门番候补 色 #23AFA4（阈值同「门番候补」）
//
// 数据现实适配（与 2026-09-27 的修复同思路）：站内可用历史期数 N 不足官方窗口（周榜仅 ~18 期 < 30）
// 时，窗口取 min(官方窗口, N)、所需次数按官方比例等比缩放（比例均为 2/3），否则门番系永远为 0。
// 描述文案仍展示官方口径，不展示缩放细节。
const ACH_CATEGORIES = [
  // —— vocabili 对齐类型 ——
  { key: "emerging_hit", label: "Emerging Hit!", description: "连续 3 期主榜前 5 名", maxRank: 5 },
  { key: "mega_hit", label: "Mega Hit!!!", description: "连续 5 期主榜前 3 名", maxRank: 3 },
  { key: "potential_regular", label: "门番候补", description: "15 期内有 10 期在前 20 名", maxRank: 20 },
  { key: "regular", label: "门番", description: "30 期内有 20 期在前 20 名", maxRank: 20 },
  { key: "daily_regular", label: "日刊门番", description: "30 期内有 20 期在前 20 名", maxRank: 20 },
  { key: "daily_potential_regular", label: "日刊门番候补", description: "15 期内有 10 期在前 20 名", maxRank: 20 },
  // 2026-10-05：新增「累计播放量」三档（用户指定）。与上面 6 类不同源 ——
  // 它们按榜单位次判定，这三档按库内**累计播放量**判定，与是否上榜无关。
  { key: "hall_of_fame", label: "殿堂曲", description: "累计播放量 ≥ 10 万", viewThreshold: 100000 },
  { key: "legend", label: "传说曲", description: "累计播放量 ≥ 100 万", viewThreshold: 1000000 },
  { key: "myth", label: "神话曲", description: "累计播放量 ≥ 1000 万", viewThreshold: 10000000 },
  // 2026-09-30：旧四类（superhit / monban / myth / annual_top）已彻底下线，
  // 前后端统一为上面这套 vocabili 定义，不再保留兼容分支。
];

// vocabili 同款配色（前端类型 tab / 徽章用）
const ACH_COLORS = {
  emerging_hit: "#6A0DAD",
  mega_hit: "#CCA300",
  potential_regular: "#23AFA4",
  regular: "#127436",
  daily_regular: "#127436",
  daily_potential_regular: "#23AFA4",
  // 累计播放量三档（用户指定阈值）：殿堂 10 万 / 传说 100 万 / 神话 1000 万
  hall_of_fame: "#8B5CF6",
  legend: "#D97706",
  myth: "#DC2626",
};

// 累计播放量成就：判定源 = 库内 item.view（累计），与榜单位次无关，四个榜通用。
const ACH_VIEW_CATEGORIES = ACH_CATEGORIES.filter((c) => c.viewThreshold > 0);

// 计数型成就的官方窗口/所需次数（比例 2/3，缩放共用）
const ACH_COUNT_WINDOWS = {
  potential_regular: { window: 15, need: 10 },
  regular: { window: 30, need: 20 },
  daily_regular: { window: 30, need: 20 },
  daily_potential_regular: { window: 15, need: 10 },
};

// 类别归属榜单：日刊门番系只由日刊榜产出，其余四类只由周刊榜产出。
// 对齐 vocabili —— 其 achievement 记录的 board 字段就是这么分的（daily x8 全是 daily_*，weekly x12 全是另四类），
// 成就页的 weekly / daily 两个 tab 也正好对应这张表。不加限定会让「日刊门番」出现在月榜/年榜上。
const ACH_BOARD_CATEGORIES = {
  daily: ["daily_regular", "daily_potential_regular"],
  weekly: ["emerging_hit", "mega_hit", "potential_regular", "regular"],
};

function periodDaysOf(board) {
  return board === "daily" ? 1 : board === "weekly" ? 7 : board === "monthly" ? 30 : 365;
}

// 档案指纹（只 stat 不读内容）：档案增删改后自动失效，不会读到旧结果。
function statSafe(p) {
  try {
    const s = fs.statSync(p);
    return `${s.mtimeMs}:${s.size}`;
  } catch {
    return "x";
  }
}

// 让出事件循环：单个榜的档案可达 100MB，逐份 readFileSync 会把 API 卡住数秒。
const yieldToLoop = () => new Promise((r) => setImmediate(r));

function archiveFingerprint(board) {
  const parts = [statSafe(path.join(CACHE_DIR, `board_${board}.json`))];
  const dir = path.join(ARCHIVE_DIR, board);
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    files = [];
  }
  files.sort();
  for (const f of files) parts.push(`${f}=${statSafe(path.join(dir, f))}`);
  return parts.join("|");
}

// 一次扫描算出该榜全部 6 类成就，按档案指纹缓存。
// 单个榜档案可达 100MB，按类别重复扫描是这一块的主要开销（成就页 6 个面板 = 6 次全量读）。
const _achCache = new Map(); // board -> { fp, data }
const _achBuilding = new Map(); // board -> Promise（并发请求共享同一次构建）

async function buildAllByBoard(board) {
  const fp = archiveFingerprint(board);
  const cached = _achCache.get(board);
  if (cached && cached.fp === fp) return cached.data;
  const inflight = _achBuilding.get(board);
  if (inflight) return inflight;
  const p = (async () => {
    try {
      const data = await scanBoardAchievements(board);
      _achCache.set(board, { fp: archiveFingerprint(board), data });
      return data;
    } finally {
      _achBuilding.delete(board);
    }
  })();
  _achBuilding.set(board, p);
  return p;
}

async function buildAchievementsByBoard(board, type) {
  const all = board === "all" ? await buildAllBoards() : await buildAllByBoard(board);
  if (!type || type === "all") return all;
  return { ...all, items: all.items.filter((x) => x.category === type) };
}

// 全部榜单混排（对齐 vocabili 首页「成就速递」：它调 /achievement 不传 board，一次拿到跨榜结果）。
// 各榜期号体系不同（本站 daily 5900 / weekly 843），所以按 achieved_date 倒序，不能比期号。
const ALL_BOARDS = ["daily", "weekly", "monthly", "annual"];
const _achAllCache = { fp: null, data: null };

async function buildAllBoards() {
  const fp = ALL_BOARDS.map((b) => `${b}:${archiveFingerprint(b)}`).join("||");
  if (_achAllCache.fp === fp && _achAllCache.data) return _achAllCache.data;
  const items = [];
  for (const b of ALL_BOARDS) {
    const one = await buildAllByBoard(b);
    for (const it of one.items) items.push({ ...it, board: b });
  }
  items.sort((a, b) => String(b.achieved_date || "").localeCompare(String(a.achieved_date || "")));
  const data = { items, issue: null, periods_available: null, has_gap: false };
  _achAllCache.fp = fp;
  _achAllCache.data = data;
  return data;
}

// 从全部历史期归档中，按成就类别筛选（含掉榜歌曲）
async function scanBoardAchievements(board) {
  const periods = [];
  const cur = readCacheJson(`board_${board}.json`);
  if (cur && Array.isArray(cur.list)) periods.push(cur);
  try {
    const dir = path.join(ARCHIVE_DIR, board);
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")) : [];
    let n = 0;
    for (const f of files) {
      const d = readBoardCache(board, f);
      if (d && Array.isArray(d.list)) periods.push(d);
      if (++n % 4 === 0) await yieldToLoop();
    }
  } catch (e) {
    /* ignore */
  }
  // 归一去重：归档期号混乱（同日多份、日期乱序），按 date_start 归并，同一天只保留条目最长的一份，
  // 再按日期排序，得到可靠的"逐期历史"。否则跨期成就会在错误期号上失真。
  const byDate = new Map();
  for (const p of periods) {
    const d = p.date_start || String(p.issue);
    const prev = byDate.get(d);
    if (!prev || (p.list || []).length >= (prev.list || []).length) byDate.set(d, p);
  }
  const merged = [...byDate.values()].sort((a, b) =>
    String(a.date_start || a.issue).localeCompare(String(b.date_start || b.issue)),
  );
  const N = merged.length;
  // 全部有效期号（按日期升序）——连续 streak / 滑窗计数都要基于"全期序列"，
  // 不能只在歌曲上榜的期里数（那样掉榜不会打断 streak）。
  const orderedIssues = merged.map((p) => Number(p.issue)).filter((n) => Number.isFinite(n));
  // 期号 -> 该期起始日期：跨榜混排按达成日期倒序时需要（各榜期号体系不同，不能直接比期号）
  const issueDate = new Map();
  const songMap = new Map();
  for (const p of merged) {
    const issue = Number(p.issue);
    const date = p.date_start || String(p.issue);
    issueDate.set(String(issue), date);
    for (const it of p.list || []) {
      const aid = String(it.aid);
      let s = songMap.get(aid);
      if (!s) {
        s = { it, aid, records: [], views: [] };
        songMap.set(aid, s);
      }
      s.records.push({ issue, date, rank: Number(it.score_rank) || 0, score: it.score || 0, view: it.view || 0 });
      s.views.push(it.view || 0);
      s.it = it; // 保留最新，便于取标题/封面/播放
    }
  }
  const items = [];
  let scanned = 0;
  for (const s of songMap.values()) {
    if (++scanned % 500 === 0) await yieldToLoop();
    const recs = s.records.sort((a, b) =>
      a.date === b.date ? a.issue - b.issue : String(a.date).localeCompare(String(b.date)),
    );
    const ranks = {};
    for (const r of recs) ranks[r.issue] = r.rank;

    // —— 连续 streak（vocabili：Emerging Hit! / Mega Hit!!!）——
    // 按全期序列逐期扫：本期在前 5/前 3 则 streak+1，否则清零；记录首次凑满的期号。
    let s5 = 0, s3 = 0, best5 = 0, best3 = 0, hit5Issue = null, hit3Issue = null;
    for (const iss of orderedIssues) {
      const rk = ranks[iss] || 0;
      if (rk >= 1 && rk <= 5) {
        s5++;
        best5 = Math.max(best5, s5);
        if (s5 >= 3 && hit5Issue == null) hit5Issue = iss;
      } else s5 = 0;
      if (rk >= 1 && rk <= 3) {
        s3++;
        best3 = Math.max(best3, s3);
        if (s3 >= 5 && hit3Issue == null) hit3Issue = iss;
      } else s3 = 0;
    }

    // —— 滑窗计数（vocabili：门番候补 / 门番 / 日刊门番 / 日刊门番候补）——
    // 官方窗口 W0/需要 K0（比例 2/3）；站内可用期 N < W0 时窗口缩到 N、所需按比例缩放。
    const countHit = (typeKey) => {
      const cfg = ACH_COUNT_WINDOWS[typeKey];
      if (!cfg || !orderedIssues.length) return { ok: false, cnt: 0, hitIssue: null, total: 0, win: 0, need: 0 };
      const win = Math.min(cfg.window, orderedIssues.length);
      const need = Math.max(1, Math.ceil((cfg.need * win) / cfg.window));
      const recent = orderedIssues.slice(-win);
      let cnt = 0;
      let hitIssue = null;
      for (const iss of recent) {
        const rk = ranks[iss] || 0;
        if (rk >= 1 && rk <= 20) {
          cnt++;
          if (cnt >= need && hitIssue == null) hitIssue = iss;
        }
      }
      return { ok: cnt >= need, cnt, hitIssue, total: recs.length, win, need };
    };

    // vocabili 对齐类型的判定：一次扫描把该榜应产出的类别全部算出来，每达成一类产出一条。
    // 这样 /api/achievements?type=all 与首页跨榜混排都只读一遍档案。
    const win = orderedIssues.length;
    const cats = ACH_BOARD_CATEGORIES[board] || [];
    const hits = [];
    if (cats.includes("emerging_hit")) {
      hits.push({ category: "emerging_hit", ok: best5 >= 3, issue: hit5Issue, meta: { streak: best5, window: win, need: 3 } });
    }
    if (cats.includes("mega_hit")) {
      hits.push({ category: "mega_hit", ok: best3 >= 5, issue: hit3Issue, meta: { streak: best3, window: win, need: 5 } });
    }
    for (const key of cats) {
      if (!ACH_COUNT_WINDOWS[key]) continue;
      const c = countHit(key);
      hits.push({
        category: key,
        ok: c.ok,
        issue: c.hitIssue,
        meta: { onBoard: c.cnt, window: c.win, need: c.need, total: c.total },
      });
    }
    const achievedHits = hits.filter((h) => h.ok);
    if (!achievedHits.length) continue;

    const it = s.it;
    // 日刊门番卡片需要的统计：上榜期数 / 总期数 / 当前连续在榜期数（从最新期往回数）
    const onBoardCountAll = recs.filter((r) => r.rank >= 1 && r.rank <= 20).length;
    let tailStreak = 0;
    for (let i = orderedIssues.length - 1; i >= 0; i--) {
      if (ranks[orderedIssues[i]] != null) tailStreak++;
      else break;
    }
    for (const h of achievedHits) {
      const achievedIssue = h.issue ?? recs[recs.length - 1].issue;
      items.push({
        category: h.category,
        song_id: s.aid,
        song: toSongItem(it),
        ranks,
        start_issue: recs[0].issue,
        end_issue: recs[recs.length - 1].issue,
        achieved_issue: achievedIssue,
        // 达成日期（期号 -> date_start）：跨榜混排按它倒序，避免用期号比大小（各榜期号体系不同）
        achieved_date: issueDate.get(String(achievedIssue)) ?? null,
        dropped_issue: null,
        on_board_count: onBoardCountAll,
        total_count: recs.length,
        streak: tailStreak,
        meta: h.meta,
      });
    }
  }
  items.sort((a, b) => Number(a.achieved_issue) - Number(b.achieved_issue));
  // periods_available / has_gap：本站该榜可用历史期数，以及历史是否存在断档。
  // 连续型成就（Emerging Hit! 需 3 期、Mega Hit!!! 需 5 期）在期数不足或历史断档时必然为 0，
  // 前端据此区分「数据不足」与「确实无人达成」，避免用户以为页面坏了。
  const pd = periodDaysOf(board);
  let hasGap = false;
  for (let i = 1; i < merged.length; i++) {
    const a = Date.parse(merged[i - 1].date_start || "");
    const b = Date.parse(merged[i].date_start || "");
    if (!isNaN(a) && !isNaN(b) && (b - a) / 86400000 > pd * 1.6) {
      hasGap = true;
      break;
    }
  }
  return {
    items,
    issue: merged.length ? merged[merged.length - 1].issue : null,
    periods_available: N,
    has_gap: hasGap,
  };
}

// ---- 累计播放量成就（2026-10-05 用户指定）：殿堂曲 10 万 / 传说曲 100 万 / 神话曲 1000 万 ----
// 与上面 6 类「榜单位次」成就不同源：判定读库内 item.view（累计播放量），不依赖是否上榜、
// 也不依赖某期榜单，所以四个榜（含 board=all）的任意 type 查询都应包含这三类。
// 数据量：10 万 3634 首 / 100 万 563 首 / 1000 万 26 首（20545 库实测）。
const _achViewCache = { fp: null, data: [] };

// 从 stat_daily 逐日快照回溯「累计播放量首次跨过各档门槛」的日期。
// 快照粒度为天且只覆盖最近一段，所以只能给出三种精度，必须如实标注，不能假装是精确值：
//   exact  —— 某日快照首次达到门槛，达成于该日（真实落在前一快照日之后、该日之内）
//   before —— 只能确定「早于某日」（含下面的历史榜单累加上界），显示为「YYYY-MM-DD 之前已达成」
//   after  —— 最新一期快照仍未达标，说明达成于最新快照日之后（近期才跨线的歌落这里）
// 缓存指纹 = library 指纹 + 快照目录（期数与最新日期），任一变化即重算。
//
// 快照只有 40 多天，老歌在快照之前就达标了，只能给出 2026-08-13 这种没信息量的上界。
// 所以再叠一层 viewTimeline 的历史榜单累加上界：evo/biliran 的周榜增量累加到某期就跨过门槛，
// 说明「最迟在那期之前已达标」，比快照上界早好几年。累加值是下界，所以这个结论是硬的。
const _achAchvCache = { fp: null, map: null };

function computeViewAchievedDates() {
  const dates = statHistory.listSnapshotDates();
  if (!dates.length) return { map: new Map(), firstDate: null, lastDate: null };
  const libStat = statSafe(path.join(CACHE_DIR, "library.json"));
  const fp = `${libStat}|${dates.length}|${dates[0]}|${dates[dates.length - 1]}`;
  if (_achAchvCache.fp === fp && _achAchvCache.map) {
    return { map: _achAchvCache.map, firstDate: dates[0], lastDate: dates[dates.length - 1] };
  }
  const firstDate = dates[0];
  const lastDate = dates[dates.length - 1];
  // 小门槛先填：view 过百万时殿堂曲必然也达成，一次遍历即可同时点亮多档
  const cats = [...ACH_VIEW_CATEGORIES].sort((a, b) => a.viewThreshold - b.viewThreshold);
  const map = new Map(); // aid(String) -> { [catKey]: { date, precision } }
  const lastSeen = new Map(); // aid(String) -> { view }：上一期快照里它的播放量
  for (const date of dates) {
    const snap = statHistory.snapshotAt(date);
    if (!snap) continue;
    for (const aid of Object.keys(snap)) {
      const cell = snap[aid];
      const v = Number(cell && cell.view) || 0;
      if (v <= 0) continue;
      const prevSnap = lastSeen.get(aid);
      let rec = map.get(aid);
      if (!rec) {
        rec = {};
        map.set(aid, rec);
      }
      for (const c of cats) {
        if (rec[c.key]) continue;
        if (v < c.viewThreshold) continue;
        // 只有「上一期快照里它就在、且当时还没达标」才能证明是这两期之间跨线的 = exact。
        // 首期就出现、或上一期数据缺失的，只能说「至迟该日已达成」= before，不能假装精确。
        rec[c.key] = {
          date,
          precision: prevSnap && prevSnap.view < c.viewThreshold ? "exact" : "before",
        };
      }
      lastSeen.set(aid, { view: v });
    }
  }
  // 叠加历史榜单累加上界：把「快照起点」这个粗上界替换成更早的硬上界
  let upperMap = new Map();
  try {
    upperMap = viewTimeline.buildViewUpperBounds();
  } catch (e) {
    upperMap = new Map();
  }
  for (const [aidRaw, rec] of upperMap) {
    // 键必须统一成字符串：快照 map 的键来自 Object.keys()（字符串），
    // 而 upperMap 的 aid 是 number。若这里用 number 键回写，会多出一条与快照记录
    // 并存的「孤儿记录」，查询时 Map.get(Number) 命中它并短路，导致三档里缺的那档
    // 被误判成 after（实测 7 首神话曲全部被错标）。
    const aid = String(aidRaw);
    for (const c of ACH_VIEW_CATEGORIES) {
      const hit = rec && rec[c.key];
      if (!hit || !hit.ts) continue;
      const date = dayKeyOf(hit.ts);
      const merged = map.get(aid) || {};
      const prev = merged[c.key];
      // 已有 exact 就别动；否则取更早的那个上界
      if (prev && prev.precision === "exact") continue;
      if (prev && prev.date <= date) continue;
      merged[c.key] = { date, precision: "before", basis: "chart-accum", cum: hit.cum };
      map.set(aid, merged);
    }
  }
  _achAchvCache.fp = fp;
  _achAchvCache.map = map;
  return { map, firstDate, lastDate };
}

async function buildViewMilestoneAchievements(type) {
  const items = await loadLibrary();
  const libStat = statSafe(path.join(CACHE_DIR, "library.json"));
  if (_achViewCache.fp === libStat && _achViewCache.data.length) {
    return type && type !== "all" ? _achViewCache.data.filter((x) => x.category === type) : _achViewCache.data;
  }
  const { map: achvMap, lastDate: snapLastDate } = computeViewAchievedDates();
  const out = [];
  for (const c of ACH_VIEW_CATEGORIES) {
    for (const it of items) {
      if (!it || !it.aid) continue;
      const v = Number(it.view) || 0;
      if (v < c.viewThreshold) continue;
      // map 的键统一是字符串（快照 Object.keys() 与 upperMap 都已 String 化），
      // 这里只按 String 查；写成 Map.get(Number(aid)) 会因为 number/string 不相等而 miss。
      const hit = (achvMap.get(String(it.aid)) || {})[c.key];
      // 快照里查不到 = 该 aid 在所有快照日都未达标（新入库或刚跨线）→ after
      const achieved = hit || { date: snapLastDate, precision: "after" };
      out.push({
        category: c.key,
        song_id: it.aid,
        song: toSongItem(it),
        ranks: {},
        start_issue: null,
        end_issue: null,
        // 累计播放量是「至今」的量，没有"达成期号"；达成日期由 stat_daily 快照 + 历史榜单累加回溯得出
        achieved_issue: null,
        achieved_date: achieved.date,
        achieved_precision: achieved.precision,
        achieved_basis: achieved.basis || "stat_daily",
        dropped_issue: null,
        on_board_count: null,
        total_count: null,
        streak: null,
        meta: { view: v, threshold: c.viewThreshold },
      });
    }
  }
  // 同一档内按播放量倒序（殿堂曲里 2900 万排在 10 万前面）
  out.sort((a, b) => (b.meta.view || 0) - (a.meta.view || 0));
  _achViewCache.fp = libStat;
  _achViewCache.data = out;
  return type && type !== "all" ? out.filter((x) => x.category === type) : out;
}

// opts: { board: 'weekly'|'daily'|'monthly'|'annual'|'all', type, status, page, pageSize }
// board 传 "all" 时跨榜混排（对齐 vocabili 首页「成就速递」）；
// type 传 "all"（或不传类别白名单外的值）时返回该榜全部达成项（含累计播放量三档）。
async function achievements(opts = {}) {
  const rawBoard = String(opts.board ?? "");
  const board = rawBoard === "all" ? "all" : ["daily", "weekly", "monthly", "annual"].includes(rawBoard) ? rawBoard : "weekly";
  const rawType = String(opts.type ?? "");
  const type = rawType === "all" || ACH_CATEGORIES.some((c) => c.key === rawType) ? rawType : "emerging_hit";
  const page = Math.max(1, Number(opts.page) || 1);
  const pageSize = Math.max(1, Math.min(60, Number(opts.pageSize) || 20));
  const result = await buildAchievementsByBoard(board, type);
  // 累计播放量三档与榜位无关，单独扫描后并入（同一首歌可能同时有榜位成就与播放量成就）
  const viewItems = await buildViewMilestoneAchievements(type);
  const items = [...result.items, ...viewItems];
  const total = items.length;
  return {
    board,
    type,
    status: String(opts.status || "active"),
    issue: result.issue,
    periods_available: result.periods_available ?? null,
    has_gap: result.has_gap ?? false,
    categories: ACH_CATEGORIES.map((c) => ({ ...c, color: ACH_COLORS[c.key] || undefined })),
    total,
    data: items.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize),
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
  // 常合作歌手：只统计该 P主 自己投稿里的歌姬（合作视频的主投不是他，不计入）
  const girlFreq = new Map();
  for (const s of songs) {
    for (const g of canonicalGirls(s.girls || [])) {
      girlFreq.set(g, (girlFreq.get(g) || 0) + 1);
    }
  }
  const girlIndex = loadGirlIndex();
  const top_girls = [...girlFreq.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .slice(0, 12)
    .map(([name, count]) => ({
      name,
      count,
      id: girlIndex.get(name)?.id ?? null,
      picture: girlIndex.get(name)?.picture || "",
    }));
  // 热门/最新歌曲：参考站 producer 页两个区块，各 10 条
  const hot_songs = songs.slice(0, 10);
  const latest_songs = [...songs].sort((a, b) => (b.pubdate || 0) - (a.pubdate || 0)).slice(0, 10);
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
    top_girls,
    hot_songs,
    latest_songs,
    songs,
    coop,
  };
}

async function girlsByAid(aid) {
  // 走榜单档案索引：此前每次请求都要全量读+解析 149MB 档案（~1.5s 同步 I/O）
  const idx = await boardIndex.get();
  const recs = idx.byAid.get(String(aid));
  if (!recs) return [];
  // 与原实现一致：按 daily → weekly → monthly → annual 的顺序，取第一条带歌姬的记录
  // （recs 内部已按 period 分组、期号升序）
  for (const period of ["daily", "weekly", "monthly", "annual"]) {
    for (const r of recs) {
      if (r.period === period && r._archived && r.girls && r.girls.length) return r.girls;
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
