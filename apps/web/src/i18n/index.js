import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import zhNav from "./locales/zh/nav.json";
import enNav from "./locales/en/nav.json";
import zhCommon from "./locales/zh/common.json";
import enCommon from "./locales/en/common.json";
import zhVideo from "./locales/zh/video.json";
import enVideo from "./locales/en/video.json";
import zhRank from "./locales/zh/rank.json";
import enRank from "./locales/en/rank.json";
import zhHome from "./locales/zh/home.json";
import enHome from "./locales/en/home.json";
import zhStats from "./locales/zh/stats.json";
import enStats from "./locales/en/stats.json";
import zhSearch from "./locales/zh/search.json";
import enSearch from "./locales/en/search.json";
import zhTags from "./locales/zh/tags.json";
import enTags from "./locales/en/tags.json";
import zhCalculator from "./locales/zh/calculator.json";
import enCalculator from "./locales/en/calculator.json";
import zhCalculatorDisplay from "./locales/zh/calculatorDisplay.json";
import enCalculatorDisplay from "./locales/en/calculatorDisplay.json";
import zhData from "./locales/zh/data.json";
import enData from "./locales/en/data.json";
import zhFormula from "./locales/zh/formula.json";
import enFormula from "./locales/en/formula.json";
import zhAchievements from "./locales/zh/achievements.json";
import enAchievements from "./locales/en/achievements.json";
import zhToday from "./locales/zh/today.json";
import enToday from "./locales/en/today.json";
import zhSingers from "./locales/zh/singers.json";
import enSingers from "./locales/en/singers.json";
import zhSinger from "./locales/zh/singer.json";
import enSinger from "./locales/en/singer.json";
import zhRandom from "./locales/zh/random.json";
import enRandom from "./locales/en/random.json";
import zhAbout from "./locales/zh/about.json";
import enAbout from "./locales/en/about.json";
import zhComments from "./locales/zh/comments.json";
import enComments from "./locales/en/comments.json";
import zhAuth from "./locales/zh/auth.json";
import enAuth from "./locales/en/auth.json";
import zhUser from "./locales/zh/user.json";
import enUser from "./locales/en/user.json";
import zhMe from "./locales/zh/me.json";
import enMe from "./locales/en/me.json";

export const LANG_KEY = "bili-vocaloid-chart-lang";

const resources = {
  zh: {
    common: zhCommon,
    nav: zhNav,
    video: zhVideo,
    rank: zhRank,
    home: zhHome,
    stats: zhStats,
    search: zhSearch,
    tags: zhTags,
    calculator: zhCalculator,
    calculatorDisplay: zhCalculatorDisplay,
    data: zhData,
    formula: zhFormula,
    achievements: zhAchievements,
    today: zhToday,
    singers: zhSingers,
    singer: zhSinger,
    random: zhRandom,
    about: zhAbout,
    comments: zhComments,
    auth: zhAuth,
    user: zhUser,
    me: zhMe,
  },
  en: {
    common: enCommon,
    nav: enNav,
    video: enVideo,
    rank: enRank,
    home: enHome,
    stats: enStats,
    search: enSearch,
    tags: enTags,
    calculator: enCalculator,
    calculatorDisplay: enCalculatorDisplay,
    data: enData,
    formula: enFormula,
    achievements: enAchievements,
    today: enToday,
    singers: enSingers,
    singer: enSinger,
    random: enRandom,
    about: enAbout,
    comments: enComments,
    auth: enAuth,
    user: enUser,
    me: enMe,
  },
};

export function detectLang() {
  const saved = localStorage.getItem(LANG_KEY);
  if (saved === "zh" || saved === "en") return saved;
  return navigator.language && navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
}

i18n.use(initReactI18next).init({
  resources,
  lng: detectLang(),
  fallbackLng: "zh",
  defaultNS: "common",
  nsSeparator: ".",
  keySeparator: false,
  interpolation: { escapeValue: false },
});

export function setLang(lang) {
  localStorage.setItem(LANG_KEY, lang);
  i18n.changeLanguage(lang);
}

export default i18n;
