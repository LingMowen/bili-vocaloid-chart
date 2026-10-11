import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUp } from "lucide-react";

// 本站的滚动容器不是 window —— index.css 里 `html, body { overflow: hidden }`，
// 真正滚动的是 App.jsx 里那个 `div.overflow-y-auto`。
// 所以回到顶部必须滚动那个元素，用 window.scrollTo 会完全没有反应。
const SCROLL_ROOT = '[data-scroll-root="true"]';
const SHOW_AFTER = 320; // 滚动超过 320px 才出现，避免短页面反复闪动

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
        // 浏览器可能不支持 smooth，退化为瞬时滚动
        el?.scrollTo({ top: 0, behavior: "smooth" });
        // 焦点回到顶部容器，键盘用户不会「停在」页面中间的不可见位置
        el?.focus({ preventScroll: true });
      }}
      aria-label={label}
      title={label}
      aria-hidden={!show}
      tabIndex={show ? 0 : -1}
      className={`fixed right-4 z-50 flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-all hover:bg-primary/90 active:scale-95 md:right-6 ${
        // 移动端底部有固定 Tab 栏（BottomTabBar），按钮需抬高避让
        show ? "bottom-20 translate-y-0 opacity-100 md:bottom-6" : "pointer-events-none bottom-20 translate-y-2 opacity-0 md:bottom-6"
      }`}
    >
      <ArrowUp className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}