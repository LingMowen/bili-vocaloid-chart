import { track } from "./components/Loading.jsx";

export const SESS_KEY = "bili-vocaloid-chart-sessdata";
export const TOKEN_KEY = "bili-vocaloid-chart-auth-token";

export function api(path, opts = {}, retries = 180) {
  if (opts.silent) return apiCore(path, opts, retries);
  return track(apiCore(path, opts, retries));
}

async function apiCore(path, opts = {}, retries = 180) {
  const headers = { ...(opts.headers || {}) };
  const sess = localStorage.getItem(SESS_KEY) || "";
  if (sess) headers["X-Sessdata"] = sess;
  const token = localStorage.getItem(TOKEN_KEY) || "";
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (opts.body != null) headers["Content-Type"] = "application/json";
  const r = await fetch(path, {
    method: opts.method || "GET",
    headers,
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) {
    const err = new Error(j.message || `HTTP ${r.status}`);
    if (r.status === 401) err.auth = true;
    throw err;
  }
  if (j.data && j.data.status === "pending") {
    if (retries <= 0) throw new Error("数据采集中，请稍后刷新页面");
    await new Promise((resolve) => setTimeout(resolve, 3500));
    return apiCore(path, opts, retries - 1);
  }
  return j.data;
}

export function fmt(n) {
  if (n == null || Number.isNaN(Number(n))) return "-";
  return Number(n).toLocaleString("en-US");
}

export function fmtShort(n) {
  n = Number(n);
  if (n == null || Number.isNaN(n)) return "-";
  if (n >= 1e8) return (n / 1e8).toFixed(1) + "亿";
  if (n >= 1e4) return (n / 1e4).toFixed(1) + "万";
  return String(n);
}

export function fmtDuration(sec) {
  sec = Number(sec) || 0;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function fmtDate(unix) {
  if (!unix) return "-";
  const d = new Date(unix * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}