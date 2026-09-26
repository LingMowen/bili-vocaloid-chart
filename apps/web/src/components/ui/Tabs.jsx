/**
 * 两组切换控件，此前在多个页面各写了一遍，抽到这里共用。
 *
 * 1) `SegmentedTabs` —— 卡片底 + 网格排布，选中项用主色实心。
 *    参考站 `/search` 与 `/artists` 顶部分类栏（`10-artists.html` / `26-search-results.html`）。
 * 2) `PillTabs` —— 灰底胶囊 + 选中项白底浮起，用于体量较小的次级切换
 *    （榜单侧栏「歌手 / P主」、歌手列表排序）。
 *
 * ⚠ 列数/断点用 `gridClass` 直接传字符串，不要用模板串拼（Tailwind 构建期扫不到会丢样式）。
 */

const SEG_BTN = "rounded-md py-1.5 text-xs font-medium transition sm:rounded-lg sm:py-2 sm:text-sm";
const SEG_ON = "bg-primary text-primary-foreground";
const SEG_OFF = "text-muted-foreground hover:text-foreground";

/** items: [[value, label], ...] */
export function SegmentedTabs({ items, value, onChange, gridClass = "grid-cols-4", className = "" }) {
  return (
    <div className={`grid gap-1 rounded-lg bg-card p-1 shadow-sm sm:rounded-xl ${gridClass} ${className}`}>
      {items.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`${SEG_BTN} ${value === v ? SEG_ON : SEG_OFF}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// 选中项底色：榜单侧栏用 bg-background，歌手列表排序用 bg-card（都取自参考站）
const PILL_ON = {
  background: "bg-background text-foreground shadow-sm",
  card: "bg-card text-foreground shadow-sm",
};
const PILL_SIZE = {
  xs: "px-2.5 py-1 text-[11px]",
  sm: "px-2.5 py-1 text-xs",
};

/** items: [[value, label], ...] */
export function PillTabs({ items, value, onChange, tone = "background", size = "xs", className = "" }) {
  return (
    <div className={`flex items-center rounded-lg bg-muted/60 p-0.5 ${className}`}>
      {items.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`rounded-md font-medium transition ${PILL_SIZE[size]} ${
            value === v ? PILL_ON[tone] : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
