import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
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

export function NewBadge() {
  return (
    <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-sm bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
      NEW
    </span>
  );
}

// 永久成就徽章（参考周刊规则）：SH / 门番 / 神话 / 年榜首位
const ACH_BADGES = [
  ["superhit", "SH", "bg-violet-600"],
  ["monban", "门番", "bg-emerald-600"],
  ["myth", "神话", "bg-amber-500"],
  ["annual_top", "年榜首位", "bg-sky-600"],
];

export function AchievementBadges({ item, className = "" }) {
  const ach = item?.achievements || {};
  const shown = ACH_BADGES.filter(([key]) => ach[key]);
  if (shown.length === 0) return null;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 ${className}`}>
      {shown.map(([key, label, cls]) => (
        <span key={key} className={`inline-flex items-center whitespace-nowrap rounded-sm px-1.5 py-0.5 text-[10px] font-bold text-white ${cls}`}>
          {label}
        </span>
      ))}
    </span>
  );
}

function NoWrap({ children, className = "" }) {
  return (
    <span className={`block max-w-full overflow-hidden ${className}`}>
      <span className="inline-block whitespace-nowrap">{children}</span>
    </span>
  );
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
        <span className="block max-w-full overflow-hidden text-sm font-medium leading-tight">
          <span className="inline-flex max-w-full items-center gap-1.5">
            <span className="inline-block whitespace-nowrap">{item.title || item.name}</span>
            {item.new && <NewBadge />}
            <AchievementBadges item={item} />
          </span>
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
