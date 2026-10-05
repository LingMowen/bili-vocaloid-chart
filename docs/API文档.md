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
| `GET` | `/api/achievements` | 成就定义与达成（详见 §5.1） |
| `GET` | `/api/evostats` | eVocalRank 同步统计（期数、覆盖） |

### 5.1 `/api/achievements` 成就

**参数**

| 参数 | 取值 | 默认 | 说明 |
|---|---|---|---|
| `board` | `daily` \| `weekly` \| `monthly` \| `annual` \| `all` | `weekly` | 榜单维度；`all` 跨榜混排 |
| `type` | 见下方 9 类 `key`，或 `all` | `emerging_hit` | 成就类别 |
| `status` | `active` | `active` | 保留字段 |
| `page` | 1 起 | `1` | 页码 |
| `page_size` | 1–60 | `20` | 每页条数 |

**九类成就**

| `key` | 名称 | 判定 | 数据源 |
|---|---|---|---|
| `emerging_hit` | Emerging Hit! | 连续 3 期主榜前 5 | 榜单位次 |
| `mega_hit` | Mega Hit!!! | 连续 5 期主榜前 3 | 榜单位次 |
| `potential_regular` | 门番候补 | 15 期内有 10 期前 20 | 榜单位次 |
| `regular` | 门番 | 30 期内有 20 期前 20 | 榜单位次 |
| `daily_regular` | 日刊门番 | 30 期内有 20 期前 20 | 榜单位次（日刊） |
| `daily_potential_regular` | 日刊门番候补 | 15 期内有 10 期前 20 | 榜单位次（日刊） |
| `hall_of_fame` | 殿堂曲 | 累计播放量 ≥ 100,000 | **库内 `item.view`（与榜位无关）** |
| `legend` | 传说曲 | 累计播放量 ≥ 1,000,000 | 同上 |
| `myth` | 神话曲 | 累计播放量 ≥ 10,000,000 | 同上 |

> 后三类不看榜位、不看历史期数，四个 `board` 取值下结果相同；20545 库实测 **3636 / 563 / 26** 首。

**响应要点**

- `data.categories[]`：九类定义，含 `key` / `label` / `description` / `color`，播放量三类额外含 `viewThreshold`。
- 播放量类条目：`meta = { view, threshold }`，`ranks` 为空对象，`start_issue` / `end_issue` / `achieved_issue` 为 `null`。
- **达成时间**由 `stat_daily` 逐日快照回溯（播放量首次跨过门槛的那一天），快照粒度为天且只覆盖最近一段，因此用 `achieved_precision` 标明精度，不要当成精确值：

  | 值 | 含义 | 显示 |
  |---|---|---|
  | `exact` | 某日快照首次达标 | `2026-09-27 达成` |
  | `before` | 只能确定早于该日 | `2026-08-13 之前已达成` |
  | `after` | 观测期内未出现达标日 | `2026-10-05 之后达成` |

  `achieved_basis` 说明依据：

  | 值 | 依据 |
  |---|---|
  | `stat_daily` | 站内每日快照（`cache/stat_daily`，约 44 天） |
  | `chart-accum` | eVocalRank / biliran 周榜播放增量累加到该日时已越线。榜单只记录上榜周，所以累加值是真实累计的**下界**；下界达标即为事实，故该日期可靠（比快照上界早数年） |

  优先级：`exact`（快照精确日） > `chart-accum` 上界 > 快照最早日。实测可定上界的数量：殿堂曲 1119/3636、传说曲 124/563、神话曲 6/26；其余受数据源覆盖限制（未上过榜 / 无历史快照），标注如实保留。
- `periods_available` / `has_gap` 仅对榜位类有意义。

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
