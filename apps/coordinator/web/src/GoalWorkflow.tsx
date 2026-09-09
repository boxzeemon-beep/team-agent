import type { GoalBrief, GoalWorkflow, Task } from "@team-agent/shared";
import { Icon } from "./ui.js";

export interface GoalDraft {
  mode: "direct" | "verified";
  criteria: string;
  context: string;
  maxIterations: number;
}
export const emptyGoalDraft: GoalDraft = {
  mode: "verified",
  criteria: "",
  context: "",
  maxIterations: 2,
};
export function readGoalDraft(key: string): GoalDraft {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) ?? "null");
    if (
      value &&
      ["direct", "verified"].includes(value.mode) &&
      typeof value.criteria === "string" &&
      typeof value.context === "string" &&
      [1, 2, 3].includes(value.maxIterations)
    )
      return value;
  } catch {
    /* Storage is optional; a new goal can always be written. */
  }
  return { ...emptyGoalDraft };
}
export function criteriaLines(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/\r?\n/)
        .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)、])\s+/, "").trim())
        .filter(Boolean),
    ),
  ];
}
export function goalDraftError(draft: GoalDraft): string {
  if (draft.context.length > 10000)
    return "Context is limited to 10,000 characters. Your full draft is saved; shorten it before submitting.";
  if (draft.mode === "direct") return "";
  const criteria = criteriaLines(draft.criteria);
  if (draft.mode === "verified" && !criteria.length)
    return "Add at least one verifiable acceptance criterion before submitting.";
  if (criteria.length > 12)
    return "Use up to 12 acceptance criteria so each one can be reviewed.";
  if (criteria.some((line) => line.length > 500))
    return "Each criterion can contain up to 500 characters. Split longer ones into specific requirements.";
  return "";
}
export function toGoalBrief(draft: GoalDraft): GoalBrief {
  return {
    mode: draft.mode,
    context: draft.context.trim(),
    acceptanceCriteria:
      draft.mode === "verified" ? criteriaLines(draft.criteria) : [],
    maxIterations: draft.maxIterations,
  };
}

export function GoalComposer({
  value,
  onChange,
}: {
  value: GoalDraft;
  onChange: (value: GoalDraft) => void;
}) {
  const verified = value.mode === "verified";
  return (
    <div className="goal-composer">
      <div className="goal-mode-row">
        <fieldset className="goal-mode-control" aria-label="Execution mode">
          <button
            type="button"
            aria-pressed={verified}
            onClick={() => onChange({ ...value, mode: "verified" })}
          >
            <Icon name="shield" size={15} />
            Verified goal
          </button>
          <button
            type="button"
            aria-pressed={!verified}
            onClick={() => onChange({ ...value, mode: "direct" })}
          >
            Direct task
          </button>
        </fieldset>
        {verified && (
          <label className="iteration-control">
            Up to
            <select
              aria-label="Maximum implementation and review rounds"
              value={value.maxIterations}
              onChange={(event) =>
                onChange({
                  ...value,
                  maxIterations: Number(event.target.value),
                })
              }
            >
              <option value={1}>1 round</option>
              <option value={2}>2 rounds</option>
              <option value={3}>3 rounds</option>
            </select>
          </label>
        )}
      </div>
      {verified && (
        <div className="criteria-editor">
          <label htmlFor="goal-criteria">
            <span>What does success look like?</span>
            <small>One per line · Reviewed in a separate session</small>
          </label>
          <textarea
            id="goal-criteria"
            value={value.criteria}
            onChange={(event) =>
              onChange({ ...value, criteria: event.target.value })
            }
            rows={3}
            maxLength={6500}
            placeholder={
              "For example: Stay signed in after refreshing the page\nProtected pages cannot be accessed after signing out\nRegression tests cover both behaviors"
            }
          />
          <p>
            <Icon name="refresh" size={13} />
            Failed tests or reviews lead to another revision. If the round limit
            is reached, the goal returns to you for attention.
          </p>
        </div>
      )}
      <details
        className="goal-context-editor"
        open={value.context.length > 10000 ? true : undefined}
      >
        <summary>
          <Icon name="file" size={14} />
          Context and decisions{" "}
          <span>{value.context.trim() ? "Added" : "Optional"}</span>
        </summary>
        <label htmlFor="goal-context" className="sr-only">
          Context and decisions
        </label>
        <textarea
          id="goal-context"
          value={value.context}
          onChange={(event) =>
            onChange({ ...value, context: event.target.value })
          }
          rows={3}
          maxLength={10000}
          placeholder="Why this matters, decisions already made, behavior to preserve, and relevant discussions or documents…"
        />
        <p>
          This context is shared with both the implementer and reviewer. Adding
          a link does not grant the Agent access to it.
        </p>
      </details>
      {!verified && (
        <p className="direct-mode-note">
          Run the Agent once, then use the configured test and Git publishing
          workflow. No independent acceptance review is added.
        </p>
      )}
    </div>
  );
}

export const workflowPhases: Record<GoalWorkflow["phase"], string> = {
  implementing: "Implementing",
  testing: "Testing",
  reviewing: "Independent review",
  revising: "Revising",
  publishing: "Publishing",
  completed: "Acceptance complete",
  blocked: "Needs attention",
};
export function taskWorkflowLabel(task: Task): string {
  if (task.status === "canceled") return "Canceled";
  if (task.status === "needs_attention") return "Needs attention";
  if (task.status === "queued") return "Waiting in queue";
  if (task.status === "waiting_for_agent") return "Waiting for Runner";
  if (task.status === "waiting_for_owner") return "Waiting for owner approval";
  return task.workflow
    ? workflowPhases[task.workflow.phase]
    : "Goal acceptance";
}
const testStates = {
  not_run: "Not run",
  passed: "Tests passed",
  failed: "Tests failed",
  not_configured: "Test command not configured",
};
const checkStates = { pass: "Passed", fail: "Failed", unknown: "Unverified" };
const steps = [
  { id: "implementing", label: "Implement" },
  { id: "testing", label: "Test" },
  { id: "reviewing", label: "Review" },
  { id: "publishing", label: "Deliver" },
];

export function WorkflowEvidence({
  task,
  simulated,
}: {
  task: Task;
  simulated: boolean;
}) {
  const brief = task.brief;
  if (brief?.mode !== "verified") return null;
  const workflow = task.workflow;
  const latest = workflow?.reviews.at(-1);
  const pending = ["queued", "waiting_for_agent", "canceled"].includes(
    task.status,
  );
  const phase = pending ? undefined : workflow?.phase;
  const priorReview = latest && latest.iteration !== workflow?.iteration;
  const activeIndex =
    phase === "completed"
      ? 4
      : phase === "revising"
        ? 0
        : steps.findIndex((step) => step.id === phase);
  const passed =
    latest?.checks.filter((check) => check.status === "pass").length ?? 0;
  return (
    <section
      className={`workflow-evidence ${phase === "blocked" ? "is-blocked" : ""}`}
      aria-label="Goal acceptance"
    >
      <div className="workflow-evidence-heading">
        <div>
          <span className="section-label">GOAL → EVIDENCE → DELIVERY</span>
          <h3>
            <Icon name="shield" size={17} />
            Goal acceptance
          </h3>
        </div>
        <span className="workflow-round">
          {workflow && !pending
            ? `Round ${workflow.iteration} of ${brief.maxIterations}`
            : `Up to ${brief.maxIterations} ${brief.maxIterations === 1 ? "round" : "rounds"}`}
        </span>
      </div>
      <ol className="workflow-steps" aria-label="Workflow stages">
        {steps.map((step, index) => (
          <li
            key={step.id}
            className={
              index === activeIndex
                ? "current"
                : index < activeIndex
                  ? "done"
                  : ""
            }
            aria-current={index === activeIndex ? "step" : undefined}
          >
            <span>
              {index < activeIndex ? (
                <Icon name="check" size={12} />
              ) : (
                index + 1
              )}
            </span>
            {step.label}
          </li>
        ))}
      </ol>
      <div className="workflow-status-line">
        <strong>{taskWorkflowLabel(task)}</strong>
        <span>
          {simulated ? "Simulated · " : ""}
          {testStates[workflow?.testStatus ?? "not_run"]}
        </span>
      </div>
      {phase === "revising" && (
        <p className="workflow-guidance">
          The review found unmet requirements. The Agent will revise the work,
          then run tests and review again.
        </p>
      )}
      {phase === "blocked" && (
        <p className="workflow-guidance">
          This run did not deliver the goal. Check failed or unverified
          criteria, resolve the blockers, then retry.
        </p>
      )}
      <div className="acceptance-title">
        <strong>Acceptance criteria</strong>
        <span>
          {priorReview
            ? "Previous round · "
            : simulated
              ? "Simulated verdict · "
              : ""}
          {passed} / {brief.acceptanceCriteria.length}{" "}
          {brief.acceptanceCriteria.length === 1 ? "criterion" : "criteria"}{" "}
          confirmed
        </span>
      </div>
      <ul className="acceptance-list">
        {brief.acceptanceCriteria.map((criterion) => {
          const check = latest?.checks.find(
            (item) => item.criterion === criterion,
          );
          const state = check?.status ?? "unknown";
          return (
            <li key={criterion} className={`criterion-${state}`}>
              <span className="criterion-icon">
                <Icon
                  name={
                    state === "pass"
                      ? "check"
                      : state === "fail"
                        ? "alert"
                        : "clock"
                  }
                  size={14}
                />
              </span>
              <div>
                <strong>{criterion}</strong>
                <small>
                  {priorReview && check
                    ? `Previous round: ${checkStates[state]}`
                    : check
                      ? checkStates[state]
                      : "Awaiting review"}
                </small>
                {check?.evidence && <p>{check.evidence}</p>}
              </div>
            </li>
          );
        })}
      </ul>
      {latest && (
        <div className="review-conclusion">
          <strong>Independent review</strong>
          <p>{latest.summary}</p>
          {latest.issues.length > 0 && (
            <ul>
              {[...new Set(latest.issues)].map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          )}
          {latest.reviewedTreeSha && (
            <small>
              {simulated ? "Simulated version marker" : "Reviewed Git tree"}{" "}
              <code>{latest.reviewedTreeSha}</code>
            </small>
          )}
        </div>
      )}
      {workflow && workflow.reviews.length > 1 && (
        <details className="review-history">
          <summary>
            Earlier {workflow.reviews.length === 2 ? "review" : "reviews"} (
            {workflow.reviews.length - 1})
          </summary>
          {workflow.reviews.slice(0, -1).map((review) => (
            <div key={review.iteration}>
              <strong>
                Round {review.iteration} ·{" "}
                {review.verdict === "pass"
                  ? "Passed"
                  : review.verdict === "revise"
                    ? "Needs revision"
                    : "Blocked"}
              </strong>
              <p>{review.summary}</p>
              <ul>
                {[...new Set(review.issues)].map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </div>
          ))}
        </details>
      )}
      <p className="workflow-method">
        {simulated
          ? "This fixed simulation demonstrates review and revision. No model is called and no tests are run."
          : "Implementation and review use separate Codex sessions on the same Runner. The reviewer is read-only; the Runner executes the actual tests."}
      </p>
    </section>
  );
}

export function followupDraft(
  task: Task,
  feedback: string,
): { prompt: string; goal: GoalDraft } {
  const excerpt = (text: string, limit: number) =>
    text.length > limit
      ? `${text.slice(0, limit)}\n[Historical content has been shortened. See the source task for the full record.]`
      : text;
  const context = [
    `Follow-up to task ${task.id}: ${excerpt(task.prompt, 1800)}`,
    task.brief?.context
      ? `Previous context and decisions: ${task.brief.context}`
      : "",
    task.result ? `Previous result: ${excerpt(task.result, 2500)}` : "",
    task.commitSha ? `Previous commit: ${task.commitSha}` : "",
    task.error ? `Issue to resolve: ${excerpt(task.error, 1000)}` : "",
    "The previous task is reference material only. Verify this goal again; do not inherit its acceptance verdict.",
  ]
    .filter(Boolean)
    .join("\n\n");
  return {
    prompt: `Follow-up: ${excerpt(task.prompt.split("\n")[0] ?? "", 160)}\n\n${feedback}`,
    goal: {
      mode: "verified",
      context,
      criteria: task.brief?.acceptanceCriteria.join("\n") ?? "",
      maxIterations: task.brief?.maxIterations ?? 2,
    },
  };
}
