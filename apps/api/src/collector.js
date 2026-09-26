const path = require("node:path");
const fs = require("node:fs");
const config = require("./config");
const bili = require("./bili");
const score = require("./score");
const aiReview = require("./aiReview");
const statHistory = require("./statHistory");
const evocalrank = require("./evocalrank");
const progress = require("./progress");
const { canonicalGirls } = require("./girls");

// ---- 分区与采集参数（移植自旧 python bili_query.py）----
const VOCA_RID = 30;
const MUSIC_RID = 3;
const SEARCH_PAGES = 6;
const UP_POOL_LIMIT = 80;
const UP_PAGES = 3;

const V_KEYWORDS = [
  "洛天依", "言和", "乐正绫", "心华", "星尘", "赤羽", "海伊", "诗岸",
  "夏语遥", "重音teto", "初音未来", "初音ミク", "镜音铃", "镜音连",
  "巡音流歌", "结月缘", "VOCALOID", "UTAU", "CeVIO", "虚拟歌手",
];

// ---- 过滤规则（与原 python 完全一致）----
const AI_RE = /AI\s*(翻唱|演唱|cover|音|声|替换|重制)|AI音色|AI替换|AI生成|生成式|Suno|SoVITS|RVC|DiffSinger|人声替换|换声|混声|AI调校/i;

const TITLE_FILTER_RE = /转载|搬运|合集|收藏夹|盘点|排行|榜单|排行榜|精选|回放|直播|重传|补档|转投|剪辑集|催更|自存|动态|串烧|Cover合集|翻唱合集|每周|每日|月榜|周榜|新歌榜|热门榜|作品推荐|曲目推荐|推荐榜|推荐曲|安利|推荐向|下饭|歌单|补档计划|入坑|新人入坑|路人|盘点视频|TOP\d+|top\d+/i;

const DESC_HARD_RE = /转载自|搬运自|转自|無断転載|未经授权转载|未经授权搬运|原投稿|投稿者已删|二传|盗稿|盗曲|niconico|n站|youtube|youtu\.be|sm\d{4,}|周刊|榜单|排行榜|新曲榜|月榜|周榜|新歌榜|热门榜|熟肉|中文字幕|自翻译|汉化组|字幕组|翻译组|烤曲|MMD|Project DIVA|宅舞|音游|谱面|自制谱|maimai|Majplay|缤纷舞台|世界计划|Project SEKAI|歌姬计划|节奏游戏|绘画过程|绘图过程|曲绘过程|非法调音|三创|示例工程|企划终止|直播回放|攻略|实况|通关|教程|杂谈|资讯|公告|避雷|本期素材|配队|遗器|侵删|联系就删|侵权就删|侵必删/i;

const HARD_FILTER_RE = /搬运|转载|翻录|無断転載|二传|盗稿|补档|重传|转投|niconico|n站|youtube|youtu\.be|sm\d{4,}|排行|榜单|排行榜|周刊|新曲榜|月榜|周榜|新歌榜|热门榜|盘点|合集|三创|熟肉|字幕|自翻译|汉化|烤曲|音游|谱面|自制谱|maimai|Majplay|MASTER|EXPERT|缤纷舞台|世界计划|Project SEKAI|歌姬计划|节奏游戏|MMD|Project DIVA|PJD|宅舞|攻略|实况|通关|教程|示例工程|企划终止|杂谈|资讯|公告|绘画过程|绘图过程|曲绘过程|非法调音|TOP\d+|top\d+|直播/i;

const SONG_TITLE_RE = /原创|翻唱|翻调|翻填|填词|cover|COVER|歌|曲|单曲|术曲|新曲|Song|Sing|feat/i;
const SONG_TAG_RE = /原创|翻唱|cover|COVER|填词|音乐|歌曲|曲|单曲|新曲|中文VOCALOID曲|术曲/i;
const SONG_DESC_RE = /作词|作曲|编曲|调教|混音|演唱|词曲|歌名|PV|pv|翻填|翻唱|原创|歌曲|诗与歌|一首|作品|新歌|staff|歌词/i;
const TITLE_PUNCT_RE = /[，。、！？；：]/;

// 识别词表：标准名 + 常见异名写法（日文/繁体/英文）。
// 命中的原始写法会经 canonicalGirls() 归一到标准名再入库，
// 避免同一歌姬因写法不同被拆成多份统计（详见 src/girls.js）。
const VOCA_GIRLS = [
  "洛天依", "言和", "乐正绫", "乐正龙牙", "徵羽摩柯", "墨清弦",
  "心华", "星尘infinity", "星尘", "赤羽", "苍穹", "海伊", "牧心",
  "诗岸", "艾尔法", "琴语", "夏语遥", "燕音凤", "绮萱", "苍羽",
  "初音未来", "初音ミク", "初音miku", "miku", "初音未來", "hatsune miku",
  "镜音铃", "镜音连", "镜音双子", "鏡音リン", "鏡音レン", "鏡音鈴", "鏡音連",
  // 合称写法：命中后由 canonicalGirls() 展开为「镜音铃」+「镜音连」两位（详见 src/girls.js）
  "镜音铃·连", "鏡音リン・レン", "鏡音リンレン", "kagamine rin/len",
  "巡音流歌", "巡音ルカ", "meiko", "kaito", "ia", "megu", "gumi", "mayu",
  "结月缘", "绁月縁", "重音teto", "重音テト", "音街鳗", "vy1", "vy2",
  "歌爱雪", "冰山清辉", "猪音P", "妖怪饴",
  // 繁体/异体写法（港台投稿常见）
  "樂正綾", "樂正龍牙", "徵羽摩柯", "墨清絃", "心華", "星塵",
  "詩岸", "蒼穹", "夏語遙", "艾爾法", "綺萱", "蒼羽",
  "結月ゆかり", "歌愛雪", "音街ウナ",
];

const VOCA_TAG_HIT = [
  "vocaloid", "utau", "synthesizer v", "synthv", "cevio", "neutrino",
  "虚拟歌手", "歌声合成", "歌声合成软件", "v学",
  "洛天依", "言和", "乐正绫", "乐正龙牙", "徵羽摩柯", "墨清弦",
  "心华", "星尘", "星尘infinity", "赤羽", "苍穹", "海伊", "牧心",
  "诗岸", "艾尔法", "琴语", "夏语遥", "燕音凤", "绮萱", "苍羽",
  "初音未来", "初音ミク", "miku", "镜音铃", "镜音连", "镜音双子",
  "巡音流歌", "meiko", "kaito", "ia", "megu", "gumi", "mayu",
  "结月缘", "绁月縁", "重音teto", "音街鳗", "vy1", "vy2",
  "歌爱雪", "冰山清辉", "猪音P", "妖怪饴", "心华v4", "洛天依v4",
  "言和v3", "乐正绫v3", "vsinger", "五维介质", "平行四界", "禾念",
  "南北组", "百合侠", "虚拟歌姬",
];

const _EN_SLUG = /^[A-Za-z0-9]/;

function nameRe(name) {
  if (_EN_SLUG.test(name)) {
    return new RegExp("(?<![A-Za-z0-9])" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![A-Za-z0-9])", "i");
  }
  return new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
}

const GIRL_RES = VOCA_GIRLS.map((g) => [g, nameRe(g)]);
const HIT_RES = VOCA_TAG_HIT.map((k) => [k, nameRe(k)]);

function stripHtml(s) {
  return String(s || "").replace(/<[^>]+>/g, "");
}

function parseDuration(dur) {
  const parts = String(dur || "0").split(":").map((x) => parseInt(x, 10) || 0);
  let sec = 0;
  for (const p of parts) sec = sec * 60 + p;
  return sec;
}

function classifyLang(text) {
  const s = String(text || "");
  let han = 0;
  let kana = 0;
  let latin = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (c >= 0x4e00 && c <= 0x9fff) han++;
    else if (c >= 0x3040 && c <= 0x30ff) kana++;
    else if (/[A-Za-z]/.test(ch)) latin++;
  }
  const total = han + kana + latin;
  if (total === 0) return "other";
  if (kana && kana * 2 >= han) return "jp";
  if (han === 0 && latin >= total * 0.5) return "en";
  if (han && han >= Math.max(kana, latin * 0.6)) return "cn";
  return "other";
}

function extractGirls(text) {
  const s = String(text || "");
  const found = [];
  for (const [g, rx] of GIRL_RES) {
    if (rx.test(s) && !found.some((o) => g !== o && g.length < o.length && o.includes(g))) {
      if (!found.some((o) => o === g)) found.push(g);
    }
  }
  // 归一：初音ミク / miku / 初音未来 → 初音未来；星尘infinity → 星尘 等
  return canonicalGirls(found);
}

function tagHit(tags, title = "") {
  const text = String(title || "") + " " + (tags || []).map((t) => t.tag_name || "").join(" ");
  return HIT_RES.some(([, rx]) => rx.test(text));
}

function hasSongEvidence(title, tagNames, desc = "") {
  const tags = (tagNames || []).join(" ");
  return SONG_TITLE_RE.test(title || "")
    || SONG_TAG_RE.test(tags)
    || SONG_DESC_RE.test(desc || "")
    || TITLE_PUNCT_RE.test(title || "");
}

function hardHit(text) {
  return Boolean(text) && HARD_FILTER_RE.test(text);
}

// ---- 缓存 ----
const CACHE_DIR = path.join(__dirname, "..", "cache");
const LIBRARY_FILE = path.join(CACHE_DIR, "library.json");

let _library = null;
let _at = 0;
let _lock = null;
const TTL = 6 * 3600 * 1000;
// 增量采集最小间隔：refreshLibrary 每小时触发一次 collectAll，
// 磁盘库缓存超过该时长才执行真实采集，否则复用并仅补写当日快照
const INCREMENTAL_TTL = 60 * 60 * 1000;

function readDisk() {
  try {
    return JSON.parse(fs.readFileSync(LIBRARY_FILE, "utf8"));
  } catch (e) {
    return null;
  }
}

function writeDisk(total, data, complete = false) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const tmp = LIBRARY_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify({ ts: Date.now(), total, complete, data }), "utf8");
  fs.renameSync(tmp, LIBRARY_FILE);
}

// 派生产物落盘（desc/审核 worker 合并写回）：保留原始 ts，避免刷新"采集新鲜度"信号。
// 否则每次落盘都把 library.json.ts 更新为当前时间，导致 collectAll 的 INCREMENTAL_TTL
// 判定"缓存仍新鲜跳过采集"，B 站统计数值永不刷新 → 日/周增量榜 delta 恒 0 → 榜单空。
function writeDiskKeepTs(total, data, complete = false) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const disk = readDisk();
  const keepTs = (disk && disk.ts) || 0;
  const tmp = LIBRARY_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify({ ts: keepTs, total, complete, data }), "utf8");
  fs.renameSync(tmp, LIBRARY_FILE);
}

// 供 services 复用：读当前全库（磁盘 + 内存）
async function getLibrary() {
  if (_library && Date.now() - _at < TTL) return _library;
  const cached = readDisk();
  if (cached && Array.isArray(cached.data)) {
    _library = cached.data;
    _at = cached.ts || 0;
    return _library;
  }
  return [];
}

async function _getClient() {
  return bili.getClient();
}

let _lastReqAt = 0;
async function _throttle(ms = 220) {
  const now = Date.now();
  const wait = _lastReqAt + ms - now;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  _lastReqAt = Date.now();
}

async function _apiGet(client, url, params, auth) {
  await _throttle();
  return client.get(url, params, auth);
}

// 候选收集：newlist + 关键词检索 + 大分区排行 up 名单 + up 全量投稿
async function fetchCandidates(client, sdk) {
  const cand = new Map();
  const upPool = new Map();

  const keep = (list) => {
    for (const it of list || []) {
      const tid = Number(it.tid ?? it.typeid ?? it.type_id);
      if (it && it.aid && tid === VOCA_RID) {
        cand.set(String(it.aid), it);
        const mid = it.mid || it.owner?.mid;
        const name = it.author || it.owner?.name || "";
        if (mid) upPool.set(String(mid), { mid: String(mid), name });
      }
    }
  };

  // 1) 分区最新投稿流（music 分区）
  progress.updateStage("newlist", { label: "分区最新投稿流", total: 4, done: 0 });
  for (let pn = 1; pn <= 4; pn++) {
    try {
      const r = await _apiGet(client, "/x/web-interface/newlist", { rid: String(MUSIC_RID), type: "0", pn: String(pn), ps: "30" }, "cookie");
      keep((r.data?.archives) || []);
    } catch (e) {
      console.error(`[collector] newlist p${pn}: ${e.message}`);
    }
    progress.updateStage("newlist", { done: pn, kept: cand.size });
  }
  progress.emit("stage:detail", { stage: "newlist", msg: `分区最新流收集完成，累计 ${cand.size} 个候选` });

  // 2) 关键词检索 + 收集 up
  const kwTotal = V_KEYWORDS.length * SEARCH_PAGES;
  let kwDone = 0;
  progress.updateStage("search", { label: "关键词检索", total: kwTotal, done: 0, kept: cand.size });
  for (const kw of V_KEYWORDS) {
    for (let pn = 1; pn <= SEARCH_PAGES; pn++) {
      try {
        await _throttle();
        const r = await sdk.search(client, { keyword: kw, page: pn, pageSize: 50, type: 3, order: "pubdate" });
        for (const block of r?.data?.result || []) {
          if (!block || block.result_type !== "video") continue;
          for (const it of block.data || []) {
            if (!it || !it.aid) continue;
            if (Number(it.tid ?? it.typeid ?? it.type_id) === VOCA_RID) {
              cand.set(String(it.aid), it);
              if (it.mid) upPool.set(String(it.mid), { mid: String(it.mid), name: it.author || "" });
            }
          }
        }
      } catch (e) {
        console.error(`[collector] search "${kw}" p${pn}: ${e.message}`);
      }
      kwDone++;
      progress.updateStage("search", { done: kwDone, kept: cand.size });
    }
  }
  progress.emit("stage:detail", { stage: "search", msg: `关键词搜索完成，累计 ${cand.size} 个候选` });

  // 3) 大分区排行补充 up 名单
  progress.updateStage("ranking", { label: "大分区排行 up 名单", total: 1, done: 0 });
  try {
    const r = await _apiGet(client, "/x/web-interface/ranking/v2", { rid: String(MUSIC_RID), type: "all", day_type: "3" }, "cookie");
    for (const it of (r.data?.list) || []) {
      const owner = it?.owner || {};
      if (owner.mid && owner.name) upPool.set(String(owner.mid), owner);
    }
  } catch (e) {
    console.error(`[collector] ranking: ${e.message}`);
  }
  progress.updateStage("ranking", { done: 1, upCount: upPool.size });
  progress.emit("stage:detail", { stage: "ranking", msg: `排行 up 名单 ${upPool.size} 个` });

  // 4) up 全量投稿覆盖历史
  const upList = [...upPool.entries()].slice(0, UP_POOL_LIMIT);
  progress.updateStage("upPosts", { label: "UP 投稿扫描", total: upList.length, done: 0, kept: cand.size });
  let scanned = 0;
  for (const [mid] of upList) {
    if (scanned >= UP_POOL_LIMIT) break;
    scanned++;
    for (let pn = 1; pn <= UP_PAGES; pn++) {
      try {
        const r = await _apiGet(client, "/x/space/wbi/arc/search", { mid, ps: "50", pn: String(pn), order: "pubdate" }, "wbi");
        const vl = (r.data?.list?.vlist) || [];
        if (!vl.length) break;
        keep(vl);
      } catch (e) {
        break;
      }
    }
    progress.updateStage("upPosts", { done: scanned, kept: cand.size });
  }
  progress.emit("stage:detail", { stage: "upPosts", msg: `UP 投稿扫描完成，累计 ${cand.size} 个候选` });

  // 5) evocalrank 周刊虚拟歌手中文曲排行榜：全部期的视频链接（补充中文歌历史）
  let evoTotal = 0;
  progress.updateStage("evocalrank", { label: "evocalrank 历期", total: 0, done: 0, kept: cand.size });
  try {
    const evoAids = await evocalrank.collectAllAids((done, total, uniq) => {
      progress.updateStage("evocalrank", { total, done, kept: cand.size + uniq });
    });
    for (const r of evoAids) {
      cand.set(r.avid, { aid: r.avid, bvid: r.bvid || "", title: r.title || "", typeid: VOCA_RID, source: "evocalrank" });
    }
    evoTotal = evoAids.length;
    console.log(`[collector] evocalrank 候选 ${evoAids.length} 个`);
  } catch (e) {
    console.error(`[collector] evocalrank 收集失败: ${e.message}`);
  }
  progress.emit("stage:detail", { stage: "evocalrank", msg: `evocalrank 收集 ${evoTotal} 个，累计候选 ${cand.size}` });

  return cand;
}

// 逐条判定：最终以 SDK 拉取的视频信息为准，应用过滤，产出 board item
async function buildItem(client, sdk, aid, it) {
  const candTitle = stripHtml(it.title || "");
  if (AI_RE.test(candTitle) || TITLE_FILTER_RE.test(candTitle)) return null;

  const view = await bili.video(aid);
  if (!view?.ok || !view.data) return null;
  const data = view.data;
  const title = data.title || candTitle;
  if (AI_RE.test(title) || TITLE_FILTER_RE.test(title)) return null;

  const tagNames = (data.tags || []).map((t) => t.tag_name || "");
  if (AI_RE.test(tagNames.join(" "))) return null;
  // 标签 + 标题含虚拟歌手证据（合成软件名 / 歌姬名任一命中）才收录
  if (!tagHit(tagNames, title)) return null;

  const desc = data.desc || "";
  // 强信号：标题 + 标签直接拒
  if (hardHit(`${title} ${tagNames.join(" ")}`)) return null;
  // 简介强信号
  if (DESC_HARD_RE.test(desc)) return null;
  // 歌曲证据
  if (!hasSongEvidence(title, tagNames, desc)) return null;

  const duration = Number(data.duration) || 0;
  if (duration < 120) return null;

  const stat = {
    view: data.stat?.view || 0,
    danmaku: data.stat?.danmaku || 0,
    favorite: data.stat?.favorite || 0,
    coin: data.stat?.coin || 0,
    like: data.stat?.like || 0,
    reply: data.stat?.reply || 0,
    share: data.stat?.share || 0,
  };
  const ownerMid = data.owner?.mid;
  const staff = (data.staff || [])
    .filter((s) => Number(s.mid) && Number(s.mid) !== Number(ownerMid))
    .map((s) => ({ mid: s.mid, name: s.name || "", title: s.title || "", face: s.face || "" }));
  return {
    aid: Number(aid),
    bvid: data.bvid || it.bvid || "",
    title,
    pic: String(data.pic || it.pic || "").replace(/^http:\/\//, "https://"),
    duration,
    pubdate: data.pubdate || it.pubdate || 0,
    lang: classifyLang(title),
    score: score.compositeScore(stat, score.WEIGHTS),
    tags: tagNames,
    girls: extractGirls(`${title} ${tagNames.join(" ")}`),
    desc: (data.desc || "").slice(0, 1000), // 简介用于关联作品（系列/专辑/原曲）识别，截断控体积
    ...stat,
    staff,
    owner: { mid: data.owner?.mid || 0, name: data.owner?.name || "", face: data.owner?.face || "" },
    ai_reviewed: false, // 待独立后台审核 worker 判定是否真实虚拟歌姬演唱（解耦：不阻塞采集）
  };
}

// 合并式入库：把本轮采集结果合并到上一轮库之上。
//
// 背景（2026-09-26 事故）：此前 collectAll 是「全量覆盖」——out 直接替换磁盘库。
// 一旦某轮采集通道抖动（如今早 B 站登录态失效导致需要 wbi 签名的 UP 投稿扫描全线失败），
// 本轮没抓到的历史收录会**静默消失**：09-25 快照 7354 首 → 次日库仅 6975 首，丢了 399 首，
// 直接表现为热门曲（如「窗」）从榜首失踪。改为合并后此类抖动最多导致数据陈旧，不再丢条目。
//
// 规则：
//   1. 本轮抓到的条目以最新值为准（覆盖旧记录的统计值）；
//   2. 本轮未抓到、但上一轮库里有的条目**保留**，标记 stale=true（数据沿用上一轮）；
//   3. AI 审核结论（ai_reviewed）继承，避免每次采集把已审条目打回待审重跑一轮审核；
//   4. desc（简介，worker 补齐用于关联识别）若本轮为空则继承旧值。
function mergeWithPrev(fresh, prev) {
  const map = new Map();
  for (const p of prev || []) {
    if (p && p.aid) map.set(String(p.aid), p);
  }
  for (const f of fresh) {
    if (!f || !f.aid) continue;
    const key = String(f.aid);
    const old = map.get(key);
    if (!old) {
      map.set(key, { ...f, stale: false });
      continue;
    }
    map.set(key, {
      ...old,
      ...f,
      desc: f.desc || old.desc || "",
      ai_reviewed: old.ai_reviewed === true ? true : Boolean(f.ai_reviewed),
      stale: false,
    });
  }
  const freshKeys = new Set((fresh || []).map((f) => String(f.aid)));
  const out = [...map.values()];
  let kept = 0;
  for (const o of out) {
    if (!freshKeys.has(String(o.aid))) {
      o.stale = true;
      kept++;
    }
  }
  if (kept) {
    console.log(`[collector] 合并保留上一轮未被本轮重抓到的条目 ${kept} 首（标记 stale，数据沿用上轮）`);
    progress.emit("stage:detail", { stage: "merge", msg: `合并保留 ${kept} 首未重抓条目` });
  }
  return out;
}

// 全量采集（从零 / 重建）。磁盘已有完整且新鲜的库时直接复用。
async function collectAll(force = false) {
  // 已有一个周期在跑则不开启新周期（让上层 SSE 客户端看得到 currentCycle）
  if (progress.getCurrentCycle()) {
    throw new Error("采集中，请等待当前周期完成");
  }
  // 与 collectAll 的内存锁共存（避免被叠加触发）
  if (_lock) return _lock;
  const cycle = progress.newCycle(force ? "full" : "incremental");
  _lock = (async () => {
    const cached = readDisk();
    if (!force && cached && cached.complete === true && Array.isArray(cached.data) && cached.data.length && Date.now() - (cached.ts || 0) < INCREMENTAL_TTL) {
      _library = cached.data;
      _at = cached.ts || 0;
      progress.emit("stage:detail", { stage: "init", msg: "库缓存仍新鲜，跳过采集" });
      // 即使命中缓存也补写当日快照，避免 stat_daily 缺天导致榜单历史对比断档
      try {
        const day = statHistory.saveDailySnapshot(_library);
        progress.emit("stage:detail", { stage: "snapshot", msg: `已补写 ${day} 快照（${_library.length} 首）` });
      } catch (e) {
        console.error(`[collector] 补写快照失败: ${e.message}`);
      }
      progress.endCycle();
      return _library;
    }
    progress.emit("stage:detail", { stage: "init", msg: `开始${force ? "全量" : "增量"}采集` });
    console.log("[collector] 开始全量采集（SDK 搜索）…");
    const started = Date.now();
    const client = await _getClient();
    const sdk = await import("@aemeath-projects/bilibili");
    const cand = await fetchCandidates(client, sdk);
    const aids = [...cand.keys()];
    progress.bumpStat("candidates", aids.length);
    progress.emit("stage:detail", { stage: "candidates", msg: `共 ${aids.length} 个候选，开始逐条校验` });
    console.log(`[collector] 候选 ${aids.length} 个，开始逐条校验…`);
    const out = [];
    let done = 0;
    progress.updateStage("verify", { label: "逐条校验 + AI 审核", total: aids.length, done: 0, kept: 0 });
    for (const aid of aids) {
      const it = cand.get(aid);
      let item = null;
      try {
        item = await buildItem(client, sdk, aid, it);
      } catch (e) {
        /* skip */
        progress.bumpStat("errors");
      }
      if (item) {
        out.push(item);
        progress.bumpStat("kept");
      }
      done++;
      if (done % 10 === 0 || done === aids.length) {
        progress.updateStage("verify", { done, kept: out.length });
      }
      if (done % 50 === 0) {
        console.log(`[collector] 处理 ${done}/${aids.length}，收录 ${out.length}`);
        // 中途落盘同样走合并，避免采集进程中断后磁盘只剩半套库
        writeDisk(0, mergeWithPrev(out, cached && Array.isArray(cached.data) ? cached.data : []), false);
      }
    }
    out.sort((a, b) => b.score - a.score);
    // 合并上一轮未重抓到的条目，避免单轮通道失效造成历史收录静默丢失
    const merged = mergeWithPrev(out, cached && Array.isArray(cached.data) ? cached.data : []);
    merged.sort((a, b) => b.score - a.score);
    _library = merged;
    _at = Date.now();
    writeDisk(merged.length, merged, true);
    // 写入当日 stat 快照（用于增量榜单计算）
    try {
      const day = statHistory.saveDailySnapshot(merged);
      console.log(`[collector] 已写入 ${day} 快照（${merged.length} 首）`);
      progress.emit("stage:detail", { stage: "snapshot", msg: `已写入 ${day} 快照（${merged.length} 首）` });
    } catch (e) {
      console.error(`[collector] 写快照失败: ${e.message}`);
    }
    console.log(`[collector] 采集完成：本轮收录 ${out.length}/${aids.length}（合并后库存 ${merged.length}），耗时 ${((Date.now() - started) / 1000).toFixed(1)}s`);
    progress.emit("stage:detail", { stage: "done", msg: `完成：本轮收录 ${out.length}/${aids.length}，库存 ${merged.length}` });
    return merged;
  })();
  try {
    const result = await _lock;
    progress.endCycle();
    return result;
  } catch (e) {
    progress.endCycle(e.message);
    throw e;
  } finally {
    _lock = null;
  }
}

// ---- 独立后台 AI 审核 worker（解耦采集与审核）----
// 采集只做确定性过滤并快速落库（标记 ai_reviewed:false）；AI 审核（30s/个限流）由本
// worker 在采集周期之外独立、串行地消化存量待审项，避免审核拖慢采集或把新数据卡住。
let _reviewLock = null;
let _reviewBusy = false;

// 审核单个待审项：通过则标 ai_reviewed:true，明确不合规返回 null（调用方剔除）。
//
// 重要（2026-09-26 事故修复）：aiReview.check 对「AI 故障」「AI 无法判定」也返回
// pass=false（fail-closed 口径），但这是**上游瞬时问题，不是内容判定结论**。
// 若据此把条目从库里剔除并落盘，AI 上游一挂（如 503）就会持续吞噬全库——
// 表现为库存条目一天天变少、热门曲凭空从榜单消失（典型：洛天依《窗》）。
// 因此这类结果一律**保留条目并维持待审**，等下一轮重试；只有内容层面的明确拒绝才剔除。
async function reviewOne(it) {
  const ctx = {
    title: it.title || "",
    tags: it.tags || [],
    desc: "",
    duration: it.duration || 0,
  };
  const review = await aiReview.check(String(it.aid), ctx);
  if (!review.pass) {
    const reason = String(review.reason || "");
    if (reason === "AI故障" || reason.startsWith("AI无法判定")) {
      console.log(`[collector:review] ${it.aid} ${reason}，保留待下一轮重试`);
      return it; // 维持 ai_reviewed:false，不剔除
    }
    console.log(`[collector:review] AI 拒绝 ${it.aid}: ${review.reason}`);
    return null;
  }
  return { ...it, ai_reviewed: true };
}

// 扫描当前库中所有待审项，逐个审核并按结果更新内存库，合并落盘。
// 与采集共享 _library 内存缓存；写盘采用「合并式」——只把本轮审核结论应用到磁盘库，
// 不整体覆盖，避免采集期间/刚结束写入的新数据被旧批次覆盖（彻底规避竞态）。
async function reviewPending({ batch = 20, persistEvery = 10 } = {}) {
  if (_reviewLock) return _reviewLock;
  _reviewLock = (async () => {
    let items = await getLibrary();
    if (!Array.isArray(items)) items = [];
    const pendingIdx = items
      .map((it, i) => (it && it.ai_reviewed === false ? i : -1)) // 仅审明确标记待审的新项，历史项视为已审
      .filter((i) => i >= 0);
    if (!pendingIdx.length) {
      return 0;
    }
    const reviewedMap = new Map(); // aid -> item(通过) 或 null(剔除)
    let keep = 0;
    let drop = 0;
    let done = 0;
    progress.setReviewState({ running: true, pending: pendingIdx.length, done: 0 });
    for (const idx of pendingIdx.slice(0, batch)) {
      done++;
      const result = await reviewOne(items[idx]);
      if (result == null) {
        reviewedMap.set(String(items[idx].aid), null);
        drop++;
      } else {
        reviewedMap.set(String(result.aid), result);
        keep++;
      }
      progress.setReviewState({ pending: pendingIdx.length, done, kept: keep, dropped: drop, running: done < batch });
      if (done % persistEvery === 0) await tryPersistReview(reviewedMap);
    }
    // 更新内存库：应用本轮审核结论
    if (reviewedMap.size) {
      _library = (await getLibrary())
        .map((it) => (reviewedMap.has(String(it.aid)) ? reviewedMap.get(String(it.aid)) : it))
        .filter(Boolean);
      _at = Date.now();
    }
    await tryPersistReview(reviewedMap);
    progress.setReviewState({ pending: 0, done, kept: keep, dropped: drop, running: false });
    console.log(`[collector:review] 本轮审核 ${done} 项：通过 ${keep}，剔除 ${drop}`);
    return done;
  })();
  try {
    return await _reviewLock;
  } finally {
    _reviewLock = null;
  }
}

// 把本轮审核结论合并到磁盘库后写回：aid 已在磁盘库则更新/剔除，不在则忽略（可能已被采集覆盖/删除）。
// 不再整库覆盖，避免覆盖采集刚写入的新数据。
async function tryPersistReview(reviewedMap) {
  if (!reviewedMap || reviewedMap.size === 0) return true;
  try {
    const disk = readDisk();
    const cur = disk && Array.isArray(disk.data) ? disk.data : [];
    const seen = new Set();
    const merged = [];
    for (const it of cur) {
      const key = String(it?.aid);
      if (reviewedMap.has(key)) {
        const repl = reviewedMap.get(key);
        if (repl != null) merged.push(repl);
        seen.add(key);
      } else {
        merged.push(it);
      }
    }
    // 补遗漏：磁盘上可能没有但审核结论要保留的（异常情况，兜底）
    for (const [key, repl] of reviewedMap) {
      if (repl != null && !seen.has(key)) merged.push(repl);
    }
    // 防暴跌保护：单轮移除量超过磁盘库存 2% 且多于 20 首时判定异常，拒绝落盘并告警。
    // 正常的内容拒绝是零星个位数；出现批量移除只可能是上游异常或逻辑缺陷。
    const removed = cur.length - merged.length;
    if (removed > Math.max(20, Math.ceil(cur.length * 0.02))) {
      console.error(
        `[collector:review] 异常：本轮将移除 ${removed} 首（库存 ${cur.length} → ${merged.length}），` +
          `超过安全阈值，已拒绝落盘并保留本轮结论待人工核查`,
      );
      progress.setReviewState({});
      return false;
    }
    writeDiskKeepTs(merged.length, merged, disk ? disk.complete : true);
    return true;
  } catch (e) {
    console.error(`[collector:review] 落盘失败: ${e.message}`);
    return false;
  }
}

// 后台常驻循环：不断扫描消化待审项，审完一批后短暂休息再扫（等待新增待审项）。
let _reviewWorkerStarted = false;
async function startReviewWorker({ idleMs = 15000, batch = 20 } = {}) {
  if (_reviewWorkerStarted) return;
  _reviewWorkerStarted = true;
  console.log("[collector:review] 独立审核 worker 已启动");
  (async function loop() {
    try {
      if (!_reviewBusy) {
        _reviewBusy = true;
        try {
          const n = await reviewPending({ batch });
          if (n === 0) progress.setReviewState({ running: false });
        } finally {
          _reviewBusy = false;
        }
      }
    } catch (e) {
      console.error(`[collector:review] worker 循环异常: ${e.message}`);
    }
    setTimeout(loop, idleMs);
  })();
}

// ---- 独立后台简介补齐 worker（为关联作品识别提供 desc）----
// 旧库条目无 desc 字段，本 worker 在无采集时逐条调 bili.video 补拉 desc（纯 B 站请求，无 AI 成本）。
// 限流 150ms/次，写盘采用合并式，规避与采集/审核的竞态。
let _descLock = null;
let _descBusy = false;

// 重试策略：
// - 请求成功（无论有无 desc）→ 记 filledAt，视为已确认；DESC_RETRY_TTL 内不再重试。
//   注意「源站本来就空简介」是常态（大量曲子不写简介），回填后 desc 仍是 ""，
//   若不加标记会被每轮重复选中，永远收敛不了、白白消耗请求预算。
// - 请求失败（风控/稿件失效/网络）→ 累计 fail，达到 DESC_MAX_FAIL 才放弃，
//   避免临时抖动被永久跳过。
// 元数据存独立文件 cache/desc_meta.json，不写回 library.json：
// 全量采集的 mergeWithPrev 会重写整个库存条目，写在条目上的派生字段会被覆盖丢失。
const DESC_RETRY_TTL = 30 * 24 * 3600 * 1000; // 已确认条目 30 天后再校准一次（UP 可能后补简介）
const DESC_MAX_FAIL = 3;
const DESC_META_FILE = path.join(CACHE_DIR, "desc_meta.json");

let _descMeta = null;
function loadDescMeta() {
  if (_descMeta) return _descMeta;
  try {
    _descMeta = JSON.parse(fs.readFileSync(DESC_META_FILE, "utf8")) || {};
  } catch (e) {
    _descMeta = {};
  }
  return _descMeta;
}
function saveDescMeta() {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const tmp = DESC_META_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(_descMeta), "utf8");
    fs.renameSync(tmp, DESC_META_FILE);
  } catch (e) {
    console.error(`[collector:desc] 元数据落盘失败: ${e.message}`);
  }
}

async function backfillDesc({ batch = 30, persistEvery = 10 } = {}) {
  if (_descLock) return _descLock;
  if (_lock) return 0; // 采集进行中，跳过
  _descLock = (async () => {
    const items = await getLibrary();
    if (!Array.isArray(items)) return 0;
    const hasDesc = (v) => v !== undefined && v !== null && v !== "";
    const meta = loadDescMeta();
    const now0 = Date.now();
    const pendingIdx = items
      .map((it, i) => {
        if (!it || !it.aid) return -1;
        if (hasDesc(it.desc)) return -1; // 已有简介
        const m = meta[String(it.aid)];
        if (m && m.filledAt && now0 - m.filledAt < DESC_RETRY_TTL) return -1; // 近期已确认
        if (m && (m.fail || 0) >= DESC_MAX_FAIL) return -1; // 连续失败，暂时放弃
        return i;
      })
      .filter((i) => i >= 0);
    if (!pendingIdx.length) return 0;
    const filledMap = new Map(); // aid -> { ...it, desc }
    let done = 0;
    let ok = 0; // 补到简介
    let empty = 0; // 请求成功但源站确无简介
    let fail = 0; // 请求失败/异常
    progress.setReviewState({ descRunning: true, descPending: pendingIdx.length, descDone: 0 });
    for (const idx of pendingIdx.slice(0, batch)) {
      done++;
      const it = items[idx];
      const key = String(it.aid);
      const m = meta[key] || {};
      try {
        const v = await bili.video(Number(it.aid));
        if (!v || v.ok === false) {
          // 请求层面失败：不标记已确认，只累加失败次数，保留重试机会
          fail++;
          meta[key] = { ...m, fail: (m.fail || 0) + 1, lastAt: Date.now() };
          console.warn(`[collector:desc] ${key} 请求失败: code=${v?.code ?? "?"} ${v?.message || ""}`);
        } else {
          const desc = String(v?.data?.desc || "").slice(0, 1000);
          // 请求成功即收敛：有内容写 desc；空则代表 UP 没写简介，同样标记避免反复重试
          filledMap.set(key, { ...it, desc });
          meta[key] = { ...m, filledAt: Date.now(), fail: 0 };
          if (desc) ok++;
          else empty++;
        }
      } catch (e) {
        fail++;
        meta[key] = { ...m, fail: (m.fail || 0) + 1, lastAt: Date.now() };
        console.warn(`[collector:desc] ${key} 拉取异常: ${e.message}`);
      }
      progress.setReviewState({ descPending: pendingIdx.length, descDone: done, descOk: ok });
      if (done % persistEvery === 0) {
        await tryPersistDesc(filledMap);
        saveDescMeta();
      }
    }
    if (filledMap.size) {
      _library = (await getLibrary())
        .map((it) => (filledMap.has(String(it.aid)) ? filledMap.get(String(it.aid)) : it));
      _at = Date.now();
    }
    await tryPersistDesc(filledMap);
    saveDescMeta();
    progress.setReviewState({ descRunning: false, descPending: 0, descDone: done, descOk: ok });
    console.log(
      `[collector:desc] 本轮 ${done} 项：补到简介 ${ok}，源站无简介 ${empty}，请求失败 ${fail}（待补剩余 ${Math.max(0, pendingIdx.length - done)}）`
    );
    return done;
  })();
  try {
    return await _descLock;
  } finally {
    _descLock = null;
  }
}

async function tryPersistDesc(filledMap) {
  if (!filledMap || filledMap.size === 0) return true;
  if (_lock) return false; // 采集中，延迟落盘
  try {
    const disk = readDisk();
    const cur = disk && Array.isArray(disk.data) ? disk.data : [];
    const merged = cur.map((it) => (filledMap.has(String(it?.aid)) ? filledMap.get(String(it.aid)) : it));
    writeDiskKeepTs(merged.length, merged, disk ? disk.complete : true);
    return true;
  } catch (e) {
    console.error(`[collector:desc] 落盘失败: ${e.message}`);
    return false;
  }
}

let _descWorkerStarted = false;
async function startDescWorker({ idleMs = 20000, batch = 30 } = {}) {
  if (_descWorkerStarted) return;
  _descWorkerStarted = true;
  console.log("[collector:desc] 独立简介补齐 worker 已启动");
  (async function loop() {
    try {
      if (!_descBusy && !_lock && !_descLock) {
        _descBusy = true;
        try {
          const n = await backfillDesc({ batch });
          if (n === 0) progress.setReviewState({ descRunning: false });
        } finally {
          _descBusy = false;
        }
      }
    } catch (e) {
      console.error(`[collector:desc] worker 循环异常: ${e.message}`);
    }
    setTimeout(loop, idleMs);
  })();
}

module.exports = {
  collectAll,
  buildItem,
  fetchCandidates,
  getLibrary,
  reviewPending,
  startReviewWorker,
  backfillDesc,
  startDescWorker,
  LIBRARY_FILE,
};