import type { GoalBrief, GoalWorkflow } from "@team-agent/shared";

/** All values are illustrative; the all-zero tree is a simulation sentinel. */
export function advanceSimulatedGoal(
  brief: GoalBrief,
  previous: GoalWorkflow,
): GoalWorkflow {
  const workflow = structuredClone(previous);
  workflow.sequence++;
  switch (workflow.phase) {
    case "implementing":
      workflow.phase = "testing";
      break;
    case "testing":
      workflow.phase = "reviewing";
      workflow.testStatus = "passed";
      break;
    case "reviewing": {
      const passed = workflow.iteration > 1;
      const exhausted = !passed && workflow.iteration >= brief.maxIterations;
      workflow.reviews.push({
        iteration: workflow.iteration,
        verdict: passed ? "pass" : exhausted ? "blocked" : "revise",
        summary: passed
          ? "【模拟复审】修订后通过固定场景；未验证真实需求。"
          : "【模拟审查】固定场景发现键盘焦点缺失，需要修订。",
        checks: brief.acceptanceCriteria.map((criterion, index) => ({
          criterion,
          status:
            passed || index < brief.acceptanceCriteria.length - 1
              ? "pass"
              : "fail",
          evidence: "【模拟证据】仅演示逐项验收界面；没有执行你的需求或测试。",
        })),
        issues: passed ? [] : ["【模拟问题】任务卡片缺少可见的键盘焦点。"],
        ...(passed ? { reviewedTreeSha: "0".repeat(40) } : {}),
      });
      workflow.phase = passed
        ? "publishing"
        : exhausted
          ? "blocked"
          : "revising";
      break;
    }
    case "revising":
      workflow.iteration++;
      workflow.phase = "implementing";
      workflow.testStatus = "not_run";
      break;
    case "publishing":
      workflow.phase = "completed";
      break;
    default:
      break;
  }
  return workflow;
}
