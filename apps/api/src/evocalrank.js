// evocalrank.com 周刊虚拟歌手中文曲排行榜：拉取全部榜单期数的视频链接作为采集候选源
const BASE = "https://www.evocalrank.com";

const RANK_LISTS = [
  "main_rank",
  "second_rank",
  "super_hit",
  "pick_up",
  "oth_pickup",
  "history-1-year",
  "history-10-year",
  "ed",
  "op",
];

let lastReqAt = 0;
async function throttle(ms = 400) {
  const now = Date.now();
  const wait = lastReqAt + ms - now;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastReqAt = Date.now();
}

async function getJSON(path) {
  await throttle();
  const res = await fetch(BASE + path, {
    headers: { "User-Agent": "xngschina/1.0", Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`evocalrank ${res.status} for ${path}`);
  return res.json();
}

// 拉取 info.json 里的期号列表
async function fetchPeriodList() {
  const info = await getJSON("/data/info/info.json");
  return info?.rank_list || [];
}

// 拉取某一期的所有视频条目
async function fetchPeriod(rankNum) {
  const d = await getJSON(`/data/rank_data/${rankNum}.json`);
  const out = [];
  for (const listName of RANK_LISTS) {
    const arr = d?.[listName] || [];
    for (const it of arr) {
      if (!it || !it.avid) continue;
      out.push({
        avid: String(it.avid).replace(/^av/, ""),
        bvid: it.bvid || "",
        title: it.title || "",
        rank: it.rank,
        listName,
        rankNum,
      });
    }
  }
  return out;
}

// 每期的统计口径：evocalrank 按周收集，main_rank / second_rank 中的
// play/favorite/coin/comment/danmaku/like/share 为该周内增量（非累计）。
const STAT_KEYS = ["play", "favorite", "coin", "comment", "danmaku", "like", "share"];
const INCREMENT_LISTS = ["main_rank", "second_rank"];

// 拉取某一期的数值（仅上榜 top110：主榜 30 + 副榜 80），不用官方 point 分数。
// 返回 { rankNum, pubdate, generate, collectStart, collectEnd, items: { aid: {play,favorite,...} } }
async function fetchPeriodStats(rankNum) {
  const d = await getJSON(`/data/rank_data/${rankNum}.json`);
  const items = {};
  for (const listName of INCREMENT_LISTS) {
    for (const it of d?.[listName] || []) {
      if (!it || !it.avid) continue;
      const aid = String(it.avid).replace(/^av/, "");
      const stat = {};
      for (const k of STAT_KEYS) stat[k] = Number(it[k]) || 0;
      items[aid] = stat;
    }
  }
  return {
    rankNum: d?.ranknum ?? rankNum,
    pubdate: d?.pubdate || "",
    generate: d?.generate_time || "",
    collectStart: d?.collect_start_time || "",
    collectEnd: d?.collect_end_time || "",
    items,
  };
}

// 收集所有期的视频链接（去重）。返回 [{ avid, title, rank, rankNum }]
async function collectAllAids(onProgress) {
  const periods = await fetchPeriodList();
  const seen = new Map();
  let count = 0;
  for (const p of periods) {
    try {
      const rows = await fetchPeriod(p.rank_num);
      for (const r of rows) {
        if (!seen.has(r.avid)) {
          seen.set(r.avid, r);
        }
      }
      count++;
      if (onProgress && count % 20 === 0) {
        onProgress(count, periods.length, seen.size);
      }
    } catch (e) {
      console.error(`[evocalrank] 第 ${p.rank_num} 期拉取失败: ${e.message}`);
    }
  }
  return [...seen.values()];
}

module.exports = {
  BASE,
  fetchPeriodList,
  fetchPeriod,
  collectAllAids,
  fetchPeriodStats,
  STAT_KEYS,
};
