// 关联作品：基于标题/标签/简介的规则提取 + 可选 AI 补全，构建四类关联（同系列/翻唱重制/原曲/同专辑）。
// 关联结果仅限库内已收录条目，前端跳转站内 /video/:aid。
const fs = require("node:fs");
const path = require("node:path");
const aiReview = require("./aiReview");
const progress = require("./progress");
const config = require("./config");

const CACHE_DIR = path.join(__dirname, "..", "cache");
const INDEX_FILE = path.join(CACHE_DIR, "related_index.json");
const AI_CACHE_FILE = path.join(CACHE_DIR, "related_ai.json");

let _index = null; // { relations: { aid: [{aid,type}] }, ts }

// 歌姬名/合成引擎噪声词（提取核心歌名/系列名时剥离），用正则整体删除避免切坏多字名
const NOISE_RE = new RegExp(
  [
    "洛天依", "乐正绫", "乐正龙牙", "言和", "星尘", "心华", "诗岸", "摩柯", "徵羽摩柯",
    "初音未来", "镜音铃", "镜音连", "巡音流歌", "KAITO", "MEIKO", "GUMI", "IA", "ONE",
    "重音テト", "重音Teto", "波音律", "夏语遥", "佐藤ささき", "不可思議",
    "VOCALOID", "vocaloid", "Synthesizer ?V", "SynthesizerV", "Sv\\s*\\d?",
    "CeVIO", "cevio", "NEUTRINO", "V4", "V5", "UTAU", "utau", "Saki", "AI",
    "原创曲?", "原创", "中文", "日文", "Original", "original",
    "PV付?", "原创?PV", "自制", "曲", "歌",
  ].join("|"),
  "gi"
);

const SERIES_KW = /系列|企划|组曲|project|Project|PROJECT/;
const COVER_KW = /翻唱|cover|Cover|COVER|remix|Remix|REMIX|重制|翻调|调教|翻奏|rearrange|Rearrange|cover by|Cover by/;
const ALBUM_KW = /专辑|Album|ALBUM|收录曲|个人专辑|原创专辑/;

function brackets(title) {
  // 提取所有【】、[]、《》、『』、「」内的文本段
  const out = [];
  const re = /【([^】]*?)】|\[([^\]]*?)\]|《([^》]*?)》|『([^』]*?)』|「([^」]*?)」/g;
  let m;
  while ((m = re.exec(title || "")) !== null) {
    out.push((m[1] || m[2] || m[3] || m[4] || m[5] || "").trim());
  }
  return out.filter(Boolean);
}

function cleanNoise(s) {
  let r = (s || "").replace(NOISE_RE, " ");
  r = r.replace(/20\d{2}/g, " ").replace(/tr\.\s*\d+/gi, " ").replace(/\d{1,3}/g, " ");
  r = r.replace(/[\/×x·|｜\-—_·:：，,。.!?！？()（）]/gi, " ").replace(/\s+/g, " ").trim();
  return r;
}

// 提取系列标识：在【】段中找含系列关键词的段，去噪声归一化；无则返回空
function extractSeriesKey(title, tags) {
  const segs = brackets(title);
  let hit = "";
  for (const seg of segs) {
    if (SERIES_KW.test(seg)) {
      const c = cleanNoise(seg);
      // 去掉系列强词后须有专有名剩余，避免纯"企划/系列"泛词成键
      const rest = c.replace(SERIES_KW, " ").replace(/\s+/g, " ").trim();
      if (rest.length >= 2) hit = hit || c;
    }
  }
  if (hit) return hit.toLowerCase();
  // 兜底：标签含系列关键词
  for (const t of tags || []) {
    if (SERIES_KW.test(t)) {
      const c = cleanNoise(t);
      const rest = c.replace(SERIES_KW, " ").replace(/\s+/g, " ").trim();
      if (rest.length >= 2) return c.toLowerCase();
    }
  }
  return "";
}

// 提取专辑名：标题/简介中含专辑/收录曲关键词，取邻近『』或《》或「」内的名字
function extractAlbumKey(title, desc, tags) {
  const text = `${title || ""} ${desc || ""}`;
  if (!ALBUM_KW.test(text)) return "";
  // 优先取含专辑/收录曲关键词的【】/『』/《》段
  const segs = brackets(text);
  for (const seg of segs) {
    if (ALBUM_KW.test(seg)) {
      const c = cleanNoise(seg);
      if (c && c.length >= 2) return c.toLowerCase();
    }
  }
  // 取首个『』或《》段（常为专辑名）
  for (const seg of segs) {
    if (seg.length >= 2 && seg.length <= 30 && !SERIES_KW.test(seg) && !COVER_KW.test(seg)) {
      const c = cleanNoise(seg);
      if (c && c.length >= 2) return c.toLowerCase();
    }
  }
  return "";
}

// 是否为翻唱/重制/Remix 版本
function isCover(title) {
  return COVER_KW.test(title || "");
}

// 提取核心歌名：去【】、去《》、去修饰词、去歌姬名噪声，取剩余核心 token
function extractSongTitle(title) {
  let t = title || "";
  // 去所有括弧段（系列/专辑/歌姬标记）
  t = t.replace(/【[^】]*?】/g, " ").replace(/\[[^\]]*?\]/g, " ");
  t = t.replace(/《([^》]*?)》/g, "$1 "); // 保留《》内（常为歌名）
  t = t.replace(/『[^』]*?』/g, " ").replace(/「[^」]*?」/g, " ");
  // 去修饰词
  t = t.replace(COVER_KW, " ").replace(/原创曲|原创|原唱|原曲/g, " ");
  t = cleanNoise(t);
  // 取首个有意义的词组（歌名常在开头或《》内）
  // 若《》内有内容优先用
  const bookRe = /《([^》]*?)》/.exec(title || "");
  if (bookRe) {
    const c = cleanNoise(bookRe[1]);
    if (c && c.length >= 2) return c.toLowerCase();
  }
  return t ? t.toLowerCase() : "";
}

// ---- AI 补全：对规则无法提取系列/专辑/原曲的高价值项，让 AI 判定 ----
// 复用 aiReview 的 callAI + runTask（含 30s 限流、模型轮询）；独立缓存 related_ai.json
let _aiCache = null;
function loadAiCache() {
  if (_aiCache) return _aiCache;
  try { _aiCache = JSON.parse(fs.readFileSync(AI_CACHE_FILE, "utf8")) || {}; }
  catch (e) { _aiCache = {}; }
  return _aiCache;
}
function saveAiCache() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const tmp = AI_CACHE_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(_aiCache), "utf8");
  fs.renameSync(tmp, AI_CACHE_FILE);
}

const AI_PROMPT = `判断这个 B 站虚拟歌姬歌曲视频的关联信息。只返回 JSON，不要其他文字。
判断字段：
- series: 所属系列企划名（如"妄想症系列""世末系列""心城系列"），无则空字符串
- album: 所属专辑名（如"初心∞""杜子春"），无则空字符串
- is_cover: 是否为翻唱/重制/Remix 版本（1=是，0=否）
- song_title: 核心歌名（去掉歌姬名、系列标记、翻唱等修饰后的纯歌名）
示例：{"series":"心城系列","album":"","is_cover":0,"song_title":"薄暮城"}`;

async function aiAnalyzeOne(it) {
  // AI 关闭时直接返回空结果，且不写缓存：避免把空判定固化进 related_ai.json，恢复开关后无法补算
  if (!config.aiReview.enabled) {
    return { series: "", album: "", is_cover: 0, song_title: "" };
  }
  const cache = loadAiCache();
  const key = String(it.aid);
  if (cache[key]) return cache[key];
  const user = [
    `标题：${it.title || ""}`,
    `标签：${(it.tags || []).join("、")}`,
    `简介：${String(it.desc || "").slice(0, 300)}`,
  ].join("\n");
  let result = { series: "", album: "", is_cover: 0, song_title: "" };
  try {
    const out = await aiReview.runTask(async () => {
      progress.emit("related:ai", { aid: key, action: "calling" });
      const r = await aiReview.callAI([
        { role: "system", content: AI_PROMPT },
        { role: "user", content: user },
      ]);
      // 提取 JSON
      const m = /\{[\s\S]*\}/.exec(r.content || "");
      if (m) {
        try { result = JSON.parse(m[0]); } catch (e) { /* 保留默认空 */ }
      }
      return result;
    });
    result = out || result;
  } catch (e) {
    console.warn(`[related:ai] ${key} 失败: ${e.message}`);
  }
  cache[key] = result;
  saveAiCache();
  return result;
}

// ---- 索引构建 ----
function buildIndexFromItems(items) {
  const bySeries = new Map(); // seriesKey -> Set(aid)
  const byAlbum = new Map();
  const bySong = new Map(); // songTitle -> [{ aid, isCover, pubdate }]
  const relations = {}; // aid -> [{ aid, type }]

  const addRel = (a, b, type) => {
    if (String(a) === String(b)) return;
    if (!relations[a]) relations[a] = [];
    if (!relations[a].some((r) => String(r.aid) === String(b) && r.type === type)) {
      relations[a].push({ aid: Number(b), type });
    }
  };

  const meta = new Map(); // aid -> { series, album, songTitle, isCover, pubdate }
  for (const it of items) {
    if (!it || !it.aid) continue;
    const series = extractSeriesKey(it.title, it.tags) || (it._ai && it._ai.series) || "";
    const album = extractAlbumKey(it.title, it.desc, it.tags) || (it._ai && it._ai.album) || "";
    const cover = isCover(it.title) || (it._ai && it._ai.is_cover === 1);
    const song = extractSongTitle(it.title) || (it._ai && it._ai.song_title) || "";
    meta.set(Number(it.aid), { series, album, song, isCover: !!cover, pubdate: it.pubdate || 0 });
    if (series) { if (!bySeries.has(series)) bySeries.set(series, new Set()); bySeries.get(series).add(Number(it.aid)); }
    if (album) { if (!byAlbum.has(album)) byAlbum.set(album, new Set()); byAlbum.get(album).add(Number(it.aid)); }
    if (song) { if (!bySong.has(song)) bySong.set(song, []); bySong.get(song).push({ aid: Number(it.aid), isCover: !!cover, pubdate: it.pubdate || 0 }); }
  }

  // 同系列/同专辑：组内互关
  const linkGroup = (map, type) => {
    for (const [, set] of map) {
      const arr = [...set];
      for (let i = 0; i < arr.length; i++) {
        for (let j = 0; j < arr.length; j++) {
          if (i !== j) addRel(arr[i], arr[j], type);
        }
      }
    }
  };
  linkGroup(bySeries, "series");
  linkGroup(byAlbum, "album");

  // 翻唱/原曲：同一歌名组内，cover <-> 非cover（更早发布/非cover 视为原曲）
  for (const [, arr] of bySong) {
    if (arr.length < 2) continue;
    // 找组内非 cover 且最早发布的（原曲候选）
    const originals = arr.filter((x) => !x.isCover).sort((a, b) => a.pubdate - b.pubdate);
    const covers = arr.filter((x) => x.isCover);
    for (const c of covers) {
      for (const o of originals) {
        addRel(c.aid, o.aid, "original"); // 翻唱 -> 原曲
        addRel(o.aid, c.aid, "cover"); // 原曲 -> 翻唱版本
      }
      // 翻唱之间互为 cover 关联
      for (const c2 of covers) {
        if (c.aid !== c2.aid) addRel(c.aid, c2.aid, "cover");
      }
    }
    // 组内非cover之间若多条也互关为 cover（同歌不同版本）
    for (let i = 0; i < originals.length; i++) {
      for (let j = 0; j < originals.length; j++) {
        if (i !== j) addRel(originals[i].aid, originals[j].aid, "cover");
      }
    }
  }

  return { relations, ts: Date.now() };
}

async function loadItems() {
  // 复用 collector 的 getLibrary，确保拿到最新库
  const collector = require("./collector");
  return await collector.getLibrary();
}

async function buildIndex() {
  const items = await loadItems();
  if (!Array.isArray(items) || !items.length) return null;
  const idx = buildIndexFromItems(items);
  _index = idx;
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const tmp = INDEX_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(idx), "utf8");
  fs.renameSync(tmp, INDEX_FILE);
  const relCount = Object.keys(idx.relations).length;
  console.log(`[related] 索引构建完成：${items.length} 首，${relCount} 首有关联`);
  return idx;
}

function loadIndex() {
  if (_index) return _index;
  try { _index = JSON.parse(fs.readFileSync(INDEX_FILE, "utf8")); }
  catch (e) { _index = null; }
  return _index;
}

async function getRelated(aid, items) {
  const idx = loadIndex();
  if (!idx || !idx.relations) return [];
  const rels = idx.relations[String(aid)] || idx.relations[aid] || [];
  if (!rels.length) return [];
  // 关联目标需在库内才返回
  const itemMap = new Map();
  if (Array.isArray(items)) {
    for (const it of items) if (it && it.aid) itemMap.set(Number(it.aid), it);
  }
  const out = [];
  for (const r of rels) {
    const target = itemMap.get(Number(r.aid));
    if (!target) continue;
    out.push({
      aid: Number(target.aid),
      bvid: target.bvid,
      title: target.title,
      pic: target.pic,
      type: r.type,
      score: target.score,
      view: target.view,
      pubdate: target.pubdate,
    });
  }
  return out;
}

// ---- AI 补全 worker：对规则无法提取系列/专辑且高价值的项跑 AI ----
let _aiBusy = false;
let _aiWorkerStarted = false;

// 选出待 AI 补全的项：规则未提取出 series/album/song 的高分或上榜项
async function pickAiPending(items, limit = 300) {
  const pending = [];
  const cache = loadAiCache();
  for (const it of items) {
    if (!it || !it.aid) continue;
    if (cache[String(it.aid)]) continue;
    const series = extractSeriesKey(it.title, it.tags);
    const album = extractAlbumKey(it.title, it.desc, it.tags);
    const song = extractSongTitle(it.title);
    // 规则已全部提取清楚的不补
    if (series && album && song) continue;
    pending.push(it);
  }
  // 优先高分（已在榜单前列的更值得关联）
  pending.sort((a, b) => (b.score || 0) - (a.score || 0));
  return pending.slice(0, limit);
}

async function reviewRelatedAi({ batch = 10, limit = 300 } = {}) {
  if (_aiBusy) return 0;
  _aiBusy = true;
  try {
    const items = await loadItems();
    const pending = await pickAiPending(items, limit);
    if (!pending.length) return 0;
    let done = 0;
    let enriched = 0;
    progress.setReviewState({ aiRelatedRunning: true, aiRelatedPending: pending.length, aiRelatedDone: 0 });
    for (const it of pending.slice(0, batch)) {
      done++;
      const before = { series: extractSeriesKey(it.title, it.tags), album: extractAlbumKey(it.title, it.desc, it.tags), song: extractSongTitle(it.title) };
      const ai = await aiAnalyzeOne(it);
      // 仅当规则缺失且 AI 有结果时记为补充
      const gained = (ai.series && !before.series) || (ai.album && !before.album) || (ai.song_title && !before.song);
      if (gained) enriched++;
      progress.setReviewState({ aiRelatedPending: pending.length, aiRelatedDone: done, aiRelatedEnriched: enriched });
    }
    progress.setReviewState({ aiRelatedRunning: false, aiRelatedPending: 0, aiRelatedDone: done, aiRelatedEnriched: enriched });
    // 补完后重建索引（_ai 字段并入）
    await rebuildWithAi(items);
    console.log(`[related:ai] 本轮补全 ${done} 项，新增信息 ${enriched} 项`);
    return done;
  } finally {
    _aiBusy = false;
  }
}

// 将 AI 缓存并入 items 后重建索引
async function rebuildWithAi(items) {
  const cache = loadAiCache();
  const enriched = items.map((it) => {
    const ai = cache[String(it.aid)];
    return ai ? { ...it, _ai: ai } : it;
  });
  const idx = buildIndexFromItems(enriched);
  _index = idx;
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const tmp = INDEX_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(idx), "utf8");
  fs.renameSync(tmp, INDEX_FILE);
  const relCount = Object.keys(idx.relations).length;
  console.log(`[related] AI 补全后索引重建：${relCount} 首有关联`);
  return idx;
}

async function startRelatedWorker({ idleMs = 60000, batch = 10, limit = 300 } = {}) {
  if (_aiWorkerStarted) return;
  _aiWorkerStarted = true;
  console.log("[related] 关联索引 worker 已启动");
  // 启动时先构建一次纯规则索引（不等 AI）
  try { await buildIndex(); } catch (e) { console.error(`[related] 初始构建失败: ${e.message}`); }
  (async function loop() {
    try {
      if (!_aiBusy) {
        const n = await reviewRelatedAi({ batch, limit });
        if (n === 0) progress.setReviewState({ aiRelatedRunning: false });
      }
    } catch (e) {
      console.error(`[related] worker 循环异常: ${e.message}`);
    }
    setTimeout(loop, idleMs);
  })();
}

module.exports = {
  buildIndex,
  getRelated,
  startRelatedWorker,
  // 导出规则函数便于测试
  extractSeriesKey,
  extractAlbumKey,
  extractSongTitle,
  isCover,
};
