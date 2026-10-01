import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { House, CalendarDays, Search, Calculator, CircleUser } from "lucide-react";

// 移动端底部固定 Tab 栏（对齐参考站 vocabili 的移动端结构）。
// 参考站五项为：首页 / 日刊 / 搜索 / 计算器 / ED，
// 本站第五项 ED 改为「我的」（/me 个人界面），其余四项语义一致。
export const BOTTOM_TABS = [
  { to: "/", labelKey: "nav.home", Icon: House, end: true },
  { to: "/rank/daily", labelKey: "nav.rankDaily", Icon: CalendarDays },
  { to: "/search", labelKey: "nav.search", Icon: Search },
  { to: "/calculator", labelKey: "nav.calculator", Icon: Calculator },
  { to: "/me", labelKey: "nav.me", Icon: CircleUser },
];

export default function BottomTabBar() {
  const { t } = useTranslation();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-backdrop-filter:bg-background/80 md:hidden"
      aria-label={t("nav.quickNav")}
    >
      <ul className="flex h-14 items-stretch">
        {BOTTOM_TABS.map(({ to, labelKey, Icon, end }) => (
          <li key={to} className="min-w-0 flex-1">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex h-full flex-col items-center justify-center gap-0.5 text-[11px] transition-colors ${
                  isActive ? "text-foreground" : "text-muted-foreground"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className="h-5 w-5" strokeWidth={isActive ? 2.4 : 1.8} />
                  <span className="max-w-full truncate px-0.5">{t(labelKey)}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
