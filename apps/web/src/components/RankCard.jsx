import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Calculator, ExternalLink, History } from "lucide-react";
import { fmt, fmtDate } from "../api.js";
import { useShortFmt } from "../useShortFmt.js";
import Tip from "./ui/Tip.jsx";

export const STAT_META = [
  ["view", "view"],
  ["favorite", "favorite"],
  ["coin", "coin"],
  ["like", "like"],
  ["danmaku", "danmaku"],
  ["reply", "reply"],
  ["share", "share"],
];

const RANK_LABELS = ["bg-amber-500 text-white", "bg-slate-400 text-white", "bg-amber-700 text-white", "bg-muted text-muted-foreground"];

/**
 * 网格卡片封面左上角名次徽章的配色。
 * 取自原站榜单页 DOM：第 1 名 bg-amber-500、第 2 名 bg-slate-400、
 * 第 3 名 bg-amber-700、第 4 名起 bg-black/70（全部 text-white）。
 * 注意与列表行用的 RANK_LABELS 不同 —— 列表行的第 4 档是 bg-muted，别统一。
 */
export const GRID_BADGE = [
  "bg-amber-500 text-white",
  "bg-slate-400 text-white",
  "bg-amber-700 text-white",
  "bg-black/70 text-white",
];

export function NewBadge() {
  return (
    <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-sm bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
      NEW
    </span>
  );
}

/**
 * 卡片右侧「本期新上榜」胶囊 —— 原站榜单卡片的写法，与标题旁的 NewBadge 不是同一个东西：
 *   `<div class="shrink-0 text-right"><span class="inline-block rounded-full
 *    bg-linear-to-r from-rose-500 to-pink-500 px-2.5 py-0.5 text-xs font-bold text-white shadow-sm">NEW</span></div>`
 * 文案固定英文 NEW（原站 zh 语言下也是 NEW），不走 i18n。
 */
export function NewPill() {
  return (
    <span className="inline-block rounded-full bg-linear-to-r from-rose-500 to-pink-500 px-2.5 py-0.5 text-xs font-bold text-white shadow-sm">
      NEW
    </span>
  );
}

/**
 * 网格卡片底部操作行（原站 `action.play` / `action.history` / `action.calculator`）。
 * 原站第三格在未登录时是禁用的「登录后可使用计算器」；本站计算器不需要登录，
 * 因此改为可用入口（口径差异见 docs/对接文档.md）。
 */
export function CardActions({ item }) {
  const { t } = useTranslation();
  const biliHref = item.bvid ? `https://www.bilibili.com/video/${item.bvid}` : `/video/${item.aid}`;
  const btn = "flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-medium transition xs:gap-1.5 xs:py-2 xs:text-sm";
  const icon = "h-3 w-3 xs:h-3.5 xs:w-3.5";
  return (
    <div className="mt-3 grid grid-cols-3 gap-1.5 xs:mt-4 xs:gap-2">
      <a
        href={biliHref}
        target="_blank"
        rel="noopener noreferrer"
        className={`${btn} bg-primary text-primary-foreground hover:opacity-90`}
      >
        <ExternalLink className={icon} />
        {t("rank.actionPlay")}
      </a>
      <Link to={`/video/${item.aid}`} className={`${btn} border hover:bg-accent`}>
        <History className={icon} />
        {t("rank.actionHistory")}
      </Link>
      <Link to="/calculator" className={`${btn} border hover:bg-accent`}>
        <Calculator className={icon} />
        {t("rank.actionCalculator")}
      </Link>
    </div>
  );
}

// 永久成就徽章：与 vocabili 对齐的四类（配色取自 vocabili 前端包）
// 2026-09-30：旧四类（SUPERHIT / 门番达成 / 神话达成 / 年榜首位）已下线，
// 后端 buildBoard 只回 emerging_hit / mega_hit / potential_regular / regular。
const ACH_BADGES = [
  ["emerging_hit", "Emerging Hit!", "#6A0DAD"],
  ["mega_hit", "Mega Hit!!!", "#CCA300"],
  ["potential_regular", "门番候补", "#23AFA4"],
  ["regular", "门番", "#127436"],
];

export function AchievementBadges({ item, className = "" }) {
  const ach = item?.achievements || {};
  const shown = ACH_BADGES.filter(([key]) => ach[key]);
  if (shown.length === 0) return null;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 ${className}`}>
      {shown.map(([key, label, color]) => (
        <span
          key={key}
          className="inline-flex items-center whitespace-nowrap rounded-sm px-1.5 py-0.5 text-[10px] font-bold text-white"
          style={{ backgroundColor: color }}
        >
          {label}
        </span>
      ))}
    </span>
  );
}

// 单行 + 省略号（truncate = overflow-hidden + text-overflow:ellipsis + nowrap）。
// 旧实现是 overflow-hidden + 内层 inline-block whitespace-nowrap，超长内容被无声硬裁、没有 …，
// 月刊这类多合作者条目尤其明显。完整内容见 /video/:aid 详情页。
function NoWrap({ children, className = "" }) {
  return <span className={`block max-w-full truncate ${className}`}>{children}</span>;
}

export function RankBadge({ rank, big }) {
  const cls = RANK_LABELS[Math.min(rank, RANK_LABELS.length - 1)];
  return (
    <Tip content={String(rank + 1)}>
      <span
        className={`absolute -left-1 -top-1 z-10 flex items-center justify-center rounded-lg font-black shadow ring-2 ring-background ${cls} ${
          big
            ? "h-9 min-w-9 px-2 text-lg xs:-left-1.5 xs:-top-1.5 xs:h-11 xs:min-w-11 xs:text-xl"
            : "h-7 min-w-7 px-1.5 text-base"
        }`}
    >
      {rank + 1}
    </span>
    </Tip>
  );
}

export function StatChips({ item, compact }) {
  const { t } = useTranslation();
  const short = useShortFmt();
  return (
    <div className={`grid gap-x-3 gap-y-0.5 ${compact ? "grid-cols-2" : "grid-cols-4 sm:grid-cols-7"}`}>
      {STAT_META.map(([key, label]) => {
        const rank = item[`rank_${key}`];
        return (
          <span key={key} className="flex items-baseline gap-1 whitespace-nowrap">
            <span className={`${compact ? "text-[10px]" : "text-[11px]"} text-muted-foreground`}>{t(`video.${label}`)}</span>
            <b className={`tabular-nums ${compact ? "text-xs" : "text-xs font-semibold"}`}>{short(item[key])}</b>
            {rank ? (
              <span className={`text-[10px] tabular-nums text-muted-foreground/80`}>
                · {rank}
              </span>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}

export function RankRow({ item, rank, external }) {
  const { t } = useTranslation();
  const short = useShortFmt();
  const girls = item.girls || [];
  const href = external && item.bvid
    ? `https://www.bilibili.com/video/${item.bvid}`
    : `/video/${item.aid}`;
  return (
    <Link
      to={href}
      className="grid min-h-16 grid-cols-[6.875rem_minmax(0,1fr)_auto] items-center gap-2 overflow-visible rounded-lg p-1.5 transition-colors hover:bg-primary/5 xs:grid-cols-[7.75rem_minmax(0,1fr)_auto] sm:gap-3"
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      <div className="relative aspect-video w-full shrink-0 overflow-visible">
        <div className="absolute inset-0 overflow-hidden rounded-lg bg-muted">
          <img
            src={item.pic || item.cover}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
          />
        </div>
        <RankBadge rank={rank} />
      </div>
      <div className="min-w-0">
        {/* 标题也是单行 + 省略号：原来是 overflow-hidden + inline-flex whitespace-nowrap，
            长标题（月刊/特刊常见）被硬裁、没有 …，与下面合作者行的截断方式不一致。
            徽章（NEW / 成就）用 shrink-0 固定在行尾，不参与截断。 */}
        <span className="flex min-w-0 max-w-full items-center gap-1.5 text-sm font-medium leading-tight">
          <span className="min-w-0 truncate">{item.title || item.name}</span>
          {item.new && <NewBadge />}
          <AchievementBadges item={item} />
        </span>
        <NoWrap className="mt-0.5 text-xs text-muted-foreground">
          {item.owner?.name || item.author || girls[0] || t("rank.virtualSinger")}
          {girls.length > 0 && <span className="text-primary"> · {girls.join(" / ")}</span>}
          {item.pubdate ? ` · ${fmtDate(item.pubdate)}` : ""}
        </NoWrap>
        {item.title_cn && (
          <NoWrap className="mt-0.5 text-[11px] text-muted-foreground/80">{item.title_cn}</NoWrap>
        )}
      </div>
      <div className="shrink-0 text-right tabular-nums">
        <div className="text-xs font-semibold text-foreground sm:text-sm">{short(item.score ?? item.stat?.view ?? item.view)}</div>
        <div className="mt-0.5 text-[10px] text-muted-foreground">
          {item.score != null ? t("rank.pt") : t("video.view")}
        </div>
      </div>
    </Link>
  );
}

export function RankHero({ item, rank }) {
  const { t } = useTranslation();
  const girls = item.girls || [];
  return (
    <Link
      to={`/video/${item.aid}`}
      className="group relative block min-w-0 overflow-visible rounded-xl sm:col-span-3"
    >
      <div className="relative aspect-video overflow-hidden rounded-xl bg-muted sm:absolute sm:inset-0 sm:aspect-auto">
        <img
          src={item.pic || item.cover}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-linear-to-t from-black/82 via-black/25 to-transparent" />
      </div>
      <div className="hidden sm:block sm:aspect-video sm:w-full" aria-hidden="true" />
      <RankBadge rank={rank} big />
      <div className="absolute bottom-0 left-0 right-0 z-10 min-w-0 overflow-hidden p-3 sm:p-4">
        <h3 className="mb-0.5 truncate text-base font-bold text-white sm:text-xl">{item.title}</h3>
        <p className="mb-1.5 truncate text-xs text-white/72 sm:text-sm">
          {item.owner?.name}
          {girls.length > 0 && <span> | {girls.join("、")}</span>}
        </p>
        <div className="inline-flex shrink-0 items-baseline gap-1 rounded-md bg-white/15 px-2.5 py-0.5 text-white backdrop-blur-sm">
          <span className="text-base font-bold tabular-nums sm:text-xl">{fmt(item.score ?? 0)}</span>
          <span className="text-[10px] text-white/60 sm:text-xs">{t("rank.pt")}</span>
        </div>
      </div>
    </Link>
  );
}
