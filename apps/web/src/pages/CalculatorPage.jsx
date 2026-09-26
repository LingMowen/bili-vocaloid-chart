import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api.js";
import { qk } from "../queryKeys.js";
import { RankRow } from "../components/RankCard.jsx";
import SliderField from "../components/ui/SliderField.jsx";
import Tip from "../components/ui/Tip.jsx";

const KEYS = [
  ["view", 1],
  ["favorite", 4],
  ["coin", 5],
  ["like", 2],
  ["danmaku", 1],
  ["reply", 1.5],
  ["share", 3],
];

export default function CalculatorPage() {
  const { t } = useTranslation();
  const [weights, setWeights] = useState(() => Object.fromEntries(KEYS.map(([k, def]) => [k, def])));

  const query = useQuery({
    queryKey: qk.board({ pn: 1, ps: 50, order: "score" }),
    queryFn: () => api("/api/board/all?pn=1&ps=50&order=score", { silent: true }),
  });
  const items = query.data?.list || [];
  const err = query.error?.message;

  const preview = useMemo(() => {
    return items
      .map((it) => {
        const calc = KEYS.reduce((acc, [k, _def]) => acc + (it[k] || 0) * (weights[k] || 0), 0);
        return { ...it, calc };
      })
      .sort((a, b) => b.calc - a.calc)
      .slice(0, 10);
  }, [items, weights]);

  function setWeight(k, v) {
    setWeights((w) => ({ ...w, [k]: v }));
  }

  return (
    <section className="mx-auto w-full max-w-4xl space-y-4">
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="border-b bg-muted/30 px-6 py-4">
          <h1 className="text-xl font-semibold">{t("calculator.title")}</h1>
          <p className="mt-1 text-xs text-muted-foreground">{t("calculator.desc")}</p>
        </div>
        <div className="p-6">
          {err && <p className="mb-4 text-xs text-destructive">{err}</p>}

          <h2 className="mb-3 text-sm font-semibold">{t("calculator.weightsTitle")}</h2>
          <div className="space-y-3">
            {KEYS.map(([k, def]) => (
              <div key={k} className="flex items-center gap-3">
                <span className="w-12 shrink-0 text-xs text-muted-foreground">
                  {k === "coin" ? t("calculator.metricCoin") : t(`video.${k}`)}
                </span>
                <SliderField
                  value={weights[k]}
                  min={0}
                  max={10}
                  step={0.5}
                  onValueChange={(v) => setWeight(k, v)}
                  className="min-w-0 flex-1"
                />
                <span className="w-10 shrink-0 text-right text-xs font-semibold tabular-nums">
                  {weights[k]}
                </span>
                <Tip content={t("calculator.resetTitle", { n: def })}>
                  <button
                    onClick={() => setWeight(k, def)}
                    className="shrink-0 text-[10px] text-muted-foreground hover:text-foreground"
                  >
                    {t("calculator.reset")}
                  </button>
                </Tip>
              </div>
            ))}
          </div>
          <button
            onClick={() => setWeights(Object.fromEntries(KEYS.map(([k, def]) => [k, def])))}
            className="mt-3 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent"
          >
            {t("calculator.resetAll")}
          </button>
        </div>
      </div>

      {preview.length > 0 && (
        <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="border-b bg-muted/30 px-6 py-4">
            <h2 className="text-sm font-semibold">{t("calculator.previewTitle")}</h2>
          </div>
          <div className="grid gap-1 p-2">
            {preview.map((item, i) => (
              <RankRow key={item.aid} item={item} rank={i} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}