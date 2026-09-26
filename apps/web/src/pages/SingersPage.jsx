import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Music } from "lucide-react";
import { api, fmt } from "../api.js";
import { qk } from "../queryKeys.js";

const TAB_KEY = ["singer", "producer", "engine", "uploader"];

function ke(n, units) {
  n = Number(n);
  if (Number.isNaN(n)) return "-";
  for (const [t, u] of units) {
    if (n >= t) return `${(n / t).toFixed(t >= 1e8 ? 2 : 1).replace(/\.?0+$/, "")}${u}`;
  }
  return fmt(n);
}

// 对齐参考站 /artists 头像卡片：圆角头像 / 名字 / 副文本
function SingerCard({ g, units }) {
  const { t } = useTranslation();
  return (
    <Link
      to={g.id ? `/singer/${g.id}` : `/search?keyword=${encodeURIComponent(g.name)}`}
      className="group flex flex-col items-center gap-1.5 rounded-xl border bg-card p-3 text-center transition-shadow hover:shadow-md sm:rounded-2xl sm:p-4"
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-blue-500/10 sm:h-14 sm:w-14">
        {g.picture ? (
          <img
            src={g.picture}
            alt={g.name}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
          />
        ) : (
          <Music className="h-5 w-5 text-blue-500 sm:h-6 sm:w-6" aria-hidden="true" />
        )}
      </div>
      <span className="line-clamp-1 max-w-full truncate text-xs font-medium group-hover:text-primary sm:text-sm">
        {g.name}
      </span>
      <span className="text-[10px] text-muted-foreground sm:text-xs">
        {g.count || 0} 首 · {ke(g.view || 0, units)}
      </span>
    </Link>
  );
}

function LoadingGrid() {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 md:grid-cols-5 lg:grid-cols-6">
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
        <div className="grid grid-cols-4 gap-1 rounded-lg bg-card p-1 shadow-sm sm:rounded-xl">
          {TAB_KEY.map((key, i) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`rounded-md py-1.5 text-xs font-medium transition sm:rounded-lg sm:py-2 sm:text-sm ${
                tab === key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t(`singers.tab${key.charAt(0).toUpperCase()}${key.slice(1)}`)}
            </button>
          ))}
        </div>

        {tab === "singer" && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground sm:text-sm">{t("singers.desc", { n: list.length })}</p>
            <div className="flex rounded-lg bg-muted/60 p-0.5 text-xs">
              {[
                ["view", t("singers.tabView")],
                ["favorite", t("singers.tabFavorite")],
                ["count", t("singers.tabCount")],
              ].map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setOrder(k)}
                  className={`rounded-md px-2.5 py-1 font-medium transition ${
                    order === k ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {tab === "singer" ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 md:grid-cols-5 lg:grid-cols-6">
          {sorted.map((g) => (
            <SingerCard key={g.name} g={g} units={units} />
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