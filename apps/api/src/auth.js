const crypto = require("node:crypto");
const path = require("node:path");
const express = require("express");
const nodemailer = require("nodemailer");
const config = require("./config");
const { stmts, findUser } = require("./db");

const OAUTH_TYPES = config.oauthTypes || ["qq", "wx"];
// 渠道 → 服务商 的路由表：按 config.oauthProviders 顺序建，先声明的优先。
// 两个 provider 都声明同一渠道时取靠前那个（mapay 优先，因为它是当前主用）。
const PROVIDER_BY_TYPE = (() => {
  const m = new Map();
  for (const p of config.oauthProviders || []) {
    for (const t of p.types || []) {
      if (!m.has(t)) m.set(t, p);
    }
  }
  return m;
})();
// 取某渠道的服务商；找不到就退回第一个 provider（保证旧单套配置仍能跑）
function providerFor(type) {
  return PROVIDER_BY_TYPE.get(type) || (config.oauthProviders || [])[0] || null;
}
const OAUTH_STATE_COOKIE = "oauth_state";
const CODE_TTL_MS = 5 * 60 * 1000;
const CODE_RESEND_MS = 60 * 1000;
const STATE_TTL_MS = 10 * 60 * 1000;

const emailCodes = new Map();
const emailThrottle = new Map();

function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto
    .createHmac("sha256", config.sessionSecret)
    .update(body)
    .digest("base64url");
  return `${body}.${sig}`;
}

function verifyToken(token) {
  try {
    const [body, sig] = String(token || "").split(".");
    if (!body || !sig) return null;
    const expect = crypto
      .createHmac("sha256", config.sessionSecret)
      .update(body)
      .digest("base64url");
    const a = Buffer.from(sig);
    const b = Buffer.from(expect);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function issueToken(uid) {
  return signToken({ uid, exp: Date.now() + 30 * 24 * 3600 * 1000 });
}

function makeState(type, provider) {
  const ts = String(Date.now());
  const sig = crypto
    .createHmac("sha256", provider.appKey)
    .update(`${type}:${ts}`)
    .digest("hex");
  return `${ts}.${sig}`;
}

function verifyState(type, state, provider) {
  const [ts, sig] = String(state || "").split(".");
  if (!ts || !sig) return false;
  // 先校验时间戳本身是数字：非数字会让 Date.now() - NaN 变成 NaN，
  // 而 `NaN > TTL` 恒为 false，等于把过期判断整个绕过。
  if (!/^\d+$/.test(ts)) return false;
  if (Date.now() - Number(ts) > STATE_TTL_MS) return false;
  const expect = crypto
    .createHmac("sha256", provider.appKey)
    .update(`${type}:${ts}`)
    .digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  // timingSafeEqual 要求两边字节数相同，否则抛异常（表现为 500，而不是校验失败）。
  // 签名长度不对说明这压根不是我们签的，直接判失败即可。
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// 不引入 cookie-parser，手动解析即可（只需读一个自建 cookie）
function parseCookies(header) {
  const out = {};
  for (const part of String(header || "").split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    try {
      out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      /* 忽略非法编码 */
    }
  }
  return out;
}

function cccyunGet(provider, params) {
  const url = `${provider.apiUrl}connect.php?${new URLSearchParams(params)}`;
  return fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(12000),
  })
    .then((r) => r.json())
    .catch((e) => ({ code: -1, msg: `${provider.name} 请求失败: ${e.message}` }));
}

function cccyunLogin(provider, type, redirectUri) {
  const state = makeState(type, provider);
  return cccyunGet(provider, {
    act: "login",
    appid: provider.appId,
    appkey: provider.appKey,
    type,
    redirect_uri: redirectUri || provider.callbackUrl,
    state,
  }).then((arr) => ({ arr, state }));
}

// 该 host 是否允许当作「访客看到的来源」
function hostAllowed(hostname) {
  const h = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (!h) return false;
  // 环回地址：本机开发，任意端口都放行
  if (h === "localhost" || h === "127.0.0.1" || h === "::1") return true;
  // 已配置的前端地址 / 各 provider 的回调地址（取其 host，兼容各自换过端口的历史）
  for (const cfgUrl of [
    config.frontendUrl,
    ...(config.oauthProviders || []).map((p) => p.callbackUrl),
  ]) {
    try {
      if (new URL(cfgUrl).hostname.toLowerCase() === h) return true;
    } catch {
      /* 配置项非法就跳过，不影响其余判据 */
    }
  }
  // 显式白名单：`a.example.com` 精确匹配，`.example.com` 后缀匹配
  return config.publicOrigins.some((p) => (p.startsWith(".") ? h.endsWith(p) : h === p));
}

// 从请求里推断「访客看到的来源」，用来拼 OAuth 的 redirect_uri。
// 为什么不能写死：隧道域名每次重建都会变，写死只会把公网访客送回他自己的电脑。
// 为什么必须过白名单：这个值会进入 redirect_uri，不校验就是开放重定向。
// 为什么环回要改写成 127.0.0.1：cc云平台侧授权的是 IP 形式，localhost 会被判
// 「回调域名未授权」；而两者本就是同一台机器，端口保持原样。
function requestOrigin(req) {
  const rawHost = String(req.headers.host || "").trim();
  if (!rawHost) return null;
  const hostname = rawHost.replace(/:\d+$/, "");
  if (!hostAllowed(hostname)) return null;
  let host = rawHost;
  if (hostname === "localhost" || hostname === "::1") {
    const port = rawHost.match(/:(\d+)$/);
    host = `127.0.0.1${port ? `:${port[1]}` : ""}`;
  }
  // 经隧道时 cloudflared 会带上 x-forwarded-proto: https
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  const proto = forwardedProto === "https" || (!forwardedProto && req.secure) ? "https" : "http";
  return `${proto}://${host}`;
}

function cccyunCallback(provider, type, code) {
  return cccyunGet(provider, {
    act: "callback",
    appid: provider.appId,
    appkey: provider.appKey,
    type,
    code,
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function randomEmailCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

function requireAuth(req, res, next) {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const payload = verifyToken(token);
  if (!payload || !payload.uid) {
    return res.status(401).json({ ok: false, message: "未登录或登录已过期" });
  }
  req.user = findUser(payload.uid);
  if (!req.user) {
    return res.status(401).json({ ok: false, message: "用户不存在" });
  }
  next();
}

function publicUser(u) {
  return u
    ? {
        id: u.id,
        provider: u.provider,
        nickname: u.nickname || (u.email || "用户"),
        faceimg: u.faceimg || "",
        email: u.email || "",
        created_at: u.created_at,
      }
    : null;
}

function makeRouter() {
  const router = express.Router();

  router.get("/config", (req, res) => {
    res.json({
      ok: true,
      data: {
        oauth: OAUTH_TYPES,
        smtp: Boolean(config.smtp.enabled),
      },
    });
  });

  router.get("/oauth/login", async (req, res, next) => {
    try {
      const type = String(req.query.type || "");
      if (!OAUTH_TYPES.includes(type)) {
        return res.status(400).json({ ok: false, message: "不支持的登录方式" });
      }
      // 先按渠道选出服务商：不同渠道可能挂在不同聚合登录平台上
      const provider = providerFor(type);
      if (!provider) {
        return res.status(400).json({ ok: false, message: "不支持的登录方式" });
      }
      // 回调地址按「访客实际访问的来源」拼，而不是用 .env 里写死的本机地址：
      // 公网访客拿到的 redirect_uri 必须指回公网域名，否则浏览器会被送回
      // 他自己的 127.0.0.1。来源不在白名单内时退回该 provider 的配置值。
      const origin = requestOrigin(req);
      const redirectUri = origin
        ? `${origin}/api/auth/oauth/callback`
        : provider.callbackUrl;
      const { arr, state } = await cccyunLogin(provider, type, redirectUri);
      if (!arr || arr.code !== 0 || !arr.url) {
        return res.status(502).json({ ok: false, message: (arr && arr.msg) || "获取授权地址失败" });
      }
      // state 改用 cookie 携带，不再拼到 URL 上：
      // 聚合平台返回的 url 里已带它自己的 state（用于 return.php 找回回调地址），
      // 若再追加同名参数会出现两个 state，回调端取到的是平台的，我们自己的签名校验必然失败。
      res.setHeader(
        "Set-Cookie",
        `${OAUTH_STATE_COOKIE}=${encodeURIComponent(`${type}:${state}`)}; Path=/; Max-Age=600; SameSite=Lax`,
      );
      // 默认 302 直跳授权页：前端走的是 window.location.href 整页导航，
      // 返回 JSON 会让浏览器把接口报文当页面渲染（点登录只看到一段 JSON，不弹授权页）。
      // 需要程序化取 URL 时加 ?format=json。
      if (String(req.query.format || "") === "json") {
        return res.json({ ok: true, data: { url: arr.url } });
      }
      return res.redirect(arr.url);
    } catch (e) {
      next(e);
    }
  });

  router.get("/oauth/callback", async (req, res, next) => {
    try {
      const type = String(req.query.type || "");
      const { code, state } = req.query;
      // 回调必须走与登录时相同的服务商，否则 state 签名用的 key 对不上，必然校验失败
      const provider = providerFor(type);
      if (!provider) {
        return res.status(400).send("回调校验失败，请重新登录");
      }
      // 优先用 URL 上带回的 state，取不到时回退到登录时写入的 cookie
      const jar = parseCookies(req.headers.cookie);
      const [cType, cState] = String(jar[OAUTH_STATE_COOKIE] || "").split(":");
      const stateOk =
        verifyState(type, String(state || ""), provider) ||
        (cType === type && verifyState(type, String(cState || ""), provider));
      // state 一次性：无论成败都清掉，避免重放
      res.setHeader("Set-Cookie", `${OAUTH_STATE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`);
      if (!OAUTH_TYPES.includes(type) || !code || !stateOk) {
        return res.status(400).send("回调校验失败，请重新登录");
      }
      const arr = await cccyunCallback(provider, type, String(code));
      if (!arr || arr.code !== 0 || !arr.social_uid) {
        return res.status(502).send(`第三方登录失败：${(arr && arr.msg) || "未知错误"}`);
      }
      const row = stmts.upsertOAuth.get(
        type,
        String(arr.social_uid),
        String(arr.nickname || "用户"),
        String(arr.faceimg || ""),
        Date.now(),
      );
      const token = issueToken(row.id);
      // 回调端点与前端同源（公网走隧道域名、本地走 vite 代理的 1005/1007），
      // 所以优先用相对路径：浏览器按当前来源解析，token 永远不会被送到别的域。
      // 只有在来源无法判定时才退回配置的绝对地址。
      const target = requestOrigin(req)
        ? ""
        : config.frontendUrl.replace(/\/$/, "");
      res.redirect(`${target}/auth/success?token=${encodeURIComponent(token)}`);
    } catch (e) {
      next(e);
    }
  });

  router.post("/email/code", async (req, res, next) => {
    try {
      const email = String(req.body.email || "").trim().toLowerCase();
      if (!EMAIL_RE.test(email) || email.length > 100) {
        return res.status(400).json({ ok: false, message: "邮箱格式不正确" });
      }
      if (!config.smtp.enabled) {
        return res.status(503).json({ ok: false, message: "SMTP 尚未配置，暂时无法使用邮箱登录" });
      }
      const last = emailThrottle.get(email) || 0;
      if (Date.now() - last < CODE_RESEND_MS) {
        return res.status(429).json({ ok: false, message: "发送过于频繁，请 60 秒后再试" });
      }
      const code = randomEmailCode();
      emailCodes.set(email, { code, exp: Date.now() + CODE_TTL_MS });
      emailThrottle.set(email, Date.now());
      const transporter = nodemailer.createTransport(config.smtp);
      await transporter.sendMail({
        from: config.smtp.from,
        to: email,
        subject: "【bili-vocaloid-chart】登录验证码",
        text: `你的登录验证码是 ${code}，5 分钟内有效。若非本人操作请忽略。`,
      });
      res.json({ ok: true, data: { sent: true } });
    } catch (e) {
      next(e);
    }
  });

  router.post("/email/login", (req, res) => {
    const email = String(req.body.email || "").trim().toLowerCase();
    const code = String(req.body.code || "").trim();
    const rec = emailCodes.get(email);
    if (!rec || rec.code !== code || rec.exp < Date.now()) {
      return res.status(400).json({ ok: false, message: "验证码错误或已过期" });
    }
    emailCodes.delete(email);
    const row = stmts.upsertEmail.get(email, email, Date.now());
    const token = issueToken(row.id);
    res.json({ ok: true, data: { token } });
  });

  router.get("/me", requireAuth, (req, res) => {
    res.json({ ok: true, data: { user: publicUser(req.user) } });
  });

  return router;
}

module.exports = { makeRouter, requireAuth, verifyToken, publicUser };