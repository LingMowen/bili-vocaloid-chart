const express = require("express");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const bili = require("./bili");
const collector = require("./collector");
const services = require("./services");
const vocabili = require("./vocabili");
const { canonicalGirl, canonicalGirls, aliasesOf, expandNames } = require("./girls");
const config = require("./config");
const progress = require("./progress");
const related = require("./related");
const evoStats = require("./evoStats");
const evocalrank = require("./evocalrank");
const { makeRouter: makeAuthRouter, requireAuth, publicUser } = require("./auth");
const { db, stmts } = require("./db");

const app = express();

function parseId(raw, name) {
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
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

app.use(express.json());
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

app.get("/api/video/:aid", (req, res, next) => {
  const aid = parseId(req.params.aid, "aid");
  if (!aid) return fail(res, 400, "invalid aid");
  wrap(req, res, next, () => bili.video(aid));
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

const searchVideos = (keyword, page, sort) => {
  const d = readCached("evostats.json");
  const ps = 20;
  if (d && Array.isArray(d.list)) {
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
    const out = d.list.filter((it) =>
      (it.title || "").toLowerCase().includes(q) ||
      (it.owner?.name || "").toLowerCase().includes(q) ||
      girlHit(it.girls) ||
      (it.tags || []).some((tg) => String(tg).toLowerCase().includes(q)),
    );
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
  const keyword = String(req.query.keyword || "").trim().slice(0, 50);
  if (!keyword) return fail(res, 400, "missing keyword");
  const rawType = String(req.query.type || "video");
  const type = rawType === "all" ? "all" : rawType === "user" ? "bili_user" : "video";
  const sort = ["score", "view", "pubdate"].includes(req.query.sort) ? req.query.sort : "score";
  const page = Number(req.query.page) || 1;
  if (!Number.isInteger(page) || page < 1 || page > config.searchMaxPage) {
    return fail(res, 400, `page 需在 1-${config.searchMaxPage}`);
  }
  try {
    if (type === "all") {
      const videos = await searchVideos(keyword, page, sort);
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
    const d = await searchVideos(keyword, page, sort);
    return res.json({ ok: true, data: { ...d, sort } });
  } catch (e) {
    return next(e);
  }
});

// 库内 P主（UP主）搜索：仅搜索已被收录音乐的制作者
app.get("/api/owners", (req, res, next) => {
  const keyword = String(req.query.keyword || "").trim().slice(0, 50);
  if (!keyword) return fail(res, 400, "missing keyword");
  const page = Number(req.query.page) || 1;
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
const memCache = new Map();

function readCached(name) {
  if (memCache.has(name)) return memCache.get(name);
  const d = readCache(name);
  if (d) memCache.set(name, d);
  return d;
}

let refreshing = false;
let lastRefresh = 0;
let libraryRefreshing = false;
let lastLibraryRefresh = 0;

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
  if (limit < 1 || limit > 30) limit = 10;
  // type: singer（歌姬，默认） / producer（P主，即投稿 UP 主）
  const type = String(req.query.type || "singer").toLowerCase() === "producer" ? "producer" : "singer";
  wrap(req, res, next, async () => {
    const d = await services.buildBoardSingers(period, issue, limit, kind, type);
    return { ok: true, data: d };
  });
});

app.get("/api/board/:kind", (req, res, next) => {
  const kind = String(req.params.kind).toLowerCase();
  if (!["cn", "intl", "all"].includes(kind)) {
    return fail(res, 400, "kind 需为 cn/intl/all（中文榜/其他语言榜/综合榜）");
  }
  const pn = Number(req.query.pn) || 1;
  const ps = Number(req.query.ps) || 20;
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
app.get("/api/girls", (req, res, next) => {
  wrap(req, res, next, async () => {
    const d = await services.girls();
    writeCache("girls.json", d);
    return { ok: true, data: d };
  });
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
  // 本站暂无引擎详情页（参考站 /synthesizer/:id），暂跳该引擎的搜索结果
  return { kind: "engine", url: `/search?q=${encodeURIComponent(it.name)}`, name: it.name, extra: it.count ? `${it.count} 首` : "" };
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
  const aid = String(req.params.aid || "");
  if (!/^\d+$/.test(aid)) return fail(res, 400, "invalid aid");
  const page = Number(req.query.page) || 1;
  const pageSize = Math.min(Number(req.query.page_size) || 20, 50);
  if (page < 1 || pageSize < 1) return fail(res, 400, "invalid paging");
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
  const aid = String(req.params.aid || "");
  if (!/^\d+$/.test(aid)) return fail(res, 400, "invalid aid");
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

// SSE：推送当前周期 + 历史周期（一次性快照）+ 实时事件流
app.get("/api/progress/stream", (req, res) => {
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

  // 初始快照：当前周期 + 历史 + 独立审核队列状态
  send("snapshot", {
    current: progress.getCurrentCycle(),
    cycles: progress.listCycles(),
    history: progress.listHistory(),
    review: progress.getReviewState(),
  });

  const onEvent = (evt) => send("event", evt);
  const onCycleStart = (c) => send("cycle:start", c);
  const onCycleEnd = (c) => send("cycle:end", c);
  const onStage = (p) => send("stage:update", p);
  const onReview = (r) => send("review:update", r);

  progress.bus.on("event", onEvent);
  progress.bus.on("cycle:start", onCycleStart);
  progress.bus.on("cycle:end", onCycleEnd);
  progress.bus.on("stage:update", onStage);
  progress.bus.on("review:update", onReview);

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
  });
});

// 历史快照
app.get("/api/progress/history", (req, res) => {
  setProgressCors(req, res);
  res.json({ ok: true, data: { history: progress.listHistory(), cycles: progress.listCycles(), current: progress.getCurrentCycle(), review: progress.getReviewState() } });
});

// 手动触发采集
app.post("/api/collect/trigger", express.json(), (req, res) => {
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

app.use((req, res) => fail(res, 404, "not found"));

app.use((err, req, res, next) => {
  console.error(err);
  fail(res, 500, "internal error");
});

app.listen(config.port, () => {
  console.log(`api listening on http://localhost:${config.port}`);
  ensureCacheDir();
  refreshBoards();
  setTimeout(() => refreshLibrary(), 1500);
  setTimeout(() => syncEvo(), 3000);
  setInterval(syncEvo, 6 * 3600 * 1000);
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
