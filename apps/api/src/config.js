const path = require("node:path");

// .env 用 __dirname 定位（apps/api/.env），而不是 dotenv 默认的「从 cwd 读」：
// 这样从仓库根目录 `npm run dev:api` 启动也能读到，不再必须先 cd 到 apps/api。
// 注：cache / .data 等目录本来就是 __dirname 定位，与 cwd 无关。
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

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
  // 本机开发时的前端地址，也是「来源无法判定」时的兜底。
  // 公网访问时不要指望这个值：隧道域名会变，写死只会把访客送回他自己的电脑。
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:1005",
  // 公网来源白名单（逗号分隔的 host，如 `a.example.com,.trycloudflare.com`）。
  // 以 `.` 开头表示后缀匹配，用来适配 quick tunnel 每次重建都换域名的特性。
  // 为什么必须白名单：来源直接决定 OAuth 回调的 redirect_uri 与 token 的落点，
  // 不校验 Host 就等于开放重定向。
  publicOrigins: (process.env.PUBLIC_ORIGINS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  sessionSecret:
    process.env.SESSION_SECRET || "bili-vocaloid-chart-dev-secret-change-me",
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