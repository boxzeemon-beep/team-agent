import { initialGoalWorkflow, type Task } from "@team-agent/shared";
import { describe, expect, it } from "vitest";
import {
  emptyGoalDraft,
  followupDraft,
  goalDraftError,
  taskWorkflowLabel,
  toGoalBrief,
} from "./GoalWorkflow.js";
import { evidenceReport } from "./task-model.js";

const brief = {
  mode: "verified" as const,
  context: "Preserve the existing API.",
  acceptanceCriteria: ["Keep the session after refresh"],
  maxIterations: 2,
};
const task = {
  id: "task-source",
  runId: "run-source",
  prompt: "Fix session restoration",
  status: "canceled",
  brief,
  workflow: initialGoalWorkflow(brief),
  messages: [],
} as unknown as Task;

describe("goal drafts and acceptance evidence", () => {
  it("does not describe canceled or attention tasks as actively implementing", () => {
    expect(taskWorkflowLabel(task)).toBe("Canceled");
    expect(taskWorkflowLabel({ ...task, status: "needs_attention" })).toBe(
      "Needs attention",
    );
  });

  it("keeps full long feedback and background editable while preventing oversized submission", () => {
    const feedback = "fb".repeat(10000);
    const context = "cx".repeat(5000);
    const draft = followupDraft(
      { ...task, brief: { ...brief, context } },
      feedback,
    );
    expect(draft.prompt).toContain(feedback);
    expect(draft.goal.context).toContain(context);
    expect(draft.goal.context).toContain(task.id);
    expect(draft.prompt.length).toBeGreaterThan(20000);
    expect(goalDraftError(draft.goal)).toContain("Your full draft is saved");
    expect(draft.goal.criteria).toBe(brief.acceptanceCriteria[0]);
  });

  it("lets a user switch to direct execution without deleting hidden criteria", () => {
    const draft = {
      ...emptyGoalDraft,
      mode: "direct" as const,
      criteria: Array.from(
        { length: 13 },
        (_, index) => `Criterion ${index}`,
      ).join("\n"),
    };
    expect(goalDraftError(draft)).toBe("");
    expect(toGoalBrief(draft).acceptanceCriteria).toEqual([]);
    expect(goalDraftError({ ...draft, mode: "verified" })).toContain("12");
  });

  it("exports run identity and keeps raw evidence containing Markdown fences intact", () => {
    const raw = "before\n```html\n<div>test</div>\n```\nafter";
    const report = evidenceReport({ ...task, testOutput: raw }, true);
    expect(report).toContain("Task ID: task-source");
    expect(report).toContain("Run ID: run-source");
    expect(report).toContain("Checkpoint sequence: 0");
    expect(report).toContain("Simulated demo record");
    expect(report).toContain(`\n${raw}\n`);
    expect(report).toContain("````text");
  });
});
