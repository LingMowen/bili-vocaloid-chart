const fs = require("node:fs");
const path = require("node:path");
const { EventEmitter } = require("node:events");

const CACHE_DIR = path.join(__dirname, "..", "cache");
const HISTORY_FILE = path.join(CACHE_DIR, "progress_history.json");

const bus = new EventEmitter();
bus.setMaxListeners(0);

const cycles = []; // 内存中保留本次运行所有周期（含进行中）
const eventBuffers = new Map(); // cycleId -> events[]（最近 10000 条，给重连补帧用）
const MAX_BUFFER = 10000;

let currentCycle = null;

// ---- 独立后台审核 worker 的全局状态（不绑定采集周期）----
let reviewState = null; // { pending, done, kept, dropped, running, updatedAt } 或 null(未启动)

// 更新审核队列状态（每条审核进度回调）；running=true 表示本轮正在处理
function setReviewState(partial) {
  reviewState = { ...(reviewState || {}), ...partial, updatedAt: Date.now() };
  bus.emit("review:update", { ...reviewState });
}

function getReviewState() {
  return reviewState ? { ...reviewState } : null;
}

function newCycle(kind /* "incremental" | "full" | "auto" */) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const cycle = {
    id,
    kind,
    startedAt: Date.now(),
    endedAt: null,
    stages: {}, // 各阶段状态：{ total, done, label, ... }
    stats: { candidates: 0, kept: 0, aiPass: 0, aiReject: 0, aiCacheHit: 0, aiApiCalls: 0, errors: 0 },
    error: null,
  };
  currentCycle = cycle;
  cycles.unshift(cycle);
  eventBuffers.set(id, []);
  bus.emit("cycle:start", snapshotCycle(cycle));
  return cycle;
}

function snapshotCycle(c) {
  return {
    id: c.id,
    kind: c.kind,
    startedAt: c.startedAt,
    endedAt: c.endedAt,
    stages: { ...c.stages },
    stats: { ...c.stats },
    error: c.error,
  };
}

// emit 一个事件到当前周期 + 总线
// 注意：后台独立 worker（AI审核/简介补齐/AI关联补全）可能在无采集周期时空闲运行，
// 因此无 currentCycle 时也要广播到总线（cycleId 置 null），否则进度页事件流收不到这些日志。
function emit(type, data) {
  const evt = { ts: Date.now(), type, data };
  const cycleId = currentCycle ? currentCycle.id : null;
  if (currentCycle) {
    const buf = eventBuffers.get(currentCycle.id);
    if (buf) {
      buf.push(evt);
      if (buf.length > MAX_BUFFER) buf.splice(0, buf.length - MAX_BUFFER);
    }
  }
  bus.emit("event", { cycleId, ...evt });
}

// 阶段更新：用于进度条渲染
function updateStage(stage, partial) {
  if (!currentCycle) return;
  currentCycle.stages[stage] = { ...currentCycle.stages[stage], ...partial, stage };
  bus.emit("stage:update", { cycleId: currentCycle.id, stage: currentCycle.stages[stage] });
}

// 累加统计
function bumpStat(key, n = 1) {
  if (!currentCycle) return;
  currentCycle.stats[key] = (currentCycle.stats[key] || 0) + n;
}

function endCycle(error = null) {
  if (!currentCycle || currentCycle.endedAt) return;
  currentCycle.endedAt = Date.now();
  currentCycle.error = error;
  const summary = {
    ...snapshotCycle(currentCycle),
    durationMs: currentCycle.endedAt - currentCycle.startedAt,
  };
  bus.emit("cycle:end", summary);
  persistHistory(summary);
  currentCycle = null;
}

function persistHistory(summary) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  let arr = [];
  try {
    arr = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8")) || [];
  } catch (e) {}
  arr.unshift(summary);
  if (arr.length > 100) arr = arr.slice(0, 100);
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(arr, null, 1), "utf8");
  } catch (e) {
    console.error("[progress] 写历史失败:", e.message);
  }
}

function listHistory() {
  try {
    return JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8")) || [];
  } catch (e) {
    return [];
  }
}

function getCurrentCycle() {
  return currentCycle ? snapshotCycle(currentCycle) : null;
}

function getRecentEvents(cycleId, sinceTs = 0) {
  const buf = eventBuffers.get(cycleId);
  if (!buf) return [];
  return buf.filter((e) => e.ts > sinceTs);
}

function listCycles() {
  return cycles.map(snapshotCycle);
}

module.exports = {
  bus,
  newCycle,
  emit,
  updateStage,
  bumpStat,
  endCycle,
  listHistory,
  getCurrentCycle,
  getRecentEvents,
  listCycles,
  setReviewState,
  getReviewState,
};
