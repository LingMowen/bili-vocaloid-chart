import { useState } from "react";
import { createPortal } from "react-dom";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Menu, X, ChevronDown, Search, User, Globe, Check, LogIn } from "lucide-react";
import { useTheme } from "../useTheme.js";
import { useAuth } from "../auth.jsx";
import AuthModal from "./AuthModal.jsx";
import { setLang } from "../i18n/index.js";
import PopoverMenu from "./ui/Popover.jsx";
import Tip from "./ui/Tip.jsx";

const NAV = [
  {
    labelKey: "nav.rank",
    children: [
      ["/rank/daily", "nav.rankDaily"],
      ["/rank/weekly", "nav.rankWeekly"],
      ["/rank/monthly", "nav.rankMonthly"],
      ["/rank/annual", "nav.rankAnnual"],
      ["/singers", "nav.singers"],
    ],
  },
  {
    labelKey: "nav.tools",
    children: [
      ["/achievements", "nav.achievements"],
      ["/calculator", "nav.calculator"],
      ["/formula-ranking", "nav.formulaRanking"],
      ["/stats", "nav.stats"],
      ["/random", "nav.random"],
      ["/today", "nav.today"],
      ["/ai", "nav.ai"],
    ],
  },
  { labelKey: "nav.tags", to: "/tags" },
  {
    labelKey: "nav.interaction",
    children: [
      ["/interaction", "nav.songRequest"],
      ["/interaction?tab=nominate", "nav.nominate"],
      ["/interaction?tab=avatar", "nav.avatarSubmit"],
    ],
  },
];

function Moon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />
    </svg>
  );
}

function Sun({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4" />
    </svg>
  );
}

const DRAWER_GROUPS = [
  {
    titleKey: "nav.navGroupRank",
    items: [
      ["/rank/daily", "nav.rankDaily"],
      ["/rank/weekly", "nav.rankWeekly"],
      ["/rank/monthly", "nav.rankMonthly"],
      ["/rank/annual", "nav.rankAnnual"],
      ["/singers", "nav.singers"],
    ],
  },
  {
    titleKey: "nav.navGroupTools",
    items: [
      ["/achievements", "nav.achievements"],
      ["/calculator", "nav.calculator"],
      ["/formula-ranking", "nav.formulaRanking"],
      ["/stats", "nav.stats"],
      ["/random", "nav.random"],
      ["/tags", "nav.tags"],
      ["/today", "nav.today"],
      ["/ai", "nav.ai"],
    ],
  },
  {
    titleKey: "nav.navGroupInteract",
    items: [
      ["/interaction", "nav.songRequest"],
      ["/interaction?tab=nominate", "nav.nominate"],
      ["/interaction?tab=avatar", "nav.avatarSubmit"],
      ["/about", "nav.about"],
    ],
  },
];

function MobileNavDrawer({ open, onClose, onLogin }) {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  return createPortal(
    <>
      <button
        type="button"
        onClick={onClose}
        className="fixed inset-0 z-[60] bg-black/45 xl:hidden"
        aria-label={t("nav.close")}
      />
      <aside className="fixed left-0 top-0 z-[61] flex h-dvh w-[82vw] max-w-80 flex-col overflow-y-auto border-r bg-background p-4 shadow-xl xl:hidden">
        <div className="mb-4 flex items-center justify-between">
          <Link to="/" onClick={onClose} className="text-sm font-semibold">
            虚拟歌手榜单
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 transition hover:bg-accent"
            aria-label={t("nav.close")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4 text-sm">
          {user ? (
            <div className="flex items-center gap-3 rounded-lg border bg-card p-2.5">
              {user.faceimg ? (
                <img
                  src={user.faceimg}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="h-10 w-10 shrink-0 rounded-full bg-muted object-cover"
                />
              ) : (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted font-bold text-muted-foreground">
                  <User className="h-4 w-4" />
                </span>
              )}
              <span className="min-w-0 truncate font-medium">{user.nickname}</span>
            </div>
          ) : (
            <button
              type="button"
              disabled={loading}
              onClick={onLogin}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
            >
              <LogIn className="h-4 w-4" />
              {t("nav.loginOrRegister")}
            </button>
          )}

          <Link
            to="/search"
            onClick={onClose}
            className="flex items-center gap-2.5 rounded-lg border bg-card px-3 py-2.5 font-medium"
          >
            <Search className="h-4 w-4" />
            {t("nav.search")}
          </Link>

          <div className="rounded-lg border bg-card p-2">
            <Link
              to="/"
              end
              onClick={onClose}
              className="block rounded-md px-2 py-2 font-medium text-foreground transition hover:bg-accent"
            >
              {t("nav.home")}
            </Link>
          </div>

          {DRAWER_GROUPS.map((g) => (
            <section className="rounded-lg border bg-card p-2" key={g.titleKey}>
              <p className="mb-1 px-2 text-xs font-medium text-muted-foreground">{t(g.titleKey)}</p>
              {g.items.map(([to, labelKey]) => (
                <Link
                  key={to + labelKey}
                  to={to}
                  onClick={onClose}
                  className="block rounded-md px-2 py-2 text-muted-foreground transition hover:bg-accent hover:text-foreground"
                >
                  {t(labelKey)}
                </Link>
              ))}
            </section>
          ))}
        </div>
      </aside>
    </>,
    document.body,
  );
}

export default function AppHeader() {
  const { t } = useTranslation();
  const { i18n } = useTranslation();
  const [theme, setTheme] = useTheme();
  const { user, loading, logout } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [dropdown, setDropdown] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const lang = i18n.language;

  const parentActive = (children) =>
    children.some(([to]) => {
      const [base] = to.split("?");
      if (to.includes("?")) return location.pathname === base && location.search.includes(to.split("?")[1]);
      return location.pathname === base;
    });

  const closeDropdown = () => setDropdown("");

  return (
    <header className="relative z-40 shrink-0 border-b bg-background/90 backdrop-blur supports-backdrop-filter:bg-background/70">
      <div className="relative mx-auto flex h-14 w-full max-w-7xl items-center px-3 sm:px-4">
        <button
          onClick={() => setDrawerOpen(true)}
          className="rounded-md p-2 transition -ml-1 text-foreground hover:bg-accent xl:hidden"
          aria-label={t("nav.menu")}
          aria-expanded={drawerOpen}
        >
          <Menu className="h-5 w-5" />
        </button>

        <Link to="/" className="flex shrink-0 items-center gap-2 text-base font-semibold">
          <img
            src="/favicon.svg"
            alt=""
            className="h-6 w-6 rounded-md object-cover"
            onError={(e) => (e.currentTarget.style.display = "none")}
          />
          <span className="hidden truncate font-bold sm:block">虚拟歌手榜单</span>
        </Link>

        <nav className="hidden items-center gap-0.5 xl:absolute xl:left-1/2 xl:flex xl:-translate-x-1/2 xl:gap-1">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `group relative rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
                isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              }`
            }
          >
            {({ isActive }) => (
              <>
                {t("nav.home")}
                <span
                  className={`absolute inset-x-2.5 -bottom-0.5 h-0.5 rounded-full bg-primary transition-opacity ${
                    isActive ? "opacity-100" : "opacity-0"
                  }`}
                />
              </>
            )}
          </NavLink>
          {NAV.map((item) =>
            item.children ? (
              <div
                key={item.labelKey}
                className="group relative"
                onMouseEnter={() => item.children && setDropdown(item.labelKey)}
                onMouseLeave={closeDropdown}
              >
                <button
                  onClick={() =>
                    setDropdown((d) => (d === item.labelKey ? "" : item.labelKey))
                  }
                  aria-haspopup="menu"
                  aria-expanded={dropdown === item.labelKey}
                  className={`flex items-center gap-0.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
                    parentActive(item.children) || dropdown === item.labelKey
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t(item.labelKey)}
                  <ChevronDown
                    className={`h-4 w-4 transition-transform duration-200 ${
                      dropdown === item.labelKey ? "rotate-180" : ""
                    }`}
                  />
                </button>
                <span
                  className={`pointer-events-none absolute inset-x-2.5 -bottom-0.5 h-0.5 rounded-full bg-primary transition-opacity ${
                    parentActive(item.children) ? "opacity-100" : "opacity-0"
                  }`}
                />
                {dropdown === item.labelKey && (
                  <div className="absolute left-0 top-full z-50 mt-2 min-w-40 rounded-xl border bg-popover/95 p-1.5 shadow-lg backdrop-blur">
                    {item.children.map(([to, labelKey]) => {
                      const [base, q] = to.split("?");
                      const activeHere = q
                        ? location.pathname === base && location.search.includes(q)
                        : location.pathname === base;
                      return (
                        <Link
                          key={labelKey}
                          to={to}
                          onClick={closeDropdown}
                          className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                            activeHere
                              ? "bg-primary/10 font-medium text-primary"
                              : "text-muted-foreground hover:bg-accent hover:text-foreground"
                          }`}
                        >
                          {t(labelKey)}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <NavLink
                key={item.labelKey}
                to={item.to}
                className={({ isActive }) =>
                  `group relative rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
                    isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {t(item.labelKey)}
                    <span
                      className={`absolute inset-x-2.5 -bottom-0.5 h-0.5 rounded-full bg-primary transition-opacity ${
                        isActive ? "opacity-100" : "opacity-0"
                      }`}
                    />
                  </>
                )}
              </NavLink>
            ),
          )}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1.5">
          <Tip content={t("nav.search")}>
            <Link
              to="/search"
              className="rounded-md p-1.5 text-muted-foreground transition hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary sm:p-2"
              aria-label={t("nav.search")}
            >
              <Search className="h-5 w-5" />
            </Link>
          </Tip>
          <Tip content={t("nav.theme")}>
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="rounded-md p-1.5 text-muted-foreground transition hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary sm:p-2"
              aria-label={t("nav.theme")}
            >
              {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
          </Tip>

          <PopoverMenu
            trigger={
              <Tip content="Language">
                <button className="rounded-md p-1.5 text-muted-foreground transition hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary sm:p-2">
                  <Globe className="h-5 w-5" />
                </button>
              </Tip>
            }
            className="w-32 p-1"
          >
            {["zh", "en"].map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <span>{l === "zh" ? "简体中文" : "English"}</span>
                {lang.startsWith(l) && <Check className="h-4 w-4" />}
              </button>
            ))}
          </PopoverMenu>

          {user ? (
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen((v) => !v)}
                className="flex items-center gap-2 rounded-md px-2 py-1 text-sm font-medium transition hover:bg-accent/60 focus-visible:outline-2 focus-visible:outline-primary"
              >
                {user.faceimg ? (
                  <img
                    src={user.faceimg}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="h-7 w-7 rounded-full bg-muted object-cover"
                  />
                ) : (
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted font-bold text-muted-foreground">
                    <User className="h-3.5 w-3.5" />
                  </span>
                )}
                <span className="hidden max-w-24 truncate sm:block">{user.nickname}</span>
              </button>
              {userMenuOpen && (
                <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-lg border bg-popover p-2 shadow-lg">
                  <p className="truncate px-2 py-1 text-sm font-medium">{user.nickname}</p>
                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                      logout();
                      navigate("/");
                    }}
                    className="mt-1 w-full rounded-md px-2.5 py-2 text-left text-sm text-destructive hover:bg-accent"
                  >
                    {t("nav.logout")}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => setAuthOpen(true)}
              disabled={loading}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {loading ? "…" : t("nav.login")}
            </button>
          )}
        </div>
      </div>

      {drawerOpen && (
        <MobileNavDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} onLogin={() => setAuthOpen(true)} />
      )}

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </header>
  );
}