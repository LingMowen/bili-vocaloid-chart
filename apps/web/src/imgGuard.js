// 封面图全局兜底。
//
// 两类线上问题都由这里统一处理（img 的 error/load 事件不冒泡，必须用**捕获阶段**监听，
// 一处注册即覆盖全站，包括以后新增的图片）：
//
// 1) B 站图片 CDN 偶发 403/404（防盗链、原图被删）→ 隐藏该 img，露出容器的 bg-muted 占位底色，
//    避免页面上出现裂图图标。
// 2) Chromium 偶发 net::ERR_CACHE_READ_FAILURE —— 本地磁盘缓存条目损坏，资源其实返回了 200。
//    直接换一个带随机参数的 URL 重新加载，就会走网络而不读坏缓存，大多数情况一次即恢复。
//    重试仍是失败才隐藏。
//
// load 里恢复显示：React 会复用 img 节点换 src，失败过的节点换了新地址后要能重新露出来。

const MAX_RETRY = 2;
const RETRY_BASE_DELAY = 250;
const RETRYABLE = /^https?:\/\//i;

// 换 URL 参数绕过坏缓存：不同 query = 不同的缓存条目，浏览器必须回源。
function bust(url, n) {
  const stamp = `${Date.now()}-${n}`;
  try {
    // 可能是不带协议头的相对路径，交给 URL 解析前先判断
    const u = new URL(url, window.location.href);
    u.searchParams.set("_r", stamp);
    return u.toString();
  } catch {
    return url + (url.indexOf("?") >= 0 ? "&" : "?") + "_r=" + stamp;
  }
}

let installed = false;

export function installImgGuard() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener(
    "error",
    (e) => {
      const el = e.target;
      if (!(el instanceof HTMLImageElement)) return;

      const current = el.currentSrc || el.src || "";
      const origin = el.dataset.imgSrc || current;

      // 只给远程图重试；本地资源（/favicon.svg 之类）失败隐藏即可
      if (RETRYABLE.test(origin)) {
        const n = Number(el.dataset.imgRetry || 0);
        if (n < MAX_RETRY) {
          if (!el.dataset.imgSrc) el.dataset.imgSrc = origin;
          el.dataset.imgRetry = String(n + 1);
          const delay = RETRY_BASE_DELAY * (n + 1) + Math.random() * 200;
          window.setTimeout(() => {
            // 组件可能已卸载，或 src 已被业务代码换掉 —— 这两种情况都不再插手
            if (!el.isConnected) return;
            if ((el.dataset.imgSrc || "") !== origin) return;
            el.src = bust(origin, n + 1);
          }, delay);
          return; // 重试期间先不隐藏，等最终结果
        }
      }
      el.style.visibility = "hidden";
    },
    true,
  );

  window.addEventListener(
    "load",
    (e) => {
      const el = e.target;
      if (!(el instanceof HTMLImageElement)) return;
      el.style.visibility = "";
      // 加载成功后清掉重试计数，后续换封面时仍能重试
      delete el.dataset.imgRetry;
    },
    true,
  );
}
