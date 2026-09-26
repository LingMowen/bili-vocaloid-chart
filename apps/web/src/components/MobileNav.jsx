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
  Vote,
  BotMessageSquare,
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
  ["/interaction", "nav.nominate", Vote],
  ["/ai", "nav.ai", BotMessageSquare],
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
  "/interaction",
  "/ai",
  "/about",
  "/random",
  "/tags",
];

export function isSidebarRoute(pathname) {
  if (pathname === "/") return true;
  return SIDEBAR_PREFIXES.some(
    (p) => p !== "/" && (pathname === p || pathname.startsWith(`${p}/`)),
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