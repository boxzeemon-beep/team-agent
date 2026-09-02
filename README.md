# Team Agent

一个轻量的团队 Agent 借用工作台：成员在网页里明确选择某位成员共享的 Codex，Coordinator 保持统一项目对话和串行任务队列，Runner 在 Agent 所有者的电脑上使用其现有 Codex 与 Git 身份完成代码任务。

## 功能范围

- 一个 Coordinator、一个项目、一个 SQLite 文件
- 多位成员与多台本地 Runner
- 一个共享分支，默认 `internal-alpha`
- 全项目同一时间一个活动任务
- 邀请登录、Agent 配对与暂停、显式 Agent 选择、离线等待与改派
- 实时进度、所有者审批等待、对话、diff、测试输出和 commit
- Coordinator 与 Runner 重启恢复

自动路由、并行分支、多项目、微信群接入和云端基础设施暂不包含在核心工具中，保持部署简单、上下文透明、任务串行。

## 开源协议

本项目使用 MIT License。详见 [`LICENSE`](LICENSE)。

## 目录

```text
apps/coordinator/   Fastify API、SQLite、SSE、Runner WebSocket、React 网页
apps/runner/        Codex app-server 客户端、受管 Git 副本、测试与推送
packages/shared/    Coordinator、网页和 Runner 共用的类型与协议
docs/               架构说明与内测验收清单
```

## 运行要求

### Coordinator 主机

- Node.js 22.5 或更高版本
- pnpm 11
- 已加入团队 tailnet 的 Tailscale
- 所有团队成员都有写权限的 Git 仓库

### Agent Runner 主机

- Node.js 22.5 或更高版本
- pnpm 11
- 已安装并登录 Codex CLI
- 对项目 Git 仓库具有拉取和推送权限
- 已加入与 Coordinator 相同的 tailnet

只使用网页的成员不需要安装任何本地程序。

## 启动 Coordinator

### 1. 安装和构建

```bash
git clone TEAM_AGENT_ALPHA_REPOSITORY_URL team-agent-alpha
cd team-agent-alpha
corepack enable
pnpm install
pnpm build
```

### 2. 先建立 Tailscale 私网入口

Coordinator 默认只监听 `127.0.0.1:4310`。在 Coordinator 电脑运行：

```bash
tailscale serve --bg 4310
tailscale serve status
```

记下命令显示的 `https://...ts.net` 地址。Serve 只向 tailnet 开放该服务；访问范围仍受 Tailscale ACL 控制。

### 3. 配置并启动

```bash
cp .env.example .env
```

编辑 `.env`，把 `TEAM_AGENT_PUBLIC_URL` 设置为上一步得到的完整 HTTPS 地址。生产内测时同时把数据目录设置为绝对路径，例如：

```bash
TEAM_AGENT_DATA_DIR=/Users/COORDINATOR/team-agent-alpha/.data/coordinator
```

源码入口与构建产物入口二选一；重启时继续使用相同的 `.env` 和 `TEAM_AGENT_DATA_DIR`：

```bash
set -a
source .env
set +a
pnpm coordinator          # 源码入口
# pnpm coordinator:built  # pnpm build 后的入口
```

首次启动会在终端日志中输出一次性管理员邀请链接：

```text
Bootstrap admin invite: https://COORDINATOR_NAME.TAILNET.ts.net/invite?token=...
```

打开链接、填写名字，然后在“项目管理”中配置：

1. 项目名称
2. Git 仓库地址
3. 基础分支，例如 `main`
4. 共享分支，例如 `internal-alpha`
5. 测试命令，例如 `pnpm test`

管理员可继续生成每人一个的一次性邀请链接。成员邀请的有效期为 7 天；Runner 配对命令中的 token 有效期为 15 分钟，过期后在网页重新生成。

## 贡献并共享 Codex

贡献者先在自己的电脑准备 Team Agent Alpha 源码：

```bash
git clone TEAM_AGENT_ALPHA_REPOSITORY_URL team-agent-alpha
cd team-agent-alpha
corepack enable
pnpm install
codex login status
git ls-remote PROJECT_REPOSITORY_URL
```

若 Codex 可执行文件不在 `PATH` 中，启动前设置其绝对路径，例如 `export CODEX_BIN=/opt/codex/bin/codex`。

然后在网页点击“贡献我的 Codex”，复制并在 **Team Agent Alpha 源码根目录**运行页面生成的配对命令：

```bash
pnpm runner --coordinator "https://COORDINATOR_NAME.TAILNET.ts.net" --pair "PAIRING_TOKEN" --name "张三的 Codex"
```

Runner 会把设备身份、本地 Codex Thread ID 和受管项目副本保存在：

```text
~/.team-agent-alpha/runner/
```

配对 token 只使用一次；后续重启直接运行同一命令并省略 `--pair`：

```bash
pnpm runner --coordinator "https://COORDINATOR_NAME.TAILNET.ts.net" --name "张三的 Codex"          # 源码入口
# pnpm runner:built --coordinator "https://COORDINATOR_NAME.TAILNET.ts.net" --name "张三的 Codex"  # pnpm build 后的入口
```

如果首次配对使用了自定义目录，例如 `--data-dir /Users/zhangsan/team-agent-runner`，后续的重启、恢复和 `--reset-managed` 命令都要带上完全相同的绝对 `--data-dir`；这里保存设备凭据、Codex Thread 与受管 Git 副本。

网页中的“暂停共享”会保留 Runner 连接和本地上下文，同时调度器停止向该 Agent 分配新任务。

## 借用其他成员的 Codex

1. 在任务框写清目标。
2. 在“使用”下拉框中明确选择 Agent；离线 Agent 也可被选择。
3. 在线且空闲的目标进入串行队列；离线目标保持 `waiting_for_agent`。
4. 等待任务可由发起人重新选择其他 Agent。
5. Codex 原生审批会出现在 Agent 所有者的 Runner 终端，同时网页显示“等待所有者”。
6. 成功完成后，网页记录回复、diff、测试输出和 commit；代码推送到共享分支。

后续任务会收到所选 Agent 上次参与之后新增的项目消息、前序任务结果和 commit，并在最新共享分支上开始。

## 异常处置

测试、提交或推送异常会把任务置为 `needs_attention`，并暂停该 Agent，避免受管工作区尚未处理时接收下一项任务。任务详情会保留当前 diff、测试输出和本地路径提示。

- 修复受管副本中的文件或 Git 状态后，在网页点击“重新排队”。
- 放弃当前受管副本改动时，根据 Runner 日志中的项目 key 执行：

  ```bash
  pnpm runner --coordinator "COORDINATOR_URL" --reset-managed PROJECT_KEY
  ```

- 重置所有已知受管副本：

  ```bash
  pnpm runner --coordinator "COORDINATOR_URL" --reset-managed all
  ```

Runner 完成重置后退出；再正常启动 Runner 并在网页重新排队。正式分支仍由项目负责人审查后人工合并。

活动任务的 Runner 离线后，系统会继续持有全局锁，等待同一 Runner 重连。只有管理员确认 Agent 所有者电脑上的 Runner 已停止后，才在任务详情使用低频运维入口“紧急释放”。该操作把任务转为 `needs_attention`，保留原 assignment，暂停目标 Agent，记录系统消息并调度下一个可运行任务。恢复该 Agent 前应先检查所有者电脑上的受管工作区与 Git 状态，避免旧进程继续推送。

## 数据与恢复

- Coordinator 默认数据库：`.data/coordinator/coordinator.sqlite`；内测部署推荐通过 `TEAM_AGENT_DATA_DIR` 使用固定绝对目录
- SQLite 使用 WAL，并保存成员、邀请、Agent、配对、设置、任务和消息
- 活动任务的全局锁持久保存在 SQLite；Runner 断线或 Coordinator 重启时继续持锁，重连后重发同一份任务 assignment
- Runner token 与浏览器 session 的服务端记录均为 SHA-256 摘要
- Runner 重连使用持久设备 token，并缓存最近 100 个完成回执以减少重复提交
- 同一 Runner 数据目录由进程锁保护；同一时间只启动一个 Runner 进程

备份时先停止 Coordinator 进程，确认进程退出后整体复制 `TEAM_AGENT_DATA_DIR` 目录；不要在服务运行时只复制单个 `.sqlite` 文件。恢复时同样先停止 Coordinator，再用完整备份目录整体替换，并以原来的绝对 `TEAM_AGENT_DATA_DIR` 启动。这样 SQLite 主文件、WAL、SHM 与 Coordinator 持久密钥会保持同一时间点。

## 开发与验证

```bash
pnpm coordinator:dev   # Fastify + Vite 热更新
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

自动化测试覆盖邀请与 Cookie、Runner WebSocket 配对、任务串行、离线跳过、完成结果落库和 SQLite 重启恢复。完整人工内测步骤见 [`docs/acceptance-checklist.md`](docs/acceptance-checklist.md)。

实现基于 [Codex app-server](https://developers.openai.com/codex/app-server/) 的 JSONL 协议，并使用 [Tailscale Serve](https://tailscale.com/docs/reference/tailscale-cli/serve) 提供 tailnet 内 HTTPS 入口。
