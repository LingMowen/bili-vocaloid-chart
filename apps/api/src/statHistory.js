const fs = require("node:fs");
const path = require("node:path");

const CACHE_DIR = path.join(__dirname, "..", "cache");
const DAILY_DIR = path.join(CACHE_DIR, "stat_daily");

const KEYS = ["view", "favorite", "coin", "like", "danmaku", "reply", "share"];

function dateKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// 读取指定日期（YYYY-MM-DD）快照：{ aid: {view,...} }，缺失返回 null
function snapshotAt(date) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DAILY_DIR, `${date}.json`), "utf8"));
  } catch (e) {
    return null;
  }
}

// 把 items 的 stat 写入当天快照（累积：已存在的 aid 保留、新歌新增）
function saveDailySnapshot(items) {
  fs.mkdirSync(DAILY_DIR, { recursive: true });
  const key = dateKey();
  const dest = path.join(DAILY_DIR, `${key}.json`);
  let snap = {};
  try {
    snap = JSON.parse(fs.readFileSync(dest, "utf8"));
  } catch (e) {
    /* 新建 */
  }
  for (const it of items || []) {
    if (!it.aid) continue;
    snap[String(it.aid)] = {};
    for (const k of KEYS) snap[String(it.aid)][k] = Number(it[k]) || 0;
  }
  const tmp = dest + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(snap), "utf8");
  fs.renameSync(tmp, dest);
  return key;
}

function listSnapshotDates() {
  fs.mkdirSync(DAILY_DIR, { recursive: true });
  return fs
    .readdirSync(DAILY_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
}

// 计算 items 相对起点快照的增量 stat（基线无此 aid 则增量记 0，不进增量榜）
function deltaStat(item, baseSnap) {
  const aid = String(item.aid);
  const base = baseSnap && baseSnap[aid];
  const out = {};
  for (const k of KEYS) {
    const cur = Number(item[k]) || 0;
    out[k] = base ? Math.max(0, cur - (Number(base[k]) || 0)) : 0;
  }
  return out;
}

// 两个快照之间的增量（to - from）。用于历史期次回溯：
// 历史某一期的分数应当等于「该期期末快照 - 该期期初快照」，而不是「当前值 - 期初快照」，
// 否则越早的期次会被算进越多后续增长，导致上期排名/历史最高排名/成就判定全部失真。
// 仅返回 to 中存在的 aid；from 中无该 aid（窗口内新歌）时不返回，由调用方决定如何计分。
function deltaSnapshot(fromSnap, toSnap) {
  const out = {};
  for (const aid of Object.keys(toSnap || {})) {
    const b = fromSnap && fromSnap[aid];
    if (!b) continue;
    const t = toSnap[aid];
    const d = {};
    for (const k of KEYS) d[k] = Math.max(0, (Number(t[k]) || 0) - (Number(b[k]) || 0));
    out[aid] = d;
  }
  return out;
}

module.exports = {
  KEYS,
  dateKey,
  snapshotAt,
  saveDailySnapshot,
  listSnapshotDates,
  deltaStat,
  deltaSnapshot,
};
