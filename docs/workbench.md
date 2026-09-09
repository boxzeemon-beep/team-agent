# Team Agent 目标验收工作台

本轮实测结果、真实 Codex 尝试及未通过的检查集中记录在[交付记录](delivery.md)。

`main` 源码提供目标验收工作台：把目标、背景与验收标准交给所选 Agent，经过真实测试和新的只读审查，在约定轮次内修订，验收通过后才提交并推送。任务分配、证据审查、失败处理、反馈和导出集中在同一界面。[GitHub Pages](https://boxzeemon-beep.github.io/team-agent/) 提供浏览器模拟演示；Docker 的 `:0.2.0`、`:latest` 镜像及历史战术大厅视频仍属于原版本。本次源码与 Pages 更新不创建版本 tag 或发布新镜像。

English quick start: `main` contains the **goal-and-acceptance workbench**. Open the [Pages browser demo](https://boxzeemon-beep.github.io/team-agent/), or run `pnpm install --frozen-lockfile`, then `pnpm demo:browser`, and open [the local preview](http://127.0.0.1:4321/team-agent/). The six initial examples, reviews, diffs and test records are simulated. A real verified goal requires the Coordinator, a current source-built paired Runner and a configured project test command. See the [English README](../README.md) for the deployment guide.

产品改进参考 [Anthropic 团队工作方式研究](claude-team-research.md)：成员提供目标、上下文与反馈，让 Agent 在可检查的结果之间持续改进。此处落实的是该工作方式在现有 Team Agent 上的具体实现，执行后端仍为 Codex。

## 本地启动

使用 Node.js 22.5+、pnpm 11，在当前源码目录执行：

```bash
pnpm install --frozen-lockfile
pnpm demo:browser
```

打开 [http://127.0.0.1:4321/team-agent/](http://127.0.0.1:4321/team-agent/)。该命令固定使用本机 4321 端口；端口被占用时会报错，不会自动换到另一个地址。终端保持运行即可，退出时使用 Ctrl+C。

| 入口 | 运行内容 | 使用场景 |
| --- | --- | --- |
| `pnpm demo:browser` | Vite 和浏览器内模拟引擎；没有 Coordinator、Codex 或 Git 执行 | 查看新版界面、尝试交互和恢复操作 |
| `pnpm demo:playground` | 开启 Demo Mode 的 Coordinator，加本地网页开发服务器 | 查看 Coordinator 提供的模拟数据和事件更新；网页默认 4311 端口 |
| `pnpm demo:smoke` | 临时 Coordinator、SQLite、WebSocket Runner 协议与真实本地 Git 流程 | 验证邀请、配对、任务分配、测试、提交、推送和结果持久化；不调用 Codex |
| Coordinator + 配对 Runner | 团队服务端与所有者电脑上的 Codex、Git | 真实开发任务；按 [部署指南](../README.zh-CN.md#部署给团队使用) 配置 |

## 建议体验顺序

首次进入或重置浏览器演示后，会看到六条预置任务。已有浏览器演示状态会恢复，因此日常刷新不会强制覆盖你的操作。

1. **审查一个两轮目标。** 打开“让任务卡片支持键盘操作与屏幕阅读器”，查看逐条验收、第一轮失败原因与第二轮审查结论，再核对代码差异和测试记录。历史模拟标记说明这些内容没有实际执行。
2. **改派离线任务。** 打开“检查暗色模式下的文字对比度与焦点可见性”，把离线的 Scout 改派给可用 Agent，观察排队和模拟执行。任务不会因为目标离线而阻塞其他可执行任务。
3. **检查一轮上限。** 打开“为 API 超时增加有限重试与错误提示”，先读错误与审查，再点击“重新排队”。其约定只有一轮，重试创建新执行记录，但仍会在第一轮审查失败后停止；旧证据保留在协作记录中，不会因重试自动变成通过。
4. **新建两轮目标并观察修订。** 在编辑区填写目标、背景、逐行验收标准，选择两轮和在线 Agent。观察实现、测试、审查、修订与第二轮复审；在修订时刷新页面，同一模拟执行与第一轮记录仍会恢复。固定演示不会按你的自由输入生成真实实现。
5. **把反馈变成新草稿。** 在详情输入反馈，使用“把反馈带到下一次改进”。工作台带入来源任务、上次结果与背景，仍需核对本次目标、验收标准和轮次后提交。已有草稿会保留；长内容超出提交上限时，先在编辑区删减。新草稿不继承旧任务的验收通过结论。
6. **检查并导出证据。** 使用任务筛选和搜索定位记录。代码差异按文件展示，标出新旧行号和增删行；测试页展示原始输出。“导出记录”可预览、复制和下载 Markdown，包含目标约定、审查历史、状态、diff、测试、提交与协作记录。模拟导出保留醒目标记。

任务草稿和回复草稿使用当前浏览器标签页的会话存储；浏览器演示状态使用本地存储。它们不跨设备同步。存储不可用时，当前页面仍可使用，但不能保证刷新后恢复。演示重置只清理该演示自身的存储条目。

## 真实目标如何完成

| 方式 | 输入与执行 | 完成含义 |
| --- | --- | --- |
| 验收目标 | 目标、背景、逐条验收标准、1–3 轮预算；实现后运行项目测试，再启动新的只读审查会话 | 配置的测试通过，全部验收项有明确通过证据，没有遗留问题，且被审查代码与待发布代码一致，才能提交并推送 |
| 直接任务 | 保留原有开发请求与所选 Agent 的流程，运行已配置的测试并提交、推送 | 记录执行结果，不提供独立逐条验收结论 |

背景最多 10,000 个字符。验收目标需要 1–12 条非空、不重复的标准，每条最多 500 个字符；内容会去除首尾空白。轮次是最多 1–3 次完整实现/测试/审查，并非无限自动尝试。希望遇到可修复问题后再尝试一次，应选择至少两轮。

开始真实目标前，管理员必须在项目设置中配置可在仓库内运行的测试命令，例如项目自己的 `pnpm test`。未配置命令时，Runner 会把目标标为需要处理，不发布代码；不能把空测试记录视为通过。测试与验收标准分别回答“项目验证命令是否成功”和“用户约定的行为是否成立”，两者都必须满足。

每轮流程如下：

1. **实现。** Codex 根据冻结的目标、背景、验收标准和此前审查问题修改受管仓库。
2. **测试。** Runner 执行项目配置的真实命令，保存输出和退出结果。
3. **独立审查。** 在同一 Runner 上启动一个新的 Codex 会话，采用只读沙箱、禁止写入审批升级。审查者检查实际仓库、相对基线的变更和测试输出，并逐条返回通过、失败或未知及其证据。它不是另一位团队成员、另一台设备或不同模型。
4. **修订或停止。** 可修复问题在剩余轮次内返回实现；证据不足、审查格式不完整、无法继续或达到上限时停止并展示原因。每轮重新运行测试与只读审查。
5. **发布。** 测试及所有验收项通过后，Runner 校验被审查的 Git tree 和 HEAD。代码变化会使本次证据失效；只有一致的版本才能进入提交和推送。Coordinator 同时检查工作流及完成消息，缺失证据不能显示为验收完成。

这是一道可审计的发布门槛，不表示模型审查能发现所有缺陷；成员仍可检查 diff、原始测试和审查理由，再把反馈转成新的目标。

## 重连、重试与后续反馈

**重连恢复同一执行。** verified 目标有持久化的 `runId`，分配时冻结目标约定、项目设置和上下文边界。Coordinator 重启或 Runner 断线不会自动释放活动任务锁，也不会创建新预算。Runner 从本地检查点恢复工作流；已验收目标的恢复仍需重新检查测试、只读审查和版本一致性。

**重试开始新执行。** “重新排队”保留原目标及轮次上限，生成新 `runId`，清空当前结果并归档旧审查、diff、测试与错误。旧执行的迟到进度、等待审批和完成/失败消息不能影响新执行；workflow sequence 必须递增，已记录审查不能被改写。真实 Runner 遇到需要处理的任务会暂停，所有者检查本地问题后需要恢复 Agent，才能继续执行排队目标。

**后续反馈创建新约定。** 要修改目标、验收标准或轮次，使用反馈生成的新草稿，核对后再提交。保存普通评论不会自动修改已经分配的目标，也不会启动新任务；新目标引用旧记录供参考，必须重新证明本次验收条件。

**旧 Runner 保持明确边界。** verified 目标要求连接声明 `goal-workflow-v1`。未支持此协议的 Runner 会收到升级提示，目标等待可用的新版本；direct 任务仍按原协议调度。必须从当前 `main` 源码构建或运行新 Runner，原 v0.2.0 发布包不会自动获得这些能力。

## 架构取舍

**保留真实执行链路与持久化模型。** Coordinator 继续负责成员、权限、SQLite、任务队列和项目级执行锁；Runner 继续负责本机 Codex、受管 Git 副本、测试与发布。界面重构没有把多进程执行移入浏览器，也没有引入另一个任务数据库。

**让真实模式与模拟模式共享界面契约。** 网页通过 `api.ts` 读取快照和执行操作。真实模式使用 HTTP 与 SSE，SSE 断开时采用轮询补充刷新；浏览器模式交给独立的 `demo-engine.ts` 处理模拟状态与计时器。浏览器与 Coordinator 的演示使用同一个 `goal-simulation.ts` 状态机，明确标记固定测试、审查和模拟版本值。重连只代表数据传输恢复，不是任务成功的证据。

**把任务操作和证据审查分开组织。** `App.tsx` 管理工作台入口，`GoalWorkflow.tsx` 管理目标草稿与验收展示，`TaskDetail.tsx` 管理详情与恢复动作，`Management.tsx` 管理接入和设置；`task-model.ts` 承担筛选、diff 解析与 Markdown 导出。代码差异作为文本展示，不作为 HTML 执行。

**继续串行写入共享分支。** 一个活动任务持有项目级锁；离线待分配任务可以被跳过，已经开始执行的任务断线后仍保留锁及原始分配。此版本没有实现多个隔离工作树并行写入、多项目调度或自动挑选 Agent。请求者仍明确选择执行者。

**把演示与真实证据明确区分。** 浏览器案例用固定结果展示交互，不按任意请求生成代码，也不会合成可冒充真实发布的提交。测试原始记录保留上下文；缺少输出不等于测试通过。导出的是已有记录，不是新的验证结论。

## 本次修复的五个可靠性问题

| 触发条件 | 原有问题 | 当前处理 |
| --- | --- | --- |
| 新 Runner 连接替换旧连接，旧连接仍有在途消息 | 旧进度或完成消息能更新任务，甚至提前释放执行锁 | 只接受当前登记 WebSocket 的心跳和任务消息 |
| 同一 WebSocket 再次使用另一个 Agent 的凭据注册 | 可能留下幽灵在线状态，并消耗另一份配对凭据 | 已注册连接拒绝再次注册；未接受的配对凭据仍可由新连接使用 |
| Codex 返回其他线程或旧轮次的通知，或完成通知与启动响应处于同一 stdout 块 | 错误轮次可能覆盖当前结果或提前结束当前任务 | 同步确立启动轮次身份，并校验 threadId、turnId 和嵌套的 turn.id |
| 任务执行期间修改项目的共享分支设置 | 完成日志可能写入新设置的分支，而非实际执行分支 | 从持久化的任务分配中读取完成分支 |
| 恢复已推送任务时，验证命令修改了工作区文件 | 可能 amend 已发布提交，随后跳过 push，却上报新的 SHA 已完成 | 保留原提交及本地变更，附带测试输出并返回需要处理的错误 |

此外，Windows 本地演示通过 Node 与包管理器的 JavaScript 入口启动，避免直接执行 `.cmd`；Runner 路径和 mock app-server 测试也不再依赖 Unix 分隔符、shebang 或 SIGTERM 回调。

## 验证方式

下面是可重复执行的验证命令，不是对当前分支测试数量或浏览器验收结果的声明：

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm build:pages
pnpm demo:smoke
```

后端恢复和协议回归可单独执行：

```bash
pnpm exec vitest run packages/shared/src/index.test.ts apps/coordinator/src/goal-database.test.ts apps/coordinator/src/server.test.ts apps/runner/src/goal-workflow.test.ts apps/runner/src/codex-client.test.ts apps/runner/src/git.test.ts
```

浏览器模拟状态和证据模型可单独执行：

```bash
pnpm exec vitest run apps/coordinator/web/src/demo-engine.test.ts apps/coordinator/web/src/task-model.test.ts
```

本地人工检查使用 `pnpm demo:browser`，按上方体验顺序检查两轮修订、一轮上限、刷新恢复、来源反馈草稿、离线改派、筛选搜索与导出，并分别检查桌面和窄屏布局。浏览器模拟测试不能证明真实 Codex、远端 Git 权限或实际部署环境正常。

## 真实运行边界

`pnpm run doctor --data-dir .data/workbench-doctor` 可检查本机 Codex 登录、app-server 握手、Git 和数据目录，不会执行完整编码目标。Codex 轮次协议回归使用可执行 mock；`pnpm demo:smoke` 使用真实本地 Git 仓库和 Runner 协议，但不调用 Codex，也不证明对外部 Git 服务具备写入权限。请使用 `pnpm run doctor`，避免误调用 pnpm 自带的同名命令。具体交付验收与真实运行记录需另行核对，不能从测试命令列表推断。

真实使用仍需要已配置的 Coordinator、可用的项目仓库、配对 Runner，以及所有者电脑上已经登录的 Codex 和 Git 凭据。所有者审批仍在本机处理。固定的 v0.2.0 镜像、`:latest` 镜像和 Release Runner 不会因为源码或 Pages 更新而升级；当前工作台需要运行 `main` 源码或自行构建后部署。

本轮隔离的真实 Codex smoke 完成了实现与项目测试，但独立审查因网络超时未完成，工作流为 **blocked**，没有发布代码。[交付记录](delivery.md#真实-codex-尝试实现成功完整验收未通过)保留了证据与限制；公开源码和 Pages 演示不能替代完整真实目标的验收与发布验证。

[返回中文 README](../README.zh-CN.md) · [English README](../README.md) · [原有架构说明](architecture.md)
