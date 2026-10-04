import { cloneElement, isValidElement } from "react";
import { Link } from "react-router-dom";
import { Music } from "lucide-react";

/**
 * 头像卡片（圆形/方形头像 + 名称 + 副文本），用于：
 *   - `/singers`（歌手 / P主 / 引擎 / UP主 列表）
 *   - 歌手详情页「使用的引擎」「常合作P主」
 *   - 搜索页「歌手」分类结果
 *
 * 三处此前各写了一遍，已抽到这里共用。
 *
 * ⚠ 头像底色是**按有无图片切换**的（照抄参考站 `10-artists.html` / `07-vocalist-102.html`）：
 *     有图 → `bg-gray-200 dark:bg-gray-700`（灰底衬托图片）
 *     无图 → `bg-blue-500/10` + `lucide-music text-blue-500` 占位
 *   之前三处实现各写死了其中一种，都不完全对。
 */

// 网格断点有两套，来自参考站不同页面，勿随意统一：
//   /artists（10-artists.html）   → md 断点 5 列
//   歌手详情（07-vocalist-102.html）→ md 断点仍是 4 列
export const ENTITY_GRID_WIDE = "grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 md:grid-cols-5 lg:grid-cols-6";
export const ENTITY_GRID_NARROW = "grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 lg:grid-cols-6";

const CARD_CLS =
  "group flex flex-col items-center gap-1.5 rounded-xl border bg-card p-3 text-center transition-shadow hover:shadow-md sm:rounded-2xl sm:p-4";

export function EntityCard({ to, href, picture, name, nameNode, sub, alt, fallbackText }) {
  // 无图时的兜底分两种：
  //   有名称 → 用名称首字做字母徽标（歌手 艾尔法、引擎 Talk Ex / TALQu 这类
  //            官方确实没图的条目，此前是一片空缺的灰框，观感像加载失败）
  //   没名称 → 通用 lucide-music 占位
  // 字母徽标只是排版兜底，**不冒充官方 logo**。
  const label = fallbackText ?? (typeof name === "string" ? name : "");
  const initial = label ? [...label.trim()][0] ?? "" : "";
  const body = (
    <>
      <div
        className={`flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl sm:h-14 sm:w-14 ${
          picture ? "bg-gray-200 dark:bg-gray-700" : "bg-blue-500/10"
        }`}
      >
        {picture ? (
          <img
            src={picture}
            alt={alt ?? ""}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
          />
        ) : initial ? (
          <span
            aria-hidden="true"
            className="select-none text-lg font-semibold uppercase leading-none text-blue-500 sm:text-xl"
          >
            {initial}
          </span>
        ) : (
          <Music className="h-5 w-5 text-blue-500 sm:h-6 sm:w-6" aria-hidden="true" />
        )}
      </div>
      <span className="line-clamp-1 text-xs font-medium group-hover:text-primary sm:text-sm">
        {nameNode ?? name}
      </span>
      {sub ? <span className="text-[10px] text-muted-foreground sm:text-xs">{sub}</span> : null}
    </>
  );

  if (href) {
    return (
      <a href={href} className={CARD_CLS}>
        {body}
      </a>
    );
  }
  if (to) {
    return (
      <Link to={to} className={CARD_CLS}>
        {body}
      </Link>
    );
  }
  return <div className={CARD_CLS}>{body}</div>;
}

/** 网格容器。`render(item, index)` 需返回 `EntityCard`。 */
export function EntityCardGrid({ items, render, empty, grid = ENTITY_GRID_WIDE }) {
  if (!items?.length) {
    return empty ? <p className="text-sm text-muted-foreground">{empty}</p> : null;
  }
  // 调用方传的 render() 通常不写 key，这里统一补上（缺失时 React 会告警并影响列表复用）。
  return (
    <div className={grid}>
      {items.map((it, i) => {
        const node = render(it, i);
        return isValidElement(node) && node.key == null ? cloneElement(node, { key: i }) : node;
      })}
    </div>
  );
}
