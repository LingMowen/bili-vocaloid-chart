## Agent skills

### Issue tracker

Issues and specs for this repo live as GitHub issues. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles use their default label strings. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — one `CONTEXT.md` at the repo root, with decisions in `docs/adr/`. See `docs/agents/domain.md`.

---

# 给 AI 协作者的开工纪律

> 这份文件是写给**在这个仓库里干活的 AI** 看的。人懒得看的东西，就让规则替他看。
> 每一条都因为**真的踩过**，不是为了好看。
>
> 与人协作的完整约定见 `docs/对接文档.md`；机器强制的部分见 §0.7 版本纪律。

## 0. 三条最贵的教训（先读这个）

### 0.1 「这句话我记得见过」≠「我验证过」

记忆里存的东西可能几周前就被世界推翻了。本项目有过一次：记忆里写着
`vite build` 会因为 `Access is denied` 失败，全仓搜索找到 **0 处**证据，
`docs/开发日志.md` 里有 **11 次**成功记录。

**规矩**：任何要写进文档、issue、commit、回答里的事实，必须是
**本次会话实测出来的**，或**能在文件里指到具体行**的。
不要把「常见报错模式」当成本项目的事实转述。

### 0.2 量具本身会撒谎

本项目被量具坑过 5 次，全部是「量具坏了」而不是「被测物坏了」：

| 坑 | 现象 | 真因 |
|---|---|---|
| `git rev-list --objects --all \| Measure-Object` | 报「1」 | 数的是**属性**不是行，要加 `-Line` |
| `Measure-Object -Line` | 2295 vs 3069 | 只数**非空行** |
| `Select-String -F` | 静默失败 | 参数不存在，是 `-SimpleMatch` |
| `Select-Object -First N` | 退出码假装正常 | 截断了管道 |
| PS 5.1 读 UTF-8 的 JS | 看到 `ç¼ç¨` | 按 Latin-1 解码的**显示**假象，文件没坏 |

**规矩**：**任何计数/判定，先拿一个已知答案的样本校准量具**，
确认量具读得对，再拿它去量新东西。
自查三个问题：样本对得上吗？这个命令会不会静默失败？失败时退出码是多少？

### 0.3 命令「看起来成功」可能只是没报错

`git grep` 退出码 **1 = 没找到**，**>1 = 命令本身坏了**。
不区分这两者，就会把「命令写错了」当成「检查通过了」，得出一个漂亮的假 0 命中。

**规矩**：每个检查命令，都要显式区分「结果为空」和「查询失败」。

## 1. 动手之前

- 先读 `docs/对接文档.md` §0（约定区），别凭常识猜路径。
- 要改哪几个文件、为什么改、怎么验证 —— **先讲清楚再动手**。
  涉及**删除、迁移、重写历史**的，**必须先问人**。
- 涉及外部服务（1003 / 1005）的改动，改完要真打一次接口确认，
  不要只看进程还在就报「没坏」。

## 2. 动手之中

- **不删磁盘上的文件**。要从版本库移除，用 `git rm --cached` 或
  filter-branch 的 `--index-filter`；文件本体留在原地。
  `--tree-filter` 会在真实工作目录里执行命令，**真的会删盘上的文件**（踩过）。
- **不进库的路径**（`npm run preflight` 会拦，但别等它拦）：
  `old-files/`、`.env`、`.env.*`（`.example` 除外）、`docs/开发日志.md`、
  `.workbuddy*/`、`.reference/`、`参考文件/`、`SDK/`、`home-before.png`。
- **凭据只放 `apps/api/.env`**，值由人自己填。
  任何地方都不许复制粘贴真实 cookie / token。
- **中文路径绝不经过 `cmd /c` 字符串**（GBK 码页会破坏）。
  用 `Start-Process` + 参数数组，或先建 ASCII 联接点当源。
- 改 `package.json` 的 `workspaces` 前先确认没有 workspace 成员依赖它
  （`bilibili-sdk/` 当初就是 workspace 成员，搬走前才发现代码真的在 import 它）。
- 每次 commit 都过 `scripts/preflight.js`；被拦下时先判断是**真问题**还是**误报**。
  误报要**修门禁**并在 commit 里说明，不要绕过去。

## 3. 动手之后

- `npm run preflight` —— 推送门禁，自己先跑一遍，别等 push 时才被拦。
- 有服务在跑的话，确认没被打断（1003 / 1005 各打一次）。
- commit 必须走模板：首行 `type(scope): 摘要`，正文必须有 `改动：` 和 `验证：`。
- 改了什么会影响别人的，**写进 `docs/对接文档.md`**。
- 汇报时说「改了什么 / 怎么验证的 / **我可能错在哪**」，不要只说「已完成」。

## 4. 不确定的时候

- 拿不准 → 说「我不确定」，并说清**怎么才能确定**（跑哪条命令、看哪个文件）。
- 没查到 → 说「没查到」，**不要**编一个像样的答案填上去。
- 用户说的和代码不一致 → **以代码为准**，并当场指出冲突。

## 5. 逃生口（可以，但会留痕）

| 命令 | 用途 |
|---|---|
| `git commit --no-verify` | 跳过提交信息门禁 |
| `SKIP_PREFLIGHT=1 git push` | 跳过推送门禁 |

这两个都会留在 reflog 里。**只在「门禁本身坏了」时用一次**，
并在下一条 commit 的正文里写清为什么跳过、跳过了什么。