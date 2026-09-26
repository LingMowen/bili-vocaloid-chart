import { lazy, Suspense } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AppHeader from "./components/AppHeader.jsx";
import { SideNav, isSidebarRoute } from "./components/MobileNav.jsx";
import LoadingOverlay, { Loader } from "./components/Loading.jsx";
import { AuthProvider, AuthCallback } from "./auth.jsx";

const HomePage = lazy(() => import("./pages/HomePage.jsx"));
const RankPage = lazy(() => import("./pages/RankPage.jsx"));
const SearchPage = lazy(() => import("./pages/SearchPage.jsx"));
const StatsPage = lazy(() => import("./pages/StatsPage.jsx"));
const VideoPage = lazy(() => import("./pages/VideoPage.jsx"));
const TagsPage = lazy(() => import("./pages/TagsPage.jsx"));
const CalculatorPage = lazy(() => import("./pages/CalculatorPage.jsx"));
const FormulaRankingPage = lazy(() => import("./pages/FormulaRankingPage.jsx"));
const AchievementsPage = lazy(() => import("./pages/AchievementsPage.jsx"));
const TodayPage = lazy(() => import("./pages/TodayPage.jsx"));
const InteractionPage = lazy(() => import("./pages/InteractionPage.jsx"));
const AiPage = lazy(() => import("./pages/AiPage.jsx"));
const AboutPage = lazy(() => import("./pages/AboutPage.jsx"));
const RandomPage = lazy(() => import("./pages/RandomPage.jsx"));
const SingersPage = lazy(() => import("./pages/SingersPage.jsx"));
const SingerDetailPage = lazy(() => import("./pages/SingerDetailPage.jsx"));
const UserDetailPage = lazy(() => import("./pages/UserDetailPage.jsx"));

const AppRoutes = () => (
  <Routes>
    <Route path="/" element={<HomePage />} />
    <Route path="/rank/:kind?" element={<RankPage />} />
    <Route path="/rank/:kind/:issue" element={<RankPage />} />
    <Route path="/rank-block/:kind/:issue" element={<RankPage />} />
    <Route path="/search" element={<SearchPage />} />
    <Route path="/stats" element={<StatsPage />} />
    <Route path="/video/:aid" element={<VideoPage />} />
    <Route path="/tags" element={<TagsPage />} />
    <Route path="/singers" element={<SingersPage />} />
    <Route path="/singer/:id" element={<SingerDetailPage />} />
    <Route path="/member/:mid" element={<UserDetailPage />} />
    <Route path="/calculator" element={<CalculatorPage />} />
    <Route path="/formula-ranking" element={<FormulaRankingPage />} />
    <Route path="/achievements" element={<AchievementsPage />} />
    <Route path="/today" element={<TodayPage />} />
    <Route path="/interaction" element={<InteractionPage />} />
    <Route path="/ai" element={<AiPage />} />
    <Route path="/about" element={<AboutPage />} />
    <Route path="/random" element={<RandomPage />} />
    <Route path="/auth/success" element={<AuthCallback />} />
  </Routes>
);

export default function App() {
  const { t } = useTranslation();
  const location = useLocation();
  const withSidebar = isSidebarRoute(location.pathname);
  const pageFallback = <Loader className="py-24" label={t("nav.pageLoading")} />;
  return (
    <AuthProvider>
      <div className="flex h-dvh flex-col bg-muted/40 text-foreground">
        <AppHeader />
        <div className="min-h-0 flex-1 overflow-y-auto">
          {withSidebar ? (
            <div className="mx-auto flex max-w-[1440px] gap-0 px-2 pb-10 pt-4 xs:px-3 md:px-4 md:pb-16 md:pt-4 xl:gap-6 xl:pt-6">
              <aside className="hidden w-44 shrink-0 xl:block">
                <div className="sticky top-4">
                  <SideNav />
                </div>
              </aside>
              <main className="min-w-0 flex-1 space-y-4 md:space-y-6">
                <Suspense fallback={pageFallback}>
                  <AppRoutes />
                </Suspense>
              </main>
            </div>
          ) : (
            <main className="mx-auto w-full max-w-[1440px] space-y-4 px-2 pb-10 pt-4 xs:px-3 md:space-y-6 md:px-4 md:pb-16 md:pt-4 xl:pt-6">
              <Suspense fallback={pageFallback}>
                <AppRoutes />
              </Suspense>
            </main>
          )}
        </div>
        <LoadingOverlay />
      </div>
    </AuthProvider>
  );
}