// 比对 vocabili 最新期数据与本地库的差异（只读，不写任何文件）。
// 目的：确认哪些视频是本地库缺失的（可补充），以及 vocabili 的数值是累计值还是周期增量。
//   node scripts/vocabili-diff.js            # 只看汇总
//   node scripts/vocabili-diff.js --detail   # 打印缺失/差异明细
const fs = require("node:fs");
const path = require("node:path");

const VOC_DIR = path.join(__dirname, "..", "cache", "vocabili");
const LIB = path.join(__dirname, "..", "cache", "library.json");
const detail = process.argv.includes("--detail");

// vocabili 最新期（各榜目录里期号最大的那个文件）
function loadVoc() {
  const rows = [];
  for (const board of fs.readdirSync(VOC_DIR)) {
    const dir = path.join(VOC_DIR, board);
    if (!fs.statSync(dir).isDirectory()) continue;
    const files = fs
      .readdirSync(dir)
      .filter((f) => /^\d+\.json$/.test(f))
      .sort((a, b) => Number(b.replace(".json", "")) - Number(a.replace(".json", "")));
    if (!files.length) continue;
    const j = JSON.parse(fs.readFileSync(path.join(dir, files[0]), "utf8"));
    for (const [part, arr] of Object.entries(j.parts || {})) {
      for (const r of arr || []) {
        if (!r.bvid) continue;
        rows.push({
          bvid: r.bvid,
          board,
          issue: j.issue,
          part,
          rank: r.rank ?? null,
          point: r.point ?? null,
          view: r.view ?? 0,
          like: r.like ?? 0,
          reply: r.reply ?? 0,
          coin: r.coin ?? 0,
          favorite: r.favorite ?? 0,
          share: r.share ?? 0,
          danmaku: r.danmaku ?? 0,
          name: r.song?.name || "",
          girls: (r.song?.vocalists || []).map((v) => v.vocalist?.name).filter(Boolean),
          producers: (r.song?.producers || []).map((p) => p.producer?.name).filter(Boolean),
        });
      }
    }
  }
  return rows;
}

const lib = JSON.parse(fs.readFileSync(LIB, "utf8"));
const byBvid = new Map();
for (const it of lib.data || []) if (it.bvid) byBvid.set(it.bvid, it);

const voc = loadVoc();
const uniq = new Map();
for (const r of voc) {
  const prev = uniq.get(r.bvid);
  if (!prev || r.view > prev.view) uniq.set(r.bvid, r); // 同歌出现在多榜时取数值较大的那条（周期长的更接近累计）
}

const miss = [];
const diff = [];
for (const [bvid, r] of uniq) {
  const it = byBvid.get(bvid);
  if (!it) {
    miss.push(r);
    continue;
  }
  diff.push({
    bvid,
    name: r.name,
    voc_view: r.view,
    lib_view: it.view ?? 0,
    voc_like: r.like,
    lib_like: it.like ?? 0,
    voc_reply: r.reply,
    lib_reply: it.reply ?? 0,
    voc_coin: r.coin,
    lib_coin: it.coin ?? 0,
    ratio: it.view ? +(r.view / it.view).toFixed(3) : null,
    lib_pubdate: it.pubdate ? new Date(it.pubdate * 1000).toISOString().slice(0, 10) : null,
  });
}

console.log(`vocabili 最新期条目 ${voc.length} 条，去重后 ${uniq.size} 个视频`);
console.log(`本地库 ${byBvid.size} 个视频`);
console.log(`库中已有 ${diff.length} / 缺失 ${miss.length}`);

const withRatio = diff.filter((d) => d.ratio != null && d.lib_view > 0);
if (withRatio.length) {
  const rs = withRatio.map((d) => d.ratio).sort((a, b) => a - b);
  console.log(
    `voc_view / lib_view 比值：中位 ${rs[Math.floor(rs.length / 2)]} 最小 ${rs[0]} 最大 ${rs[rs.length - 1]}`,
  );
  console.log(`比值 <0.5 的条数 ${rs.filter((r) => r < 0.5).length} / ${rs.length} → 说明 vocabili 给的是**周期增量**而非累计值`);
}

// 按榜分开看：不同周期（日/周/月/年）的数值口径不同，混在一起会误判
console.log("\n--- 按榜的数值口径 ---");
for (const board of [...new Set(voc.map((r) => r.board))]) {
  const rs = [];
  for (const [bvid, r] of uniq) {
    if (r.board !== board) continue;
    const it = byBvid.get(bvid);
    if (!it || !it.view) continue;
    rs.push(+(r.view / it.view).toFixed(3));
  }
  if (!rs.length) {
    console.log(`  ${board}: 无可比对样本（全部缺失）`);
    continue;
  }
  rs.sort((a, b) => a - b);
  console.log(
    `  ${board}: 样本 ${rs.length} 比值中位 ${rs[Math.floor(rs.length / 2)]} 区间 ${rs[0]} ~ ${rs[rs.length - 1]}`,
  );
}

if (detail) {
  console.log("\n--- 本地库缺失（可补充） ---");
  for (const r of miss) {
    console.log(
      `${r.bvid}\t${r.name}\t歌姬=${r.girls.join("/") || "-"}\tP主=${r.producers.join("/") || "-"}\tview=${r.view} like=${r.like} reply=${r.reply} coin=${r.coin}\t[${r.board}#${r.issue}.${r.part}]`,
    );
  }
  console.log("\n--- 数值对照（前 15） ---");
  for (const d of diff.slice(0, 15)) {
    console.log(
      `${d.bvid}\t${d.name}\tvoc_view=${d.voc_view} lib_view=${d.lib_view} 比值=${d.ratio}\tvoc_like=${d.voc_like} lib_like=${d.lib_like}\t发布=${d.lib_pubdate}`,
    );
  }
}
