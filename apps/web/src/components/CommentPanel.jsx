import { useCallback, useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useTranslation } from "react-i18next";
import { MessageCircle, Send, Trash2, X } from "lucide-react";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import AuthModal from "./AuthModal.jsx";
import Tip from "./ui/Tip.jsx";

function relTime(ts, t) {
  const diff = Date.now() - ts;
  if (diff < 60 * 1000) return t("comments.justNow");
  if (diff < 3600 * 1000) return t("comments.minAgo", { n: Math.floor(diff / 60000) });
  if (diff < 24 * 3600 * 1000) return t("comments.hourAgo", { n: Math.floor(diff / 3600000) });
  if (diff < 7 * 24 * 3600 * 1000) return t("comments.dayAgo", { n: Math.floor(diff / 86400000) });
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function Avatar({ user, size = "h-9 w-9" }) {
  if (user?.faceimg) {
    return (
      <img src={user.faceimg} alt="" referrerPolicy="no-referrer" className={`${size} shrink-0 rounded-full bg-muted object-cover`} />
    );
  }
  return (
    <span className={`${size} flex shrink-0 items-center justify-center rounded-full bg-muted font-bold text-muted-foreground`}>
      {(user?.nickname || "?").slice(0, 1)}
    </span>
  );
}

export default function CommentPanel({ aid, title }) {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [list, setList] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [content, setContent] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [replyContent, setReplyContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");
  const listRef = useRef(null);

  const load = useCallback(
    async (p) => {
      setLoadingList(true);
      try {
        const d = await api(`/api/video/${aid}/comments?page=${p}&page_size=20`);
        setList((prev) => (p === 1 ? d.list : [...prev, ...d.list]));
        setCount(d.count);
        setPage(p);
        setHasMore(p * d.page_size < d.count);
      } catch (e) {
        setErr(e.message);
      } finally {
        setLoadingList(false);
      }
    },
    [aid],
  );

  useEffect(() => {
    load(1);
  }, [load]);

  useEffect(() => {
    if (open && list.length === 0 && !loadingList) {
      setErr("");
      load(1);
    }
  }, [open, list.length, loadingList, load]);

  async function submit() {
    const text = replyTo ? replyContent : content;
    if (!text.trim()) return;
    setSubmitting(true);
    setErr("");
    try {
      await api(`/api/video/${aid}/comments`, {
        method: "POST",
        body: { content: text.trim(), parent_id: replyTo?.id },
      });
      setContent("");
      setReplyContent("");
      setReplyTo(null);
      await load(1);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(id) {
    try {
      await api(`/api/comments/${id}`, { method: "DELETE" });
      await load(1);
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <>
      <Tip content={t("comments.comment")}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:scale-105 hover:opacity-90"
          aria-label={t("comments.comment")}
        >
          <MessageCircle className="h-5 w-5" />
          {count > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground px-1 text-[10px] font-bold tabular-nums text-background">
              {count > 99 ? "99+" : count}
          </span>
        )}
      </button>
      </Tip>

      <Dialog.Root open={open} onOpenChange={(o) => !o && setOpen(false)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-background shadow-2xl outline-none">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
              <div className="min-w-0">
                <Dialog.Title asChild>
                  <h3 className="text-sm font-bold">{t("comments.comment")}</h3>
                </Dialog.Title>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{title}</p>
              </div>
              <Dialog.Close asChild>
                <Tip content={t("comments.close")}>
                  <button
                    type="button"
                    className="shrink-0 rounded-md p-1.5 text-muted-foreground transition hover:bg-accent hover:text-foreground"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </Tip>
              </Dialog.Close>
            </div>

              <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4">
                {err && <p className="mb-3 text-sm text-destructive">{err}</p>}
                {list.length === 0 && !loadingList ? (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                    <MessageCircle className="h-8 w-8 opacity-50" />
                    {t("comments.emptyHint")}
                  </div>
                ) : (
                  <ul className="space-y-4">
                    {list.map((c) => (
                      <li key={c.id} className="space-y-2">
                        <div className="flex items-start gap-2.5">
                          <Avatar user={c.user} />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              <span className="text-sm font-medium">{c.user.nickname}</span>
                              <span className="text-xs text-muted-foreground">{relTime(c.created_at, t)}</span>
                              {c.reply_count > 0 && (
                                <span className="text-xs text-muted-foreground">{t("comments.replyCount", { n: c.reply_count })}</span>
                              )}
                            </div>
                            <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">
                              {c.content}
                            </p>
                            <div className="mt-1.5 flex items-center gap-3 text-xs">
                              <button
                                type="button"
                                onClick={() => {
                                  setReplyTo(c);
                                  setReplyContent("");
                                }}
                                className="font-medium text-primary hover:underline"
                              >
                                {t("comments.reply")}
                              </button>
                              {user?.id === c.user.id && (
                                <button
                                  type="button"
                                  onClick={() => remove(c.id)}
                                  className="inline-flex items-center gap-0.5 text-muted-foreground transition hover:text-destructive"
                                >
                                  <Trash2 className="h-3 w-3" />
                                  {t("comments.delete")}
                                </button>
                              )}
                            </div>
                            {c.replies?.length > 0 && (
                              <ul className="mt-2 space-y-2 rounded-lg bg-muted/40 p-2.5">
                                {c.replies.map((r) => (
                                  <li key={r.id} className="flex items-start gap-2">
                                    <Avatar user={r.user} size="h-6 w-6 text-[10px]" />
                                    <div className="min-w-0 flex-1">
                                      <div className="flex flex-wrap items-center gap-x-2">
                                        <span className="text-xs font-medium">{r.user.nickname}</span>
                                        <span className="text-[11px] text-muted-foreground">{relTime(r.created_at, t)}</span>
                                      </div>
                                      <p className="mt-0.5 whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground/80">
                                        {r.content}
                                      </p>
                                      <div className="mt-1 flex items-center gap-3 text-[11px]">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setReplyTo(c);
                                            setReplyContent(r.content.startsWith("@") ? `@${r.user.nickname} ` : "");
                                          }}
                                          className="font-medium text-primary hover:underline"
                                        >
                                          {t("comments.reply")}
                                        </button>
                                        {user?.id === r.user.id && (
                                          <button
                                            type="button"
                                            onClick={() => remove(r.id)}
                                            className="inline-flex items-center gap-0.5 text-muted-foreground transition hover:text-destructive"
                                          >
                                            <Trash2 className="h-3 w-3" />
                                            {t("comments.delete")}
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {hasMore && (
                  <button
                    type="button"
                    onClick={() => load(page + 1)}
                    disabled={loadingList}
                    className="mt-4 w-full rounded-lg border py-2 text-center text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-60"
                  >
                    {loadingList ? t("comments.loading") : t("comments.loadMore")}
                  </button>
                )}
              </div>

              <div className="shrink-0 border-t p-4">
                {replyTo && (
                  <div className="mb-2 flex items-center justify-between gap-2 rounded-lg bg-primary/5 px-3 py-1.5 text-xs text-primary">
                    <span className="min-w-0 truncate">{t("comments.replyTo", { name: replyTo.user.nickname })}</span>
                    <Tip content={t("comments.cancelReply")}>
                      <button
                        type="button"
                        onClick={() => setReplyTo(null)}
                        className="shrink-0 rounded p-0.5 hover:bg-primary/10"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </Tip>
                  </div>
                )}
                {user ? (
                  <>
                    <textarea
                      value={replyTo ? replyContent : content}
                      onChange={(e) => (replyTo ? setReplyContent(e.target.value) : setContent(e.target.value))}
                      rows={3}
                      maxLength={1000}
                      placeholder={replyTo ? t("comments.writeReply") : t("comments.writeComment")}
                      className="w-full resize-none rounded-xl border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                    />
                    <button
                      type="button"
                      onClick={submit}
                      disabled={submitting || (!replyTo ? !content.trim() : !replyContent.trim())}
                      className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
                    >
                      <Send className="h-3.5 w-3.5" />
                      {submitting ? t("comments.posting") : replyTo ? t("comments.postReply") : t("comments.postComment")}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAuthOpen(true)}
                    disabled={loading}
                    className="w-full rounded-xl border border-dashed py-2.5 text-center text-sm text-muted-foreground transition hover:border-primary/40 hover:text-foreground disabled:opacity-60"
                  >
                    {t("comments.loginToComment")}
                  </button>
                )}
              </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </>
  );
}