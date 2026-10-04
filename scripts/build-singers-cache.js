#!/usr/bin/env node
/**
 * 重建 apps/api/cache/singers.json
 *
 * 为什么需要这个脚本：singers.json 原本是一次性手工产物，仓库里**没有任何生成器**
 * （全仓 grep `singers.json` 只命中读取方），导致它长期停在 23 条，而本地库实际
 * 有 32 位歌手。缺条目的直接后果是 /singers 页面把「巡音流歌 / meiko / 音街鳗 /
 * 艾尔法」等渲染成无头像的搜索链接，看起来像脏数据。
 *
 * 数据来源（三路，都不猜）：
 *   1. 名单 = 本地库口径（apps/api/cache/girls.json 的 list，32 位）——
 *      「数据库里有作品的歌手」才是我们该收录的集合，不是拍脑袋写死。
 *   2. id / 头像 / is_vs / engines = vocabili 官方 API 实时拉取：
 *      - GET /v3/vocalist/list?page=N&page_size=100   （全量索引，1838 条，用于名字→id）
 *      - GET /v3/vocalist/<id>                        （单条，拿 picture/is_vs/vocadb_id）
 *      - GET /v3/vocalist/<id>/stats/synthesizers     （引擎分布，替换掉过期的旧值）
 *   3. 引擎（合成器）自己的 logo = GET /v3/synthesizer/list（42 条）——
 *      写成顶层 engine_meta: { "<id>": { name, picture } }。
 *      为什么单独存一份：singers.json 的 engines 数组只带 id/name/count，
 *      /api/engines 聚合出来的引擎卡片因此拿不到图片，前端全渲染成
 *      lucide-music 占位图标（用户报的「引擎界面没有任何图标」）。
 *
 * 用法：
 *   node scripts/build-singers-cache.js            # 联网重建并写入缓存
 *   node scripts/build-singers-cache.js --dry-run  # 只打印报告，不写文件
 *   node scripts/build-singers-cache.js --offline  # 不联网，用 .tmp/vlist-all.json 兜底
 *
 * 注意：apps/api/cache/ 不在 git 跟踪内（被 .gitignore 忽略），本脚本只改运行时缓存。
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CACHE_DIR = path.join(ROOT, "apps", "api", "cache");
const GIRLS_FILE = path.join(CACHE_DIR, "girls.json");
const OUT_FILE = path.join(CACHE_DIR, "singers.json");
const OFFLINE_INDEX = path.join(ROOT, ".tmp", "vlist-all.json");

const API = "https://api.vocabili.top/v3";
const DRY = process.argv.includes("--dry-run");
const OFFLINE = process.argv.includes("--offline");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJSON(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": "bili-vocaloid-chart/build-singers-cache" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(400 * (i + 1));
    }
  }
}

/** 拉官方全量歌手索引（分页，page_size 上限 100，写 200 会 400） */
async function fetchVocalistIndex() {
  const all = [];
  let page = 1;
  for (;;) {
    const j = await getJSON(`${API}/vocalist/list?page=${page}&page_size=100`);
    const arr = Array.isArray(j) ? j : j.data || [];
    if (!arr.length) break;
    all.push(...arr);
    if (arr.length < 100) break;
    page += 1;
    if (page > 60) break; // 安全阀
  }
  return all;
}

/** 拉官方全量合成器（引擎）索引 —— 用于给引擎卡片配 logo。42 条，一页装得下。 */
async function fetchSynthesizerIndex() {
  const all = [];
  let page = 1;
  for (;;) {
    const j = await getJSON(`${API}/synthesizer/list?page=${page}&page_size=100`);
    const arr = Array.isArray(j) ? j : j.data || [];
    if (!arr.length) break;
    all.push(...arr);
    if (arr.length < 100) break;
    page += 1;
    if (page > 5) break; // 安全阀
  }
  return all;
}

function loadIndex() {
  if (OFFLINE) {
    const arr = JSON.parse(fs.readFileSync(OFFLINE_INDEX, "utf8"));
    console.log(`[offline] 读本地索引 ${OFFLINE_INDEX}（${arr.length} 条）`);
    return Promise.resolve(arr);
  }
  return fetchVocalistIndex().then((arr) => {
    console.log(`[online] 官方索引 ${arr.length} 条`);
    return arr;
  });
}

/** 名字 → 官方条目。先精确，再大小写不敏感，最后去掉空格/中点再比一次。 */
function buildMatcher(index) {
  const exact = new Map();
  const lower = new Map();
  const loose = new Map();
  const norm = (s) => String(s || "").toLowerCase().replace(/[\s·・\-_.]/g, "");
  for (const x of index) {
    if (!exact.has(x.name)) exact.set(x.name, x);
    const lk = String(x.name).toLowerCase();
    if (!lower.has(lk)) lower.set(lk, x);
    const nk = norm(x.name);
    if (nk && !loose.has(nk)) loose.set(nk, x);
  }
  return (name) => exact.get(name) || lower.get(String(name).toLowerCase()) || loose.get(norm(name)) || null;
}

async function main() {
  if (!fs.existsSync(GIRLS_FILE)) throw new Error(`缺 ${GIRLS_FILE}`);
  const girls = JSON.parse(fs.readFileSync(GIRLS_FILE, "utf8"));
  const list = Array.isArray(girls) ? girls : girls.list || [];
  if (!list.length) throw new Error("girls.json 里没有歌手列表");

  // 本地库口径的名单（按作品数降序，作为输出顺序）
  const names = list
    .map((g) => g.name)
    .filter(Boolean)
    .sort((a, b) => (list.find((g) => g.name === b)?.count || 0) - (list.find((g) => g.name === a)?.count || 0));

  console.log(`本地库歌手名单：${names.length} 位`);

  const index = await loadIndex();
  const match = buildMatcher(index);

  // 引擎（合成器）自己的 logo：单独拉一次官方全量合成器索引。
  // 失败不致命 —— 只是引擎卡片没有图标，不影响歌手数据。
  const engineMeta = {};
  if (!OFFLINE) {
    try {
      const syns = await fetchSynthesizerIndex();
      for (const s of syns) {
        if (s?.id == null) continue;
        engineMeta[String(s.id)] = { name: s.name ?? null, picture: s.picture ?? null };
      }
      console.log(`官方合成器索引 ${syns.length} 条（有 logo 的 ${Object.values(engineMeta).filter((x) => x.picture).length} 条）`);
    } catch (e) {
      console.warn(`! 合成器索引拉取失败：${e.message}（引擎图标将留空）`);
    }
  } else if (fs.existsSync(OUT_FILE)) {
    // 离线模式：沿用上一次的 engine_meta，避免把已有 logo 抹掉
    const old = JSON.parse(fs.readFileSync(OUT_FILE, "utf8"));
    Object.assign(engineMeta, old.engine_meta || {});
  }

  const singers = {};
  const unmatched = [];
  const noPicture = [];
  const engineChanged = [];
  const engineNoLogo = new Set();

  const prev = fs.existsSync(OUT_FILE) ? JSON.parse(fs.readFileSync(OUT_FILE, "utf8")).singers || {} : {};

  for (const name of names) {
    const hit = match(name);
    if (!hit) {
      unmatched.push(name);
      continue;
    }
    const detail = OFFLINE
      ? hit
      : await getJSON(`${API}/vocalist/${hit.id}`).then((j) => j.data || hit).catch(() => hit);

    let engines = [];
    if (!OFFLINE) {
      try {
        const st = await getJSON(`${API}/vocalist/${hit.id}/stats/synthesizers?limit=50`);
        engines = (st.data || [])
          .filter((e) => e.synthesizer && e.synthesizer.name)
          .map((e) => ({ id: e.synthesizer.id, name: e.synthesizer.name, count: e.count }))
          .sort((a, b) => b.count - a.count);
      } catch (e) {
        console.warn(`  ! ${name} engines 拉取失败：${e.message}`);
      }
    }
    if (!engines.length) engines = prev[name]?.engines || [];

    const entry = {
      name,
      vocabili_id: detail.id,
      vocadb_id: detail.vocadb_id ?? null,
      picture: detail.picture ?? null,
      is_vs: detail.is_vs ?? true,
      engines,
    };
    if (!entry.picture) noPicture.push(name);

    const old = prev[name];
    if (old) {
      const sum = (a) => a.reduce((s, e) => s + e.count, 0);
      const o = sum(old.engines || []);
      const n = sum(entry.engines || []);
      if (o !== n) engineChanged.push(`${name}: ${o} → ${n}`);
    }

    singers[name] = entry;
    await sleep(OFFLINE ? 0 : 60);
  }

  const out = { generated_at: new Date().toISOString(), engine_meta: engineMeta, singers };

  // 统计用到的引擎里有几个没有 logo（不致命，但要在报告里说清）
  const usedEngines = new Map();
  for (const s of Object.values(singers)) {
    for (const e of s.engines || []) {
      if (e?.id == null) continue;
      usedEngines.set(String(e.id), e.name || String(e.id));
    }
  }
  for (const [id, nm] of usedEngines) {
    if (!engineMeta[id]?.picture) engineNoLogo.add(`${nm}(${id})`);
  }

  console.log("\n===== 报告 =====");
  console.log(`收录 ${Object.keys(singers).length} 位 / 名单 ${names.length} 位`);
  console.log(`官方索引查不到（= 本地库里不存在的歌手）：${unmatched.length ? unmatched.join("、") : "无"}`);
  console.log(`官方也没有头像：${noPicture.length ? noPicture.join("、") : "无"}`);
  console.log(`用到的引擎 ${usedEngines.size} 种，其中官方也没有 logo 的：${engineNoLogo.size ? [...engineNoLogo].join("、") : "无"}`);
  console.log(`engines 总量发生变化的：${engineChanged.length} 位`);
  engineChanged.slice(0, 40).forEach((s) => console.log("  " + s));
  const added = Object.keys(singers).filter((n) => !prev[n]);
  console.log(`新增条目：${added.length} 位 → ${added.join("、")}`);

  if (DRY) {
    console.log("\n--dry-run：未写文件");
    return;
  }
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 1), "utf8");
  console.log(`\n已写入 ${OUT_FILE}（${fs.statSync(OUT_FILE).size} B）`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
