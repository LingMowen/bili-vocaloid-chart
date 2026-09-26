import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api.js";
import { qk } from "../queryKeys.js";
import { RankRow } from "../components/RankCard.jsx";

export default function TodayPage() {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: qk.today(),
    queryFn: () => api("/api/today", { silent: true }),
  });

  if (query.error?.message) return <p className="py-10 text-center text-sm text-destructive">{query.error?.message}</p>;
  if (query.isLoading && !query.data) return <p className="py-10 text-center text-sm text-muted-foreground">{t("today.loading")}</p>;

  return (
    <section className="min-w-0 space-y-6">
      <div>
        <h2 className="text-lg font-bold tracking-tight">{t("today.title", { month: query.data.month, day: query.data.day })}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("today.desc", { count: query.data.count })}</p>
      </div>

      {query.data.count > 0 ? (
        <div className="grid gap-1 rounded-xl border bg-card p-1">
          {query.data.list.map((item, i) => (
            <RankRow key={item.aid} item={item} rank={i} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed bg-card p-14 text-center">
          <p className="text-sm font-medium">{t("today.emptyTitle")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("today.emptyDesc")}</p>
        </div>
      )}
    </section>
  );
}
