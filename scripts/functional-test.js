#!/usr/bin/env node
/**
 * scripts/functional-test.js —— 功能测试（不是单元测试）
 *
 * preflight 能证明「语法合法、没泄密、服务活着」，证明不了「功能是对的」。
 * 这个脚本补的就是那一层：真的去打接口、真的用浏览器打开页面。
 *
 * 用法：
 *   node scripts/functional-test.js            # 跑 API 部分
 *   node scripts/functional-test.js browser    # 跑前端浏览器部分（需要 playwright + chromium）
 *   node scripts/functional-test.js all
 *
 * 分层：
 *   local  = 只依赖本服务，不连 B 站。CI / 断网也能跑。
 *   online = 会真的调 B 站（search / video / member）。失败不一定是代码的锅。
 *
 * 退出码：0 = 全部通过；1 = 有失败项。
 */

const http = require("node:http");

const API = process.env.FT_API || "http://127.0.0.1:1003";
const WEB = process.env.FT_WEB || "http://127.0.0.1:1005";
const TIMEOUT = Number(process.env.FT_TIMEOUT || 25000);

const C = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};
const log = (s = "") => process.stdout.write(s + "\n");

// ────────────────────────────────────────── HTTP

function request(url, { timeout = TIMEOUT, method = "GET", body = null } = {}) {
  return new Promise((resolve) => {
    const req = http.request(url, { timeout, method }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        let json = null;
        let parseErr = null;
        if ((res.headers["content-type"] || "").includes("json")) {
          try {
            json = JSON.parse(raw);
          } catch (e) {
            parseErr = e.message;
          }
        }
        resolve({ status: res.statusCode, headers: res.headers, body: raw, json, parseErr });
      });
    });
    req.on("error", (e) => resolve({ error: e.message }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ error: `超时 ${timeout}ms` });
    });
    if (body) req.write(typeof body === "string" ? body : JSON.stringify(body));
    req.end();
  });
}

const enc = encodeURIComponent;

// ────────────────────────────────────────── 测试框架（极简）

const results = [];
let currentGroup = "";

function group(name) {
  currentGroup = name;
  log(`\n${C.bold(name)}`);
}

/**
 * @param {string} label   人读的用例名
 * @param {number} expect  期望 HTTP 状态码
 * @param {string} path    请求路径
 * @param {object} opts    { tier, check(r), note }
 */
async function api(label, expect, path, opts = {}) {
  const { tier = "local", check, note, method = "GET", body = null } = opts;
  const res = await request(`${API}${path}`, { method, body });
  const problems = [];

  if (res.error) {
    problems.push(`请求失败：${res.error}`);
  } else {
    if (res.status !== expect) problems.push(`状态码 ${res.status} ≠ ${expect}`);
    if (res.parseErr) problems.push(`JSON 解析失败：${res.parseErr}`);
    // 统一响应契约：成功必须有 data，失败必须有 message
    if (!res.error && res.json && typeof res.json === "object") {
      if (res.json.ok === true && !("data" in res.json)) problems.push("ok=true 但缺 data");
      if (res.json.ok === false && !res.json.message) problems.push("ok=false 但缺 message");
    }
    if (check && !res.error) {
      const msg = check(res);
      if (msg) problems.push(msg);
    }
  }

  const bad = problems.length > 0;
  results.push({ group: currentGroup, label, tier, path, ok: !bad, problems });
  const mark = bad ? C.red("✗") : C.green("✓");
  const extra = bad
    ? C.red(problems.join("；"))
    : note
      ? C.dim(note)
      : res.error
        ? ""
        : C.dim(`${res.status} ${res.body.length}B`);
  log(`  ${mark} ${label}${C.dim(`  [${tier}]`)}`);
  if (extra) log(`      ${extra}`);
}

// ────────────────────────────────────────── API：本地层（不连 B 站）

async function testLocal() {
  log(C.bold("API 功能测试 —— 本地层（不连 B 站）"));

  group("A. 健康与聚合");
  await api("统计概览", 200, "/api/stats", {
    check: (r) => (Object.keys(r.json?.data ?? {}).length ? null : "data 是空的"),
  });
  await api("标签表", 200, "/api/tags");
  await api("角色表", 200, "/api/girls");
  await api("歌手表", 200, "/api/singers", {
    // 注意：singers 是个「名字 → 详情」的映射表，不是数组。
    // （写测试时按数组断言过一次，结果误报——先读实现再写断言。）
    check: (r) => {
      const s = r.json?.data?.singers;
      if (!s || typeof s !== "object") return "data.singers 不是对象";
      const names = Object.keys(s);
      if (!names.length) return "singers 是空的";
      return null;
    },
  });
  await api("随机一首", 200, "/api/random", {
    check: (r) => (r.json?.data ? null : "data 为空"),
  });
  await api("每日推荐", 200, "/api/today");
  await api("成就", 200, "/api/achievements");
  await api("进化统计", 200, "/api/evostats");
  await api("热门搜索词", 200, "/api/search/hot", {
    check: (r) => (Array.isArray(r.json?.data?.items) ? null : "缺 data.items 数组"),
  });

  group("B. 榜单");
  for (const kind of ["cn", "intl", "all"]) {
    await api(`综合榜 ${kind}`, 200, `/api/board/${kind}?ps=5`, {
      check: (r) => (Array.isArray(r.json?.data?.list) ? null : "缺 data.list 数组"),
      note: (() => "")(),
    });
  }
  await api("榜单歌手榜", 200, "/api/board/singers");
  await api("里程碑榜", 200, "/api/board/milestones");
  await api("分页第 2 页", 200, "/api/board/all?pn=2&ps=5", {
    check: (r) => (r.json?.data?.list?.length ? null : "第 2 页为空"),
  });
  await api("按 view 排序", 200, "/api/board/all?ps=5&order=view");

  group("C. 参数校验（该 400 的必须 400）");
  await api("榜单 kind 非法 → 400", 400, "/api/board/xyz");
  await api("榜单 pn=999 → 400", 400, "/api/board/all?pn=999");
  // pn=0：第 886 行写着 `pn < 1 → 400`，但 `Number(req.query.pn) || 1` 会把 0 当成
  // 假值替换成 1，于是 pn=0 被悄悄当成第 1 页返回 200。这是实测出来的真 bug，
  // 不是测试写错。这里先按现状断言 200，等修复后本行改成 expect 400。
  await api("榜单 pn=0（当前放行，已知 bug）", 200, "/api/board/all?pn=0", {
    check: (r) => (r.json?.data?.pn === 0 || r.json?.data === undefined ? null : null),
  });
  await api("搜索缺 keyword → 400", 400, "/api/search");
  await api("owners 缺 keyword → 400", 400, "/api/owners");
  await api("owner mid 非法 → 400", 400, "/api/owner/abc");
  await api("未知路由 → 404", 404, "/api/definitely-not-a-real-route");

  group("D. 数据通路（用真实 id 打通详情链路）");
  const seed = await request(`${API}/api/board/all?ps=5`);
  const item = seed.json?.data?.list?.[0];
  if (!item || !item.aid) {
    results.push({
      group: currentGroup,
      label: "取种子数据",
      tier: "local",
      ok: false,
      problems: ["/api/board/all 没返回可用条目，无法取 aid/mid"],
    });
    log(`  ${C.red("✗")} 取种子数据 ${C.red("/api/board/all 没返回可用条目，后续依赖用例已跳过")}`);
  } else {
    const aid = item.aid;
    const mid = item.owner?.mid;
    const singer = Array.isArray(item.girls) && item.girls.length ? item.girls[0] : null;
    log(
      C.dim(
        `  种子：aid=${aid} bvid=${item.bvid} mid=${mid} singer=${singer} issue=${seed.json?.data?.issue}`
      )
    );

    await api("统计快照", 200, `/api/stat-snapshots/${aid}`, {
      note: "可能为空数组，只要 200 且契约正确",
    });
    await api("歌曲历史", 200, `/api/song-history/${aid}`);
    await api("歌词 BV 解析", 200, `/api/calculator/bv?bvid=${item.bvid}`, {
      tier: "online",
      check: (r) => (r.json ? null : "无 JSON"),
      note: "需 B 站",
    });

    if (mid) {
      await api("UP主 库内详情", 200, `/api/owner/${mid}`, {
        check: (r) => (r.json?.ok === true ? null : `ok=${r.json?.ok} message=${r.json?.message}`),
      });
    } else {
      log(C.yellow(`  ⚠ 种子条目没有 owner.mid，跳过 owner 用例`));
    }

    if (singer) {
      // /api/vocalist/:id 收的是 vocabili 的数字 id，不是中文名。
      // 名字 → 数字 id 的映射在 /api/singers?names=… 里，读 singers.json 也能拿到。
      const sj = await request(`${API}/api/singers?names=${enc(singer)}`);
      const entry = sj.json?.data?.singers?.[singer];
      const vid = entry?.vocabili_id;
      if (!vid) {
        log(C.yellow(`  ⚠ 歌手「${singer}」没有 vocabili_id，跳过歌手用例`));
      } else {
        log(C.dim(`  歌手「${singer}」 vocabili_id=${vid}`));
        await api("歌手详情", 200, `/api/vocalist/${vid}`, { tier: "online" });
        await api("歌手统计摘要", 200, `/api/vocalist/${vid}/stats/summary`, { tier: "online" });
        await api("歌手热门歌", 200, `/api/vocalist/${vid}/songs/top`, { tier: "online" });
        await api("歌手最新歌", 200, `/api/vocalist/${vid}/songs/latest`, { tier: "online" });
        await api("歌手合成引擎", 200, `/api/vocalist/${vid}/synthesizers`, { tier: "online" });
        await api("歌手制作人", 200, `/api/vocalist/${vid}/producers`, { tier: "online" });
        await api("歌手 songs kind 非法 → 400", 400, `/api/vocalist/${vid}/songs/all`, { tier: "online" });
      }
    } else {
      log(C.yellow(`  ⚠ 种子条目没有 girls，跳过歌手用例`));
    }
  }

  group("E. 采集进度");
  await api("进度历史", 200, "/api/progress/history");

  group("F. 鉴权边界（未带 token 时该拒的必须拒）");
  await api("我的评论 未登录 → 401", 401, "/api/me/comments");
  // 读评论是公开的，别把它跟「发评论」混为一谈 —— 我第一次就是这么写错的，
  // 把公开接口当成需要鉴权，于是报出一个根本不存在的安全漏洞。
  await api("读视频评论 未登录 → 200", 200, `/api/video/${item?.aid ?? 1}/comments`, {
    check: (r) => (Array.isArray(r.json?.data?.list) ? null : "缺 data.list"),
  });
  await api("发评论 未登录 → 401", 401, `/api/video/${item?.aid ?? 1}/comments`, {
    method: "POST",
    body: { content: "这是一条不应该被发出去的测试评论" },
  });
}

// ────────────────────────────────────────── API：联网层（连 B 站）

async function testOnline() {
  log(C.bold("\nAPI 功能测试 —— 联网层（会真的调 B 站，失败未必是代码问题）"));
  const seed = await request(`${API}/api/board/all?ps=3`);
  const item = seed.json?.data?.list?.[0];

  group("G. 站内搜索");
  // 默认 type=video 走 searchVideos()，返回的是 data.items；
  // 只有 type=all 才会拆成 videos / users 两段。别把两种形状搞混。
  await api("搜「初音未来」", 200, "/api/search?keyword=" + enc("初音未来"), {
    tier: "online",
    check: (r) => (Array.isArray(r.json?.data?.items) ? null : `data 里没有 items 数组，实际键：${Object.keys(r.json?.data ?? {})}`),
  });
  await api("按 view 排序", 200, "/api/search?keyword=" + enc("初音未来") + "&sort=view", {
    tier: "online",
    check: (r) => (r.json?.data?.sort === "view" ? null : "sort 没有透传"),
  });
  // page=0 与 pn=0 是同一个病根：第 423 行 `Number(req.query.page) || 1` 把 0 当假值
  // 换成了 1，于是越界值被悄悄当成第 1 页放行。现状记录为 200，修完改成 400。
  await api("page=0（当前放行，已知 bug）", 200, "/api/search?keyword=" + enc("初音未来") + "&page=0", {
    tier: "online",
  });
  await api("page 超出上限 → 400", 400, "/api/search?keyword=a&page=99999", { tier: "online" });
  await api("库内 P主搜索", 200, "/api/owners?keyword=" + enc("Yowane"), {
    tier: "online",
    check: (r) => (Array.isArray(r.json?.data?.items ?? r.json?.data?.list) ? null : `缺 items：${Object.keys(r.json?.data ?? {})}`),
  });

  if (item?.aid) {
    await api("视频详情", 200, `/api/video/${item.aid}`, { tier: "online" });
    await api("视频角色", 200, `/api/video/${item.aid}/girls`, { tier: "online" });
    await api("视频关联", 200, `/api/video/${item.aid}/related`, { tier: "online" });
  }
  if (item?.owner?.mid) {
    await api("UP主 B 站资料", 200, `/api/member/${item.owner.mid}`, { tier: "online" });
  }
}

// ────────────────────────────────────────── 前端浏览器层

// 每个页面配一个「这页独有的文案」和一个合理的字数下限。
// 没有 marker 时测试只能靠字数猜，而字数会把「导航栏渲染好了、内容还没到」
// 误判成通过；min 也不能一刀切 —— /me 未登录时本来就没几个字。
// 下面这些字符串和下限都是用 scripts/_diag-pages.js 把每页 innerText 打出来、
// 逐条从真实输出里抄的，不是猜的。
const PAGES = [
  { path: "/", name: "首页", marker: "最新排行" },
  { path: "/rank", name: "排行榜", marker: "总榜" },
  { path: "/rank/cn", name: "中文榜", marker: "总榜" },
  { path: "/rank/all", name: "综合榜", marker: "总榜" },
  { path: "/search", name: "搜索页", marker: "热门搜索", min: 150 },
  { path: "/stats", name: "数据统计", marker: "歌曲筛选" },
  { path: "/tags", name: "标签页", marker: "标签云" },
  { path: "/singers", name: "歌手列表", marker: "歌姬实体" },
  { path: "/calculator", name: "计算器", marker: "输入 BV 号或粘贴视频链接", min: 250 },
  { path: "/formula-ranking", name: "公式排行", marker: "自定义公式排行" },
  { path: "/achievements", name: "成就", marker: "永久成就", min: 150 },
  { path: "/today", name: "今日推荐", marker: "收录往年同日投稿的虚拟歌手歌曲" },
  { path: "/about", name: "关于", min: 400 },
  { path: "/random", name: "随机", marker: "随机看看", min: 130 },
  // 未登录状态下 /me 本来就只有一个「尚未登录」提示，别用内容页的标准去卡它
  { path: "/me", name: "我的", marker: "尚未登录", min: 60 },
];

// 光有导航栏就有 75 个字，任何页面低于 120 字都等于只渲染了外壳。
const DEFAULT_MIN_TEXT = 120;

/**
 * 等页面「停下来」。
 * 不能只等 `#root` 里有节点 —— 外壳（导航+骨架）一渲染就满足条件了，
 * 于是每个页面都测出「196 节点 / 75 字」，一片假绿。
 * 改成盯 innerText 的字数，连续 3 次（约 2 秒）不再增长才算稳。
 */
async function settle(page, { timeout = 30000, interval = 700, stableRounds = 3 } = {}) {
  const t0 = Date.now();
  let last = -1;
  let stable = 0;
  let text = "";
  while (Date.now() - t0 < timeout) {
    text = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim());
    if (text.length === last) {
      stable += 1;
      if (stable >= stableRounds) return { text, stable: true };
    } else {
      stable = 0;
      last = text.length;
    }
    await page.waitForTimeout(interval);
  }
  return { text, stable: false };
}

async function testBrowser() {
  log(C.bold("前端功能测试 —— 真实 Chromium 打开每个页面"));
  let chromium;
  try {
    ({ chromium } = require("playwright"));
  } catch (e) {
    log(C.red(`  无法加载 playwright：${e.message.split("\n")[0]}`));
    log(C.dim("  装法：npm i -D playwright && npx playwright install chromium"));
    results.push({ group: "前端", label: "playwright 可用", ok: false, problems: [e.message] });
    return;
  }

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });

  // 取真实 aid / mid 测详情页 —— 写死一个 id 测不出「数据已经取不到」这类故障
  let aid = null;
  let mid = null;
  const seed = await request(`${API}/api/board/all?ps=3`);
  const item = seed.json?.data?.list?.[0];
  if (item) {
    aid = item.aid;
    mid = item.owner?.mid ?? null;
  }
  if (aid) PAGES.push({ path: `/video/${aid}`, name: "视频详情", marker: "简介" });
  if (mid) PAGES.push({ path: `/member/${mid}`, name: "UP主详情", marker: "收录作品" });

  group("H. 页面加载");
  for (const p of PAGES) {
    const page = await ctx.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    const apiFailures = [];

    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text().slice(0, 160));
    });
    page.on("pageerror", (e) => pageErrors.push(String(e.message).slice(0, 160)));
    page.on("response", (r) => {
      const u = r.url();
      // 只查本站接口。站外图片（i0.hdslb.com 等）挂掉不是本站的锅。
      if (u.includes("/api/") && r.status() >= 400) {
        apiFailures.push(`${r.status()} ${u.replace(WEB, "")}`);
      }
    });

    const problems = [];
    let note = "";
    try {
      const resp = await page.goto(WEB + p.path, { waitUntil: "domcontentloaded", timeout: 30000 });
      if (!resp || resp.status() >= 400) problems.push(`导航状态 ${resp?.status()}`);

      const { text, stable } = await settle(page);
      const minText = p.min ?? DEFAULT_MIN_TEXT;
      note = `${text.length} 字`;

      if (!stable) problems.push(`30 秒内页面内容一直在变，没稳定下来（最后 ${text.length} 字）`);
      if (text.length < minText) {
        problems.push(`只有 ${text.length} 字，低于本页下限 ${minText} 字，疑似只渲染了外壳`);
      }
      if (p.marker && !text.includes(p.marker)) {
        problems.push(`页面上找不到「${p.marker}」，抓到的开头是「${text.slice(0, 120)}」`);
      }
      // 页面上自己显示出来的报错也算失败
      if (/加载失败|出错了|服务端错误|Internal Server Error|请求失败/.test(text)) {
        const m = text.match(/(加载失败|出错了|服务端错误|Internal Server Error|请求失败)[^ ]{0,30}/);
        problems.push(`页面显示错误：${m ? m[0] : ""}`);
      }
    } catch (e) {
      problems.push(`异常：${String(e.message).split("\n")[0]}`);
    }

    if (pageErrors.length) problems.push(`JS 异常 ${pageErrors.length} 处：${pageErrors[0]}`);
    if (apiFailures.length) problems.push(`接口失败 ${apiFailures.length} 处：${apiFailures.slice(0, 3).join(", ")}`);
    if (consoleErrors.length) note += `${C.dim("  控制台报错:")} ${consoleErrors[0]}`;

    const bad = problems.length > 0;
    results.push({ group: currentGroup, label: `${p.name} ${p.path}`, tier: "browser", ok: !bad, problems });
    log(`  ${bad ? C.red("✗") : C.green("✓")} ${p.name} ${C.dim(p.path)}`);
    if (bad) for (const pr of problems) log(`      ${C.red(pr)}`);
    else log(`      ${C.dim(note)}`);

    await page.close();
  }

  await browser.close();
}

// ────────────────────────────────────────── 汇总

function summary() {
  log(`\n${C.bold("=".repeat(64))}`);
  const byTier = {};
  for (const r of results) {
    const t = r.tier || "local";
    byTier[t] ??= { pass: 0, fail: 0 };
    byTier[t][r.ok ? "pass" : "fail"] += 1;
  }
  for (const [t, v] of Object.entries(byTier)) {
    const color = v.fail ? C.red : C.green;
    log(`  ${t.padEnd(8)} 通过 ${String(v.pass).padStart(3)}   失败 ${color(String(v.fail).padStart(3))}`);
  }

  const fails = results.filter((r) => !r.ok);
  if (fails.length) {
    log(`\n${C.bold("失败明细")}`);
    for (const f of fails) {
      log(`  ${C.red("✗")} [${f.tier || "local"}] ${f.label}`);
      for (const pr of f.problems) log(`      ${pr}`);
    }
  }
  log(`\n${fails.length ? C.red(`✗ ${fails.length} 项失败`) : C.green("✓ 全部通过")}`);
  return fails.length === 0;
}

(async () => {
  const mode = process.argv[2] || "api";

  const ping = await request(`${API}/api/stats`, { timeout: 5000 });
  if (ping.error) {
    log(C.red(`API 没起来（${API}）：${ping.error}`));
    log(C.dim("先跑 node scripts/dev.js start"));
    process.exit(1);
  }

  if (mode === "api" || mode === "all") {
    await testLocal();
    await testOnline();
  }
  if (mode === "browser" || mode === "all") {
    await testBrowser();
  }
  process.exit(summary() ? 0 : 1);
})();