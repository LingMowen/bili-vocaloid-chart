import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { X, Clock, TrendingUp, ArrowDownUp, ChevronDown } from "lucide-react";
import { api, fmt, fmtShort } from "../api.js";
import { qk } from "../queryKeys.js";
import PopoverMenu from "../components/ui/Popover.jsx";
import { EntityCard, ENTITY_GRID_WIDE } from "../components/ui/EntityCard.jsx";
import { enginePicture } from "../engineLogos.js";
import { SegmentedTabs } from "../components/ui/Tabs.jsx";

const HISTORY_KEY = "bili-vocaloid-chart-search-history";
const HISTORY_MAX = 10;
const PAGE_SIZE = 20;

// 参考站 /search 分段 tabs。**去掉「UP主」**：它与「P主」在数据层是同一个东西
// （两段都打 /api/owners?sort=works），保留只会给出两份一样的结果 —— 用户已明确要求去除。
const TAB_SEGS = [
  ["song", "search.typeSong"],
  ["video", "search.typeVideo"],
  ["singer", "search.typeSinger"],
  ["producer", "search.typeProducer"],
  ["engine", "search.typeEngine"],
];

function loadHistory() {
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    return Array.isArray(raw) ? raw.filter((w) => typeof w === "string" && w.trim()) : [];
  } catch {
    return [];
  }
}

function saveHistory(keyword) {
  const list = loadHistory().filter((w) => w !== keyword);
  list.unshift(keyword);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, HISTORY_MAX)));
}

function Highlight({ text, keyword }) {
  const q = (keyword || "").trim().toLowerCase();
  if (!q || !text) return <>{text}</>;
  const lower = String(text).toLowerCase();
  const parts = [];
  let i = 0;
  while (i < text.length) {
    const idx = lower.indexOf(q, i);
    if (idx === -1) {
      parts.push(String(text).slice(i));
      break;
    }
    if (idx > i) parts.push(String(text).slice(i, idx));
    parts.push(
      <mark key={idx} className="rounded-[3px] bg-primary/20 px-0.5 text-primary">
        {String(text).slice(idx, idx + q.length)}
      </mark>,
    );
    i = idx + q.length;
  }
  return <>{parts}</>;
}

function SkeletonRows({ rows = 4 }) {
  return (
    <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: rows }).map((_, k) => (
        <div key={k} className="min-w-0">
          <div className="aspect-video animate-pulse rounded-lg bg-muted" />
          <div className="mt-2 space-y-1.5">
            <div className="h-3.5 w-4/5 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-muted/70" />
          </div>
        </div>
      ))}
    </div>
  );
}

function sortMenu(entries, value, onChange) {
  return (
    <PopoverMenu
      trigger={
        <button className="flex shrink-0 items-center gap-1.5 rounded-xl border bg-card px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary">
          <ArrowDownUp className="h-3.5 w-3.5" />
          {value}
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </button>
      }
      className="w-36 p-1"
    >
      {entries.map(([val, label]) => (
        <button
          key={val}
          onClick={() => onChange(val)}
          className={`flex w-full items-center justify-between rounded-md px-3 py-1.5 text-sm transition-colors ${
            value === label
              ? "bg-primary/10 font-medium text-primary"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          }`}
        >
          {label}
        </button>
      ))}
    </PopoverMenu>
  );
}

function VideoCard({ item, keyword }) {
  const ownerName = item.owner?.name || "";
  const girls = [...new Set(item.girls || [])].slice(0, 3);
  return (
    <article className="group relative rounded-xl border bg-card transition-shadow hover:shadow-lg sm:rounded-2xl">
      <div className="relative aspect-video overflow-hidden bg-muted rounded-t-xl">
        <Link to={`/video/${item.aid}`} className="block h-full w-full">
          <img
            src={item.pic}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        </Link>
      </div>
      <div className="overflow-hidden rounded-b-xl p-4">
        <Link to={`/video/${item.aid}`} className="block hover:text-primary">
          {/* 单行 + 省略号（原来是 overflow-hidden + whitespace-nowrap 硬裁，没有 …） */}
          <span className="block max-w-full truncate text-base font-semibold">
            <Highlight text={item.title} keyword={keyword} />
          </span>
        </Link>
        <div className="mt-2 text-sm text-muted-foreground">
          {/* 合作者单行 + …；完整名单见详情页 */}
          <span className="block max-w-full truncate">
            {girls.length > 0 ? (
              girls.map((g, i) => (
                <span key={g}>
                  {i > 0 ? " / " : ""}
                  <Link to={`/search?keyword=${encodeURIComponent(g)}`} className="hover:text-primary hover:underline">
                    <Highlight text={g} keyword={keyword} />
                  </Link>
                </span>
              ))
            ) : (
              <span className="text-muted-foreground/70">—</span>
            )}
          </span>
        </div>
        <div className="mt-1 text-sm text-muted-foreground">
          <span className="block max-w-full truncate">
            <Link
              to={item.owner?.mid ? `/member/${item.owner.mid}` : `/search?keyword=${encodeURIComponent(ownerName)}`}
              className="hover:text-primary hover:underline"
            >
              <Highlight text={ownerName} keyword={keyword} />
            </Link>
          </span>
        </div>
      </div>
    </article>
  );
}

function UserCard({ item, keyword }) {
  const { t } = useTranslation();
  const total = (item.song_count || 0) + (item.coop_count || 0);
  return (
    <div className="flex min-w-0 flex-col overflow-visible rounded-xl border bg-card p-3">
      <div className="flex items-center gap-3">
        <Link to={`/member/${item.mid}`} className="shrink-0">
          <img
            src={item.face}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-12 w-12 rounded-full bg-muted object-cover"
          />
        </Link>
        <div className="min-w-0 flex-1">
          <Link
            to={`/member/${item.mid}`}
            className="block truncate text-sm font-medium leading-tight transition-colors hover:text-primary"
          >
            <Highlight text={item.name} keyword={keyword} />
          </Link>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span>
              {t("search.userWorks", { song: item.song_count || 0 })}
              {item.coop_count ? ` · ${t("search.userCoop", { coop: item.coop_count })}` : ""}
            </span>
            {item.total_view > 0 && <span className="tabular-nums">{fmtShort(item.total_view)} 播放</span>}
          </p>
        </div>
        <Link
          to={`/member/${item.mid}`}
          className="shrink-0 rounded-lg border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary"
        >
          {t("search.profile")}
        </Link>
      </div>
      {item.samples?.length > 0 && (
        <Link to={`/member/${item.mid}`} className="mt-3 grid grid-cols-6 gap-1.5">
          {item.samples.map((s) => (
            <div key={s.aid} className="aspect-video overflow-hidden rounded bg-muted">
              <img
                src={s.pic}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
              />
            </div>
          ))}
        </Link>
      )}
    </div>
  );
}

function LoadMore({ onClick, loading, label }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="w-full rounded-xl border border-dashed bg-card py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary disabled:opacity-50">
      {loading ? "…" : label}
    </button>
  );
}

export default function SearchPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const keyword = params.get("keyword") || "";
  const rawType = params.get("type") || "";
  const type = TAB_SEGS.some(([k]) => k === rawType) ? rawType : "song";
  const sort = ["view", "pubdate"].includes(params.get("sort")) ? params.get("sort") : "score";

  const [draft, setDraft] = useState(keyword);
  const [history, setHistory] = useState(loadHistory);
  const [hot, setHot] = useState([]);
  const debounce = useRef(null);

  useEffect(() => setDraft(keyword), [keyword]);

  useEffect(() => {
    api(`/api/search/hot`, { silent: true })
      .then((d) => setHot(d?.items || []))
      .catch(() => {});
  }, []);

  const videosQ = useInfiniteQuery({
    queryKey: qk.search({ keyword, type, sort }),
    queryFn: ({ pageParam = 1 }) =>
      api(
        `/api/search?keyword=${encodeURIComponent(keyword)}&type=video&sort=${sort}&page=${pageParam}`,
        { silent: true },
      ),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
    enabled: !!keyword && (type === "song" || type === "video"),
  });

  const usersQ = useInfiniteQuery({
    queryKey: qk.search({ keyword, type }),
    queryFn: ({ pageParam = 1 }) =>
      api(`/api/owners?keyword=${encodeURIComponent(keyword)}&sort=works&page=${pageParam}`, { silent: true }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
    enabled: !!keyword && type === "producer",
  });

  // 歌手搜索：复用 /api/girls，前端按名称/标签过滤
  const girlsQ = useQuery({
    queryKey: qk.singers({}),
    queryFn: () => api("/api/girls", { silent: true }),
    enabled: !!keyword && type === "singer",
  });

  // 引擎搜索：/api/engines 返回全部引擎（当前 13 种），前端按名称过滤即可。
  const enginesQ = useQuery({
    queryKey: qk.engines(),
    queryFn: () => api("/api/engines", { silent: true }),
    enabled: !!keyword && type === "engine",
  });

  const videos = videosQ.data?.pages.flatMap((p) => p.items || []) || [];
  const videoTotal = videosQ.data?.pages[0]?.num_results ?? 0;
  const videoPages = videosQ.data?.pages[0]?.pages ?? 0;
  const users = usersQ.data?.pages.flatMap((p) => p.items || []) || [];
  const userTotal = usersQ.data?.pages[0]?.num_results ?? 0;
  const userPages = usersQ.data?.pages[0]?.pages ?? 0;

  const girlsAll = Array.isArray(girlsQ.data) ? girlsQ.data : girlsQ.data?.list || [];
  const girls = keyword
    ? girlsAll.filter((g) => (g.name || "").toLowerCase().includes(keyword.toLowerCase()))
    : [];

  const enginesAll = Array.isArray(enginesQ.data?.list) ? enginesQ.data.list : [];
  const engines = keyword
    ? enginesAll.filter((e) => (e.name || "").toLowerCase().includes(keyword.toLowerCase()))
    : [];

  const err = videosQ.error?.message || usersQ.error?.message || girlsQ.error?.message || enginesQ.error?.message;

  const isSearching =
    !!keyword &&
    ((type === "song" || type === "video") && (videosQ.isLoading || videosQ.isFetching)) ||
    ((type === "producer") && (usersQ.isLoading || usersQ.isFetching)) ||
    (type === "engine" && (enginesQ.isLoading || enginesQ.isFetching)) ||
    (type === "singer" && (girlsQ.isLoading || girlsQ.isFetching));

  const hasAny =
    (type === "song" || type === "video") ? videoTotal > 0
    : (type === "producer") ? userTotal > 0
    : type === "singer" ? girls.length > 0
    : type === "engine" ? engines.length > 0
    : false;

  const totalItems =
    type === "song" || type === "video" ? videoTotal
    : type === "producer" ? userTotal
    : type === "singer" ? girls.length
    : type === "engine" ? engines.length
    : 0;

  const loadedCount =
    type === "song" || type === "video" ? videos.length
    : type === "producer" ? users.length
    : type === "singer" ? girls.length
    : type === "engine" ? engines.length
    : 0;

  function go(kw, opts = {}) {
    const nextType = opts.type ?? type;
    const nextSort = opts.sort ?? (nextType === "producer" ? "works" : sort);
    const k = kw.trim();
    if (!k) {
      setParams({});
      return;
    }
    if (k !== keyword || nextType !== type || nextSort !== sort) {
      saveHistory(k);
      setHistory(loadHistory());
      const q = { keyword: k };
      if (nextType !== "song") q.type = nextType;
      if (nextType !== "producer" && nextSort !== "score") q.sort = nextSort;
      setParams(q);
    }
  }

  function onSearch(e) {
    e.preventDefault();
    go(draft);
  }

  function onDebounced(v) {
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => go(v), 400);
  }

  return (
    <section className="mx-auto w-full min-w-0 max-w-6xl">
      <form onSubmit={onSearch} className="mb-4 flex items-center gap-2 sm:mb-6 sm:gap-4">
        <div className="relative min-w-0 flex-1">
          <input
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              onDebounced(e.target.value);
            }}
            placeholder={t("search.placeholder")}
            className="min-w-0 w-full rounded-xl border bg-card px-3 py-2 pr-9 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          {draft && (
            <button
              type="button"
              onClick={() => {
                setDraft("");
                onDebounced("");
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground"
              aria-label={t("search.clear")}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <button className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
          {t("search.button")}
        </button>
      </form>

      {/* 6 段 tabs（参考站 /search，含关键词时展示） */}
      {keyword && (
        <div className="mb-4 flex items-center gap-2 sm:mb-6 sm:gap-3">
          <SegmentedTabs
            className="flex-1"
            gridClass="grid-cols-3 sm:grid-cols-5"
            value={type}
            onChange={(v) => go(keyword, { type: v })}
            items={TAB_SEGS.map(([val, labelKey]) => [val, t(labelKey)])}
          />

          {(type === "song" || type === "video") &&
            sortMenu(
              [
                ["score", t("search.sortScore")],
                ["view", t("search.sortView")],
                ["pubdate", t("search.sortPubdate")],
              ],
              sort === "score" ? t("search.sortScore") : sort === "view" ? t("search.sortView") : t("search.sortPubdate"),
              (v) => go(keyword, { type, sort: v }),
            )}
        </div>
      )}

      {!keyword && (
        <div className="w-full space-y-6">
          {history.length > 0 && (
            <div className="w-full space-y-2.5">
              <div className="flex items-center gap-2 px-1">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <h3 className="text-sm font-semibold">{t("search.history")}</h3>
                <button
                  onClick={() => {
                    localStorage.removeItem(HISTORY_KEY);
                    setHistory([]);
                  }}
                  className="ml-auto text-xs text-muted-foreground hover:text-destructive"
                >
                  {t("search.clearHistory")}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {history.slice(0, 8).map((w) => (
                  <button
                    key={w}
                    onClick={() => go(w)}
                    className="rounded-full border bg-muted/40 px-3.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary"
                  >
                    {w}
                  </button>
                ))}
              </div>
            </div>
          )}
          {hot.length > 0 && (
            <div className="w-full space-y-2.5">
              <div className="flex items-center gap-2 px-1">
                <TrendingUp className="h-3.5 w-3.5 text-primary" />
                <h3 className="text-sm font-semibold">{t("search.hotWords")}</h3>
                <span className="text-xs text-muted-foreground">{t("search.hotWordsHint")}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {hot.map((w, i) => (
                  <button
                    key={w}
                    onClick={() => go(w)}
                    className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors hover:border-primary/30 hover:text-primary ${
                      i < 3 ? "border-primary/30 bg-primary/5 text-primary" : "bg-muted/40 text-muted-foreground"
                    }`}
                  >
                    {i < 3 && <span className="font-bold">{i + 1}</span>}
                    {w}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!keyword && history.length === 0 && hot.length === 0 && (
        <div className="rounded-lg border border-dashed bg-card py-16 text-center text-sm text-muted-foreground sm:rounded-xl sm:py-20 sm:text-base">
          {t("search.hint")}
        </div>
      )}

      {isSearching && !hasAny && <SkeletonRows rows={4} />}

      {!isSearching && err && <p className="py-6 text-center text-sm text-destructive">{err}</p>}

      {!isSearching && keyword && hasAny && type === "singer" && (
        <div>
          <div className="mb-3 text-xs text-muted-foreground sm:mb-4 sm:text-sm">
            {t("search.resultCount", { total: fmt(totalItems), shown: fmt(loadedCount) })}
          </div>
          <div className={ENTITY_GRID_WIDE}>
            {girls.map((g) => (
              <EntityCard
                key={g.name}
                to={g.id ? `/singer/${g.id}` : `/search?keyword=${encodeURIComponent(g.name)}`}
                picture={g.picture}
                name={g.name}
                alt={g.name}
                nameNode={<Highlight text={g.name} keyword={keyword} />}
                sub={`${g.count || 0} 首`}
              />
            ))}
          </div>
        </div>
      )}

      {/* 引擎分类：数据源 = /api/engines（singers.json 的 engines 字段）。
          此前这里无条件渲染「该分类数据未收录，敬请期待」，但库里 13 种引擎全部有数据。 */}
      {!isSearching && keyword && hasAny && type === "engine" && (
        <div>
          <div className="mb-3 text-xs text-muted-foreground sm:mb-4 sm:text-sm">
            {t("search.resultCount", { total: fmt(totalItems), shown: fmt(loadedCount) })}
          </div>
          <h3 className="mb-3 px-1 text-sm font-semibold sm:mb-4">{t("search.sectionEngines")}</h3>
          <div className={ENTITY_GRID_WIDE}>
            {engines.map((e) => (
              <EntityCard
                key={e.id ?? e.name}
                picture={enginePicture(e)}
                name={e.name}
                alt={e.name}
                nameNode={<Highlight text={e.name} keyword={keyword} />}
                fallbackText={e.name}
                sub={t("singers.engineLine", {
                  n: e.singers?.length ?? 0,
                  count: fmt(e.count),
                })}
              />
            ))}
          </div>
        </div>
      )}

      {!isSearching && keyword && hasAny && type !== "singer" && type !== "engine" && (
        <div>
          <div className="mb-3 text-xs text-muted-foreground sm:mb-4 sm:text-sm">
            {t("search.resultCount", { total: fmt(totalItems), shown: fmt(loadedCount) })}
          </div>
          {type === "producer" && (
            <div className="space-y-2.5">
              <h3 className="px-1 text-sm font-semibold">
                {t("search.sectionUsers")}
                <span className="ml-1.5 text-xs font-normal tabular-nums text-muted-foreground">（{fmt(userTotal)}）</span>
              </h3>
              <div className="grid gap-3 md:grid-cols-2">
                {users.map((item) => (
                  <UserCard key={item.mid} item={item} keyword={keyword} />
                ))}
              </div>
              {userPages > 1 && users.length < userTotal && (
                <LoadMore
                  loading={usersQ.isFetchingNextPage}
                  label={t("search.loadMore", { shown: fmt(users.length), total: fmt(userTotal) })}
                  onClick={() => usersQ.fetchNextPage()}
                />
              )}
            </div>
          )}
          {(type === "song" || type === "video") && (
            <div className="space-y-2.5">
              <h3 className="px-1 text-sm font-semibold">
                {t("search.sectionVideos")}
                <span className="ml-1.5 text-xs font-normal tabular-nums text-muted-foreground">（{fmt(videoTotal)}）</span>
              </h3>
              <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {videos.map((item) => (
                  <VideoCard key={item.bvid || item.aid} item={item} keyword={keyword} />
                ))}
              </div>
              {videoPages > 1 && videos.length < videoTotal && (
                <LoadMore
                  loading={videosQ.isFetchingNextPage}
                  label={t("search.loadMore", { shown: fmt(videos.length), total: fmt(videoTotal) })}
                  onClick={() => videosQ.fetchNextPage()}
                />
              )}
            </div>
          )}
        </div>
      )}

      {!isSearching && !err && keyword && !hasAny && (
        <div className="rounded-lg border border-dashed bg-card py-16 text-center text-sm text-muted-foreground sm:rounded-xl sm:py-20 sm:text-base">
          {t("search.noResult")}
        </div>
      )}
    </section>
  );
}