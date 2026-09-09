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
  context: "保留现有接口。",
  acceptanceCriteria: ["刷新后保留会话"],
  maxIterations: 2,
};
const task = {
  id: "task-source",
  runId: "run-source",
  prompt: "修复登录状态",
  status: "canceled",
  brief,
  workflow: initialGoalWorkflow(brief),
  messages: [],
} as unknown as Task;

describe("goal drafts and acceptance evidence", () => {
  it("does not describe canceled or attention tasks as actively implementing", () => {
    expect(taskWorkflowLabel(task)).toBe("已取消");
    expect(taskWorkflowLabel({ ...task, status: "needs_attention" })).toBe(
      "需要你处理",
    );
  });

  it("keeps full long feedback and background editable while preventing oversized submission", () => {
    const feedback = "反馈".repeat(10000);
    const context = "背景".repeat(5000);
    const draft = followupDraft(
      { ...task, brief: { ...brief, context } },
      feedback,
    );
    expect(draft.prompt).toContain(feedback);
    expect(draft.goal.context).toContain(context);
    expect(draft.goal.context).toContain(task.id);
    expect(draft.prompt.length).toBeGreaterThan(20000);
    expect(goalDraftError(draft.goal)).toContain("完整草稿已保留");
    expect(draft.goal.criteria).toBe(brief.acceptanceCriteria[0]);
  });

  it("lets a user switch to direct execution without deleting hidden criteria", () => {
    const draft = {
      ...emptyGoalDraft,
      mode: "direct" as const,
      criteria: Array.from({ length: 13 }, (_, index) => `条目 ${index}`).join(
        "\n",
      ),
    };
    expect(goalDraftError(draft)).toBe("");
    expect(toGoalBrief(draft).acceptanceCriteria).toEqual([]);
    expect(goalDraftError({ ...draft, mode: "verified" })).toContain("12");
  });

  it("exports run identity and keeps raw evidence containing Markdown fences intact", () => {
    const raw = "before\n```html\n<div>test</div>\n```\nafter";
    const report = evidenceReport({ ...task, testOutput: raw }, true);
    expect(report).toContain("任务 ID：task-source");
    expect(report).toContain("运行 ID：run-source");
    expect(report).toContain("检查点序号：0");
    expect(report).toContain("模拟演示记录");
    expect(report).toContain(`\n${raw}\n`);
    expect(report).toContain("````text");
  });
});
