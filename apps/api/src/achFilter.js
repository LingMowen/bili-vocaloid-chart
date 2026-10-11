// 成就页筛选（口径对齐参考站 vocabili 的 FilterSection）
//
// 参考站把筛选条件序列化进 query string，再由后端按这些参数过滤：
//   view_ranges / favorite_ranges / coin_ranges / like_ranges /
//   danmaku_ranges / reply_ranges / share_ranges   数值档位，格式 "min-max" 逗号分隔
//   daily_count_ranges / weekly_count_ranges      上榜次数档位，同格式
//   daily_rank / weekly_rank                      最佳名次上限（纯数字）
//   pubdate                                        发布日期表达式，见下
//   vocalist_rules / producer_ids /
//   synthesizer_ids / uploader_ids / tag_ids       搜索项
//   types                                          歌曲类型（中文原词）
//   copyright                                      视频类型编号数组
//   foreign                                        仅外语曲（值为 "foreign" 时开启）
//
// 本站不加赞助墙，以上能力全部直接可用。

const NUM_RANGES = [
  "view_ranges",
  "favorite_ranges",
  "coin_ranges",
  "like_ranges",
  "danmaku_ranges",
  "reply_ranges",
  "share_ranges",
  "daily_count_ranges",
  "weekly_count_ranges",
];

// 视频类型编号 → 含义（实测自参考站：点击按钮后 URL 变化）
// 1=自制 2=转载 3=自制投未定 4=转载投未定 100=自制投转载 101=转载投自制
const COPYRIGHT_MAP = {
  1: "original",
  2: "reprint",
  3: "original_undecided",
  4: "reprint_undecided",
  100: "original_reprint",
  101: "reprint_original",
};

// "1000-" → [{min:1000}]；"-1000" → [{max:1000}]；"1000-5000" → [{min,max}]
// 与参考站 z() 同语义：缺的一侧不写。
function parseRanges(str) {
  if (!str) return [];
  return String(str)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((seg) => {
      const i = seg.indexOf("-");
      const lo = i === -1 ? seg : seg.slice(0, i);
      const hi = i === -1 ? "" : seg.slice(i + 1);
      const out = {};
      if (lo !== "") out.min = Number(lo);
      if (hi !== "") out.max = Number(hi);
      return out;
    })
    .filter((r) => Number.isFinite(r.min) || Number.isFinite(r.max));
}

// JSON 数组字符串 → 数组（容错：解析失败按空数组）
function parseList(str, fallback = []) {
  if (!str) return fallback;
  if (Array.isArray(str)) return str;
  try {
    const v = JSON.parse(str);
    return Array.isArray(v) ? v : fallback;
  } catch (e) {
    return fallback;
  }
}

// 参考站的搜索项序列化为 `=id` / `+id` / `-id` / `?id`（mode 前缀），但我们只需按名字/id 匹配，
// 所以这里剥掉前缀留下标识符本体。
function stripMode(token) {
  return String(token).replace(/^[=+\-?]/, "").trim();
}

// ---- pubdate 表达式 ----
// 支持：2024 / 2024.05 / 2024.05.12 / 2024-2025 / 2024.*.* / 多段用 ";" 分隔
// 语义：命中任一段即通过（OR）。参照参考站 Es() 的校验口径：年份 2007 ~ 当前+1。
const CURRENT_YEAR = new Date().getFullYear();

function parsePubdateExpr(expr) {
  if (!expr) return null;
  const segs = String(expr)
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!segs.length) return null;
  const ranges = [];
  for (const seg of segs) {
    const parts = seg.includes("~") ? seg.split("~").map((s) => s.trim()) : [seg];
    if (parts.length !== 1 && parts.length !== 2) continue;
    const p = parseOne(parts[0]);
    if (!p) continue;
    if (parts.length === 2) {
      const q = parseOne(parts[1]);
      if (!q) continue;
      ranges.push({ from: p, to: q });
    } else {
      ranges.push({ from: p, to: p });
    }
  }
  return ranges.length ? ranges : null;

  function parseOne(tok) {
    if (!tok || tok === "*") return null;
    const seg = String(tok).split(".");
    if (seg.length > 3) return null;
    const y = Number(seg[0]);
    if (!Number.isInteger(y) || y < 2007 || y > CURRENT_YEAR + 1) return null;
    const m = seg[1] === undefined || seg[1] === "*" ? null : Number(seg[1]);
    if (m != null && !(m >= 1 && m <= 12)) return null;
    const d = seg[2] === undefined || seg[2] === "*" ? null : Number(seg[2]);
    if (d != null && !(d >= 1 && d <= 31)) return null;
    return { y, m, d };
  }
}

// 单点 → 数值区间 [from, to]（缺月/日视作该月/日的第一天/最后一天）
function pointToRange(p) {
  const from = Date.UTC(p.y, (p.m ?? 1) - 1, p.d ?? 1) / 1000;
  const to = p.d != null
    ? Date.UTC(p.y, (p.m ?? 1) - 1, p.d) / 1000
    : p.m != null
      ? Date.UTC(p.y, p.m, 0) / 1000
      : Date.UTC(p.y, 11, 31) / 1000;
  return { from, to };
}

// 把 query 解析成筛选条件对象（未设置的字段为 undefined/空，表示不限）
function parseFilters(query = {}) {
  const ranges = {};
  for (const key of NUM_RANGES) {
    const r = parseRanges(query[key]);
    if (r.length) ranges[key] = r;
  }
  const f = {
    ranges,
    dailyRank: toPosInt(query.daily_rank),
    weeklyRank: toPosInt(query.weekly_rank),
    pubdate: query.pubdate ? String(query.pubdate) : null,
    vocalists: parseList(query.vocalist_rules, []).map(stripMode).filter(Boolean),
    producers: parseList(query.producer_ids, []).map(stripMode).filter(Boolean),
    synthesizers: parseList(query.synthesizer_ids, []).map(stripMode).filter(Boolean),
    uploaders: parseList(query.uploader_ids, []).map(stripMode).filter(Boolean),
    tags: parseList(query.tag_ids, []).map(stripMode).filter(Boolean),
    types: parseList(query.types, []).filter(Boolean),
    copyright: parseList(query.copyright, []).map(Number).filter((n) => Number.isInteger(n) && COPYRIGHT_MAP[n]),
    foreign: query.foreign === "foreign" ? true : false,
  };
  f.pubdateRanges = parsePubdateExpr(f.pubdate);
  return f;
}

function toPosInt(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// 是否设了任何筛选条件
function hasAnyFilter(f) {
  if (!f) return false;
  return (
    Object.keys(f.ranges || {}).length > 0 ||
    f.dailyRank != null ||
    f.weeklyRank != null ||
    !!(f.pubdateRanges && f.pubdateRanges.length) ||
    f.vocalists.length > 0 ||
    f.producers.length > 0 ||
    f.synthesizers.length > 0 ||
    f.uploaders.length > 0 ||
    f.tags.length > 0 ||
    f.types.length > 0 ||
    f.copyright.length > 0 ||
    f.foreign
  );
}

// ---- 单条 item 判定 ----
function inRanges(value, list) {
  const v = Number(value) || 0;
  return list.some((r) => (r.min == null || v >= r.min) && (r.max == null || v <= r.max));
}

function namesOf(list, key) {
  const out = [];
  for (const e of list || []) {
    if (!e) continue;
    const obj = key ? e[key] : e;
    const n = typeof obj === "string" ? obj : obj && (obj.name || obj.title);
    if (n) out.push(String(n));
    if (obj && obj.id != null) out.push(String(obj.id));
  }
  return out;
}

function anyMatch(haystack, needles) {
  if (!needles.length) return true;
  const hs = haystack.map((x) => String(x).toLowerCase());
  return needles.some((n) => {
    const t = String(n).toLowerCase();
    return hs.some((h) => h.includes(t));
  });
}

// item 上榜次数（用于 daily_count_ranges / weekly_count_ranges）。
// 成就 item 顶层的 ranks 是 {期号: 名次}，on_board_count 是该档位的上榜期数；
// 要按「期数」筛就用 ranks 里名次非空的条数——那是这首歌在该榜的实际在榜期数。
function countFor(item, board) {
  const ranks = item?.ranks;
  if (!ranks || typeof ranks !== "object") return 0;
  let n = 0;
  for (const k of Object.keys(ranks)) {
    const rk = Number(ranks[k]);
    if (Number.isFinite(rk) && rk >= 1) n++;
  }
  return n;
}

function bestRank(item, board) {
  const ranks = item?.ranks;
  if (!ranks || typeof ranks !== "object") return null;
  let best = null;
  for (const k of Object.keys(ranks)) {
    const rk = Number(ranks[k]);
    if (!Number.isFinite(rk) || rk < 1) continue;
    if (best == null || rk < best) best = rk;
  }
  return best;
}

// 歌曲类型判定：优先用库里的显式字段，退化到标题/标签关键词。
// 本站库没有 vocabili 那套 types 字段，所以按参考站的四类中文名做等价映射。
function matchTypes(item, types) {
  if (!types.length) return true;
  const s = item?.song || {};
  const explicit = Array.isArray(s.types) ? s.types.map(String) : [];
  if (explicit.length) return types.some((t) => explicit.includes(t));

  const hay = [String(s.title || ""), ...(Array.isArray(s.tags) ? s.tags.map(String) : [])].join(" ");
  return types.some((t) => {
    if (t === "原创") return !/翻唱|cover|转载|重置|coverby/i.test(hay) || /原创|original/i.test(hay);
    if (t === "翻唱") return /翻唱|cover/i.test(hay);
    if (t === "本家重置") return /重置|selfcover|自翻/i.test(hay);
    if (t === "串烧") return /串烧|medley|mashup/i.test(hay);
    return false;
  });
}

// 视频类型判定：1=自制 2=转载 3=自制投未定 4=转载投未定 100=自制投转载 101=转载投自制
function matchCopyright(item, codes) {
  if (!codes.length) return true;
  const s = item?.song || {};
  const c = Number(s.copyright);
  if (Number.isInteger(c) && COPYRIGHT_MAP[c]) return codes.includes(c);
  const hay = [String(s.title || ""), String(s.desc || "")].join(" ");
  const guess = [];
  if (/自制/.test(hay)) guess.push(1);
  if (/转载|reprint/i.test(hay)) guess.push(2);
  return codes.some((code) => guess.includes(code));
}

function matchPubdate(item, ranges) {
  if (!ranges || !ranges.length) return true;
  const ts = Number(item?.pubdate ?? item?.song?.pubdate) || 0;
  if (!ts) return false;
  return ranges.some((r) => {
    const from = pointToRange(r.from).from;
    const to = pointToRange(r.to).to;
    return ts >= from && ts <= to;
  });
}

// 对单条 item 应用全部筛选
function itemMatches(item, f, board) {
  if (!hasAnyFilter(f)) return true;
  const s = item?.song || {};
  const r = f.ranges || {};

  // 数值档位：services 在筛选前已把库内统计值挂到 item 顶层（view/like/…）。
  const metricKey = {
    view_ranges: "view",
    favorite_ranges: "favorite",
    coin_ranges: "coin",
    like_ranges: "like",
    danmaku_ranges: "danmaku",
    reply_ranges: "reply",
    share_ranges: "share",
  };
  for (const [rk, mk] of Object.entries(metricKey)) {
    if (r[rk] && !inRanges(item?.[mk] ?? 0, r[rk])) return false;
  }

  // 上榜次数
  if (r.daily_count_ranges && !inRanges(countFor(item, "daily"), r.daily_count_ranges)) return false;
  if (r.weekly_count_ranges && !inRanges(countFor(item, "weekly"), r.weekly_count_ranges)) return false;

  // 最佳名次上限
  if (f.dailyRank != null) {
    const b = bestRank(item, "daily");
    if (b == null || b > f.dailyRank) return false;
  }
  if (f.weeklyRank != null) {
    const b = bestRank(item, "weekly");
    if (b == null || b > f.weeklyRank) return false;
  }

  // 发布日期
  if (!matchPubdate(item, f.pubdateRanges)) return false;

  // 搜索项：歌手 / P主 / 引擎 / UP主 / 标签
  if (!anyMatch(namesOf(s.vocalists, "vocalist"), f.vocalists)) return false;
  if (!anyMatch(namesOf(s.producers, "producer"), f.producers)) return false;
  if (!anyMatch(namesOf(s.synthesizers, "synthesizer"), f.synthesizers)) return false;
  if (!anyMatch(s.staff || [], f.uploaders)) return false;
  if (!anyMatch(Array.isArray(s.tags) ? s.tags : [], f.tags)) return false;

  // 类型
  if (!matchTypes(item, f.types)) return false;
  if (!matchCopyright(item, f.copyright)) return false;

  // 仅外语曲：foreign=true 时只要中文歌。lang 由 services 挂到 item 顶层。
  if (f.foreign && (item?.lang || s.lang) === "zh") return false;

  return true;
}

module.exports = {
  COPYRIGHT_MAP,
  parseRanges,
  parseList,
  parsePubdateExpr,
  parseFilters,
  hasAnyFilter,
  itemMatches,
};