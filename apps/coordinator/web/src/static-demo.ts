import {
  type DashboardSnapshot,
  initialGoalWorkflow,
  type Task,
  type TaskStatus,
} from "@team-agent/shared";

import { advanceSimulatedGoal } from "../../src/goal-simulation.js";

export { advanceSimulatedGoal };

/** Hand-written fixtures, never generated work or real test output. */
export const staticDemoResult = {
  result:
    "【固定示例 · 未执行真实开发】你已走完任务排队、执行与审查流程。下面展示的是预先编写的任务卡片可访问性示例，与本次自由输入的需求无关；没有调用 Codex、运行测试或读写 Git。接入自己的 Coordinator 和 Runner 后，才能获得真实任务结果。",
  diff: `# 模拟 diff · 预置可访问性示例，未修改任何文件
diff --git a/src/components/task-card.tsx b/src/components/task-card.tsx
--- a/src/components/task-card.tsx
+++ b/src/components/task-card.tsx
@@ -12,5 +12,10 @@ export function TaskCard({ task }: Props) {
   return (
-    <div className="task-card" onClick={onSelect}>
+    <button
+      type="button"
+      className="task-card"
+      aria-label={\`查看任务：\${task.title}\`}
+      onClick={onSelect}
+    >
       <span>{task.title}</span>
-    </div>
+    </button>
   );`,
  testOutput: `【模拟测试输出 · 没有运行测试命令】
固定示例：task-card.accessibility.test.tsx
  ✓ Tab 可聚焦任务卡片
  ✓ Enter 与 Space 均可打开详情
  ✓ 辅助技术可读出任务名称

示例用例 3/3 通过 · 该输出不验证你输入的需求`,
  // Never manufacture a Git SHA for a browser-only demonstration.
  commitSha: "",
};

/** The initial history has no running jobs: exploration starts at the user's pace. */
export function createDemoSnapshot(now = Date.now()): DashboardSnapshot {
  const stamp = (minutesAgo: number) =>
    new Date(now - minutesAgo * 60_000).toISOString();
  const snapshot: DashboardSnapshot = {
    me: {
      id: "static-demo-visitor",
      name: "试玩访客",
      isAdmin: false,
      createdAt: stamp(150),
    },
    settings: {
      projectName: "Team Agent 工作台",
      repositoryUrl: "simulated://browser-only",
      baseBranch: "main",
      sharedBranch: "team/workspace",
      testCommand: "pnpm test（演示中不执行）",
    },
    agents: [
      {
        id: "static-agent-luna",
        ownerMemberId: "static-owner-lin",
        ownerName: "Lin",
        displayName: "Luna · 前端开发",
        status: "online",
        lastContextMessageSequence: 9,
        lastSeenAt: stamp(0),
      },
      {
        id: "static-agent-forge",
        ownerMemberId: "static-owner-alex",
        ownerName: "Alex",
        displayName: "Forge · 接口与服务",
        status: "online",
        lastContextMessageSequence: 6,
        lastSeenAt: stamp(0),
      },
      {
        id: "static-agent-scout",
        ownerMemberId: "static-owner-mika",
        ownerName: "Mika",
        displayName: "Scout · 代码审查",
        status: "offline",
        lastContextMessageSequence: 0,
        lastSeenAt: stamp(42),
      },
    ],
    tasks: [],
  };
  let sequence = 0;
  const task = (
    id: string,
    prompt: string,
    agentIndex: number,
    status: TaskStatus,
    minutesAgo: number,
    progress: string,
    result = "",
    diff = "",
    testOutput = "",
    error = "",
  ): Task => {
    const agent = snapshot.agents[agentIndex];
    if (!agent) throw new Error("Unknown fixture Agent");
    const requester =
      status === "completed"
        ? { id: agent.ownerMemberId, name: agent.ownerName }
        : snapshot.me;
    const createdAt = stamp(minutesAgo + 8);
    const updatedAt = stamp(minutesAgo);
    const messages: Task["messages"] = [
      {
        id: `${id}-request`,
        sequence: ++sequence,
        taskId: id,
        memberId: requester.id,
        memberName: requester.name,
        role: "member",
        content: prompt,
        createdAt,
      },
      {
        id: `${id}-context`,
        sequence: ++sequence,
        taskId: id,
        memberId: null,
        memberName: "演示系统",
        role: "system",
        content: "预置演示记录。对话、代码变更与测试结果均为手写示例。",
        createdAt,
      },
      {
        id: `${id}-result`,
        sequence: ++sequence,
        taskId: id,
        memberId: null,
        memberName: agent.displayName,
        role: "agent",
        content: error || result || progress,
        createdAt: updatedAt,
      },
    ];
    return {
      id,
      requesterMemberId: requester.id,
      requesterName: requester.name,
      selectedAgentId: agent.id,
      selectedAgentName: agent.displayName,
      selectedAgentOwnerName: agent.ownerName,
      status,
      prompt,
      progress,
      result,
      diff,
      testOutput,
      commitSha: "",
      error,
      assignedThroughMessageSequence: sequence,
      createdAt,
      updatedAt,
      messages,
    };
  };
  snapshot.tasks = [
    task(
      "demo-task-login",
      "修复登录状态刷新后丢失的问题",
      1,
      "completed",
      68,
      "模拟完成 · 登录会话与过期状态均已覆盖",
      "【预置示例】刷新时先恢复会话，再决定是否跳转登录页。增加加载状态，避免已登录用户短暂看到登录表单；会话过期时保留当前页面地址。示例覆盖有效会话、过期会话和请求失败三条路径。所有变更与测试均为模拟记录。",
      `# 模拟 diff · 未修改真实文件
diff --git a/src/auth/session.ts b/src/auth/session.ts
--- a/src/auth/session.ts
+++ b/src/auth/session.ts
@@ -8,3 +8,5 @@ export async function restoreSession() {
-  setStatus("signed-out");
+  setStatus("loading");
   const session = await fetchSession();
+  setStatus(session ? "signed-in" : "signed-out");
+  return session;
 }`,
      "【模拟测试输出】\n✓ 有效会话刷新后保留登录态\n✓ 过期会话跳转且保留返回地址\n✓ 网络错误显示重试入口\n\n3/3 示例用例通过；未实际执行。",
    ),
    task(
      "demo-task-shortcuts",
      "让任务卡片支持键盘操作与屏幕阅读器",
      0,
      "completed",
      47,
      "模拟完成 · Tab、Enter 与 Space 操作一致",
      "【预置示例】将可点击容器改为原生 button，补充任务名称和可见焦点。键盘用户可以直接打开详情，屏幕阅读器能读出任务名称。以下代码与测试为固定示例，没有真实提交。",
      staticDemoResult.diff,
      staticDemoResult.testOutput,
    ),
    task(
      "demo-task-empty-state",
      "为空任务列表补充清晰的下一步引导",
      0,
      "completed",
      31,
      "模拟完成 · 区分暂无任务与筛选无结果",
      "【预置示例】首次进入时展示“创建第一项任务”；筛选无结果时展示“清除筛选”。两种空状态分别解释原因并提供一个明确动作。没有改动真实仓库。",
      `# 模拟 diff · 未修改真实文件
diff --git a/src/tasks/empty-state.tsx b/src/tasks/empty-state.tsx
--- a/src/tasks/empty-state.tsx
+++ b/src/tasks/empty-state.tsx
@@ -3,2 +3,4 @@ export function EmptyState({ filtered }: Props) {
-  return <p>暂无数据</p>;
+  return filtered
+    ? <button onClick={clearFilters}>清除筛选</button>
+    : <button onClick={openComposer}>创建第一项任务</button>;
 }`,
      "【模拟测试输出】\n✓ 初始空列表提供创建入口\n✓ 筛选无结果允许重置筛选\n\n2/2 示例用例通过；未实际执行。",
    ),
    task(
      "demo-task-retry",
      "为 API 超时增加有限重试与错误提示",
      1,
      "needs_attention",
      19,
      "模拟中断 · 等待重新排队",
      "",
      "",
      "【模拟测试输出】\n✓ 503 响应展示可重试提示\n✕ 第三次失败后应停止自动重试\n\n此失败为预置演示情境；点击“重新排队”可演示恢复流程。",
      "【模拟失败】退避重试示例未通过上限检查。点击重新排队，观察恢复执行及固定示例结果。",
    ),
    task(
      "demo-task-contrast",
      "检查暗色模式下的文字对比度与焦点可见性",
      2,
      "waiting_for_agent",
      11,
      "Scout 当前离线。可改派给 Luna 或 Forge，立即体验队列调度。",
    ),
    task(
      "demo-task-cleanup",
      "清理导航栏中已弃用的实验入口",
      0,
      "canceled",
      88,
      "演示任务已取消 · 未产生代码变更",
    ),
  ].reverse();
  const completed = snapshot.tasks.find(
    (item) => item.id === "demo-task-shortcuts",
  );
  const failed = snapshot.tasks.find((item) => item.id === "demo-task-retry");
  for (const fixture of [completed, failed]) {
    if (!fixture) continue;
    fixture.brief = {
      mode: "verified",
      context:
        "【预置演示】展示围绕验收标准的实现、测试、审查与修订闭环；没有真实仓库操作。",
      acceptanceCriteria:
        fixture === completed
          ? [
              "Tab 可以聚焦任务卡片",
              "Enter 与 Space 可打开任务详情",
              "键盘焦点清晰可见",
            ]
          : ["API 失败后最多自动重试三次", "重试耗尽后显示明确错误提示"],
      maxIterations: fixture === completed ? 2 : 1,
    };
    fixture.runId = `simulated-run-${fixture.id}`;
    fixture.workflow = initialGoalWorkflow(fixture.brief);
    while (!["completed", "blocked"].includes(fixture.workflow.phase))
      fixture.workflow = advanceSimulatedGoal(fixture.brief, fixture.workflow);
    fixture.progress =
      fixture === completed
        ? "模拟目标完成 · 两轮实现、测试与逐项审查"
        : "模拟目标受阻 · 第 1 轮审查未通过，已到轮次上限";
    if (fixture === failed)
      fixture.error =
        "【模拟失败】达到 1 轮上限，验收标准尚未全部通过。可重新排队体验相同边界；创建 2 轮目标可体验修订后通过。";
  }
  return snapshot;
}

export const staticDemoSnapshot = createDemoSnapshot();
