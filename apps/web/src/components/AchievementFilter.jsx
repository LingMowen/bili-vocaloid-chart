import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Search, X } from "lucide-react";

// 筛选口径对齐参考站 vocabili 的 FilterSection（实测其 query 参数与档位分档）。
// 本站不加赞助墙 —— 原站把这些能力锁在「需要赞助」遮罩后，我们全部直接可用。
//
// 后端参数（见 apps/api/src/achFilter_js 顶部注释）：
//   view_ranges / favorite_ranges / coin_ranges / like_ranges /
//   danmaku_ranges / reply_ranges / share_ranges    "min-max" 逗号分隔
//   daily_rank / weekly_rank                       最佳名次上限
//   pubdate                                         2024 / 2024.05 / 2024.05.12 / 2024~2025 / 多个用 ;
//   vocalist_rules / producer_ids /
//   synthesizer_ids / uploader_ids / tag_ids        JSON 数组
//   types                                           JSON 数组（中文原词）
//   copyright                                       JSON 数字数组
//   foreign=foreign                                 仅外语曲

// 三档数值表，与后端/参考站一致
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

const METRIC_ROWS = [
  ["view", "view"],
  ["favorite", "favorite"],
  ["coin", "coin"],
  ["like", "like"],
  ["danmaku", "danmaku"],
  ["reply", "reply"],
  ["share", "share"],
];

// 视频类型编号（实测自参考站 URL 变化）
const COPYRIGHT = [
  [1, "selfOriginal"],
  [2, "reprint"],
  [3, "selfUndecided"],
  [4, "reprintUndecided"],
  [100, "selfReprint"],
  [101, "reprintSelf"],
];

const SONG_TYPES = ["原创", "翻唱", "本家重置", "串烧"];

// 区间对象 → "min-max"（缺的一侧留空，与参考站 A() 同格式）
function rangesToStr(list) {
  if (!list || !list.length) return "";
  return list
    .map((r) => (r.min != null && r.max != null ? `${r.min}-${r.max}` : r.min != null ? `${r.min}-` : `-${r.max}`))
    .join(",");
}

function strToRanges(str) {
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
  dailyRank: "",
  weeklyRank: "",
  pubdate: "",
  vocalists: [],
  producers: [],
  synthesizers: [],
  uploaders: [],
  tags: [],
  types: [],
  copyright: [],
  foreign: false,
};

// 从 URL query 读回筛选状态（刷新/分享链接都能还原）
function readFromSearch(search) {
  const p = new URLSearchParams(search || "");
  const state = { ...EMPTY, ranges: {} };
  // METRIC_ROWS 是 [key, label] 对的数组，迭代要取 [key] 而不是 Object.entries 的下标
  // （用下标会拼出 "0_ranges" 这类永远取不到值的 key，表现为「从 URL 带筛选进来时
  //   结果被过滤了、但下拉框仍显示不限」）。
  for (const [key] of METRIC_ROWS) {
    const paramKey = `${key}_ranges`;
    const v = p.get(paramKey);
    if (v) state.ranges[paramKey] = strToRanges(v);
  }
  state.dailyRank = p.get("daily_rank") || "";
  state.weeklyRank = p.get("weekly_rank") || "";
  state.pubdate = p.get("pubdate") || "";
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
  state.vocalists = arr("vocalist_rules");
  state.producers = arr("producer_ids");
  state.synthesizers = arr("synthesizer_ids");
  state.uploaders = arr("uploader_ids");
  state.tags = arr("tag_ids");
  state.types = arr("types");
  state.copyright = arr("copyright");
  state.foreign = p.get("foreign") === "foreign";
  return state;
}

// 状态 → URL query（只写已设置项，空的字段不写，保持链接短）
function writeToQuery(state) {
  const p = new URLSearchParams();
  // 同 readFromSearch：取 [key] 而非 Object.entries 的下标
  for (const [key] of METRIC_ROWS) {
    const paramKey = `${key}_ranges`;
    const s = rangesToStr(state.ranges[paramKey]);
    if (s) p.set(paramKey, s);
  }
  if (state.dailyRank) p.set("daily_rank", state.dailyRank);
  if (state.weeklyRank) p.set("weekly_rank", state.weeklyRank);
  if (state.pubdate) p.set("pubdate", state.pubdate);
  if (state.vocalists.length) p.set("vocalist_rules", JSON.stringify(state.vocalists));
  if (state.producers.length) p.set("producer_ids", JSON.stringify(state.producers));
  if (state.synthesizers.length) p.set("synthesizer_ids", JSON.stringify(state.synthesizers));
  if (state.uploaders.length) p.set("uploader_ids", JSON.stringify(state.uploaders));
  if (state.tags.length) p.set("tag_ids", JSON.stringify(state.tags));
  if (state.types.length) p.set("types", JSON.stringify(state.types));
  if (state.copyright.length) p.set("copyright", JSON.stringify(state.copyright));
  if (state.foreign) p.set("foreign", "foreign");
  return p.toString();
}

function countActive(s) {
  return (
    Object.values(s.ranges).filter((v) => v && v.length).length +
    (s.dailyRank ? 1 : 0) +
    (s.weeklyRank ? 1 : 0) +
    (s.pubdate ? 1 : 0) +
    s.vocalists.length +
    s.producers.length +
    s.synthesizers.length +
    s.uploaders.length +
    s.tags.length +
    s.types.length +
    s.copyright.length +
    (s.foreign ? 1 : 0)
  );
}

// 下拉选择器
function BandSelect({ value, options, onChange, placeholder }) {
  const { t } = useTranslation();
  // value 是区间对象 {min,max}（单选故只有一档），要映射回 <option> 的字符串值。
  // 不能直接 String(value) —— 对象会变成 "[object Object]"，与任何 option 都不匹配，
  // 表现为「从 URL 带筛选进来时下拉框永远显示不限」（value 传得进来但显示不出来）。
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

// 名次输入（"前20" 那种）
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

// 文本搜索（歌手/P主/引擎/UP主/标签）
function SearchField({ values, onChange, placeholder }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setDraft("");
  };
  return (
    <div>
      <div className="flex gap-1.5">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            placeholder={placeholder}
            className="h-9 w-full rounded-lg border bg-card pl-7 pr-2 text-xs outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      </div>
      {values.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {values.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onChange(values.filter((x) => x !== v))}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary hover:bg-primary/20"
            >
              {v}
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ToggleChip({ active, onClick, children, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`rounded-full px-3 py-1 text-xs transition ${
        active ? "bg-primary text-primary-foreground" : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

export default function FilterSection({ search, onChange, matched }) {
  const { t } = useTranslation();
  const state = useMemo(() => readFromSearch(search), [search]);
  const patch = useCallback(
    (next) => onChange(writeToQuery({ ...state, ...next })),
    [state, onChange],
  );
  const activeCount = countActive(state);

  const toggleIn = (key, value) => {
    const cur = state[key];
    patch({ [key]: cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value] });
  };

  return (
    <div className="space-y-4 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold">{t("achievements.achFilter_title")}</h3>
        <div className="flex items-center gap-2">
          {matched != null && (
            <span className="text-xs text-muted-foreground">
              {t("achievements.achFilter_matched", { n: matched })}
            </span>
          )}
          {activeCount > 0 && (
            <button
              type="button"
              onClick={() => onChange("")}
              className="rounded-lg border border-border px-2 py-1 text-[11px] text-muted-foreground transition hover:bg-accent hover:text-foreground"
            >
              {t("achievements.achFilter_resetAll")}
            </button>
          )}
        </div>
      </div>

      {/* 数值档位：7 项 */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 sm:grid-cols-4 lg:grid-cols-7">
        {METRIC_ROWS.map(([key, label]) => (
          <div key={key}>
            <p className="mb-1 text-[11px] text-muted-foreground">{t(`video.${label}`)}</p>
            <BandSelect
              value={state.ranges[`${key}_ranges`]?.[0] ?? null}
              options={BANDS[key]}
              placeholder={t("achievements.achFilter_unlimited")}
              onChange={(band) =>
                patch({ ranges: { ...state.ranges, [`${key}_ranges`]: band ? [band] : [] } })
              }
            />
          </div>
        ))}
        {/* 最佳名次 */}
        <div>
          <p className="mb-1 text-[11px] text-muted-foreground">{t("achievements.achFilter_dailyRank")}</p>
          <RankInput
            value={state.dailyRank}
            onChange={(v) => patch({ dailyRank: v })}
            placeholder={t("achievements.achFilter_topN")}
          />
        </div>
        <div>
          <p className="mb-1 text-[11px] text-muted-foreground">{t("achievements.achFilter_weeklyRank")}</p>
          <RankInput
            value={state.weeklyRank}
            onChange={(v) => patch({ weeklyRank: v })}
            placeholder={t("achievements.achFilter_topN")}
          />
        </div>
        <div>
          <p className="mb-1 text-[11px] text-muted-foreground">{t("achievements.achFilter_pubdate")}</p>
          <input
            type="text"
            value={state.pubdate}
            onChange={(e) => patch({ pubdate: e.target.value })}
            placeholder={t("achievements.achFilter_pubdatePlaceholder")}
            className="h-9 w-full rounded-lg border bg-card px-2 text-xs outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      </div>

      {/* 文本搜索 */}
      <div className="grid gap-x-3 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <p className="mb-1 text-[11px] text-muted-foreground">{t("achievements.achFilter_vocalist")}</p>
          <SearchField
            values={state.vocalists}
            onChange={(v) => patch({ vocalists: v })}
            placeholder={t("achievements.achFilter_searchPlaceholder")}
          />
        </div>
        <div>
          <p className="mb-1 text-[11px] text-muted-foreground">{t("achievements.achFilter_producer")}</p>
          <SearchField
            values={state.producers}
            onChange={(v) => patch({ producers: v })}
            placeholder={t("achievements.achFilter_searchPlaceholder")}
          />
        </div>
        <div>
          <p className="mb-1 text-[11px] text-muted-foreground">{t("achievements.achFilter_synthesizer")}</p>
          <SearchField
            values={state.synthesizers}
            onChange={(v) => patch({ synthesizers: v })}
            placeholder={t("achievements.achFilter_searchPlaceholder")}
          />
        </div>
        <div>
          <p className="mb-1 text-[11px] text-muted-foreground">{t("achievements.achFilter_uploader")}</p>
          <SearchField
            values={state.uploaders}
            onChange={(v) => patch({ uploaders: v })}
            placeholder={t("achievements.achFilter_searchPlaceholder")}
          />
        </div>
        <div>
          <p className="mb-1 text-[11px] text-muted-foreground">{t("achievements.achFilter_tag")}</p>
          <SearchField
            values={state.tags}
            onChange={(v) => patch({ tags: v })}
            placeholder={t("achievements.achFilter_searchPlaceholder")}
          />
        </div>
      </div>

      {/* 歌曲类型 / 视频类型 / 仅外语曲 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-border/60 pt-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">{t("achievements.achFilter_songType")}</span>
          {SONG_TYPES.map((s) => (
            <ToggleChip key={s} active={state.types.includes(s)} onClick={() => toggleIn("types", s)}>
              {t(`achievements.achFilter_type_${s}`)}
            </ToggleChip>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">{t("achievements.achFilter_videoType")}</span>
          {COPYRIGHT.map(([code, key]) => (
            <ToggleChip
              key={code}
              active={state.copyright.includes(code)}
              onClick={() => toggleIn("copyright", code)}
            >
              {t(`achievements.achFilter_cr_${key}`)}
            </ToggleChip>
          ))}
        </div>
        <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-xs">
          <span className="text-muted-foreground">{t("achievements.achFilter_foreign")}</span>
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