import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import * as Tooltip from "@radix-ui/react-tooltip";
import "./index.css";
import "./i18n/index.js";
import App from "./App.jsx";
import { queryClient } from "./query.js";

// 封面图兜底：B 站图片 CDN 偶发 403/404（防盗链、图片被删）时隐藏该 img，
// 露出容器的 bg-muted 占位底色，避免页面上出现裂图图标。
// img 的 error/load 事件不冒泡，所以必须用捕获阶段监听 —— 一处生效、覆盖全站。
// load 里恢复显示：React 会复用 img 节点换 src，失败过的节点换了新地址后要能重新露出来。
window.addEventListener(
  "error",
  (e) => {
    const el = e.target;
    if (el instanceof HTMLImageElement) el.style.visibility = "hidden";
  },
  true,
);
window.addEventListener(
  "load",
  (e) => {
    const el = e.target;
    if (el instanceof HTMLImageElement) el.style.visibility = "";
  },
  true,
);

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Tooltip.Provider delayDuration={400}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </Tooltip.Provider>
  </StrictMode>
);