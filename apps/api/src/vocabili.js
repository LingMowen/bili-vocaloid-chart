const BASE = "https://api.vocabili.top/v3";

const BOARDS = {
  daily: "vocaloid-daily",
  weekly: "vocaloid-weekly",
  monthly: "vocaloid-monthly",
  annual: "vocaloid-annual",
};

// vocabili 榜单期号（latest_issue 实测 daily=770 / weekly=101 / monthly=25）
const MIN_ISSUE = { daily: 1, weekly: 1, monthly: 1 };

let lastReqAt = 0;
async function throttle(ms = 250) {
  const now = Date.now();
  const wait = lastReqAt + ms - now;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastReqAt = Date.now();
}

async function getJSON(path, retries = 3) {
  for (let attempt = 0; ; attempt++) {
    await throttle();
    try {
      const res = await fetch(BASE + path, {
        headers: { Accept: "application/json", "User-Agent": "xngschina/1.0" },
      });
      if (res.status === 429) {
        const backoff = 2000 * Math.pow(2, attempt);
        console.warn(`[vocabili] 429, 冷却 ${backoff}ms -> ${path}`);
        if (attempt >= retries) throw new Error(`vocabili 429 for ${path}`);
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      if (!res.ok) throw new Error(`vocabili ${res.status} for ${path}`);
      const body = await res.json();
      if (body && typeof body === "object" && "data" in body) return body;
      return body;
    } catch (e) {
      if (attempt >= retries) throw e;
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
    }
  }
}

function pageSize(path) {
  const q = path.split("?")[1] || "";
  const m = /page_size=(\d+)/.exec(q);
  return m ? Number(m[1]) : 20;
}

async function latestIssue(board) {
  const res = await getJSON(`/ranking/${BOARDS[board]}/latest_issue`);
  return res?.data ?? null;
}

async function parts(board, issue) {
  const res = await getJSON(`/ranking/${BOARDS[board]}/${issue}/parts`);
  return (res?.parts || []).filter(Boolean);
}

async function ranking(board, issue, page = 1, pageSize = 20, part = "main", orderType = "point") {
  const path = `/ranking/${BOARDS[board]}/${part}/${issue}?page=${page}&page_size=${pageSize}&order_type=${orderType}`;
  const res = await getJSON(path);
  return res?.data || [];
}

async function rankingTotal(board, issue) {
  const res = await getJSON(`/ranking/${BOARDS[board]}/main/${issue}?page=1&page_size=20`);
  return res?.total ?? null;
}

async function songList(page = 1, pageSize = 20) {
  const path = `/song/list?page=${page}&page_size=${pageSize}&order_by=view&order=desc`;
  const res = await getJSON(path);
  return { data: res?.data || [], total: res?.total ?? 0 };
}

async function songDetail(id) {
  const res = await getJSON(`/song/${id}`);
  return res?.data ?? null;
}

async function songRanking(id, board) {
  const path = `/song/ranking?id=${id}&board=${BOARDS[board] || "vocaloid-daily"}`;
  const res = await getJSON(path);
  return res?.data ?? null;
}

async function vocalist(id) {
  const res = await getJSON(`/vocalist/${id}`);
  return res?.data ?? null;
}

async function vocalistSummary(id) {
  const res = await getJSON(`/vocalist/${id}/stats/summary`);
  return res?.data ?? null;
}

async function vocalistSongs(id, kind, limit = 10) {
  const res = await getJSON(`/vocalist/${id}/stats/${kind === "latest" ? "latest-songs" : "top-songs"}?limit=${limit}`);
  return res?.data ?? [];
}

async function vocalistSynthesizers(id, limit = 10) {
  const res = await getJSON(`/vocalist/${id}/stats/synthesizers?limit=${limit}`);
  return res?.data ?? [];
}

async function vocalistProducers(id, limit = 20) {
  const res = await getJSON(`/vocalist/${id}/stats/producers?limit=${limit}`);
  return res?.data ?? [];
}

module.exports = {
  BASE,
  BOARDS,
  MIN_ISSUE,
  getJSON,
  throttle,
  latestIssue,
  parts,
  ranking,
  rankingTotal,
  songList,
  songDetail,
  songRanking,
  vocalist,
  vocalistSummary,
  vocalistSongs,
  vocalistSynthesizers,
  vocalistProducers,
};
