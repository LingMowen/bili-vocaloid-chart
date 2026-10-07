// 审核前的对等拉取同步（pullRound）。
//
// 用户口径（2026-10-07）：每 2 小时（北京偶数整点）审核一次，**审核前先做一次数据同步，
// 同步完成才开启审核**；同步不挂在 5 分钟高频任务上。
//
// 为什么能双向：本地在 NAT 后、云端拉不到本地的问题，已由 Cloudflare 隧道解决
// （本地 API 经 https://sync.ciallo.ltd 暴露，云端实测 200 可达、无令牌 401）。
// 于是两端各跑一次「拉取型同步」即完成互补：
//   我拉对端 manifest -> 算我缺的 aid -> 从对端 items 取整条 -> 本地 ingest（并集+换内存）。
// 本地在偶数整点跑，云端错峰 +150s 再跑 —— 云端拉到的已是本地同步后的库，两边收敛。
//
// 失败策略：对端不可达（本地关机 / 隧道断）时返回 ok:false 并继续审核，不阻塞。
// 同步是「补齐」不是「前置条件」：审核对自己库里已有的条目判定正确，与对端是否在线无关。
const config = require("./config");
const collector = require("./collector");
const statHistory = require("./statHistory");
const syncIngest = require("./syncIngest");

const FETCH_TIMEOUT_MS = 60 * 1000;
const ITEMS_BATCH = 400; // 与 /api/sync/items 的 MAX_ITEMS(5000) 留足余量

async function peerFetch(peer, path, init = {}) {
  const url = peer.replace(/\/+$/, "") + path;
  const res = await fetch(url, {
    ...init,
    headers: { "x-sync-token": config.syncToken, ...(init.headers || {}) },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.ok === false) {
    throw new Error(`${path} -> HTTP ${res.status} ${j.message || ""}`.trim());
  }
  return j.data;
}

async function pullRound() {
  const peer = config.syncPeerApi;
  if (!peer || !config.syncToken) {
    return { ok: false, skipped: true, reason: "未配置 SYNC_PEER_API / SYNC_TOKEN" };
  }
  const started = Date.now();
  try {
    const man = await peerFetch(peer, "/api/sync/manifest");
    const peerAids = new Set(man.items.map((it) => String(it.aid)));
    const local = await collector.getLibrary();
    const have = new Set((local || []).map((it) => String(it.aid)));
    const missing = [...peerAids].filter((a) => !have.has(a));
    let pulled = 0;
    let ingestRes = null;
    for (let i = 0; i < missing.length; i += ITEMS_BATCH) {
      const batch = missing.slice(i, i + ITEMS_BATCH);
      const d = await peerFetch(peer, "/api/sync/items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ aids: batch.map(Number) }),
      });
      const r = await syncIngest.ingestLibrary(d.items);
      if (!r.ok) throw new Error("ingest 失败: " + r.reason);
      pulled += r.added;
      ingestRes = r;
    }
    // 历史统计快照（stat_daily）：拉近 7 天（覆盖周榜窗口），按 aid 并集合并。
    // 为什么也要同步：对端独有新歌在本端历史快照里没有基线，增量榜会把它当
    // 「窗口内新歌」漏算历史增量。合并语义复用 syncIngest.mergeSnapshot（view 取大）。
    let snapMerged = 0;
    try {
      const dates = statHistory.listSnapshotDates().slice(-7);
      for (const d of dates) {
        let peerSnap = null;
        try {
          peerSnap = await peerFetch(peer, `/api/sync/snapshot/${d}`);
        } catch (e) {
          continue; // 对端没有该日快照，跳过
        }
        if (peerSnap && typeof peerSnap === "object") {
          const r = syncIngest.mergeSnapshot(d, peerSnap);
          if (r.ok) snapMerged += r.added + r.updated;
        }
      }
    } catch (e) {
      console.error(`[syncRound] 快照同步失败（不影响库同步结果）: ${e.message}`);
    }
    return {
      ok: true,
      peerTotal: man.total,
      missing: missing.length,
      pulled,
      snapMerged,
      localTotal: ingestRes ? ingestRes.total : have.size,
      ms: Date.now() - started,
    };
  } catch (e) {
    return { ok: false, reason: e.message, ms: Date.now() - started };
  }
}

module.exports = { pullRound };
