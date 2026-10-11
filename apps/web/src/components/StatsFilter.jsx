import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";

// 统计页筛选面板（口径对齐参考站 vocabili /stats 的 FilterSection）。
// 实测原站统计页的筛选项共 5 组，本组件一一对应：
//   1. 七个数值档位：播放 / 收藏 / 硬币 / 点赞 / 弹幕 / 评论 / 分享
//   2. 上榜记录：日刊上榜 / 周刊上榜（次数档位 + 最佳名次）
//   3. 发布时间
//   4. 歌曲类型：原创 / 翻唱 / 本家重置 / 串烧
//   5. 视频类型：自制 / 转载 / 自制投未定 / 转载投未定 / 自制投转载 / 转载投自制
//      另有「仅外语曲」开关。
// 原站把这些锁在「需要赞助」遮罩后，本站不加赞助墙 —— 全部直接可用。
//
// 注意：原站统计页**没有**歌手/P主/引擎/UP主/标签搜索框（那是成就页的），故此处不做。

// 三档数值表，与后端 achFilter.js 及参考站一致
const BANDS = {
  view: [
    { label: "1000万+", min: 1e7 },
    { label: "100万+", min: 1e6 },
    { label: "10万+", min: 1e5 },
    { label: "1万+", min: 1e4 },
    { label: "1万以下", max: 1e4 },
  ],
  favorite: [
    { label: "100万+", min: 1e6 },
    { label: "10万+", min: 1e5 },
    { label: "1万+", min: 1e4 },
    { label: "1000+", min: 1e3 },
    { label: "1000以下", max: 1e3 },
  ],
  coin: [
    { label: "100万+", min: 1e6 },
    { label: "10万+", min: 1e5 },
    { label: "1万+", min: 1e4 },
    { label: "1000+", min: 1e3 },
    { label: "1000以下", max: 1e3 },
  ],
  like: [
    { label: "100万+", min: 1e6 },
    { label: "10万+", min: 1e5 },
    { label: "1万+", min: 1e4 },
    { label: "1000+", min: 1e3 },
    { label: "1000以下", max: 1e3 },
  ],
  danmaku: [
    { label: "100+", min: 100 },
    { label: "50+", min: 50 },
    { label: "20+", min: 20 },
    { label: "10+", min: 10 },
    { label: "1+", min: 1 },
  ],
  reply: [
    { label: "100+", min: 100 },
    { label: "50+", min: 50 },
    { label: "20+", min: 20 },
    { label: "10+", min: 10 },
    { label: "1+", min: 1 },
  ],
  share: [
    { label: "100+", min: 100 },
    { label: "50+", min: 50 },
    { label: "20+", min: 20 },
    { label: "10+", min: 10 },
    { label: "1+", min: 1 },
  ],
};

// 上榜次数档位（与数值档位不同量级，单独一套）
const COUNT_BANDS = [
  { label: "10次+", min: 10 },
  { label: "5次+", min: 5 },
  { label: "3次+", min: 3 },
  { label: "2次+", min: 2 },
  { label: "1次+", min: 1 },
];

const METRIC_ROWS = [
  ["view", "view"],
  ["favorite", "favorite"],
  ["coin", "coin"],
  ["like", "like"],
  ["danmaku", "danmaku"],
  ["reply", "reply"],
  ["share", "share"],
];

// 视频类型编号（实测自参考站：点击按钮后 URL 变成 copyright=[N]）
const COPYRIGHT = [
  [1, "selfOriginal"],
  [2, "reprint"],
  [3, "selfUndecided"],
  [4, "reprintUndecided"],
  [100, "selfReprint"],
  [101, "reprintSelf"],
];

const SONG_TYPES = ["原创", "翻唱", "本家重置", "串烧"];

// 区间 <-> "min-max"（缺的一侧留空）
function toStr(list) {
  if (!list || !list.length) return "";
  return list
    .map((r) =>
      r.min != null && r.max != null ? `${r.min}-${r.max}` : r.min != null ? `${r.min}-` : `-${r.max}`,
    )
    .join(",");
}

function fromStr(str) {
  if (!str) return [];
  return String(str)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((seg) => {
      const i = seg.indexOf("-");
      const lo = i === -1 ? seg : seg.slice(0, i);
      const hi = i === -1 ? "" : seg.slice(i + 1);
      const out = {};
      if (lo !== "") out.min = Number(lo);
      if (hi !== "") out.max = Number(hi);
      return out;
    })
    .filter((r) => Number.isFinite(r.min) || Number.isFinite(r.max));
}

const EMPTY = {
  ranges: {},
  daily_count_ranges: [],
  weekly_count_ranges: [],
  daily_rank: "",
  weekly_rank: "",
  pubdate: "",
  types: [],
  copyright: [],
  foreign: false,
};

// URL query <-> 状态
function readFromSearch(search) {
  const p = new URLSearchParams(search || "");
  const s = { ...EMPTY, ranges: {} };
  for (const [key] of METRIC_ROWS) {
    const pk = `${key}_ranges`;
    const v = p.get(pk);
    if (v) s.ranges[pk] = fromStr(v);
  }
  s.daily_count_ranges = fromStr(p.get("daily_count_ranges"));
  s.weekly_count_ranges = fromStr(p.get("weekly_count_ranges"));
  s.daily_rank = p.get("daily_rank") || "";
  s.weekly_rank = p.get("weekly_rank") || "";
  s.pubdate = p.get("pubdate") || "";
  const arr = (key) => {
    const v = p.get(key);
    if (!v) return [];
    try {
      const a = JSON.parse(v);
      return Array.isArray(a) ? a : [];
    } catch (e) {
      return [];
    }
  };
  s.types = arr("types");
  s.copyright = arr("copyright");
  s.foreign = p.get("foreign") === "foreign";
  return s;
}

function writeToQuery(state) {
  const p = new URLSearchParams();
  for (const [key] of METRIC_ROWS) {
    const pk = `${key}_ranges`;
    const s = toStr(state.ranges[pk]);
    if (s) p.set(pk, s);
  }
  const dc = toStr(state.daily_count_ranges);
  if (dc) p.set("daily_count_ranges", dc);
  const wc = toStr(state.weekly_count_ranges);
  if (wc) p.set("weekly_count_ranges", wc);
  if (state.daily_rank) p.set("daily_rank", state.daily_rank);
  if (state.weekly_rank) p.set("weekly_rank", state.weekly_rank);
  if (state.pubdate) p.set("pubdate", state.pubdate);
  if (state.types.length) p.set("types", JSON.stringify(state.types));
  if (state.copyright.length) p.set("copyright", JSON.stringify(state.copyright));
  if (state.foreign) p.set("foreign", "foreign");
  return p.toString();
}

function countActive(s) {
  return (
    Object.values(s.ranges).filter((v) => v && v.length).length +
    (s.daily_count_ranges.length ? 1 : 0) +
    (s.weekly_count_ranges.length ? 1 : 0) +
    (s.daily_rank ? 1 : 0) +
    (s.weekly_rank ? 1 : 0) +
    (s.pubdate ? 1 : 0) +
    s.types.length +
    s.copyright.length +
    (s.foreign ? 1 : 0)
  );
}

// 下拉选择器
function BandSelect({ value, options, onChange, placeholder }) {
  // value 是区间对象 {min,max}（单选故只有一档），映射回 option 的字符串值。
  // 不能 String(value) —— 对象会变 "[object Object]"，与任何 option 都不匹配。
  const optValue = (b) => (b.max != null ? `${b.max}:max` : String(b.min));
  const current = value ? optValue(value) : "";
  return (
    <select
      value={current}
      onChange={(e) => {
        const v = e.target.value;
        if (!v) onChange(null);
        else onChange(v.endsWith(":max") ? { max: Number(v.slice(0, -4)) } : { min: Number(v) });
      }}
      className="h-9 w-full rounded-lg border bg-card px-2 text-xs outline-none focus:ring-2 focus:ring-primary/30"
    >
      <option value="">{placeholder}</option>
      {options.map((b) => (
        <option key={b.label} value={optValue(b)}>
          {b.label}
        </option>
      ))}
    </select>
  );
}

function RankInput({ value, onChange, placeholder }) {
  return (
    <input
      type="number"
      min={1}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="h-9 w-full rounded-lg border bg-card px-2 text-xs outline-none focus:ring-2 focus:ring-primary/30"
    />
  );
}

function ToggleChip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-3 py-1 text-xs transition ${
        active
          ? "bg-primary text-primary-foreground"
          : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

export default function StatsFilter({ search, onChange, matched }) {
  const { t } = useTranslation();
  const state = useMemo(() => readFromSearch(search), [search]);
  const patch = useCallback((next) => onChange(writeToQuery({ ...state, ...next })), [state, onChange]);
  const activeCount = countActive(state);

  const toggleIn = (key, value) => {
    const cur = state[key];
    patch({ [key]: cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value] });
  };

  return (
    <div className="space-y-4 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold">{t("stats.stats_filter_title")}</h3>
        <div className="flex items-center gap-2">
          {matched != null && (
            <span className="text-xs text-muted-foreground">{t("stats.stats_filter_matched", { n: matched })}</span>
          )}
          {/* 「清除全部」常驻，用 invisible 占位而不是条件渲染：
              条件渲染会让按钮在首次筛选时突然插入，标题行高度变化把整页顶下去，
              视觉上像页面「动了一下」。保持节点在 DOM 里、只切可见性即可高度恒定。 */}
          <button
            type="button"
            onClick={() => onChange("")}
            disabled={activeCount === 0}
            tabIndex={activeCount === 0 ? -1 : 0}
            className={`rounded-lg border border-border px-2 py-1 text-[11px] transition ${
              activeCount > 0
                ? "text-muted-foreground hover:bg-accent hover:text-foreground"
                : "invisible pointer-events-none"
            }`}
          >
            {t("stats.stats_filter_resetAll")}
          </button>
        </div>
      </div>

      {/* 七个数值档位 */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 sm:grid-cols-4 lg:grid-cols-7">
        {METRIC_ROWS.map(([key, label]) => (
          <div key={key}>
            <p className="mb-1 text-[11px] text-muted-foreground">{t("video." + label)}</p>
            <BandSelect
              value={state.ranges[`${key}_ranges`]?.[0] ?? null}
              options={BANDS[key]}
              placeholder={t("stats.stats_filter_unlimited")}
              onChange={(band) =>
                patch({ ranges: { ...state.ranges, [`${key}_ranges`]: band ? [band] : [] } })
              }
            />
          </div>
        ))}
      </div>

      {/* 上榜记录 + 发布时间 */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 sm:grid-cols-3 lg:grid-cols-5">
        <div>
          <p className="mb-1 text-[11px] text-muted-foreground">{t("stats.stats_filter_dailyCount")}</p>
          <BandSelect
            value={state.daily_count_ranges[0] ?? null}
            options={COUNT_BANDS}
            placeholder={t("stats.stats_filter_unlimited")}
            onChange={(band) => patch({ daily_count_ranges: band ? [band] : [] })}
          />
        </div>
        <div>
          <p className="mb-1 text-[11px] text-muted-foreground">{t("stats.stats_filter_weeklyCount")}</p>
          <BandSelect
            value={state.weekly_count_ranges[0] ?? null}
            options={COUNT_BANDS}
            placeholder={t("stats.stats_filter_unlimited")}
            onChange={(band) => patch({ weekly_count_ranges: band ? [band] : [] })}
          />
        </div>
        <div>
          <p className="mb-1 text-[11px] text-muted-foreground">{t("stats.stats_filter_dailyRank")}</p>
          <RankInput
            value={state.daily_rank}
            onChange={(v) => patch({ daily_rank: v })}
            placeholder={t("stats.stats_filter_topN")}
          />
        </div>
        <div>
          <p className="mb-1 text-[11px] text-muted-foreground">{t("stats.stats_filter_weeklyRank")}</p>
          <RankInput
            value={state.weekly_rank}
            onChange={(v) => patch({ weekly_rank: v })}
            placeholder={t("stats.stats_filter_topN")}
          />
        </div>
        <div>
          <p className="mb-1 text-[11px] text-muted-foreground">{t("stats.stats_filter_pubdate")}</p>
          <input
            type="text"
            value={state.pubdate}
            onChange={(e) => patch({ pubdate: e.target.value })}
            placeholder={t("stats.stats_filter_pubdatePlaceholder")}
            className="h-9 w-full rounded-lg border bg-card px-2 text-xs outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      </div>

      {/* 歌曲类型 / 视频类型 / 仅外语曲 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-border/60 pt-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">{t("stats.stats_filter_songType")}</span>
          {SONG_TYPES.map((s) => (
            <ToggleChip key={s} active={state.types.includes(s)} onClick={() => toggleIn("types", s)}>
              {t(`stats.stats_filter_type_${s}`)}
            </ToggleChip>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">{t("stats.stats_filter_videoType")}</span>
          {COPYRIGHT.map(([code, key]) => (
            <ToggleChip
              key={code}
              active={state.copyright.includes(code)}
              onClick={() => toggleIn("copyright", code)}
            >
              {t(`stats.stats_filter_cr_${key}`)}
            </ToggleChip>
          ))}
        </div>
        <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-xs">
          <span className="text-muted-foreground">{t("stats.stats_filter_foreign")}</span>
          <button
            type="button"
            role="switch"
            aria-checked={state.foreign}
            onClick={() => patch({ foreign: !state.foreign })}
            className={`relative h-5 w-9 rounded-full transition ${state.foreign ? "bg-primary" : "bg-muted"}`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
                state.foreign ? "left-[18px]" : "left-0.5"
              }`}
            />
          </button>
        </label>
      </div>
    </div>
  );
}