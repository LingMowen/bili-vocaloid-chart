const express = require("express");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const bili = require("./bili");
const collector = require("./collector");
const services = require("./services");
const statHistory = require("./statHistory");
const vocabili = require("./vocabili");
const vocabiliSync = require("./vocabiliSync");
const { canonicalGirl, canonicalGirls, aliasesOf, expandNames } = require("./girls");
const config = require("./config");
const progress = require("./progress");
const related = require("./related");
const evoStats = require("./evoStats");
const evocalrank = require("./evocalrank");
const boardIndex = require("./boardIndex");
const refreshStats = require("./refreshStats");
const syncIngest = require("./syncIngest");
const { beijingClock, beijingHour, beijingParts, BEIJING_OFFSET_MS } = require("./beijingTime");
const { makeRouter: makeAuthRouter, requireAuth, publicUser } = require("./auth");
const { db, stmts } = require("./db");

const app = express();

// ---- BV 号 ⇄ aid 互转（B站公开算法，纯本地换算，不发网络请求）----
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

function parseId(raw, name) {
  const s = String(raw == null ? "" : raw).trim();
  // 允许直接传 BV 号（/video/BV1xxxx 或粘贴 B站链接里的 BV 号），换算成 aid 后走原逻辑
  const bv = s.match(/^BV[0-9A-Za-z]{10}$/);
  if (bv) {
    const aid = bv2av(bv[0]);
    return Number.isSafeInteger(aid) && aid > 0 ? aid : null;
  }
  const n = Number(s);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

// 解析整数查询参数。
//
// 为什么不能用 `Number(req.query.pn) || 1`：
// `0` 是假值，会被当成「没传」换成默认值，于是 `?pn=0` 变成第 1 页被放行，
// 下面自己写的 `pn < 1 → 400` 校验形同虚设。越界值被悄悄当成合法输入，
// 比直接报错难查得多。
//
// 这里只负责「区分没传和传了」：
//   没传 / 空串 → 返回默认值
//   传了但不是数字 → 返回 NaN，交给调用方的范围校验去 400
//   传了 → 原样返回（包括 0 和负数），让校验说话
function intParam(value, fallback) {
  if (value == null || String(value).trim() === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

function fail(res, status, message) {
  return res.status(status).json({ ok: false, message });
}

async function wrap(req, res, next, fn) {
  try {
    const result = await fn();
    if (result && result.ok === false) {
      const code = result.code === -404 ? 404 : 502;
      return fail(res, code, result.message || "upstream error");
    }
    res.json(result);
  } catch (e) {
    next(e);
  }
}

// /api/sync/* 由路由自带的 64mb 解析器处理，这里必须跳过：
// 否则全局默认 100kb 上限会先把增量库请求判成 413，请求根本到不了路由。
const parseJson = express.json();
app.use((req, res, next) =>
  String(req.path || "").startsWith("/api/sync/") ? next() : parseJson(req, res, next)
);

// ---- 响应 gzip（内置 zlib，避免额外依赖）----
// /api/girls 572KB、/api/tags 524KB 这类大响应不压缩会拖慢首屏，尤其是非本地访问。
const zlib = require("node:zlib");
const GZIP_MIN_BYTES = 8 * 1024;
app.use((req, res, next) => {
  if (!String(req.headers["accept-encoding"] || "").includes("gzip")) return next();
  const origJson = res.json.bind(res);
  res.json = (obj) => {
    let buf;
    try {
      buf = Buffer.from(JSON.stringify(obj), "utf8");
    } catch {
      return origJson(obj);
    }
    if (buf.length < GZIP_MIN_BYTES) return origJson(obj);
    zlib.gzip(buf, { level: 5 }, (err, gz) => {
      if (err || !gz) return origJson(obj);
      res.setHeader("Content-Encoding", "gzip");
      res.setHeader("Vary", "Accept-Encoding");
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Length", gz.length);
      res.end(gz);
    });
  };
  next();
});

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - start}ms)`);
  });
  next();
});

/**
 * 视频详情短期缓存。
 *
 * bili.video() 每次都要打 B 站 3 个接口（view / tags / pages），且 call() 内
 * 有 150ms 串行节流 → 单发稳定 400~700ms，是视频页（6 接口并发）最大的剩余热点。
 * 稿件详情（标题/简介/时长/tags/pages/staff）分钟级不会变，只有 stat 会持续增长，
 * 因此缓存 5 分钟：足以覆盖用户反复进出同一视频页与刷新，又不至于让播放量明显陈旧。
 *
 * 只缓存成功结果；失败（ok:false）不缓存，保证上游抖动后可立即重试。
 */
const VIDEO_TTL = 5 * 60 * 1000;
const VIDEO_CACHE_MAX = 300; // 上限防内存无界增长（LRU：命中即续期）
const videoCache = new Map();

function videoCacheGet(aid) {
  const hit = videoCache.get(String(aid));
  if (!hit) return null;
  if (Date.now() - hit.at > VIDEO_TTL) {
    videoCache.delete(String(aid));
    return null;
  }
  // 续期 + 移到队尾，维持 LRU 顺序
  videoCache.delete(String(aid));
  videoCache.set(String(aid), hit);
  return hit.data;
}

function videoCacheSet(aid, data) {
  const key = String(aid);
  videoCache.delete(key);
  videoCache.set(key, { at: Date.now(), data });
  while (videoCache.size > VIDEO_CACHE_MAX) {
    videoCache.delete(videoCache.keys().next().value);
  }
}

app.get("/api/video/:aid", (req, res, next) => {
  const aid = parseId(req.params.aid, "aid");
  if (!aid) return fail(res, 400, "invalid aid");
  const cached = videoCacheGet(aid);
  if (cached) return res.json(cached);
  wrap(req, res, next, async () => {
    const r = await bili.video(aid);
    if (r && r.ok) videoCacheSet(aid, r);
    return r;
  });
});

/**
 * 最近的周二 00:00（今天若是周二则取今天），返回秒级时间戳。
 * 口径与原站前端 `X()` 完全一致，用于「新曲」时间偏移 timeOffset。
 */
function recentTuesdayStart() {
  const now = new Date();
  const back = (now.getDay() - 2 + 7) % 7; // getDay(): 周二 = 2
  const d = new Date(now);
  d.setDate(now.getDate() - back);
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

// 分数计算器：按 BV 号取实时数据（供 /calculator 的「获取」按钮使用）
app.get("/api/calculator/bv", (req, res, next) => {
  const raw = String(req.query.bvid || "").trim();
  const m = raw.match(/BV[0-9A-Za-z]{10}/);
  if (!m) return fail(res, 400, "invalid bvid");
  wrap(req, res, next, async () => {
    const r = await bili.videoByBvid(m[0]);
    if (!r.ok) return r;
    const d = r.data;
    const s = d.stat || {};
    return {
      ok: true,
      data: {
        bvid: d.bvid,
        aid: d.aid,
        title: d.title,
        pic: d.pic,
        pubdate: d.pubdate,
        copyright: d.copyright,
        // 距「最近的周二 00:00」的秒数；无发布时间则为 null
        timeOffset: d.pubdate ? Math.floor(d.pubdate - recentTuesdayStart()) : null,
        stat: {
          view: s.view ?? 0,
          favorite: s.favorite ?? 0,
          coin: s.coin ?? 0,
          like: s.like ?? 0,
          danmaku: s.danmaku ?? 0,
          reply: s.reply ?? 0,
          share: s.share ?? 0,
        },
      },
    };
  });
});

app.get("/api/song-history/:aid", (req, res, next) => {
  const aid = parseId(req.params.aid, "aid");
  if (!aid) return fail(res, 400, "invalid aid");
  wrap(req, res, next, async () => ({ ok: true, data: await services.songHistory(aid) }));
});

app.get("/api/video/:aid/girls", async (req, res) => {
  const aid = parseId(req.params.aid, "aid");
  if (!aid) return fail(res, 400, "invalid aid");
  const girls = await services.girlsByAid(aid);
  res.json({ ok: true, data: girls });
});

// 关联作品：同系列曲 / 翻唱重制Remix / 原曲 / 同专辑（仅库内已收录）
app.get("/api/video/:aid/related", async (req, res, next) => {
  const aid = parseId(req.params.aid, "aid");
  if (!aid) return fail(res, 400, "invalid aid");
  try {
    const items = await collector.getLibrary();
    const list = await related.getRelated(aid, items);
    res.json({ ok: true, data: list });
  } catch (e) {
    return next(e);
  }
});

app.get("/api/member/:mid", (req, res, next) => {
  const mid = parseId(req.params.mid, "mid");
  if (!mid) return fail(res, 400, "invalid mid");
  wrap(req, res, next, () => bili.member(mid));
});

app.get("/api/stat-snapshots/:aid", (req, res, next) => {
  const aid = parseId(req.params.aid, "aid");
  if (!aid) return fail(res, 400, "invalid aid");
  try {
    const dir = path.join(CACHE_DIR, "stat_daily");
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort() : [];
    const out = [];
    for (const f of files) {
      try {
        const snap = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
        const row = snap[String(aid)];
        if (row) {
          out.push({
            date: f.replace(/\.json$/, ""),
            view: row.view || 0,
            favorite: row.favorite || 0,
            coin: row.coin || 0,
            like: row.like || 0,
            danmaku: row.danmaku || 0,
            reply: row.reply || 0,
            share: row.share || 0,
          });
        }
      } catch (e) {
        /* ignore */
      }
    }
    res.json({ ok: true, data: { aid, snapshots: out } });
  } catch (e) {
    next(e);
  }
});

app.get("/api/vocalist/:id", (req, res, next) => {
  const id = parseId(req.params.id, "id");
  if (!id) return fail(res, 400, "invalid id");
  wrap(req, res, next, async () => {
    const v = await vocabili.vocalist(id);
    if (!v) return { ok: false, code: -404, message: "歌手不存在" };
    return { ok: true, data: v };
  });
});

app.get("/api/vocalist/:id/stats/summary", (req, res, next) => {
  const id = parseId(req.params.id, "id");
  if (!id) return fail(res, 400, "invalid id");
  wrap(req, res, next, async () => {
    const s = await vocabili.vocalistSummary(id);
    if (!s) return { ok: false, code: -404, message: "歌手不存在" };
    return { ok: true, data: s };
  });
});

app.get("/api/vocalist/:id/songs/:kind", (req, res, next) => {
  const id = parseId(req.params.id, "id");
  if (!id) return fail(res, 400, "invalid id");
  const kind = String(req.params.kind);
  if (!["top", "latest"].includes(kind)) return fail(res, 400, "kind 需为 top/latest");
  const limit = Math.min(Number(req.query.limit) || 10, 30);
  wrap(req, res, next, async () => {
    const songs = await vocabili.vocalistSongs(id, kind, limit);
    return { ok: true, data: songs };
  });
});

app.get("/api/vocalist/:id/synthesizers", (req, res, next) => {
  const id = parseId(req.params.id, "id");
  if (!id) return fail(res, 400, "invalid id");
  const limit = Math.min(Number(req.query.limit) || 10, 30);
  wrap(req, res, next, async () => {
    const s = await vocabili.vocalistSynthesizers(id, limit);
    return { ok: true, data: s };
  });
});

app.get("/api/vocalist/:id/producers", (req, res, next) => {
  const id = parseId(req.params.id, "id");
  if (!id) return fail(res, 400, "invalid id");
  const limit = Math.min(Number(req.query.limit) || 20, 50);
  wrap(req, res, next, async () => {
    const s = await vocabili.vocalistProducers(id, limit);
    return { ok: true, data: s };
  });
});

// 从任意文本识别视频引用：完整 URL / 裸 BV 号 / av 号。
// 用户习惯直接粘贴链接，若不提取会 0 结果并被误判为「解析失败」。
const BV_RE = /BV[0-9A-Za-z]{10}/;
const AV_RE = /(?:^|[^\w])av(\d{1,15})(?![0-9])/i;

function extractVideoRef(text) {
  const m = String(text || "").match(BV_RE);
  if (m) return { bvid: m[0] };
  const a = String(text || "").match(AV_RE);
  if (a) {
    const n = Number(a[1]);
    if (Number.isSafeInteger(n) && n > 0) return { aid: n };
  }
  return null;
}

// b23.tv 短链无法本地解析，需跟随重定向；仅在确实含短链时才发请求，失败一律回落关键词搜索。
async function resolveShortLink(text) {
  const m = String(text || "").match(/b23\.tv\/[A-Za-z0-9]+/i);
  if (!m) return null;
  try {
    const r = await fetch(`https://${m[0]}`, {
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(8000),
    });
    return extractVideoRef(r.url || "");
  } catch {
    return null;
  }
}

const searchVideos = (keyword, page, sort, ref) => {
  const d = readCached("evostats.json");
  const ps = 20;
  if (d && Array.isArray(d.list)) {
    let out;
    if (ref) {
      // 精确命中：链接/BV/av 直达，不再走关键词包含匹配
      out = d.list.filter((it) => (ref.bvid ? it.bvid === ref.bvid : String(it.aid) === String(ref.aid)));
    } else {
    const q = keyword.toLowerCase();
    // 歌姬匹配需带上别名：库里存的是标准名「初音未来」，但用户可能搜 miku / 初音ミク。
    // 查询词也走 expandNames：搜「镜音双子」应同时命中 镜音铃 与 镜音连 的曲子。
    const qTargets = expandNames([keyword]).map((s) => s.toLowerCase());
    const girlHit = (girls) =>
      canonicalGirls(girls).some((g) => {
        const c = g.toLowerCase();
        if (qTargets.includes(c)) return true;
        return aliasesOf(g).some((a) => String(a).toLowerCase().includes(q));
      });
    out = d.list.filter((it) =>
      (it.title || "").toLowerCase().includes(q) ||
      (it.owner?.name || "").toLowerCase().includes(q) ||
      girlHit(it.girls) ||
      (it.tags || []).some((tg) => String(tg).toLowerCase().includes(q)),
    );
    }
    if (sort === "view") out.sort((a, b) => (b.view || 0) - (a.view || 0));
    else if (sort === "pubdate") out.sort((a, b) => (b.pubdate || 0) - (a.pubdate || 0));
    const start = (page - 1) * ps;
    return {
      num_results: out.length,
      page,
      pages: Math.ceil(out.length / ps),
      items: out.slice(start, start + ps).map((it) => ({
        aid: it.aid,
        bvid: it.bvid,
        title: it.title,
        pic: it.pic,
        pubdate: it.pubdate || 0,
        view: it.view,
        duration: it.duration || 0,
        score: it.score,
        tags: it.tags || [],
        girls: it.girls || [],
        owner: it.owner,
      })),
    };
  }
  return services.search(keyword, "video", page);
};

app.get("/api/search", async (req, res, next) => {
  const rawKeyword = String(req.query.keyword || "").trim();
  const keyword = rawKeyword.slice(0, 50);
  if (!keyword) return fail(res, 400, "missing keyword");
  const rawType = String(req.query.type || "video");
  const type = rawType === "all" ? "all" : rawType === "user" ? "bili_user" : "video";
  const sort = ["score", "view", "pubdate"].includes(req.query.sort) ? req.query.sort : "score";
  const page = intParam(req.query.page, 1);
  if (!Number.isInteger(page) || page < 1 || page > config.searchMaxPage) {
    return fail(res, 400, `page 需在 1-${config.searchMaxPage}`);
  }
  try {
    // 粘贴链接 / 裸 BV / av 号时先精确直达；未命中再回落关键词搜索。
    // 从 rawKeyword 提取（未截断版），避免带参数的完整链接被 slice(0,50) 切掉 BV 号。
    let ref = extractVideoRef(rawKeyword.slice(0, 200));
    if (!ref) ref = await resolveShortLink(rawKeyword.slice(0, 200));
    if (type === "all") {
      const videos = await searchVideos(keyword, page, sort, ref);
      const users = await services.searchOwners(keyword, page);
      return res.json({
        ok: true,
        data: {
          sort,
          videos,
          users,
          num_results: videos.num_results + users.num_results,
          page,
        },
      });
    }
    const d = await searchVideos(keyword, page, sort, ref);
    return res.json({ ok: true, data: { ...d, sort } });
  } catch (e) {
    return next(e);
  }
});

// 库内 P主（UP主）搜索：仅搜索已被收录音乐的制作者
app.get("/api/owners", (req, res, next) => {
  const keyword = String(req.query.keyword || "").trim().slice(0, 50);
  if (!keyword) return fail(res, 400, "missing keyword");
  const page = intParam(req.query.page, 1);
  if (!Number.isInteger(page) || page < 1) return fail(res, 400, "page 需为正整数");
  const sort = ["works", "view"].includes(req.query.sort) ? req.query.sort : "works";
  wrap(req, res, next, async () => {
    const d = await services.searchOwners(keyword, page, sort);
    return { ok: true, data: { ...d, sort } };
  });
});

// 热门搜索词：基于库内 evostats 的高频标签 / 歌手 / UP主
app.get("/api/search/hot", (req, res, next) => {
  const limit = Math.min(Number(req.query.limit) || 12, 30);
  wrap(req, res, next, async () => {
    const d = readCached("evostats.json");
    const list = d && Array.isArray(d.list) ? d.list : [];
    const STOPS = new Set(["原创", "翻唱", "音乐", "单曲", "歌曲", "PV", "自制", "综合", "推荐", "VOCALOID"]);
    const freq = new Map();
    const bump = (word) => {
      if (!word || word.length > 16) return;
      if (STOPS.has(word)) return;
      const w = word.replace(/[{}\[\]（）()（）【】:：;；,，。.。!！?？'"\s_|-]+/g, "").trim();
      if (!w || w.length < 2) return;
      freq.set(w, (freq.get(w) || 0) + 1);
    };
    for (const it of list) {
      for (const tag of it.tags || []) bump(tag);
      for (const g of canonicalGirls(it.girls || [])) bump(g);
      if (it.owner?.name) bump(it.owner.name);
    }
    const top = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([word]) => word);
    return { ok: true, data: { items: top } };
  });
});

// 库内 P主 详情：仅返回该 P主 已被收录的音乐
app.get("/api/owner/:mid", (req, res, next) => {
  const mid = parseId(req.params.mid, "mid");
  if (!mid) return fail(res, 400, "invalid mid");
  wrap(req, res, next, async () => {
    const d = await services.ownerDetail(mid);
    if (!d) return { ok: false, code: -404, message: "未收录该 P主 的音乐" };
    return { ok: true, data: d };
  });
});

const CACHE_DIR = path.join(__dirname, "..", "cache");
const CACHE_TTL = 3600 * 1000; // 1h 刷新一次
const PERIODS = ["daily", "weekly", "monthly"];

function ensureCacheDir() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function cachePath(name) {
  return path.join(CACHE_DIR, name);
}

function readCache(name) {
  try {
    return JSON.parse(fs.readFileSync(cachePath(name), "utf8"));
  } catch (e) {
    return null;
  }
}

function writeCache(name, obj) {
  const dest = cachePath(name);
  const tmp = dest + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj), "utf8");
  fs.renameSync(tmp, dest);
}

// 每期榜单存档（按周期/期号），用于歌曲历史与趋势；同 issue 幂等覆盖
function archiveBoard(period, data) {
  try {
    const issue = data.issue ?? "unknown";
    const dir = path.join(CACHE_DIR, "board_archive", period);
    fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, `${issue}.json`);
    const tmp = dest + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(data), "utf8");
    fs.renameSync(tmp, dest);
  } catch (e) {
    console.error(`[cache] 存档 ${period} 失败: ${e.message}`);
  }
}

// 内存缓存：避免每次请求都读盘。refreshCache 更新后同步覆盖。
// 注意条目结构为 { mtimeMs, data }：采集器/外部脚本会直接改写缓存文件，
// 只按「有没有」判断会导致 API 一直吐旧数据，故用文件 mtime 做失效依据。
const memCache = new Map();

function readCached(name) {
  let mtimeMs = 0;
  try {
    mtimeMs = fs.statSync(cachePath(name)).mtimeMs;
  } catch {
    // 文件暂不存在：有旧缓存就先沿用，没有则 null
    const stale = memCache.get(name);
    return stale ? stale.data : null;
  }
  const hit = memCache.get(name);
  if (hit && hit.mtimeMs === mtimeMs) return hit.data;
  const d = readCache(name);
  if (d) memCache.set(name, { mtimeMs, data: d });
  return d;
}

let refreshing = false;
let lastRefresh = 0;
let libraryRefreshing = false;
let lastLibraryRefresh = 0;
// 以磁盘库的采集时间作为「上次刷新」基线：库完整时新进程不再无条件踢一次全量采集
// （旧实现初值恒为 0，导致每次重启都在启动后 1.5s 触发 collectAll）；库缺失/不完整
// 时基线保持 0，启动后的第一次调度会立即补采集。
try {
  const diskLib = collector.readDisk();
  if (diskLib && diskLib.complete === true && Array.isArray(diskLib.data) && diskLib.data.length) {
    lastLibraryRefresh = diskLib.ts || 0;
  }
} catch (e) {
  /* 读盘失败按 0 处理，下次调度会补采集 */
}

async function refreshBoards() {
  if (refreshing) return;
  refreshing = true;
  const started = Date.now();
  console.log("[cache] 开始刷新榜单缓存…");
  try {
    const results = await Promise.allSettled([
      services.buildBoard("daily"),
      services.buildBoard("weekly"),
      services.buildBoard("monthly"),
      services.buildBoard("annual"),
    ]);
    const names = ["daily", "weekly", "monthly", "annual"];
    let ok = 0;
    const meta = { generated_at: Date.now(), issue: {} };
    results.forEach((r, i) => {
      if (r.status === "fulfilled" && r.value) {
        const name = names[i];
        writeCache(`board_${name}.json`, r.value);
        meta.issue[name] = r.value.issue ?? null;
        ok++;
        archiveBoard(name, r.value);
      } else {
        const why = r.status === "rejected" ? r.reason?.message : r.value?.message;
        console.error(`[cache] ${names[i]} 生成失败: ${why || "unknown"}`);
      }
    });
    writeCache("meta.json", meta);
    for (const k of memCache.keys()) memCache.delete(k);
    console.log(`[cache] 榜单刷新完成，成功 ${ok}/${names.length}，耗时 ${(Date.now() - started) / 1000}s`);
  } catch (e) {
    console.error(`[cache] 榜单刷新失败: ${e.message}`);
  } finally {
    refreshing = false;
    lastRefresh = Date.now();
  }
}

// 后台同步 evocalrank 周增量数据（为长周期榜补历史基线）。
// 首次全量同步（约 110s，216 期），之后增量补最新一期（每 6h 检查一次）。
async function syncEvo() {
  try {
    const local = evoStats.listLocal();
    if (!local.length) {
      console.log("[evo] 本地无周增量数据，开始全量同步…");
      await evoStats.syncAll((done, total) => console.log(`[evo] 同步 ${done}/${total} 期`));
    } else {
      const last = Number(local[local.length - 1]);
      // 拉最新 info 看是否有比本地更新的期
      const periods = await evocalrank.fetchPeriodList();
      const newer = periods
        .map((p) => Number(p.rank_num))
        .filter((n) => n > last)
        .sort((a, b) => a - b);
      for (const n of newer.slice(0, 5)) {
        try {
          await evoStats.syncPeriod(n);
          console.log(`[evo] 增量同步第 ${n} 期`);
        } catch (e) {
          console.error(`[evo] 第 ${n} 期同步失败: ${e.message}`);
        }
      }
    }
    console.log(`[evo] 周增量基线就绪，本地 ${evoStats.listLocal().length} 期`);
  } catch (e) {
    console.error(`[evo] 同步失败: ${e.message}`);
  }
}

// vocabili 日刊同步（一天一次）：只拉最新日刊 → 四量落盘 → 缺失 bvid 入待抓队列。
// 周刊/月刊/年刊由本站自算，不在此抓取。
async function syncVocabili() {
  try {
    const r = await vocabiliSync.syncDaily();
    console.log(
      `[vocabili] 日刊同步完成：期号 ${r.latest} 条目 ${r.rows}，` +
        `四量落盘 ${r.meta_written} 条，待抓队列新增 ${r.pending_added}` +
        `（已在库跳过 ${r.pending_skipped_in_library}，去重跳过 ${r.pending_skipped_dup}）`,
    );
  } catch (e) {
    console.error(`[vocabili] 日刊同步失败: ${e.message}`);
  }
}

// 每天定点（北京时间 hour:00）执行一次 fn，之后每 24h 循环。用于 vocabili 日刊：
// 日刊站点凌晨 3 点更新，4 点抓取确保拿到新一期，避免抓到未更新的旧数据。
// 时间基准为北京时间（显式 +8 偏移），不依赖进程本地时区。
function scheduleDailyAt(hour, fn) {
  const now = Date.now();
  const p = beijingParts(now); // {y,m,d,h,min,sec,week}
  // 今天的北京时间 hour:00 对应的 UTC 时间戳
  let target = Date.UTC(p.y, p.m - 1, p.d, hour, 0, 0) - BEIJING_OFFSET_MS;
  if (target <= now) target += 24 * 3600 * 1000;
  const delay = target - now;
  setTimeout(() => {
    try {
      fn();
    } catch (e) {
      console.error(`[scheduleDaily ${hour}:00] 执行失败: ${e.message}`);
    }
    setInterval(fn, 24 * 3600 * 1000);
  }, delay);
  console.log(`[schedule] ${fn.name || "task"} 排程每天北京时间 ${hour}:00 执行（首跑延迟 ${Math.round(delay / 1000)}s）`);
}

// 全库派生数据（evostats/tags/girls/stats）低频后台刷新，失败保留旧缓存
async function refreshLibrary() {
  if (libraryRefreshing) return;
  if (Date.now() - lastLibraryRefresh < 3600 * 1000) return;
  libraryRefreshing = true;
  const started = Date.now();
  console.log("[cache] 开始刷新全库派生数据…");
  try {
    await collector.collectAll();
    const results = await Promise.allSettled([
      services.evostats("score", 1, 99999),
      services.tags(),
      services.girls(),
      services.stats(),
    ]);
    const names = ["evostats", "tags", "girls", "stats"];
    let ok = 0;
    results.forEach((r, i) => {
      if (r.status === "fulfilled" && r.value) {
        writeCache(`${names[i]}.json`, r.value);
        ok++;
      } else {
        const why = r.status === "rejected" ? r.reason?.message : r.value?.message;
        console.error(`[cache] ${names[i]} 生成失败: ${why || "unknown"}`);
      }
    });
    for (const k of memCache.keys()) memCache.delete(k);
    console.log(`[cache] 全库派生刷新完成，成功 ${ok}/${names.length}，耗时 ${(Date.now() - started) / 1000}s`);
  } catch (e) {
    console.error(`[cache] 全库派生刷新失败: ${e.message}`);
  } finally {
    libraryRefreshing = false;
    lastLibraryRefresh = Date.now();
  }
}

// ---- 调度改造（m10418）----
// 每 5 分钟：数据刷新 + 统分。只刷库内已有条目的 stat/score（refreshStats 内部按
// lastRefreshAt 升序挑最久未刷新的一批，多轮滚动覆盖全库），绝不新增收录；
// 刷新后补写当日 stat_daily 快照，榜单增量（当前值 - 期初快照）随之更新。
async function scheduledStatRefresh() {
  if (refreshStats.isBusy()) return;
  try {
    const r = await refreshStats.refreshStats();
    if (r.ok) {
      console.log(`[schedule:refresh] 刷新 ${r.refreshed}/${r.targets}（库存 ${r.total}），错误 ${r.errors}，耗时 ${(r.ms / 1000).toFixed(1)}s`);
      // 快照已由 refreshStats 内部补写；此处强制让派生数据（榜单/统计）读新库
      await services.loadLibrary(true);
    } else {
      console.log(`[schedule:refresh] 跳过：${r.reason || "unknown"}`);
    }
  } catch (e) {
    console.error(`[schedule:refresh] 刷新失败: ${e.message}`);
  }
}

// 每 10 分钟：新稿快速通道。只发现 + 收录「库里没有的最近投稿」（tids=30 pubdate
// 排序的分区检索，候选量几十到几百、秒级完成），把新视频发现延迟从"等 2h 大周期
// + 万级候选排队"压到分钟级。与 collectAll 互斥（内部 _lock 检测），不改变任何
// 收录判定口径。实测修复前发现延迟 p50=2 天 / p90=40 天（.tmp/measure-discovery-lag.cjs）。
async function scheduledQuickDiscover() {
  try {
    const r = await collector.quickDiscover();
    if (r && r.ok && r.added) {
      console.log(`[schedule:quick] 新稿收录 ${r.added} 首（发现 ${r.found}，库外候选 ${r.candidates}）`);
      await services.loadLibrary(true);
    }
  } catch (e) {
    console.error(`[schedule:quick] 快速通道失败: ${e.message}`);
  }
}

// 每 2 小时：收录 + 审核。复用现有采集周期（collectAll 自带增量跳过/全量语义与
// 周期进度上报）+ 独立审核消化（reviewPending 单飞锁，只处理 ai_reviewed===false）。
async function scheduledCollectAndReview() {
  try {
    await collector.collectAll(false);
  } catch (e) {
    console.error(`[schedule:collect] 采集失败: ${e.message}`);
  }
  try {
    const done = await collector.reviewPending({ batch: 20, persistEvery: 10 });
    if (done > 0) console.log(`[schedule:review] 本轮审核完成 ${done} 项`);
  } catch (e) {
    console.error(`[schedule:review] 审核失败: ${e.message}`);
  }
}

function serveBoardFromCache(res, kind, pn, ps, order, period) {
  const d = readCached(`board_${period}.json`);
  if (!d || !Array.isArray(d.list)) return null;
  let items = d.list.filter((it) => kind === "all" || (kind === "cn") === (it.lang === "cn"));
  if (order === "new") items = items.filter((it) => it.new);
  const key = order === "score" || order === "daily" || order === "new" ? "score" : order;
  items = items.slice().sort((a, b) => {
    if (order === "new") {
      if (!!a.new !== !!b.new) return a.new ? -1 : 1;
    }
    return (b[key] ?? 0) - (a[key] ?? 0);
  });
  const total = items.length;
  const list = items.slice((pn - 1) * ps, (pn - 1) * ps + ps);
  res.json({
    ok: true,
    data: {
      kind, order, period,
      issue: d.issue,
      latest_issue: d.latest_issue ?? d.issue,
      min_issue: d.min_issue ?? null,
      prev_issue: d.prev_issue ?? null,
      next_issue: d.next_issue ?? null,
      date_start: d.date_start ?? null,
      date_end: d.date_end ?? null,
      score_mode: d.score_mode ?? null,
      count: total,
      new_count: d.new_count ?? items.filter((it) => it.new).length,
      orders: d.orders || [],
      list,
    },
  });
  return true;
}

app.get("/api/board/singers", (req, res, next) => {
  const kind = String(req.query.kind || "all");
  if (!["cn", "intl", "all"].includes(kind)) {
    return fail(res, 400, "kind 需为 cn/intl/all");
  }
  const period = ["daily", "weekly", "monthly", "annual"].includes(req.query.period) ? req.query.period : "daily";
  const issue = req.query.issue != null && String(req.query.issue).trim() !== "" ? Number(req.query.issue) : null;
  let limit = Number(req.query.limit) || 10;
  // limit=all / -1 / 0 → 不限量（/singers 页要展示本期全部）。
  // 其余仍夹在 1..30，避免旧调用方一次拉爆。
  if (String(req.query.limit || "").trim() === "all" || limit < 0) limit = 0;
  else if (limit < 1 || limit > 30) limit = 10;
  // type: singer（歌姬，默认） / producer（P主，即投稿 UP 主）
  const type = String(req.query.type || "singer").toLowerCase() === "producer" ? "producer" : "singer";
  wrap(req, res, next, async () => {
    const d = await services.buildBoardSingers(period, issue, limit, kind, type);
    return { ok: true, data: d };
  });
});

// ---- 榜单侧栏「今日达成 / 百万达成」------------------------------------------
// 对齐参考站：该卡只出现在日刊与周刊（BoardPage 内 $s(board) 判定），
// 日刊标题「今日达成」、周刊「百万达成」，参考站数据源 /v3/milestones/{daily|weekly}。
//
// 口径（本站推断 —— 参考站该接口需登录，原始阈值集不可见）：
//   里程碑 = 累计播放量首次跨过万级阈值；
//   判定   = 用 stat_daily 每日快照比较「前一日 < 阈值 ≤ 当日」；
//   日刊取该期起始日当天，周刊取该期整段窗口；
//   阈值沿用歌曲详情页「达成里程碑」的同一套（10万/50万/100万/…/10亿），
//   周刊只保留 ≥100 万档 —— 与「百万达成」文案一致，且站内自洽。
// 阈值梯（1-5-10 万进制），与歌曲详情页「达成里程碑」同一套，日刊额外下探到 1万/5万
// —— 因为卡片徽章单位就是「万」(`milestone/1e4`)，日刊若从 10万 起会几乎恒为空。
const MILESTONE_THS = [1e4, 5e4, 1e5, 5e5, 1e6, 5e6, 1e7, 5e7, 1e8, 5e8, 1e9];
const MILESTONE_THS_WEEK = MILESTONE_THS.filter((v) => v >= 1e6);

function shiftDayKey(key, days) {
  const [y, m, d] = key.split("-").map(Number);
  const t = new Date(y, m - 1, d + days);
  const p = (n) => String(n).padStart(2, "0");
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
}

// 取 <= key 的最近一份快照日期（快照有断档，周刊窗口末尾常常还没采到）
function snapshotKeyOnOrBefore(key, maxBack) {
  const have = new Set(statHistory.listSnapshotDates());
  for (let i = 0; i <= maxBack; i++) {
    const k = shiftDayKey(key, -i);
    if (have.has(k)) return k;
  }
  return null;
}

// 该期榜单元信息（issue/date_start/date_end/list）：当期走内存缓存，历史期走归档
function boardMetaFor(period, issue) {
  const cur = readCached(`board_${period}.json`);
  if (issue == null || (cur && Number(cur.issue) === Number(issue))) return cur || null;
  try {
    return JSON.parse(
      fs.readFileSync(path.join(__dirname, "..", "cache", "board_archive", period, `${issue}.json`), "utf8"),
    );
  } catch (e) {
    return null;
  }
}

app.get("/api/board/milestones", (req, res, next) => {
  const raw = String(req.query.period || "daily");
  // 参考站该卡只挂在日刊/周刊上，其余周期直接返回空壳（前端也不会请求）
  if (raw !== "daily" && raw !== "weekly") {
    return res.json({ ok: true, data: { period: raw, issue: null, date: null, total: 0, list: [] } });
  }
  const period = raw;
  const issue =
    req.query.issue != null && String(req.query.issue).trim() !== "" ? Number(req.query.issue) : null;
  let ps = Number(req.query.ps) || 10;
  if (!Number.isFinite(ps) || ps < 1 || ps > 50) ps = 10;
  wrap(req, res, next, async () => {
    const meta = boardMetaFor(period, issue);
    const empty = { period, issue: meta?.issue ?? issue ?? null, date: null, total: 0, list: [] };
    if (!meta || !meta.date_start || !meta.date_end) return { ok: true, data: empty };

    const endDay = period === "daily" ? meta.date_start : shiftDayKey(meta.date_end, -1);
    const toKey = snapshotKeyOnOrBefore(endDay, 7);
    const fromKey = snapshotKeyOnOrBefore(shiftDayKey(meta.date_start, -1), 7);
    if (!toKey || !fromKey || toKey <= fromKey) return { ok: true, data: empty };
    const fromSnap = statHistory.snapshotAt(fromKey);
    const toSnap = statHistory.snapshotAt(toKey);
    if (!fromSnap || !toSnap) return { ok: true, data: empty };

    const ths = period === "weekly" ? MILESTONE_THS_WEEK : MILESTONE_THS;
    const hits = [];
    for (const aid of Object.keys(toSnap)) {
      const b = fromSnap[aid];
      if (!b) continue;
      const pv = Number(b.view) || 0;
      const cv = Number(toSnap[aid]?.view) || 0;
      if (cv <= pv) continue;
      let hit = null;
      for (const v of ths) if (pv < v && cv >= v) hit = v; // 升序，最后一次命中即最高档
      if (hit != null) hits.push({ aid, milestone: hit, view: cv });
    }
    // 档位高者优先，同档播放高者优先
    hits.sort((a, b) => b.milestone - a.milestone || b.view - a.view);

    // 补歌曲信息：先用当期榜单 list（字段最全），缺的回落全库
    const byAid = new Map();
    for (const it of meta.list || []) byAid.set(String(it.aid), it);
    const missing = hits.filter((h) => !byAid.has(h.aid));
    if (missing.length) {
      const lib = await services.loadLibrary().catch(() => []);
      const want = new Set(missing.map((h) => h.aid));
      for (const it of lib || []) {
        const k = String(it.aid);
        if (want.has(k)) byAid.set(k, it);
      }
    }
    const list = hits.slice(0, ps).map((h) => {
      const it = byAid.get(h.aid) || {};
      return {
        aid: Number(h.aid),
        title: it.title || `av${h.aid}`,
        bvid: it.bvid || null,
        pic: it.pic || it.cover || null,
        girls: it.girls || [],
        owner: it.owner || {},
        milestone: h.milestone,
        view: h.view,
      };
    });
    return {
      ok: true,
      data: { period, issue: meta.issue ?? issue ?? null, date: toKey, total: hits.length, list },
    };
  });
});

app.get("/api/board/:kind", (req, res, next) => {
  const kind = String(req.params.kind).toLowerCase();
  if (!["cn", "intl", "all"].includes(kind)) {
    return fail(res, 400, "kind 需为 cn/intl/all（中文榜/其他语言榜/综合榜）");
  }
  const pn = intParam(req.query.pn, 1);
  const ps = intParam(req.query.ps, 20);
  const order = String(req.query.order || "score");
  const period = ["daily", "weekly", "monthly", "annual"].includes(req.query.period) ? req.query.period : "daily";
  const issue = req.query.issue != null && String(req.query.issue).trim() !== "" ? Number(req.query.issue) : null;
  if (!Number.isInteger(pn) || pn < 1 || pn > 100) return fail(res, 400, "pn 需在 1-100");
  if (!Number.isInteger(ps) || ps < 1 || ps > config.rankMaxPs) {
    return fail(res, 400, `ps 需在 1-${config.rankMaxPs}`);
  }
  if (issue == null) {
    if (serveBoardFromCache(res, kind, pn, ps, order, period)) return;
  }
  wrap(req, res, next, async () => {
    const d = await services.buildBoard(period, issue);
    let items = d.list.filter((it) => kind === "all" || (kind === "cn") === (it.lang === "cn"));
    if (order === "new") items = items.filter((it) => it.new);
    const key = order === "score" || order === "daily" || order === "new" ? "score" : order;
    items = items.slice().sort((a, b) => {
      if (order === "new") {
        if (!!a.new !== !!b.new) return a.new ? -1 : 1;
      }
      return (b[key] ?? 0) - (a[key] ?? 0);
    });
    const total = items.length;
    return {
      ok: true,
      data: {
        kind, order, period,
        issue: d.issue,
        latest_issue: d.latest_issue,
        min_issue: d.min_issue,
        prev_issue: d.prev_issue ?? null,
        next_issue: d.next_issue ?? null,
        date_start: d.date_start ?? null,
        date_end: d.date_end ?? null,
        score_mode: d.score_mode ?? null,
        count: total,
        new_count: items.filter((it) => it.new).length,
        orders: d.orders,
        list: items.slice((pn - 1) * ps, (pn - 1) * ps + ps),
      },
    };
  });
});

app.get("/api/tags", (req, res, next) => {
  const d = readCached("tags.json");
  if (d) return res.json({ ok: true, data: d });
  wrap(req, res, next, async () => ({ ok: true, data: await services.tags() }));
});
app.get("/api/stats", (req, res, next) => {
  const d = readCached("stats.json");
  if (d) return res.json({ ok: true, data: d });
  wrap(req, res, next, async () => ({ ok: true, data: await services.stats() }));
});
// services.girls() 自带进程内 TTL 缓存，且只在真正重算时回写 girls.json
app.get("/api/girls", (req, res, next) => {
  wrap(req, res, next, async () => ({ ok: true, data: await services.girls() }));
});
app.get("/api/singers", (req, res, next) => {
  const d = readCached("singers.json");
  if (!d || !d.singers) return fail(res, 404, "singers 库尚未生成");
  const singers = d.singers;
  const names = String(req.query.names || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (names.length) {
    const out = {};
    for (const n of names) {
      const key = Object.keys(singers).find((k) => k.toLowerCase() === n.toLowerCase());
      out[n] = key ? singers[key] : null;
    }
    return res.json({ ok: true, data: { singers: out } });
  }
  return res.json({ ok: true, data: { singers } });
});
// 引擎（合成器）聚合榜。数据源 = singers.json 的 engines 字段 + engine_meta。
// 为什么需要它：/singers 与 /search 的「引擎」分类此前直接渲染「数据未收录，敬请期待」，
// 但 singers.json 里歌手**全部**带非空 engines（去重后 15 种合成器）。
//
// 引擎卡片此前一律渲染成 lucide-music 占位图标，因为聚合时只带 id/name/count，
// 没有 logo —— 前端 EntityCard 无 picture 就走占位分支。logo 来自 singers.json 的
// engine_meta（构建时从官方 /v3/synthesizer/list 拉取）。
app.get("/api/engines", (req, res) => {
  const d = readCached("singers.json");
  if (!d || !d.singers) return fail(res, 404, "singers 库尚未生成");
  const meta = d.engine_meta || {};
  const map = new Map();
  for (const s of Object.values(d.singers)) {
    for (const e of s?.engines || []) {
      if (!e || e.id == null || !e.name) continue;
      const key = String(e.id);
      const g = map.get(key) || {
        id: e.id,
        name: e.name,
        count: 0,
        // 官方合成器 logo；官方也没图的（Talk Ex / TALQu）留 null，前端仍走占位图标
        picture: meta[key]?.picture ?? null,
        singers: [],
      };
      g.count += e.count || 0;
      g.singers.push({
        name: s.name,
        id: s.vocabili_id ?? s.vocadb_id ?? null,
        picture: s.picture ?? s.pic ?? null,
        is_vs: Boolean(s.is_vs),
        // 该歌手在**这个引擎**下的作品数（不是该歌手全库作品数）
        count: e.count || 0,
      });
      map.set(key, g);
    }
  }
  const list = [...map.values()]
    .map((g) => ({ ...g, singers: g.singers.sort((a, b) => b.count - a.count) }))
    .sort((a, b) => b.count - a.count);
  return res.json({ ok: true, data: { list, generated_at: d.generated_at ?? null } });
});
// ---- 「随机看看」分类随机（对齐参考站 17-random.html）----
// 返回 { kind, url, name, extra?, picture? }：前端拿到 url 直接跳转，无需二次查询。
const RANDOM_KINDS = ["rank", "song", "producer", "singer", "engine", "up"];

function pickOne(arr) {
  if (!Array.isArray(arr) || !arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomSongFromCache() {
  const d = readCached("evostats.json");
  if (!d || !Array.isArray(d.list) || !d.list.length) return null;
  const picks = d.list.filter((it) => it.score);
  const it = pickOne(picks.length ? picks : d.list);
  if (!it) return null;
  return { kind: "song", url: `/video/${it.aid}`, name: it.title, extra: it.owner?.name || "", picture: it.pic };
}

function randomRankUrl() {
  const period = pickOne(["daily", "weekly", "monthly", "annual"]);
  const d = readCached(`board_${period}.json`);
  const latest = Number(d?.latest_issue || d?.issue || 0);
  const min = Number(d?.min_issue || 1);
  if (!latest) return { kind: "rank", url: `/rank/${period}`, name: period };
  // 随机一期（含历史期号），让「随机看看」能翻到往期
  const issue = min + Math.floor(Math.random() * Math.max(1, latest - min + 1));
  return { kind: "rank", url: `/rank/${period}/${issue}`, name: `第 ${issue} 期`, extra: period };
}

function randomSinger() {
  const d = readCached("singers.json");
  const list = Object.values(d?.singers || {}).filter((s) => s && s.vocabili_id);
  const it = pickOne(list);
  if (!it) return null;
  return { kind: "singer", url: `/singer/${it.vocabili_id}`, name: it.name, picture: it.picture };
}

// producer = 周榜活跃投稿者；up = 全库投稿账号（范围更广）
function randomPerson(kind) {
  const owners = new Map();
  const src = kind === "producer" ? readCached("board_weekly.json")?.list : readCached("library.json")?.data;
  for (const it of src || []) {
    if (it?.owner?.mid) owners.set(String(it.owner.mid), it.owner);
  }
  const o = pickOne([...owners.values()].filter((x) => x && x.name));
  if (!o) return null;
  return { kind, url: `/member/${o.mid}`, name: o.name, picture: o.face };
}

function randomEngine() {
  const d = readCached("singers.json");
  const map = new Map();
  for (const s of Object.values(d?.singers || {})) {
    for (const e of s?.engines || []) if (e && e.id) map.set(String(e.id), e);
  }
  const it = pickOne([...map.values()]);
  if (!it) return null;
  // 本站暂无引擎详情页（参考站 /synthesizer/:id），跳到「搜索 → 引擎」分类并预填关键词。
  // ⚠ 参数名必须是 keyword（SearchPage 只读 params.get("keyword")）且要带 type=engine，
  // 旧代码写的是 `/search?q=…`（少了 keyword、也没带 type），前端收不到 → 白跳。
  return {
    kind: "engine",
    url: `/search?keyword=${encodeURIComponent(it.name)}&type=engine`,
    name: it.name,
    extra: it.count ? `${it.count} 首` : "",
  };
}

function randomOf(kind) {
  switch (kind) {
    case "song":
      return randomSongFromCache();
    case "rank":
      return randomRankUrl();
    case "singer":
      return randomSinger();
    case "producer":
    case "up":
      return randomPerson(kind);
    case "engine":
      return randomEngine();
    default:
      return null;
  }
}

app.get("/api/random", (req, res, next) => {
  const q = String(req.query.type || "song").toLowerCase();
  const kind = q === "all" ? pickOne(RANDOM_KINDS) : q;
  if (!RANDOM_KINDS.includes(kind)) {
    return fail(res, 400, "type 需为 all/rank/song/producer/singer/engine/up");
  }
  // 某类取不到时降级为随机一首歌（保证「全部随机」永不空转）
  const hit = randomOf(kind) || randomOf("song");
  if (hit) return res.json({ ok: true, data: hit });
  // 缓存尚未就绪：回退到实时随机一首歌
  wrap(req, res, next, async () => {
    const d = await services.random();
    return {
      ok: true,
      data: { kind: "song", url: `/video/${d.aid}`, name: d.title, extra: d.owner?.name || "", picture: d.pic },
    };
  });
});
app.get("/api/evostats", (req, res, next) => {
  const d = readCached("evostats.json");
  if (d && Array.isArray(d.list)) {
    const order = String(req.query.order || "score");
    const pn = Number(req.query.pn) || 1;
    const ps = Number(req.query.ps) || 20;
    const asc = String(req.query.asc) === "1";
    const keyword = String(req.query.keyword || "").trim().slice(0, 50);
    const girl = String(req.query.girl || "").trim();
    const lang = String(req.query.lang || "").trim();
    const METRICS = ["view", "favorite", "coin", "like", "danmaku", "reply", "share"];
    let items = d.list;
    if (keyword) {
      const q = keyword.toLowerCase();
      items = items.filter((it) => (it.title || "").toLowerCase().includes(q) || (it.owner?.name || "").toLowerCase().includes(q));
    }
    if (girl) {
      // 查询参数可能用别名（miku / 初音ミク），甚至合称（镜音双子），
      // 先归一并展开再比对库里的标准名
      const want = new Set();
      for (const s of girl.split(",")) {
        const t = s.trim();
        if (!t) continue;
        for (const n of expandNames([t])) want.add(n);
      }
      items = items.filter((it) => canonicalGirls(it.girls || []).some((g) => want.has(g)));
    }
    if (lang) items = items.filter((it) => String(it.lang || "") === lang);
    for (const k of METRICS) {
      const mn = Number(req.query["min_" + k]);
      const mx = Number(req.query["max_" + k]);
      if (Number.isFinite(mn)) {
        const m = mn;
        items = items.filter((it) => (it[k] ?? 0) >= m);
      }
      if (Number.isFinite(mx)) {
        const m = mx;
        items = items.filter((it) => (it[k] ?? 0) <= m);
      }
    }
    const key = order === "score" ? "score" : METRICS.includes(order) ? order : "score";
    items = items.slice().sort((a, b) => ((b[key] ?? 0) - (a[key] ?? 0)) * (asc ? -1 : 1));
    return res.json({
      ok: true,
      data: {
        order,
        asc,
        count: items.length,
        orders: d.orders || [],
        list: items.slice((pn - 1) * ps, (pn - 1) * ps + ps),
      },
    });
  }
  wrap(req, res, next, async () => {
    const d = await services.evostats(String(req.query.order || "score"), Number(req.query.pn) || 1, Number(req.query.ps) || 20);
    return { ok: true, data: d };
  });
});
app.get("/api/today", (req, res, next) => {
  const d = readCached("evostats.json");
  if (d && Array.isArray(d.list)) {
    const now = new Date();
    const md = `${now.getMonth() + 1}-${now.getDate()}`;
    const matched = d.list.filter((it) => {
      if (!it.pubdate) return false;
      const dt = new Date(it.pubdate * 1000);
      return `${dt.getMonth() + 1}-${dt.getDate()}` === md;
    });
    matched.sort((a, b) => (b.score || 0) - (a.score || 0));
    return res.json({
      ok: true,
      data: {
        month: now.getMonth() + 1,
        day: now.getDate(),
        count: matched.length,
        list: matched.slice(0, 20),
      },
    });
  }
  wrap(req, res, next, async () => {
    const d = await services.today();
    return { ok: true, data: d };
  });
});

app.get("/api/achievements", (req, res, next) => {
  wrap(req, res, next, async () => {
    const d = await services.achievements({
      board: String(req.query.board || "weekly"),
      type: String(req.query.type || ""),
      status: String(req.query.status || "active"),
      page: Number(req.query.page) || 1,
      pageSize: Number(req.query.page_size) || 20,
    });
    return { ok: true, data: d };
  });
});

app.use("/api/auth", makeAuthRouter());

function publicComment(c, users) {
  const u = users.get(c.user_id);
  return {
    id: c.id,
    parent_id: c.parent_id ?? null,
    content: c.content,
    created_at: c.created_at,
    user: publicUser(u) || { id: c.user_id, nickname: "已注销用户" },
    reply_count: c.reply_count ?? 0,
    replies: (c.replies || []).map((r) => publicComment(r, users)),
  };
}

app.get("/api/video/:aid/comments", (req, res, next) => {
  // 走 parseId 以同时支持数字 aid 与 BV 号（评论区在视频页内，路径一致才不会 400）
  const aidNum = parseId(req.params.aid, "aid");
  if (!aidNum) return fail(res, 400, "invalid aid");
  const aid = String(aidNum);
  const page = intParam(req.query.page, 1);
  const pageSize = Math.min(intParam(req.query.page_size, 20), 50);
  if (!Number.isInteger(page) || !Number.isInteger(pageSize) || page < 1 || pageSize < 1) {
    return fail(res, 400, "invalid paging");
  }
  try {
    const roots = stmts.listComments.all(String(aid), pageSize, (page - 1) * pageSize);
    const countRow = stmts.countComments.get(String(aid));
    const users = new Map();
    const collect = (rows) => {
      for (const c of rows) {
        if (!users.has(c.user_id)) {
          const u = stmts.findById.get(c.user_id);
          users.set(c.user_id, u || null);
        }
      }
    };
    collect(roots);
    const replies = [];
    const rcMap = new Map(stmts.replyCounts.all().map((r) => [r.parent_id, r.n]));
    for (const root of roots) {
      const rs = stmts.listReplies.all(String(aid), root.id, 20);
      replies.push(...rs);
      root.reply_count = rcMap.get(root.id) ?? 0;
      root.replies = rs;
    }
    collect(replies);
    const list = roots.map((r) => publicComment(r, users));
    res.json({
      ok: true,
      data: {
        count: countRow.n,
        page,
        page_size: pageSize,
        list,
      },
    });
  } catch (e) {
    next(e);
  }
});

app.post("/api/video/:aid/comments", requireAuth, (req, res) => {
  const aidNum = parseId(req.params.aid, "aid");
  if (!aidNum) return fail(res, 400, "invalid aid");
  const aid = String(aidNum);
  const content = String(req.body?.content || "").trim();
  const parentIdRaw = Number(req.body?.parent_id ?? 0);
  if (!content || content.length > 1000) return fail(res, 400, "评论内容需在 1-1000 字之间");
  let parentId = null;
  if (Number.isInteger(parentIdRaw) && parentIdRaw > 0) {
    const p = stmts.findComment.get(parentIdRaw);
    if (!p || String(p.aid) !== String(aid)) return fail(res, 404, "回复的评论不存在");
    parentId = p.id;
  }
  const row = stmts.insertComment.get(String(aid), req.user.id, parentId, content, Date.now());
  const c = stmts.findComment.get(row.id);
  const users = new Map([[req.user.id, req.user]]);
  res.json({ ok: true, data: { comment: publicComment({ ...c, reply_count: 0, replies: [] }, users) } });
});

app.delete("/api/comments/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return fail(res, 400, "invalid id");
  const target = stmts.findComment.get(id);
  if (!target) return fail(res, 404, "评论不存在");
  const n = stmts.deleteComment.run(id, req.user.id).changes;
  if (!n) return fail(res, 404, "评论不存在或无权删除");
  stmts.deleteRepliesAll.run(id);
  res.json({ ok: true, data: { deleted: true } });
});

// 「我的」页：当前用户的评论列表（附带视频标题/封面，供前端直接渲染并可跳转）
app.get("/api/me/comments", requireAuth, (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(Math.max(1, Number(req.query.page_size) || 20), 50);
    const rows = stmts.listUserComments.all(req.user.id, pageSize, (page - 1) * pageSize);
    const total = stmts.countUserComments.get(req.user.id).n;
    // 标题从库缓存取，找不到就留空（前端退化为只显示 aid，不阻断列表）
    const byAid = new Map();
    for (const it of readCached("library.json")?.data || []) byAid.set(String(it.aid), it);
    const list = rows.map((r) => {
      const v = byAid.get(String(r.aid));
      return {
        id: r.id,
        aid: r.aid,
        parent_id: r.parent_id || 0,
        content: r.content,
        created_at: r.created_at,
        video_title: v?.title || "",
        video_pic: v?.pic || "",
        bvid: v?.bvid || "",
      };
    });
    res.json({ ok: true, data: { total, page, page_size: pageSize, list } });
  } catch (e) {
    next(e);
  }
});

// ---- 进度推送 (SSE) ----
// 仅 SSE 端点允许 1006 跨域（CORS），其他端点维持默认 Access-Control-Allow-Origin: *
function setProgressCors(req, res) {
  const origin = req.headers.origin || "";
  if (origin.startsWith("http://localhost:1006") || origin.startsWith("http://127.0.0.1:1006")) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
  }
}

/**
 * 进度页相关的三个端点（SSE 流、历史快照、手动触发采集）只允许「本机直连」。
 *
 * 为什么不能只查 IP：API 1003 现在经 Cloudflare 隧道对公网开放，而 cloudflared
 * 就跑在本机，它转发过来的请求 remoteAddress 同样是 127.0.0.1 —— 只看 IP 挡不住公网。
 * 判据三条同时成立才算本机：
 *   1. remoteAddress 是环回；
 *   2. 不带 Cloudflare 边缘头（cf-connecting-ip / cf-ray / cf-ipcountry）——
 *      经隧道的请求一定有，本机进度页一定没有；
 *   3. Host 是 localhost / 127.0.0.1 / [::1]（隧道请求的 Host 是隧道域名）。
 *
 * 前端（apps/web）不使用这三个端点（grep 零引用），所以收紧不影响公网页面。
 * 手动触发采集原本完全无鉴权，是最该挡的一个：它能打 B 站接口、消耗 AI 审核额度、写缓存。
 */
function isLocalDirect(req) {
  const ip = req.socket.remoteAddress || "";
  if (!/^(127\.|::1|::ffff:127\.)/.test(ip)) return false;
  if (req.headers["cf-connecting-ip"] || req.headers["cf-ray"] || req.headers["cf-ipcountry"]) {
    return false;
  }
  const host = String(req.headers.host || "").toLowerCase().replace(/:\d+$/, "");
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
}

function requireLocal(req, res, next) {
  if (isLocalDirect(req)) return next();
  return fail(res, 403, "forbidden (local only)");
}

// SSE：推送当前周期 + 历史周期（一次性快照）+ 实时事件流
app.get("/api/progress/stream", requireLocal, (req, res) => {
  setProgressCors(req, res);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const send = (event, data) => {
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch (e) {}
  };

  // 初始快照：当前周期 + 历史 + 独立审核队列状态 + 数据刷新状态
  send("snapshot", {
    current: progress.getCurrentCycle(),
    cycles: progress.listCycles(),
    history: progress.listHistory(),
    review: progress.getReviewState(),
    refresh: progress.getRefreshState(),
  });

  const onEvent = (evt) => send("event", evt);
  const onCycleStart = (c) => send("cycle:start", c);
  const onCycleEnd = (c) => send("cycle:end", c);
  const onStage = (p) => send("stage:update", p);
  const onReview = (r) => send("review:update", r);
  const onRefresh = (r) => send("refresh:update", r);

  progress.bus.on("event", onEvent);
  progress.bus.on("cycle:start", onCycleStart);
  progress.bus.on("cycle:end", onCycleEnd);
  progress.bus.on("stage:update", onStage);
  progress.bus.on("review:update", onReview);
  progress.bus.on("refresh:update", onRefresh);

  // 心跳
  const hb = setInterval(() => {
    try { res.write(": ping\n\n"); } catch (e) {}
  }, 15000);

  req.on("close", () => {
    clearInterval(hb);
    progress.bus.off("event", onEvent);
    progress.bus.off("cycle:start", onCycleStart);
    progress.bus.off("cycle:end", onCycleEnd);
    progress.bus.off("stage:update", onStage);
    progress.bus.off("review:update", onReview);
    progress.bus.off("refresh:update", onRefresh);
  });
});

// 历史快照
app.get("/api/progress/history", requireLocal, (req, res) => {
  setProgressCors(req, res);
  res.json({ ok: true, data: { history: progress.listHistory(), cycles: progress.listCycles(), current: progress.getCurrentCycle(), review: progress.getReviewState(), refresh: progress.getRefreshState() } });
});

// 手动触发采集
app.post("/api/collect/trigger", requireLocal, express.json(), (req, res) => {
  setProgressCors(req, res);
  const force = !!(req.body && req.body.force);
  const cur = progress.getCurrentCycle();
  if (cur) return res.status(409).json({ ok: false, message: "采集中，请等待当前周期完成", data: { cycle: cur } });
  // 异步触发，立即返回
  setImmediate(() => {
    collector.collectAll(force).catch((e) => {
      console.error("[trigger] 采集失败:", e.message);
    });
  });
  res.json({ ok: true, data: { triggered: true, force } });
});

// 手动触发数据刷新（只刷库内已有条目 stat/score，不新增收录）
// limit：本轮最多刷多少条（默认 ROUND_LIMIT=900）；limit=0 表示「全量刷新」→ 传 Infinity 把库内全部条目刷一遍
app.post("/api/refresh/trigger", requireLocal, express.json(), (req, res) => {
  setProgressCors(req, res);
  if (refreshStats.isBusy()) {
    return res.status(409).json({ ok: false, message: "数据刷新进行中，请等待本轮完成" });
  }
  const limitRaw = Number(req.body && req.body.limit);
  const full = req.body && req.body.full === true;
  // 全量：Infinity（Time budget 仍生效，一轮最多 4 分钟；不过全量通常更想刷完，
  // 手动全量把时间预算放开到 30 分钟：由 limit=Infinity 触发的这一轮自带宽预算）
  let limit = refreshStats.ROUND_LIMIT;
  if (full) limit = Infinity;
  else if (Number.isFinite(limitRaw) && limitRaw > 0) limit = Math.floor(limitRaw);
  setImmediate(() => {
    refreshStats
      .refreshStats({ limit })
      .then((r) => {
        if (r.ok) console.log(`[refresh:trigger] 手动刷新完成：${r.refreshed}/${r.targets}，错误 ${r.errors}`);
        else console.log(`[refresh:trigger] 手动刷新跳过：${r.reason}`);
      })
      .catch((e) => console.error("[refresh:trigger] 手动刷新失败:", e.message));
  });
  res.json({ ok: true, data: { triggered: true, full, limit: full ? "all" : limit } });
});

// ---- 双向同步摄入端点（对端服务运行中推送，不停服、不重启）----
// 为什么走端点而不是外部改文件：collector/services 在进程内存里各持一份库，外部
// 直接改 cache/library.json 会被下一次刷新落盘用内存旧库覆盖。合并必须发生在进程内。
// 鉴权：SYNC_TOKEN 请求头比对。服务监听 0.0.0.0 且公网可达，写端点无令牌 = 任何人可灌库；
//       未配置令牌时返回 503（fail-closed），绝不退化成匿名可写。
// body 上限单独放宽到 64mb（全局 express.json 默认 100kb 装不下增量库）。
function requireSyncToken(req, res, next) {
  if (!config.syncToken) return fail(res, 503, "同步端点未启用（服务端未配置 SYNC_TOKEN）");
  const got = String(req.headers["x-sync-token"] || "");
  if (got.length !== config.syncToken.length) return fail(res, 401, "unauthorized");
  // 定长比较，避免按字节短路带来的时序差
  const a = Buffer.from(got);
  const b = Buffer.from(config.syncToken);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  if (diff !== 0) return fail(res, 401, "unauthorized");
  next();
}
const syncJson = express.json({ limit: "64mb" });

// 对端把「它独有 / 更新的条目」推过来，本进程按 aid 并集合并并换入内存。
app.post("/api/sync/ingest", requireSyncToken, syncJson, async (req, res, next) => {
  try {
    const items = req.body && req.body.items;
    const r = await syncIngest.ingestLibrary(items);
    if (!r.ok) return fail(res, 400, r.reason || "摄入失败");
    console.log(`[sync] 摄入：新增 ${r.added}、更新 ${r.updated}、跳过 ${r.skipped}，库存 ${r.total}`);
    res.json({ ok: true, data: r });
  } catch (e) {
    next(e);
  }
});

// 单日统计快照并集（历史基线补齐）。同 aid 取 view 更大者，不整文件覆盖。
app.post("/api/sync/snapshot", requireSyncToken, syncJson, async (req, res, next) => {
  try {
    const { date, items } = (req.body || {});
    const r = syncIngest.mergeSnapshot(String(date || ""), items);
    if (!r.ok) return fail(res, 400, r.reason || "快照合并失败");
    res.json({ ok: true, data: r });
  } catch (e) {
    next(e);
  }
});

// 本侧库摘要，供对端算差集（只回 aid + lastRefreshAt + stale + view，不回整库）。
app.get("/api/sync/manifest", requireSyncToken, async (req, res, next) => {
  try {
    const items = await collector.getLibrary();
    const manifest = (items || [])
      .filter((it) => it && it.aid != null)
      .map((it) => ({ aid: it.aid, lastRefreshAt: Number(it.lastRefreshAt) || 0, stale: Boolean(it.stale), view: Number(it.view) || 0 }));
    res.json({ ok: true, data: { total: manifest.length, ts: Date.now(), items: manifest } });
  } catch (e) {
    next(e);
  }
});

// 按 aid 批量取整条记录（对端拿到差集后来这里取详情）。单次上限与摄入端点一致。
app.post("/api/sync/items", requireSyncToken, syncJson, async (req, res, next) => {
  try {
    const aids = req.body && req.body.aids;
    if (!Array.isArray(aids)) return fail(res, 400, "aids 需为数组");
    if (aids.length > syncIngest.MAX_ITEMS) return fail(res, 400, `aids 超过上限 ${syncIngest.MAX_ITEMS}`);
    const want = new Set(aids.map(String));
    const items = await collector.getLibrary();
    const found = (items || []).filter((it) => it && want.has(String(it.aid)));
    res.json({ ok: true, data: { count: found.length, items: found } });
  } catch (e) {
    next(e);
  }
});

app.use((req, res) => fail(res, 404, "not found"));

app.use((err, req, res, next) => {
  console.error(err);
  fail(res, 500, "internal error");
});

app.listen(config.port, () => {
  console.log(`api listening on http://localhost:${config.port}`);
  ensureCacheDir();
  // 预热榜单档案索引（149MB 档案解析一次 ~1.2s），避免首个视频页请求撞上全量构建
  boardIndex.warmup();
  refreshBoards();
  setTimeout(() => refreshLibrary(), 1500);
  setTimeout(() => syncEvo(), 3000);
  // evocalrank（中文周刊，每周更新）每 24 小时检查一次新期（原 6 小时过于频繁）
  setInterval(syncEvo, 24 * 3600 * 1000);
  // vocabili 日刊同步：每天凌晨 4 点定点抓取（日刊凌晨 3 点更新，4 点抓确保拿到新一期）
  scheduleDailyAt(4, syncVocabili);
  // ---- 调度改造（m10418）----
  // 每 5 分钟：数据刷新 + 统分（只刷库内已有条目 stat/score，不新增收录）
  setTimeout(() => scheduledStatRefresh(), 20 * 1000); // 启动 20s 后先跑一轮，避免与启动序列抢闸
  setInterval(scheduledStatRefresh, 5 * 60 * 1000);
  // 每 2 小时：收录 + 审核（collectAll 增量语义 + reviewPending 只消化待审项）
  setTimeout(() => scheduledCollectAndReview(), 90 * 1000); // 首轮放在启动序列之后（1.5s 的 refreshLibrary 若命中新鲜库会秒回）
  setInterval(scheduledCollectAndReview, 2 * 3600 * 1000);
  // 每 10 分钟：新稿快速通道（只发现+收录库外最近投稿，秒级；与 collectAll 互斥）
  // 首轮 60s 后跑：启动序列（wbi 初始化/派生刷新）之后，避免抢闸
  setTimeout(() => scheduledQuickDiscover(), 60 * 1000);
  setInterval(scheduledQuickDiscover, 10 * 60 * 1000);
  // 启动独立后台 AI 审核 worker（解耦采集与审核：不阻塞采集、串行消化待审项）
  // AI_REVIEW_ENABLED=false 时不启动：此时 aiReview.check 走 fail-open 放行，且不请求上游
  if (config.aiReview.enabled) {
    collector.startReviewWorker({ idleMs: 15000, batch: 20 }).catch((e) => {
      console.error("[collector:review] worker 启动失败:", e.message);
    });
  } else {
    console.log("[aiReview] AI 审核已关闭（AI_REVIEW_ENABLED=false），跳过审核 worker，条目按 fail-open 放行");
  }
  // 启动独立后台简介补齐 worker（为关联作品识别提供 desc，纯 B 站请求无 AI 成本）
  collector.startDescWorker({ idleMs: 30000, batch: 30 }).catch((e) => {
    console.error("[collector:desc] worker 启动失败:", e.message);
  });
  // 启动关联索引 worker：先纯规则构建索引，再对高价值项 AI 补全（限量 30s/个限流）
  related.startRelatedWorker({ idleMs: 120000, batch: 8, limit: 300 }).catch((e) => {
    console.error("[related] worker 启动失败:", e.message);
  });
  setInterval(refreshBoards, CACHE_TTL);
  setInterval(refreshLibrary, 3600 * 1000);
});

// 独立端口 1006：仅本地访问的进度页面
const PROGRESS_PORT = 1006;
const PUBLIC_DIR = path.join(__dirname, "..", "public");
if (fs.existsSync(PUBLIC_DIR)) {
  const progServer = http.createServer((req, res) => {
    // 仅允许本地
    const ip = req.socket.remoteAddress || "";
    if (!/^(127\.|::1|::ffff:127\.)/.test(ip)) {
      res.writeHead(403);
      return res.end("forbidden (local only)");
    }
    let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    if (urlPath === "/" || urlPath === "/progress") urlPath = "/progress.html";
    const fp = path.join(PUBLIC_DIR, urlPath);
    if (!fp.startsWith(PUBLIC_DIR) || !fs.existsSync(fp) || !fs.statSync(fp).isFile()) {
      res.writeHead(404);
      return res.end("not found");
    }
    const ext = path.extname(fp).toLowerCase();
    const types = {
      ".html": "text/html; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".svg": "image/svg+xml",
      ".png": "image/png",
    };
    res.setHeader("Content-Type", types[ext] || "application/octet-stream");
    res.setHeader("Cache-Control", "no-cache");
    fs.createReadStream(fp).pipe(res);
  });
  // 严格仅本地
  progServer.listen(PROGRESS_PORT, "127.0.0.1", () => {
    console.log(`progress page: http://127.0.0.1:${PROGRESS_PORT}/progress`);
  });
}
