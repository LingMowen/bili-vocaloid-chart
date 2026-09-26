import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Cpu, ExternalLink, Heart, Music, Play, ThumbsUp, Users } from "lucide-react";
import { api, fmt } from "../api.js";
import { qk } from "../queryKeys.js";
import { EntityCard, EntityCardGrid, ENTITY_GRID_NARROW } from "../components/ui/EntityCard.jsx";

// ---- 区块标题 ----
// 原站两种形态：
//   引擎/P主：mb-3 flex items-center gap-2 sm:mb-4  → 图标 + h2
//   歌曲区：  mb-3 flex items-center justify-between sm:mb-4 → h2 + 「更多」链接
function SectionHead({ icon: Icon, title, to, toLabel }) {
  return (
    <div className="mb-3 flex items-center justify-between sm:mb-4">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4 text-muted-foreground sm:h-5 sm:w-5" aria-hidden="true" />}
        <h2 className="text-base font-bold sm:text-lg">{title}</h2>
      </div>
      {to && (
        <Link
          to={to}
          className="flex items-center gap-1 text-xs text-muted-foreground transition hover:text-primary sm:text-sm"
        >
          {toLabel}
          <ArrowRight className="h-3 w-3 sm:h-4 sm:w-4" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

// ---- 头像卡片网格：用于「使用的引擎 / 常合作P主」 ----
// 卡片本体已抽到 components/ui/EntityCard.jsx（与 /singers、搜索页共用）。
// 注意歌手详情页的网格断点与 /artists 不同：md 断点仍是 4 列，故用 ENTITY_GRID_NARROW。
function AvatarCardGrid({ items, empty }) {
  const { t } = useTranslation();
  return (
    <EntityCardGrid
      grid={ENTITY_GRID_NARROW}
      items={items}
      empty={empty}
      render={(it, i) => {
        const entity = it.synthesizer || it.producer || {};
        return (
          <EntityCard
            key={entity.id ?? entity.name ?? i}
            picture={entity.picture}
            name={entity.name ?? t("singer.unknown")}
            sub={t("singer.countSongs", { n: it.count ?? 0 })}
          />
        );
      }}
    />
  );
}

// ---- 歌曲卡片网格：用于「热门歌曲 / 最新歌曲」 ----
// 原站：@container + grid-cols-2 / @lg:grid-cols-4 / @3xl:grid-cols-5
function SongCardGrid({ songs }) {
  const { t } = useTranslation();
  if (!songs?.length) return <p className="text-sm text-muted-foreground">{t("singer.noData")}</p>;
  return (
    <div className="@container">
      <div className="grid grid-cols-2 gap-3 @lg:grid-cols-4 @3xl:grid-cols-5 sm:gap-4">
        {songs.map((s) => {
          const video = s.videos?.[0];
          const href = video?.bvid ? `https://www.bilibili.com/video/${video.bvid}` : null;
          const thumb = (
            <div className="relative aspect-video overflow-hidden rounded-t-xl bg-muted">
              {href ? (
                <a href={href} target="_blank" rel="noreferrer" className="block h-full w-full">
                  {video?.thumbnail ? (
                    <img
                      src={video.thumbnail}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    />
                  ) : null}
                </a>
              ) : (
                video?.thumbnail && (
                  <img
                    src={video.thumbnail}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  />
                )
              )}
            </div>
          );
          return (
            <div
              key={s.id}
              className="group relative rounded-xl border bg-card transition-shadow hover:shadow-lg sm:rounded-2xl"
            >
              {thumb}
              <div className="overflow-hidden rounded-b-xl p-4">
                <span className="block max-w-full overflow-hidden text-base font-semibold">
                  <span className="inline-block whitespace-nowrap">{s.display_name || s.name}</span>
                </span>
                <div className="mt-2 text-sm text-muted-foreground">
                  <span className="block max-w-full overflow-hidden">
                    <span className="inline-block whitespace-nowrap">
                      {(s.vocalists || []).map((x, i) => (
                        <span key={`${x.vocalist?.id ?? "v"}-${i}`} className="shrink-0">
                          {i > 0 && "、"}
                          <Link
                            to={`/singer/${x.vocalist?.id}`}
                            className="hover:text-primary hover:underline"
                          >
                            {x.vocalist?.name}
                          </Link>
                        </span>
                      ))}
                    </span>
                  </span>
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  <span className="block max-w-full overflow-hidden">
                    <span className="inline-block whitespace-nowrap">
                      {(s.producers || []).map((x, i) => (
                        <span key={x.producer?.id ?? i} className="shrink-0">
                          {i > 0 && "、"}
                          {x.producer?.name}
                        </span>
                      ))}
                    </span>
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- 四张总览卡：原站 grid-cols-2 / sm:grid-cols-4，彩色圆形图标 ----
// 注意：颜色类名必须写全，写成 `text-${c}-500` 会被 Tailwind 扫描不到而丢失样式
const SUM_TONE = {
  blue: "text-blue-500 bg-blue-500/10",
  pink: "text-pink-500 bg-pink-500/10",
  rose: "text-rose-500 bg-rose-500/10",
  emerald: "text-emerald-500 bg-emerald-500/10",
};

function SummaryCards({ summary }) {
  const { t } = useTranslation();
  if (!summary) return null;
  const items = [
    { key: "totalView", value: summary.view, icon: Play, tone: "blue" },
    { key: "totalSong", value: summary.song_count, icon: Music, tone: "pink" },
    { key: "totalFavorite", value: summary.favorite, icon: Heart, tone: "rose" },
    { key: "totalLike", value: summary.like, icon: ThumbsUp, tone: "emerald" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
      {items.map(({ key, value, icon: Icon, tone }) => (
        <div
          key={key}
          className="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-sm sm:gap-4 sm:rounded-2xl sm:p-4"
        >
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg sm:h-10 sm:w-10 sm:rounded-xl ${SUM_TONE[tone]}`}
          >
            <Icon className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground sm:text-sm">{t(`singer.${key}`)}</p>
            <p className="truncate text-base font-bold sm:text-lg">{fmt(value ?? 0)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function SingerDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();

  const detailQ = useQuery({
    queryKey: qk.singer(id),
    queryFn: () => api(`/api/vocalist/${id}`, { silent: true }),
  });
  const summaryQ = useQuery({
    queryKey: qk.singerSummary(id),
    queryFn: () => api(`/api/vocalist/${id}/stats/summary`, { silent: true }),
  });
  const topQ = useQuery({
    queryKey: qk.singerTopSongs(id),
    queryFn: () => api(`/api/vocalist/${id}/songs/top?limit=10`, { silent: true }),
  });
  const latestQ = useQuery({
    queryKey: qk.singerLatestSongs(id),
    queryFn: () => api(`/api/vocalist/${id}/songs/latest?limit=10`, { silent: true }),
  });
  const synthsQ = useQuery({
    queryKey: qk.singerSynths(id),
    queryFn: () => api(`/api/vocalist/${id}/synthesizers?limit=12`, { silent: true }),
  });
  const producersQ = useQuery({
    queryKey: qk.singerProducers(id),
    queryFn: () => api(`/api/vocalist/${id}/producers?limit=12`, { silent: true }),
  });
  const girlsQ = useQuery({
    queryKey: qk.singers({}),
    queryFn: () => api("/api/girls", { silent: true }),
  });

  const v = detailQ.data;
  const summary = summaryQ.data ?? null;
  const topSongs = topQ.data || [];
  const latestSongs = latestQ.data || [];
  const synthesizers = (synthsQ.data || []).map((s) => ({
    ...s,
    synthesizer: s.synthesizer ?? { name: t("singer.unknownEngine") },
  }));
  const producers = producersQ.data || [];

  const local = useMemo(() => {
    const girls = Array.isArray(girlsQ.data) ? girlsQ.data : (girlsQ.data?.list || []);
    if (!v?.name || girls.length === 0) return null;
    return girls.find((g) => g.name.toLowerCase() === v.name.toLowerCase()) || null;
  }, [v?.name, girlsQ.data]);

  const err = detailQ.error?.message;
  if (err) return <p className="mx-auto max-w-4xl py-10 text-destructive">{err}</p>;
  if (detailQ.isLoading) return <p className="mx-auto max-w-4xl py-10 text-muted-foreground">{t("singer.loading")}</p>;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      {/* ===== 头部卡片 ===== */}
      <div className="@container rounded-xl border bg-card p-4 shadow-sm sm:rounded-2xl sm:p-6">
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted sm:h-16 sm:w-16 sm:rounded-2xl">
            {v.picture ? (
              <img src={v.picture} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
            ) : (
              <span className="text-xl font-bold text-muted-foreground">{v.name.slice(0, 1)}</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <h1 className="truncate text-lg font-bold sm:text-2xl">{v.name}</h1>
              <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium sm:px-3 sm:py-1 sm:text-xs bg-pink-500/10 text-pink-600 dark:text-pink-400">
                {t("singer.kindVocalist")}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground sm:mt-2 sm:text-sm">#{id}</p>
            {v.attributes?.description && (
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground sm:text-sm">{v.attributes.description}</p>
            )}
            {v.vocadb_id && (
              <a
                href={`https://vocadb.net/Ar/${v.vocadb_id}`}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-primary"
              >
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
                {t("singer.vocadb")}
              </a>
            )}
          </div>
        </div>
      </div>

      {/* ===== 总览 ===== */}
      <SummaryCards summary={summary} />

      {/* ===== 使用的引擎 ===== */}
      <section>
        <SectionHead icon={Cpu} title={t("singer.engines")} />
        <AvatarCardGrid items={synthesizers} empty={t("singer.noData")} />
      </section>

      {/* ===== 常合作P主 ===== */}
      <section>
        <SectionHead icon={Users} title={t("singer.partnerTitle")} />
        <AvatarCardGrid items={producers} empty={t("singer.noData")} />
      </section>

      {/* ===== 热门歌曲 ===== */}
      <section>
        <SectionHead title={t("singer.hotSongs")} />
        <SongCardGrid songs={topSongs} />
      </section>

      {/* ===== 最新歌曲 ===== */}
      <section>
        <SectionHead title={t("singer.latestSongs")} />
        <SongCardGrid songs={latestSongs} />
      </section>

      {/* ===== 本站收录（项目自有区块，原站无） ===== */}
      {local && (
        <section className="rounded-2xl border bg-card p-4 xs:p-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold">{t("singer.localTitle")}</h2>
            <Link to="/singers" className="text-xs text-muted-foreground transition hover:text-primary hover:underline">
              {t("singer.backToSingers")}
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border bg-muted/40 p-3">
              <div className="text-[11px] text-muted-foreground">{t("singer.localCount")}</div>
              <div className="mt-1 text-lg font-bold tabular-nums">{t("singer.countSongs", { n: local.count ?? 0 })}</div>
            </div>
            <div className="rounded-xl border bg-muted/40 p-3">
              <div className="text-[11px] text-muted-foreground">{t("singer.localView")}</div>
              <div className="mt-1 text-lg font-bold tabular-nums">{fmt(local.view ?? 0)}</div>
            </div>
            <div className="rounded-xl border bg-muted/40 p-3">
              <div className="text-[11px] text-muted-foreground">{t("singer.localFavorite")}</div>
              <div className="mt-1 text-lg font-bold tabular-nums">{fmt(local.favorite ?? 0)}</div>
            </div>
          </div>
          {local.songs?.length > 0 && (
            <ul className="mt-3 space-y-px border-t bg-muted/40 p-2">
              {local.songs.slice(0, 5).map((s, j) => (
                <li key={s.aid}>
                  <Link
                    to={`/video/${s.aid}`}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-accent"
                  >
                    <span className="w-4 shrink-0 text-right tabular-nums text-muted-foreground/50">{j + 1}</span>
                    {s.pic && (
                      <img
                        src={s.pic}
                        alt=""
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="h-7 w-11 shrink-0 rounded object-cover"
                      />
                    )}
                    <span className="min-w-0 flex-1 truncate">{s.title}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {fmt(s.score)}
                      {t("singers.pt")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
