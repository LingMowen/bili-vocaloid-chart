/**
 * 术力口数据库 官方评分公式（前端纯函数实现）
 *
 * 来源：原站前端产物 `assets/CalculatorDisplay-*.js` 与主包 `assets/index-*.js`
 * 中 `class v5`（评分器）、`x5`（Bili_Board）、`w5`（中文周刊 vc）、`S5`（记录猫周榜）
 * 与调度函数 `xz`。逐式等价移植，未做任何「优化」或改写。
 *
 * 口径要点（易错，改前务必读懂）：
 * 1. 所有修正系数与比率都用 `ceil(x * 100) / 100`（向上取整到 2 位小数），
 *    不是四舍五入。`round2` 仅用于 vc 公式里的 Cf()。
 * 2. 硬币为 0 但有播放/收藏/点赞时，硬币被「视作 1」参与后续全部计算（u = 1）。
 * 3. 自制判定 b：copyright ∈ {1 自制, 3 未定, 101 转载投自制} → b = 1；否则 b = 2（转载）。
 * 4. fixTotal 用整数百分比连乘再除 1e4：floor(round(fixB*100)*round(fixC*100)*round(fixE*100)/1e4)/100。
 * 5. vocaloid-annual 与 special 走同一段「年度/总榜」后处理：fixB 折半 +0.5，
 *    viewR/favoriteR/coinR/likeR/replyR/shareR 各自折半再加常数，且 fixTotal 重算。
 * 6. 播放比率 viewR 只有 vocaloid-daily / vocaloid-weekly 用 ×10，其余用 ×15。
 * 7. 本模块与后端 `apps/api/src/score.js` 的 `chartScore` 同属官方体系
 *    （chartScore 等价于本模块的 vc 分支），二者不应再各自演化。
 */

// ---------- 基础工具 ----------

/** 数值强制转换：非有限数一律归 0（与 en() 等价） */
function num(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** 向上取整到 2 位小数（原站 ceil2，评分器全程使用） */
const ceil2 = (x) => Math.ceil(x * 100) / 100;

/** 四舍五入到 n 位小数（原站 Cf，仅 vc 公式使用） */
const roundTo = (x, n = 2) => {
  const f = 10 ** n;
  return Math.round(x * f) / f;
};

/** 展示用格式化：固定 2 位小数，非有限数回退 0.00（原站 n()） */
export function fmt2(v, digits = 2) {
  return Number.isFinite(v) ? v.toFixed(digits) : "0".padEnd(digits + 2, "0");
}

/** 取整（原站 t()） */
export function floorInt(v) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.floor(n) : 0;
}

// ---------- 常量表 ----------

/** 七个指标 + 各自的主题色（原站 S / k） */
export const METRICS = [
  { key: "view", label: "data.view", text: "text-blue-600 dark:text-blue-400", bg: "bg-blue-600 dark:bg-blue-400", hex: "#2563eb" },
  { key: "favorite", label: "data.favorite", text: "text-orange-600 dark:text-orange-400", bg: "bg-orange-600 dark:bg-orange-400", hex: "#ea580c" },
  { key: "coin", label: "data.coin", text: "text-yellow-600 dark:text-yellow-400", bg: "bg-yellow-600 dark:bg-yellow-400", hex: "#ca8a04" },
  { key: "like", label: "data.like", text: "text-rose-600 dark:text-rose-400", bg: "bg-rose-600 dark:bg-rose-400", hex: "#e11d48" },
  { key: "danmaku", label: "data.danmaku", text: "text-purple-600 dark:text-purple-400", bg: "bg-purple-600 dark:bg-purple-400", hex: "#9333ea" },
  { key: "reply", label: "data.reply", text: "text-cyan-600 dark:text-cyan-400", bg: "bg-cyan-600 dark:bg-cyan-400", hex: "#0891b2" },
  { key: "share", label: "data.share", text: "text-green-600 dark:text-green-400", bg: "bg-green-600 dark:bg-green-400", hex: "#16a34a" },
];

/** 规则（榜单）下拉项（原站 K / b）
 *  注：键名沿用原站语义，但本项目 i18n 的 nsSeparator 是 "."、keySeparator 为 false，
 *  所以键内不能再出现 "."，这里一律拍平（原站是 boards.vocaloid-daily 这类嵌套键）。 */
export const BOARDS = [
  { value: "vocaloid-daily", labelKey: "calculator.boardVocaloidDaily" },
  { value: "vocaloid-weekly", labelKey: "calculator.boardVocaloidWeekly" },
  { value: "vocaloid-monthly", labelKey: "calculator.boardVocaloidMonthly" },
  { value: "special", labelKey: "calculator.boardSpecial" },
  { value: "biliboard", labelKey: "calculator.boardBiliboard" },
  { value: "cat-weekly", labelKey: "calculator.boardCatWeekly" },
  { value: "vc", labelKey: "calculator.boardVc" },
];

/** 投稿类型下拉项（原站 L / C） */
export const COPYRIGHTS = [
  { value: 1, labelKey: "calculator.copyrightOriginal" },
  { value: 2, labelKey: "calculator.copyrightRepost" },
  { value: 3, labelKey: "calculator.copyrightUnknown" },
  { value: 101, labelKey: "calculator.copyrightRepostAsOriginal" },
  { value: 100, labelKey: "calculator.copyrightOriginalAsRepost" },
];

/** 有「期号」概念的规则（原站 u5） */
const HAS_ISSUE = new Set(["vocaloid-daily", "vocaloid-weekly", "vocaloid-monthly", "vocaloid-annual", "cover-weekly"]);

/** 需要展示 fixA~fixE 的规则（原站 k5 / b0） */
export const hasFix = (board) => HAS_ISSUE.has(board) || board === "special";

/** 是否需要「投稿」与「期号」（原站 N，本模块用 HAS_ISSUE） */
export const needsIssue = (board) => HAS_ISSUE.has(board);

/** 新曲窗口：7 天（原站 T） */
export const NEW_WINDOW = 7 * 86400;

// ---------- 评分器：日刊/周刊/月刊/年刊/特刊/总榜（原站 class v5） ----------

/**
 * @param {object} counts 七项指标 {view,favorite,coin,like,danmaku,reply,share}
 * @param {number} copyright 投稿类型
 * @param {{name:string}} meta 规则名（决定 viewR 与年度后处理）
 */
function scoreCalc(counts, copyright, meta) {
  const n = counts || {};
  const o = num(n.view);
  const c = num(n.favorite);
  let u = num(n.coin);
  const f = num(n.like);
  const p = num(n.danmaku);
  const g = num(n.reply);
  const y = num(n.share);

  // 自制判定：1 自制 / 3 未定 / 101 转载投自制 → 视作自制
  const b = [1, 3, 101].includes(num(copyright)) ? 1 : 2;

  // 硬币为 0 但有播放、收藏、点赞 → 视作 1（防止 fixA 直接归零）
  if (u === 0 && o > 0 && c > 0 && f > 0) u = 1;

  const out = { counts: n };

  // --- fixA：转载修正（无上限，最大 10） ---
  let fixA;
  if (u <= 0) {
    fixA = 0;
  } else if (b === 1) {
    fixA = 1;
  } else {
    const den = 150 * u + 50 * Math.max(0, p);
    fixA = den <= 0 ? 1 : ceil2(Math.min(10, Math.max(1, (o + 40 * c + 10 * f) / den)));
  }

  // --- fixB：电视修正（上限 1） ---
  const wB = o + 20 * c + 40 * f;
  let fixB = wB <= 0 ? 0 : ceil2(Math.min(1, Math.max(0, (300 * u * fixA + 10 * f) / wB)));

  // --- fixC：梗修正（上限 1） ---
  const rC = c + 5 * u * fixA;
  const fixC = rC <= 0
    ? 0
    : ceil2(Math.min(1, Math.max(0, (5 * u * fixA + 10 * Math.max(0, p) + 10 * Math.max(0, g) + 10 * Math.max(0, y)) / rC)));

  // --- fixD：评论修正（上限 1，20 次方衰减） ---
  let fixD;
  if (g <= 0) {
    fixD = 0;
  } else {
    const den = Math.max(1, c + f);
    fixD = ceil2(Math.min(1, Math.pow(den / (den + 0.1 * g), 20)));
  }

  // --- fixE：硬币修正（上限 1，平方） ---
  const fixE = u <= 0 ? 0 : ceil2(Math.min(1, Math.pow((o + u + 2 * f + 10 * y) / (10 * u), 2)));

  // --- fixTotal：fixB × fixC × fixE（整数百分比连乘） ---
  const kB = Math.round(fixB * 100);
  const kC = Math.round(fixC * 100);
  const kE = Math.round(fixE * 100);
  let fixTotal = Math.floor((kB * kC * kE) / 1e4) / 100;

  // --- 各项比率 ---
  const name = meta?.name;
  const dailyLike = name === "vocaloid-daily" || name === "vocaloid-weekly";
  const viewMul = dailyLike ? 10 : 15;

  let viewR = o <= 0
    ? 0
    : Math.max(ceil2(Math.min((Math.max(fixA * u + c, 0) * viewMul) / o, 1)), 0);
  const favoriteR = c <= 0
    ? 0
    : Math.max(ceil2(Math.min(((c + 2 * fixA * u) * 10) / (c * 10 + o) * 20, 20)), 0);
  const coinR = fixA * u * 40 + o <= 0
    ? 0
    : Math.max(ceil2(Math.min((fixA * u * 40) / (fixA * u * 20 + o) * 40, 40)), 0);
  const likeR = f <= 0
    ? 0
    : Math.max(ceil2(Math.min(5, (Math.max(fixA * u + c, 0) / (f * 20 + o)) * 100)), 0);

  const jD = Math.max(1, p, p + g);
  const danmakuR = p <= 0
    ? 0
    : Math.max(ceil2(Math.min(100, (20 * Math.max(0, g) + c + f) / jD)), 0);
  const replyR = g <= 0
    ? 0
    : Math.max(ceil2(Math.min(((400 * g + 10 * f + 10 * c) / (200 * g + o)) * 20, 40)), 0);
  const shareR = y <= 0
    ? 0
    : Math.max(ceil2(Math.min(((2 * fixA * u + c) / (5 * y + f)) * 10, 10)), 0);

  // --- 年刊 / 总榜后处理 ---
  let fB = fixB;
  let vR = viewR, faR = favoriteR, coR = coinR, liR = likeR, daR = danmakuR, reR = replyR, shR = shareR;
  if (name === "special" || name === "vocaloid-annual") {
    fB = ceil2(fixB * 0.5 + 0.5);
    const oB = Math.round(fB * 100);
    fixTotal = Math.floor((oB * kC * kE) / 1e4) / 100;
    vR = viewR / 2 + 0.5;
    faR = favoriteR / 2 + 10;
    coR = coinR / 2 + 20;
    liR = likeR / 2 + 2.5;
    reR = replyR / 2 + 20;
    shR = shareR / 2 + 5;
  }

  // --- 各分项得点 ---
  const viewP = o * vR;
  const favoriteP = c * faR;
  const coinP = u * coR * fixA;
  const likeP = f * liR;
  const danmakuP = p * daR;
  const replyP = g * reR * fixD;
  const shareP = y * shR;
  const basis = viewP + favoriteP + coinP + likeP + danmakuP + replyP + shareP;

  out.ratios = { view: vR, favorite: faR, coin: coR, like: liR, danmaku: daR, reply: reR, share: shR };
  out.fixes = { a: fixA, b: fB, c: fixC, d: fixD, e: fixE, fix_total: fixTotal };
  out.points = {
    view: viewP, favorite: favoriteP, coin: coinP, like: likeP,
    danmaku: danmakuP, reply: replyP, share: shareP,
    basis,
    total: Math.round(fixTotal * basis),
  };
  return out;
}

// ---------- Bili_Board（原站 x5） ----------

function biliboardScore(counts, timeOffset) {
  const t = timeOffset ?? -1;
  // 时间偏移越大系数越高：t<0 视为 1
  const s = t < 0 ? 1 : Math.round((Math.log10(Math.exp(t / 24 / 60 / 60) / 14 + 1) + 1) * 100) / 100;
  const n = counts || {};
  const viewP = num(n.view) * s;
  const favoriteP = num(n.favorite) * 15;
  const coinP = num(n.coin) * 30;
  const likeP = num(n.like) * 3;
  const basis = viewP + favoriteP + coinP + likeP;
  return {
    counts: n,
    ratios: { view: s, favorite: 15, coin: 30, like: 3, danmaku: 0, reply: 0, share: 0 },
    fixes: { a: 1, b: 1, c: 1, d: 1, e: 1, fix_total: 1 },
    points: { view: viewP, favorite: favoriteP, coin: coinP, like: likeP, danmaku: 0, reply: 0, share: 0, basis, total: basis },
  };
}

// ---------- 中文周刊 vc（原站 w5） ----------

function vcScore(counts) {
  const n = counts || {};
  const view = num(n.view), reply = num(n.reply), danmaku = num(n.danmaku);
  const like = num(n.like), favorite = num(n.favorite), coin = num(n.coin);

  const basePlay = view > 1e4 ? view * 0.5 + 5000 : view;
  const fixA = ((basePlay + favorite) / (basePlay + favorite + (danmaku + reply) * 20)) ** 2;
  const fixB = roundTo(Math.min(favorite > coin * 2 ? (coin ** 2) / (view * favorite) * 1e3 : (favorite / view) * 250, 50));
  const fixC = roundTo(Math.min(coin > favorite ? (favorite ** 2) / (view * coin) * 250 : (coin / view) * 250, 50));
  const fixD = roundTo(Math.min((Math.min(favorite, coin) / view) * 25, 1));

  const viewP = basePlay * fixD;
  const favoriteP = favorite * fixB;
  const coinP = coin * fixC;
  const likeP = Math.min(like, coin * 2);
  const danmakuP = danmaku * fixA * 15;
  const replyP = reply * fixA * 15;
  const basis = viewP + favoriteP + coinP + likeP + danmakuP + replyP;

  return {
    counts: n,
    ratios: {
      view: (basePlay * fixD) / view,
      favorite: fixB, coin: fixC, like: likeP / like,
      danmaku: fixA * 15, reply: fixA * 15, share: 0,
    },
    fixes: { a: 1, b: 1, c: 1, d: 1, e: 1, fix_total: 1 },
    points: { view: viewP, favorite: favoriteP, coin: coinP, like: likeP, danmaku: danmakuP, reply: replyP, share: 0, basis, total: basis },
  };
}

// ---------- 记录猫周榜 cat-weekly（原站 S5） ----------

function catWeeklyScore(counts) {
  const n = counts || {};
  const viewP = num(n.view) * 0.5;
  const favoriteP = num(n.favorite) * 15;
  const coinP = num(n.coin) * 10;
  const likeP = num(n.like) * 5;
  const danmakuP = num(n.danmaku) * 1.5;
  const replyP = num(n.reply) * 1.5;
  const basis = viewP + favoriteP + coinP + likeP + danmakuP + replyP;
  return {
    counts: n,
    ratios: { view: 0.5, favorite: 15, coin: 10, like: 5, danmaku: 1.5, reply: 1.5, share: 0 },
    fixes: { a: 1, b: 1, c: 1, d: 1, e: 1, fix_total: 1 },
    points: { view: viewP, favorite: favoriteP, coin: coinP, like: likeP, danmaku: danmakuP, reply: replyP, share: 0, basis, total: basis },
  };
}

// ---------- 调度（原站 xz / a4） ----------

/**
 * 计算某规则下的得分明细。
 * @param {object} counts 七项指标
 * @param {{board:string, copyright?:number, issue?:number, timeOffset?:number}} opts
 * @returns {{counts:object, ratios:object, fixes:object, points:object}}
 */
export function computeScore(counts, opts = {}) {
  const { board, copyright = 1, issue = 1, timeOffset = -1 } = opts;
  if (board === "biliboard") return biliboardScore(counts, timeOffset);
  if (board === "special") return scoreCalc(counts, copyright, { name: "special" });
  if (HAS_ISSUE.has(board)) return scoreCalc(counts, copyright, { name: board });
  if (board === "vc") return vcScore(counts);
  return catWeeklyScore(counts);
}
