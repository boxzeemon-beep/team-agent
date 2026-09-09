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
          ? "[SIMULATED REVIEW] The revised fixed example passes; your actual request has not been verified."
          : "[SIMULATED REVIEW] The fixed example fails one acceptance check and needs revision.",
        checks: brief.acceptanceCriteria.map((criterion, index) => ({
          criterion,
          status:
            passed || index < brief.acceptanceCriteria.length - 1
              ? "pass"
              : "fail",
          evidence:
            "[SIMULATED EVIDENCE] An example of a criterion-level review; your request and tests were not executed.",
        })),
        issues: passed
          ? []
          : [
              "[SIMULATED ISSUE] One agreed criterion is not yet satisfied in the fixed example.",
            ],
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
