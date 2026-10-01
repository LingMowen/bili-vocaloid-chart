// 汇总 tmp-ui-audit3.js 产出的 diff.json，输出「跨页高频差异」Markdown 整改清单。
// 用法: node scripts/ui-diff-summary.js [diff.json路径] [-o 输出.md]
const fs = require("fs");
const path = require("path");

const ROOT = "E:/编程/xngschina";
const argv = process.argv.slice(2);
let IN = path.join(ROOT, "tmp-ui", "audit3", "diff.json");
let OUT = "";
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "-o") { OUT = argv[++i]; continue; } // 注意 i 要自增，否则 -o 的值会被当成输入路径
  if (!a.startsWith("-")) IN = a;
}

const rows = JSON.parse(fs.readFileSync(IN, "utf8"));

// ---- 跨页频次统计 ----
const missFreq = new Map();   // 参考有、当前没有的布局 class
const extraFreq = new Map();  // 当前有、参考没有
const navRefFreq = new Map();
const navCurFreq = new Map();
const secRefFreq = new Map();
const secCurFreq = new Map();

const bump = (m, k, where) => {
  if (!k) return;
  if (!m.has(k)) m.set(k, { n: 0, where: new Set() });
  const v = m.get(k);
  v.n++;
  v.where.add(where);
};

// 可比性：参考站登录墙 / 参考页本身没内容 的页，差异全是假的，必须排除出统计
const isComparable = (r) => !!r.cur && !!r.ref && !r.refLoginWall && !r.refThin;
const comparable = rows.filter(isComparable);
const walled = rows.filter((r) => r.refLoginWall);
const thinned = rows.filter((r) => r.refThin && !r.refLoginWall);

for (const r of comparable) {
  (r.miss || []).forEach((t) => bump(missFreq, t, r.name));
  (r.extra || []).forEach((t) => bump(extraFreq, t, r.name));
  (r.navDiff?.refOnly || []).forEach((t) => bump(navRefFreq, t, r.name));
  (r.navDiff?.curOnly || []).forEach((t) => bump(navCurFreq, t, r.name));
  (r.sectionDiff?.refOnly || []).forEach((t) => bump(secRefFreq, t, r.name));
  (r.sectionDiff?.curOnly || []).forEach((t) => bump(secCurFreq, t, r.name));
}

const sorted = (m, minN = 2) =>
  [...m.entries()]
    .filter(([, v]) => v.n >= minN)
    .sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]));

const list = (m, minN = 2, max = 25) =>
  sorted(m, minN)
    .slice(0, max)
    .map(([k, v]) => `- \`${k}\` — 出现在 ${v.n} 页（${[...v.where].slice(0, 6).join("、")}${v.where.size > 6 ? " 等" : ""}）`)
    .join("\n") || "_（无跨页高频项）_";

// ---- 逐页概览 ----
const ok = comparable;
const bad = rows.filter((r) => !r.cur || !r.ref);
const avg = ok.length ? (ok.reduce((s, r) => s + r.jaccard, 0) / ok.length) : 0;
const graded = [...ok].sort((a, b) => a.jaccard - b.jaccard);

const pageTable = [...graded]
  .map((r) => {
    const jac = Math.round(r.jaccard * 100);
    const lvl = jac >= 80 ? "高" : jac >= 60 ? "中" : jac >= 40 ? "低" : "很低";
    return `| ${r.kind} | \`${r.route}\` | \`${r.refRoute || r.ref}\` | ${jac}% | ${lvl} | ${r.card?.cur ?? "-"} / ${r.card?.ref ?? "-"} | ${r.container?.cur || "-"} / ${r.container?.ref || "-"} |`;
  })
  .join("\n");

const flagOf = (r) => (r.refLoginWall ? "⚠️ 参考站登录墙，不可比" : r.refThin ? "⚠️ 参考页本身无内容（空态/未渲染）" : "✅ 可比");
const exclTable = [...walled, ...thinned]
  .map(
    (r) =>
      `| ${r.kind} | \`${r.route}\` | \`${r.refRoute || r.ref}\` | ${flagOf(r)} | ${r.refTextLen ?? r.ref?.mainTextLen ?? 0} |`
  )
  .join("\n");

const emptyRef = ok.filter((r) => r.refEmpty).map((r) => r.kind);

const md = `# 全页 UI 对齐巡检汇总（当前站 vs vocabili）

- 数据源：\`tmp-ui/audit3/diff.json\`（由 \`tmp-ui-audit3.js\` 生成）
- 页面类型数：${rows.length}；**有效可比 ${ok.length}**，采集失败 ${bad.length}
- **平均 class 重叠率（仅有效可比页）：${(avg * 100).toFixed(1)}%**

> 口径说明 1：jaccard 只衡量**布局 class 词汇**的重合度，数值低不等于视觉错，
> 需结合截图与实际组件判断。本报告只用于**定位候选差异**，不直接判定对错。
>
> 口径说明 2：**参考站部分页面有登录墙**（注入的 session 会过期），或页面本身就是空态
> （如搜索页无关键词）。这些页的"差异"全是假的，已排除，不计入任何统计。

### 排除项（不可作为整改依据）

| 页面类型 | 当前路由 | 参考路由 | 排除原因 | 参考正文长度 |
|---|---|---|---|---|
${exclTable || "| _无_ | | | | |"}

## 一、逐页重叠率（升序，最需要看的在前面）

| 页面类型 | 当前路由 | 参考路由 | class重叠 | 档位 | 卡片数(当/参) | 容器(当/参) |
|---|---|---|---|---|---|---|
${pageTable}

${bad.length ? `**采集失败：** ${bad.map((r) => `${r.kind}(${r.error})`).join("；")}` : ""}

## 二、跨页高频差异（≥2 页同时出现 = 全局性问题，优先整改）

### 2.1 当前站**缺失**的布局 class（参考站有）
${list(missFreq)}

### 2.2 当前站**多出**的布局 class（参考站没有）
${list(extraFreq)}

### 2.3 导航项差异
**参考站有、当前站没有：**
${sorted(navRefFreq, 2).slice(0, 30).map(([k, v]) => `- ${k}（${v.n} 页）`).join("\n") || "_无_"}

**当前站有、参考站没有：**
${sorted(navCurFreq, 2).slice(0, 30).map(([k, v]) => `- ${k}（${v.n} 页）`).join("\n") || "_无_"}

### 2.4 区块（section 标题）差异
**参考站独有：**
${sorted(secRefFreq, 1).slice(0, 30).map(([k, v]) => `- ${k}（${v.n} 页）`).join("\n") || "_无_"}

**当前站独有：**
${sorted(secCurFreq, 1).slice(0, 30).map(([k, v]) => `- ${k}（${v.n} 页）`).join("\n") || "_无_"}

## 三、逐页明细（缺失 / 多出 class 前 12 项）

${graded
  .map((r) => {
    const miss = (r.miss || []).slice(0, 12).map((t) => `\`${t}\``).join(" ") || "_无_";
    const extra = (r.extra || []).slice(0, 12).map((t) => `\`${t}\``).join(" ") || "_无_";
    const jac = Math.round(r.jaccard * 100);
    return `### ${r.kind} · ${r.name}（重叠 ${jac}%）${r.refEmpty ? " ⚠参考内容偏空" : ""}

- 当前 \`${r.route}\` · 参考 \`${r.refRoute || r.ref}\`
- 正文长度 ${r.textLen?.cur} / ${r.textLen?.ref}；卡片 ${r.card?.cur} / ${r.card?.ref}
- 缺失：${miss}
- 多出：${extra}`;
  })
  .join("\n\n")}
`;

if (OUT) {
  fs.writeFileSync(OUT, md, "utf8");
  console.log("written ->", OUT);
} else {
  console.log(md);
}
