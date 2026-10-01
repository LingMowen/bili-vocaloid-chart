/**
 * 榜单档案索引（性能关键路径）
 *
 * 背景：cache/board_archive/ 下有 95 个档案 JSON、合计约 149MB。
 * 此前 songHistory() / girlsByAid() 每来一个请求就 readFileSync + JSON.parse 全量扫描一遍，
 * 单次 ~1.5s，且是**同步 I/O**——会独占 Node 事件循环，
 * 导致视频页 6 个接口并发时互相排队，端到端实测 12s。
 *
 * 方案：把这些档案解析成一张 `aid -> 上榜记录[]` 的内存索引，只建一次（约数秒），
 * 之后查询是 O(1)。索引带指纹失效（档案文件增删改会触发重建），并按片让出事件循环。
 *
 * 用法：
 *   const idx = await boardIndex.get();        // 拿到索引（首次会构建）
 *   idx.byAid.get(String(aid))                 // -> rec[] | undefined
 *   boardIndex.warmup();                       // 启动预热（不阻塞启动流程）
 */

const fs = require("node:fs");
const path = require("node:path");

const CACHE_DIR = process.env.CACHE_DIR
  ? path.resolve(process.env.CACHE_DIR)
  : path.join(__dirname, "..", "cache");
const ARCHIVE_DIR = path.join(CACHE_DIR, "board_archive");

const PERIODS_ALL = ["daily", "weekly", "monthly", "annual"];
/** 指纹复核间隔：即使没人写档案，也定期 stat 一次确认没变（stat 95 次很便宜） */
const FP_TTL = 60 * 1000;

let _index = null; // Map<aidStr, rec[]>
let _fp = "";
let _fpAt = 0;
let _building = null; // 并发共享的构建 promise
const _stats = { records: 0, files: 0, ms: 0, builtAt: 0 };

function statSafe(p) {
  try {
    const s = fs.statSync(p);
    return `${s.mtimeMs}:${s.size}`;
  } catch {
    return "x";
  }
}

/** 档案目录 + 当前榜缓存的变更指纹（只 stat，不读内容） */
function fingerprint() {
  const parts = [];
  for (const period of PERIODS_ALL) {
    parts.push(`${period}|${statSafe(path.join(CACHE_DIR, `board_${period}.json`))}`);
    const dir = path.join(ARCHIVE_DIR, period);
    let files = [];
    try {
      files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
    } catch {
      files = [];
    }
    files.sort();
    const sig = files.map((f) => `${f}=${statSafe(path.join(dir, f))}`).join(",");
    parts.push(`${dir}#${files.length}#${sig}`);
  }
  return parts.join("||");
}

/**
 * 从榜单条目里抽出「上榜记录」需要的字段。
 * 只留 songHistory() / girlsByAid() 真正会用的，避免把整个 item（含 tags/owner 等）留在内存。
 */
function toRecord(period, d, it, archived) {
  // 键顺序与旧 songHistory() 输出保持一致（issue 在前），便于逐字节对拍
  return {
    issue: it.issue ?? d.issue ?? null,
    period,
    date: it.evo_start ?? d.date_start ?? null,
    date_end: it.evo_end ?? null,
    source: it.data_source ?? null,
    evo_periods: it.evo_periods ?? null,
    avg_days: it.avg_days ?? null,
    rank: it.score_rank ?? null,
    score: it.score ?? 0,
    view: it.view ?? 0,
    favorite: it.favorite ?? 0,
    coin: it.coin ?? 0,
    like: it.like ?? 0,
    danmaku: it.danmaku ?? 0,
    reply: it.reply ?? 0,
    share: it.share ?? 0,
    rank_score: it.rank_score ?? null,
    rank_view: it.rank_view ?? null,
    rank_favorite: it.rank_favorite ?? null,
    rank_coin: it.rank_coin ?? null,
    rank_like: it.rank_like ?? null,
    rank_danmaku: it.rank_danmaku ?? null,
    rank_reply: it.rank_reply ?? null,
    rank_share: it.rank_share ?? null,
    new: !!it.new,
    prev_rank: it.prev_rank ?? null,
    delta: it.delta ?? null,
    streak: it.streak ?? 0,
    // girlsByAid 用；只在确实有值时才留数组，13 万条里大部分没有
    girls: Array.isArray(it.girls) && it.girls.length ? it.girls : null,
    _archived: archived,
  };
}

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

const yieldToLoop = () => new Promise((r) => setImmediate(r));

/** 全量重建索引。分片让出事件循环，避免长时间独占导致其它请求饿死。 */
async function build() {
  const t0 = Date.now();
  const byAid = new Map();
  let fileCount = 0;
  let recCount = 0;

  for (const period of PERIODS_ALL) {
    // 与旧逻辑一致：当前榜 + 该 period 全部档案，按 (date_start ?? issue) 去重，issue 大者胜
    const sources = [];
    const curPath = path.join(CACHE_DIR, `board_${period}.json`);
    const cur = readJson(curPath);
    if (cur && Array.isArray(cur.list)) sources.push({ d: cur, archived: false });

    const dir = path.join(ARCHIVE_DIR, period);
    let files = [];
    try {
      files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
    } catch {
      files = [];
    }
    // 期号升序，保证同一 aid 的记录按 issue 递增排列（songHistory 依赖该顺序）
    files.sort((a, b) => (Number(a.replace(".json", "")) || 0) - (Number(b.replace(".json", "")) || 0));
    for (const f of files) {
      sources.push({ file: path.join(dir, f), archived: true });
    }

    const byDate = new Map();
    for (const s of sources) {
      const d = s.d || readJson(s.file);
      if (!d || !Array.isArray(d.list)) continue;
      const key = d.date_start ?? String(d.issue);
      const prev = byDate.get(key);
      // 同一天/期只保留期号最大的那份（旧逻辑同），但两条都可能是不同 aid 的唯一来源：
      // 旧逻辑是"整份榜替换"，这里保持一致
      if (!prev || (Number(d.issue) || 0) > (Number(prev.d.issue) || 0)) {
        byDate.set(key, { d, archived: s.archived });
      }
      if (s.file) {
        fileCount++;
        // 每读 4 个文件让出一次事件循环（单文件可达数 MB，解析是同步的）
        if (fileCount % 4 === 0) await yieldToLoop();
      }
    }

    const ordered = [...byDate.values()].sort(
      (a, b) => (Number(a.d.issue) || 0) - (Number(b.d.issue) || 0)
    );
    for (const { d, archived } of ordered) {
      for (const it of d.list) {
        if (!it || it.aid == null) continue;
        const rec = toRecord(period, d, it, archived);
        const key = String(it.aid);
        const arr = byAid.get(key);
        if (arr) arr.push(rec);
        else byAid.set(key, [rec]);
        recCount++;
      }
      await yieldToLoop();
    }
  }

  _index = { byAid };
  _fp = fingerprint();
  _fpAt = Date.now();
  _stats.records = recCount;
  _stats.files = fileCount;
  _stats.ms = Date.now() - t0;
  _stats.builtAt = Date.now();
  return _index;
}

async function get() {
  // 有索引且指纹复核未过期 → 直接用
  if (_index && Date.now() - _fpAt < FP_TTL) return _index;
  // 指纹没变 → 刷新复核时间后继续用
  if (_index) {
    const fp = fingerprint();
    _fpAt = Date.now();
    if (fp === _fp) return _index;
  }
  // 需要（重新）构建：并发请求共享同一次构建
  if (_building) return _building;
  _building = (async () => {
    try {
      return await build();
    } finally {
      _building = null;
    }
  })();
  return _building;
}

/** 启动预热：不阻塞服务启动，首个请求命中时若未就绪会等待构建 */
function warmup() {
  get().catch(() => {});
}

function stats() {
  return { ..._stats, ready: !!_index, fpCheckedAt: _fpAt };
}

/** 测试/运维用：强制重建 */
async function rebuild() {
  _index = null;
  _fp = "";
  return get();
}

module.exports = { get, warmup, stats, rebuild, PERIODS_ALL };
