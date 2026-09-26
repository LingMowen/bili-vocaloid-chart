import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { qk } from "../queryKeys.js";
import { RankRow } from "../components/RankCard.jsx";

export default function TagsPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const picked = params.get("name") || "";

  const tagsQuery = useQuery({
    queryKey: qk.tags(),
    queryFn: () => api("/api/tags", { silent: true }),
  });

  const boardQuery = useQuery({
    queryKey: qk.board({ pn: 1, ps: 50, order: "score" }),
    queryFn: () => api("/api/board/all?pn=1&ps=50&order=score", { silent: true }),
    enabled: Boolean(picked),
    select: (d) => {
      const kw = picked.toLowerCase();
      const norm = (s) => String(s || "").toLowerCase();
      return (d.list || []).filter(
        (it) =>
          norm(it.title).includes(kw) ||
          (it.tags || []).some((tag) => norm(tag).includes(kw)) ||
          (it.girls || []).some((g) => norm(g).includes(kw)),
      );
    },
  });

  const data = tagsQuery.data;
  const list = boardQuery.data || [];
  const err = tagsQuery.error?.message || boardQuery.error?.message;

  return (
    <section className="mx-auto w-full max-w-5xl min-w-0 space-y-6">
      <div>
        <h2 className="mb-1 text-base font-bold tracking-tight sm:text-xl">{t("tags.title")}</h2>
        <p className="text-xs text-muted-foreground">{t("tags.desc")}</p>
      </div>
      {err && <p className="text-xs text-destructive">{err}</p>}

      {data && (
        <>
          <div>
            <h3 className="mb-2 text-sm font-semibold">{t("tags.tagCloud")}</h3>
            <div className="flex flex-wrap gap-2 overflow-x-clip">
              {data.tags.map((tag) => {
                const active = picked === tag.name;
                const size = Math.min(1.4, 0.85 + Math.log2((tag.count || 1) + 1) * 0.18);
                return (
                  <button
                    key={tag.name}
                    onClick={() => setParams(active ? {} : { name: tag.name })}
                    style={{ transform: `scale(${size})` }}
                    className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                      active
                        ? "border-primary/50 bg-primary/10 font-semibold text-primary"
                        : "bg-card text-muted-foreground hover:border-primary/30 hover:text-primary"
                    }`}
                  >
                    {tag.name}
                    <span className="ml-1 opacity-60">{tag.count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {data.girls.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold">{t("tags.girls")}</h3>
              <div className="flex flex-wrap gap-1.5">
                {data.girls.map((g) => (
                  <span key={g.name} className="rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                    {g.name}
                    <span className="ml-1 opacity-60">{g.count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {picked && (
        <div>
          <div className="mb-2 flex items-baseline gap-2">
            <h3 className="text-sm font-semibold">{t("tags.songsWithTag", { name: picked })}</h3>
            <span className="text-xs text-muted-foreground">{t("tags.songCount", { n: list.length })}</span>
          </div>
          {list.length > 0 ? (
            <div className="grid gap-1 rounded-xl border bg-card p-1">
              {list.map((item, i) => (
                <RankRow key={item.aid} item={item} rank={i} />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
              {t("tags.noneFound")}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
