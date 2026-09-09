import { describe, expect, it } from "vitest";
import {
  canCompleteGoal,
  type GoalBrief,
  type GoalWorkflow,
  goalBriefSchema,
  runnerClientMessageSchema,
  runnerTextLimits,
  textTruncationMarker,
  truncateText,
} from "./index.js";

describe("Runner text limits", () => {
  it("truncates inside the schema limit and includes a marker", () => {
    const message = truncateText("x".repeat(100), 32);
    expect(message).toHaveLength(32);
    expect(message.endsWith(textTruncationMarker)).toBe(true);
  });

  it("rejects Runner payloads above the matching persisted-field limit", () => {
    expect(() =>
      runnerClientMessageSchema.parse({
        type: "task.progress",
        taskId: "task",
        message: "x".repeat(runnerTextLimits.progress + 1),
      }),
    ).toThrow();
  });
});

describe("goal acceptance contract", () => {
  const brief: GoalBrief = {
    mode: "verified",
    context: "Keep keyboard support",
    acceptanceCriteria: ["Keyboard opens details", "Focus is visible"],
    maxIterations: 2,
  };
  const passed = (): GoalWorkflow => ({
    phase: "publishing",
    iteration: 1,
    maxIterations: 2,
    sequence: 4,
    testStatus: "passed",
    reviews: [
      {
        iteration: 1,
        verdict: "pass",
        summary: "Verified against tests and diff",
        checks: brief.acceptanceCriteria.map((criterion) => ({
          criterion,
          status: "pass",
          evidence: "Integration tests cover this criterion",
        })),
        issues: [],
        reviewedTreeSha: "a".repeat(40),
      },
    ],
  });

  it("requires every agreed criterion exactly once, actual test success and a reviewed tree", () => {
    expect(canCompleteGoal(brief, passed())).toBe(true);
    const missing = passed();
    missing.reviews[0]?.checks.pop();
    const duplicate = passed();
    duplicate.reviews[0]?.checks.splice(1, 1, {
      criterion: "Keyboard opens details",
      status: "pass",
      evidence: "Duplicated evidence",
    });
    const noTree = passed();
    if (noTree.reviews[0]) delete noTree.reviews[0].reviewedTreeSha;
    const openIssue = passed();
    openIssue.reviews[0]?.issues.push("Known failing acceptance condition");
    for (const workflow of [
      missing,
      duplicate,
      noTree,
      openIssue,
      { ...passed(), testStatus: "not_configured" as const },
      { ...passed(), phase: "reviewing" as const },
    ])
      expect(canCompleteGoal(brief, workflow)).toBe(false);
  });

  it("enforces normalized unique bounded criteria and finite iteration budgets", () => {
    for (const invalid of [
      { ...brief, acceptanceCriteria: [] },
      { ...brief, acceptanceCriteria: [" same ", "same"] },
      {
        ...brief,
        acceptanceCriteria: Array.from(
          { length: 13 },
          (_, i) => `criterion ${i}`,
        ),
      },
      { ...brief, acceptanceCriteria: ["x".repeat(501)] },
      { ...brief, context: "x".repeat(10001) },
      { ...brief, maxIterations: 0 },
      { ...brief, maxIterations: 4 },
    ])
      expect(goalBriefSchema.safeParse(invalid).success).toBe(false);
    expect(
      goalBriefSchema.parse({ ...brief, acceptanceCriteria: ["  trimmed  "] })
        .acceptanceCriteria,
    ).toEqual(["trimmed"]);
  });
});
