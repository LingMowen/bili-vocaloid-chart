import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { api, fmt } from "../api.js";
import { qk } from "../queryKeys.js";
import { RankRow, AchievementBadges, CardActions, NewPill, GRID_BADGE, STAT_META } from "../components/RankCard.jsx";
import SelectField, { SelectItem } from "../components/ui/SelectField.jsx";
import Tip from "../components/ui/Tip.jsx";
import { PillTabs } from "../components/ui/Tabs.jsx";
import { LayoutGrid, List, Trophy } from "lucide-react";

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
  const first = STAT_META.slice(0, 4);
  const second = STAT_META.slice(4);
  // 指标名走 i18n（原站 data.view 等）；数值用原始千分位，不缩写
  const cell = ([key, label]) => {
    const rank = item[`rank_${key}`];
    const best = rank === 1;
    return (
      <div key={key}>
        <div className="text-[10px] text-muted-foreground xs:text-xs">{t(`video.${label}`)}</div>
        <div className={`text-xs font-semibold xs:text-sm ${best ? "text-rose-600 dark:text-rose-400" : ""}`}>{fmt(item[key])}</div>
        <div className={`text-[10px] xs:text-xs ${best ? "text-rose-500" : "text-muted-foreground"}`}>
          {rank != null ? t("rank.posShort", { n: rank }) : "-"}
        </div>
      </div>
    );
  };
  return (
    <div className="mt-3 space-y-2 xs:mt-4 xs:space-y-3">
      <div className="grid grid-cols-4 gap-2 text-center xs:gap-3">{first.map(cell)}</div>
      <div className="grid grid-cols-3 gap-2 text-center xs:gap-3">{second.map(cell)}</div>
    </div>
  );
}

function DeltaBox({ item }) {
  const { t } = useTranslation();
  const up = item.delta > 0;
  const hasPrev = item.prev_score != null;
  // 原站：无上期数据时右侧只放一枚渐变 NEW 胶囊（不是三行「新上榜 / - pt / NEW」）
  if (!hasPrev) {
    return (
      <div className="shrink-0 text-right">
        <NewPill />
      </div>
    );
  }
  // 顶行「上期 N」的颜色与箭头跟随「名次升降」，底行百分比跟随「分数升降」——两者可以相反
  // （原站第 4 张卡：名次 2→4 变差=绿、分数 +17.7% 上升=红）。红涨绿跌，沿用中国股市惯例。
  const prevRank = item.prev_rank;
  const curRank = item.score_rank;
  const rankUp = prevRank != null && curRank != null && curRank < prevRank;
  return (
    <div className="shrink-0 text-right">
      <div className="space-y-1 text-xs">
        <div className={`flex items-center justify-end gap-0.5 font-medium ${rankUp ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`h-3.5 w-3.5 shrink-0 ${rankUp ? "" : "rotate-180"}`} aria-hidden="true">
            <path d="m18 15-6-6-6 6" />
          </svg>
          {prevRank != null ? t("rank.prevRankLabel", { n: prevRank }) : "-"}
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

/**
 * 歌姬名 → 本站歌手页 id（原站 `/vocalist/:id` 对应本站 `/singer/:vocabili_id`）。
 * 榜单条目只带 `girls: string[]` 没有 id，所以按名批量查一次 `/api/singers?names=`。
 * 一次请求解析整页歌姬，结果按名缓存 30 分钟；查不到的返回 null，卡片退化为纯文本（不产生死链）。
 */
function useSingerIds(names) {
  const key = [...new Set(names)].sort().join(",");
  const q = useQuery({
    queryKey: qk.singers({ names: key }),
    queryFn: () => api(`/api/singers?names=${encodeURIComponent(key)}`, { silent: true }),
    enabled: key.length > 0,
    staleTime: 30 * 60 * 1000,
    placeholderData: (prev) => prev,
  });
  return useMemo(() => {
    const map = {};
    const s = q.data?.singers;
    if (s) for (const [n, v] of Object.entries(s)) if (v?.vocabili_id) map[n] = v.vocabili_id;
    return map;
  }, [q.data]);
}

function GridCard({ item, rank, external, singerIds = {} }) {
  const { t } = useTranslation();
  const girls = item.girls || [];
  const songHref = external && item.bvid
    ? `https://www.bilibili.com/video/${item.bvid}`
    : `/video/${item.aid}`;
  const ext = external ? { target: "_blank", rel: "noopener noreferrer" } : {};
  const ownerName = item.owner?.name || item.author || girls[0] || t("rank.virtualSinger");
  const ownerMid = item.owner?.mid || null;
  // 原站徽章是「累计上榜次数」（接口字段 count），本站后端目前只算了「连续在榜」
  // （streak）——口径差异见 docs/对接文档.md；后端补上 count 后此处自动切过去。
  const listedCount = item.count ?? item.streak ?? 0;
  return (
    <article className="group overflow-hidden rounded-2xl border bg-card transition-shadow hover:shadow-lg">
      <div className="relative aspect-16/10 w-full overflow-hidden bg-muted">
        <a className="block h-full w-full" href={songHref} {...ext}>
          <img
            src={item.pic || item.cover}
            alt={item.title}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        </a>
        <div
          className={`pointer-events-none absolute left-2 top-2 flex h-9 w-9 items-center justify-center rounded-xl text-lg font-bold shadow-lg xs:left-3 xs:top-3 xs:h-11 xs:w-11 xs:text-xl ${
            GRID_BADGE[Math.min(rank, GRID_BADGE.length - 1)]
          }`}
        >
          {rank + 1}
        </div>
        {/* 2026-09-30：首次上榜（n<=1）不显示该徽章，只有第 2 次及以后才显示「N次上榜」 */}
        {listedCount >= 2 && (
          <div className="pointer-events-none absolute right-2 top-2 rounded-lg bg-amber-500 px-2 py-0.5 text-xs font-bold text-white shadow-lg xs:right-3 xs:top-3 xs:px-2.5 xs:py-1 xs:text-sm">
            {t("rank.streak", { n: listedCount })}
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t from-black/80 to-transparent px-2 pb-2 pt-6 xs:px-3 xs:pb-3 xs:pt-8">
          <div className="flex items-end justify-end">
            <span className="text-xl font-bold text-white xs:text-2xl">{fmt(item.score ?? 0)}</span>
            <span className="ml-1 text-xs text-white/80 xs:text-sm">{t("rank.pt")}</span>
          </div>
        </div>
      </div>
      <div className="p-3 xs:p-4">
        <div className="flex items-start gap-x-3">
          <a href={ownerMid ? `/member/${ownerMid}` : undefined} className="shrink-0">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gray-200 dark:bg-gray-700">
              {item.owner?.face ? (
                <img src={item.owner.face} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <span className="text-sm font-bold text-muted-foreground">{(item.owner?.name || item.girls?.[0] || "?").slice(0, 1)}</span>
              )}
            </div>
          </a>
          <div className="min-w-0 flex-1 space-y-1">
            <span className="block max-w-full overflow-hidden text-blue-600 dark:text-blue-400 text-xs font-medium">
              <span className="inline-block whitespace-nowrap">
                <span className="shrink-0">
                  {ownerMid ? (
                    <Link to={`/member/${ownerMid}`} className="hover:text-primary hover:underline">
                      {ownerName}
                    </Link>
                  ) : (
                    ownerName
                  )}
                </span>
              </span>
            </span>
            <Link to={songHref} {...ext} className="block hover:text-primary">
              <span className="block max-w-full overflow-hidden text-sm font-bold leading-snug xs:text-base">
                <span className="inline-block whitespace-nowrap">
                  {item.title}
                  <AchievementBadges item={item} className="ml-1 align-middle" />
                </span>
              </span>
            </Link>
            {item.title_cn && (
              <span className="block max-w-full overflow-hidden text-xs text-muted-foreground">
                <span className="inline-block whitespace-nowrap">{item.title_cn}</span>
              </span>
            )}
            {girls.length > 0 && (
              <span className="block max-w-full overflow-hidden text-pink-600 dark:text-pink-400 text-xs font-medium">
                <span className="inline-block whitespace-nowrap">
                  {girls.map((g, i) => {
                    const sid = singerIds[g];
                    return (
                      <span key={`${g}-${i}`} className="shrink-0">
                        {i > 0 && <span className="mx-1 text-muted-foreground/40">/</span>}
                        {sid ? (
                          <Link to={`/singer/${sid}`} className="hover:text-primary hover:underline">
                            {g}
                          </Link>
                        ) : (
                          g
                        )}
                      </span>
                    );
                  })}
                </span>
              </span>
            )}
          </div>
          <DeltaBox item={item} />
        </div>
        <StatCells item={item} />
        <CardActions item={item} />
      </div>
    </article>
  );
}

/**
 * 侧栏「今日达成 / 百万达成」（原站 BoardPage 的 ct 组件）。
 * 原站只挂在日刊/周刊上：日刊标题「今日达成」、周刊「百万达成」，其余周期整卡不渲染。
 * ⚠ 口径差异：原站该卡包在 require:"user" 的登录门后（其 milestones 接口需鉴权），
 * 本站 /api/board/milestones 不鉴权、直接展示 —— 不为了对齐一张登录墙而把数据藏起来。
 */
function MilestoneCard({ period, issue }) {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ["boardMilestones", period, issue],
    queryFn: () =>
      api(`/api/board/milestones?period=${period}&ps=10${issue ? `&issue=${encodeURIComponent(issue)}` : ""}`, {
        silent: true,
      }),
    enabled: issue != null && String(issue) !== "",
    staleTime: 60 * 1000,
  });
  const list = q.data?.list || [];
  const total = q.data?.total ?? 0;
  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-1.5">
          <Trophy className="h-3.5 w-3.5 text-amber-500" />
          <h3 className="text-sm font-bold">{t(period === "daily" ? "rank.milestoneToday" : "rank.milestoneMillion")}</h3>
        </div>
        {total > 0 && (
          <span className="text-[11px] text-muted-foreground/60">{t("rank.milestoneItems", { n: total })}</span>
        )}
      </div>
      {q.isLoading ? (
        <div className="space-y-2 px-4 py-4">
          {[0, 1, 2].map((n) => (
            <div key={n} className="h-10 animate-pulse rounded-lg bg-muted/60" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <p className="px-4 pb-6 pt-4 text-center text-xs text-muted-foreground">{t("rank.milestoneEmpty")}</p>
      ) : (
        <ul className="divide-y divide-border/30 border-t border-border/30">
          {list.map((m) => (
            <li key={`${m.aid}-${m.milestone}`}>
              <Link
                to={`/video/${m.aid}`}
                className="flex min-h-12 items-center gap-2.5 px-3 py-2 transition-colors hover:bg-muted/40"
              >
                <span className="inline-flex shrink-0 items-center rounded-md bg-amber-100 px-2 py-0.5 text-[12px] font-bold tabular-nums text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">
                  {m.milestone / 1e4}万
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{m.title}</span>
                  <span className="mt-0.5 block truncate text-[11px] leading-tight text-muted-foreground/70">
                    {[m.owner?.name, (m.girls || []).join("、")].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
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
  // 榜单条目只带歌姬名，不带 id；整页收集后一次性解析成 /singer/:id 链接
  const girlNames = useMemo(() => (data?.list || []).flatMap((it) => it.girls || []), [data]);
  const singerIds = useSingerIds(girlNames);
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
                        <GridCard
                          key={item.bvid || item.aid}
                          item={item}
                          rank={(page - 1) * PAGE_SIZE + i}
                          external={false}
                          singerIds={singerIds}
                        />
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
          {/* 2026-09-30：top-20 会把侧栏初始位置强推到滚动容器顶部下方 80px（我们头部固定、
              内容区独立滚动，自然位置只有 ~16px），导致侧栏比主内容标题卡低 ~56px。
              改 top-4 与原站视觉一致：初始对齐标题卡，滚动后吸附在头部正下方。 */}
          <div className="sticky top-4 max-h-[calc(100vh-6.5rem)] space-y-4 overflow-y-auto pr-1">
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
            {(period === "daily" || period === "weekly") && (
              <MilestoneCard period={period} issue={curIssue} />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}