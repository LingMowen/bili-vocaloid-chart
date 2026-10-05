# 第三方 API 文档

> 本站（Rhythm Vocaloid / bili-vocaloid-chart）依赖的外部接口清单与使用说明。
> 全部依据 `apps/api/src/` 下各模块源码实测整理，2026-10-05 更新。

## 总览

| 第三方 | 用途 | 模块 | 鉴权 | 状态 |
|---|---|---|---|---|
| **B 站（bilibili）** | 视频数据、搜索、评论 | `bili.js`（`@aemeath-projects/bilibili` SDK） | Cookie（可选） | ✅ 主力数据源 |
| **eVocalRank** | 周刊历史增量（2022-07 至今，220 期） | `evocalrank.js` / `evoStats.js` | 无 | ✅ 补数源 |
| **biliran（cpk.moe）** | 周刊累计快照（2013~2022-08，405 期） | `biliranSync.js` | 无 | ✅ 补数源（缺 coin/like） |
| **vocabili** | 日刊发现源（仅取 ID） | `vocabili.js` / `vocabiliSync.js` | 无 | ⚠️ 数值判死，仅限 ID 发现 |
| **AI 审核（OpenAI 兼容）** | 内容合规审核 | `aiReview.js` | API Key | ✅ 可关闭（fail-open） |
| **OAuth 登录** | 第三方账号登录 | `auth.js` / `config.js` | APPKEY | ✅（mapay / cccyun） |

---

## 1. B 站（bilibili）

**模块**：`apps/api/src/bili.js`（封装 `@aemeath-projects/bilibili` SDK）

**核心端点**：

| 端点 | 用途 | 说明 |
|---|---|---|
| `/x/web-interface/view` | 视频详情 + 七项统计（view/favorite/coin/like/danmaku/reply/share） | **主力**。`fetchVideo` 拉详情+tags+pages（3 请求）；`stat()` 只发 1 次请求（刷新用） |
| `/x/web-interface/nav` | 登录态校验 | `bili.js:17`，带 cookie |
| `/x/web-interface/wbi/search/type` 等 | 搜索候选 | 由 SDK 封装 |

**调用方式**：
- 所有请求经 `bili.call()` 全局串行节流闸门（150ms），避免风控。
- `refreshStats.js` 单次只发 1 个 `/x/web-interface/view`（`bili.stat(aid)`），5 分钟调度刷 900 条约 145s。
- 不支持的端点：`/x/web-interface/archive/stat`（404/412 风控，不可用）。

**关键约束**：
- 稿件删除 / 限流会返回错误码（如 `62002`），单条失败只计 errors，不影响整轮。
- 统计值均为**累计值**，本站差分得增量（见 `statHistory.js`）。

---

## 2. eVocalRank（周刊虚拟歌手中文曲排行榜）

**模块**：`apps/api/src/evocalrank.js`、`evoStats.js`
**BASE**：`https://www.evocalrank.com`

| 端点 | 返回 | 说明 |
|---|---|---|
| `GET /data/info/info.json` | `{ rank_list: [...], generate_time }` | 期号列表，220 项（期 520→739） |
| `GET /data/rank_data/{rankNum}.json` | 单期完整数据 | 见下方字段 |

**单期 JSON 字段**：
- 顶层：`ranknum, pubdate, generate_time, collect_start_time, collect_end_time,
  collect_start_time_timestamp, collect_end_time_timestamp,
  main_rank(30), second_rank(80), super_hit, pick_up, oth_pickup,
  history-1-year, history-10-year, ed, op, statistic, thanks_list`
- `main_rank` / `second_rank` 行：`url, avid, coverurl, title, pubdate(稿件发布时间),
  point, play, coin, comment, danmaku, favorite, like, share, referSource, rank, ext_rank`

**要点**：
- `main_rank + second_rank` = 110 条/期；数值是**该周真实增量**（非累计）——可直接用于计分。
- 七项齐全（play/favorite/coin/comment/danmaku/like/share），新公式 S_互动 能完整算。
- 每期跨 7 天（`collect_start_time` → `collect_end_time`），覆盖 2022-07-16 至今。
- **无 daily 接口**（`/data/daily/info.json` → 404）。
- 同步：`evoStats.syncPeriod(rankNum)` / `syncAll()`，落盘 `cache/evo_delta/{rankNum}.json`。

---

## 3. biliran（cpk.moe GitHub Pages）

**模块**：`apps/api/src/biliranSync.js`
**BASE**：`https://cpk.moe/vocaloid-china-biliran-data/vc-weekly`

| 端点 | 返回 |
|---|---|
| `GET /vc-weekly/{期号}.json` | 数组：`[{ id(av号), title, isCover, date(歌曲发布时间), rank, point, view, favorite, reply, danmaku, corrA, corrB }]` |

**覆盖范围**：♪118–♪522（约 2014-11 ~ 2022-08），本地已同步 405 期到 `cache/biliran/`。

**要点（重要）**：
- **无 `coin` / `like` / `share`** —— 源头（萌娘百科模板）当年就没记录。计分时缺失项置 0，标 `data_source="biliran"`，分数偏低但已标注。
- `view/favorite/reply/danmaku` 是**该期累计快照值**（非增量），需**期末−期初差分**还原窗口增量（与本站 `stat_daily` 口径一致）。`biliranSync.deltaBetween(startTs, endTs)` 做这件事。
- **期号→窗口**用 evo 520 期锚点反推：`EVO_520_START_TS=1657911600`（2022-07-16 03:00），`startTs = 1657911600 + (期号-520)*7*86400`。
- 覆盖判定：窗口须与 [118,522] 期范围重合，早于最早期/晚于最晚期返回空（避免期号硬凑）。
- 授权：♪325 后 CC BY-NC-ND 4.0 国际；只取数值，不取 point。

---

## 4. vocabili

**模块**：`apps/api/src/vocabili.js`、`vocabiliSync.js`
**BASE**：`https://api.vocabili.top/v3`

| 端点 | 用途 |
|---|---|
| `GET /ranking/{board}/latest_issue` | 最新期号 |
| `GET /ranking/{board}/{issue}/parts` | 分区列表 |
| `GET /ranking/{board}/{part}/{issue}?page=&page_size=&order_type=&seperate=false` | 榜单条目 |
| `GET /song/list`、`/song/{id}`、`/song/ranking` | 歌曲 |
| `GET /vocalist/{id}` 等 | 歌手 |

**board 映射**：`daily→vocaloid-daily`、`weekly→vocaloid-weekly`、`monthly→vocaloid-monthly`、`annual→vocaloid-annual`

**⚠️ 重要限制（实测）**：
1. **历史期号不生效** —— 传任何 issue 都返回**最新一期**（返回条目 issue 字段恒为 latest）。不能按 1..latest 批量遍历（会重复抓同一份）。
2. **数值判死，不可用于计分**：相邻期差分大量为负（累计/增量语义都不成立）、与本站真实日增量差 7~8 倍（80 组对比仅 2 组吻合）、自身窗口口径不明。
3. 历史期相关接口（如 milestones）返回 401 需登录。

**本站用法**：**只做发现源** —— 取日刊里的 bvid，转 aid 入 `pendingPool` 待抓队列，由本站采集去 B 站抓真实数据；**不使用它的数值**。
反封：串行单请求，`VOCABILI_THROTTLE_MS` 默认 250ms（批量 800ms），429 指数退避，诚实 UA。

---

## 5. AI 审核（OpenAI 兼容）

**模块**：`apps/api/src/aiReview.js`
**端点**：`POST {base}/v1/chat/completions`

- 配置：`AI_REVIEW_ENABLED`、`API Key`、`base`（见 `apps/api/.env`）。
- 关闭时走 **fail-open**（条目直接放行，不请求上游）。
- 审核结果「AI 故障 / 无法判定」→ 保留条目维持待审，下一轮重试；只有内容层明确拒绝才剔除。

---

## 6. OAuth 登录

**模块**：`apps/api/src/auth.js`、`config.js`

| 提供方 | apiUrl | 环境变量 |
|---|---|---|
| mapay | `https://login.mapay.cn/` | `MAPAY_API_URL`、`APPKEY` |
| cccyun | `https://u.cccyun.cc/` | `CCCYUN_API_URL`、`APPKEY`、回调 `CCCYUN_CALLBACK` |

- 回调：`/api/auth/oauth/callback?type=...&code=...`
- **凭据只放 `apps/api/.env`，不入库、不在文档/代码里写真实 Key。**

---

## 附：源站数据使用原则

1. **不取源站分数/名次**：只取原始统计数值（播放/点赞等），名次与分数一律本站自算。
2. **幂等**：同期号已落盘即跳过，不重复抓。
3. **反封**：单 IP、单并发、低速串行、诚实 UA；429/5xx 指数退避。
4. **标注来源**：`data_source` 字段区分 `snapshot` / `evocalrank` / `biliran` / `current`。
