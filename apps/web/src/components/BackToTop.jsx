import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUp } from "lucide-react";

// 本站的滚动容器不是 window —— index.css 里 `html, body { overflow: hidden }`，
// 真正滚动的是 App.jsx 里那个 `div.overflow-y-auto`。
// 所以回到顶部必须滚动那个元素，用 window.scrollTo 会完全没有反应。
const SCROLL_ROOT = '[data-scroll-root="true"]';
const SHOW_AFTER = 320; // 滚动超过 320px 才出现，避免短页面反复闪动
const DURATION = 420; // 自定义缓动时长（ms），与原站的平滑手感接近

// 自己实现平滑滚动，不能用 el.scrollTo({ behavior: "smooth" })。
// 实测（Chromium + 本站布局：外层 h-dvh、内层 overflow-y-auto）：
// 该调用**不抛错、behavior 参数被接受，但滚动完全不发生**，scrollTop 纹丝不动。
// 所以必须自己插值。
//
// 用 setInterval + timeStamp 逐帧算位置，不用 requestAnimationFrame：
// rAF 依赖合成器帧，页面不可见 / 后台标签页 / 自动化环境（headless CDP）下
// **回调不执行**（实测 rafFired=false），一按按钮就没反应——比原来的 bug 更隐蔽。
// setInterval 是纯定时器，后台会被节流到 1s 但仍会触发，最终一定滚到顶。
const FRAME_MS = 16;
function smoothScrollTop(el, duration = DURATION) {
  const start = el.scrollTop;
  if (start <= 0) return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    el.scrollTop = 0;
    return;
  }
  const t0 = performance.now();
  const id = setInterval(() => {
    const p = Math.min(1, (performance.now() - t0) / duration);
    // easeOutCubic：起步快、收尾稳，和浏览器原生 smooth 观感接近
    const e = 1 - Math.pow(1 - p, 3);
    el.scrollTop = start * (1 - e);
    if (p >= 1 || el.scrollTop <= 0) {
      el.scrollTop = 0;
      clearInterval(id);
    }
  }, FRAME_MS);
}

export default function BackToTop() {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);

  useEffect(() => {
    const el = document.querySelector(SCROLL_ROOT);
    if (!el) return;
    const onScroll = () => setShow(el.scrollTop > SHOW_AFTER);
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const label = t("common.backToTop");

  return (
    <button
      type="button"
      onClick={() => {
        const el = document.querySelector(SCROLL_ROOT);
        if (!el) return;
        smoothScrollTop(el);
        // 焦点交给滚动容器，键盘用户不会「停在」页面中间的不可见位置
        el.focus({ preventScroll: true });
      }}
      aria-label={label}
      title={label}
      // 隐藏时必须让按钮真正退出交互层。只用 pointer-events:none 是不够的：
      // position:fixed 的元素始终在文档流外且持续渲染，pointer-events:none 只是让
      // 点击穿透——穿透目标若恰好是 <a> 链接，用户点这个「看不见的按钮」就会被导航
      // 到别的页面（实测踩过）。hidden 让它 display:none，不再有可穿透目标。
      hidden={!show}
      // 显示时可聚焦、隐藏时移出 Tab 序列（配合 hidden 已足够，这里双保险）
      tabIndex={show ? 0 : -1}
      className={`fixed bottom-20 right-4 z-50 flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-all hover:bg-primary/90 active:scale-95 md:bottom-6 md:right-6 ${
        // 移动端底部有固定 Tab 栏（BottomTabBar），按钮需抬高避让
        show ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
      }`}
    >
      <ArrowUp className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}