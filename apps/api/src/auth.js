const crypto = require("node:crypto");
const path = require("node:path");
const express = require("express");
const nodemailer = require("nodemailer");
const config = require("./config");
const { stmts, findUser } = require("./db");

const OAUTH_TYPES = config.cccyun.types || ["qq", "wx"];
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

function makeState(type) {
  const ts = String(Date.now());
  const sig = crypto
    .createHmac("sha256", config.cccyun.appKey)
    .update(`${type}:${ts}`)
    .digest("hex");
  return `${ts}.${sig}`;
}

function verifyState(type, state) {
  const [ts, sig] = String(state || "").split(".");
  if (!ts || !sig) return false;
  if (Date.now() - Number(ts) > STATE_TTL_MS) return false;
  const expect = crypto
    .createHmac("sha256", config.cccyun.appKey)
    .update(`${type}:${ts}`)
    .digest("hex");
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect));
}

function cccyunGet(params) {
  const url = `${config.cccyun.apiUrl}connect.php?${new URLSearchParams(params)}`;
  return fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(12000),
  })
    .then((r) => r.json())
    .catch((e) => ({ code: -1, msg: `cccyun 请求失败: ${e.message}` }));
}

function cccyunLogin(type) {
  const state = makeState(type);
  return cccyunGet({
    act: "login",
    appid: config.cccyun.appId,
    appkey: config.cccyun.appKey,
    type,
    redirect_uri: config.cccyun.callbackUrl,
    state,
  }).then((arr) => ({ arr, state }));
}

function cccyunCallback(type, code) {
  return cccyunGet({
    act: "callback",
    appid: config.cccyun.appId,
    appkey: config.cccyun.appKey,
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
      const { arr, state } = await cccyunLogin(type);
      if (!arr || arr.code !== 0 || !arr.url) {
        return res.status(502).json({ ok: false, message: (arr && arr.msg) || "获取授权地址失败" });
      }
      res.json({ ok: true, data: { url: `${arr.url}${arr.url.includes("?") ? "&" : "?"}state=${state}` } });
    } catch (e) {
      next(e);
    }
  });

  router.get("/oauth/callback", async (req, res, next) => {
    try {
      const type = String(req.query.type || "");
      const { code, state } = req.query;
      if (!OAUTH_TYPES.includes(type) || !code || !verifyState(type, String(state))) {
        return res.status(400).send("回调校验失败，请重新登录");
      }
      const arr = await cccyunCallback(type, String(code));
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
      const target = config.frontendUrl.replace(/\/$/, "");
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
        subject: "【xngschina】登录验证码",
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