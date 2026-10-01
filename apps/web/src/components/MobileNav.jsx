import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  CalendarDays,
  Calendar,
  CalendarRange,
  Award,
  Calculator,
  BarChart3,
  Trophy,
  CalendarClock,
  BookOpen,
  Shuffle,
  MicVocal,
} from "lucide-react";

export const QUICK_NAV = [
  ["/rank/daily", "nav.rankDaily", CalendarDays],
  ["/rank/weekly", "nav.rankWeekly", Calendar],
  ["/rank/monthly", "nav.rankMonthly", CalendarRange],
  ["/rank/annual", "nav.rankAnnual", Award],
  ["/singers", "nav.singers", MicVocal],
  ["/calculator", "nav.calculator", Calculator],
  ["/stats", "nav.stats", BarChart3],
  ["/achievements", "nav.achievements", Trophy],
  ["/today", "nav.today", CalendarClock],
  ["/about", "nav.about", BookOpen],
  ["/random", "nav.random", Shuffle],
];

export const SIDEBAR_PREFIXES = [
  "/",
  "/rank",
  "/rank-block",
  "/search",
  "/singers",
  "/calculator",
  "/stats",
  "/achievements",
  "/today",
  "/about",
  "/random",
  "/tags",
];

// 2026-09-30（用户拍板）：凡是【能从侧边栏点进去的页面】都必须显示侧边栏。
// 即 SIDEBAR_PREFIXES 与 QUICK_NAV 必须保持一致——QUICK_NAV 里出现的路由一律要在
// SIDEBAR_PREFIXES 中，否则会出现「侧边栏能进、进去后侧边栏消失」的跳变。
// 此前曾为对齐 vocabili 榜单页（其榜单页无左栏）而把 /rank 排除，已按用户要求撤回。
export function isSidebarRoute(pathname) {
  if (pathname === "/") return true;
  // QUICK_NAV 里能点到的路由，其一级前缀自动纳入，保证「侧边栏能进 ⇒ 进去后还在」
  const prefixes = new Set([
    ...SIDEBAR_PREFIXES,
    ...QUICK_NAV.map(([to]) => `/${String(to).split("/")[1]}`),
  ]);
  return [...prefixes].some(
    (p) => p && p !== "/" && (pathname === p || pathname.startsWith(`${p}/`)),
  );
}

export function SideNav() {
  const { t } = useTranslation();
  return (
    <nav className="space-y-0.5">
      <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">
        {t("nav.quickNav")}
      </p>
      {QUICK_NAV.map(([to, label, Icon]) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`
          }
        >
          {({ isActive }) => (
            <>
              <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-primary" : ""}`} />
              <span className="truncate">{t(label)}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}