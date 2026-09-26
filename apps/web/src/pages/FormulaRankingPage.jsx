import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { api, fmt } from "../api.js";
import { qk } from "../queryKeys.js";
import { NewBadge } from "../components/RankCard.jsx";
import Tip from "../components/ui/Tip.jsx";

const FORMULAS = [
  {
    id: "default",
    weights: { view: 1, favorite: 4, coin: 5, like: 2, danmaku: 1, reply: 1.5, share: 3 },
  },
  {
    id: "pure",
    weights: { view: 1, like: 1 },
  },
  {
    id: "supporter",
    weights: { favorite: 3, coin: 4 },
  },
];

const FIELDS = ["view", "favorite", "coin", "like", "danmaku", "reply", "share"];

export default function FormulaRankingPage() {
  const { t } = useTranslation();
  const [fid, setFid] = useState("default");

  const query = useQuery({
    queryKey: qk.board({ pn: 1, ps: 50, order: "score" }),
    queryFn: () => api("/api/board/all?pn=1&ps=50&order=score", { silent: true }),
  });
  const items = query.data?.list || [];
  const err = query.error?.message;

  const formula = FORMULAS.find((f) => f.id === fid) || FORMULAS[0];

  const ranked = useMemo(() => {
    return items
      .map((it) => {
        const calc = FIELDS.reduce((acc, k) => acc + (it[k] || 0) * (formula.weights[k] || 0), 0);
        return { ...it, formula_score: calc };
      })
      .sort((a, b) => b.formula_score - a.formula_score)
      .slice(0, 20);
  }, [items, formula]);

  return (
    <section className="min-w-0 space-y-6">
      <div>
        <h2 className="mb-1 text-base font-bold tracking-tight sm:text-xl">{t("formula.title")}</h2>
        <p className="text-xs text-muted-foreground">{t("formula.desc")}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FORMULAS.map((f) => (
          <Tip key={f.id} content={t(`formula.${f.id}.desc`)}>
            <button
              onClick={() => setFid(f.id)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                fid === f.id
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground"
            }`}
          >
            {t(`formula.${f.id}.name`)}
          </button>
          </Tip>
        ))}
        <Link
          to="/calculator"
          className="ml-auto rounded-lg border border-dashed px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/5"
        >
          {t("formula.linkCalc")}
        </Link>
      </div>

      <p className="text-xs text-muted-foreground">{t(`formula.${formula.id}.desc`)}</p>
      {err && <p className="text-xs text-destructive">{err}</p>}

      <div className="grid gap-1 rounded-xl border bg-card p-1">
        {ranked.map((it, i) => (
          <Link
            key={it.aid}
            to={`/video/${it.aid}`}
            className="grid min-h-16 grid-cols-[6.875rem_minmax(0,1fr)_auto] items-center gap-2 overflow-visible rounded-lg p-1.5 transition-colors hover:bg-primary/5 xs:grid-cols-[7.75rem_minmax(0,1fr)_auto] sm:gap-3"
          >
            <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-md bg-muted">
              <img
                src={it.pic || it.cover}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                className="absolute inset-0 h-full w-full object-cover"
              />
              <span className="absolute left-1.5 top-1.5 flex h-6 min-w-6 items-center justify-center rounded-md bg-black/60 px-1 text-xs font-black text-white">
                {i + 1}
              </span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="block max-w-full truncate text-sm font-medium leading-tight">{it.title}</span>
                {it.new && <NewBadge />}
              </div>
              <span className="mt-0.5 block max-w-full truncate text-xs text-muted-foreground">
                {it.owner?.name} · {(it.girls || []).join(" / ") || "-"}
              </span>
            </div>
            <div className="shrink-0 text-right tabular-nums">
              <div className="text-sm font-bold text-primary">{fmt(it.formula_score)}</div>
              <div className="mt-0.5 text-[10px] text-muted-foreground">{t(`formula.${formula.id}.name`)}</div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}