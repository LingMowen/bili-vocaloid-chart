import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import * as Tooltip from "@radix-ui/react-tooltip";
import "./index.css";
import "./i18n/index.js";
import App from "./App.jsx";
import { queryClient } from "./query.js";
import { installImgGuard } from "./imgGuard.js";
import { installModuleGuard } from "./moduleGuard.js";

// 封面图兜底（403/404 隐藏占位 + Chromium ERR_CACHE_READ_FAILURE 自动重试），
// 实现在 ./imgGuard.js，全站一处生效。
installImgGuard();
// 路由分片 / vite 预构建依赖加载失败的兜底（vite:preloadError 等），实现在 ./moduleGuard.js
installModuleGuard();

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