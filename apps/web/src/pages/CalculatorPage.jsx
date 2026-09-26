import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Clock, Loader2, Search } from "lucide-react";
import { api } from "../api.js";
import Tip from "../components/ui/Tip.jsx";
import {
  BOARDS,
  COPYRIGHTS,
  METRICS,
  NEW_WINDOW,
  computeScore,
  fmt2,
  hasFix,
  needsIssue,
} from "../lib/officialScore.js";

const INT_MAX = 9999999999;
const INT_MIN = -9999999999;

/** 规则 → 本站榜单接口的 period 参数（用于取该规则的当前期号做默认值） */
const BOARD_PERIOD = {
  "vocaloid-daily": "daily",
  "vocaloid-weekly": "weekly",
  "vocaloid-monthly": "monthly",
  "vocaloid-annual": "annual",
};

/** 整数转数字（原站 x()）：非法值回 0 */
const toInt = (v) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.floor(n) : 0;
};

/** 整数展示（原站 m()）：四舍五入后加千分位 */
const fmtInt = (v) => Math.round(Number.isNaN(v) ? 0 : v).toLocaleString("zh-CN");

const SELECT_CLS = "rounded-lg border-0 bg-muted px-2.5 py-1.5 text-sm font-medium outline-none";
const METRIC_INPUT_CLS =
  "w-28 shrink-0 rounded-lg border bg-background px-2.5 py-1.5 text-right text-sm tabular-nums outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20";
const TIME_INPUT_CLS =
  "rounded-lg border-0 bg-muted px-2.5 py-1.5 text-sm font-medium outline-none w-16 text-center";

// ---------------------------------------------------------------------------
// 基础控件
// ---------------------------------------------------------------------------

/** 整数输入框（原站 j）：允许编辑中途出现空串与 "-"，失焦时兜底为 0 并夹到 ±9999999999 */
function IntegerInput({ value, onChange, className }) {
  const [text, setText] = useState(() => String(value));
  const [seen, setSeen] = useState(value);
  // 外部值变化时同步（原站在 render 阶段做，这里保持同样的语义）
  if (seen !== value) {
    setSeen(value);
    setText(String(value));
  }

  const handleChange = (e) => {
    const raw = e.target.value;
    if (raw === "" || raw === "-") {
      setText(raw);
      return;
    }
    if (!/^-?\d*$/.test(raw) || raw.replace("-", "").length > 10) return;
    setText(raw);
    const n = parseInt(raw, 10);
    if (!Number.isNaN(n)) onChange(Math.max(INT_MIN, Math.min(INT_MAX, n)));
  };

  const handleBlur = () => {
    const n = parseInt(text, 10);
    if (Number.isNaN(n) || text === "" || text === "-") {
      setText("0");
      onChange(0);
      return;
    }
    const clamped = Math.max(INT_MIN, Math.min(INT_MAX, n));
    setText(String(clamped));
    onChange(clamped);
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      value={text}
      onChange={handleChange}
      onBlur={handleBlur}
      className={className}
    />
  );
}

/** 开关（原站 switch chunk 的 shadcn 结构，改为原生 button 以免新增依赖） */
function Switch({ checked, onCheckedChange }) {
  const state = checked ? "checked" : "unchecked";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-state={state}
      data-size="default"
      onClick={() => onCheckedChange(!checked)}
      className="peer group/switch inline-flex shrink-0 items-center rounded-full border border-transparent shadow-xs transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[size=default]:h-[1.15rem] data-[size=default]:w-8 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input dark:data-[state=unchecked]:bg-input/80"
    >
      <span
        data-state={state}
        className="pointer-events-none block rounded-full bg-background ring-0 transition-transform group-data-[size=default]/switch:size-4 data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0 dark:data-[state=checked]:bg-primary-foreground dark:data-[state=unchecked]:bg-foreground"
      />
    </button>
  );
}

/** 自动刷新开关（原站 AutoRefreshButton） */
function AutoRefreshButton({ autoRefresh, onAutoRefreshToggle }) {
  const { t } = useTranslation();
  return (
    <Tip content={t(autoRefresh ? "calculator.autoRefreshOn" : "calculator.autoRefreshOff")}>
      <button
        type="button"
        onClick={onAutoRefreshToggle}
        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition ${
          autoRefresh
            ? "bg-primary/10 text-primary hover:bg-primary/20"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
      >
        {autoRefresh ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Clock className="h-3.5 w-3.5" />}
        <span className="hidden xs:inline">{t("calculator.autoRefresh")}</span>
      </button>
    </Tip>
  );
}

// ---------------------------------------------------------------------------
// 新曲 / 时间间隔（原站 H + W）
// ---------------------------------------------------------------------------

const splitOffset = (total) => {
  if (total == null) return { days: 0, hours: 0, minutes: 0, seconds: 0 };
  const a = Math.abs(total);
  return {
    days: total >= 0 ? Math.floor(a / 86400) : -Math.floor(a / 86400),
    hours: Math.floor((a % 86400) / 3600),
    minutes: Math.floor((a % 3600) / 60),
    seconds: a % 60,
  };
};

const joinOffset = (days, hours, minutes, seconds) => {
  const rest = hours * 3600 + minutes * 60 + seconds;
  return days * 86400 + (days >= 0 ? rest : -rest);
};

function TimeOffsetInput({ value, max, onChange }) {
  const { t } = useTranslation();
  const parts = splitOffset(value);
  const dayMax = max != null ? Math.floor(max / 86400) : undefined;

  const update = (key, raw) => {
    const n = toInt(raw);
    const next = { ...parts, [key]: n };
    let total = joinOffset(next.days, next.hours, next.minutes, next.seconds);
    if (max != null && total > max) total = max;
    onChange(total);
  };

  const fields = [
    ["days", t("calculator.day"), { max: dayMax }],
    ["hours", t("calculator.hour"), { min: 0, max: 23 }],
    ["minutes", t("calculator.minute"), { min: 0, max: 59 }],
    ["seconds", t("calculator.second"), { min: 0, max: 59 }],
  ];

  return (
    <div className="flex items-center gap-1">
      {fields.map(([key, label, attrs]) => (
        <span key={key} className="flex items-center gap-1">
          <input
            type="number"
            value={parts[key] === 0 ? "0" : parts[key] || ""}
            onChange={(e) => update(key, e.target.value)}
            className={TIME_INPUT_CLS}
            {...attrs}
          />
          <span className="text-xs text-muted-foreground">{label}</span>
        </span>
      ))}
    </div>
  );
}

function NewSongField({ value, onChange }) {
  const { t } = useTranslation();
  const cur = value ?? -1;
  const on = cur >= 0;

  const toggle = (next) => {
    if (next) {
      if (cur < 0) onChange(0);
    } else {
      onChange(-1);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <Switch checked={on} onCheckedChange={toggle} />
        <span className="text-sm text-muted-foreground">{t("calculator.newSong")}</span>
      </div>
      {on && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{t("calculator.timeInterval")}</span>
          <TimeOffsetInput value={cur} max={NEW_WINDOW} onChange={(v) => onChange(Math.min(v, NEW_WINDOW))} />
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// 得分明细（原站 CalculatorDisplay）
// ---------------------------------------------------------------------------

function ScoreDisplay({ data, results, editable = false, showFix = false, onDataChange }) {
  const { t } = useTranslation();
  const maxPoint = Math.max(
    ...METRICS.map((m) => {
      const v = results.points[m.key];
      return Math.max(0, Number.isNaN(v) ? 0 : v);
    }),
  );

  return (
    <div className="space-y-3 xs:space-y-4">
      {showFix && (
        <div className="grid grid-cols-2 gap-1.5 text-sm xs:grid-cols-5 xs:gap-2">
          {["a", "b", "c", "d", "e"].map((k) => (
            <div key={k} className="rounded-lg bg-muted/60 px-3 py-2">
              <div className="text-xs text-muted-foreground">{t(`calculatorDisplay.fix${k.toUpperCase()}`)}</div>
              <div className="mt-0.5 font-semibold tabular-nums">×{fmt2(results.fixes[k])}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-1 border-b pb-3 xs:flex-row xs:justify-between">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold tabular-nums">{fmtInt(Number.isNaN(results.points.total) ? 0 : results.points.total)}</span>
          <span className="text-sm text-muted-foreground">{t("calculatorDisplay.totalScore")}</span>
        </div>
        <div className="text-sm text-muted-foreground">
          {results.fixes.fix_total !== 1 && (
            <div>
              {t("calculatorDisplay.basis")} {fmtInt(Number.isNaN(results.points.basis) ? 0 : results.points.basis)} ×{" "}
              {fmt2(results.fixes.fix_total)}
            </div>
          )}
          <div>数据来自术力口数据库(vocabili.top)</div>
        </div>
      </div>

      <div className="space-y-3">
        {METRICS.map((m) => {
          const value = data[m.key] ?? 0;
          let point = results.points[m.key];
          if (Number.isNaN(point)) point = 0;
          const ratio = results.ratios[m.key];
          const pct = maxPoint > 0 ? (Math.max(0, point) / maxPoint) * 100 : 0;
          const extra =
            (m.key === "coin" && ` ×${fmt2(results.fixes.a)}`) ||
            (m.key === "reply" && ` ×${fmt2(results.fixes.d)}`) ||
            "";
          const field = editable ? (
            <IntegerInput
              value={value}
              onChange={(v) => onDataChange?.(m.key, v)}
              className={METRIC_INPUT_CLS}
            />
          ) : (
            <span className="tabular-nums">{value.toLocaleString()}</span>
          );

          return (
            <div key={m.key}>
              {/* 窄屏：标签 + 输入一行，系数 + 得分一行 */}
              <div className="xs:hidden">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="shrink-0 text-muted-foreground">{t(m.label)}</span>
                  {field}
                </div>
                <div className="mt-1 flex items-center justify-between text-xs">
                  <span className="tabular-nums text-muted-foreground">
                    ×{fmt2(ratio)}
                    {extra}
                  </span>
                  <span className={`font-semibold tabular-nums ${m.text}`}>
                    {fmtInt(point)} {t("calculatorDisplay.itemScore")}
                  </span>
                </div>
              </div>

              {/* 宽屏：标签 / 输入 / 系数 / 得分 一行 */}
              <div className="hidden items-center justify-between gap-3 text-sm xs:flex">
                <span className="w-10 shrink-0 text-muted-foreground">{t(m.label)}</span>
                {field}
                <span className="flex-1 text-right text-xs tabular-nums text-muted-foreground">
                  ×{fmt2(ratio)}
                  {extra}
                </span>
                <span className={`w-32 shrink-0 text-right font-semibold tabular-nums ${m.text}`}>{fmtInt(point)}</span>
              </div>

              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all ${m.bg}`}
                  style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BV 取数（原站 q）
// ---------------------------------------------------------------------------

const BV_RE = /BV[0-9A-Za-z]{10}/;

function BvFetcher({ onFetched }) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [auto, setAuto] = useState(false);
  const [tick, setTick] = useState(0);

  // 自动刷新：每 75 秒重取一次（与原站一致）
  useEffect(() => {
    if (!auto) return undefined;
    const id = setInterval(() => setTick((v) => v + 1), 75000);
    return () => clearInterval(id);
  }, [auto]);

  const toggleAuto = () => {
    if (!auto) setTick((v) => v + 1);
    setAuto((v) => !v);
  };

  const fetchIt = useCallback(async () => {
    const raw = text.trim();
    if (!raw) return;
    const m = raw.match(BV_RE);
    if (!m) {
      setStatus({ text: t("calculator.bvInvalidInput"), error: true });
      return;
    }
    setLoading(true);
    setStatus(null);
    try {
      const d = await api(`/api/calculator/bv?bvid=${encodeURIComponent(m[0])}`, { silent: true });
      if (!d || !d.stat) {
        setStatus({ text: t("calculator.bvNoData"), error: true });
        return;
      }
      const title = d.title || m[0];
      onFetched({
        view: d.stat.view ?? 0,
        favorite: d.stat.favorite ?? 0,
        coin: d.stat.coin ?? 0,
        like: d.stat.like ?? 0,
        danmaku: d.stat.danmaku ?? 0,
        reply: d.stat.reply ?? 0,
        share: d.stat.share ?? 0,
        // 原站：只有「转载」才落到 2，其余（含未定）都按自制 1 处理
        copyright: d.copyright === 2 ? 2 : 1,
        timeOffset: d.timeOffset ?? null,
      });
      setStatus({ text: t("calculator.bvFilled", { title }) });
    } catch (e) {
      setStatus({ text: e?.message || t("calculator.bvFetchFailed"), error: true });
    } finally {
      setLoading(false);
    }
  }, [text, onFetched, t]);

  // 原站是 [tick, fetchIt] 双依赖，等于「每敲一个字都请求一次」；这里只在
  // tick 变化（挂载 / 定时 / 手动开关）时触发，避免打字期间刷接口。
  const fetchRef = useRef(fetchIt);
  fetchRef.current = fetchIt;
  useEffect(() => {
    fetchRef.current();
  }, [tick]);

  return (
    <div className="mb-6 space-y-2">
      <div className="flex flex-row justify-between">
        <p className="text-sm text-muted-foreground">{t("calculator.bvHint")}</p>
        <AutoRefreshButton autoRefresh={auto} onAutoRefreshToggle={toggleAuto} />
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setStatus(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !loading) fetchIt();
          }}
          placeholder={t("calculator.bvPlaceholder")}
          disabled={loading}
          className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm outline-none transition placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20"
        />
        <button
          type="button"
          onClick={fetchIt}
          disabled={loading || !text.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {t("calculator.bvFetch")}
        </button>
      </div>
      {status && (
        <p className={`text-sm ${status.error ? "text-destructive" : "text-muted-foreground"}`}>{status.text}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 规则 / 投稿 / 期号 / 新曲（原站 J）
// ---------------------------------------------------------------------------

function Controls({ form, onPatch }) {
  const { t } = useTranslation();

  const showCopyright = needsIssue(form.board);
  const showNewSong = form.board === "biliboard";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{t("calculator.board")}</span>
          <select
            value={form.board}
            onChange={(e) => onPatch({ board: e.target.value })}
            className={SELECT_CLS}
          >
            {BOARDS.map((b) => (
              <option key={b.value} value={b.value}>
                {t(b.labelKey)}
              </option>
            ))}
          </select>
        </div>

        {showCopyright && (
          <>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{t("calculator.copyright")}</span>
              <select
                value={form.copyright}
                onChange={(e) => onPatch({ copyright: toInt(e.target.value) })}
                className={SELECT_CLS}
              >
                {COPYRIGHTS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {t(c.labelKey)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{t("calculator.issue")}</span>
              <input
                type="number"
                min="1"
                value={form.issue ?? ""}
                onChange={(e) => onPatch({ issue: e.target.value ? Math.max(1, toInt(e.target.value)) : null })}
                className={`${SELECT_CLS} w-20`}
              />
            </div>
          </>
        )}

        {showNewSong && (
          <NewSongField value={form.timeOffset ?? -1} onChange={(v) => onPatch({ timeOffset: v })} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 页面
// ---------------------------------------------------------------------------

/** 从 URL 查询串还原表单（原站 Y） */
function parseParams(searchParams) {
  const boardRaw = searchParams.get("board");
  const board = BOARDS.some((b) => b.value === boardRaw) ? boardRaw : "vocaloid-daily";
  const num = (key, fallback) => {
    const raw = searchParams.get(key);
    if (!raw) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback;
  };
  return {
    view: num("view", 0),
    favorite: num("favorite", 0),
    coin: num("coin", 0),
    like: num("like", 0),
    danmaku: num("danmaku", 0),
    reply: num("reply", 0),
    share: num("share", 0),
    copyright: num("copyright", 1) || 1,
    board,
    issue: num("issue", 1),
    timeOffset: num("timeOffset", 0),
  };
}

export default function CalculatorPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState(() => parseParams(searchParams));

  const patch = useCallback((p) => setForm((f) => ({ ...f, ...p })), []);

  useEffect(() => {
    document.title = `${t("calculator.title")} | ${t("common.database")}`;
  }, [t]);

  // 该规则的当前期号：切换规则时填充「期号」默认值（原站取当前期号做默认）
  const period = BOARD_PERIOD[form.board];
  const issueQuery = useQuery({
    queryKey: ["calc-latest-issue", period],
    queryFn: () => api(`/api/board/all?pn=1&ps=1&order=score&period=${period}`, { silent: true }),
    enabled: Boolean(period),
    staleTime: 5 * 60 * 1000,
  });
  const appliedPeriod = useRef(null);
  useEffect(() => {
    const latest = issueQuery.data?.issue;
    if (!period || latest == null) return;
    if (appliedPeriod.current === period) return;
    appliedPeriod.current = period;
    setForm((f) => (f.board === form.board ? { ...f, issue: latest } : f));
  }, [period, issueQuery.data, form.board]);

  const data = useMemo(
    () => ({
      view: toInt(form.view),
      favorite: toInt(form.favorite),
      coin: toInt(form.coin),
      like: toInt(form.like),
      danmaku: toInt(form.danmaku),
      reply: toInt(form.reply),
      share: toInt(form.share),
    }),
    [form],
  );

  const results = useMemo(
    () =>
      computeScore(data, {
        board: form.board,
        copyright: toInt(form.copyright),
        issue: form.issue ?? 1,
        timeOffset: form.timeOffset ?? -1,
      }),
    [data, form.board, form.copyright, form.issue, form.timeOffset],
  );

  const onMetricChange = useCallback(
    (key, value) => {
      if (key in data) patch({ [key]: value });
    },
    [data, patch],
  );

  return (
    // 注意：App.jsx 布局已提供 <main>，此处不可再嵌套 main（HTML 规范禁止）
    <section className="mx-auto w-full max-w-4xl space-y-4">
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="border-b bg-muted/30 px-6 py-4">
          <h1 className="text-xl font-semibold">{t("calculator.title")}</h1>
        </div>
        <div className="p-4 sm:p-6">
          <BvFetcher onFetched={patch} />
          <Controls form={form} onPatch={patch} />
          <div className="mt-5">
            <ScoreDisplay
              data={data}
              results={results}
              editable
              showFix={hasFix(form.board)}
              onDataChange={onMetricChange}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
