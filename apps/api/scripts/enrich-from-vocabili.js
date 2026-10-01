// 用 vocabili 最新期数据补充本地库（必须在 apps/api 目录下运行）。
//
// 分工（严格按用户口径）：
//   - **只要 vocabili 的视频链接（bvid）+ 四个量（播放/点赞/评论/投币）**，
//     分数(point)与名次(rank)一概不取 —— 名次与分数本站自己算。
//   - 四个量**不写进 library 条目**：实测 vocabili 给的是「统计周期内增量」
//     （对新歌≈累计、对老歌远小于累计，见 scripts/vocabili-diff.js），
//     直接当累计数会污染库。它们单独落到 cache/vocabili_meta.json。
//   - 视频本体仍由**本站自己的 B站采集**（collector.buildItem）抓真实累计数据入库，
//     vocabili 只作为「发现源」提供缺失的 bvid。
//
//   node scripts/enrich-from-vocabili.js --dry --limit=3
//   node scripts/enrich-from-vocabili.js --limit=20 --throttle=300
//   node scripts/enrich-from-vocabili.js              # 全量补齐
const fs = require("node:fs");
const path = require("node:path");
const bili = require("../src/bili");
const collector = require("../src/collector");

const BV_DATA = "FcwAPNKTMug3GV5Lj7EJnHpWsx4tb8haYeviqBz6rkCy12mUSDQX9RdoZf";
const BV_XOR = 23442827791579n;
const BV_MASK = 2251799813685247n;
const BV_BASE = 58n;
function bv2av(bvid) {
  const a = Array.from(String(bvid || ""));
  if (a.length !== 12) return null;
  [a[3], a[9]] = [a[9], a[3]];
  [a[4], a[7]] = [a[7], a[4]];
  let tmp = 0n;
  for (const ch of a.slice(3)) {
    const idx = BV_DATA.indexOf(ch);
    if (idx < 0) return null;
    tmp = tmp * BV_BASE + BigInt(idx);
  }
  return Number((tmp & BV_MASK) ^ BV_XOR);
}

const arg = (n, d) => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.split("=").slice(1).join("=") : d;
};
const has = (n) => process.argv.slice(2).includes(`--${n}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const VOC_DIR = path.join(__dirname, "..", "cache", "vocabili");
const LIB_FILE = collector.LIBRARY_FILE;
const META_FILE = path.join(__dirname, "..", "cache", "vocabili_meta.json");

// 读 vocabili 各榜最新期 → 去重后的视频（只取链接与四个量）
function loadVoc() {
  const map = new Map();
  for (const board of fs.readdirSync(VOC_DIR)) {
    const dir = path.join(VOC_DIR, board);
    if (!fs.statSync(dir).isDirectory()) continue;
    const files = fs
      .readdirSync(dir)
      .filter((f) => /^\d+\.json$/.test(f))
      .sort((a, b) => Number(b.replace(".json", "")) - Number(a.replace(".json", "")));
    if (!files.length) continue;
    const j = JSON.parse(fs.readFileSync(path.join(dir, files[0]), "utf8"));
    for (const arr of Object.values(j.parts || {})) {
      for (const r of arr || []) {
        if (!r.bvid) continue;
        const cur = map.get(r.bvid);
        // 同歌在多个榜出现时，保留数值较大的一条（周期长的更完整），但名次/分数一律不取
        if (cur && cur.view >= (r.view || 0)) continue;
        map.set(r.bvid, {
          bvid: r.bvid,
          name: r.song?.name || "",
          girls: (r.song?.vocalists || []).map((v) => v.vocalist?.name).filter(Boolean),
          producers: (r.song?.producers || []).map((p) => p.producer?.name).filter(Boolean),
          board,
          issue: j.issue,
          view: r.view ?? 0,
          like: r.like ?? 0,
          reply: r.reply ?? 0,
          coin: r.coin ?? 0,
        });
      }
    }
  }
  return map;
}

function saveJson(file, obj) {
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj), "utf8");
  fs.renameSync(tmp, file);
}

(async () => {
  const dry = has("dry");
  const limit = Number(arg("limit", 0)) || Infinity;
  const throttle = Number(arg("throttle", 300));
  const force = has("force");

  const voc = loadVoc();
  const lib = JSON.parse(fs.readFileSync(LIB_FILE, "utf8"));
  const byBvid = new Map();
  const byAid = new Map();
  for (const it of lib.data || []) {
    if (it.bvid) byBvid.set(it.bvid, it);
    if (it.aid) byAid.set(String(it.aid), it);
  }

  const pending = [];
  for (const [bvid, r] of voc) {
    const aid = bv2av(bvid);
    if (byBvid.has(bvid) || (aid && byAid.has(String(aid)))) continue;
    pending.push({ ...r, aid });
  }
  console.log(
    `[enrich] vocabili 视频 ${voc.size} 个，本地库已有 ${voc.size - pending.length}，待补 ${pending.length}${dry ? "（DRY-RUN）" : ""}`,
  );

  const todo = pending.slice(0, limit === Infinity ? pending.length : limit);
  const client = await bili.getClient();
  const sdk = await import("@aemeath-projects/bilibili");

  const added = [];
  const rejected = [];
  for (let i = 0; i < todo.length; i++) {
    const t = todo[i];
    try {
      const item = await collector.buildItem(client, sdk, t.aid, { title: t.name, aid: t.aid });
      if (item) {
        added.push(item);
        console.log(`  [${i + 1}/${todo.length}] + ${t.bvid} ${item.title?.slice(0, 30)} view=${item.view}`);
      } else {
        const why = collector.getLastReject() || "未知原因";
        rejected.push({ bvid: t.bvid, name: t.name, reason: why });
        console.log(`  [${i + 1}/${todo.length}] - ${t.bvid} ${t.name.slice(0, 20)} → ${why}`);
      }
    } catch (e) {
      rejected.push({ bvid: t.bvid, name: t.name, reason: e.message });
      console.error(`  [${i + 1}/${todo.length}] ! ${t.bvid} 采集失败: ${e.message}`);
    }
    await sleep(throttle);
  }

  // 四个量单独落盘（不进 library 主字段）
  const meta = fs.existsSync(META_FILE) ? JSON.parse(fs.readFileSync(META_FILE, "utf8")) : {};
  for (const [bvid, r] of voc) {
    meta[bvid] = {
      name: r.name,
      girls: r.girls,
      producers: r.producers,
      view: r.view,
      like: r.like,
      reply: r.reply,
      coin: r.coin,
      from: `${r.board}#${r.issue}`,
      updated_at: new Date().toISOString(),
    };
  }

  console.log(`[enrich] 通过收录 ${added.length} / 拒绝 ${rejected.length}`);
  if (dry) {
    console.log("[enrich] DRY-RUN：未写入 library.json 与 vocabili_meta.json");
    if (added.length) console.log("  预览:", added.slice(0, 5).map((x) => `${x.bvid} ${x.title?.slice(0, 24)} view=${x.view}`).join(" | "));
    return;
  }

  if (!force) {
    const cap = Math.max(20, Math.round((lib.data?.length || 0) * 0.02));
    if (added.length > cap) {
      console.error(`[enrich] 单轮新增 ${added.length} 超过保护阈值 ${cap}，已中止（确认无误后加 --force）`);
      return;
    }
  }

  // 合并写盘：已有条目原样保留，只追加新增（绝不整体覆盖库存）
  if (added.length) {
    const bak = `${LIB_FILE}.bak-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    fs.copyFileSync(LIB_FILE, bak);
    const seen = new Set((lib.data || []).map((x) => String(x.aid)));
    const merged = [...(lib.data || [])];
    for (const it of added) {
      if (seen.has(String(it.aid))) continue;
      seen.add(String(it.aid));
      merged.push(it);
    }
    saveJson(LIB_FILE, { ts: Date.now(), total: merged.length, complete: lib.complete ?? merged.length, data: merged });
    console.log(`[enrich] 库 ${lib.data?.length} → ${merged.length}（备份 ${path.basename(bak)}）`);
  }
  saveJson(META_FILE, meta);
  console.log(`[enrich] vocabili 四量已写入 cache/vocabili_meta.json（${Object.keys(meta).length} 条）`);
  if (rejected.length) {
    fs.writeFileSync(
      path.join(__dirname, "..", "cache", "vocabili_rejected.json"),
      JSON.stringify({ at: new Date().toISOString(), rejected }, null, 2),
      "utf8",
    );
    console.log(`[enrich] 拒绝明细 → cache/vocabili_rejected.json（${rejected.length} 条）`);
  }
})().catch((e) => {
  console.error("[enrich] 异常:", e);
  process.exit(1);
});
