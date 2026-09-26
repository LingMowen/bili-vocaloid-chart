require("dotenv").config();

const bool = (v, d = false) => (v == null ? d : /^(1|true|yes|on)$/i.test(String(v)));

module.exports = {
  port: Number(process.env.PORT) || 1003,
  sessdata: process.env.SESSDATA || "",
  // bilibili 登录 cookie 串（name=value; ...），用于 SDK 请求 B 站接口
  bilibiliCookie: process.env.BILIBILI_COOKIE || "",
  // AI 审核（判定歌曲是否为虚拟歌姬演唱）
  // enabled=false 时：不请求 AI 上游、不启动审核 worker、单例调用一律 fail-open 放行
  // （注意：放行而非拒绝，避免「审核关闭」被误读为「内容不通过」而误删库存条目）
  aiReview: {
    enabled: bool(process.env.AI_REVIEW_ENABLED, true),
    base: process.env.AI_REVIEW_BASE || "",
    key: process.env.AI_REVIEW_KEY || "",
    model: process.env.AI_REVIEW_MODEL || "step-3.5-flash",
  },
  rankMaxPs: 50,
  searchMaxPage: 20,
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:1005",
  sessionSecret:
    process.env.SESSION_SECRET || "xngschina-dev-secret-change-me",
  cccyun: {
    apiUrl: process.env.CCCYUN_API_URL || "https://u.cccyun.cc/",
    appId: process.env.CCCYUN_APPID || "1000",
    appKey: process.env.CCCYUN_APPKEY || "1111111111111111111111111111",
    callbackUrl:
      process.env.CCCYUN_CALLBACK || "http://localhost:1003/api/auth/oauth/callback",
    types: (process.env.OAUTH_TYPES || "qq,wx").split(",").map((s) => s.trim()).filter(Boolean),
  },
  smtp: {
    enabled: bool(process.env.SMTP_ENABLED, false),
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT) || 465,
    secure: bool(process.env.SMTP_SECURE, true),
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.SMTP_FROM || "",
  },
};