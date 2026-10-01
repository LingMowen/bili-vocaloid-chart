// 待抓队列（pending pool）：**外部发现源看到、但本站 B 站采集尚未收录**的视频。
//
// 为什么要这个队列（用户口径）：
//   外部发现源（当前 = vocabili 日刊）只用来「发现」缺失的视频，**不是长期数据来源**。
//   第一轮 B 站采集如果因为候选池没覆盖到而漏掉某首歌，那么**下一轮 B 站采集必须能抓到它**，
//   而不是长期靠外部站点的数值顶着。
//
// 因此：
//   1. 外部源每看到一条库内没有的 bvid → 入队（只在库里查不到时入队，天然幂等，**不重复抓同一个数据**）；
//   2. collector 每轮采集把队列里的 aid **直接注入候选**（绕过分区/UP 池的覆盖限制）；
//   3. 采集结束后回写：收录成功 → 出队；内容层面不合规 → 归档且不再重试；
//      请求层失败（网络/风控）→ 保留并累加 attempts，下轮再试；
//   4. 累加超过 MAX_ATTEMPTS 仍失败 → 归档为 exhausted，停止重试（**避免无限重试白耗配额**）。
//
// 落盘：
//   cache/pending_bvids.json  当前队列
//   cache/pending_archive.json 已收敛（rejected / gone / exhausted）的条目，仅作审计
const fs = require("node:fs");
const path = require("node:path");
const { bv2av, isBvid } = require("./bv");

const CACHE_DIR = path.join(__dirname, "..", "cache");
const POOL_FILE = path.join(CACHE_DIR, "pending_bvids.json");
const ARCHIVE_FILE = path.join(CACHE_DIR, "pending_archive.json");

// 同一目标最多重试次数（仅针对「请求层失败」；内容层判定为终局，一次即收敛）
const MAX_ATTEMPTS = Number(process.env.PENDING_MAX_ATTEMPTS || 5);
// 归档文件最多保留条数，避免无限增长
const ARCHIVE_LIMIT = 2000;

function emptyPool() {
  return { version: 1, updated_at: null, items: {} };
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, file);
}

function load() {
  const d = readJson(POOL_FILE, null);
  if (!d || typeof d !== "object" || !d.items || typeof d.items !== "object") return emptyPool();
  return { version: 1, updated_at: d.updated_at || null, items: d.items };
}

function save(pool) {
  pool.version = 1;
  pool.updated_at = new Date().toISOString();
  writeJson(POOL_FILE, pool);
  return pool;
}

// 队列中的全部条目（数组）
function list() {
  return Object.values(load().items);
}

// 只取 aid 集合（供 collector 判定哪些候选来自队列）
function aidSet() {
  const s = new Set();
  for (const it of list()) if (it.aid) s.add(String(it.aid));
  return s;
}

// 入库：只在**库内没有**该 aid 时入队。
// entries: [{ bvid, aid?, title?, girls?, producers?, source }]
// libraryAids: Set<string> 当前库内 aid 集合（用于幂等：已在库 → 不入队，不重复抓）
function add(entries, libraryAids) {
  const pool = load();
  const lib = libraryAids instanceof Set ? libraryAids : new Set();
  const now = new Date().toISOString();
  let added = 0;
  let skippedInLib = 0;
  let skippedDup = 0;
  let skippedInvalid = 0;

  for (const raw of entries || []) {
    const bvid = String(raw?.bvid || "").trim();
    if (!isBvid(bvid)) {
      skippedInvalid++;
      continue;
    }
    const aid = String(raw?.aid || bv2av(bvid) || "").trim();
    if (!aid) {
      skippedInvalid++;
      continue;
    }
    if (pool.items[bvid]) {
      skippedDup++;
      continue;
    }
    if (lib.has(aid)) {
      // 已在库里 = 本站已抓到，无需入队（这就是「不重复抓同一个数据」的保证）
      skippedInLib++;
      continue;
    }
    pool.items[bvid] = {
      bvid,
      aid,
      title: raw?.title || "",
      girls: Array.isArray(raw?.girls) ? raw.girls : [],
      producers: Array.isArray(raw?.producers) ? raw.producers : [],
      source: raw?.source || "unknown",
      first_seen: now,
      attempts: 0,
      last_attempt: null,
      last_reason: null,
    };
    added++;
  }

  if (added) save(pool);
  return { added, skippedInLib, skippedDup, skippedInvalid, pending: Object.keys(pool.items).length };
}

// 结局分类：
//   'ok'       收录成功
//   'gone'     稿件已删除/不可见 —— 内容层终局
//   'rejected' 内容层面明确不合规（时长/别名/AI/搬运等）—— 终局
//   'retry'    请求层失败（网络、风控、限流）—— 下轮重试
function classify(reason) {
  const r = String(reason || "");
  if (!/取详情失败/.test(r)) return "rejected";
  if (/-404|62002|62004|62012|稿件不可见|稿件不存在|已删除|不存在/.test(r)) return "gone";
  return "retry";
}

function appendArchive(rows) {
  if (!rows.length) return;
  const arch = readJson(ARCHIVE_FILE, { version: 1, items: [] });
  const items = Array.isArray(arch.items) ? arch.items : [];
  items.push(...rows);
  const trimmed = items.slice(-ARCHIVE_LIMIT);
  writeJson(ARCHIVE_FILE, { version: 1, updated_at: new Date().toISOString(), items: trimmed });
}

// 回写采集结果。
// outcome: Map<string, { ok: boolean, reason?: string|null }>（key 为 aid）
function settle(outcome) {
  const pool = load();
  const now = new Date().toISOString();
  const archive = [];
  let ok = 0;
  let retry = 0;
  let closed = 0;

  if (!(outcome instanceof Map)) outcome = new Map();

  for (const [bvid, it] of Object.entries(pool.items)) {
    const res = outcome.get(String(it.aid));
    if (!res) continue; // 本轮未覆盖（例如采集未跑到该候选），保持原状

    if (res.ok) {
      delete pool.items[bvid];
      ok++;
      continue;
    }
    const kind = classify(res.reason);
    it.last_attempt = now;
    it.last_reason = String(res.reason || "").slice(0, 200);

    if (kind === "retry" && it.attempts + 1 < MAX_ATTEMPTS) {
      it.attempts += 1;
      retry++;
      continue;
    }
    // 终局：内容不合规 / 稿件消失 / 重试耗尽
    archive.push({
      ...it,
      closed_at: now,
      closed_kind: kind === "retry" ? "exhausted" : kind,
      attempts: it.attempts + 1,
    });
    delete pool.items[bvid];
    closed++;
  }

  save(pool);
  appendArchive(archive);
  return { ok, retry, closed, pending: Object.keys(pool.items).length };
}

function stats() {
  const pool = load();
  const items = Object.values(pool.items);
  const bySource = {};
  for (const it of items) bySource[it.source] = (bySource[it.source] || 0) + 1;
  return {
    pending: items.length,
    by_source: bySource,
    updated_at: pool.updated_at,
    oldest: items.length ? items.map((i) => i.first_seen).sort()[0] : null,
  };
}

module.exports = {
  POOL_FILE,
  ARCHIVE_FILE,
  MAX_ATTEMPTS,
  load,
  save,
  list,
  aidSet,
  add,
  settle,
  stats,
  classify,
};
