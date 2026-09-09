import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type GoalBrief,
  initialGoalWorkflow,
  type TaskAssignment,
} from "@team-agent/shared";
import { describe, expect, it } from "vitest";
import { CoordinatorDatabase } from "./database.js";

function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined)
    throw new Error("Missing goal fixture");
  return value;
}

const brief: GoalBrief = {
  mode: "verified",
  context: "Preserve keyboard access",
  acceptanceCriteria: ["Keyboard opens task"],
  maxIterations: 2,
};

function setup(path = ":memory:") {
  const db = new CoordinatorDatabase(path);
  const member = db.seedDemo();
  db.sqlite.exec("DELETE FROM tasks");
  const agent = required(db.listAgents()[0]);
  db.setAgentStatus(agent.id, "online");
  const task = db.createTask("goal", member, agent, "Goal", "queued", brief);
  const assignment: TaskAssignment = {
    taskId: task.id,
    agentId: agent.id,
    requestedBy: member.name,
    requestMessages: [],
    contextMessages: [],
    contextThroughSequence: 0,
    settings: db.getSettings(),
    brief,
    runId: required(task.runId),
  };
  return { db, agent, task, assignment };
}

describe("durable goal protocol", () => {
  it("persists the agreed brief, run and exact assignment through database restart", () => {
    const directory = mkdtempSync(join(tmpdir(), "team-agent-goal-"));
    const path = join(directory, "state.sqlite");
    const { db, task, agent, assignment } = setup(path);
    try {
      expect(db.assignTask(task.id, agent.id, 0, assignment)).toBe(true);
      const workflow = {
        ...initialGoalWorkflow(brief),
        phase: "testing" as const,
        sequence: 1,
      };
      expect(
        db.updateGoalWorkflow(
          task.id,
          agent.id,
          required(task.runId),
          workflow,
        ),
      ).toBe(true);
      db.close();
      const restored = new CoordinatorDatabase(path);
      try {
        restored.normalizeAfterRestart();
        expect(restored.taskById(task.id)).toMatchObject({
          brief,
          runId: task.runId,
          workflow,
          status: "running",
        });
        expect(restored.activeAssignmentForAgent(agent.id)).toEqual(assignment);
      } finally {
        restored.close();
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("freezes the assignment and ignores old runs, duplicate sequences and changed review history", () => {
    const { db, task, agent, assignment } = setup();
    try {
      expect(
        db.assignTask(task.id, agent.id, 0, {
          ...assignment,
          brief: { ...brief, context: "changed" },
        }),
      ).toBe(false);
      expect(db.assignTask(task.id, agent.id, 0, assignment)).toBe(true);
      const workflow = {
        ...initialGoalWorkflow(brief),
        sequence: 1,
        reviews: [
          {
            iteration: 1,
            verdict: "revise" as const,
            summary: "Need focus",
            checks: [
              {
                criterion: required(brief.acceptanceCriteria[0]),
                status: "fail" as const,
                evidence: "Missing focus",
              },
            ],
            issues: ["Missing focus"],
          },
        ],
      };
      expect(
        db.updateGoalWorkflow(task.id, agent.id, "old-run", workflow),
      ).toBe(false);
      expect(
        db.updateGoalWorkflow(
          task.id,
          agent.id,
          required(task.runId),
          workflow,
        ),
      ).toBe(true);
      expect(
        db.updateGoalWorkflow(
          task.id,
          agent.id,
          required(task.runId),
          workflow,
        ),
      ).toBe(false);
      expect(
        db.updateGoalWorkflow(task.id, agent.id, required(task.runId), {
          ...workflow,
          sequence: 2,
          reviews: [],
        }),
      ).toBe(false);
      expect(db.taskById(task.id)?.workflow).toEqual(workflow);
    } finally {
      db.close();
    }
  });

  it("never completes unverified work and resets retry evidence without deleting its history", () => {
    const { db, task, agent, assignment } = setup();
    try {
      db.assignTask(task.id, agent.id, 0, assignment);
      for (const phase of ["publishing", "completed"] as const) {
        expect(
          db.updateGoalWorkflow(task.id, agent.id, required(task.runId), {
            ...initialGoalWorkflow(brief),
            sequence: 1,
            phase,
          }),
        ).toBe(false);
      }
      expect(db.taskById(task.id)?.workflow?.phase).toBe("implementing");
      expect(db.finishTask(task.id, agent.id, 0, { status: "completed" })).toBe(
        false,
      );
      db.finishTask(task.id, agent.id, 0, {
        status: "needs_attention",
        error: "failed",
        diff: "old diff",
        test_output: "old failure",
      });
      expect(db.retryTask(task.id, "queued")).toBe(true);
      const retried = required(db.taskById(task.id));
      expect(retried.runId).not.toBe(task.runId);
      expect(retried.workflow).toEqual(initialGoalWorkflow(brief));
      expect(retried.diff).toBe("");
      expect(retried.testOutput).toBe("");
      expect(retried.messages.at(-1)?.content).toContain("old diff");
      expect(db.activeAssignmentForAgent(agent.id)).toBeNull();
      expect(db.assignTask(task.id, agent.id, 0, assignment)).toBe(false);
    } finally {
      db.close();
    }
  });

  it("accepts the Runner's atomic first-review-and-revision event but rejects unsupported iteration jumps", () => {
    const { db, task, agent, assignment } = setup();
    try {
      db.assignTask(task.id, agent.id, 0, assignment);
      expect(
        db.updateGoalWorkflow(task.id, agent.id, required(task.runId), {
          ...initialGoalWorkflow(brief),
          phase: "reviewing",
          sequence: 1,
          testStatus: "passed",
        }),
      ).toBe(true);
      const second = {
        ...initialGoalWorkflow(brief),
        phase: "revising" as const,
        sequence: 2,
        iteration: 2,
      };
      expect(
        db.updateGoalWorkflow(task.id, agent.id, required(task.runId), second),
      ).toBe(false);
      expect(
        db.updateGoalWorkflow(task.id, agent.id, required(task.runId), {
          ...second,
          reviews: [
            {
              iteration: 1,
              verdict: "revise",
              summary: "Focus needs work",
              checks: [
                {
                  criterion: "Keyboard opens task",
                  status: "fail",
                  evidence: "No visible focus",
                },
              ],
              issues: ["No visible focus"],
            },
          ],
        }),
      ).toBe(true);
      expect(db.taskById(task.id)?.workflow).toMatchObject({
        phase: "revising",
        iteration: 2,
        sequence: 2,
      });
    } finally {
      db.close();
    }
  });
});
