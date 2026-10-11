import { useMemo, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp } from "lucide-react";
import { api, fmt } from "../api.js";
import { qk } from "../queryKeys.js";
import SongCard from "../components/SongCard.jsx";
import StatsFilter from "../components/StatsFilter.jsx";

const METRICS = [
  ["view", "view"],
  ["favorite", "favorite"],
  ["coin", "coin"],
  ["like", "like"],
  ["danmaku", "danmaku"],
  ["reply", "reply"],
  ["share", "share"],
];

// 排序字段（顺序对齐 vocabili /stats 的 S 数组）：
// 7 个数值指标 + 发布时间 + 日刊上榜次数 + 周刊上榜次数
const ORDER_LABELS = [
  ["view", "byView"],
  ["favorite", "byFavorite"],
  ["coin", "byCoin"],
  ["like", "byLike"],
  ["danmaku", "byDanmaku"],
  ["reply", "byReply"],
  ["share", "byShare"],
  ["pubdate", "byPubdate"],
  ["daily_count", "byDailyCount"],
  ["weekly_count", "byWeeklyCount"],
];

const PAGE_SIZE = 30; // 卡片网格：30 张约 6 行，比列表行更适合浏览

export default function StatsPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [order, setOrder] = useState("view"); // 默认按播放降序，对齐原站
  const [asc, setAsc] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [kwDraft, setKwDraft] = useState("");
  const [girl, setGirl] = useState("");
  const [ranges, setRanges] = useState({});
  const [page, setPage] = useState(1);

  // 筛选面板（对齐 vocabili /stats 的 FilterSection，本站不加赞助墙）
  // 面板把状态序列化进 URL（view_ranges 这类区间串），回显时读回同一份串；
  // 发请求时才转成后端 /api/evostats 原生认的 min_/max_（见下面的 query）。
  // 注意 filterSearch 必须是 URL 的全量筛选参数 —— 少传会让下拉框无法回显。
  const filterSearch = useMemo(() => {
    const p = new URLSearchParams();
    for (const [k, v] of searchParams.entries()) {
      if (k === "pn" || k === "ps" || k === "order" || k === "asc" ||
          k === "keyword" || k === "girl" || k === "page" || k === "page_size") continue;
      p.set(k, v);
    }
    return p.toString();
  }, [searchParams]);

  const setFilterSearch = useCallback(
    (qs) => {
      const p = new URLSearchParams(searchParams);
      for (const key of Array.from(p.keys())) {
        if (key.endsWith("_ranges") || ["daily_rank", "weekly_rank", "pubdate", "types", "copyright", "foreign", "daily_count_ranges", "weekly_count_ranges"].includes(key)) {
          p.delete(key);
        }
      }
      for (const [k, v] of new URLSearchParams(qs).entries()) p.set(k, v);
      setSearchParams(p, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const query = useMemo(() => {
    const q = new URLSearchParams({
      pn: String(page),
      ps: String(PAGE_SIZE),
      order,
      asc: asc ? "1" : "0",
    });
    if (keyword) q.set("keyword", keyword);
    if (girl) q.set("girl", girl);
    for (const [k] of METRICS) {
      const b = ranges[k];
      if (b) {
        if (b.min != null) q.set("min_" + k, String(b.min));
        if (b.max != null) q.set("max_" + k, String(b.max));
      }
    }
    // 面板筛选：区间串转 min_/max_，其余透传
    const fs = new URLSearchParams(filterSearch);
    for (const key of Array.from(fs.keys())) {
      if (key.endsWith("_ranges") && !key.includes("count")) {
        const metric = key.slice(0, -7); // 去掉 "_ranges"
        for (const seg of fs.get(key).split(",").map((s) => s.trim()).filter(Boolean)) {
          const i = seg.indexOf("-");
          const lo = i === -1 ? seg : seg.slice(0, i);
          const hi = i === -1 ? "" : seg.slice(i + 1);
          if (lo !== "") q.set("min_" + metric, lo);
          if (hi !== "") q.set("max_" + metric, hi);
        }
      } else {
        q.set(key, fs.get(key));
      }
    }
    return q.toString();
  }, [page, order, asc, keyword, girl, ranges, filterSearch]);

  const { data = { list: [], count: 0 }, isLoading, error } = useQuery({
    queryKey: qk.evostats({ query }),
    queryFn: () => api(`/api/evostats?${query}`, { silent: true }),
    select: (d) => ({ list: d.list || [], count: d.count || 0 }),
  });

  function reset() {
    setOrder("score");
    setAsc(false);
    setKeyword("");
    setKwDraft("");
    setGirl("");
    setRanges({});
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(data.count / PAGE_SIZE));
  const activeCount = Object.keys(ranges).length + (girl ? 1 : 0) + (keyword ? 1 : 0);

  return (
    <section className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-base font-bold tracking-tight sm:text-xl">{t("stats.title")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t("stats.desc", { n: data.count })}</p>
        </div>
        {/* 排序控件（对齐 vocabili /stats）：
            原站是「一排 chip 直接选排序字段」+「右侧独立按钮切升降序」，
            而不是一个把字段和方向挤在一起的下拉框。排序字段含 7 个数值指标、
            发布时间、日刊上榜次数、周刊上榜次数（对齐原站顺序）。 */}
        <div className="ml-auto flex flex-wrap items-center gap-1 rounded-xl bg-muted/50 p-1">
          {ORDER_LABELS.map(([k, tKey]) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setOrder(k);
                setPage(1);
              }}
              aria-pressed={order === k}
              className={`whitespace-nowrap rounded-lg px-2 py-1 text-xs font-medium transition lg:px-2.5 lg:text-sm ${
                order === k
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t(`stats.${tKey}`)}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setAsc((a) => !a);
              setPage(1);
            }}
            title={asc ? t("stats.asc") : t("stats.desc_")}
            aria-label={asc ? t("stats.asc") : t("stats.desc_")}
            className="ml-1 flex h-8 w-8 items-center justify-center rounded-lg bg-background transition hover:bg-muted sm:h-9 sm:w-9"
          >
            {asc ? <ArrowDown className="h-4 w-4" aria-hidden="true" /> : <ArrowUp className="h-4 w-4" aria-hidden="true" />}
          </button>
        </div>
      </div>

      {error?.message && <p className="text-xs text-destructive">{error?.message}</p>}

      {/* 筛选面板 */}
      <div className="space-y-4 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap gap-4">
          <div className="min-w-40 flex-1">
            <p className="mb-1.5 text-xs text-muted-foreground">{t("stats.keyword")}</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={kwDraft}
                onChange={(e) => setKwDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setKeyword(kwDraft.trim());
                    setPage(1);
                  }
                }}
                placeholder={t("stats.keywordPlaceholder")}
                className="min-w-0 flex-1 rounded-lg border bg-background px-2.5 py-2 text-xs outline-none focus:ring-2 focus:ring-primary/30"
              />
              <button
                type="button"
                onClick={() => {
                  setKeyword(kwDraft.trim());
                  setPage(1);
                }}
                className="shrink-0 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground"
              >
                {t("stats.search")}
              </button>
            </div>
          </div>
          <div className="min-w-40 flex-1">
            <p className="mb-1.5 text-xs text-muted-foreground">{t("stats.girl")}</p>
            <input
              type="text"
              value={girl}
              onChange={(e) => {
                setGirl(e.target.value.trim());
                setPage(1);
              }}
              placeholder={t("stats.girlPlaceholder")}
              className="w-full rounded-lg border bg-background px-2.5 py-2 text-xs outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>

        {/* 筛选面板（对齐 vocabili /stats，本页不加赞助墙） */}
      <StatsFilter search={filterSearch} matched={data.count} onChange={setFilterSearch} />

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
          <span className="text-xs text-muted-foreground">
            <span
              dangerouslySetInnerHTML={{
                __html: t("stats.activeConditions", { n: activeCount, interpolation: { escapeValue: false } }),
              }}
            />
            {activeCount > 0 && (
              <span className="ml-2 text-primary/70">{t("stats.matched", { n: fmt(data.count) })}</span>
            )}
          </span>
          <button
            type="button"
            onClick={reset}
            className="rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition hover:bg-accent hover:text-foreground"
          >
            {t("stats.resetAll")}
          </button>
        </div>
      </div>

      {/* 结果卡片网格（对齐 vocabili /stats 的卡片样式） */}
      {isLoading && data.list.length === 0 ? (
        <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">{t("stats.loading")}</div>
      ) : data.list.length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center gap-1 text-xs text-muted-foreground">
          <span>{t("stats.noMatch")}</span>
          <button type="button" onClick={reset} className="text-primary hover:underline">
            {t("stats.resetFilters")}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {data.list.map((item, i) => (
            <SongCard
              key={item.aid}
              item={item}
              rank={(page - 1) * PAGE_SIZE + i + 1}
              orderBy={order}
            />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-lg border border-border px-3 py-1.5 text-xs disabled:opacity-40"
          >
            {t("stats.prev")}
          </button>
          <span className="text-xs tabular-nums text-muted-foreground">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="rounded-lg border border-border px-3 py-1.5 text-xs disabled:opacity-40"
          >
            {t("stats.next")}
          </button>
        </div>
      )}
    </section>
  );
}
