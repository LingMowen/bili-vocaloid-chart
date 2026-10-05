# bili-vocaloid-chart

B 站虚拟歌手（术力口）音乐排行榜站。数据取自哔哩哔哩站内，界面参照 [vocabili.top](https://vocabili.top)（术力口数据库）。

榜单分 **中文榜 / 其他语言榜 / 综合榜** 三类，每类下含 **日榜 / 周榜 / 月榜 / 年榜** 四个周期，按周期内数据**增量**计分排名。

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 `apps/web` | Vite 5 + React 18 + React Router 7 + Tailwind CSS 4 + Radix UI + TanStack Query + ECharts + i18next |
| 后端 `apps/api` | Node.js（CommonJS）+ Express 4 + `node:sqlite` + nodemailer + dotenv |
| B 站 SDK `@aemeath-projects/bilibili` | 上游 TypeScript SDK（`aemeath-projects/bilibili`，npm 依赖，承担签名（wbi）与接口调用）；源码副本已归档到 `old-files/sources/bilibili-sdk/` |
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
│   ├── API文档.md                     # 本站全部 HTTP API（榜单/歌曲/搜索/歌姬/进度/认证）
│   ├── 第三方API.md                    # 外部接口（B 站 / eVocalRank / biliran / vocabili / AI 审核 / OAuth）
│   ├── scoring/                       # 2026-10-05 计分规则改造（新公式 + 历史期补数）全套
│   └── agents/                        # issue tracker / triage / 域文档布局约定
```

> 项目开发日志（`docs/开发日志.md`）是**开发过程记录，不入库**，只在本地保留。

> 只在本地保留、**不入库**的内容：开发日志 `docs/开发日志.md`；以及**已归档**到 `old-files/` 的历史资料 ——
> 按用途分成 `reference/`（参考站页面 / 接口 / DOM 快照与拆解工作区）、`sessions/`（各会话开发记忆与导出）、
> `debug/`（早期调试脚本与截图）、`sources/`（第三方参考源码）、`backups/`（开发期 .bak 快照）五区，
> 目录地图见 `old-files/README.md`。这些都不随仓库发布，clone 出来的仓库里不会有。

## 快速开始

```bash
npm install          # 根目录执行一次，安装全部 workspace 依赖

npm run hooks:install   # 装 git 门禁（commit-msg + pre-push），clone 后必做一次

cd apps/api && cp .env.example .env     # 复制环境变量模板，再填入你自己的值（见下节）
cd ../..

npm run dev          # 同时启动 api(1003) + web(1005)
```

## 提交纪律

这个项目基本由 AI 维护、人很少读 commit，所以提交信息与推送是被**机器门禁**强制的：

| 命令 | 作用 |
|---|---|
| `npm run preflight` | 推送前自检：凭据是否泄进跟踪文件、禁入目录是否被跟踪、JS 语法、JSON 合法性 |
| `npm run preflight:selftest` | 验证上面这道门禁**真的会拦**（用合成假凭据走完整链路） |
| `npm run changelog` | 从 git 历史重新生成 `docs/变更史.md` |
| `npm run hooks:check` | 检查门禁是否已装 |

- commit 首行必须是 `<type>(<scope>): <摘要>`，正文必须有 `改动：` 和 `验证：` 两行
  （模板见 `.gitmessage`）；
- 真实身份由 `.mailmap` + 仓库级 `git config` 保证，GitHub Contributors 图显示的是你本人；
- 完整说明见 [`docs/对接文档.md` §0.7](docs/对接文档.md)。

## 功能测试

`preflight` 只能证明「语法合法、没泄密、服务活着」，功能测试才真的去调接口、
用 Chromium 打开页面（需要服务先起着：`npm run svc:start`）。

| 命令 | 覆盖 |
|---|---|
| `npm run test:api` | 54 个接口用例（35 只依赖本服务 + 19 真调 B 站） |
| `npm run test:browser` | 17 个页面，真实 Chromium，校验文案/字数/无报错 |
| `npm test` | 两部分都跑 |
| `npm run verify` | `preflight` + `test:api`，推送前最省事的一条 |

用例里的 aid / mid / 歌手 id 全部从 `/api/board/all` 现取，不写死——写死的 id 只能测出
「那个 id 还在不在」，测不出「接口取不到数据了」。分页参数踩过的坑记在
[`docs/对接文档.md` §0.8](docs/对接文档.md)。

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
| 前端 Web（dev） | http://localhost:1005 |
| 前端 Web（preview） | http://localhost:1007 |
| 后端 API | http://localhost:1003 |
| 采集进度监控页 | http://127.0.0.1:1006/progress （仅本机可访问） |

前端 Vite 通过 proxy 把 `/api` 转发到 `http://localhost:1003`（dev 与 preview 共用同一条代理）。

## 挂到公网（Cloudflare 隧道）

**要对公网开隧道，必须用 `--preview`，不要用 dev server。**

```bash
npm run build --workspace=apps/web      # 先出 dist
npm run svc:start -- --preview          # API(1003) + preview(1007)
cloudflared tunnel run vocaloid         # 命名隧道，固定域名（见下）
```

**当前正式入口：`https://vocaloid.ciallo.ltd`**（命名隧道 `vocaloid`，域名固定，
配置在 `~/.cloudflared/vocaloid.yml`，`ingress` 指向 `http://127.0.0.1:1007`）。
命名隧道比 quick tunnel 可靠：域名不会每次重启就换，也就不需要反复去第三方平台
（如聚合登录）重新加白名单。

应急可用 quick tunnel（免登录，但**域名每次重建都会变**）：

```bash
cloudflared tunnel --url http://127.0.0.1:1007 --no-autoupdate
```

原因：dev server 会把**整个仓库**当静态根，`/@fs/<绝对路径>` 能原样读到仓库里的任何文件
（实测 `.git/config`、25 MB 的 `apps/api/cache/library.json`、SQLite 用户库全部 200 返回，
只有 `.env` 靠 vite 默认 `fs.deny` 挡住）。preview 只服务 `apps/web/dist/`，
同样几条路径全部返回 `index.html` 的 SPA 回退，泄露面关闭。

隧道域名要加进 vite 的 Host 白名单（否则 403），`apps/web/vite.config.js` 里
`server.allowedHosts` 与 `preview.allowedHosts` 都已设为 `[".ciallo.ltd", ".trycloudflare.com"]`。
前端请求全走相对路径 `/api/*`，所以**隧道只需暴露 1007 一个端口**。

第三方登录（聚合登录）的回调地址是**按访客实际访问的域名动态推导**的，不是写死的本机地址 ——
所以换隧道域名不用改 `.env`。但推导出来的来源必须过白名单（否则就是开放重定向），
白名单在 `apps/api/.env` 的 `PUBLIC_ORIGINS`（逗号分隔，`.` 开头表示后缀匹配）：

```
PUBLIC_ORIGINS=.ciallo.ltd,.trycloudflare.com
```

> ⚠️ 聚合登录平台侧的**回调域名白名单**是精确主机名匹配、不支持通配，
> 换域名后要去平台后台补一条（本项目实测：`vocaloid.ciallo.ltd` 必须单独加）。

开了隧道就等于把 API 1003 一起放到公网，所以**只给本机用的端点必须锁掉**。下面三个前端
一个都没用（只服务本机进度页 1006），已按「本机直连」限制（判据：环回地址 + 不带 Cloudflare
边缘头 + Host 是 localhost）：

- `POST /api/collect/trigger` —— 原本**完全无鉴权**，能触发全量采集、消耗 AI 审核额度
- `GET /api/progress/stream` —— SSE 长连接
- `GET /api/progress/history` —— 采集历史与审核状态

细节见 [`docs/对接文档.md` §0.7](docs/对接文档.md)。

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
| `FRONTEND_URL` | 否 | 前端地址，默认 `http://localhost:1005`。**只是兜底**：公网访问时 OAuth 回调成功后的跳转目标按访客来源现算（相对路径 `/auth/success`），只有来源不可判定时才用它 |
| `PUBLIC_ORIGINS` | 挂隧道时必填 | 允许作为 OAuth 回调来源的域名，逗号分隔，`.` 开头表示后缀匹配（如 `.ciallo.ltd`）。留空只放行环回与上面两个 URL 的 host |
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
- **评分公式（2026-10-05 起）**：`单日总分 = log₂(ΔV+100) × S_互动 × T_时间 × Fix`（**去语种**，Avg 用全库口径）
  - `S_互动 = (ΔL+3ΔB+4ΔF+2ΔC+ΔD)/(ΔV+200)×1000`（share 不参与）
  - `T`：t≤4→`1.6-0.15t`，5≤t≤14→`1.0`，t>14→`21/(t+7)`
  - `Fix`：S<0.2·Avg→`0.3`，S>5·Avg→`5·Avg/S`，否则 `1.0`
  - 周期总分 = Σ 每天单日分；无逐日快照的历史期用「整窗增量 ÷ 天数 = 日均」逐日求和（`score_mode="daily-avg-sum"`）
  - 实现见 `apps/api/src/score.js`（`sInteract` / `timeFactor` / `fixFactor` / `dailyScore`），全套文档见 [`docs/scoring/`](docs/scoring/)
- **历史期补数**：无快照时依次回落 evocalrank（周增量，2022-07 至今）→ biliran（累计快照差分，2014-11~2022-08，缺 coin/like 置 0 并标 `data_source="biliran"`）→ 空榜；`vocabili` 只取 ID 做发现源，其数值不可用。
- **永久成就**：对齐 vocabili 的六类 —— Emerging Hit!（连续 3 期主榜前 5）、Mega Hit!!!（连续 5 期前 3）、
  门番候补 / 门番（15 期内 10 期、30 期内 20 期前 20）、日刊门番候补 / 日刊门番。
  周刊榜只产出前四类，日刊榜只产出后两类。

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
| `GET /api/achievements` | 成就列表（`board=daily\|weekly\|monthly\|annual\|all` + `type=<类别>\|all` 筛选；`board=all` 跨榜按达成日期倒序，首页「成就速递」用） |
| `GET /api/today`、`GET /api/random` | 历史上的今天 / 随机跳转 |
| `GET /api/progress/stream`、`GET /api/progress/history` | 采集进度（SSE / 历史） |
| `POST /api/collect/trigger` | 手动触发采集 |

## 数据链路

```
web (Vite) --/api--> Express
                       ├─ collector.js --@aemeath-projects/bilibili--> 哔哩哔哩 API（30 分区 / 搜索 / 视频详情）
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
  断档期在历史回溯时被跳过，会使门番系成就的可判定期数少于理论值。
- 项目根目录当前**不是 git 仓库**，`.gitignore` 尚未生效。（此条已过时：仓库已初始化并推送至 GitHub，见 `docs/对接文档.md` §0.7）
