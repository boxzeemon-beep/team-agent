# Team Agent Alpha 架构

## 边界

系统由一个协调进程、若干本地 Runner、一个 SQLite 文件和一个共享 Git 分支组成。协调进程只监听本机回环地址，再由 Tailscale Serve 暴露到团队 tailnet。

```text
成员浏览器 ── HTTPS/SSE ──> Tailscale Serve ──> Coordinator
                                                    │
                                                    ├── SQLite
                                                    └── WebSocket
                                                         │
                                    ┌────────────────────┼────────────────────┐
                                    ▼                    ▼                    ▼
                              张三的 Runner         李四的 Runner         王五的 Runner
                              Codex + Git           Codex + Git           Codex + Git
```

## 一致性模型

1. SQLite 是成员、Agent、任务队列和项目消息的事实来源。
2. `internal-alpha` 是代码状态的事实来源。
3. Coordinator 在 SQLite 中抢占唯一活动任务；`running` 和 `waiting_for_owner` 都持有全项目执行锁。
4. 调度器按创建时间选择最早可执行任务，跳过目标 Agent 暂时离线或暂停的任务。
5. Runner 每次执行前同步共享分支，完成后测试、提交并推送，然后再报告完成。
6. 每个 Agent 保存自己的 Codex Thread ID；Coordinator 按该 Agent 的上下文游标发送增量项目消息。

## 信任边界

- 浏览器会话、邀请和 Runner 配对凭据只在服务端保存 SHA-256 摘要。
- 会话 Cookie 使用 `HttpOnly` 与 `SameSite=Strict`；经 HTTPS 公开地址运行时同时使用 `Secure`。
- Coordinator 不接收成员的 Codex 登录凭据或 Git 凭据。
- Runner 使用所在电脑已有的 Codex 登录和 Git 凭据，受管副本位于 Runner 数据目录。
- Tailscale ACL 决定哪些设备可到达 Coordinator；应用内邀请决定谁可进入项目。

## 故障恢复

- `running` 与 `waiting_for_owner` 是 SQLite 中的持久全局锁。Runner 断线或 Coordinator 重启只把 Agent 标记为离线；活动任务保持原状态，重连后收到数据库保存的同一份 assignment。
- Runner 将设备 ID、Runner token、Agent ID、项目 Thread ID 和已完成任务回执写入本地状态文件。
- Runner 重连时携带活动任务 ID；重复分配同一已完成任务时复用保存的回执，减少重复提交。
- 测试或 Git 操作异常进入 `needs_attention`，保留诊断 diff、本地 task commit 和测试输出，同时暂停该 Agent，避免它在受管工作区处理完毕前接收新任务；后续由所有者处置后重试或显式重置。
- 离线活动任务默认继续持锁。紧急释放是管理员专用的运维动作，仅在目标 Agent 已离线且任务仍为 `running` 或 `waiting_for_owner` 时生效。一次 SQLite 事务会把任务置为 `needs_attention`、保留 assignment、暂停 Agent 并写入系统消息；事务完成后调度器才选择下一个任务。
- 紧急释放前要从操作层面确认所有者电脑上的 Runner 已停止。暂停 Agent 可阻止其重连后继续接收任务，所有者检查受管 Git 副本后再恢复共享。

## 运维约定

- Coordinator 每次启动都使用同一绝对 `TEAM_AGENT_DATA_DIR`；Runner 使用自定义 `--data-dir` 后，每次启动与重置也沿用同一路径。
- 源码入口是根目录的 `pnpm coordinator` / `pnpm runner`，构建入口是 `pnpm coordinator:built` / `pnpm runner:built`。
- SQLite 备份在 Coordinator 停止后进行，整体复制数据目录，以同时保存数据库、WAL/SHM 和持久密钥。

## 明确留到后续的能力

- 自动 Agent 路由
- 并行分支与多项目
- 微信群直接 @
- 其他 Agent 类型
- 云端消息队列、对象存储和托管部署
