# Team Agent：2026-09-09 交付记录

本轮把原先的任务大厅重做为围绕目标与验收的工作台。核心变化是让实现、测试、独立审查、修订与提交推送有明确的通过条件，并把证据放到用户容易查看的位置。

本轮改动基于 `316f887a844e2381fef40f2a4486b0969eb91322`，发布范围为 `main` 源码与 [GitHub Pages 浏览器工作台](https://boxzeemon-beep.github.io/team-agent/)。Pages 提供固定模拟案例与交互，不托管真实 Coordinator，也不调用 Codex 或 Git。公开提交及 Pages 部署结果以 [GitHub 提交记录](https://github.com/boxzeemon-beep/team-agent/commits/main/)和 [Pages 工作流](https://github.com/boxzeemon-beep/team-agent/actions/workflows/pages.yml)为准。

本次不创建版本 tag 或 GitHub Release，不更新 Docker 镜像：`ghcr.io/boxzeemon-beep/team-agent:0.2.0`、`:latest` 与最新 Release Runner 仍属于 v0.2.0。新工作台及验收协议需要运行 `main` 源码或自行构建。README 中的历史截图和视频保留原版本标记；源码与 Pages 的发布不代表真实 Codex 完整验收成功，也不等于部署了团队服务。

## 可以立即体验的成果

在源码根目录运行：

```bash
pnpm install --frozen-lockfile
pnpm demo:browser
```

打开 [本地工作台](http://127.0.0.1:4321/team-agent/)。推荐先查看“让任务卡片支持键盘操作与屏幕阅读器”，阅读两轮验收和代码差异；然后新建一个两轮目标，观察第一轮需要修订、第二轮完成；最后在协作记录里写反馈，生成下一份可编辑目标草稿。

**这一路径是明确标记的模拟演示。** 真实执行要运行 Coordinator、设置实际测试命令，并接入本版 Runner。真实服务端可用 `pnpm build` 后 `pnpm coordinator:built` 启动；界面会提供当前源码构建后的配对命令，并分别支持 PowerShell 7 和 POSIX 终端。配置方法见[使用指南](workbench.md)。

## 已实装的关键行为

| 使用问题 | 本版行为 |
| --- | --- |
| 一句需求缺少背景与完成判断 | 目标、项目背景、1–12 条验收标准、1–3 轮上限一起保存；直接执行方式仍可选 |
| 模型说完成，却看不出是否符合要求 | Runner 执行配置的实际测试，再新建只读 Codex 会话逐条审查；缺项、重复、unknown、坏 JSON、未解决问题都不能通过 |
| 第一轮审查发现问题 | 在约定上限内带着证据修订，再次运行测试和新会话审查；用尽轮次或缺少证据进入待处理 |
| 审查结束后代码发生变化 | 记录被审查的 Git tree，提交前后核对；只推送与已审查 tree 一致的明确 commit SHA |
| 断线、重启或重试混入旧结果 | 冻结任务分配，持久化 runId 和检查点；旧 run 消息不能改写新执行；重试归档原证据 |
| 结果需要进一步改进 | 反馈生成带来源、原有背景和结果的新草稿；新目标重新验收，长内容保留供编辑，超限不能提交 |
| 日常查看与交接费力 | 重做桌面和手机布局、显式 Agent 选择、任务筛选搜索、逐文件 diff 与行号、测试原文、审查历史及 Markdown 导出 |
| 新旧 Runner 混用 | verified 要求 `goal-workflow-v1`，旧 Runner 显示升级提示，仍能执行 direct 任务；接入页提供本版源码命令 |

同一个项目继续串行写入共享分支。“独立审查”指同一 Runner 上的新只读会话，不代表另一台机器或另一种模型。发布指已有 Git 提交推送流程，不是部署应用或自动合并受保护分支。

## 最终检查结果

检查环境：Windows、Node.js 24.19.0、pnpm 11.19.0、Git 2.53.0。以下是本次实际执行结果。

| 检查 | 结果与范围 |
| --- | --- |
| `pnpm test` | **16 个测试文件，104 项通过**。覆盖 SQLite 恢复、真实 WebSocket 协议、旧运行隔离、验收门槛、有界修订、模拟恢复、Git 发布与恢复、草稿和导出等 |
| `pnpm typecheck` | shared、Coordinator、Runner 全部通过 |
| `pnpm lint` | 通过 |
| `pnpm build` | Coordinator 前后端与 Runner 生产构建通过 |
| `pnpm build:pages` | `/team-agent/` 路径的静态演示构建通过 |
| `pnpm demo:smoke` | 通过。真实邀请、会话、配对、WebSocket、SQLite 与本地 Git 提交推送；Runner 行为为 mock，不调用模型 |
| 本机 `pnpm run doctor` | Codex 已登录、app-server 握手、Git 和目录检查通过；不等同于模型生成成功 |
| 浏览器人工检查 | 模拟两轮流程、历史审查、草稿刷新恢复、超长反馈保留与禁提交、Markdown 实际下载、桌面与 390px 布局；窄屏页面及详情没有横向内容溢出，详情标签允许局部滚动 |
| 真实后端界面 | 临时本地 Coordinator 的邀请加入、空工作空间、一次性配对命令、PowerShell/POSIX 切换通过；该次临时测试服务已关闭 |

Git 回归实际使用独立临时仓库和本地 bare remote，包含“审查后文件变化”和“commit hook 换入未经审查代码”的拒绝场景。配对命令测试在本机实际启动 PowerShell 7，检查引号、美元符号、命令替换、反引号、换行与中文参数保持原样。

构建有来自 Zod 依赖注释的 Rollup 提示，构建成功。CI 已配置 Ubuntu/Windows 与 Node 22/24 矩阵；上表记录本机检查，不能据此推断跨平台全部通过。矩阵执行结果以 [GitHub Actions CI](https://github.com/boxzeemon-beep/team-agent/actions/workflows/ci.yml) 中对应提交的记录为准。

## 真实 Codex 尝试：实现成功，完整验收未通过

另做了一次隔离的真实模型小目标验证，使用 Runner 的目标执行模块、真实 Codex app-server 与本地 Git。测试仓库不是本项目，也没有连接 GitHub。

- 真实模型把 `math.cjs` 修为 `exports.sum = (a, b) => a + b;`。
- Runner 实际运行 Node 测试，输出 `3 sum assertions passed`；测试文件的 Git blob 保持不变。
- 实现与审查使用不同的真实线程；只读审查已经开始读取 Git 证据。
- 模型响应多次 WebSocket 超时并回退。审查未在脚本设置的 260 秒截止前返回验收 JSON，脚本随后关闭 app-server。
- 工作流最终为 **blocked**，没有发布；本地 HEAD 仍是 baseline，bare remote 只有原 `main` 分支。

[机器可读的实测记录](validation/real-codex-smoke.json)保存了实现、测试输出、线程身份、Git 状态和未发布结论。这不是完整真实端到端成功的证明；本版仍需在模型连接稳定的环境中完成真实目标的全部验收与发布。

此次运行还发现临时审查线程与本机协作工具识别可能不兼容。最后将新只读线程设为可持久记录（`ephemeral: false`），仍保持新上下文、只读和禁写审批。该最小调整已通过协议测试，没有再发起一轮真实模型全程复验。

## 研究依据与交付边界

已定位并核实 Claude 官方视频 [How the Claude Code team uses Claude Code](https://www.youtube.com/watch?v=S-sYlFiGFv8)，2026-09-02 发布，22:23；阅读了完整公开英文字幕，并补充官方文章与文档。目标与上下文、独立验证、有界反馈循环等设计推导见[带时间定位的中文研究笔记](claude-team-research.md)。

没有交付视频副本或完整逐字稿。研究笔记清楚区分原视频观点、官方补充资料和本项目设计。当前执行后端仍为 Codex。

本轮没有实现云托管 Runner、关机后持续执行、Slack 组织身份、定时 routines 或多个可写工作树并行实施。真实使用依赖 Runner 所在设备在线、Codex 模型连接及项目 Git 权限可用。
