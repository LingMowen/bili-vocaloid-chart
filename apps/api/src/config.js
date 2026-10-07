const path = require("node:path");

// .env 用 __dirname 定位（apps/api/.env），而不是 dotenv 默认的「从 cwd 读」：
// 这样从仓库根目录 `npm run dev:api` 启动也能读到，不再必须先 cd 到 apps/api。
// 注：cache / .data 等目录本来就是 __dirname 定位，与 cwd 无关。
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const bool = (v, d = false) => (v == null ? d : /^(1|true|yes|on)$/i.test(String(v)));
const list = (v) =>
  String(v || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

// 第三方聚合登录：可同时挂多套服务商（协议相同，都是 connect.php?act=login + return.php），
// 按渠道分流。为什么需要它：不同平台开通的渠道不一样 —— 本项目 mapay 只给
// qq/wx/alipay 配了密钥（其余渠道返回 errcode 104「当前登录方式未配置密钥」），
// 而 cc云 10 个渠道全开通，单一服务商覆盖不全。
//
// 三条规则，都有实测依据：
// 1. 只有「可用」（appKey 非空）的服务商才参与路由。否则一个没配密钥的平台
//    会凭默认 *_TYPES 把它声明的渠道全部抢走，登录必然失败（这个坑踩过，
//    见 _tmp/probe-provider-compat.mjs 的「旧用户」场景）。
// 2. 渠道在多个服务商里都声明时，取数组里靠前的（mapay 优先）。
// 3. 路由表与对外渠道列表必须同源计算，否则「前端显示能点、后端说没服务商」。
function buildOAuth() {
  const defs = [
    {
      name: "mapay",
      apiUrl: process.env.MAPAY_API_URL || "https://login.mapay.cn/",
      appId: process.env.MAPAY_APPID || "0",
      appKey: process.env.MAPAY_APPKEY || "",
      callbackUrl: process.env.MAPAY_CALLBACK || "",
      types: list(process.env.MAPAY_TYPES),
    },
    {
      name: "cccyun",
      apiUrl: process.env.CCCYUN_API_URL || "https://u.cccyun.cc/",
      appId: process.env.CCCYUN_APPID || "1000",
      appKey: process.env.CCCYUN_APPKEY || "1111111111111111111111111111",
      callbackUrl:
        process.env.CCCYUN_CALLBACK || "http://localhost:1003/api/auth/oauth/callback",
      types: list(process.env.CCCYUN_TYPES),
    },
  ];
  const usable = defs.filter((p) => p.appKey);
  const route = new Map();
  for (const p of usable) for (const t of p.types) if (!route.has(t)) route.set(t, p);
  // 兼容旧的单一配置：只填了 CCCYUN_* + OAUTH_TYPES 的人，把整包渠道交给
  // 第一个可用服务商（即 cc云），行为与改造前一致。
  if (route.size === 0) {
    const first = usable[0];
    if (first) for (const t of list(process.env.OAUTH_TYPES || "qq,wx")) if (!route.has(t)) route.set(t, first);
  }
  return { usable, route, types: [...route.keys()] };
}
const oauth = buildOAuth();

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
  // 双向同步摄入端点的鉴权令牌（SYNC_TOKEN）。
  // 为什么必须校验：/api/sync/* 是「能改库」的写端点，而服务监听 0.0.0.0 且经
  // Cloudflare 公网可达。无令牌等于任何人都能往库里灌数据。
  // 未配置时端点直接 503（fail-closed），而不是「允许匿名」——漏配比拒绝更危险。
  syncToken: process.env.SYNC_TOKEN || "",
  // 周期调度的网格平移量（毫秒）。本地留 0 -> 落 :00/:05/:10…；
  // 云端配 150000（2.5 分钟）-> 落 :02:30/:07:30…，与本地在同一张 5 分钟网格上错开。
  // 为什么需要：两边共用同一个 B 站 cookie（部署时 .env 一起推上去的），严格同一刻
  // 同时扫等于同一账号瞬时双倍突发请求，抬高风控概率。错峰半步既保持「按北京时间
  // 整刻度」的可预测性，又不撞车。
  schedulePhaseMs: Number(process.env.SCHEDULE_PHASE_MS) || 0,
  // 对端 API 基址（审核前的拉取式同步用）。本地配云端 IP 直连、云端配本地 CF 隧道域名。
  // 为什么两端配不同：本地在 NAT 后云端拉不到，但本地能主动连云端；云端够不到本地局域网，
  // 靠 Cloudflare 隧道把本地 API 暴露成 sync.ciallo.ltd 才打通。
  // 未配置时 pullRound 直接 skip，审核照常进行（同步是补齐、不是前置条件）。
  syncPeerApi: process.env.SYNC_PEER_API || "",
  // 参与路由的服务商（已剔除没配密钥的）与「渠道 → 服务商」表。
  // auth.js 直接用 route.get(type)，不再自己算，避免两处逻辑漂移。
  oauthProviders: oauth.usable,
  oauthRoute: oauth.route,
  // 对外暴露的渠道 = 路由表的键，与 oauthRoute 严格同源
  oauthTypes: oauth.types,
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