import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import Modal from "./ui/Modal.jsx";
import Tip from "./ui/Tip.jsx";
import BrandIcon, { BRAND_COLORS } from "./BrandIcons.jsx";
import { X, ChevronDown } from "lucide-react";

// 主推的三个渠道，直接展示；其余收进「更多登录方式」
const PRIMARY_OAUTH = ["qq", "wx", "bilibili"];

export default function AuthModal({ open, onClose }) {
  const { t } = useTranslation();
  const { login } = useAuth();
  const OAUTH_LABELS = {
    qq: t("auth.qq"),
    wx: t("auth.wx"),
    bilibili: t("auth.bilibili"),
    alipay: t("auth.alipay"),
    sina: t("auth.sina"),
    baidu: t("auth.baidu"),
    huawei: t("auth.huawei"),
    xiaomi: t("auth.xiaomi"),
    douyin: t("auth.douyin"),
    dingtalk: t("auth.dingtalk"),
  };
  const [oauth, setOauth] = useState([]);
  const [showMore, setShowMore] = useState(false);
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
    setShowMore(false);
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
    <Modal open={open} onClose={onClose} maxWidth="max-w-md">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-bold">{t("auth.loginTitle")}</h3>
        <Tip content={t("auth.close")}>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </Tip>
      </div>

      {/* 只有一个登录方式时不给切换条：单按钮的分段控件看着像多余的大按钮 */}
      {smtpReady && oauth.length > 0 && (
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

      {mode === "oauth" &&
        (() => {
          const rank = (x) => {
            const i = PRIMARY_OAUTH.indexOf(x);
            return i < 0 ? Number.MAX_SAFE_INTEGER : i;
          };
          const sorted = [...oauth].sort((a, b) => rank(a) - rank(b));
          const primary = sorted.filter((x) => rank(x) !== Number.MAX_SAFE_INTEGER);
          const rest = sorted.filter((x) => rank(x) === Number.MAX_SAFE_INTEGER);
          // 图标用品牌色常显：第三方登录按钮的通行做法，识别度远高于单色灰。
          // 颜色通过 --brand 变量传给 Tailwind 任意值类，避免为 10 个渠道各写一套工具类。
          // 主推渠道用竖排卡片：图标在上、文字在下，三列一行放完，比三行通栏更紧凑
          const card = (type) => (
            <button
              key={type}
              onClick={() => startOauth(type)}
              style={{ "--brand": BRAND_COLORS[type] }}
              className="flex min-w-0 flex-col items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-3 text-xs font-medium transition-colors hover:border-[var(--brand)] hover:bg-accent"
            >
              <BrandIcon type={type} className="h-6 w-6 text-[var(--brand)]" />
              <span className="w-full truncate text-center">{OAUTH_LABELS[type] || type}</span>
            </button>
          );
          // 其余渠道用横排小按钮，两列，省高度
          const row = (type) => (
            <button
              key={type}
              onClick={() => startOauth(type)}
              style={{ "--brand": BRAND_COLORS[type] }}
              className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2 text-xs font-medium transition-colors hover:border-[var(--brand)] hover:bg-accent"
            >
              <BrandIcon type={type} className="h-[18px] w-[18px] shrink-0 text-[var(--brand)]" />
              <span className="truncate">{OAUTH_LABELS[type] || type}</span>
            </button>
          );
          return (
            <div className="max-h-[65vh] overflow-y-auto">
              <div className="grid grid-cols-3 gap-2">{primary.map(card)}</div>

              {rest.length > 0 && (
                <>
                  <div className="my-3 flex items-center gap-3">
                    <span className="h-px flex-1 bg-border" />
                    <button
                      type="button"
                      onClick={() => setShowMore((v) => !v)}
                      className="flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {showMore ? t("auth.collapse") : t("auth.more")}
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showMore ? "rotate-180" : ""}`} />
                    </button>
                    <span className="h-px flex-1 bg-border" />
                  </div>
                  {showMore && <div className="grid grid-cols-2 gap-2">{rest.map(row)}</div>}
                </>
              )}

              <p className="pt-3 text-center text-[11px] leading-relaxed text-muted-foreground">
                {t("auth.oauthHint")}
              </p>
            </div>
          );
        })()}

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
