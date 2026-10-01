import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  LogIn,
  LogOut,
  User,
  Sun,
  Moon,
  Check,
  MessageSquare,
  CornerDownRight,
  ChevronRight,
  BookOpen,
  Trophy,
  BarChart3,
  Home,
} from "lucide-react";
import { useAuth } from "../auth.jsx";
import { useTheme } from "../useTheme.js";
import { setLang } from "../i18n/index.js";
import { api } from "../api.js";
import AuthModal from "../components/AuthModal.jsx";

// 登录渠道显示名（cc云聚合登录，10 个渠道全开）
const PROVIDER_LABEL = {
  qq: "QQ",
  wx: "WeChat",
  alipay: "Alipay",
  sina: "Weibo",
  baidu: "Baidu",
  huawei: "Huawei",
  xiaomi: "Xiaomi",
  douyin: "Douyin",
  bilibili: "Bilibili",
  dingtalk: "DingTalk",
  email: "Email",
};

function fmtDateTime(ms) {
  if (!ms) return "-";
  const d = new Date(Number(ms));
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function Section({ title, children }) {
  return (
    <section className="rounded-xl border bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function MoreLink({ to, icon: Icon, label }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-lg px-2 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <ChevronRight className="h-4 w-4 shrink-0 opacity-60" />
    </Link>
  );
}

export default function MePage() {
  const { t, i18n } = useTranslation();
  const { user, loading, logout } = useAuth();
  const [theme, setTheme] = useTheme();
  const [authOpen, setAuthOpen] = useState(false);
  const [comments, setComments] = useState(null);
  const [commentErr, setCommentErr] = useState("");
  const lang = i18n.language;

  useEffect(() => {
    if (!user) {
      setComments(null);
      setCommentErr("");
      return;
    }
    let alive = true;
    setComments(null);
    api("/api/me/comments?page_size=20", { silent: true })
      .then((d) => {
        if (alive) setComments(d?.list || []);
      })
      .catch((e) => {
        if (!alive) return;
        setCommentErr(e?.message || t("me.commentsLoadFailed"));
        setComments([]);
      });
    return () => {
      alive = false;
    };
  }, [user, t]);

  return (
    <div className="mx-auto w-full max-w-[640px] space-y-4">
      <h1 className="px-1 text-lg font-semibold">{t("me.title")}</h1>

      {/* 账户卡：未登录给登录入口，已登录给资料 + 退出 */}
      <section className="rounded-xl border bg-card p-4">
        {user ? (
          <div className="flex items-center gap-3">
            {user.faceimg ? (
              <img
                src={user.faceimg}
                alt=""
                referrerPolicy="no-referrer"
                className="h-14 w-14 shrink-0 rounded-full bg-muted object-cover"
              />
            ) : (
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <User className="h-6 w-6" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{user.nickname}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                <span className="rounded-full border px-2 py-0.5">
                  {PROVIDER_LABEL[user.provider] || user.provider}
                </span>
                <span>
                  {t("me.joinedAt")} {fmtDateTime(user.created_at)}
                </span>
              </p>
            </div>
            <button
              type="button"
              onClick={logout}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
            >
              <LogOut className="h-3.5 w-3.5" />
              {t("nav.logout")}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <User className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{t("me.notLoggedIn")}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{t("me.loginHint")}</p>
            </div>
            <button
              type="button"
              disabled={loading}
              onClick={() => setAuthOpen(true)}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
            >
              <LogIn className="h-3.5 w-3.5" />
              {t("nav.login")}
            </button>
          </div>
        )}
      </section>

      {/* 我的评论：仅登录后展示 */}
      {user && (
        <Section title={t("me.myComments")}>
          {comments === null ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("me.loadingComments")}</p>
          ) : comments.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {commentErr || t("me.commentsEmpty")}
            </p>
          ) : (
            <ul className="space-y-2.5">
              {comments.map((c) => (
                <li key={c.id} className="rounded-lg border bg-background/60 p-3">
                  <Link
                    to={`/video/${c.aid}`}
                    className="flex items-start gap-2 text-sm font-medium hover:text-primary"
                  >
                    {c.parent_id ? (
                      <CornerDownRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <span className="min-w-0 flex-1 truncate">
                      {c.video_title || `${t("me.unknownVideo")} · av${c.aid}`}
                    </span>
                  </Link>
                  <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                    {c.content}
                  </p>
                  <p className="mt-1.5 text-xs text-muted-foreground/70">{fmtDateTime(c.created_at)}</p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {/* 外观：移动端头部不再放主题按钮，改由本页提供 */}
      <Section title={t("me.appearance")}>
        <div className="flex gap-2">
          {[
            ["light", t("me.themeLight"), Sun],
            ["dark", t("me.themeDark"), Moon],
          ].map(([val, label, Icon]) => (
            <button
              key={val}
              type="button"
              onClick={() => setTheme(val)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                theme === val ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </Section>

      <Section title={t("me.language")}>
        <div className="flex gap-2">
          {[
            ["zh", "简体中文"],
            ["en", "English"],
          ].map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => setLang(val)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                lang.startsWith(val) ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent"
              }`}
            >
              {label}
              {lang.startsWith(val) && <Check className="h-4 w-4" />}
            </button>
          ))}
        </div>
      </Section>

      <Section title={t("me.more")}>
        <nav className="space-y-0.5">
          <MoreLink to="/" icon={Home} label={t("nav.home")} />
          <MoreLink to="/achievements" icon={Trophy} label={t("nav.achievements")} />
          <MoreLink to="/stats" icon={BarChart3} label={t("nav.stats")} />
          <MoreLink to="/about" icon={BookOpen} label={t("nav.about")} />
        </nav>
      </Section>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  );
}
