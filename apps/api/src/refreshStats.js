// 数据刷新 + 统分（5 分钟调度）
//
// 职责边界（与 collectAll 严格分离）：
//   - **只刷新库内已有条目**的 stat（播放/点赞/投币/收藏/分享/评论/弹幕）与 score，
//     绝不新增收录；新增新曲只由 collectAll（2 小时调度）负责。
//   - 刷新后补写当日 stat_daily 快照，使榜单「当前值」保持最新（增量 = 当前值 - 期初快照）。
//
// 设计要点：
//   1. 单条只发 1 次请求（bili.stat → /x/web-interface/view），不用 bili.video（后者内部
//      还会拉 tags + pages，每条目 3 请求，5 分钟刷不动）；
//   2. 请求全部经过 bili.call() 的全局串行节流闸门（150ms），与采集/审核共用，避免风控；
//   3. 单条失败不影响整体，只累计 errors（B 站稿件删除/限流属正常抖动）；
//   4. 落盘用 collector.writeDiskKeepTs()，保留原 ts —— 否则会刷新"采集新鲜度"信号，
//      让 collectAll 误判库仍新鲜而跳过收录（曾导致 delta 恒 0、榜单为空）；
//   5. 每批（默认 300 条）中途落盘一次，进程被杀只丢最后一批，不会整轮白干；
//   6. 单条 stat/score 与 collector.buildItem() 的入库口径完全一致（compositeScore + WEIGHTS、
//      stat 平铺、pubdate 秒级），避免刷新后与收录时打分规则漂移；
//   7. 单轮有时间预算（默认 4 分钟）+ 条数上限，保证 5 分钟调度不会自我重叠；
//      每轮挑「最久未刷新」的一批（lastRefreshAt 升序），靠多轮滚动覆盖全库。

const collector = require("./collector");
const score = require("./score");
const statHistory = require("./statHistory");
const progress = require("./progress");
const bili = require("./bili");
const services = require("./services");

const BATCH_SIZE = 300;
const ROUND_LIMIT = 900;
const TIME_BUDGET_MS = 4 * 60 * 1000;

let _busy = false;
function isBusy() {
  return _busy;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// 挑选本轮要刷新的条目：按 lastRefreshAt 升序（从未刷过的排最前）。
// 这样即使每轮只刷一部分，也能保证全库在若干轮内被均匀覆盖，不会总刷同一批。
function pickTargets(data, limit) {
  const arr = (data || []).filter((it) => it && it.aid);
  arr.sort((a, b) => (a.lastRefreshAt || 0) - (b.lastRefreshAt || 0));
  return arr.slice(0, limit);
}

// 把接口返回的 stat 写回条目，口径对齐 collector.buildItem()：
// stat 平铺到条目顶层 + score 用 compositeScore(WEIGHTS) + pubdate 保持秒级。
function applyStat(it, data) {
  const st = data.stat || {};
  const stat = {
    view: st.view || 0,
    danmaku: st.danmaku || 0,
    favorite: st.favorite || 0,
    coin: st.coin || 0,
    like: st.like || 0,
    reply: st.reply || 0,
    share: st.share || 0,
  };
  Object.assign(it, stat);
  it.score = score.compositeScore(stat, score.WEIGHTS);
  // 详情补齐：收录时来自搜索/排行榜的候选可能缺 bvid/duration/pubdate
  if (!it.bvid && data.bvid) it.bvid = data.bvid;
  if (!it.duration && data.duration) it.duration = data.duration;
  if (!it.pubdate && data.pubdate) it.pubdate = data.pubdate; // 秒级，不乘 1000
  it.lastRefreshAt = Date.now();
}

/**
 * 刷新库内已有条目的 stat 并重新统分。
 * @param {{limit?:number, emit?:boolean}} opts
 * @returns {Promise<{ok:boolean, reason?:string, total:number, targets:number, refreshed:number, errors:number, ms:number}>}
 */
async function refreshStats({ limit = ROUND_LIMIT, emit = true } = {}) {
  if (_busy) return { ok: false, reason: "busy", total: 0, targets: 0, refreshed: 0, errors: 0, ms: 0 };
  _busy = true;
  const started = Date.now();
  // 手动全量刷新（limit=Infinity）放宽时间预算到 30 分钟；常规 5 分钟调度轮保持 4 分钟预算
  const budget = limit === Infinity ? 30 * 60 * 1000 : TIME_BUDGET_MS;

  const fail = (reason, total = 0) => {
    _busy = false;
    return { ok: false, reason, total, targets: 0, refreshed: 0, errors: 0, ms: Date.now() - started };
  };

  const disk = collector.readDisk();
  if (!disk || !Array.isArray(disk.data) || !disk.data.length) return fail("empty");

  const data = disk.data;
  const targets = pickTargets(data, limit);
  let refreshed = 0;
  let errors = 0;
  let truncated = false;

  if (emit) {
    progress.setRefreshState({ running: true, total: data.length, targets: targets.length, done: 0, errors: 0, startedAt: started });
    progress.emit("stage:detail", { stage: "refresh", msg: `开始刷新 ${targets.length} 条（库存 ${data.length}）` });
  }

  for (const batch of chunk(targets, BATCH_SIZE)) {
    for (const it of batch) {
      // 时间预算：5 分钟调度内必须收尾，超出就把剩余条目留给下一轮
      if (Date.now() - started > budget) {
        truncated = true;
        break;
      }
      try {
        const r = await bili.stat(it.aid);
        if (r?.ok && r.data) {
          applyStat(it, r.data);
          refreshed++;
        } else {
          errors++;
        }
      } catch (e) {
        errors++;
      }
      if (emit && (refreshed + errors) % 50 === 0) {
        progress.setRefreshState({ done: refreshed, errors });
      }
    }
    // 分批落盘：保留原 ts，complete 继承磁盘现值。
    // 必须走 mergeRefreshWrite（以磁盘最新为底稿叠加本轮刷新项）：若期间同步摄入端点
    // 往库里加了新 aid，直接写回本函数开头读到的数组会把刚摄入的新歌静默抹掉。
    try {
      collector.mergeRefreshWrite(data, disk.complete === true);
      if (emit) {
        progress.emit("stage:detail", { stage: "refresh", msg: `已刷新 ${refreshed} 条并落盘（失败 ${errors}）` });
      }
    } catch (e) {
      console.error(`[refreshStats] 落盘失败: ${e.message}`);
    }
    if (truncated) break;
  }

  // 补写当日快照：榜单增量 = 当前值 - 期初快照，当前值必须是最新的
  let snapKey = null;
  try {
    snapKey = statHistory.saveDailySnapshot(data);
  } catch (e) {
    console.error(`[refreshStats] 写快照失败: ${e.message}`);
  }

  const ms = Date.now() - started;
  console.log(
    `[refreshStats] 刷新完成：目标 ${targets.length} / 库存 ${data.length}，成功 ${refreshed}，失败 ${errors}，耗时 ${(ms / 1000).toFixed(1)}s${truncated ? "（触及时间预算，剩余留给下轮）" : ""}`,
  );
  if (emit) {
    progress.setRefreshState({
      running: false,
      done: refreshed,
      errors,
      snapshot: snapKey,
      ms,
      endedAt: Date.now(),
      truncated,
    });
    progress.emit("stage:detail", {
      stage: "refresh",
      msg: `刷新完成：成功 ${refreshed}，失败 ${errors}，耗时 ${(ms / 1000).toFixed(1)}s`,
    });
  }

  // 刷新后强制派生数据（榜单/统计/歌手）读新库 —— 5 分钟调度与手动触发都依赖此句
  try {
    services.loadLibrary(true);
  } catch (e) {
    console.error(`[refreshStats] 派生缓存失效失败: ${e.message}`);
  }

  _busy = false;
  return { ok: true, total: data.length, targets: targets.length, refreshed, errors, ms };
}

module.exports = { refreshStats, isBusy, ROUND_LIMIT, TIME_BUDGET_MS };
