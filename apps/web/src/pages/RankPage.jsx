import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { api, fmt } from "../api.js";
import { qk } from "../queryKeys.js";
import { NewBadge, RankRow, AchievementBadges, STAT_META } from "../components/RankCard.jsx";
import SelectField, { SelectItem } from "../components/ui/SelectField.jsx";
import Tip from "../components/ui/Tip.jsx";
import { PillTabs } from "../components/ui/Tabs.jsx";
import { LayoutGrid, List } from "lucide-react";
import { useShortFmt } from "../useShortFmt.js";

const PERIODS = [
  ["daily", "rank.daily"],
  ["weekly", "rank.weekly"],
  ["monthly", "rank.monthly"],
  ["annual", "rank.annual"],
];

const PAGE_SIZE = 20;

const ORDER_META = [
  ["daily", "rank.orderDaily"],
  ["score", "rank.orderScore"],
  ["view", "rank.orderView"],
  ["favorite", "rank.orderFavorite"],
  ["coin", "rank.orderCoin"],
  ["like", "rank.orderLike"],
  ["danmaku", "rank.orderDanmaku"],
  ["reply", "rank.orderReply"],
  ["share", "rank.orderShare"],
];

function StatCells({ item }) {
  const { t } = useTranslation();
  const short = useShortFmt();
  const first = STAT_META.slice(0, 4);
  const second = STAT_META.slice(4);
  return (
    <div className="mt-3 space-y-2 xs:mt-4 xs:space-y-3">
      <div className="grid grid-cols-4 gap-2 text-center xs:gap-3">
        {first.map(([key, label]) => {
          const rank = item[`rank_${key}`];
          const best = rank === 1;
          return (
            <div key={key}>
              <div className="text-[10px] text-muted-foreground xs:text-xs">{label}</div>
              <div className={`text-xs font-semibold xs:text-sm ${best ? "text-rose-600 dark:text-rose-400" : ""}`}>{short(item[key])}</div>
              <div className={`text-[10px] xs:text-xs ${best ? "text-rose-500" : "text-muted-foreground"}`}>
                {rank != null ? t("video.rankPos", { n: rank }) : "-"}
              </div>
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-3 gap-2 text-center xs:gap-3">
        {second.map(([key, label]) => {
          const rank = item[`rank_${key}`];
          const best = rank === 1;
          return (
            <div key={key}>
              <div className="text-[10px] text-muted-foreground xs:text-xs">{label}</div>
              <div className={`text-xs font-semibold xs:text-sm ${best ? "text-rose-600 dark:text-rose-400" : ""}`}>{short(item[key])}</div>
              <div className={`text-[10px] xs:text-xs ${best ? "text-rose-500" : "text-muted-foreground"}`}>
                {rank != null ? t("video.rankPos", { n: rank }) : "-"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DeltaBox({ item }) {
  const { t } = useTranslation();
  const up = item.delta > 0;
  const hasPrev = item.prev_score != null;
  if (!hasPrev) {
    return (
      <div className="shrink-0 text-right">
        <div className="space-y-1 text-xs">
          <div className="font-medium text-amber-600 dark:text-amber-400">{t("rank.newListed")}</div>
          <div className="tabular-nums text-muted-foreground">- {t("rank.pt")}</div>
          <div className="font-semibold tabular-nums text-amber-600 dark:text-amber-400">NEW</div>
        </div>
      </div>
    );
  }
  return (
    <div className="shrink-0 text-right">
      <div className="space-y-1 text-xs">
        <div className={`flex items-center justify-end gap-0.5 font-medium ${up ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`h-3.5 w-3.5 shrink-0 ${up ? "" : "rotate-180"}`} aria-hidden="true">
            <path d="m18 15-6-6-6 6" />
          </svg>
          {item.prev_rank != null ? t("video.issueN", { n: item.prev_rank }) : "-"}
        </div>
        <div className="tabular-nums text-muted-foreground">{fmt(item.prev_score)} {t("rank.pt")}</div>
        <div className={`font-semibold tabular-nums ${up ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>
          {up ? "+" : ""}
          {(((item.delta ?? 0) * 100).toFixed(1))}%
        </div>
      </div>
    </div>
  );
}

function GridCard({ item, rank, external }) {
  const { t } = useTranslation();
  const girls = item.girls || [];
  const href = external && item.bvid
    ? `https://www.bilibili.com/video/${item.bvid}`
    : `/video/${item.aid}`;
  return (
    <article className="group min-w-0 overflow-hidden rounded-2xl border bg-card transition-shadow hover:shadow-lg">
      <div className="relative aspect-16/10 w-full overflow-hidden bg-muted">
        <a className="block h-full w-full" href={href} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined}>
          <img
            src={item.pic || item.cover}
            alt={item.title}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        </a>
        <div className="pointer-events-none absolute left-2 top-2 flex h-9 w-9 items-center justify-center rounded-xl text-lg font-bold shadow-lg xs:left-3 xs:top-3 xs:h-11 xs:w-11 xs:text-xl bg-amber-500 text-white">
          {rank + 1}
        </div>
        <div className="pointer-events-none absolute right-2 top-2 rounded-lg bg-amber-500 px-2 py-0.5 text-xs font-bold text-white shadow-lg xs:right-3 xs:top-3 xs:px-2.5 xs:py-1 xs:text-sm">
          {item.peak_rank != null ? t("rank.peakRank", { n: item.peak_rank }) : item.streak ? t("rank.streak", { n: item.streak }) : t("rank.newListed")}
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t from-black/80 to-transparent px-2 pb-2 pt-6 xs:px-3 xs:pb-3 xs:pt-8">
          <div className="flex items-end justify-end">
            <span className="text-xl font-bold text-white xs:text-2xl">{fmt(item.score ?? 0)}</span>
            <span className="ml-1 text-xs text-white/80 xs:text-sm">{t("rank.pt")}</span>
            {item.new && <span className="mb-0.5 ml-2 rounded-sm bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">NEW</span>}
          </div>
        </div>
      </div>
      <div className="p-3 xs:p-4">
        <div className="flex items-start gap-x-3">
          <div className="shrink-0">
            <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl bg-gray-200 dark:bg-gray-700">
              {item.owner?.face ? (
                <img src={item.owner.face} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <span className="text-sm font-bold text-muted-foreground">{(item.owner?.name || item.girls?.[0] || "?").slice(0, 1)}</span>
              )}
            </div>
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <span className="block max-w-full overflow-hidden text-xs font-medium text-blue-600 dark:text-blue-400">
              <span className="inline-block whitespace-nowrap">{item.owner?.name || item.author || item.girls?.[0] || t("rank.virtualSinger")}</span>
            </span>
            <a href={href} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined} className="block hover:text-primary">
              <span className="block max-w-full overflow-hidden text-sm font-bold leading-snug xs:text-base">
                <span className="inline-flex max-w-full items-center gap-1">
                  <span className="inline-block whitespace-nowrap">{item.title}</span>
                  {item.new && <NewBadge />}
                  <AchievementBadges item={item} />
                </span>
              </span>
            </a>
            {item.title_cn && (
              <span className="block max-w-full overflow-hidden text-xs text-muted-foreground">
                <span className="inline-block whitespace-nowrap">{item.title_cn}</span>
              </span>
            )}
            {girls.length > 0 && (
              <span className="block max-w-full overflow-hidden text-xs font-medium text-pink-600 dark:text-pink-400">
                <span className="inline-block whitespace-nowrap">{girls.join("、")}</span>
              </span>
            )}
          </div>
          <DeltaBox item={item} />
        </div>
        <StatCells item={item} />
      </div>
    </article>
  );
}

export default function RankPage() {
  const navigate = useNavigate();
  const { kind: paramKind, issue } = useParams();
  const { t } = useTranslation();
  const kind = "all";
  const period = PERIODS.some(([id]) => id === paramKind) ? paramKind : "daily";
  const [tab, setTab] = useState("all");
  const [order, setOrder] = useState("score");
  const [view, setView] = useState("grid");
  const [page, setPage] = useState(1);

  const isLatest = issue == null || String(issue) === "";

  useEffect(() => {
    setPage(1);
  }, [kind, order, period, issue, tab]);

  useEffect(() => {
    if (period === "daily" && isLatest) {
      setOrder("daily");
    } else if (order === "daily") {
      setOrder("score");
    }
  }, [period, isLatest]);

  const qs = issue != null && String(issue) !== ""
    ? `&issue=${encodeURIComponent(issue)}`
    : "";
  const effOrder = tab === "new" ? "new" : order;

  const { data, isLoading, error } = useQuery({
    queryKey: qk.board({ kind, order, period, issue, page, tab }),
    queryFn: () => api(`/api/board/${kind}?pn=${page}&ps=${PAGE_SIZE}&order=${effOrder}&period=${period}${qs}`, { silent: true }),
  });
  const err = error?.message;

  // 侧栏「本期歌手和P主排行」：singer 按歌姬聚合，producer 按投稿 UP 主聚合
  const [sideTab, setSideTab] = useState("singer");
  const singersQ = useQuery({
    queryKey: qk.singerBoard({ period, issue: data?.issue ?? issue, type: sideTab }),
    queryFn: () =>
      api(
        `/api/board/singers?period=${period}${data?.issue ? `&issue=${data.issue}` : ""}&limit=10&type=${sideTab}`,
        { silent: true },
      ),
    enabled: !isLoading && !error && Boolean(data?.issue),
    placeholderData: (prev) => prev,
  });

  const items = data?.list || [];
  const shown = useMemo(() => items, [items]);
  const periodLabel = t(PERIODS.find(([id]) => id === period)?.[1] || "rank.daily");

  const curIssue = issue != null && String(issue) !== "" ? String(issue) : data?.issue;
  const prevIssue = data?.prev_issue;
  const nextIssue = data?.next_issue;
  const minIssue = data?.min_issue ?? curIssue;
  const maxIssue = data?.latest_issue ?? nextIssue;

  return (
    // 注意：App.jsx 布局已提供 <main>，此处不可再嵌套 main（HTML 规范禁止）
    <div className="min-w-0">
      <div className="lg:grid lg:grid-cols-[1fr_320px] lg:gap-6">
        <div className="min-w-0">
          <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <div className="space-y-4 border-b bg-primary/5 px-4 py-5 sm:px-6">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => prevIssue && navigate(`/rank/${period}/${prevIssue}`)}
                  className="rounded-lg border bg-background p-2.5 transition enabled:hover:bg-accent disabled:opacity-40"
                  disabled={!prevIssue || Number(prevIssue) < Number(minIssue)}
                  aria-label={t("rank.prevIssue")}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0" aria-hidden="true">
                    <path d="m12 19-7-7 7-7M19 12H5" />
                  </svg>
                </button>
                <div className="min-w-0 text-center">
                  <h1 className="truncate text-xl font-bold sm:text-2xl">{periodLabel} {t("rank.issueTitle", { issue: data?.issue ?? "·" })}</h1>
                  <p className="mt-1 truncate text-sm text-muted-foreground">
                    {data?.date_start === data?.date_end ? data?.date_start : `${data?.date_start ?? "—"} ~ ${data?.date_end ?? "—"}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => nextIssue && navigate(`/rank/${period}/${nextIssue}`)}
                  className="rounded-lg border bg-background p-2.5 transition enabled:hover:bg-accent disabled:opacity-40"
                  disabled={!nextIssue || Number(nextIssue) > Number(maxIssue) || (issue != null && Number(issue) >= Number(maxIssue))}
                  aria-label={t("rank.nextIssue")}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0" aria-hidden="true">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <div className="flex rounded-lg border bg-background p-1">
                  {[["all", "rank.all"], ["new", "rank.new"]].map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setTab(id)}
                      className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${tab === id ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
                    >
                      {t(label)}
                    </button>
                  ))}
                </div>
                <SelectField
                  value={order}
                  onValueChange={setOrder}
                  triggerClassName="rounded-lg border bg-background px-3 py-2 text-sm"
                >
                  {ORDER_META.filter(([id]) => !(id === "daily" && !isLatest)).map(([id, label]) => (
                    <SelectItem key={id} value={id}>{t(label)}</SelectItem>
                  ))}
                </SelectField>
              </div>
            </div>

            <div className="p-4 sm:p-6">
              <div className="mb-4 flex items-center justify-between gap-2">
                <p className="shrink-0 text-sm text-muted-foreground">{t("rank.totalSongs", { n: data?.count ?? 0 })}</p>
                <div className="flex min-w-0 items-center gap-2">
                  <div className="lg:hidden">
                    <button type="button" onClick={() => navigate("/singers")} className="inline-flex items-center whitespace-nowrap rounded-lg border bg-background px-3 py-2 text-sm font-medium transition hover:bg-accent">
                      {t("rank.singerRank")}
                    </button>
                  </div>
                  <Link to="/calculator" className="hidden sm:inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border bg-muted/50 px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-primary/50 hover:text-primary">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
                      <path d="M4.5 3h15M6 3v16a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V3M6 14h12" />
                    </svg>
                    <span className="hidden sm:inline">{t("rank.customFormula")}</span>
                  </Link>
                  <div className="flex shrink-0 items-center gap-1 rounded-lg border bg-muted/50 p-0.5">
                    <Tip content={t("rank.gridView")}>
                      <button type="button" onClick={() => setView("grid")} aria-label={t("rank.gridViewAria")} className={`rounded-md p-1.5 transition-colors ${view === "grid" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                        <LayoutGrid className="h-4 w-4 shrink-0" />
                      </button>
                    </Tip>
                    <Tip content={t("rank.listView")}>
                      <button type="button" onClick={() => setView("list")} aria-label={t("rank.listViewAria")} className={`rounded-md p-1.5 transition-colors ${view === "list" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                        <List className="h-4 w-4 shrink-0" />
                      </button>
                    </Tip>
                  </div>
                </div>
              </div>

              {isLoading && <p className="py-16 text-center text-sm text-muted-foreground">{t("rank.loading")}</p>}
              {err && <p className="py-16 text-center text-sm text-destructive">{err}</p>}
              {!isLoading && !err && (
                shown.length > 0 ? (
                  view === "grid" ? (
                    <div className="grid gap-5 md:grid-cols-2">
                      {shown.map((item, i) => (
                        <GridCard key={item.bvid || item.aid} item={item} rank={(page - 1) * PAGE_SIZE + i} external={false} />
                      ))}
                    </div>
                  ) : (
                    <div className="grid gap-1 rounded-xl border bg-card p-1">
                      {shown.map((item, i) => (
                        <RankRow key={item.bvid || item.aid} item={item} rank={(page - 1) * PAGE_SIZE + i} external={false} />
                      ))}
                    </div>
                  )
                ) : (
                  <p className="py-16 text-center text-sm text-muted-foreground">
                    {tab === "new" ? t("rank.newEmpty") : t("rank.empty")}
                  </p>
                )
              )}
            </div>

            {data && Math.ceil(data.count / PAGE_SIZE) > 1 && (
              <div className="flex items-center justify-center gap-2 border-t px-4 py-3">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs transition enabled:hover:bg-accent disabled:opacity-40"
                >
                  {t("rank.prev")}
                </button>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {page} / {Math.max(1, Math.ceil(data.count / PAGE_SIZE))}
                </span>
                <button
                  type="button"
                  disabled={page >= Math.ceil(data.count / PAGE_SIZE)}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs transition enabled:hover:bg-accent disabled:opacity-40"
                >
                  {t("rank.next")}
                </button>
              </div>
            )}
          </div>
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-20 max-h-[calc(100vh-5rem)] space-y-4 overflow-y-auto pr-1">
            <div className="overflow-hidden rounded-2xl border bg-card">
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-bold">{t("rank.singerRankThisIssue")}</h3>
                </div>
                <PillTabs
                  className="shrink-0"
                  value={sideTab}
                  onChange={setSideTab}
                  items={[
                    ["singer", t("rank.tabSinger")],
                    ["producer", t("rank.tabProducer")],
                  ]}
                />
              </div>
              {singersQ.isLoading && !singersQ.data ? (
                <div className="space-y-2 px-4 py-4">
                  {[0, 1, 2, 3].map((n) => (
                    <div key={n} className="h-10 animate-pulse rounded-lg bg-muted/60" />
                  ))}
                </div>
              ) : (singersQ.data?.list || []).length === 0 ? (
                <p className="px-4 pb-6 pt-4 text-center text-xs text-muted-foreground">
                  {t(sideTab === "producer" ? "rank.producerRankEmpty" : "rank.singerRankEmpty")}
                </p>
              ) : (
                <ol className="divide-y">
                  {(singersQ.data?.list || []).map((g, i) => (
                    <li key={g.mid || g.name}>
                      <Link
                        to={
                          sideTab === "producer"
                            ? g.mid
                              ? `/member/${g.mid}`
                              : "/singers"
                            : g.id
                              ? `/singer/${g.id}`
                              : "/singers"
                        }
                        className="group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-accent"
                      >
                        <span
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold tabular-nums ${
                            i === 0
                              ? "bg-amber-500 text-white"
                              : i === 1
                                ? "bg-gray-400 text-white"
                                : i === 2
                                  ? "bg-orange-400 text-white"
                                  : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {i + 1}
                        </span>
                        <span className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-muted">
                          {g.picture || g.face ? (
                            <img
                              src={g.picture || g.face}
                              alt=""
                              loading="lazy"
                              referrerPolicy="no-referrer"
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center text-sm font-bold text-muted-foreground">
                              {(g.name || "?").slice(0, 1)}
                            </span>
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold group-hover:text-primary">{g.name}</span>
                          <span className="block text-[11px] text-muted-foreground">{t("rank.singerRankSongs", { n: g.count })}</span>
                        </span>
                        <span className="shrink-0 text-sm font-bold tabular-nums text-muted-foreground">
                          {fmt(g.score)}<span className="ml-0.5 text-[10px] font-normal">{t("rank.pt")}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}