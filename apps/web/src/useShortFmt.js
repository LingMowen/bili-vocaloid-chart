import { useTranslation } from "react-i18next";
import { fmt } from "./api.js";

function ke(n, units) {
  n = Number(n);
  if (Number.isNaN(n)) return "-";
  for (const [t, u] of units) {
    if (n >= t) return `${(n / t).toFixed(t >= 1e8 ? 2 : 1).replace(/\.?0+$/, "")}${u}`;
  }
  return fmt(n);
}

export function useShortFmt() {
  const { t } = useTranslation();
  const units = [
    [1e9, t("video.b")],
    [1e8, t("video.yi")],
    [1e4, t("video.wan")],
    [1e3, t("video.k")],
  ];
  return (n) => ke(n, units);
}
