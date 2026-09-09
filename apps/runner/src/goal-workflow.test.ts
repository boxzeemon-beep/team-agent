import type {
  GoalBrief,
  GoalWorkflow,
  TaskAssignment,
} from "@team-agent/shared";
import { describe, expect, it, vi } from "vitest";
import type { CodexTurnOptions } from "./codex-client.js";
import {
  executeGoal,
  type GoalCheckpoint,
  type GoalDependencies,
  parseGoalReview,
} from "./goal-workflow.js";
import { assignmentCacheKey } from "./runner.js";

const tree = "a".repeat(40);
const baseline = "b".repeat(40);
const head = "c".repeat(40);
const brief: GoalBrief = {
  mode: "verified",
  context: "Users must keep their entered text.",
  acceptanceCriteria: ["Draft survives reopening", "Keyboard can submit"],
  maxIterations: 2,
};
const assignment: TaskAssignment = {
  taskId: "goal-1",
  runId: "run-1",
  agentId: "agent-1",
  requestedBy: "Member",
  requestMessages: [],
  contextMessages: [],
  contextThroughSequence: 0,
  settings: {
    projectName: "Project",
    repositoryUrl: "fixture",
    baseBranch: "main",
    sharedBranch: "team",
    testCommand: "node test.cjs",
  },
  brief,
};
const repository = { path: "fixture", baselineSha: baseline };

function review(status: "pass" | "fail" | "unknown" = "pass") {
  return {
    verdict: status === "pass" ? "pass" : "revise",
    summary:
      status === "pass"
        ? "Both acceptance criteria verified."
        : "Keyboard handling needs work.",
    checks: brief.acceptanceCriteria.map((criterion) => ({
      criterion,
      status,
      evidence: `src/form.ts handles ${criterion}; verified against the test output.`,
    })),
    issues:
      status === "pass" ? [] : ["Inspect keyboard handling in src/form.ts."],
  };
}

function fixture(reviews = [review()]) {
  const checkpoints: GoalCheckpoint[] = [];
  const workflows: GoalWorkflow[] = [];
  const turns: CodexTurnOptions[] = [];
  let reviewIndex = 0;
  const dependencies: GoalDependencies = {
    codex: {
      runTurn: vi.fn(async (options) => {
        turns.push(options);
        return {
          threadId: `thread-${turns.length}`,
          text: options.readOnly
            ? JSON.stringify(reviews[reviewIndex++])
            : "Implemented acceptance behavior.",
        };
      }),
    },
    git: {
      test: vi.fn(async () => "2 actual tests passed"),
      snapshotTree: vi.fn(async () => tree),
      head: vi.fn(async () => head),
      publish: vi.fn(async () => ({
        diff: "+implemented",
        commitSha: "d".repeat(40),
      })),
    },
    persist: vi.fn(async (checkpoint) => {
      checkpoints.push(structuredClone(checkpoint));
    }),
    onWorkflow: (workflow) => workflows.push(structuredClone(workflow)),
    callbacks: { onProgress() {}, onWaitingOwner() {} },
  };
  return { dependencies, turns, checkpoints, workflows };
}

describe("verified goal execution", () => {
  it("revises from independent evidence, re-tests, and publishes only the accepted tree", async () => {
    const f = fixture([review("fail"), review()]);
    await executeGoal(
      assignment,
      repository,
      "Implement the form.",
      f.dependencies,
    );
    expect(f.turns.map((turn) => Boolean(turn.readOnly))).toEqual([
      false,
      true,
      false,
      true,
    ]);
    expect(f.turns[2]?.prompt).toContain(
      "Inspect keyboard handling in src/form.ts.",
    );
    expect(f.turns[1]?.threadId).toBeUndefined();
    expect(f.turns[3]?.threadId).toBeUndefined();
    expect(f.turns[1]?.outputSchema).toBeDefined();
    expect(f.dependencies.git.test).toHaveBeenCalledTimes(2);
    expect(f.dependencies.git.publish).toHaveBeenCalledExactlyOnceWith(
      repository,
      expect.objectContaining({ expectedTreeSha: tree, expectedHeadSha: head }),
    );
    expect(f.workflows.at(-1)).toMatchObject({
      phase: "completed",
      iteration: 2,
      testStatus: "passed",
    });
    expect(f.workflows.at(-1)?.reviews.map((value) => value.verdict)).toEqual([
      "revise",
      "pass",
    ]);
    expect(f.workflows.map((value) => value.sequence)).toEqual(
      f.workflows.map((_, index) => index + 1),
    );
    expect(f.checkpoints.at(-1)?.reviewedTreeSha).toBe(tree);
  });

  it("blocks before implementation when a real test command is absent", async () => {
    const f = fixture();
    await expect(
      executeGoal(
        {
          ...assignment,
          settings: { ...assignment.settings, testCommand: " " },
        },
        repository,
        "Implement.",
        f.dependencies,
      ),
    ).rejects.toThrow("real project test command");
    expect(f.turns).toEqual([]);
    expect(f.dependencies.git.publish).not.toHaveBeenCalled();
    expect(f.workflows.at(-1)).toMatchObject({
      phase: "blocked",
      testStatus: "not_configured",
    });
  });

  it("honors maxIterations=1 instead of silently granting another revision", async () => {
    const f = fixture([review("fail")]);
    await expect(
      executeGoal(
        { ...assignment, brief: { ...brief, maxIterations: 1 } },
        repository,
        "Implement.",
        f.dependencies,
      ),
    ).rejects.toThrow("iteration limit");
    expect(f.turns).toHaveLength(2);
    expect(f.dependencies.git.publish).not.toHaveBeenCalled();
    expect(f.workflows.at(-1)?.reviews).toHaveLength(1);
  });

  it("a claimed passing review cannot bypass a failed actual test command", async () => {
    const f = fixture();
    vi.mocked(f.dependencies.git.test).mockRejectedValue(
      Object.assign(new Error("exit 1"), { testOutput: "Assertion failed" }),
    );
    await expect(
      executeGoal(
        { ...assignment, brief: { ...brief, maxIterations: 1 } },
        repository,
        "Implement.",
        f.dependencies,
      ),
    ).rejects.toMatchObject({ testOutput: "Assertion failed" });
    expect(f.dependencies.git.publish).not.toHaveBeenCalled();
    expect(f.workflows.at(-1)).toMatchObject({
      testStatus: "failed",
      phase: "blocked",
    });
    expect(f.workflows.at(-1)?.reviews[0]?.verdict).toBe("revise");
  });

  it("rejects writes during independent review", async () => {
    const f = fixture();
    vi.mocked(f.dependencies.git.snapshotTree)
      .mockResolvedValueOnce(tree)
      .mockResolvedValueOnce("e".repeat(40));
    await expect(
      executeGoal(assignment, repository, "Implement.", f.dependencies),
    ).rejects.toThrow("changed while the read-only reviewer");
    expect(f.dependencies.git.publish).not.toHaveBeenCalled();
    expect(f.workflows.at(-1)?.phase).toBe("blocked");
  });

  it("revalidates an interrupted publication in a fresh review without changing review history", async () => {
    const f = fixture();
    const accepted = {
      ...review(),
      iteration: 1,
      reviewedTreeSha: tree,
    } as GoalCheckpoint["workflow"]["reviews"][number];
    const saved: GoalCheckpoint = {
      taskId: assignment.taskId,
      runId: "run-1",
      baselineSha: baseline,
      result: "Preserved implementation",
      testOutput: "old output",
      reviewedTreeSha: tree,
      reviewedHeadSha: head,
      workflow: {
        sequence: 7,
        phase: "publishing",
        iteration: 1,
        maxIterations: 2,
        testStatus: "passed",
        reviews: [accepted],
      },
    };
    await executeGoal(
      assignment,
      { ...repository, taskCommitSha: "d".repeat(40) },
      "Implement.",
      f.dependencies,
      saved,
    );
    expect(f.turns).toHaveLength(1);
    expect(f.turns[0]?.readOnly).toBe(true);
    expect(f.dependencies.git.test).toHaveBeenCalledOnce();
    expect(f.workflows[0]?.sequence).toBe(8);
    expect(f.workflows.at(-1)?.reviews).toEqual([accepted]);
    expect(f.checkpoints.at(-1)?.recoveryReview?.reviewedTreeSha).toBe(tree);
    expect(f.dependencies.git.publish).toHaveBeenCalledOnce();
  });

  it("never uses a preserved task commit as a shortcut around recovery tests", async () => {
    const f = fixture();
    const saved: GoalCheckpoint = {
      taskId: assignment.taskId,
      runId: "run-1",
      baselineSha: baseline,
      result: "Preserved implementation",
      testOutput: "old output",
      workflow: {
        sequence: 7,
        phase: "publishing",
        iteration: 1,
        maxIterations: 2,
        testStatus: "passed",
        reviews: [
          {
            ...review(),
            iteration: 1,
            reviewedTreeSha: tree,
          } as GoalCheckpoint["workflow"]["reviews"][number],
        ],
      },
    };
    vi.mocked(f.dependencies.git.test).mockRejectedValue(
      Object.assign(new Error("failed"), { testOutput: "Regression detected" }),
    );
    await expect(
      executeGoal(
        assignment,
        { ...repository, taskCommitSha: "d".repeat(40) },
        "Implement.",
        f.dependencies,
        saved,
      ),
    ).rejects.toThrow("Fresh recovery verification did not confirm");
    expect(f.dependencies.git.test).toHaveBeenCalledOnce();
    expect(f.dependencies.git.publish).not.toHaveBeenCalled();
  });

  it("refuses a recovery test that changes the previously accepted tree", async () => {
    const f = fixture();
    const saved: GoalCheckpoint = {
      taskId: assignment.taskId,
      runId: "run-1",
      baselineSha: baseline,
      result: "done",
      testOutput: "old",
      workflow: {
        sequence: 4,
        phase: "publishing",
        iteration: 1,
        maxIterations: 2,
        testStatus: "passed",
        reviews: [
          {
            ...review(),
            iteration: 1,
            reviewedTreeSha: tree,
          } as GoalCheckpoint["workflow"]["reviews"][number],
        ],
      },
    };
    vi.mocked(f.dependencies.git.snapshotTree).mockResolvedValue(
      "f".repeat(40),
    );
    await expect(
      executeGoal(assignment, repository, "Implement.", f.dependencies, saved),
    ).rejects.toThrow("accepted tree changed");
    expect(f.dependencies.git.publish).not.toHaveBeenCalled();
  });

  it("separates retry completion caches by execution run ID", () => {
    expect(assignmentCacheKey(assignment)).not.toBe(
      assignmentCacheKey({ ...assignment, runId: "run-2" }),
    );
    expect(assignmentCacheKey({ taskId: assignment.taskId })).toBe(
      assignment.taskId,
    );
  });
});

describe("independent review evidence parser", () => {
  it.each([
    ["malformed JSON", "The code looks good"],
    [
      "missing criterion",
      JSON.stringify({ ...review(), checks: review().checks.slice(0, 1) }),
    ],
    [
      "duplicate criterion",
      JSON.stringify({
        ...review(),
        checks: [review().checks[0], review().checks[0]],
      }),
    ],
    [
      "unknown evidence claimed as pass",
      JSON.stringify({ ...review("unknown"), verdict: "pass" }),
    ],
    [
      "unresolved issue claimed as pass",
      JSON.stringify({ ...review(), issues: ["Cannot inspect behavior"] }),
    ],
    [
      "self-assigned tree",
      JSON.stringify({ ...review(), reviewedTreeSha: "fake" }),
    ],
  ])("rejects %s", (_name, value) => {
    expect(() => parseGoalReview(value, brief, 1, tree)).toThrow();
  });
});
