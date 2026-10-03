import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// 隧道域名白名单：vite 5.4.12+ 默认校验 Host 头以防 DNS rebinding，
// 隧道转发过来的 Host 是 xxx.trycloudflare.com，不加白名单会直接被 403。
// 只放行 trycloudflare.com 子域，不用 `true`（那等于关掉整个防护）。
const TUNNEL_HOSTS = [".trycloudflare.com"];

// 前端所有请求都走相对路径 /api/*，经代理转发到本机后端。
// 于是隧道只需要暴露一个端口，API 与页面同源，没有 CORS 问题。
const API_PROXY = {
  "/api": "http://localhost:1003",
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