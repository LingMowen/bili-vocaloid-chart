import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api.js";
import { qk } from "../queryKeys.js";
import Modal from "../components/ui/Modal.jsx";
import Tip from "../components/ui/Tip.jsx";

// 2026-09-29 起 1:1 对齐 vocabili 成就页结构：
//   主 tab：周刊成就 | 日刊门番（不再提供 月榜/年榜 成就入口）
//   周刊成就类型：Emerging Hit! / Mega Hit!!! / 门番候补 / 门番
//   日刊门番：两个区块（当前门番 / 当前门番候补）
const TABS = [
  { key: "weekly", label: "achievements.tabWeekly" },
  { key: "daily", label: "achievements.tabDaily" },
];

// 类型定义与阈值同 vocabili（描述见 i18n）；配色提取自其前端 bundle
const CATEGORIES = [
  { key: "emerging_hit", label: "achievements.cat.emerging_hit.label", description: "achievements.cat.emerging_hit.desc", maxRank: 5 },
  { key: "mega_hit", label: "achievements.cat.mega_hit.label", description: "achievements.cat.mega_hit.desc", maxRank: 3 },
  { key: "potential_regular", label: "achievements.cat.potential_regular.label", description: "achievements.cat.potential_regular.desc", maxRank: 20 },
  { key: "regular", label: "achievements.cat.regular.label", description: "achievements.cat.regular.desc", maxRank: 20 },
  // 2026-10-05：累计播放量三档（用户指定）。判定源是库内累计播放量，
  // 与榜位无关 —— 故不渲染 ranks/期号，只显示播放量。
  { key: "hall_of_fame", label: "achievements.cat.hall_of_fame.label", description: "achievements.cat.hall_of_fame.desc", viewThreshold: 100000 },
  { key: "legend", label: "achievements.cat.legend.label", description: "achievements.cat.legend.desc", viewThreshold: 1000000 },
  { key: "myth", label: "achievements.cat.myth.label", description: "achievements.cat.myth.desc", viewThreshold: 10000000 },
];

// 判定所需的最少历史期数：连续型按 streak 长度，门番系按官方窗口。
// 本站可用期数不足时该类型必然为 0，用于区分「数据不足」与「确实无人达成」。
const MIN_PERIODS = {
  emerging_hit: 3,
  mega_hit: 5,
  potential_regular: 15,
  regular: 30,
};

const COLORS = {
  emerging_hit: "#6A0DAD",
  mega_hit: "#CCA300",
  potential_regular: "#23AFA4",
  regular: "#127436",
  daily_regular: "#127436",
  daily_potential_regular: "#23AFA4",
  hall_of_fame: "#8B5CF6",
  legend: "#D97706",
  myth: "#DC2626",
};

/** 累计播放量三档（不依赖榜位） */
const VIEW_CATEGORIES = CATEGORIES.filter((c) => c.viewThreshold > 0);
const isViewType = (k) => VIEW_CATEGORIES.some((c) => c.key === k);

const PAGE_SIZE = 20;
const CHIP_LIMIT = 20;

function Thumbnail({ item }) {
  const t = item.song?.thumbnail;
  return (
    <Link to={`/video/${item.song_id}`} className="block h-full w-full">
      {t ? (
        <img src={t} alt="" referrerPolicy="no-referrer" loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
      ) : (
        <div className="flex h-full items-center justify-center text-5xl text-muted-foreground/20">♪</div>
      )}
    </Link>
  );
}

function RankChip({ issue, rank, maxRank, board }) {
  const { t } = useTranslation();
  const hit = rank <= maxRank;
  return (
    <Tip content={t("achievements.rankChipTitle", { issue, rank })}>
    <Link
      to={`/rank/${board}/${issue}`}
      className={`inline-flex w-10 flex-col items-center rounded-lg py-1 text-center transition hover:ring-1 hover:ring-primary/30 ${
        hit ? "bg-accent text-foreground font-semibold" : "bg-muted/40 text-muted-foreground/40"
      }`}
    >
      <span className="text-xs tabular-nums leading-none">{rank}</span>
      <span className="mt-0.5 text-[9px] leading-none opacity-50">{issue}</span>
    </Link>
    </Tip>
  );
}

function RankChipsModal({ entries, maxRank, name, board, onClose }) {
  const { t } = useTranslation();
  const shown = entries.filter((o) => o.rank <= maxRank).length;
  return (
    <Modal open onClose={onClose} title={t("achievements.modalTitle", { name, shown, total: entries.length })} description={t("achievements.modalTitle", { name, shown, total: entries.length })} maxWidth="max-w-2xl">
      <div className="max-h-[60vh] overflow-y-auto">
        <div className="flex flex-wrap gap-1">
          {entries
            .slice()
            .sort((a, b) => a.issue - b.issue)
            .map(({ issue, rank }) => (
              <RankChip key={issue} issue={issue} rank={rank} maxRank={maxRank} board={board} />
            ))}
        </div>
      </div>
    </Modal>
  );
}

function RankChips({ ranks, maxRank, name, board }) {
  const { t } = useTranslation();
  const entries = Object.entries(ranks || {})
    .map(([issue, rank]) => ({ issue: Number(issue), rank }))
    .sort((a, b) => a.issue - b.issue);
  const [open, setOpen] = useState(false);
  const overflow = entries.length > CHIP_LIMIT;
  const shown = overflow ? entries.slice(0, CHIP_LIMIT) : entries;
  return (
    <div className="mt-3 xs:mt-4">
      <div className="flex flex-wrap gap-1">
        {shown.map(({ issue, rank }) => (
          <RankChip key={issue} issue={issue} rank={rank} maxRank={maxRank} board={board} />
        ))}
        {overflow && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-0.5 self-center rounded-lg bg-accent/60 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
          >
            {t("achievements.viewAll", { n: entries.length - CHIP_LIMIT })}
          </button>
        )}
      </div>
      {open && <RankChipsModal entries={entries} maxRank={maxRank} name={name} board={board} onClose={() => setOpen(false)} />}
    </div>
  );
}

// 单行 + 省略号（原来用 overflow-hidden + whitespace-nowrap，合作者一多就被硬裁掉、
// 连省略号都没有，看不出还有内容）。与 RankCard 的 NoWrap 保持一致。
function NoWrap({ children }) {
  return <span className="block max-w-full truncate">{children}</span>;
}

function ArtistPills({ song }) {
  const producers = song?.producers?.map((o) => o.producer?.name).filter(Boolean) || [];
  const vocalists = song?.vocalists?.filter((o) => !o.is_support).map((o) => o.vocalist?.name).filter(Boolean) || [];
  return (
    <div className="mt-2 flex flex-wrap gap-1.5 text-xs xs:gap-2 xs:text-sm">
      {producers.length > 0 && (
        <span className="block overflow-hidden max-w-[calc(50%-0.25rem)] rounded-lg bg-blue-500/10 px-2.5 py-1.5 text-blue-600 dark:text-blue-400">
          <NoWrap>{producers.join(" / ")}</NoWrap>
        </span>
      )}
      {vocalists.length > 0 && (
        <span className="block overflow-hidden max-w-[calc(50%-0.25rem)] rounded-lg bg-pink-500/10 px-2.5 py-1.5 text-pink-600 dark:text-pink-400">
          <NoWrap>{vocalists.join(" / ")}</NoWrap>
        </span>
      )}
    </div>
  );
}

function RankBadge({ index }) {
  // 对齐 vocabili：列表序号徽章统一金色（不再分级配色）
  return (
    <div className="pointer-events-none absolute left-3 top-3 rounded-lg px-2 py-1 text-sm font-bold bg-yellow-500 text-white">
      {index + 1}
    </div>
  );
}

// 对齐 vocabili：卡片右下角展示「最近三期排名序列」，如 2~1~3（用 ~ 连接）
function recentRankSeq(ranks, n = 3) {
  const arr = Object.entries(ranks || {})
    .map(([issue, rank]) => ({ issue: Number(issue), rank }))
    .sort((a, b) => a.issue - b.issue);
  if (!arr.length) return "—";
  return arr.slice(-n).map((o) => o.rank).join("~");
}

function IssueRange({ startIssue, endIssue, board }) {
  const { t } = useTranslation();
  return (
    <div className="pointer-events-auto absolute bottom-3 left-3 flex items-center gap-1 text-sm text-white/90">
      <Link to={`/rank/${board}/${startIssue}`} className="underline decoration-white/40 underline-offset-2 transition hover:text-white hover:decoration-white/80">
        #{startIssue}
      </Link>
      <span className="text-white/40">→</span>
      {endIssue != null && endIssue !== startIssue ? (
        <Link to={`/rank/${board}/${endIssue}`} className="underline decoration-white/40 underline-offset-2 transition hover:text-white hover:decoration-white/80">
          #{endIssue}
        </Link>
      ) : (
        <span className="text-white/60">{t("achievements.toNow")}</span>
      )}
    </div>
  );
}

function ProgressBadge({ color, text, className = "" }) {
  return (
    <div
      className={`pointer-events-none absolute bottom-3 right-3 rounded-lg px-2.5 py-1 text-sm font-bold text-white shadow-lg ${className}`}
      style={{ backgroundColor: color }}
    >
      {text}
    </div>
  );
}

function WeekCard({ item, index, type, board }) {
  const { t } = useTranslation();
  const color = COLORS[type];
  const name = item.song?.display_name || item.song?.title || t("achievements.unknown");
  // 累计播放量三档：没有 ranks / 期号，改显示播放量与门槛
  if (isViewType(type)) {
    const view = Number(item.meta?.view) || 0;
    const threshold = Number(item.meta?.threshold) || 0;
    // 达成时间由后端从 stat_daily 逐日快照回溯，精度分三档，如实标注不假装精确
    const ad = item.achieved_date;
    const achievedText = !ad
      ? ""
      : item.achieved_precision === "before"
        ? t("achievements.achievedBefore", { date: ad })
        : item.achieved_precision === "after"
          ? t("achievements.achievedAfter", { date: ad })
          : t("achievements.achievedOn", { date: ad });
    return (
      <article className="group overflow-hidden rounded-2xl border bg-card transition-shadow hover:shadow-lg">
        <div className="relative aspect-video overflow-hidden bg-muted">
          <Thumbnail item={item} />
          <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/60 via-black/5 to-transparent" />
          <div className="pointer-events-none absolute left-3 top-3 rounded-lg bg-black/50 px-2 py-1 text-sm font-bold text-white">
            #{index + 1}
          </div>
        </div>
        <div className="p-3 xs:p-4">
          <Link to={`/video/${item.song_id}`} className="block hover:text-primary">
            <NoWrap>
              <span className="text-sm font-bold leading-snug xs:text-base">{name}</span>
            </NoWrap>
          </Link>
          <ArtistPills song={item.song} />
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span>
              {t("achievements.totalView")}&nbsp;
              <span className="font-bold tabular-nums" style={{ color }}>
                {view.toLocaleString()}
              </span>
            </span>
            {threshold > 0 && (
              <>
                <span className="text-muted-foreground/30">·</span>
                <span>
                  {t("achievements.threshold")}&nbsp;
                  <span className="font-semibold tabular-nums">{threshold.toLocaleString()}</span>
                </span>
              </>
            )}
            {achievedText && (
              <>
                <span className="text-muted-foreground/30">·</span>
                <span>{achievedText}</span>
              </>
            )}
          </div>
        </div>
      </article>
    );
  }
  return (
    <article className="group overflow-hidden rounded-2xl border bg-card transition-shadow hover:shadow-lg">
      <div className="relative aspect-video overflow-hidden bg-muted">
        <Thumbnail item={item} />
        <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/60 via-black/5 to-transparent" />
        <RankBadge index={index} />
        <ProgressBadge color={color} text={recentRankSeq(item.ranks)} />
        <IssueRange startIssue={item.start_issue} endIssue={item.end_issue} board={board} />
      </div>
      <div className="p-3 xs:p-4">
        <Link to={`/video/${item.song_id}`} className="block hover:text-primary">
          <NoWrap>
            <span className="text-sm font-bold leading-snug xs:text-base">{name}</span>
          </NoWrap>
        </Link>
        <ArtistPills song={item.song} />
        <RankChips ranks={item.ranks} maxRank={CATEGORIES.find((c) => c.key === type)?.maxRank ?? 20} name={name} board={board} />
      </div>
    </article>
  );
}

// 日刊门番卡片（对齐 vocabili 的 S 组件）：
//   左上角 #名次（黑底），无右下角排名序列徽章；
//   正文统计行「上榜 X / Y 期 · 持续 Z 期 · 达成于 #N」
function DailyCard({ item, index, type }) {
  const { t } = useTranslation();
  const color = COLORS[type] || "#127436";
  const name = item.song?.display_name || item.song?.title || t("achievements.unknown");
  const onBoard = item.on_board_count ?? Object.values(item.ranks || {}).filter((r) => r >= 1 && r <= 20).length;
  const total = item.total_count ?? Object.keys(item.ranks || {}).length;
  const streak = item.streak ?? 0;
  return (
    <article className="group overflow-hidden rounded-2xl border bg-card transition-shadow hover:shadow-lg">
      <div className="relative aspect-video overflow-hidden bg-muted">
        <Thumbnail item={item} />
        <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/60 via-black/5 to-transparent" />
        <div className="pointer-events-none absolute left-3 top-3 rounded-lg bg-black/50 px-2 py-1 text-sm font-bold text-white">
          #{index + 1}
        </div>
        <IssueRange startIssue={item.start_issue} endIssue={item.end_issue} board="daily" />
      </div>
      <div className="p-3 xs:p-4">
        <Link to={`/video/${item.song_id}`} className="block hover:text-primary">
          <NoWrap>
            <span className="text-sm font-bold leading-snug xs:text-base">{name}</span>
          </NoWrap>
        </Link>
        <ArtistPills song={item.song} />
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span>
            {t("achievements.onBoard")}&nbsp;
            <span className="font-bold tabular-nums" style={{ color }}>
              {onBoard}
            </span>
            &nbsp;/ {total}&nbsp;{t("achievements.issuesUnit")}
          </span>
          <span className="text-muted-foreground/30">·</span>
          <span>
            {t("achievements.streak")}&nbsp;
            <span className="font-semibold tabular-nums">{streak}</span>
            &nbsp;{t("achievements.issuesUnit")}
          </span>
          <span className="text-muted-foreground/30">·</span>
          <span>
            {t("achievements.achievedAt")}&nbsp;
            <Link
              to={`/rank/daily/${item.achieved_issue}`}
              className="font-semibold underline decoration-muted-foreground/30 underline-offset-2 hover:text-foreground"
            >
              #{item.achieved_issue}
            </Link>
          </span>
        </div>
        <RankChips ranks={item.ranks} maxRank={20} name={name} board="daily" />
      </div>
    </article>
  );
}

function SectionHeader({ title, count, color }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <h2 className="text-base font-bold xs:text-lg">{title}</h2>
      <span
        className="rounded-full px-2 py-0.5 text-xs font-semibold"
        style={{ backgroundColor: `${color}1A`, color }}
      >
        {count}
      </span>
    </div>
  );
}

function Skeleton({ count = 6, cols3 = false }) {
  return (
    <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${cols3 ? "lg:grid-cols-3" : ""}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-2xl border bg-card">
          <div className="aspect-video animate-pulse bg-muted" />
          <div className="space-y-3 p-4">
            <div className="h-4 w-3/5 animate-pulse rounded bg-muted" />
            <div className="h-3 w-2/5 animate-pulse rounded bg-muted" />
            <div className="flex gap-1">
              {Array.from({ length: 4 }).map((_, n) => (
                <div key={n} className="h-8 w-10 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ErrorBox({ message }) {
  return <div className="rounded-2xl border bg-card p-12 text-center text-sm text-muted-foreground">{message}</div>;
}

function EmptyBox({ icon, text }) {
  return (
    <div className="rounded-2xl border bg-card p-12 text-center">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center text-muted-foreground/20">{icon}</div>
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function TrophyIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z" />
      <path d="M5 21h14" />
    </svg>
  );
}

function Pager({ page, totalPages, onChange }) {
  const { t } = useTranslation();
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-2">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        className="rounded-lg border border-border px-3 py-1.5 text-xs transition enabled:hover:bg-accent disabled:opacity-40"
      >
        {t("achievements.prev")}
      </button>
      <span className="text-xs tabular-nums text-muted-foreground">
        {page} / {totalPages}
      </span>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
        className="rounded-lg border border-border px-3 py-1.5 text-xs transition enabled:hover:bg-accent disabled:opacity-40"
      >
        {t("achievements.next")}
      </button>
    </div>
  );
}

function useAchievements(params) {
  const qs = new URLSearchParams(params).toString();
  return useQuery({
    queryKey: qk.achievements(params),
    queryFn: () => api(`/api/achievements?${qs}`, { silent: true }),
  });
}

// 周刊成就：类型 tab + 描述头 + 卡片网格（与原 BoardMode 同构，类型集换为 vocabili 定义）
function WeeklyBoard() {
  const { t } = useTranslation();
  const [type, setType] = useState("emerging_hit");
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useAchievements({ board: "weekly", type, page, page_size: PAGE_SIZE });
  const total = data?.total ?? 0;
  const items = data?.data ?? [];
  const cat = CATEGORIES.find((c) => c.key === type);
  const color = COLORS[type];
  const totalPages = Math.ceil(total / PAGE_SIZE);
  return (
    <>
      <div className="mb-4 flex gap-1 overflow-x-auto rounded-2xl border bg-card p-1.5 scrollbar-none xs:mb-6">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => {
              setType(c.key);
              setPage(1);
            }}
            className={`shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition ${
              type === c.key ? "text-white shadow-md" : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
            style={type === c.key ? { backgroundColor: COLORS[c.key] } : undefined}
          >
            {t(c.label)}
          </button>
        ))}
      </div>
      <div className="mb-4 flex items-center justify-between rounded-xl border bg-card px-4 py-3 xs:mb-6">
        <div className="flex items-center gap-2.5 text-sm">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
          <span className="font-medium text-foreground">{cat && t(cat.label)}</span>
          <span className="text-muted-foreground">{cat && t(cat.description)}</span>
        </div>
        {!isLoading && total > 0 && (
          <span className="shrink-0 text-sm font-semibold tabular-nums text-muted-foreground">{t("achievements.totalSongs", { total })}</span>
        )}
      </div>
      {isLoading ? (
        <Skeleton count={6} />
      ) : error?.message ? (
        <ErrorBox message={error?.message} />
      ) : items.length === 0 ? (
        (() => {
          const periods = data?.periods_available ?? null;
          const need = MIN_PERIODS[type];
          // 累计播放量三档不看历史期数，不需要「数据不足」提示
          if (isViewType(type)) return <EmptyBox icon={<TrophyIcon className="h-10 w-10" />} text={t("achievements.emptyWeekly")} />;
          // 「连续型」成就要求期数连续；本站历史期数不足或存在断档时，再等多久也不会有结果，
          // 必须明确告知，否则用户只会看到一片空白。
          const continuous = type === "emerging_hit" || type === "mega_hit";
          const short = periods != null && need && periods < need;
          const gap = continuous && data?.has_gap;
          const text = short
            ? t("achievements.insufficientPeriods", { n: periods, need })
            : gap
            ? t("achievements.gappedPeriods", { n: periods, need })
            : t("achievements.emptyWeekly");
          return <EmptyBox icon={<TrophyIcon className="h-10 w-10" />} text={text} />;
        })()
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {items.map((item, i) => (
            <WeekCard key={`${item.song_id}-${item.start_issue}`} item={item} index={(page - 1) * PAGE_SIZE + i} type={type} board="weekly" />
          ))}
        </div>
      )}
      <Pager page={page} totalPages={totalPages} onChange={setPage} />
    </>
  );
}

// 日刊门番：两个区块（当前门番 / 当前门番候补），对齐 vocabili 日刊视图
function DailyBoard() {
  const { t } = useTranslation();
  const regular = useAchievements({ board: "daily", type: "daily_regular", page: 1, page_size: PAGE_SIZE });
  const candidate = useAchievements({ board: "daily", type: "daily_potential_regular", page: 1, page_size: PAGE_SIZE });
  const regItems = regular.data?.data ?? [];
  const candItems = candidate.data?.data ?? [];
  if (regular.isLoading || candidate.isLoading) return <Skeleton count={4} />;
  if (regular.error?.message) return <ErrorBox message={regular.error.message} />;
  return (
    <div className="space-y-8">
      {regItems.length > 0 && (
        <section>
          <SectionHeader title={t("achievements.dailyRegularTitle")} count={regItems.length} color={COLORS.daily_regular} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {regItems.map((item, i) => (
              <DailyCard key={`${item.song_id}-${item.start_issue}`} item={item} index={i} type="daily_regular" />
            ))}
          </div>
        </section>
      )}
      {candItems.length > 0 && (
        <section>
          <SectionHeader title={t("achievements.dailyCandidateTitle")} count={candItems.length} color={COLORS.daily_potential_regular} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {candItems.map((item, i) => (
              <DailyCard key={`${item.song_id}-${item.start_issue}`} item={item} index={i} type="daily_potential_regular" />
            ))}
          </div>
        </section>
      )}
      {regItems.length === 0 && candItems.length === 0 && (
        <EmptyBox icon={<TrophyIcon className="h-10 w-10" />} text={t("achievements.dailyEmpty")} />
      )}
    </div>
  );
}

export default function AchievementsPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState("weekly");
  return (
    <div className="mx-auto max-w-5xl min-w-0 space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{t("achievements.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("achievements.desc")}</p>
      </div>
      <div className="flex items-center gap-2 rounded-2xl border bg-card p-1.5">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-bold transition ${
              tab === key ? "bg-foreground text-background shadow-md" : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            {t(label)}
          </button>
        ))}
      </div>
      {tab === "weekly" ? <WeeklyBoard /> : <DailyBoard />}
    </div>
  );
}
