// vocabili（本站 UI 的参照站）日刊同步。
//
// 口径（用户 2026-09-27 拍板）：
//   - **只抓日刊（daily）**。周刊 / 月刊 / 年刊由本站自己用 B 站数据计算，不从该站取。
//   - 只取**视频链接（bvid）与四个量（播放/点赞/评论/投币）**；
//     **不取名次(rank)、不取分数(point)** —— 名次与分数一律本站自算。
//   - 该站只作为**发现源**：日刊里库内没有的 bvid → 写入待抓队列（pendingPool），
//     由下一轮本站 B 站采集去抓真实累计数据；而不是把该站的周期增量当长期数据。
//   - 幂等：同期号已落盘即跳过；已在库内的 bvid 不入队 → **不重复抓同一条数据**。
//
// 关于登录：**公开 API `api.vocabili.top/v3` 取日刊最新期无需登录**
//   （实测 `latest_issue` → 816，HTTP 200）。网页端登录只为看历史期（401），
//   而本站不需要历史期，因此**无需账号登录，也就不存在会话过期问题**。
//
// 反封策略（单 IP、单并发、低速，不做多 IP 轮换）：
//   1. 串行单请求，间隔默认 800ms（VOCABILI_THROTTLE_MS 可调）；
//   2. 一天一次，约 3 个请求/天（latest_issue + parts + 各分区各 1 页）；
//   3. 幂等：已落盘的期号永不重拉；429/5xx 指数退避；诚实 UA，不伪装、不绕登录态。
const fs = require("node:fs");
const path = require("node:path");
const vocabili = require("./vocabili");
const pendingPool = require("./pendingPool");
const { bv2av } = require("./bv");

const CACHE_DIR = path.join(__dirname, "..", "cache", "vocabili");
const STATE_FILE = path.join(CACHE_DIR, "_state.json");
const LIBRARY_FILE = path.join(__dirname, "..", "cache", "library.json");
const META_FILE = path.join(__dirname, "..", "cache", "vocabili_meta.json");

// 真正需要同步的榜：只有日刊。其余三榜由本站自算（保留 ALL_BOARDS 仅用于历史数据排查）。
const SYNC_BOARDS = ["daily"];
const ALL_BOARDS = ["daily", "weekly", "monthly", "annual"];
const BOARDS = SYNC_BOARDS;

function ensureDir(d) {
  fs.mkdirSync(d, { recursive: true });
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch (e) {
    return { boards: {}, updated_at: null };
  }
}

function writeState(s) {
  ensureDir(CACHE_DIR);
  s.updated_at = new Date().toISOString();
  const tmp = STATE_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2), "utf8");
  fs.renameSync(tmp, STATE_FILE);
}

// 本地已落盘的期号集合
function localIssues(board) {
  const dir = path.join(CACHE_DIR, board);
  if (!fs.existsSync(dir)) return new Set();
  return new Set(
    fs
      .readdirSync(dir)
      .filter((f) => /^\d+\.json$/.test(f))
      .map((f) => Number(f.replace(/\.json$/, ""))),
  );
}

function saveIssue(board, issue, payload) {
  const dir = path.join(CACHE_DIR, board);
  ensureDir(dir);
  const dest = path.join(dir, `${issue}.json`);
  const tmp = dest + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(payload), "utf8");
  fs.renameSync(tmp, dest);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 同步指定榜的一批期号。opts: { batch, throttle, dry, part, maxFail }
// 返回 { board, latest, planned, fetched, skipped, failed, nextCursor, done }
async function syncBoard(board, opts = {}) {
  const batch = Math.max(1, Number(opts.batch) || 100);
  const throttle = opts.throttle != null ? Number(opts.throttle) : 800;
  const dry = !!opts.dry;
  const onlyPart = opts.part || null; // 不指定则抓该期所有分区
  const maxFail = Math.max(1, Number(opts.maxFail) || 3);

  vocabili.setThrottle(throttle);
  const state = readState();
  const st = (state.boards[board] = state.boards[board] || { done: [], last_at: null, last_error: null });

  const latest = await vocabili.latestIssue(board);
  if (!latest) throw new Error(`${board}: 取不到 latest_issue`);

  const have = localIssues(board);
  const done = new Set(Array.isArray(st.done) ? st.done : []);
  // 待抓：1..latest 中本地无文件且未标记为已抓的，升序（从旧到新）
  const pending = [];
  for (let i = 1; i <= latest; i++) {
    if (have.has(i) || done.has(i)) continue;
    pending.push(i);
  }
  const planned = pending.slice(0, batch);

  let fetched = 0;
  let failed = 0;
  let failStreak = 0;
  for (const issue of planned) {
    try {
      const parts = onlyPart ? [onlyPart] : (await vocabili.parts(board, issue)).map((p) => p.part || p);
      const uniq = [...new Set(parts.filter(Boolean))];
      const payload = { board, issue, fetched_at: new Date().toISOString(), parts: {} };
      for (const part of uniq.length ? uniq : ["main"]) {
        const rows = await vocabili.ranking(board, issue, 1, 100, part, "point");
        // 期号校验：服务端会无视 issue 直接吐最新一期（见 vocabili.js 顶部说明）。
        // 一旦发现的不是请求的期号，说明该期号不可得，必须立刻停跑，
        // 否则会把同一份「最新期」数据重复抓 N 遍（曾因此白跑 324 次请求）。
        const got = rows.length ? Number(rows[0].issue) : null;
        if (got != null && Number.isFinite(got) && got !== Number(issue)) {
          const err = new Error(`期号不匹配：请求 ${issue} 服务端返回 ${got}（历史期不可得）`);
          err.mismatch = true;
          throw err;
        }
        payload.server_issue = got;
        payload.parts[part] = rows;
        await sleep(throttle);
      }
      if (!dry) {
        saveIssue(board, issue, payload);
        done.add(issue);
        st.done = [...done].sort((a, b) => a - b);
        st.last_at = new Date().toISOString();
        st.last_error = null;
        writeState(state);
      }
      fetched++;
      failStreak = 0;
    } catch (e) {
      failed++;
      failStreak++;
      st.last_error = `${new Date().toISOString()} issue=${issue}: ${e.message}`;
      if (!dry) writeState(state);
      console.error(`[vocabiliSync] ${board} #${issue} 失败(${failStreak}/${maxFail}): ${e.message}`);
      if (e.mismatch) {
        st.note = `${new Date().toISOString()} 期号不生效，服务端只返回最新期（${e.message}）`;
        if (!dry) writeState(state);
        console.error(`[vocabiliSync] ${board} 期号不生效，停止遍历（该 API 只能取最新一期）`);
        break;
      }
      if (failStreak >= maxFail) {
        console.error(`[vocabiliSync] ${board} 连续失败 ${maxFail} 次，熔断停跑（进度已保存）`);
        break;
      }
      // 出错后拉长退避，避免顶着错误继续打
      await sleep(Math.min(30000, 2000 * Math.pow(2, failStreak)));
    }
  }

  return {
    board,
    latest,
    pending_total: pending.length,
    planned: planned.length,
    fetched,
    failed,
    dry,
    remaining: Math.max(0, pending.length - planned.length),
    next_cursor: planned.length ? planned[planned.length - 1] + 1 : null,
  };
}

// 只同步「最新一期」——该 API 实际能提供的全部（历史期号不生效）。
// opts: { throttle, part, force, dry }
async function syncLatest(board, opts = {}) {
  const throttle = opts.throttle != null ? Number(opts.throttle) : 800;
  const dry = !!opts.dry;
  vocabili.setThrottle(throttle);
  const state = readState();
  const st = (state.boards[board] = state.boards[board] || { done: [], last_at: null, last_error: null });

  const latest = Number(await vocabili.latestIssue(board));
  if (!latest) throw new Error(`${board}: 取不到 latest_issue`);
  const have = localIssues(board);
  if (have.has(latest) && !opts.force) {
    return { board, latest, skipped: true, reason: "本地已有该期（--force 强制刷新）" };
  }

  const ps = opts.part ? [opts.part] : (await vocabili.parts(board, latest)).map((p) => p.part || p);
  const uniq = [...new Set(ps.filter(Boolean))];
  const payload = { board, issue: latest, fetched_at: new Date().toISOString(), parts: {} };
  for (const part of uniq.length ? uniq : ["main"]) {
    payload.parts[part] = await vocabili.ranking(board, latest, 1, 100, part, "point");
    await sleep(throttle);
  }
  const rows = Object.values(payload.parts).reduce((s, a) => s + a.length, 0);
  if (!dry) {
    saveIssue(board, latest, payload);
    const done = new Set(Array.isArray(st.done) ? st.done : []);
    done.add(latest);
    st.done = [...done].sort((a, b) => a - b);
    st.last_at = new Date().toISOString();
    st.last_error = null;
    writeState(state);
  }
  return { board, latest, fetched: 1, failed: 0, dry, parts: Object.keys(payload.parts), rows };
}

// ---- 日刊专用：发现源 → 待抓队列 + 四量落盘 ----

// 库内已有 aid 集合（用于幂等：已在库 → 不入队）
function loadLibraryAids() {
  try {
    const j = JSON.parse(fs.readFileSync(LIBRARY_FILE, "utf8"));
    return new Set((j.data || []).map((x) => String(x.aid)));
  } catch (e) {
    return new Set();
  }
}

// 把一期的条目（只取 bvid + 四个量）写入 cache/vocabili_meta.json。
// 注意：四量是该站的「统计周期增量」，**不进 library 主字段**，只作旁证留存。
function writeMeta(rows, issue, dry) {
  if (dry) return { written: 0 };
  let meta = {};
  try {
    meta = JSON.parse(fs.readFileSync(META_FILE, "utf8"));
  } catch (e) {
    meta = {};
  }
  const now = new Date().toISOString();
  let written = 0;
  for (const r of rows) {
    if (!r?.bvid) continue;
    meta[r.bvid] = {
      name: r.song?.name || "",
      view: r.view ?? 0,
      like: r.like ?? 0,
      reply: r.reply ?? 0,
      coin: r.coin ?? 0,
      from: `daily#${issue}`,
      updated_at: now,
    };
    written++;
  }
  const tmp = META_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(meta), "utf8");
  fs.renameSync(tmp, META_FILE);
  return { written, total: Object.keys(meta).length };
}

// 日刊里库内没有的 bvid → 待抓队列（只传 bvid，aid 本地换算；不带名次/分数）
function enqueuePending(rows, issue) {
  const entries = rows
    .filter((r) => r?.bvid)
    .map((r) => ({
      bvid: r.bvid,
      aid: bv2av(r.bvid),
      title: r.song?.name || "",
      source: `vocabili-daily-${issue}`,
    }));
  const res = pendingPool.add(entries, loadLibraryAids());
  return res;
}

// 日刊自动同步：拉最新一期 → 落盘 → 四量入 meta → 缺失项入待抓队列。
// opts: { throttle, force, dry }
async function syncDaily(opts = {}) {
  const board = "daily";
  const throttle = opts.throttle != null ? Number(opts.throttle) : 800;
  const dry = !!opts.dry;
  vocabili.setThrottle(throttle);

  const latest = Number(await vocabili.latestIssue(board));
  if (!latest) throw new Error("daily: 取不到 latest_issue");

  const state = readState();
  const st = (state.boards[board] = state.boards[board] || { done: [], last_at: null, last_error: null });
  const have = localIssues(board);

  let payload = null;
  let skipped = false;
  if (have.has(latest) && !opts.force) {
    skipped = true;
  } else {
    const ps = (await vocabili.parts(board, latest)).map((p) => p.part || p);
    const uniq = [...new Set(ps.filter(Boolean))];
    payload = { board, issue: latest, fetched_at: new Date().toISOString(), parts: {} };
    for (const part of uniq.length ? uniq : ["main"]) {
      payload.parts[part] = await vocabili.ranking(board, latest, 1, 100, part, "point");
      await sleep(throttle);
    }
    if (!dry) {
      saveIssue(board, latest, payload);
      const done = new Set(Array.isArray(st.done) ? st.done : []);
      done.add(latest);
      st.done = [...done].sort((a, b) => a - b);
      st.last_at = new Date().toISOString();
      st.last_error = null;
      writeState(state);
    }
  }

  // 取该期条目（刚落盘的直接用内存，否则读文件）—— 保证幂等路径也会补队列
  let rows = [];
  if (payload) {
    rows = Object.values(payload.parts).flat();
  } else {
    try {
      const f = path.join(CACHE_DIR, board, `${latest}.json`);
      const j = JSON.parse(fs.readFileSync(f, "utf8"));
      rows = Object.values(j.parts || {}).flat();
    } catch (e) {
      rows = [];
    }
  }

  const meta = writeMeta(rows, latest, dry);
  const q = dry
    ? { added: 0, skippedInLib: 0, skippedDup: 0, pending: pendingPool.list().length }
    : enqueuePending(rows, latest);

  return {
    board,
    latest,
    skipped,
    rows: rows.length,
    parts: payload ? Object.keys(payload.parts) : [],
    meta_written: meta.written ?? 0,
    meta_total: meta.total ?? null,
    pending_added: q.added,
    pending_skipped_in_library: q.skippedInLib,
    pending_skipped_dup: q.skippedDup,
    pending_total: q.pending,
    dry,
  };
}

async function syncAll(opts = {}) {
  const boards = opts.boards && opts.boards.length ? opts.boards : BOARDS;
  const mode = opts.mode === "range" ? "range" : "latest";
  const out = [];
  for (const b of boards) {
    try {
      out.push(mode === "range" ? await syncBoard(b, opts) : await syncLatest(b, opts));
    } catch (e) {
      console.error(`[vocabiliSync] ${b} 同步失败: ${e.message}`);
      out.push({ board: b, error: e.message });
    }
  }
  return out;
}

module.exports = {
  CACHE_DIR,
  STATE_FILE,
  BOARDS,
  SYNC_BOARDS,
  ALL_BOARDS,
  META_FILE,
  readState,
  localIssues,
  loadLibraryAids,
  writeMeta,
  enqueuePending,
  syncDaily,
  syncBoard,
  syncLatest,
  syncAll,
};
