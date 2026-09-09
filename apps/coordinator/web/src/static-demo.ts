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
    "[FIXED EXAMPLE — NO LIVE DEVELOPMENT] You have explored the queue, execution and review flow. This prewritten task-card accessibility example does not implement your request. No Codex session, tests or Git operations ran. Connect your own Coordinator and Runner to execute real work.",
  diff: `# SIMULATED DIFF — fixed accessibility example; no files changed
diff --git a/src/components/task-card.tsx b/src/components/task-card.tsx
--- a/src/components/task-card.tsx
+++ b/src/components/task-card.tsx
@@ -12,5 +12,10 @@ export function TaskCard({ task }: Props) {
   return (
-    <div className="task-card" onClick={onSelect}>
+    <button
+      type="button"
+      className="task-card"
+      aria-label={\`Open task: \${task.title}\`}
+      onClick={onSelect}
+    >
       <span>{task.title}</span>
-    </div>
+    </button>
   );`,
  testOutput: `[SIMULATED TEST OUTPUT — no test command ran]
Fixed example: task-card.accessibility.test.tsx
  ✓ Tab focuses the task card
  ✓ Enter and Space open task details
  ✓ Assistive technology announces the task name

3/3 illustrative checks passed — this output does not verify your request`,
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
      name: "Demo visitor",
      isAdmin: false,
      createdAt: stamp(150),
    },
    settings: {
      projectName: "Team Agent Workbench",
      repositoryUrl: "simulated://browser-only",
      baseBranch: "main",
      sharedBranch: "team/workspace",
      testCommand: "pnpm test (not executed in the demo)",
    },
    agents: [
      {
        id: "static-agent-luna",
        ownerMemberId: "static-owner-lin",
        ownerName: "Lin",
        displayName: "Luna · Frontend",
        status: "online",
        lastContextMessageSequence: 9,
        lastSeenAt: stamp(0),
      },
      {
        id: "static-agent-forge",
        ownerMemberId: "static-owner-alex",
        ownerName: "Alex",
        displayName: "Forge · Backend",
        status: "online",
        lastContextMessageSequence: 6,
        lastSeenAt: stamp(0),
      },
      {
        id: "static-agent-scout",
        ownerMemberId: "static-owner-mika",
        ownerName: "Mika",
        displayName: "Scout · Code review",
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
        memberName: "Demo system",
        role: "system",
        content:
          "Prewritten demo record. Messages, code changes and test results are illustrative examples.",
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
      "Keep users signed in after a page refresh",
      1,
      "completed",
      68,
      "Simulated completion · session restoration and expiry covered",
      "[PREWRITTEN EXAMPLE] Restore the session before deciding whether to redirect. A loading state prevents the sign-in form from flashing for authenticated users; an expired session preserves the return URL. The example covers valid sessions, expired sessions and request failures. All changes and tests are simulated.",
      `# SIMULATED DIFF — no real files changed
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
      "[SIMULATED TEST OUTPUT]\n✓ A valid session survives a page refresh\n✓ An expired session redirects and preserves the return URL\n✓ A network error offers a retry action\n\n3/3 illustrative checks passed; not executed.",
    ),
    task(
      "demo-task-shortcuts",
      "Make task cards accessible by keyboard and screen reader",
      0,
      "completed",
      47,
      "Simulated completion · consistent Tab, Enter and Space behavior",
      "[PREWRITTEN EXAMPLE] Replace the clickable container with a native button, an accessible task name and visible focus. Keyboard users can open details and screen readers announce the task. The code and tests below are fixed examples, with no real commit.",
      staticDemoResult.diff,
      staticDemoResult.testOutput,
    ),
    task(
      "demo-task-empty-state",
      "Give empty task lists a clear next step",
      0,
      "completed",
      31,
      "Simulated completion · distinct empty and no-match states",
      "[PREWRITTEN EXAMPLE] Show “Create your first task” for a new workspace and “Clear filters” when no tasks match. Each state explains why the list is empty and offers one next step. No real repository was changed.",
      `# SIMULATED DIFF — no real files changed
diff --git a/src/tasks/empty-state.tsx b/src/tasks/empty-state.tsx
--- a/src/tasks/empty-state.tsx
+++ b/src/tasks/empty-state.tsx
@@ -3,2 +3,4 @@ export function EmptyState({ filtered }: Props) {
-  return <p>No data</p>;
+  return filtered
+    ? <button onClick={clearFilters}>Clear filters</button>
+    : <button onClick={openComposer}>Create your first task</button>;
 }`,
      "[SIMULATED TEST OUTPUT]\n✓ A new empty list offers task creation\n✓ A no-match state offers a filter reset\n\n2/2 illustrative checks passed; not executed.",
    ),
    task(
      "demo-task-retry",
      "Bound API retries and explain timeout failures",
      1,
      "needs_attention",
      19,
      "Simulation interrupted · ready to retry",
      "",
      "",
      "[SIMULATED TEST OUTPUT]\n✓ A 503 response offers a retry action\n✓ The first retry respects the configured delay\n\n2/2 illustrative checks passed; no test command ran. The independent review still found an unmet acceptance criterion. Retry to explore the same one-round limit.",
      "[SIMULATED FAILURE] The retry example failed its limit check. Retry to explore recovery within the original round limit.",
    ),
    task(
      "demo-task-contrast",
      "Check text contrast and focus visibility in dark mode",
      2,
      "waiting_for_agent",
      11,
      "Scout is offline. Reassign to Luna or Forge to explore the queue.",
    ),
    task(
      "demo-task-cleanup",
      "Remove retired experimental navigation links",
      0,
      "canceled",
      88,
      "Demo task canceled · no code changes",
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
        "[PREWRITTEN DEMO] Explore implementation, testing, review and revision against agreed criteria. No real repository operations occur.",
      acceptanceCriteria:
        fixture === completed
          ? [
              "Tab can focus a task card",
              "Enter and Space can open task details",
              "Keyboard focus is clearly visible",
            ]
          : [
              "Failed API requests retry no more than three times",
              "Show a clear error when retries are exhausted",
            ],
      maxIterations: fixture === completed ? 2 : 1,
    };
    fixture.runId = `simulated-run-${fixture.id}`;
    fixture.workflow = initialGoalWorkflow(fixture.brief);
    while (!["completed", "blocked"].includes(fixture.workflow.phase))
      fixture.workflow = advanceSimulatedGoal(fixture.brief, fixture.workflow);
    fixture.progress =
      fixture === completed
        ? "Simulated goal completed · two rounds of implementation, tests and review"
        : "Simulated goal blocked · first review failed at the one-round limit";
    if (fixture === failed)
      fixture.error =
        "[SIMULATED FAILURE] The one-round limit was reached before all criteria passed. Retrying preserves that limit; create a two-round goal to explore revision and a passing review.";
  }
  return snapshot;
}

export const staticDemoSnapshot = createDemoSnapshot();
