# bili-vocaloid-chart

B 站虚拟歌手（术力口）音乐排行榜站。数据取自哔哩哔哩站内，界面参照 [vocabili.top](https://vocabili.top)（术力口数据库）。

榜单分 **中文榜 / 其他语言榜 / 综合榜** 三类，每类下含 **日榜 / 周榜 / 月榜 / 年榜** 四个周期，按周期内数据**增量**计分排名。

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 `apps/web` | Vite 5 + React 18 + React Router 7 + Tailwind CSS 4 + Radix UI + TanStack Query + ECharts + i18next |
| 后端 `apps/api` | Node.js（CommonJS）+ Express 4 + `node:sqlite` + nodemailer + dotenv |
| B 站 SDK `bilibili-sdk/bilibili-master` | 上游 TypeScript SDK（`aemeath-projects/bilibili`），承担签名（wbi）与接口调用 |
| 包管理 | npm workspaces（根目录统一 `npm install`） |

## 目录结构

```
bili-vocaloid-chart/
├── apps/
│   ├── web/                 # 前端（Vite）
│   │   └── src/
│   │       ├── App.jsx           # 路由表 + 侧边栏双分支布局
│   │       ├── components/       # AppHeader / MobileNav(SideNav) / RankCard / CommentPanel …
│   │       ├── pages/            # 17 个页面组件
│   │       └── i18n/             # 中英文案
│   └── api/                 # 后端（Express）
│       ├── src/
│       │   ├── index.js          # HTTP 路由 + 榜单定时刷新
│       │   ├── services/index.js # 榜单构建（窗口 / 增量 / 历史回溯 / 成就）
│       │   ├── collector.js      # 采集与收录过滤
│       │   ├── score.js          # 官方评分公式
│       │   ├── statHistory.js    # 每日快照与增量基线
│       │   ├── aiReview.js       # AI 审核（虚拟歌姬判定）
│       │   ├── evoStats.js       # evocalrank 周增量（长周期榜兜底基线）
│       │   └── related.js        # 关联作品索引
│       ├── cache/                # 榜单 / 全库 / 快照 / 审核结果（JSON）
│       ├── .data/app.db          # 用户与评论（SQLite）
│       └── .env                  # 环境变量（本地填写，见 .env.example；不入库）
├── docs/
│   ├── 周虚拟歌姬中文曲排行榜规则.md   # 收录范围、评分公式、成就规则
│   ├── 对接文档.md                    # 布局对接、增量口径、本地环境
│   └── agents/                        # issue tracker / triage / 域文档布局约定
└── bilibili-sdk/                     # 上游 B 站 SDK
```

> 项目开发日志（`docs/开发日志.md`）是**开发过程记录，不入库**，只在本地保留。

> 只在本地保留、**不入库**的目录：`.workbuddy/`（开发记忆与备份）、`.workbuddy-ai/`（助手工作区）、
> `.reference/` 与 `参考文件/`（参考站页面 / 接口 / DOM 快照）。clone 出来的仓库里不会有这些。

## 快速开始

```bash
npm install          # 根目录执行一次，安装全部 workspace 依赖

cd apps/api && cp .env.example .env     # 复制环境变量模板，再填入你自己的值（见下节）
cd ../..

npm run dev          # 同时启动 api(1003) + web(1005)
```

> ⚠️ **仓库里不包含任何真实凭据**：`.env.example` 中的 cookie、密钥、邮箱密码一律为空，
> 这些值**需要你自己填写**。全部留空也能浏览公开榜单，但采集（B 站登录态）、AI 审核、
> 第三方登录、邮箱验证码会不可用。

也可单独启动：

```bash
npm run dev:api      # 仅后端，node --watch apps/api/src/index.js
npm run dev:web      # 仅前端，vite
```

> 后端以 `--watch` 运行，修改 `apps/api/src/**` 会自动重启并重建榜单缓存。
> `.env` 由 `apps/api/src/config.js` 按 `__dirname` 定位（`apps/api/.env`），
> 因此**从仓库根目录直接 `npm run dev:api` 也能读到**，不必先 `cd`。

## 端口与本地地址

| 用途 | 地址 |
|---|---|
| 前端 Web | http://localhost:1005 |
| 后端 API | http://localhost:1003 |
| 采集进度监控页 | http://127.0.0.1:1006/progress （仅本机可访问） |

前端 Vite 通过 proxy 把 `/api` 转发到 `http://localhost:1003`。

## 环境变量

> ⚠️ **仓库里不包含任何真实凭据**：模板里的 cookie、密钥、邮箱密码全是空的，**需要你自己填写**。
> 全部留空也能浏览公开榜单，但采集（B 站登录态）、AI 审核、第三方登录、邮箱验证码会不可用。

```bash
cd apps/api
cp .env.example .env     # 然后照模板里的注释把值填进去
```

配置在 `apps/api/.env`（模板 [`apps/api/.env.example`](apps/api/.env.example)）：

| 变量 | 必填 | 说明 |
|---|---|---|
| `PORT` | 否 | 后端端口，默认 `1003` |
| `BILIBILI_COOKIE` | 建议填 | B 站登录态 cookie 串（`name=value; ...`）。浏览器登录后从开发者工具 → Application → Cookies 复制，至少含 `SESSDATA` / `bili_jct` / `DedeUserID`；用于空间信息等需登录接口，缺失时启动日志会出现 `[BiliApi -101] 账号未登录` |
| `SESSDATA` | 否 | 遗留项：`config.js` 会读取，当前无实际使用 |
| `FRONTEND_URL` | 否 | 前端地址，OAuth 回调成功后跳转目标，默认 `http://localhost:1005` |
| `SESSION_SECRET` | 生产必填 | 会话签名密钥；留空会退化成代码里不安全的开发默认值 |
| `AI_REVIEW_ENABLED` / `AI_REVIEW_BASE` / `AI_REVIEW_KEY` / `AI_REVIEW_MODEL` | 否 | AI 审核服务（OpenAI 兼容接口）；不填 = 跳过审核、不拦截收录 |
| `CCCYUN_*` / `OAUTH_TYPES` | 否 | 彩虹聚合登录（QQ / 微信），需到 cccyun 平台申请 appid / appkey（模板里的 `CCCYUN_APPKEY` 是上游示例值，必须替换） |
| `SMTP_*` | 否 | 邮箱验证码登录；`SMTP_ENABLED=false` 时整体停用 |
| `CACHE_DIR` | 否 | 缓存目录，默认 `apps/api/cache` |
| `PENDING_MAX_ATTEMPTS` | 否 | 待审池单条重试次数，默认 `5` |
| `VOCABILI_THROTTLE_MS` | 否 | vocabili 同步节流毫秒，默认 `250` |

> `.env` 已被 `.gitignore` 忽略（`.env.example` 是唯一例外），不会被提交。

## 榜单规则

完整规则见 [`docs/周虚拟歌姬中文曲排行榜规则.md`](docs/周虚拟歌姬中文曲排行榜规则.md)，实现要点：

- **收录范围**：仅 B 站 **30 号分区（VOCALOID · UTAU）**；时长 ≥ 120 秒；排除生成式模型参与、
  真人演唱 / AI 换声翻唱、纯 PV / MMD、合集盘点、纯音乐、杂谈科普等；另经 AI 审核二次判定。
- **周期窗口**：四类周期统一以起始日 **01:00** 为边界（日=今日、周=本周一、月=本月 1 日、年=今年 1 月 1 日）。
- **增量口径**：增量 = 当前值 − **窗口起始日前一天**的快照值；窗口内新歌无基线，用当前累计值计分。
- **评分公式**：`最终得点 = 播放得点 + 互动得点 + 收藏得点 + 硬币得点 + 点赞得点`，
  含修正 A（无上限）/ B（≤50）/ C（≤50）/ D（≤1），实现见 `apps/api/src/score.js` → `chartScore()`。
- **永久成就**：SUPERHIT（累计 2 次主榜前 3）、门番（28 期 20 次或 50 期 30 次，无连续 8 期未上榜）、
  神话（播放破千万）、年榜首位。

详细的窗口与基线口径见 [`docs/对接文档.md`](docs/对接文档.md) 第四节。

## API 概览

统一响应格式：`{ ok, code?, message?, data? }`

| 接口 | 说明 |
|---|---|
| `GET /api/board/:kind` | 榜单，`kind` ∈ `cn` / `intl` / `all`；query：`period`（daily/weekly/monthly/annual）、`issue`、`pn`、`ps`、`order` |
| `GET /api/board/singers` | 本期歌手排行 |
| `GET /api/video/:aid` | 视频详情（含分P、标签、协作成员） |
| `GET /api/video/:aid/related` | 关联作品 |
| `GET /api/video/:aid/comments` | 评论列表（POST 需登录） |
| `GET /api/song-history/:aid` | 该曲历史各期排名与分数 |
| `GET /api/stat-snapshots/:aid` | 该曲数据快照序列（图表用） |
| `GET /api/search` | 库内搜索（视频 / UP主） |
| `GET /api/owners`、`GET /api/owner/:mid` | UP主检索与详情 |
| `GET /api/singers`、`GET /api/vocalist/:id` | 歌手列表与详情 |
| `GET /api/tags`、`GET /api/stats`、`GET /api/girls` | 标签 / 统计 / 歌姬聚合 |
| `GET /api/achievements` | 成就列表（按周期 + 类别筛选） |
| `GET /api/today`、`GET /api/random` | 历史上的今天 / 随机跳转 |
| `GET /api/progress/stream`、`GET /api/progress/history` | 采集进度（SSE / 历史） |
| `POST /api/collect/trigger` | 手动触发采集 |

## 数据链路

```
web (Vite) --/api--> Express
                       ├─ collector.js --bilibili-sdk--> 哔哩哔哩 API（30 分区 / 搜索 / 视频详情）
                       ├─ aiReview.js   --HTTP--> AI 审核服务（虚拟歌姬判定）
                       ├─ evoStats.js   --HTTP--> evocalrank（周增量基线兜底）
                       └─ cache/*.json + .data/app.db（SQLite：用户 / 评论）
```

榜单缓存每小时刷新一次（`CACHE_TTL`），每期榜单同时归档到 `cache/board_archive/{period}/{issue}.json`，
供歌曲历史与成就判定回溯。

## 已知问题

- **B 站登录态易失效**：cookie 过期后启动日志会出现 `[bili] wbi 初始化失败: [BiliApi -101] 账号未登录`，
  需更新 `apps/api/.env` 的 `BILIBILI_COOKIE`。
- **AI 审核限流与故障**：上游限 300 分钟 600 次，故按 30 秒/次串行调用并轮询三个模型；
  全模型故障时采取 fail-closed（拒绝收录），故障结果不再写入缓存以便重试。
  历史缓存中仍存有早期宽松版本留下的、未真正判定的条目。
- **每日快照存在断档**（如缺 08-20、08-21、08-29、09-07～09-11、09-18、09-19），
  断档期在历史回溯时被跳过，会使门番 / SUPERHIT 的可判定期数少于理论值。
- 项目根目录当前**不是 git 仓库**，`.gitignore` 尚未生效。
