import type { DashboardSnapshot } from "@team-agent/shared";

const now = new Date().toISOString();

/** Browser-only fixture for GitHub Pages. No Coordinator, API, Codex, or Git. */
export const staticDemoSnapshot: DashboardSnapshot = {
  me: {
    id: "static-demo-visitor",
    name: "试玩访客",
    isAdmin: false,
    createdAt: now,
  },
  settings: {
    projectName: "[DEMO] PUBLIC TACTICAL LOBBY",
    repositoryUrl: "simulated://browser-only",
    baseBranch: "main",
    sharedBranch: "internal-alpha · SIMULATED",
    testCommand: "pnpm test · simulated",
  },
  agents: [
    {
      id: "static-agent-luna",
      ownerMemberId: "static-owner-lin",
      ownerName: "Lin",
      displayName: "Luna · Frontend",
      status: "online",
      lastContextMessageSequence: 0,
      lastSeenAt: now,
    },
    {
      id: "static-agent-forge",
      ownerMemberId: "static-owner-alex",
      ownerName: "Alex",
      displayName: "Forge · Backend",
      status: "online",
      lastContextMessageSequence: 0,
      lastSeenAt: now,
    },
    {
      id: "static-agent-scout",
      ownerMemberId: "static-owner-mika",
      ownerName: "Mika",
      displayName: "Scout · Review",
      status: "offline",
      lastContextMessageSequence: 0,
      lastSeenAt: now,
    },
  ],
  tasks: [],
};

export const staticDemoResult = {
  result:
    "[模拟结果] 已为任务补充状态提示和键盘可访问性，并生成一份可审查的变更记录。此页面没有调用 Codex，也没有读写 Git 仓库。",
  diff: `diff --git a/src/mission-card.tsx b/src/mission-card.tsx
index 21a90f1..9b14c3e 100644
--- a/src/mission-card.tsx
+++ b/src/mission-card.tsx
@@ -18,6 +18,9 @@ export function MissionCard({ mission }: Props) {
   return (
-    <article className="mission-card">
+    <article
+      className="mission-card"
+      aria-label={\`Mission: \${mission.title}\`}
+    >
       <MissionStatus status={mission.status} />
       <h3>{mission.title}</h3>`,
  testOutput: `[模拟测试输出]
✓ mission-card renders its current state
✓ mission-card exposes an accessible label
✓ queued missions remain read-only

Test Files  1 passed (1)
Tests       3 passed (3)`,
  commitSha: "demo9b14c3e5f27a8d61",
};
