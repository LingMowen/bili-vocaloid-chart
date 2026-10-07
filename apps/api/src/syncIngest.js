// 双向同步摄入端点的后端逻辑（syncIngest）。
//
// 为什么需要它：collector/services 都在进程内存里持有一份库，外部工具直接改
// cache/library.json 会被下一次 writeDiskKeepTs 用内存旧库静默覆盖（实测同步写入
// 21737 条后 7 分钟内被本地进程覆盖回 21586）。要让「两边服务运行中互相同步」，
// 合并必须发生在进程内部：收到对端独有的条目 -> 与当前内存库并集 -> 原子落盘 + 换内存。
//
// 语义（与 collector.mergeWithPrev 同口径，不另造判定）：
//   - 按 aid 并集；同 aid 冲突取 lastRefreshAt 更新者，相同则非 stale 优先；
//   - 只接受显式推来的条目（增量），绝不整库覆盖 —— 避免把对端旧快照灌进来；
//   - 落盘走 tmp + rename 原子替换，中途失败不留半文件；
//   - complete 继承磁盘现值，不因增量写入把完整库降级。
const fs = require("node:fs");
const path = require("node:path");
const collector = require("./collector");
const services = require("./services");
const statHistory = require("./statHistory");

const MAX_ITEMS = 5000; // 单次摄入上限（正常一轮同步是几十到几百条）

function pickNewer(a, b) {
  const ta = Number(a && a.lastRefreshAt) || 0;
  const tb = Number(b && b.lastRefreshAt) || 0;
  if (ta !== tb) return ta > tb ? a : b;
  if (a && a.stale && b && !b.stale) return b;
  return a;
}

async function ingestLibrary(items) {
  if (!Array.isArray(items) || !items.length) return { ok: false, reason: "items 为空" };
  if (items.length > MAX_ITEMS) return { ok: false, reason: `items 超过上限 ${MAX_ITEMS}` };

  const disk = collector.readDisk();
  if (!disk || !Array.isArray(disk.data)) return { ok: false, reason: "磁盘库不可读" };

  const base = new Map();
  for (const it of disk.data) if (it && it.aid != null) base.set(String(it.aid), it);

  let added = 0;
  let updated = 0;
  let skipped = 0;
  for (const raw of items) {
    if (!raw || raw.aid == null || typeof raw !== "object") {
      skipped++;
      continue;
    }
    const aid = String(raw.aid);
    const cur = base.get(aid);
    if (!cur) {
      base.set(aid, { ...raw, stale: false });
      added++;
    } else {
      const win = pickNewer(cur, raw);
      if (win === raw && (Number(raw.lastRefreshAt) || 0) !== (Number(cur.lastRefreshAt) || 0)) {
        base.set(aid, { ...cur, ...raw, stale: false });
        updated++;
      } else {
        skipped++;
      }
    }
  }

  if (!added && !updated) {
    return { ok: true, added: 0, updated: 0, skipped, total: base.size, changed: false };
  }

  const data = [...base.values()].sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
  // 原子落盘：tmp + rename，绝不直写线上文件（截断事故教训）
  const tmp = collector.LIBRARY_FILE + ".ingest.tmp";
  fs.writeFileSync(tmp, JSON.stringify({ ts: Date.now(), total: data.length, complete: Boolean(disk.complete), data }), "utf8");
  fs.renameSync(tmp, collector.LIBRARY_FILE);

  // 换内存：collector 与 services 两份缓存都要更新，否则下一轮刷新又把旧库写回去
  collector.setLibraryCache(data);
  await services.loadLibrary(true);
  try {
    statHistory.saveDailySnapshot(data);
  } catch (e) {
    /* 快照失败不影响摄入结果 */
  }
  return { ok: true, added, updated, skipped, total: data.length, changed: true };
}

// 单日统计快照并集：只动 cache/stat_daily/<date>.json 磁盘文件，不碰内存库
// （历史快照不参与内存库与派生缓存）。同 aid 取 view 更大者 = 该侧当天刷新更晚。
// 为什么必须合而不是跳过：各侧快照只含各侧当天库里的歌；只推「对端缺的日期」会让
// 对端独有的歌在历史快照里永远缺基线，增量榜把它当「窗口内新歌」漏算历史增量。
function mergeSnapshot(dateKey, items) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey))) return { ok: false, reason: "dateKey 非法" };
  if (!Array.isArray(items)) return { ok: false, reason: "items 需为对象（aid -> stat）" };
  const file = path.join(statHistory.DAILY_DIR, `${dateKey}.json`);
  let cur = {};
  try {
    cur = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    cur = {};
  }
  let added = 0;
  let updated = 0;
  for (const [aid, stat] of Object.entries(items)) {
    const v = Number(stat && stat.view) || 0;
    const a = Number(cur[aid] && cur[aid].view) || 0;
    if (!(aid in cur)) {
      cur[aid] = stat;
      added++;
    } else if (v > a) {
      cur[aid] = stat;
      updated++;
    }
  }
  const tmp = file + ".merge.tmp";
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(cur), "utf8");
  fs.renameSync(tmp, file);
  return { ok: true, date: dateKey, added, updated, total: Object.keys(cur).length };
}

module.exports = { ingestLibrary, mergeSnapshot, pickNewer, MAX_ITEMS };
