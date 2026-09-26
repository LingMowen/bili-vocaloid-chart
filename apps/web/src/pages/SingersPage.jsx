import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { api, fmt } from "../api.js";
import { qk } from "../queryKeys.js";
import { EntityCard, ENTITY_GRID_WIDE } from "../components/ui/EntityCard.jsx";
import { SegmentedTabs, PillTabs } from "../components/ui/Tabs.jsx";

const TAB_KEY = ["singer", "producer", "engine", "uploader"];

function ke(n, units) {
  n = Number(n);
  if (Number.isNaN(n)) return "-";
  for (const [t, u] of units) {
    if (n >= t) return `${(n / t).toFixed(t >= 1e8 ? 2 : 1).replace(/\.?0+$/, "")}${u}`;
  }
  return fmt(n);
}

function LoadingGrid() {
  return (
    <div className={ENTITY_GRID_WIDE}>
      {Array.from({ length: 24 }).map((_, i) => (
        <div key={i} className="flex animate-pulse flex-col items-center gap-1.5 rounded-2xl border bg-card p-3 sm:p-4">
          <div className="h-12 w-12 rounded-xl bg-muted sm:h-14 sm:w-14" />
          <div className="h-3 w-4/5 rounded bg-muted" />
          <div className="h-2.5 w-1/2 rounded bg-muted/70" />
        </div>
      ))}
    </div>
  );
}

export default function SingersPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState("singer");
  const [order, setOrder] = useState("view");

  const units = [
    [1e9, t("video.b")],
    [1e8, t("video.yi")],
    [1e4, t("video.wan")],
    [1e3, t("video.k")],
  ];

  const { data, isLoading, error } = useQuery({
    queryKey: qk.singers({}),
    queryFn: () => api("/api/girls", { silent: true }),
  });

  const list = Array.isArray(data) ? data : data?.list || [];
  const err = error?.message;

  if (err) return <p className="text-sm text-destructive">{err}</p>;
  if (isLoading && !data) return <p className="text-sm text-muted-foreground">{t("singers.loading")}</p>;
  if (!list.length) return <p className="text-sm text-muted-foreground">{t("singers.pending")}</p>;

  const sorted = [...list].sort((a, b) => (b[order] ?? 0) - (a[order] ?? 0));

  return (
    <section className="mx-auto w-full max-w-6xl min-w-0 space-y-6">
      <div className="space-y-3">
        <SegmentedTabs
          gridClass="grid-cols-4"
          value={tab}
          onChange={setTab}
          items={TAB_KEY.map((key) => [
            key,
            t(`singers.tab${key.charAt(0).toUpperCase()}${key.slice(1)}`),
          ])}
        />

        {tab === "singer" && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground sm:text-sm">{t("singers.desc", { n: list.length })}</p>
            <PillTabs
              tone="card"
              size="sm"
              value={order}
              onChange={setOrder}
              items={[
                ["view", t("singers.tabView")],
                ["favorite", t("singers.tabFavorite")],
                ["count", t("singers.tabCount")],
              ]}
            />
          </div>
        )}
      </div>

      {tab === "singer" ? (
        <div className={ENTITY_GRID_WIDE}>
          {sorted.map((g) => (
            <EntityCard
              key={g.name}
              to={g.id ? `/singer/${g.id}` : `/search?keyword=${encodeURIComponent(g.name)}`}
              picture={g.picture}
              name={g.name}
              alt={g.name}
              sub={`${g.count || 0} 首 · ${ke(g.view || 0, units)}`}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed bg-card py-16 text-center text-sm text-muted-foreground sm:rounded-xl sm:py-20">
          {t("singers.tabPending")}
        </div>
      )}

      {isLoading && <LoadingGrid />}
    </section>
  );
}
