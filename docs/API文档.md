# 本站 API 文档

> 后端 `apps/api`（Express，默认端口 **1003**；进度页独立端口 **1006**）。
> 全部依据 `apps/api/src/index.js` 路由源码整理，2026-10-05 更新。
> 统一响应体：`{ ok: true, data: ... }` 或 `{ ok: false, message: "..." }`。

## 端口与访问

| 端口 | 服务 | 说明 |
|---|---|---|
| **1003** | 后端 API | 主服务 |
| **1006** | 进度页 | `http://127.0.0.1:1006/progress`，**仅本地 IP 可访问**（非 127/::1 返回 403），静态服务 `apps/api/public/` |

---

## 一、榜单

### `GET /api/board/:kind`
榜单主接口。

| 参数 | 必填 | 说明 |
|---|---|---|
| `kind` | ✅ | 路径参数，`cn` / `intl` / `all`（中文榜/其他语言榜/综合榜） |
| `period` | | `daily` / `weekly` / `monthly` / `annual`，默认 `daily` |
| `issue` | | 期号，默认最新期 |
| `pn` / `ps` | | 页码/每页条数，`pn` 1-100，`ps` 1-50（超限报 400） |
| `order` | | 排序字段，默认 `score`；`new` 筛选新曲 |

**返回**：`{ kind, order, period, issue, latest_issue, min_issue, prev_issue, next_issue,
date_start, date_end, score_mode, count, new_count, orders, list }`

**条目字段**：`aid, bvid, title, pic, duration, pubdate, lang, tags, girls(歌姬), owner,
score, view/favorite/coin/like/danmaku/reply/share（增量）, data_source, score_mode,
period, issue, new, prev_rank, prev_score, delta, streak, peak_rank, achievements,
evo_periods, evo_start, evo_end, avg_days`

- `data_source`：`snapshot`（快照差分）/ `evocalrank` / `biliran` / `current`（窗口内新歌期末累计）
- `score_mode`：`daily-avg-sum`（2026-10-05 新公式：整窗增量÷天数=日均，Σ 单日分）

### `GET /api/board/singers`
本期歌手/P主排行。

| 参数 | 说明 |
|---|---|
| `period` | daily/weekly/monthly/annual，默认 daily |
| `issue` | 期号 |
| `limit` | 1-30，或 `all` / `-1` 不限量，默认 10 |
| `kind` | `cn` / `intl` / `all` |
| `type` | `singer`（歌姬，默认）/ `producer`（P主） |

### `GET /api/board/milestones`
里程碑（百万播放等）达成记录。

---

## 二、歌曲 / 视频

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/video/:aid` | 视频详情（含七项统计），带进程内缓存 |
| `GET` | `/api/calculator/bv?bvid=BV...` | 按 BV 号取实时数据（供分数计算器），返回 `stat` + `timeOffset`（距最近周二 00:00 秒数） |
| `GET` | `/api/song-history/:aid` | 该歌曲的历史榜单记录 |
| `GET` | `/api/video/:aid/girls` | 歌曲关联的歌姬 |
| `GET` | `/api/video/:aid/related` | 关联作品推荐 |
| `GET` | `/api/stat-snapshots/:aid` | 该歌曲的每日快照序列（增量来源） |
| `GET` | `/api/video/:aid/comments` | 评论列表 |
| `POST` | `/api/video/:aid/comments` | 发表评论（**需登录** `requireAuth`） |
| `DELETE` | `/api/comments/:id` | 删除评论（**需登录**） |
| `GET` | `/api/me/comments` | 我的评论（**需登录**） |
| `GET` | `/api/random` | 随机推荐歌曲 |

---

## 三、搜索

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/search` | 全库搜索，支持关键词/歌姬/标签等（参数见源码 :435） |
| `GET` | `/api/search/hot` | 热门搜索词 |
| `GET` | `/api/owners` | UP 主列表 |
| `GET` | `/api/owner/:mid` | 指定 UP 主详情与作品 |
| `GET` | `/api/member/:mid` | B 站会员信息 |

---

## 四、歌姬 / 歌手（vocalist）

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/vocalist/:id` | 歌姬详情 |
| `GET` | `/api/vocalist/:id/stats/summary` | 统计摘要 |
| `GET` | `/api/vocalist/:id/songs/:kind` | 歌曲列表（`latest` / `top`） |
| `GET` | `/api/vocalist/:id/synthesizers` | 使用的合成引擎 |
| `GET` | `/api/vocalist/:id/producers` | 合作 P 主 |
| `GET` | `/api/girls` | 全量歌姬列表 |
| `GET` | `/api/singers` | 歌手列表（含 vocabili_id，供跳转） |
| `GET` | `/api/engines` | 合成引擎列表 |

---

## 五、统计 / 聚合

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/stats` | 站点总体统计（库存、歌姬数等） |
| `GET` | `/api/tags` | 标签聚合 |
| `GET` | `/api/today` | 今日概览 |
| `GET` | `/api/achievements` | 成就定义与达成 |
| `GET` | `/api/evostats` | eVocalRank 同步统计（期数、覆盖） |

---

## 六、进度与运维（仅本地 `requireLocal`）

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/progress/stream` | **SSE** 实时进度流。事件：`snapshot`（初始快照）、`event`、`cycle:start`、`cycle:end`、`stage:update`、`review:update`、`refresh:update`；15s 心跳 `: ping` |
| `GET` | `/api/progress/history` | 进度快照：`{ history, cycles, current, review, refresh }` |
| `POST` | `/api/collect/trigger` | 触发采集。body `{ force: boolean }`；`force=false` 时若库在 60 分钟内刷新过会跳过（INCREMENTAL_TTL）；进行中返回 409 |
| `POST` | `/api/refresh/trigger` | 触发数据刷新（只刷库内已有条目，不新增收录）。body `{ full: boolean, limit?: number }`；`full=true` → 全量（预算 30 分钟）；刷新中返回 409 |

**`refresh` 状态对象**：`{ running, total, targets, done, errors, startedAt, updatedAt, snapshot, ms, endedAt, truncated }`

> ⚠️ PowerShell 里 `curl -d '{"force":true}'` 单引号会被吞成非法 JSON → 500。改用 node/Postman 发请求。

---

## 七、认证

- `app.use("/api/auth", makeAuthRouter())` —— 登录路由挂载在 `/api/auth/*`。
- OAuth 回调：`GET /api/auth/oauth/callback?type=qq|...&code=...`
- 需要登录的接口用 `requireAuth` 装饰器。

---

## 八、调度（后端自动任务，非 HTTP）

在 `app.listen` 回调中挂载：

| 周期 | 任务 | 说明 |
|---|---|---|
| 每 **5 分钟** | 数据刷新 + 统分 | `refreshStats`，只刷库内已有条目 stat/score，不新增收录；补写当日 `stat_daily` 快照 |
| 每 **2 小时** | 收录 + 审核 | `collectAll(false)` + `reviewPending` |
| 每天北京时间 **4:00** | vocabili 日刊同步 | `scheduleDailyAt(4, syncVocabili)`（显式 +8 偏移，不依赖本地时区） |
| 每 **24 小时** | eVocalRank 同步 | `syncEvo` |
| 启动后 20s / 90s | 首次刷新 / 首次收录 | 避免与启动序列抢闸 |

---

## 附：计分口径（2026-10-05 新公式）

```
单日总分 = log₂(ΔV + 100) × S_互动 × T_时间 × Fix
S_互动 = (ΔL + 3ΔB + 4ΔF + 2ΔC + ΔD) / (ΔV + 200) × 1000
T: t≤4 → 1.6-0.15t ; 5≤t≤14 → 1.0 ; t>14 → 21/(t+7)
Fix: S<0.2·Avg → 0.3 ; S>5·Avg → 5·Avg/S ; 否则 1.0（Avg = 当日全库有增量条目的 S 均值，去语种）
周期总分 = Σ 每天单日总分（无逐日快照时用整窗增量÷天数作日均）
```

详细见 `docs/scoring/`。
