// JS 分片（vite 动态 import / 依赖预构建产物）加载失败的全局兜底。
//
// 现象：浏览器控制台刷 `net::ERR_CACHE_READ_FAILURE 200 (OK)`（本地磁盘缓存条目损坏）
// 或 dev server 重启后旧 hash 失效，导致 `Failed to fetch dynamically imported module`，
// React.lazy 直接 reject → 组件树崩溃 → **整页白屏**。
//
// 处理：判定为分片加载失败时自动刷新一次（节流，避免无限刷新）；刷新上限用尽后交给
// ChunkErrorBoundary 显示可点击重试的降级 UI。

const KEY = "xngs:chunk-reload";
const WINDOW_MS = 60_000; // 60s 内的刷新次数才计入上限
const MAX_RELOAD = 2;
const MIN_GAP_MS = 3_000; // 两次自动刷新最小间隔，防止抖动时打满

// Chromium / vite / webpack 各家对「分片加载失败」的措辞不一，全列上
export const CHUNK_ERROR_RE =
  // 注意 `reading 'default'`：vite 生产构建下动态 import 失败时，模块对象为 undefined，
  // React.lazy 读取 .default 抛出的是这个 TypeError，措辞里没有 chunk/import 字样
  /(dynamically imported module|Failed to fetch dynamically|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading chunk \d+ failed|reading 'default')/i;

export function isChunkError(err) {
  const msg = String((err && (err.message || err.reason || err)) || "");
  return CHUNK_ERROR_RE.test(msg);
}

function readState() {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function writeState(next) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* 隐私模式下 sessionStorage 不可写，忽略即可 */
  }
}

/** 分片加载失败时尝试自动刷新；返回 true 表示已触发刷新 */
export function tryAutoReload() {
  const now = Date.now();
  const s = readState();
  const n = now - (s.t || 0) > WINDOW_MS ? 0 : s.n || 0;
  if (n >= MAX_RELOAD) return false;
  if (now - (s.t || 0) < MIN_GAP_MS && n > 0) return false;
  writeState({ t: now, n: n + 1 });
  location.reload();
  return true;
}

/** 页面恢复正常后清掉计数，避免误伤后续偶发失败 */
export function resetReloadCount() {
  writeState({ t: 0, n: 0 });
}

export function installModuleGuard() {
  if (typeof window === "undefined") return;

  // vite 官方事件：预加载的依赖/分片失败时触发，preventDefault 可阻止 vite 抛出致命错误
  window.addEventListener("vite:preloadError", (e) => {
    if (typeof e.preventDefault === "function") e.preventDefault();
    tryAutoReload();
  });

  // 兜底：未被 React 捕获的动态 import rejection
  window.addEventListener("unhandledrejection", (e) => {
    if (isChunkError(e.reason)) tryAutoReload();
  });

  // script/link 资源加载失败也会走到 window error（捕获阶段）
  window.addEventListener(
    "error",
    (e) => {
      const el = e.target;
      if (el instanceof HTMLScriptElement || el instanceof HTMLLinkElement) tryAutoReload();
    },
    true,
  );
}
