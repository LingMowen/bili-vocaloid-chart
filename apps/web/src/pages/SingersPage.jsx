import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { api, fmt } from "../api.js";
import { qk } from "../queryKeys.js";
import { EntityCard, ENTITY_GRID_WIDE } from "../components/ui/EntityCard.jsx";
import { SegmentedTabs, PillTabs } from "../components/ui/Tabs.jsx";

// 只有三段。**没有 UP主**：参考站的「UP主」与「P主」是同一份数据
// （/api/board/singers 的 type 只认 singer|producer，传 uploader 会退化成歌姬榜），
// 保留第四个 tab 只会显示重复内容 —— 用户已明确要求去除。
const TAB_KEY = ["singer", "producer", "engine"];

// 排序维度。score 是本期榜单得分（pt），view/favorite/count 同样是**本期**口径
// —— 数据源是 /api/board/singers（按当期榜单聚合），不是全库 /api/girls。
// 引擎 tab 不适用（/api/engines 只按累计作品数排），故该 tab 下隐藏排序。
const ORDER_KEY = ["score", "view", "favorite", "count"];

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

function EmptyBox({ children }) {
  return (
    <div className="rounded-lg border border-dashed bg-card py-16 text-center text-sm text-muted-foreground sm:rounded-xl sm:py-20">
      {children}
    </div>
  );
}

export default function SingersPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState("singer");
  const [order, setOrder] = useState("score");

  const units = [
    [1e9, t("video.b")],
    [1e8, t("video.yi")],
    [1e4, t("video.wan")],
    [1e3, t("video.k")],
  ];

  const isEngine = tab === "engine";

  // 歌手 / P主：口径只看当期日刊。limit=all 让 /singers 拿到本期全部（歌手 ~27 位、P主 ~1000 位）。
  const boardQ = useQuery({
    queryKey: qk.singerBoard({ period: "daily", type: tab, limit: "all" }),
    queryFn: () => api(`/api/board/singers?period=daily&type=${tab}&limit=all`, { silent: true }),
    enabled: !isEngine,
  });

  // 引擎：数据源是 singers.json 的 engines 字段（23 位歌手全部带非空 engines，
  // 去重后 13 种合成器）。此前这里渲染「数据未收录，敬请期待」——与事实不符。
  const enginesQ = useQuery({
    queryKey: qk.engines(),
    queryFn: () => api("/api/engines", { silent: true }),
    enabled: isEngine,
  });

  const data = boardQ.data;
  const list = Array.isArray(data?.list) ? data.list : [];
  const engines = Array.isArray(enginesQ.data?.list) ? enginesQ.data.list : [];
  const err = boardQ.error?.message || enginesQ.error?.message;
  const isLoading = isEngine ? enginesQ.isLoading : boardQ.isLoading;

  if (err) return <p className="text-sm text-destructive">{err}</p>;
  if (isLoading && !boardQ.data && !enginesQ.data) return <LoadingGrid />;

  const sorted = [...list].sort((a, b) => (b[order] ?? 0) - (a[order] ?? 0));

  return (
    <section className="mx-auto w-full max-w-6xl min-w-0 space-y-6">
      <div className="space-y-3">
        <SegmentedTabs
          gridClass="grid-cols-3"
          value={tab}
          onChange={setTab}
          items={TAB_KEY.map((key) => [
            key,
            t(`singers.tab${key.charAt(0).toUpperCase()}${key.slice(1)}`),
          ])}
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground sm:text-sm">
            {isEngine
              ? t("singers.descEngine", { n: engines.length })
              : t("singers.descIssue", {
                  n: list.length,
                  issue: data?.issue ?? "-",
                  date: data?.date_start ?? "-",
                })}
          </p>
          {!isEngine && (
            <PillTabs
              tone="card"
              size="sm"
              value={order}
              onChange={setOrder}
              items={ORDER_KEY.map((key) => [key, t(`singers.ord${key.charAt(0).toUpperCase()}${key.slice(1)}`)])}
            />
          )}
        </div>
      </div>

      {isEngine ? (
        engines.length ? (
          <div className={ENTITY_GRID_WIDE}>
            {engines.map((e) => (
              <EntityCard
                key={e.id ?? e.name}
                name={e.name}
                alt={e.name}
                // 本站暂无引擎详情页（参考站 /synthesizer/:id），故不加跳转。
                // 副文本给出「该引擎下收录了多少首 + 覆盖多少位歌手」。
                // ⚠ 首数用 fmt 原始数字（18,602），不用 ke 缩写：zh 的 video.k 是空串，
                // 4364 会被缩成「4.4」无单位，看起来像 4 首。歌手/P主卡的首数也是原始数字。
                sub={t("singers.engineLine", { n: e.singers?.length ?? 0, count: fmt(e.count) })}
              />
            ))}
          </div>
        ) : (
          <EmptyBox>{t("singers.pending")}</EmptyBox>
        )
      ) : list.length ? (
        <div className={ENTITY_GRID_WIDE}>
          {sorted.map((g, i) => (
            <EntityCard
              key={g.mid ?? g.id ?? g.name ?? i}
              to={
                tab === "producer"
                  ? g.mid
                    ? `/member/${g.mid}`
                    : `/search?keyword=${encodeURIComponent(g.name)}`
                  : g.id
                    ? `/singer/${g.id}`
                    : `/search?keyword=${encodeURIComponent(g.name)}`
              }
              picture={tab === "producer" ? g.face : g.picture}
              name={g.name}
              alt={g.name}
              sub={`${g.count || 0} 首 · ${ke(order === "score" ? g.score || 0 : g[order] || 0, units)}`}
            />
          ))}
        </div>
      ) : (
        <EmptyBox>{t("singers.pending")}</EmptyBox>
      )}

      {isLoading && <LoadingGrid />}
    </section>
  );
}
