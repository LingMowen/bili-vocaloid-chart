const ORDER_KEYS = ["score", "view", "favorite", "coin", "like", "danmaku", "reply", "share"];

const WEIGHTS = {
  view: 1.0,
  favorite: 4.0,
  coin: 5.0,
  like: 2.0,
  danmaku: 1.0,
  reply: 1.5,
  share: 3.0,
};

const NEW_WINDOW = 7 * 86400;

function compositeScore(stat, weights) {
  const w = weights || WEIGHTS;
  return Object.entries(w).reduce((sum, [k, v]) => sum + (Number(stat[k]) || 0) * v, 0) | 0;
}

const round2 = (x) => Math.round(x * 100) / 100;

// 周刊虚拟歌姬中文曲排行榜 官方评分公式（输入为周期内增量 stat）
// 最终得点 = 播放得点 + 互动得点 + 收藏得点 + 硬币得点 + 点赞得点
function chartScore(stat) {
  const view = Number(stat.view) || 0;           // 播放
  const favorite = Number(stat.favorite) || 0;   // 收藏
  const coin = Number(stat.coin) || 0;           // 硬币
  const like = Number(stat.like) || 0;           // 点赞
  const danmaku = Number(stat.danmaku) || 0;     // 弹幕
  const reply = Number(stat.reply) || 0;         // 评论

  // 基础播放得点：播放 > 10000 时线性衰减
  const basePlay = view > 10000 ? view * 0.5 + 5000 : view;

  // 修正A（无上限）：(基础播放得点+收藏) / (基础播放得点+收藏+(弹幕+评论)×20)，取平方
  const denomA = basePlay + favorite + (danmaku + reply) * 20;
  const adjA = round2(denomA > 0 ? Math.pow((basePlay + favorite) / denomA, 2) : 1);

  // 修正B（最大 50）
  let adjB;
  if (favorite > coin * 2) {
    adjB = view > 0 && favorite > 0 ? ((coin * coin) / (view * favorite)) * 1000 : 0;
  } else {
    adjB = view > 0 ? (favorite / view) * 250 : 0;
  }
  adjB = round2(Math.min(50, Math.max(0, adjB)));

  // 修正C（最大 50）
  let adjC;
  if (coin > favorite) {
    adjC = view > 0 && coin > 0 ? ((favorite * favorite) / (view * coin)) * 250 : 0;
  } else {
    adjC = view > 0 ? (coin / view) * 250 : 0;
  }
  adjC = round2(Math.min(50, Math.max(0, adjC)));

  // 修正D（最大 1）
  let adjD;
  if (favorite > coin) {
    adjD = view > 0 ? (coin / view) * 25 : 0;
  } else {
    adjD = view > 0 ? (favorite / view) * 25 : 0;
  }
  adjD = round2(Math.min(1, Math.max(0, adjD)));

  // 各分项得点
  const playPt = basePlay * adjD;                       // 播放得点
  const interPt = (reply + danmaku) * adjA * 15;        // 互动得点
  const favPt = favorite * adjB;                        // 收藏得点
  const coinPt = coin * adjC;                           // 硬币得点
  const likePt = Math.min(like, coin * 2);              // 点赞得点（上限硬币×2）

  return Math.round(playPt + interPt + favPt + coinPt + likePt);
}

function attachRanks(items, fields) {
  for (const f of fields) {
    const order = items
      .map((it, i) => [i, Number(it[f]) || 0])
      .sort((a, b) => b[1] - a[1])
      .map(([i]) => i);
    order.forEach((idx, pos) => {
      items[idx][`rank_${f}`] = pos + 1;
    });
  }
}

function isNew(item, now) {
  const pub = item.pubdate || 0;
  return now - NEW_WINDOW <= pub && pub <= now;
}

function classifyLang(text) {
  const t = String(text || "");
  let han = 0, kana = 0, latin = 0;
  for (const ch of t) {
    const cp = ch.codePointAt(0);
    if (cp >= 0x4e00 && cp <= 0x9fff) han++;
    else if (cp >= 0x3040 && cp <= 0x30ff) kana++;
    else if (/[a-zA-Z]/.test(ch)) latin++;
  }
  const total = han + kana + latin;
  if (total === 0) return "other";
  if (kana && kana * 2 >= han) return "jp";
  if (han === 0 && latin >= total * 0.5) return "en";
  if (han && han >= Math.max(kana, latin * 0.6)) return "cn";
  return "other";
}

const LANG_NAMES = { cn: "中文", jp: "日语", en: "英语", other: "其他" };

function stripHtml(s) {
  return String(s || "").replace(/<[^>]*>/g, "");
}

module.exports = {
  ORDER_KEYS,
  WEIGHTS,
  NEW_WINDOW,
  compositeScore,
  chartScore,
  attachRanks,
  isNew,
  classifyLang,
  LANG_NAMES,
  stripHtml,
};
