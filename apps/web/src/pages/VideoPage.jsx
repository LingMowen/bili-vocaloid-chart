import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { api, fmt, fmtDate } from "../api.js";
import CommentPanel from "../components/CommentPanel.jsx";
import Modal from "../components/ui/Modal.jsx";
import CheckboxField from "../components/ui/CheckboxField.jsx";
import Tip from "../components/ui/Tip.jsx";
import { qk } from "../queryKeys.js";
import { Loader } from "../components/Loading.jsx";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Calendar,
  Clock,
  Crown,
  ExternalLink,
  Flame,
  Lock,
  MessageCircle,
  MessageSquare,
  Play,
  Plus,
  Star,
  Tag,
  Target,
  ThumbsUp,
  TrendingDown,
  TrendingUp,
  Trophy,
} from "lucide-react";
import * as echarts from "echarts";

const STAT_KEYS = ["view", "favorite", "coin", "like", "danmaku", "reply", "share"];
const WEIGHTS = {
  view: 1,
  favorite: 4,
  coin: 5,
  like: 2,
  danmaku: 1,
  reply: 1.5,
  share: 3,
};
const METRIC_META = [
  ["rank", "video.rank", "#ef4444"],
  ["score", "video.score", "#8b5cf6"],
  ["view", "video.view", "#2563eb"],
  ["favorite", "video.favorite", "#ea580c"],
  ["coin", "video.coin", "#ca8a04"],
  ["like", "video.like", "#e11d48"],
  ["danmaku", "video.danmaku", "#9333ea"],
  ["reply", "video.reply", "#0891b2"],
  ["share", "video.share", "#16a34a"],
];
const METRIC_COLORS = Object.fromEntries(METRIC_META.map(([k, , c]) => [k, c]));
const LIVE_CLASSES = [
  "text-blue-600 dark:text-blue-400",
  "text-orange-600 dark:text-orange-400",
  "text-yellow-600 dark:text-yellow-400",
  "text-rose-600 dark:text-rose-400",
  "text-purple-600 dark:text-purple-400",
  "text-cyan-600 dark:text-cyan-400",
  "text-green-600 dark:text-green-400",
];
const RANK_LIKE_COLS = new Set(["rank", "issue"]);

// 关联作品类型徽章样式
const RELATED_TYPE_STYLE = {
  series: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  cover: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  original: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  album: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
};

/* ---- 原站刻度工具移植：q/ke/ba/Ct/St/Mt/wa ---- */
const q = (t) => Math.log10(t);
function ke(n, units) {
  n = Number(n);
  if (Number.isNaN(n)) return "-";
  for (const [t, u] of units) {
    if (n >= t) return `${(n / t).toFixed(t >= 1e8 ? 2 : 1).replace(/\.?0+$/, "")}${u}`;
  }
  return fmt(n);
}
function linAxis(vals) {
  const mn = Math.min(...vals);
  const mx = Math.max(...vals);
  const rng = mx - mn || 1;
  let R = mn - rng * 0.5;
  const S = mx + rng * 0.5;
  if (R < S * 0.08) R = 0;
  return [R, S];
}
function st(v) {
  const n = v / 5;
  const s = Math.pow(10, Math.floor(Math.log10(n)));
  const o = n / s;
  if (o <= 1.5) return s;
  if (o <= 3.5) return s * 2;
  if (o <= 7.5) return s * 5;
  return s * 10;
}
function mkVals(lo, hi, step) {
  const arr = [];
  const o = Math.ceil(lo / step - 0.001) * step;
  for (let a = o; a <= hi + step * 0.001; a += step) {
    arr.push(parseFloat(a.toFixed(10)));
  }
  return arr;
}
function niceAxis(min, max, forceInt = false) {
  const r = max - min;
  if (r <= 0) return { ticks: [min], step: 1 };
  for (const c of [5, 4, 6, 3, 7]) {
    let step = st(r / c);
    if (forceInt && step < 1) step = 1;
    const ticks = mkVals(min, max, step);
    const diff = ticks.length / c;
    if (Math.abs(diff - 1) <= Math.min(0.1, 0.6 / c)) {
      return { ticks, step };
    }
  }
  const step = st(r / 5);
  return { ticks: mkVals(min, max, step), step };
}
function hlines(ax) {
  const r = ax.axisMax - ax.axisMin;
  if (r <= 0) return [];
  const n = r * 0.02;
  if (ax.mode === "log") {
    return (ax.logTicks || []).filter((s) => q(s) > ax.axisMin + n && q(s) < ax.axisMax - n).map((s) => ({ yAxis: q(s) }));
  }
  return (ax.ticks || []).filter((s) => s > ax.axisMin + n && s < ax.axisMax - n).map((s) => ({ yAxis: s }));
}

function StatCard({ icon: Icon, label, value, sub, trend, highlight }) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl border bg-card p-4 transition-colors whitespace-nowrap ${
        highlight ? "border-yellow-300 bg-yellow-50/50 dark:border-yellow-700 dark:bg-yellow-950/30" : ""
      }`}
    >
      {Icon && (
        <div className={`mb-2 inline-flex rounded-lg p-2 ${highlight ? "bg-yellow-200/60 text-yellow-700 dark:bg-yellow-800/40 dark:text-yellow-300" : "bg-muted text-muted-foreground"}`}>
          <Icon className="h-4 w-4" />
        </div>
      )}
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <Tip content={String(value)}>
        <div
          className={`mt-1 min-w-0 font-bold tabular-nums text-[clamp(1rem,2.3cqw,1.5rem)] ${
            highlight ? "text-yellow-700 dark:text-yellow-300" : "text-foreground"
          }`}
        >
          {value}
        </div>
      </Tip>
      {(sub || trend) && (
        <div
          className={`mt-1 flex min-w-0 items-center gap-1 text-xs ${
            trend === "up"
              ? "text-rose-500 dark:text-rose-400"
              : trend === "down"
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-muted-foreground"
          }`}
        >
          {trend === "up" && <TrendingUp className="h-3 w-3 shrink-0" />}
          {trend === "down" && <TrendingDown className="h-3 w-3 shrink-0" />}
          <span className="min-w-0 truncate">{sub}</span>
        </div>
      )}
    </div>
  );
}

function RankChart({ records, active, log, labels }) {
  const ref = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || records.length === 0) return;
    chartRef.current = echarts.init(el);
    const ro = new ResizeObserver(() => chartRef.current?.resize());
    ro.observe(el);
    return () => {
      ro.disconnect();
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const c = chartRef.current;
    if (!c || active.length === 0) return;
    // X 轴必须旧→新（时间从左到右递增）。records 的方向取决于接口，不能盲目 reverse，
    // 按日期/期号升序排序保证任何数据方向下轴都正确
    const points = [...records].sort((a, b) => {
      const da = a.date || "", db = b.date || "";
      if (da !== db) return da < db ? -1 : 1;
      return Number(a.issue || 0) - Number(b.issue || 0);
    });
    const x = points.map((r) => (r.date ? r.date : `#${r.issue}`));
    const keys = METRIC_META.map(([k]) => k).filter((k) => active.includes(k));
    const yData = (k) => points.map((r) => (k === "rank" ? r.rank : r[k])).filter((v) => v != null);
    const yAxis = keys.map((k, m) => {
      const color = METRIC_COLORS[k] || "#b45309";
      const isRank = k === "rank";
      const vals = yData(k);
      let info = null;
      if (isRank) {
        // 排名轴：min=1（最好名次）、inverse 反向。自选均匀 step 并让 axisMax 恰为 1+n*step，
        // 刻度(1, 1+step, ...) 完全均匀；ECharts 只消费 min/max/interval，ticks 仅作参考线用不上
        const mx = vals.length ? Math.max(...vals) : 10;
        const span = Math.max(mx - 1, 9);
        const raw = span / 5;
        const pow = Math.pow(10, Math.floor(Math.log10(raw)));
        let step = pow;
        for (const m of [1, 2, 2.5, 5, 10]) {
          step = m * pow;
          if (span / step <= 8) break;
        }
        if (step < 1) step = 1;
        const axisMax = 1 + Math.ceil(span / step) * step;
        info = { mode: "rank", axisMin: 1, axisMax, step, ticks: [] };
      } else if (log) {
        const mn = vals.length ? Math.min(...vals.filter((v) => v > 0)) : 1;
        const mx = vals.length ? Math.max(...vals) : 10;
        const s = Math.max(1, mn);
        const o = Math.max(s * 1.1, mx);
        const loP = Math.floor(Math.log10(s));
        const hiP = Math.ceil(Math.log10(o));
        let kk = [];
        for (let u = loP; u <= hiP; u++) {
          for (const d of [1, 2, 5]) {
            const x = d * Math.pow(10, u);
            if (x >= s * 0.9 && x <= o * 1.1) kk.push(x);
          }
        }
        kk = [...new Set(kk)].sort((a, b) => a - b);
        const S = kk.length ? kk[0] : s;
        const R = kk.length ? kk[kk.length - 1] : o;
        const O = q(R) - q(S) || 1;
        const L = O * 0.05;
        const A = O * 0.2;
        let lo = q(S) - A;
        let hi = q(R) + L;
        if (q(mn) < lo) lo = q(mn) - A;
        if (q(mx) > hi) hi = q(mx) + L;
        lo = Math.max(0, lo);
        info = { mode: "log", axisMin: lo, axisMax: hi, logTicks: kk };
      } else if (vals.length > 1) {
        const [R, S] = linAxis(vals);
        const { ticks, step } = niceAxis(R, S, vals.every((v) => Number.isInteger(v)));
        info = { mode: "linear", axisMin: R, axisMax: S, ticks, step };
      }
      const ax = {
        type: info?.mode === "log" ? "log" : "value",
        logBase: 10,
        name: labels[k],
        nameTextStyle: { color, fontWeight: "bold" },
        position: m === 0 ? "left" : "right",
        offset: 0,
        show: m < 2,
        inverse: isRank,
        min: info?.axisMin,
        max: info?.axisMax,
        interval: isRank && info?.step ? info.step : undefined,
        axisLine: m < 2 ? { show: true, lineStyle: { color: `${color}80` } } : { show: false },
        splitLine: { show: false },
        nameLocation: isRank ? "start" : "end",
        axisTick: m < 2 ? { show: true, lineStyle: { color: `${color}80` } } : { show: false },
        axisLabel:
          m < 2
            ? {
                color: `${color}cc`,
                fontSize: 10,
                formatter: (v) => {
                  if (isRank) return fmt(v);
                  if (log) return v > 0 ? `1e${Math.round(q(v))}` : "";
                  return ke(v, labels._units);
                },
              }
            : { show: false },
      };
      if (m === 0 && info) {
        const lines = hlines(info);
        if (lines.length) {
          ax.markLine = {
            silent: true,
            symbol: "none",
            label: { show: false },
            animation: false,
            lineStyle: { color: "rgba(0,0,0,0.08)", type: "solid", width: 1 },
            data: lines,
          };
        }
      }
      return ax;
    });
    const series = keys.map((k, m) => {
      const color = METRIC_COLORS[k] || "#b45309";
      const isRank = k === "rank";
      const y = points.map((r) => {
        const v = isRank ? r.rank : r[k];
        return v == null || v === undefined ? null : v;
      });
      return {
        name: labels[k],
        type: "line",
        data: y,
        smooth: true,
        // 参考站主折线为纯净细线（无数据点圆点，hover 时才显示）
        showSymbol: false,
        symbol: "circle",
        symbolSize: 5,
        connectNulls: false,
        lineStyle: { width: 2, color },
        itemStyle: { color },
        // 参考站排名折线同样带浅色面积填充（仅对数模式不填充）
        areaStyle: log
          ? undefined
          : {
              color: {
                type: "linear",
                x: 0, y: 0, x2: 0, y2: 1,
                colorStops: [
                  { offset: 0, color: `${color}33` },
                  { offset: 1, color: `${color}08` },
                ],
              },
              opacity: 0.4,
              // 排名轴是 inverse 的（1 在顶部），要填充"线→轴底"需指向轴 end；
              // 普通数值轴 start 在底部，保持 "start"
              origin: isRank ? "end" : "start",
            },
        yAxisIndex: m,
      };
    });
    c.setOption({
      animation: false,
      grid: { left: 8, right: 8, top: 30, bottom: 40, containLabel: true },
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(255,255,255,0.95)",
        borderColor: "rgba(0,0,0,0.1)",
        borderWidth: 1,
        textStyle: { color: "#374151", fontSize: 12 },
        axisPointer: { type: "line", lineStyle: { color: "rgba(0,0,0,0.15)", width: 1 } },
        formatter: (params) => {
          const arr = Array.isArray(params) ? params : [params];
          const r = arr[0] ? points[arr[0].dataIndex] : null;
          if (!r) return "";
          let html = `<div style="font-weight:bold;margin-bottom:8px">${r.date ? r.date : labels._issue(r.issue)}</div>`;
          if (Number.isInteger(r.issue)) {
            html += `<div style="display:flex;align-items:center;justify-content:space-between;margin:4px 0;color:#6b7280;font-size:11px"><span>${labels._issueLabel}</span><span style="font-weight:bold">${r.issue}</span></div>`;
          }
          arr.forEach((p) => {
            const k = keys[p.seriesIndex];
            const color = METRIC_COLORS[k] || "#6b7280";
            const w = p.value;
            html += `<div style="display:flex;align-items:center;justify-content:space-between;margin:4px 0"><div style="display:flex;align-items:center"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:8px"></span><span style="color:#374151">${labels[k]}</span></div><div style="font-weight:bold;color:${color}">${w == null ? "-" : ke(w, labels._units)}</div></div>`;
          });
          return html;
        },
      },
      legend: { show: false },
      xAxis: {
        type: "category",
        data: x,
        boundaryGap: false,
        axisLine: { onZero: false, lineStyle: { color: "rgba(0,0,0,0.2)" } },
        axisTick: { show: true, alignWithLabel: true, lineStyle: { color: "rgba(0,0,0,0.2)" } },
        axisLabel: { color: "rgba(0,0,0,0.5)", fontSize: 10, formatter: (v) => (v.startsWith("#") ? v : v.slice(5)) },
        splitLine: { show: false },
      },
      yAxis,
      // 参考站趋势图无底部缩放滑块，去掉 dataZoom
      dataZoom: [],
      series,
    });
  }, [records, active, log, labels]);

  return <div ref={ref} className="relative my-4 h-[300px]" />;
}

function Sparkline({ values, color, inverted = false }) {
  const n = values.length;
  if (n < 2) {
    return <svg viewBox="0 0 72 20" className="pointer-events-none h-5 w-18 touch-none" aria-hidden="true" />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = 2 + (i * 68) / (n - 1);
    const g = (max - v) / span;
    const y = inverted ? 2 + g * 16 : 2 + (1 - g) * 16;
    return [x, y];
  });
  const d = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg viewBox="0 0 72 20" className="pointer-events-none h-5 w-18 touch-none" aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r="2" fill={color} />
    </svg>
  );
}

function SortIcon({ active, isSub, state }) {
  if (!active) return <ArrowUpDown className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-40" />;
  const up = isSub ? state === "default" : state === "reverse";
  return up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
}

function SortTh({ label, column, hasSubSort, sortCol, sortSub, sortState, onSort, subLabel }) {
  const mainActive = sortCol === column && !sortSub && sortState != null;
  const subActive = sortCol === column && sortSub && sortState != null;
  return (
    <th className="sticky top-0 min-w-14 bg-muted whitespace-nowrap px-1.5 py-2 sm:px-3 sm:py-2.5">
      <div className="flex flex-col items-center gap-0.5">
        <button
          type="button"
          onClick={() => onSort(column, false)}
          className={`group inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold transition-colors sm:text-sm ${
            mainActive ? "bg-primary/10 text-primary" : "text-foreground/80 hover:bg-muted"
          }`}
        >
          {label}
          <SortIcon active={mainActive} isSub={false} state={sortState} />
        </button>
        {hasSubSort && (
          <button
            type="button"
            onClick={() => onSort(column, true)}
            className={`group inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] transition-colors ${
              subActive ? "bg-primary/10 text-primary" : "text-muted-foreground/50 hover:bg-muted hover:text-muted-foreground"
            }`}
          >
            {subLabel}
            <SortIcon active={subActive} isSub={true} state={sortState} />
          </button>
        )}
      </div>
    </th>
  );
}

function Empty({ text }) {
  return (
    <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="h-8 w-8 shrink-0 opacity-50" aria-hidden="true">
        <path d="M12 6v6l4 2" />
        <circle cx="12" cy="12" r="10" />
      </svg>
      {text}
    </div>
  );
}

function exportCsv(rows, columns, filename) {
  const header = columns.map((c) => c.label).join(",");
  const lines = rows.map((r) => columns.map((c) => r[c.key] ?? "").join(","));
  const blob = new Blob(["\uFEFF" + [header, ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function VideoPage() {
  const { aid } = useParams();
  const { t } = useTranslation();

  const [period, setPeriod] = useState("daily");
  const [descOpen, setDescOpen] = useState(false);
  const [scoreOpen, setScoreOpen] = useState(false);
  const [daOpen, setDaOpen] = useState(false);
  const [log, setLog] = useState(false);
  const [active, setActive] = useState(["rank"]);
  const [sortCol, setSortCol] = useState(null);
  const [sortSub, setSortSub] = useState(false);
  const [sortState, setSortState] = useState(null);

  const label = (k) => t(METRIC_META.find(([x]) => x === k)?.[1] || k);
  const statLabel = (k) => t(`video.${k}`);

  const vQ = useQuery({ queryKey: qk.video(aid), queryFn: () => api(`/api/video/${aid}`, { silent: true }) });
  const boardQ = useQuery({
    queryKey: qk.board({ kind: "all", period }),
    queryFn: () => api(`/api/board/all?pn=1&ps=50&order=score&period=${period}`, { silent: true }),
  });
  const hQ = useQuery({ queryKey: qk.songHistory(aid), queryFn: () => api(`/api/song-history/${aid}`, { silent: true }) });
  const snapsQ = useQuery({ queryKey: qk.snapshots(aid), queryFn: () => api(`/api/stat-snapshots/${aid}`, { silent: true }) });
  const relatedQ = useQuery({ queryKey: qk.related(aid), queryFn: () => api(`/api/video/${aid}/related`, { silent: true }) });

  const v = vQ.data;
  const err = vQ.error?.message;
  const h = hQ.data || {};
  const snaps = snapsQ.data?.snapshots || [];

  // 达成里程碑：按 10万/50万/.../1亿/... 阈值，从每日快照中取首次达标日期。
  // 若首个快照已超过阈值，说明达标发生在快照覆盖期之前，日期只能作为上界（estimated）。
  const milestones = useMemo(() => {
    const ths = [
      { v: 1e5, n: 10, unit: "wan" },
      { v: 5e5, n: 50, unit: "wan" },
      { v: 1e6, n: 100, unit: "wan" },
      { v: 5e6, n: 500, unit: "wan" },
      { v: 1e7, n: 1000, unit: "wan" },
      { v: 5e7, n: 5000, unit: "wan" },
      { v: 1e8, n: 1, unit: "yi" },
      { v: 5e8, n: 5, unit: "yi" },
      { v: 1e9, n: 10, unit: "yi" },
    ];
    const sorted = [...snaps].sort((a, b) => (a.date < b.date ? -1 : 1));
    if (sorted.length === 0) return [];
    const firstView = sorted[0].view || 0;
    const out = [];
    for (const m of ths) {
      const hit = sorted.find((s) => (s.view || 0) >= m.v);
      if (!hit) continue;
      out.push({ ...m, date: hit.date, estimated: firstView >= m.v });
    }
    return out;
  }, [snaps]);

  const boardHit = (boardQ.data?.list || []).find((it) => String(it.aid) === String(aid));
  const [libGirls, setLibGirls] = useState([]);
  useEffect(() => {
    let alive = true;
    if (!(boardHit?.girls && boardHit.girls.length) && aid) {
      api(`/api/video/${aid}/girls`).then((girls) => {
        if (alive && Array.isArray(girls) && girls.length) setLibGirls(girls);
      }).catch(() => {});
      api(`/api/girls`).then((list) => {
        if (!alive) return;
        const arr = Array.isArray(list) ? list : list?.list || [];
        const hit = arr.find((g) => g.songs?.some((s) => String(s.aid) === String(aid)));
        if (hit) setLibGirls([hit.name]);
      }).catch(() => {});
    }
    return () => { alive = false; };
  }, [aid, boardHit?.girls]);
  const girls = boardHit?.girls?.length ? boardHit.girls : libGirls;

  const singersQ = useQuery({
    queryKey: qk.singers({ names: girls }),
    queryFn: () => api("/api/singers?names=" + girls.map(encodeURIComponent).join(","), { silent: true }),
    enabled: girls.length > 0,
  });
  const singers = singersQ.data?.singers || {};

  const cur = h[period] || { stats: {}, records: [] };
  const rec = cur.records || [];
  const stats = cur.stats || {};
  const hasHistory = rec.length > 0;

  const snapRecords = useMemo(
    () =>
      snaps.map((s) => ({
        issue: s.date.slice(5),
        date: s.date,
        rank: null,
        score: 0,
        view: s.view,
        favorite: s.favorite,
        coin: s.coin,
        like: s.like,
        danmaku: s.danmaku,
        reply: s.reply,
        share: s.share,
      })),
    [snaps],
  );
  const chartRec = hasHistory ? rec : snapRecords;
  const chartMetrics = hasHistory ? METRIC_META : METRIC_META.filter(([k]) => k !== "rank" && k !== "score");
  const availMetrics = chartMetrics.map(([k]) => k);
  const effActive = active.filter((k) => availMetrics.includes(k));
  const safeActive = effActive.length > 0 ? effActive : [availMetrics[0]];

  const toggleMetric = (k) =>
    setActive((a) => (a.includes(k) ? (a.length > 1 ? a.filter((x) => x !== k) : a) : [...a, k]));

  const prevRank = rec.length >= 2 ? rec[rec.length - 2].rank : null;
  const latestRank = stats.latest_rank != null ? stats.latest_rank : rec.length ? rec[rec.length - 1].rank : null;
  const delta = prevRank != null && latestRank != null ? prevRank - latestRank : null;
  const trend = delta == null ? null : delta > 0 ? "up" : "down";

  const handleSort = (col, isSub) => {
    if (sortCol === col && sortSub === isSub) {
      if (sortState === "default") setSortState("reverse");
      else if (sortState === "reverse") {
        setSortState(null);
        setSortCol(null);
      } else setSortState("default");
    } else {
      setSortCol(col);
      setSortSub(isSub);
      setSortState("default");
    }
  };

  const sortedRec = useMemo(() => {
    if (!sortCol || !sortState) return rec;
    const key = sortSub ? `rank_${sortCol}` : sortCol;
    const asc = (RANK_LIKE_COLS.has(sortCol) || sortSub) ? sortState === "default" : sortState === "reverse";
    return [...rec].sort((a, b) => {
      const av = Number(a[key] ?? 0);
      const bv = Number(b[key] ?? 0);
      return asc ? av - bv : bv - av;
    });
  }, [rec, sortCol, sortSub, sortState]);

  const chartLabels = useMemo(
    () => ({
      _units: [
        [1e9, t("video.b")],
        [1e8, t("video.yi")],
        [1e4, t("video.wan")],
        [1e3, t("video.k")],
      ],
      _issue: (n) => t("video.issueN", { n }),
      _issueLabel: t("video.issue"),
      rank: label("rank"),
      score: label("score"),
      view: label("view"),
      favorite: label("favorite"),
      coin: label("coin"),
      like: label("like"),
      danmaku: label("danmaku"),
      reply: label("reply"),
      share: label("share"),
    }),
    [t],
  );

  const columns = [
    { key: "issue", label: t("video.issue") },
    { key: "rank", label: t("video.rank") },
    { key: "score", label: t("video.score") },
    ...STAT_KEYS.map((k) => ({ key: k, label: statLabel(k), hasSubSort: true })),
  ];

  if (err) return <p className="mx-auto max-w-4xl py-10 text-destructive">{err}</p>;
  if (!v) return <Loader className="py-24" label={t("video.loading")} />;

  return (
    <div className="mx-auto max-w-7xl overflow-x-clip pb-12 pt-6 @container">
      <div className="w-full flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* ===== 左列 ===== */}
        <div className="min-w-0 basis-0 grow space-y-4">
          {/* ===== Hero ===== */}
          <section className="@container overflow-hidden rounded-2xl border bg-card">
            <div className="relative bg-linear-to-br from-primary/8 via-primary/4 to-transparent px-6 py-6">
              <div className="relative flex items-start justify-between">
                <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
                  <h1 className="min-w-0 break-words text-2xl font-bold tracking-tight md:text-3xl">{v.title}</h1>
                  {v.copyright === 1 && (
                    <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium sm:px-3 sm:py-1 sm:text-xs bg-pink-500/10 text-pink-600 dark:text-pink-400">
                      {t("video.original")}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="space-y-2.5 border-t px-6 py-4">
              {/* P主 */}
              <div className="flex items-start gap-3 flex-col @md:flex-row">
                <div className="flex w-12 shrink-0 items-center gap-1.5 pt-2">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400 dark:bg-amber-500" />
                  <span className="text-sm text-muted-foreground">{t("video.uploader")}</span>
                </div>
                <div className="min-w-0 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => window.open(`https://space.bilibili.com/${v.owner?.mid}`, "_blank")}
                    className="group flex min-w-0 items-center gap-2.5 rounded-xl border p-2 transition hover:border-amber-300 hover:bg-amber-50/50 dark:hover:border-amber-700 dark:hover:bg-amber-950/30"
                  >
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gray-200 dark:bg-gray-700">
                      {v.owner?.face ? (
                        <img src={v.owner.face} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <span className="text-sm font-bold text-muted-foreground">{(v.owner?.name || "?").slice(0, 1)}</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <span className="block max-w-full truncate text-sm font-medium group-hover:text-amber-700 dark:group-hover:text-amber-300">
                        {v.owner?.name}
                      </span>
                    </div>
                  </button>
                </div>
              </div>
              {/* 合作者 */}
              {(v.staff || []).filter((s) => s && s.mid && Number(s.mid) !== Number(v.owner?.mid)).length > 0 && (
                <div className="flex items-start gap-3 flex-col @md:flex-row">
                  <div className="flex w-12 shrink-0 items-center gap-1.5 pt-2">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-violet-400 dark:bg-violet-500" />
                    <span className="text-sm text-muted-foreground">{t("video.collaborators")}</span>
                  </div>
                  <div className="min-w-0 flex flex-wrap gap-3">
                    {(v.staff || [])
                      .filter((s) => s && s.mid && Number(s.mid) !== Number(v.owner?.mid))
                      .map((s) => (
                        <Link
                          key={s.mid}
                          to={`/member/${s.mid}`}
                          className="group flex min-w-0 items-center gap-2.5 rounded-xl border p-2 transition hover:border-violet-300 hover:bg-violet-50/50 dark:hover:border-violet-700 dark:hover:bg-violet-950/30"
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gray-200 dark:bg-gray-700 xxs:h-12 xxs:w-12">
                            {s.face ? (
                              <img src={s.face} alt="" loading="lazy" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              <span className="text-sm font-bold text-muted-foreground">{s.name.slice(0, 1)}</span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <span className="block max-w-full truncate text-sm font-medium group-hover:text-violet-700 dark:group-hover:text-violet-300">
                              {s.name}
                            </span>
                            {s.title && (
                              <span className="mt-0.5 block max-w-full truncate text-[11px] text-muted-foreground">{s.title}</span>
                            )}
                          </div>
                        </Link>
                      ))}
                    </div>
                </div>
              )}
              {/* 歌手 */}
              {girls.length > 0 && (
                <div className="flex items-start gap-3 flex-col @md:flex-row">
                  <div className="flex w-12 shrink-0 items-center gap-1.5 pt-2">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-sky-400 dark:bg-sky-500" />
                    <span className="text-sm text-muted-foreground">{t("video.singers")}</span>
                  </div>
                   <div className="min-w-0 flex flex-wrap gap-3">
                    {Array.from(
                      new Map(
                        girls.map((g) => {
                          const s = singers[g];
                          return [s?.vocabili_id ?? g, { name: g, s }];
                        })
                      ).values()
                    ).map(({ name: g, s }) => (
                      <Link
                        key={g}
                        to={s?.vocabili_id ? `/singer/${s.vocabili_id}` : `/singers`}
                        className="group flex min-w-0 items-center gap-2.5 rounded-xl border p-2 transition hover:border-sky-300 hover:bg-sky-50/50 dark:hover:border-sky-700 dark:hover:bg-sky-950/30"
                      >
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gray-200 dark:bg-gray-700">
                          {s?.picture ? (
                            <img
                              src={s.picture}
                              alt=""
                              loading="lazy"
                              className="h-full w-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <span className="text-sm font-bold text-muted-foreground">{g.slice(0, 1)}</span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <span className="block max-w-full truncate text-sm font-medium group-hover:text-sky-700 dark:group-hover:text-sky-300">
                              {g}
                            </span>
                            {s?.engines?.length > 0 && (
                              <span className="mt-0.5 block max-w-full truncate text-[11px] text-muted-foreground">
                                {s.engines.slice(0, 3).map((e) => e.name).join(" / ")}
                              </span>
                            )}
                          </div>
                        </Link>
                      ))}
                    </div>
                </div>
              )}
              
              <div className="flex items-start gap-3">
                <div className="flex w-12 shrink-0 items-center gap-1.5">
                  <Tag className="h-3.5 w-3.5 shrink-0 text-emerald-400 dark:text-emerald-500" aria-hidden="true" />
                  <span className="text-sm text-muted-foreground">{t("video.tags")}</span>
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  {(v.tags || []).map((tg) => (
                    <span
                      key={tg.tag_id}
                      className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-400"
                    >
                      <Link to={`/search?keyword=${encodeURIComponent(tg.tag_name)}`} className="transition hover:underline">
                        {tg.tag_name}
                      </Link>
                    </span>
                  ))}
                  <Tip content={t("video.addTagTip")}>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-full border border-dashed border-emerald-400/60 px-2.5 py-0.5 text-xs text-emerald-600 transition hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                  >
                    <Plus className="h-3 w-3" aria-hidden="true" />
                    {t("video.addTag")}
                  </button>
                  </Tip>
                </div>
              </div>
              {/* 简介 */}
              {v.desc ? (
                <div className="flex items-start gap-3">
                  <div className="flex w-12 shrink-0 items-center gap-1.5">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true">
                      <path d="M4 6h16M4 12h16M4 18h10" />
                    </svg>
                    <span className="text-sm text-muted-foreground">{t("video.desc")}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDescOpen(true)}
                    className="min-w-0 cursor-pointer text-left text-sm leading-relaxed text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <span className="line-clamp-2 whitespace-pre-line">{v.desc}</span>
                    <span className="mt-1 inline-flex items-center gap-0.5 text-xs font-medium text-primary">
                      {t("video.expandAll")}
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3" aria-hidden="true">
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </span>
                  </button>
                </div>
              ) : null}
            </div>
          </section>

          {/* ===== 统计卡 ===== */}
          <section className="@container bg-card p-4 rounded-2xl border space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                {[
                  ["daily", "video.daily"],
                  ["weekly", "video.weekly"],
                  ["monthly", "video.monthly"],
                  ["annual", "video.annual"],
                ].map(([id, key]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPeriod(id)}
                    className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                      period === id
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {t(key)}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 @xs:grid-cols-3 @3xl:grid-cols-6">
              {hasHistory ? (
                <>
                  <StatCard
                    highlight
                    icon={Trophy}
                    label={t("video.bestRank")}
                    value={stats.best_rank != null ? stats.best_rank : t("video.noData")}
                    sub={stats.best_issue ? t("video.issueN", { n: stats.best_issue }) : ""}
                  />
                  <StatCard
                    icon={Target}
                    label={t("video.latestRank")}
                    value={stats.latest_rank != null ? stats.latest_rank : t("video.noData")}
                    sub={trend == null ? "" : (trend === "up" ? t("video.upN", { n: Math.abs(delta) }) : t("video.downN", { n: Math.abs(delta) }))}
                    trend={trend}
                  />
                  <StatCard
                    icon={Flame}
                    label={t("video.avgRank")}
                    value={stats.avg_rank != null ? stats.avg_rank : t("video.noData")}
                    sub={stats.avg_window || t("video.avgWindow", { n: 30 })}
                  />
                  <StatCard
                    icon={Calendar}
                    label={t("video.appearances")}
                    value={stats.total != null ? stats.total : t("video.noData")}
                    sub={stats.top1_count != null ? t("video.top1", { n: stats.top1_count }) : ""}
                  />
                  <StatCard
                    icon={Star}
                    label={t("video.maxScore")}
                    value={stats.max_score != null ? fmt(stats.max_score) : t("video.noData")}
                    sub={stats.max_score_issue ? t("video.issueN", { n: stats.max_score_issue }) : ""}
                  />
                  <StatCard
                    icon={Clock}
                    label={t("video.firstRecord")}
                    value={stats.first_issue ? t("video.issueN", { n: stats.first_issue }) : t("video.noData")}
                    sub={stats.first_rank ? t("video.rankN", { n: stats.first_rank }) : ""}
                  />
                </>
              ) : (
                <>
                  <StatCard
                    highlight
                    icon={Trophy}
                    label={t("video.latestRank")}
                    value={boardHit?.score_rank != null ? boardHit.score_rank : t("video.notListed")}
                    sub={boardHit?.issue ? t("video.issueN", { n: boardHit.issue }) : t("video.currentDaily")}
                  />
                  <StatCard
                    icon={Play}
                    label={t("video.view")}
                    value={fmt(v.stat?.view ?? 0)}
                    sub={boardHit?.rank_view != null ? t("video.rankInBoard", { n: boardHit.rank_view }) : ""}
                  />
                  <StatCard
                    icon={Star}
                    label={t("video.favorite")}
                    value={fmt(v.stat?.favorite ?? 0)}
                    sub={boardHit?.rank_favorite != null ? t("video.rankInBoard", { n: boardHit.rank_favorite }) : ""}
                  />
                  <StatCard
                    icon={ThumbsUp}
                    label={t("video.like")}
                    value={fmt(v.stat?.like ?? 0)}
                    sub={boardHit?.rank_like != null ? t("video.rankInBoard", { n: boardHit.rank_like }) : ""}
                  />
                  <StatCard
                    icon={MessageCircle}
                    label={t("video.reply")}
                    value={fmt(v.stat?.reply ?? 0)}
                    sub={boardHit?.rank_reply != null ? t("video.rankInBoard", { n: boardHit.rank_reply }) : ""}
                  />
                  <StatCard
                    icon={MessageSquare}
                    label={t("video.danmaku")}
                    value={fmt(v.stat?.danmaku ?? 0)}
                    sub={boardHit?.rank_danmaku != null ? t("video.rankInBoard", { n: boardHit.rank_danmaku }) : ""}
                  />
                </>
              )}
            </div>
            {!hasHistory && (
              <p className="text-xs text-muted-foreground">{t("video.historyCollectingNote")}</p>
            )}
          </section>

          {/* ===== 图表 ===== */}
          <section className="relative space-y-4">
            <div className="@container rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1">
                  {chartMetrics.map(([k, key, color]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => toggleMetric(k)}
                      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                        safeActive.includes(k)
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
                      {t(key)}
                    </button>
                  ))}
                </div>
                <CheckboxField
                  checked={log}
                  onCheckedChange={(c) => setLog(!!c)}
                  id="chart-log"
                  label={t("video.logScale")}
                  className="text-xs text-muted-foreground"
                />
              </div>

              {chartRec.length > 0 ? (
                <>
                  <RankChart records={chartRec} active={safeActive} log={log} labels={chartLabels} />
                  <div className="touch-manipulation grid grid-cols-3 gap-1.5 @md:grid-cols-5 @2xl:grid-cols-9">
                    {chartMetrics.map(([k, key, color]) => {
                      const on = safeActive.includes(k);
                      return (
                        <button
                          key={k}
                          type="button"
                          onClick={() => toggleMetric(k)}
                          aria-pressed={on}
                          className="flex flex-col items-center gap-1 rounded-lg border bg-muted/30 p-2"
                        >
                          <span className="text-[10px] text-muted-foreground">{t(key)}</span>
                          <Sparkline
                            values={[...chartRec].reverse().map((r) => (k === "rank" ? r.rank : r[k] ?? 0))}
                            color={color}
                            inverted={k === "rank"}
                          />
                        </button>
                      );
                    })}
                  </div>
                  {!hasHistory && (
                    <p className="text-xs text-muted-foreground">{t("video.snapshotNote")}</p>
                  )}
                </>
              ) : boardHit ? (
                <div className="space-y-4 py-2">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-yellow-100 px-2.5 py-0.5 font-semibold text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-300">
                      <Trophy className="h-3.5 w-3.5" aria-hidden="true" />
                      {t("video.onBoardN", { n: boardHit.score_rank })}
                    </span>
                    <span className="text-muted-foreground">
                      {t("video.dailyIssueScore", { issue: boardHit.issue, score: fmt(boardHit.score ?? 0) })}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-7">
                    {METRIC_META.filter(([k]) => k !== "rank").map(([k, key, color]) => (
                      <div key={k} className="rounded-xl border bg-muted/30 p-3">
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
                          {t(key)}
                        </div>
                        <div className="mt-1 text-base font-bold tabular-nums" style={{ color }}>
                          {fmt(boardHit[k] ?? 0)}
                        </div>
                        {boardHit[`rank_${k}`] != null && (
                          <div className="mt-0.5 text-[10px] tabular-nums text-muted-foreground">
                            {t("video.rankInBoard", { n: boardHit[`rank_${k}`] })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">{t("video.chartCollectingNote")}</p>
                </div>
              ) : (
                <Empty text={t("video.notOnBoard")} />
              )}
            </div>
          </section>

          {/* ===== 上榜记录 ===== */}
          {hasHistory ? (
            <section className="space-y-3 sm:space-y-4">
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <h3 className="text-base font-semibold sm:text-lg">{t("video.history")}</h3>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground sm:px-3 sm:text-sm">
                  {rec.length} / {rec.length}
                </span>
                <div className="ml-auto">
                  <button
                    type="button"
                    onClick={() => exportCsv(sortedRec, columns, `history-${aid}.csv`)}
                    className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground/60 sm:px-3 sm:py-1 sm:text-xs"
                  >
                    <Lock className="h-2.5 w-2.5 sm:h-3 sm:w-3" aria-hidden="true" />
                    {t("video.exportCsv")}
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto overflow-y-auto max-h-[750px] rounded-xl border bg-card shadow-sm sm:rounded-2xl">
                <table className="w-full">
                  <thead>
                    <tr className="border-b-2 border-border/60 bg-muted/50">
                      {columns.map((c) => (
                        <SortTh
                          key={c.key}
                          label={c.label}
                          column={c.key}
                          hasSubSort={c.hasSubSort}
                          sortCol={sortCol}
                          sortSub={sortSub}
                          sortState={sortState}
                          onSort={handleSort}
                          subLabel={t("video.rank")}
                        />
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y text-xs sm:text-sm">
                    {sortedRec.map((r) => {
                      const top = r.rank != null && r.rank <= 20;
                      return (
                        <tr
                          key={r.issue}
                          className={`transition-colors ${
                            top
                              ? "bg-yellow-50 hover:bg-yellow-100 dark:bg-yellow-950/40 dark:hover:bg-yellow-900/50"
                              : "hover:bg-muted/50"
                          }`}
                        >
                          <td className="whitespace-nowrap px-2 py-2 sm:px-4 sm:py-3 text-center">
                            <Link
                              to={`/rank/all/${r.issue}`}
                              className="font-semibold tabular-nums text-primary transition-colors hover:text-primary/80 hover:underline"
                            >
                              {t("video.issueN", { n: r.issue })}
                            </Link>
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 sm:px-4 sm:py-3 text-center">
                            {top ? (
                              <div className="inline-flex min-w-9 items-center justify-center rounded-lg bg-yellow-500 px-2.5 py-1 text-sm font-bold tabular-nums text-white shadow-sm">
                                {r.rank}
                              </div>
                            ) : (
                              <span className="inline-flex min-w-9 justify-center text-sm tabular-nums text-muted-foreground">
                                {r.rank}
                              </span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 sm:px-4 sm:py-3 text-right">
                            <span className={`text-sm font-bold tabular-nums sm:text-base ${top ? "text-yellow-700 dark:text-yellow-300" : "text-foreground"}`}>
                              {fmt(r.score ?? 0)}
                            </span>
                          </td>
                          {STAT_KEYS.map((k) => {
                            const rk = r[`rank_${k}`];
                            const best = rk != null && rk <= 10;
                            return (
                              <td key={k} className="whitespace-nowrap px-2 py-2 sm:px-4 sm:py-3 text-right">
                                <div className="text-right">
                                  <div className="tabular-nums">{fmt(r[k] ?? 0)}</div>
                                  {rk != null && (
                                    <div className={`mt-0.5 text-[10px] tabular-nums ${best ? "font-semibold text-yellow-600 dark:text-yellow-400" : "text-muted-foreground/70"}`}>
                                      {t("video.rankPos", { n: rk })}
                                    </div>
                                  )}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ) : boardHit ? (
            <section className="space-y-3 sm:space-y-4">
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <h3 className="text-base font-semibold sm:text-lg">{t("video.history")}</h3>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground sm:px-3 sm:text-sm">
                  {t("video.issueN", { n: 1 })}
                </span>
              </div>
              <div className="overflow-x-auto rounded-xl border bg-card shadow-sm sm:rounded-2xl">
                <table className="w-full">
                  <thead>
                    <tr className="border-b-2 border-border/60 bg-muted/50">
                      {columns.map((c) => (
                        <SortTh key={c.key} label={c.label} column={c.key} hasSubSort={c.hasSubSort} sortCol={null} sortSub={false} sortState={null} onSort={() => {}} subLabel={t("video.rank")} />
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y text-xs sm:text-sm">
                    {(() => {
                      const r = boardHit;
                      const top = r.score_rank != null && r.score_rank <= 20;
                      return (
                        <tr className={`transition-colors ${top ? "bg-yellow-50 dark:bg-yellow-950/40" : ""}`}>
                          <td className="whitespace-nowrap px-2 py-2 sm:px-4 sm:py-3 text-center">
                            <Link
                              to={`/rank/all/${r.issue}`}
                              className="font-semibold tabular-nums text-primary transition-colors hover:text-primary/80 hover:underline"
                            >
                              {t("video.issueN", { n: r.issue })}
                            </Link>
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 sm:px-4 sm:py-3 text-center">
                            {top ? (
                              <div className="inline-flex min-w-9 items-center justify-center rounded-lg bg-yellow-500 px-2.5 py-1 text-sm font-bold tabular-nums text-white shadow-sm">
                                {r.score_rank}
                              </div>
                            ) : (
                              <span className="inline-flex min-w-9 justify-center text-sm tabular-nums text-muted-foreground">
                                {r.score_rank}
                              </span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 sm:px-4 sm:py-3 text-right">
                            <span className={`text-sm font-bold tabular-nums sm:text-base ${top ? "text-yellow-700 dark:text-yellow-300" : "text-foreground"}`}>
                              {fmt(r.score ?? 0)}
                            </span>
                          </td>
                          {STAT_KEYS.map((k) => {
                            const rk = r[`rank_${k}`];
                            const best = rk != null && rk <= 10;
                            return (
                              <td key={k} className="whitespace-nowrap px-2 py-2 sm:px-4 sm:py-3 text-right">
                                <div className="text-right">
                                  <div className="tabular-nums">{fmt(r[k] ?? 0)}</div>
                                  {rk != null && (
                                    <div className={`mt-0.5 text-[10px] tabular-nums ${best ? "font-semibold text-yellow-600 dark:text-yellow-400" : "text-muted-foreground/70"}`}>
                                      {t("video.rankPos", { n: rk })}
                                    </div>
                                  )}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })()}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">{t("video.historyNote")}</p>
            </section>
          ) : (
            <section className="rounded-xl border bg-card p-4">
              <Empty text={t("video.notOnBoardRecord")} />
            </section>
          )}
        </div>

        {/* ===== 右栏 ===== */}
        <div className="w-full shrink-0 grow-0 space-y-4 order-first lg:order-none lg:w-sm lg:max-w-sm">
          <section className="group/carousel overflow-hidden rounded-xl border bg-card xs:rounded-2xl">
            <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-3 xs:px-6 xs:py-4">
              <div className="flex items-center gap-2 xs:gap-3">
                <h2 className="text-base font-semibold xs:text-lg">{t("video.videoPosts")}</h2>
              </div>
            </div>
            <div className="h-full w-full space-y-3 p-3 xs:p-5">
              <div className="flex flex-col overflow-hidden w-full rounded-xl border bg-card xs:rounded-2xl">
                <a
                  href={`https://www.bilibili.com/video/${v.bvid}`}
                  target="_blank"
                  rel="noreferrer"
                  className="group relative aspect-video overflow-hidden bg-muted"
                >
                  <img
                    src={v.pic}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/95 shadow-2xl transition-transform hover:scale-110 xs:h-14 xs:w-14">
                      <Play className="h-5 w-5 fill-primary text-primary xs:h-6 xs:w-6" aria-hidden="true" />
                    </span>
                  </span>
                  {v.copyright === 1 && (
                    <span className="absolute right-2 top-2 rounded-md px-2 py-0.5 text-[10px] font-semibold text-white shadow-lg xs:right-3 xs:top-3 xs:rounded-lg xs:px-2.5 xs:py-1 xs:text-xs bg-emerald-500">
                      {t("video.selfMade")}
                    </span>
                  )}
                </a>
                <div className="p-3 xs:p-4">
                  <h3 className="line-clamp-2 text-sm font-semibold leading-snug break-words xs:text-base">{v.title}</h3>
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground xs:mt-1.5 xs:gap-2 xs:text-sm">
                    {v.owner?.mid ? (
                      <a
                        href={`https://space.bilibili.com/${v.owner.mid}`}
                        target="_blank"
                        rel="noreferrer"
                        className="min-w-0 truncate font-medium text-foreground/80 transition-colors hover:text-primary hover:underline underline-offset-2"
                      >
                        {v.owner?.name}
                      </a>
                    ) : (
                      <span className="min-w-0 truncate font-medium text-foreground/80">{v.owner?.name || v.bvid}</span>
                    )}
                    <span className="text-muted-foreground/40">·</span>
                    <span>{fmtDate(v.pubdate)}</span>
                  </div>
                </div>
              </div>

              <div className="relative w-full flex flex-col overflow-hidden rounded-xl border bg-linear-to-br from-muted/60 to-muted/30 p-4 xs:rounded-2xl xs:p-6">
                <div className="mb-3 text-sm font-semibold xs:mb-5 xs:text-base">{t("video.liveData")}</div>
                <div className="flex-1 space-y-2 xs:space-y-4">
                  {STAT_KEYS.map((k, i) => (
                    <div key={k} className="flex items-center justify-between gap-2">
                      <span className="shrink-0 text-xs text-muted-foreground xs:text-base">{statLabel(k)}</span>
                      <span className={`min-w-0 truncate text-base font-bold tabular-nums xs:text-xl ${LIVE_CLASSES[i]}`}>
                        {fmt(v.stat?.[k] ?? 0)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex gap-2 xs:mt-4">
                  <button
                    type="button"
                    onClick={() => setDaOpen(true)}
                    className="flex-1 shrink-0 rounded-lg bg-muted/50 py-2 text-center text-xs font-semibold text-foreground transition hover:bg-muted xs:rounded-xl xs:py-2.5 xs:text-sm"
                  >
                    <Lock className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
                    {t("video.historyData")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setScoreOpen(true)}
                    className="flex-1 shrink-0 rounded-lg bg-primary py-2 text-center text-xs font-semibold text-primary-foreground transition hover:opacity-90 xs:rounded-xl xs:py-2.5 xs:text-sm"
                  >
                    {t("video.calcScore")}
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* ===== 达成里程碑 ===== */}
          {milestones.length > 0 && (
            <section className="space-y-3 sm:space-y-4">
              <h3 className="flex items-center gap-2 text-base font-semibold sm:text-lg">
                <span>{t("video.milestone")}</span>
              </h3>
              <ul
                className="divide-y overflow-y-auto rounded-xl border bg-card sm:rounded-2xl"
                style={{ maxHeight: "248px" }}
              >
                {milestones.map((m, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between gap-3 px-4 py-3 text-base transition-colors hover:bg-muted/50"
                  >
                    <span className="font-medium tabular-nums">
                      {m.n}
                      {t(`video.${m.unit}`)} {t("video.view")}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {m.estimated ? `${t("video.before")} ` : ""}
                      {m.date}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="overflow-hidden rounded-2xl border bg-card">
            <div className="border-b bg-muted/30 px-4 sm:px-6 py-3">
              <h2 className="text-sm font-semibold">{t("video.related")}</h2>
            </div>
            <div className="p-3 sm:p-4">
              {relatedQ.isLoading ? (
                <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                  <Loader className="mr-2 h-4 w-4 animate-spin" />{t("video.loading")}
                </div>
              ) : (relatedQ.data && relatedQ.data.length > 0) ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {relatedQ.data.map((r) => (
                    <Link
                      key={`${r.aid}-${r.type}`}
                      to={`/video/${r.aid}`}
                      className="group flex flex-col overflow-hidden rounded-xl border bg-background/60 transition hover:border-primary/50 hover:shadow-md"
                    >
                      <div className="relative aspect-video w-full overflow-hidden bg-muted">
                        {r.pic ? (
                          <img
                            src={r.pic}
                            alt=""
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            className="h-full w-full object-cover transition duration-300 group-hover:scale-110"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center"><Play className="h-6 w-6 text-muted-foreground" /></div>
                        )}
                        <span className={`absolute left-1.5 top-1.5 rounded px-1.5 py-0.5 text-[10px] font-bold leading-none backdrop-blur-sm ${RELATED_TYPE_STYLE[r.type] || "bg-muted/80 text-muted-foreground"}`}>
                          {t(`video.relatedType.${r.type}`, { defaultValue: r.type })}
                        </span>
                        {r.view != null && (
                          <span className="absolute bottom-1.5 right-1.5 flex items-center gap-0.5 rounded bg-black/60 px-1 py-0.5 text-[10px] font-medium leading-none text-white backdrop-blur-sm">
                            <Play className="h-2.5 w-2.5" aria-hidden="true" />
                            {fmt(r.view)}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 p-2">
                        <p className="line-clamp-2 text-xs font-medium leading-snug">{r.title}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-sm text-muted-foreground">{t("video.relatedEmpty")}</div>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* ===== 简介弹窗（Radix Dialog） ===== */}
      <Modal open={descOpen} onClose={() => setDescOpen(false)} title={v.title} maxWidth="max-w-2xl">
        <div className="max-h-[70vh] overflow-y-auto">
          <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{v.desc}</p>
        </div>
      </Modal>

      {/* ===== 视频数据 / 分数弹窗（Zo，Radix Dialog） ===== */}
      <Modal
        open={scoreOpen}
        onClose={() => setScoreOpen(false)}
        title={t("video.videoData")}
        description={v.title}
        maxWidth="max-w-3xl"
      >
        <div className="max-h-[80vh] overflow-y-auto">
          <div className="mb-3 flex items-center gap-2">
            <p className="min-w-0 truncate text-xs text-muted-foreground">{v.title}</p>
            <a
              href={`https://www.bilibili.com/video/${v.bvid}`}
              target="_blank"
              rel="noreferrer"
              className="ml-auto shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              title={t("video.viewOnBilibili")}
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>

          <div className="grid grid-cols-4 grid-rows-2 gap-2 sm:grid-cols-7 sm:grid-rows-1">
            {STAT_KEYS.map((k, i) => (
              <div key={k} className={`rounded-xl border bg-card p-3 ${i === 0 ? "col-span-2 sm:col-span-1" : ""}`}>
                <div className={`text-[10px] font-medium ${LIVE_CLASSES[i]}`}>{statLabel(k)}</div>
                <div className="mt-1 truncate text-sm font-bold tabular-nums sm:text-base">{fmt(v.stat?.[k] ?? 0)}</div>
              </div>
            ))}
          </div>

          {snapRecords.length > 0 && (
            <div className="mt-4 rounded-xl border bg-card p-3">
              <h4 className="mb-1 text-xs font-semibold text-muted-foreground">{t("video.snapshotTrend")}</h4>
              <RankChart
                records={snapRecords}
                active={["view", "favorite", "like"]}
                log={false}
                labels={chartLabels}
              />
            </div>
          )}

          <div className="mt-4 rounded-xl border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-semibold">{t("video.scoreCalc")}</h4>
              <span
                className="text-sm text-primary"
                dangerouslySetInnerHTML={{
                  __html: t("video.totalPoints", {
                    n: fmt(Math.round(STAT_KEYS.reduce((s, k) => s + (v.stat?.[k] || 0) * WEIGHTS[k], 0))),
                    interpolation: { escapeValue: false },
                  }),
                }}
              />
            </div>
            <div className="space-y-2">
              {STAT_KEYS.map((k) => {
                const val = v.stat?.[k] ?? 0;
                return (
                  <div key={k} className="flex items-baseline justify-between gap-2 border-b border-border/60 pb-1.5 last:border-0">
                    <span className="text-xs text-muted-foreground">
                      {statLabel(k)} <span className="text-primary">×{fmt(WEIGHTS[k])}</span>
                    </span>
                    <span className="text-sm font-semibold tabular-nums">
                      {val > 0 ? fmt(Math.round(val * WEIGHTS[k])) : "0"}
                    </span>
                  </div>
                );
              })}
            </div>
            <Link
              to="/calculator"
              className="mt-3 block w-full rounded-lg bg-primary py-2 text-center text-xs font-semibold text-primary-foreground transition hover:opacity-90"
            >
              {t("video.editInCalculator")}
            </Link>
          </div>
        </div>
      </Modal>

      {/* ===== 视频历史弹窗（Da，Radix Dialog） ===== */}
      <Modal open={daOpen} onClose={() => setDaOpen(false)} title={t("video.videoHistory")} description={v.title} maxWidth="max-w-3xl">
        {snapRecords.length > 0 ? (
          <div className="max-h-[70vh] overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-muted">
                <tr className="border-b-2 border-border/60">
                  <th className="px-3 py-2 text-left text-xs font-semibold">{t("video.issue")}</th>
                  {STAT_KEYS.map((k) => (
                    <th key={k} className="px-3 py-2 text-right text-xs font-semibold">{statLabel(k)}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y text-xs sm:text-sm">
                {[...snapRecords].reverse().map((s) => (
                  <tr key={s.date} className="hover:bg-muted/50">
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-muted-foreground">{s.date}</td>
                    {STAT_KEYS.map((k) => (
                      <td key={k} className="px-3 py-2 text-right tabular-nums">{fmt(s[k])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty text={t("video.noData")} />
        )}
      </Modal>

      <CommentPanel aid={aid} title={v.title} />
    </div>
  );
}
