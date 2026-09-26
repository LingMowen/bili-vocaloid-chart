import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { api, fmt } from "../api.js";
import { qk } from "../queryKeys.js";
import { RankRow } from "../components/RankCard.jsx";
import SelectField, { SelectItem } from "../components/ui/SelectField.jsx";
import Tip from "../components/ui/Tip.jsx";

const METRICS = [
  ["view", "view"],
  ["favorite", "favorite"],
  ["coin", "coin"],
  ["like", "like"],
  ["danmaku", "danmaku"],
  ["reply", "reply"],
  ["share", "share"],
];

const BANDS = {
  view: [
    { label: "bandView1000w", min: 1e7 },
    { label: "bandView100w", min: 1e6 },
    { label: "bandView10w", min: 1e5 },
    { label: "bandView1w", min: 1e4 },
    { label: "bandBelow1w", max: 1e4 },
  ],
  favorite: [
    { label: "band100w", min: 1e6 },
    { label: "band10w", min: 1e5 },
    { label: "band1w", min: 1e4 },
    { label: "band1000", min: 1e3 },
    { label: "bandBelow1000", max: 1e3 },
  ],
  coin: [
    { label: "band100w", min: 1e6 },
    { label: "band10w", min: 1e5 },
    { label: "band1w", min: 1e4 },
    { label: "band1000", min: 1e3 },
    { label: "bandBelow1000", max: 1e3 },
  ],
  like: [
    { label: "band100w", min: 1e6 },
    { label: "band10w", min: 1e5 },
    { label: "band1w", min: 1e4 },
    { label: "band1000", min: 1e3 },
    { label: "bandBelow1000", max: 1e3 },
  ],
  danmaku: [
    { label: "band100", min: 100 },
    { label: "band50", min: 50 },
    { label: "band20", min: 20 },
    { label: "band10", min: 10 },
    { label: "band1", min: 1 },
  ],
  reply: [
    { label: "band100", min: 100 },
    { label: "band50", min: 50 },
    { label: "band20", min: 20 },
    { label: "band10", min: 10 },
    { label: "band1", min: 1 },
  ],
  share: [
    { label: "band100", min: 100 },
    { label: "band50", min: 50 },
    { label: "band20", min: 20 },
    { label: "band10", min: 10 },
    { label: "band1", min: 1 },
  ],
};

const ORDER_LABELS = [
  ["score", "byScore"],
  ["view", "byView"],
  ["favorite", "byFavorite"],
  ["coin", "byCoin"],
  ["like", "byLike"],
  ["danmaku", "byDanmaku"],
  ["reply", "byReply"],
  ["share", "byShare"],
];

const PAGE_SIZE = 20;

export default function StatsPage() {
  const { t } = useTranslation();
  const [order, setOrder] = useState("score");
  const [asc, setAsc] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [kwDraft, setKwDraft] = useState("");
  const [girl, setGirl] = useState("");
  const [ranges, setRanges] = useState({});
  const [page, setPage] = useState(1);

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
    return q.toString();
  }, [page, order, asc, keyword, girl, ranges]);

  const { data = { list: [], count: 0 }, isLoading, error } = useQuery({
    queryKey: qk.evostats({ query }),
    queryFn: () => api(`/api/evostats?${query}`, { silent: true }),
    select: (d) => ({ list: d.list || [], count: d.count || 0 }),
  });

  function cycleBand(k) {
    setRanges((prev) => {
      const cur = prev[k];
      if (!cur) return { ...prev, [k]: BANDS[k][0] };
      const idx = BANDS[k].indexOf(cur);
      const next = BANDS[k][(idx + 1) % BANDS[k].length];
      const copy = { ...prev };
      if (idx === BANDS[k].length - 1) delete copy[k];
      else copy[k] = next;
      return copy;
    });
    setPage(1);
  }

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
        <div className="ml-auto flex items-center gap-2">
          <SelectField
            value={order}
            onValueChange={(v) => {
              setOrder(v);
              setPage(1);
            }}
            triggerClassName="h-9 rounded-lg border bg-card px-2 text-xs"
          >
            {ORDER_LABELS.map(([k, tKey]) => (
              <SelectItem key={k} value={k}>
                {t(`stats.${tKey}`)}
              </SelectItem>
            ))}
          </SelectField>
          <Tip content={asc ? t("stats.asc") : t("stats.desc_")}>
            <button
              type="button"
              onClick={() => {
                setAsc((a) => !a);
                setPage(1);
              }}
              className="h-9 rounded-lg border px-2.5 text-xs"
            >
              {asc ? t("stats.ascShort") : t("stats.descShort")}
            </button>
          </Tip>
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

        <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-7">
          {METRICS.map(([k, label]) => {
            const band = ranges[k];
            return (
              <div key={k}>
                <p className="mb-1 text-[11px] text-muted-foreground">{t(`video.${label}`)}</p>
                <Tip content={t("stats.bandTitle")}>
                  <button
                    type="button"
                    onClick={() => cycleBand(k)}
                    className={`w-full rounded-lg border px-2 py-1.5 text-xs transition-colors ${
                      band
                        ? "border-primary/50 bg-primary/10 font-semibold text-primary"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {band ? t(`stats.${band.label}`) : t("stats.unlimited")}
                  </button>
                </Tip>
              </div>
            );
          })}
        </div>

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

      {/* 结果列表 */}
      <div className="grid gap-1 rounded-xl border bg-card p-1">
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
          data.list.map((item, i) => (
            <RankRow key={item.aid} item={item} rank={(page - 1) * PAGE_SIZE + i} />
          ))
        )}
      </div>

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
