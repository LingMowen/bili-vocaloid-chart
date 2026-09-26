import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import Modal from "./ui/Modal.jsx";
import Tip from "./ui/Tip.jsx";
import { X } from "lucide-react";

function QQIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5"><path d="M3 8.2a7.2 7.2 0 012.1-4.2c1.6-1.5 3.6-2 4.9-1.3.4 2.3-.9 4.6-1.4 6.2l.1 2c.6-.9 1.5-1.6 2.3-1.6 2.1 0 3.8 3.1 3.3 6.7-.3 2.5-1.6 4.5-3.4 5.1-.8.3-1.6.3-2.3.1-2.5-.6-4-2.9-3.4-5.2-.4-.3-.7-.7-.9-1.1-1.9.2-3.1 2.4-2.4 4.4-1.5-1-2.5-3-2.1-5.2C.5 14.4 1 11 3 8.2z" /></svg>
  );
}

function WeChatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5"><path d="M9.4 4C5.4 4 2 6.9 2 10.4c0 1.9 1 3.7 2.7 5-.3 1.2-1 2.4-1.6 3 .1-.4 1-1 1.2-1.4.6.3 1.3.5 2 .6-.8 1.5-2.9 2.5-4.9 2.4 1.9 1.3 4.4 2.1 6.9 2.1 4 0 7.4-2.9 7.4-6.4C16 8.8 13.1 4 9.4 4zM6.4 8.8c-.6 0-1-.5-1-1s.4-1 1-1 1 .4 1 1-.4 1-1 1zm5.9 0c-.6 0-1-.5-1-1s.4-1 1-1 1 .4 1 1-.4 1-1 1zM22 14.1c0-2.7-2.6-4.9-5.9-4.9s-5.9 2.2-5.9 4.9 2.6 4.9 5.9 4.9c.6 0 1.2-.1 1.8-.3l1.8 1-.5-1.5c1.8-1 2.8-2.4 2.8-4.1zm-7.9-1.6c-.4 0-.7-.3-.7-.7s.3-.7.7-.7.7.3.7.7-.3.7-.7.7zm3.9 0c-.4 0-.7-.3-.7-.7s.3-.7.7-.7.7.3.7.7-.3.7-.7.7z" /></svg>
  );
}

export default function AuthModal({ open, onClose }) {
  const { t } = useTranslation();
  const { login } = useAuth();
  const OAUTH_LABELS = { qq: t("auth.qq"), wx: t("auth.wx") };
  const [oauth, setOauth] = useState([]);
  const [smtpReady, setSmtpReady] = useState(false);
  const [mode, setMode] = useState("oauth");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (!open) return;
    setErr("");
    setMsg("");
    api("/api/auth/config", { silent: true })
      .then((c) => {
        setOauth(c.oauth || []);
        setSmtpReady(Boolean(c.smtp));
        setMode(c.oauth?.length ? "oauth" : "email");
      })
      .catch((e) => setErr(e.message));
  }, [open]);

  useEffect(() => {
    if (!countdown) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  function startOauth(type) {
    window.location.href = `/api/auth/oauth/login?type=${type}`;
  }

  async function sendCode() {
    setMsg("");
    setErr("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErr(t("auth.badEmail"));
      return;
    }
    setSending(true);
    try {
      await api("/api/auth/email/code", { method: "POST", body: { email: email.trim() }, silent: true });
      setMsg(t("auth.codeSent"));
      setCountdown(60);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSending(false);
    }
  }

  async function submitEmail(e) {
    e.preventDefault();
    setErr("");
    setMsg("");
    setSubmitting(true);
    try {
      const d = await api("/api/auth/email/login", {
        method: "POST",
        body: { email: email.trim(), code: code.trim() },
        silent: true,
      });
      await login(d.token);
      onClose();
    } catch (er) {
      setErr(er.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-bold">{t("auth.loginTitle")}</h3>
        <Tip content={t("auth.close")}>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </Tip>
      </div>

      {(smtpReady || oauth.length > 0) && (
        <div className="mb-4 flex gap-1 rounded-lg bg-muted p-1">
          {oauth.length > 0 && (
            <button
              onClick={() => setMode("oauth")}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${mode === "oauth" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
            >
              {t("auth.tabOauth")}
            </button>
          )}
          {smtpReady && (
            <button
              onClick={() => setMode("email")}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${mode === "email" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
            >
              {t("auth.tabEmail")}
            </button>
          )}
        </div>
      )}

      {mode === "oauth" && (
        <div className="space-y-2">
          {oauth.map((type) => (
            <button
              key={type}
              onClick={() => startOauth(type)}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium transition-colors hover:border-primary/40 hover:text-primary"
            >
              {type === "qq" ? <QQIcon /> : <WeChatIcon />}
              {OAUTH_LABELS[type] || type}
            </button>
          ))}
          <p className="pt-1 text-center text-[11px] leading-relaxed text-muted-foreground">
            {t("auth.oauthHint")}
          </p>
        </div>
      )}

      {mode === "email" && (
        <form onSubmit={submitEmail} className="space-y-3">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("auth.emailPlaceholder")}
            type="email"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t("auth.codePlaceholder")}
              inputMode="numeric"
              className="min-w-0 flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="button"
              onClick={sendCode}
              disabled={sending || countdown > 0}
              className="shrink-0 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium disabled:opacity-60"
            >
              {countdown > 0 ? `${countdown}s` : sending ? t("auth.sending") : t("auth.sendCode")}
            </button>
          </div>
          <button className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60" disabled={submitting}>
            {submitting ? t("auth.loggingIn") : t("auth.loginRegister")}
          </button>
          <p className="text-center text-[11px] text-muted-foreground">
            {t("auth.autoRegister")}
          </p>
        </form>
      )}

      {msg && <p className="mt-3 text-center text-xs text-chart-2">{msg}</p>}
      {err && <p className="mt-3 text-center text-xs text-destructive">{err}</p>}
    </Modal>
  );
}