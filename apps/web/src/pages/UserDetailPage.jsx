import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Handshake, Music, PlaySquare } from "lucide-react";
import { api, fmt, fmtDate } from "../api.js";
import { qk } from "../queryKeys.js";

function StaffChips({ staff }) {
  const { t } = useTranslation();
  if (!staff?.length) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      <Handshake className="h-3 w-3 shrink-0 text-muted-foreground/60" aria-hidden="true" />
      {staff.map((s) => (
        <Link
          key={s.mid}
          to={`/member/${s.mid}`}
          className="inline-flex items-center gap-1 rounded-full bg-muted/70 px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {s.face && (
            <img
              src={s.face}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              className="h-3.5 w-3.5 rounded-full object-cover"
            />
          )}
          <span className="font-medium">{s.name}</span>
          {s.title ? <span className="opacity-70">· {s.title}</span> : null}
        </Link>
      ))}
    </div>
  );
}

export default function UserDetailPage() {
  const { t } = useTranslation();
  const { mid } = useParams();

  const { data, isLoading, error } = useQuery({
    queryKey: qk.owner(mid),
    queryFn: () => api(`/api/owner/${mid}`, { silent: true }),
  });

  const owner = data?.owner;
  const summary = data?.summary || null;
  const songs = data?.songs || [];
  const coop = data?.coop || [];
  const err = error?.message;

  if (err) return <p className="mx-auto max-w-4xl py-10 text-destructive">{err}</p>;
  if (isLoading) return <p className="mx-auto max-w-4xl py-10 text-muted-foreground">{t("user.loading")}</p>;
  if (!owner) return <p className="mx-auto max-w-4xl py-10 text-muted-foreground">{t("user.notFound")}</p>;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <div>
        <Link
          to="/search"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-primary"
        >
          <ArrowLeft className="h-3 w-3" aria-hidden="true" />
          {t("user.back")}
        </Link>
      </div>

      <section className="overflow-hidden rounded-2xl border bg-card">
        <div className="relative bg-linear-to-br from-primary/8 via-primary/4 to-transparent p-6 xs:p-8">
          <div className="flex flex-wrap items-end gap-5">
            <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-3xl border-4 border-background bg-muted shadow-lg xs:h-28 xs:w-28">
              {owner.face ? (
                <img src={owner.face} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
              ) : (
                <Music className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-bold tracking-tight xs:text-3xl">{owner.name}</h1>
              <p className="mt-1 text-xs text-muted-foreground">{t("user.scopeDesc")}</p>
            </div>
          </div>
        </div>
        {summary && (
          <div className="grid grid-cols-2 gap-3 border-t p-4 sm:grid-cols-3 xs:p-6 lg:grid-cols-5">
            {[
              ["sumSong", summary.song_count],
              ["sumView", summary.total_view],
              ["sumFavorite", summary.total_favorite],
              ["sumCoin", summary.total_coin],
              ["sumLike", summary.total_like],
            ].map(([k, n]) => (
              <div key={k} className="rounded-xl bg-muted/40 p-3">
                <div className="text-[11px] text-muted-foreground">{t(`user.${k}`)}</div>
                <div className="mt-1 text-base font-bold tabular-nums xs:text-lg">{fmt(n ?? 0)}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border bg-card">
        <div className="border-b bg-muted/30 px-4 py-3 xs:px-6">
          <h2 className="flex items-center gap-2 text-sm font-semibold xs:text-base">
            <PlaySquare className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            {t("user.songsTitle", { n: songs.length })}
          </h2>
        </div>
        <ul className="divide-y">
          {songs.map((s, i) => (
            <li key={s.aid} className="px-4 py-3 xs:px-6">
              <div className="flex items-center gap-3">
                <span className="w-5 shrink-0 text-right text-sm tabular-nums text-muted-foreground/50">{i + 1}</span>
                <div className="h-9 w-14 shrink-0 overflow-hidden rounded bg-muted">
                  {s.pic && (
                    <img
                      src={s.pic}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/video/${s.aid}`}
                    className="block truncate text-sm font-medium transition-colors hover:text-primary hover:underline"
                  >
                    {s.title}
                  </Link>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {s.pubdate ? fmtDate(s.pubdate) : ""}
                    {s.girls?.length > 0 ? ` · ${s.girls.join(" / ")}` : ""}
                  </p>
                  <StaffChips staff={s.staff} />
                </div>
                <div className="flex shrink-0 flex-col items-end gap-0.5">
                  <span className="text-xs font-medium tabular-nums text-foreground/80">
                    {fmt(s.score)}{t("user.pt")}
                  </span>
                  <span className="text-[11px] tabular-nums text-muted-foreground">{fmt(s.view)}</span>
                </div>
              </div>
            </li>
          ))}
          {songs.length === 0 && (
            <li className="px-6 py-10 text-center text-sm text-muted-foreground">{t("user.noSongs")}</li>
          )}
        </ul>
      </section>

      <section className="overflow-hidden rounded-2xl border bg-card">
        <div className="border-b bg-muted/30 px-4 py-3 xs:px-6">
          <h2 className="flex items-center gap-2 text-sm font-semibold xs:text-base">
            <Handshake className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            {t("user.coopVideos", { n: coop.length })}
          </h2>
        </div>
        <ul className="divide-y">
          {coop.map((s, i) => (
            <li key={s.aid} className="flex items-center gap-3 px-4 py-2.5 xs:px-6">
              <span className="w-5 shrink-0 text-right text-sm tabular-nums text-muted-foreground/50">{i + 1}</span>
              <div className="h-9 w-14 shrink-0 overflow-hidden rounded bg-muted">
                {s.pic && (
                  <img
                    src={s.pic}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <Link
                  to={`/video/${s.aid}`}
                  className="block truncate text-sm font-medium transition-colors hover:text-primary hover:underline"
                >
                  {s.title}
                </Link>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {s.role ? t("user.coopRole", { role: s.role }) : t("user.coopBy")}
                  {s.owner?.name ? ` · ${t("user.coopBy")} ${s.owner.name}` : ""}
                  {s.pubdate ? ` · ${fmtDate(s.pubdate)}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-0.5">
                <span className="text-xs font-medium tabular-nums text-foreground/80">
                  {fmt(s.score)}{t("user.pt")}
                </span>
                <span className="text-[11px] tabular-nums text-muted-foreground">{fmt(s.view)}</span>
              </div>
            </li>
          ))}
          {coop.length === 0 && (
            <li className="px-6 py-10 text-center text-sm text-muted-foreground">{t("user.noCoopVideos")}</li>
          )}
        </ul>
      </section>
    </div>
  );
}