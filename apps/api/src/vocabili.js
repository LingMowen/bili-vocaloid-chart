// 重要（2026-09-27 实测）：该 API 的**历史期号不生效** ——
// `/ranking/{board}/{part}/{issue}` 传任何 issue 都返回**最新一期**（返回条目里的 issue 字段恒为 latest）。
// 用 curl 与「页面内 fetch（带浏览器 cookie/同源头）」两种方式交叉验证过，结果一致；
// 带不带 `seperate=false` 也一样。历史期相关的 milestones 等接口返回 401（需登录）。
// ⇒ 只能取「各榜最新一期」，不要按 1..latest 批量遍历（那只会把同一份数据重复抓 N 遍）。
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
// 请求间隔（毫秒）。全历史批量同步时调大（默认 800ms），日常增量可保持默认。
let THROTTLE_MS = Number(process.env.VOCABILI_THROTTLE_MS || 250);
function setThrottle(ms) {
  THROTTLE_MS = Math.max(0, Number(ms) || 0);
  return THROTTLE_MS;
}
async function throttle(ms) {
  const gap = ms == null ? THROTTLE_MS : ms;
  const now = Date.now();
  const wait = lastReqAt + gap - now;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastReqAt = Date.now();
}

async function getJSON(path, retries = 3) {
  for (let attempt = 0; ; attempt++) {
    await throttle();
    try {
      const res = await fetch(BASE + path, {
        headers: { Accept: "application/json", "User-Agent": "bili-vocaloid-chart/1.0" },
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
  // seperate=false 与前端请求保持一致（实测加不加都一样：见下方「历史期不可用」说明）
  const path = `/ranking/${BOARDS[board]}/${part}/${issue}?page=${page}&page_size=${pageSize}&order_type=${orderType}&seperate=false`;
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
  setThrottle,
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
