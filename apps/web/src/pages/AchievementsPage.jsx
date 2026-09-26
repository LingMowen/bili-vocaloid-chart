import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api.js";
import { qk } from "../queryKeys.js";
import Modal from "../components/ui/Modal.jsx";
import Tip from "../components/ui/Tip.jsx";

const MODES = [
  ["daily", "achievements.modeDaily"],
  ["weekly", "achievements.modeWeekly"],
  ["monthly", "achievements.modeMonthly"],
  ["annual", "achievements.modeAnnual"],
];

const CATEGORIES = [
  { key: "superhit", label: "achievements.cat.superhit.label", description: "achievements.cat.superhit.desc", maxRank: 3 },
  { key: "monban", label: "achievements.cat.monban.label", description: "achievements.cat.monban.desc", maxRank: 20 },
  { key: "myth", label: "achievements.cat.myth.label", description: "achievements.cat.myth.desc", maxRank: 20 },
  { key: "annual_top", label: "achievements.cat.annual_top.label", description: "achievements.cat.annual_top.desc", maxRank: 1 },
];

const COLORS = {
  superhit: "#7C3AED",
  monban: "#127436",
  myth: "#B45309",
  annual_top: "#0E7490",
};

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

function NoWrap({ children }) {
  return (
    <span className="block max-w-full overflow-hidden">
      <span className="inline-block whitespace-nowrap">{children}</span>
    </span>
  );
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
  const cls =
    index === 0
      ? "bg-yellow-500 text-white"
      : index === 1
        ? "bg-gray-400 text-white"
        : index === 2
          ? "bg-amber-600 text-white"
          : "bg-black/50 text-white";
  return (
    <div className={`pointer-events-none absolute left-3 top-3 rounded-lg px-2 py-1 text-sm font-bold ${cls}`}>
      {index + 1}
    </div>
  );
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
  return (
    <article className="group overflow-hidden rounded-2xl border bg-card transition-shadow hover:shadow-lg">
      <div className="relative aspect-video overflow-hidden bg-muted">
        <Thumbnail item={item} />
        <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/60 via-black/5 to-transparent" />
        <RankBadge index={index} />
        <ProgressBadge color={color} text={item.progress} />
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

function BoardMode({ board }) {
  const { t } = useTranslation();
  const [type, setType] = useState("superhit");
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useAchievements({ board, type, page, page_size: PAGE_SIZE });
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
        <EmptyBox icon={<TrophyIcon className="h-10 w-10" />} text={t("achievements.emptyWeekly")} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {items.map((item, i) => (
            <WeekCard key={`${item.song_id}-${item.start_issue}`} item={item} index={(page - 1) * PAGE_SIZE + i} type={type} board={board} />
          ))}
        </div>
      )}
      <Pager page={page} totalPages={totalPages} onChange={setPage} />
    </>
  );
}

export default function AchievementsPage() {
  const { t } = useTranslation();
  const [board, setBoard] = useState("weekly");
  return (
    <div className="mx-auto max-w-5xl min-w-0 space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{t("achievements.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("achievements.desc")}</p>
      </div>
      <div className="flex items-center gap-2 rounded-2xl border bg-card p-1.5">
        {MODES.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setBoard(key)}
            className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-bold transition ${
              board === key ? "bg-foreground text-background shadow-md" : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            {t(label)}
          </button>
        ))}
      </div>
      <BoardMode board={board} />
    </div>
  );
}
