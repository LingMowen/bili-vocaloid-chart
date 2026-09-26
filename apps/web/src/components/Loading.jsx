import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

const MIN_MS = 300;
const FADE_MS = 200;

let depth = 0;
let openAt = 0;
let timer = null;
let state = "hidden"; // 'hidden' | 'shown' | 'leaving'
const subs = new Set();

function emit() {
  for (const fn of subs) fn(state);
}

function commitHide() {
  state = "hidden";
  emit();
}

function scheduleHide() {
  const wait = Math.max(0, MIN_MS - (Date.now() - openAt));
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (depth > 0) return;
    state = "leaving";
    emit();
    timer = setTimeout(() => {
      if (depth > 0) return;
      commitHide();
    }, FADE_MS);
  }, wait);
}

export function openLoader() {
  depth += 1;
  if (state === "hidden") {
    state = "shown";
    emit();
  }
  openAt = Date.now();
}

export function closeLoader() {
  depth = Math.max(0, depth - 1);
  if (depth === 0 && (state === "shown" || state === "leaving")) {
    scheduleHide();
  }
}

export function track(promise) {
  openLoader();
  if (promise && typeof promise.finally === "function") {
    return promise.finally(closeLoader);
  }
  return promise;
}

export function getLoadingState() {
  return state;
}

export function subscribeLoader(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

export function Loader({ label, className = "" }) {
  const { t } = useTranslation();
  const resolved = label ?? t("nav.loading");
  return (
    <div className={`flex flex-col items-center justify-center gap-4 ${className}`}>
      <div className="relative h-11 w-11">
        <div className="absolute inset-0 rounded-full border-2 border-primary/15" />
        <div
          className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-primary"
          style={{ animationDuration: "900ms" }}
        />
        <div
          className="absolute inset-1.5 animate-spin rounded-full border-2 border-transparent border-b-primary/60"
          style={{ animationDuration: "1400ms", animationDirection: "reverse" }}
        />
        <span className="absolute inset-0 flex items-center justify-center text-[13px] leading-none text-primary">
          ♪
        </span>
      </div>
      <p className="animate-pulse text-xs text-muted-foreground">{resolved}</p>
    </div>
  );
}

export default function LoadingOverlay() {
  const { t } = useTranslation();
  const [s, setS] = useState(getLoadingState);
  useEffect(() => subscribeLoader(setS), []);
  if (s === "hidden") return null;
  const fading = s === "leaving";
  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-background/60 backdrop-blur-sm transition-opacity duration-200 ${
        fading ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      <div className="flex flex-col items-center rounded-2xl border bg-card/90 px-10 py-8 shadow-lg">
        <Loader label={t("nav.dataLoading")} />
      </div>
    </div>
  );
}