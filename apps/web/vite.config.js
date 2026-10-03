import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// 隧道域名白名单：vite 5.4.12+ 默认校验 Host 头以防 DNS rebinding，
// 隧道转发过来的 Host 是隧道域名，不加白名单会直接被 403。
// 只放行已知的隧道域名后缀，不用 `true`（那等于关掉整个防护）。
//   .ciallo.ltd        —— 命名隧道 vocaloid.ciallo.ltd（当前正式入口，域名固定）
//   .trycloudflare.com —— quick tunnel 临时域名（保留作应急，域名每次重建都会变）
const TUNNEL_HOSTS = [".ciallo.ltd", ".trycloudflare.com"];

// 前端所有请求都走相对路径 /api/*，经代理转发到本机后端。
// 于是隧道只需要暴露一个端口，API 与页面同源，没有 CORS 问题。
//
// changeOrigin 必须显式关掉：写成字符串 target 时 vite 会强制 changeOrigin=true，
// 把 Host 改写成 localhost:1003。而后端要靠 Host 判断「访客是从哪个域名来的」，
// 才能拼出正确的 OAuth 回调地址（详见 apps/api/src/auth.js 的 requestOrigin）。
// 关掉之后隧道域名原样透传，后端拿到的 Host 就是访客真正访问的那个域名。
const API_PROXY = {
  "/api": { target: "http://localhost:1003", changeOrigin: false },
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "0.0.0.0",
    port: 1005,
    allowedHosts: TUNNEL_HOSTS,
    proxy: API_PROXY,
  },
  // 生产预览（`vite preview`）：只服务 dist/ 里的构建产物，并把 /api 转给后端。
  // 隧道必须指向这里，绝不能指向上面的 dev server ——
  // dev server 会把整个仓库当静态根，任何人访问 /@fs/<绝对路径> 就能读到
  // .git/config、apps/api/cache/library.json（25 MB 全量数据）等任意文件。
  // 端口与 dev server 分开：dev 占 1005（本地开发用），preview 占 1007（对公网）。
  preview: {
    host: "0.0.0.0",
    port: 1007,
    allowedHosts: TUNNEL_HOSTS,
    proxy: API_PROXY,
  },
});