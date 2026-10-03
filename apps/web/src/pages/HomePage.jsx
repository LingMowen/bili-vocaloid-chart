import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, fmt } from "../api.js";
import { qk } from "../queryKeys.js";
import { RankRow, RankHero, RankBadge, STAT_META } from "../components/RankCard.jsx";

function SectionHead({ title, to, badge, className = "" }) {
  const { t } = useTranslation();
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <h2 className="truncate text-base font-bold tracking-tight sm:text-xl">{title}</h2>
        {badge && (
          <span className="whitespace-nowrap rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary sm:text-xs">
            {badge}
          </span>
        )}
      </div>
      {to && (
        <Link
          to={to}
          className={`inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary transition-colors hover:text-primary/80 sm:text-sm ${className}`}
        >
{t("home.viewAllBoard")}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </Link>
      )}
    </div>
  );
}

function useBoard(kind, order, ps = 20, period = "daily") {
  const q = useQuery({
    queryKey: qk.board({ kind, order, ps, period }),
    queryFn: () => api(`/api/board/${kind}?pn=1&ps=${ps}&order=${order}&period=${period}`, { silent: true }),
  });
  return [q.data, q.error?.message, q.isLoading];
}


function MiniHero({ item, rank }) {
  const girls = item.girls || [];
  return (
    <Link
      to={`/video/${item.aid}`}
      className="group relative block min-w-0 overflow-visible rounded-xl"
    >
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-muted sm:absolute sm:inset-0 sm:aspect-auto">
        <img
          src={item.pic || item.cover}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-linear-to-t from-black/78 via-black/20 to-transparent" />
      </div>
      <div className="hidden sm:block sm:aspect-video sm:w-full" aria-hidden="true" />
      <RankBadge rank={rank} />
      <div className="absolute bottom-0 left-0 right-0 z-10 min-w-0 overflow-hidden p-2.5 sm:p-3">
        <p className="truncate text-xs font-bold text-white sm:text-sm">{item.title}</p>
        <div className="mt-0.5 flex min-w-0 items-baseline gap-1 text-white/82">
          <span className="shrink-0 text-xs font-semibold tabular-nums sm:text-sm">{fmt(item.score ?? 0)}</span>
          <span className="shrink-0 text-[9px] text-white/55 sm:text-[10px]">pt</span>
          {girls.length > 0 && (
            <span className="ml-1 min-w-0 truncate text-[10px] text-white/70">{item.owner?.name} · {girls.join("、")}</span>
          )}
        </div>
      </div>
    </Link>
  );
}

function MiniSkeleton({ rows = 5 }) {
  return (
    <div className="space-y-1">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="grid min-h-16 grid-cols-[6.875rem_minmax(0,1fr)_auto] items-center gap-2 overflow-visible rounded-lg p-1.5 xs:grid-cols-[7.75rem_minmax(0,1fr)_auto] sm:gap-3">
          <div className="aspect-video w-full shrink-0 animate-pulse rounded-lg bg-muted" />
          <div className="min-w-0 space-y-1.5">
            <div className="h-3.5 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-2.5 w-1/2 animate-pulse rounded bg-muted" />
          </div>
          <div className="h-3 w-10 shrink-0 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

function DailyPicks() {
  const { t } = useTranslation();
  const [data, err] = useBoard("all", "daily", 3, "daily");
  const items = data?.list || [];
  return (
    <section className="min-w-0">
      <SectionHead
        title={t("home.todayDaily")}
        to={`/rank/daily${data ? `/${data.issue}` : ""}`}
        badge={data?.date_start}
      />
      {err && <p className="pb-2 text-xs text-destructive">{err}</p>}
      {items.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-5">
          <RankHero item={items[0]} rank={0} />
          <div className="grid min-w-0 grid-cols-2 gap-2 sm:col-span-2 sm:grid-cols-1 sm:grid-rows-2">
            {items.slice(1, 3).map((item, i) => (
              <MiniHero key={item.aid} item={item} rank={i + 1} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

// 与 vocabili 同款配色（同时用于成就页 / 榜单徽章）
const ACH_COLORS = {
  emerging_hit: "#6A0DAD",
  mega_hit: "#CCA300",
  potential_regular: "#23AFA4",
  regular: "#127436",
  daily_regular: "#127436",
  daily_potential_regular: "#23AFA4",
};

// 首页成就速递：跨榜混排（board=all），一次取回全部类别后按达成日期倒序取前 10 条。
// 对齐 vocabili —— 它调 /achievement 不传 board/type，本地 sort 后 slice(0,10)。
function useAchievements(board, type, pageSize = 6) {
  const q = useQuery({
    queryKey: qk.achievements({ board, type, page_size: pageSize }),
    queryFn: () => api(`/api/achievements?board=${board}&type=${type}&page_size=${pageSize}`, { silent: true }),
  });
  return [q.data, q.error?.message, q.isLoading];
}

// 制作人 / 歌手行：各自用「、」连接，两段用「 | 」连接（vocabili 的 OO()）。
// 歌手过滤掉 is_support（应援/合唱位不计入）。
function artistLine(song) {
  const producers = (song?.producers || []).map((p) => p?.producer?.name).filter(Boolean).join("、");
  const vocalists = (song?.vocalists || [])
    .filter((v) => v?.is_support !== true)
    .map((v) => v?.vocalist?.name)
    .filter(Boolean)
    .join("、");
  return [producers, vocalists].filter(Boolean).join(" | ");
}

// 首页「成就速递」卡片：跨榜混排最近达成的永久成就（Emerging Hit! / Mega Hit!!! / 门番候补 / 门番 / 日刊门番…）
function AchieveCard() {
  const { t } = useTranslation();
  const [data, err, loading] = useAchievements("all", "all", 10);
  const items = data?.data ?? [];
  if (!loading && !err && items.length === 0) return null;
  return (
    <section className="flex h-full flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b px-3 py-3 xs:px-4">
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-amber-500" aria-hidden="true">
            <path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z" />
            <path d="M5 21h14" />
          </svg>
          <h2 className="text-base font-semibold xs:text-lg">{t("home.achievements")}</h2>
        </div>
        <Link to="/achievements" className="inline-flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:text-primary/80">
          {t("home.viewAll")}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 shrink-0" aria-hidden="true">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </Link>
      </div>
      <div className="flex-1 p-1.5 xs:p-2">
        {loading ? (
          <div className="space-y-1">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : err ? (
          <p className="p-3 text-xs text-destructive">{err}</p>
        ) : (
          <ul className="space-y-0.5">
            {items.map((it) => {
              const label = t(`achievements.cat.${it.category}.label`);
              return (
                <li key={`${it.category}-${it.song_id}`}>
                  <Link
                    to={`/video/${it.song_id}`}
                    className="grid min-h-16 grid-cols-[6.875rem_minmax(0,1fr)_auto] items-center gap-2 overflow-visible rounded-lg p-1.5 transition-colors hover:bg-primary/5 xs:grid-cols-[7.75rem_minmax(0,1fr)_auto] sm:gap-3"
                  >
                    <div className="relative aspect-video w-full shrink-0 overflow-visible">
                      <div className="absolute inset-0 overflow-hidden rounded-md bg-muted">
                        <img src={it.song?.thumbnail || it.song?.pic || it.song?.cover} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                      </div>
                      <span
                        className="absolute -left-1 -top-1 z-10 flex h-6 min-w-6 items-center justify-center whitespace-nowrap rounded-md px-2 text-[10px] font-black leading-none shadow ring-2 ring-background"
                        style={{ backgroundColor: ACH_COLORS[it.category] || "#6A0DAD", color: "#fff" }}
                        title={label}
                      >
                        {label}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <span className="block max-w-full overflow-hidden text-sm font-medium leading-tight">
                        <span className="inline-block whitespace-nowrap">{it.song?.display_name || it.song?.title}</span>
                      </span>
                      <span className="mt-0.5 block max-w-full overflow-hidden text-xs text-muted-foreground">
                        <span className="inline-block whitespace-nowrap">{artistLine(it.song)}</span>
                      </span>
                    </div>
                    <div className="shrink-0 text-right tabular-nums">
                      <div className="text-xs font-semibold text-foreground sm:text-sm">
                        {it.achieved_issue != null ? `#${it.achieved_issue}` : "·"}
                      </div>
                      <div className="mt-0.5 text-[10px] text-muted-foreground">{t("home.achieved")}</div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

function WeeklySection() {
  const { t } = useTranslation();
  const [tab, setTab] = useState("weekly");
  const [data, err, loading] = useBoard("all", "score", 10, tab);
  const items = data?.list || [];
  return (
    <div className="grid min-w-0 items-stretch gap-4 md:gap-6 lg:grid-cols-5">
      <div className="min-w-0 lg:col-span-3">
        <section className="flex h-full flex-col overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b px-4 py-3 xs:px-5 xs:py-4">
            <h2 className="text-base font-semibold xs:text-lg">{t("home.latestBoard")}</h2>
            <Link to={`/rank/${tab}${data ? `/${data.issue}` : ""}`} className="inline-flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:text-primary/80">
              #{data?.issue ?? "·"} {t("home.viewFullBoard")}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 shrink-0" aria-hidden="true">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
          <div className="flex border-b">
            {[["daily", t("rank.daily")], ["weekly", t("rank.weekly")], ["monthly", t("rank.monthly")], ["annual", t("rank.annual")]].map(([tabKey, label]) => (
              <button
                key={tabKey}
                type="button"
                onClick={() => setTab(tabKey)}
                className={`relative flex-1 py-2.5 text-center text-xs font-semibold transition-colors xs:text-sm ${
                  tab === tabKey
                    ? "text-primary after:absolute after:bottom-0 after:left-1 after:right-1 after:h-0.5 after:rounded-full after:bg-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
              {label}
              </button>
            ))}
          </div>
          {err && <p className="p-3 text-xs text-destructive">{err}</p>}
          <div className="flex-1 p-2 xs:p-3">
            {loading ? (
              <MiniSkeleton rows={8} />
            ) : items.length > 0 ? (
              <ul className="space-y-1">
                {items.map((item, i) => (
                  <li key={item.aid}>
                    <RankRow item={item} rank={i} />
                  </li>
                ))}
              </ul>
            ) : (
<p className="py-8 text-center text-xs text-muted-foreground">{t("home.noData")}</p>
            )}
          </div>
        </section>
      </div>
      <div className="min-w-0 lg:col-span-2">
        <AchieveCard />
      </div>
    </div>
  );
}

function useEvoStats(order, ps = 20) {
  const q = useQuery({
    queryKey: qk.evostats({ order, ps }),
    queryFn: () => api(`/api/evostats?pn=1&ps=${ps}&order=${order}`, { silent: true }),
  });
  return [q.data, q.error?.message, q.isLoading];
}

function DataBanner() {
  const { t } = useTranslation();
  const [order, setOrder] = useState("view");
  const [data, err, loading] = useEvoStats(order, 20);
  const items = data?.list || [];
  return (
    <section className="flex h-full flex-col overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b px-4 py-3 xs:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="min-w-0 truncate text-base font-semibold xs:text-lg">{t("home.dataTotal")}</h2>
        </div>
        <Link to="/stats" className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary transition-colors hover:text-primary/80">
          {t("home.stats")}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 shrink-0" aria-hidden="true">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </Link>
      </div>
      <div className="flex overflow-x-auto border-b scrollbar-none">
        {STAT_META.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setOrder(key)}
            className={`relative flex-1 whitespace-nowrap py-2.5 text-center text-xs font-semibold transition-colors xs:text-sm ${
              order === key
                ? "text-primary after:absolute after:bottom-0 after:left-1 after:right-1 after:h-0.5 after:rounded-full after:bg-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t(`video.${label}`)}
          </button>
        ))}
      </div>
      {err && <p className="p-3 text-xs text-destructive">{err}</p>}
      <div className="p-2 xs:p-3">
        {loading ? (
          <MiniSkeleton rows={20} />
        ) : items.length > 0 ? (
          <ul className="space-y-1">
            {items.map((item, i) => (
              <li key={item.aid}>
                <RankRow item={item} rank={i} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-8 text-center text-xs text-muted-foreground">{t("home.noData")}</p>
        )}
      </div>
    </section>
  );
}

function HistoryToday() {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: qk.today({}), queryFn: () => api("/api/today", { silent: true }) });
  const err = q.error?.message;
  const data = q.data;
  if (err) return null;
  if (!data) return null;
  const count = data.count ?? data.list?.length ?? 0;
  return (
    <section className="flex h-full flex-col overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b px-4 py-3 xs:px-5">
        <h2 className="text-base font-semibold xs:text-lg">{t("home.historyToday", { month: data.month ?? "", day: data.day ?? "" })}</h2>
        <Link to="/today" className="inline-flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:text-primary/80">
          {t("home.viewMore")}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 shrink-0" aria-hidden="true">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </Link>
      </div>
      {count === 0 ? (
        <div className="flex items-center justify-between gap-3 p-4">
          <p className="text-sm text-muted-foreground">{t("home.noHistoryToday")}</p>
          <Link to="/rank/all" className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline">
            {t("home.goBoard")}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      ) : (
        <div className="flex-1 p-2 xs:p-3">
          <div className="grid gap-1">
            {(data.list || []).slice(0, 20).map((item, i) => (
              <RankRow key={item.aid ?? i} item={item} rank={i} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export default function HomePage() {
  return (
    <div className="space-y-7">
      {/* 2026-09-30：提名功能（/interaction）已删除，首页「ED 提名」横幅一并移除 */}
      <DailyPicks />
      <WeeklySection />
      <div className="grid min-w-0 items-stretch gap-4 md:gap-6 lg:grid-cols-5">
        <div className="min-w-0 lg:col-span-3">
          <DataBanner />
        </div>
        <div className="min-w-0 lg:col-span-2">
          <HistoryToday />
        </div>
      </div>
    </div>
  );
}