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
    return "项目背景最多 10,000 字，完整草稿已保留，请删减后提交。";
  if (draft.mode === "direct") return "";
  const criteria = criteriaLines(draft.criteria);
  if (draft.mode === "verified" && !criteria.length)
    return "写下一条可核实的验收标准，再交给 Agent。";
  if (criteria.length > 12)
    return "最多保留 12 条验收标准，让每一条都能被认真检查。";
  if (criteria.some((line) => line.length > 500))
    return "每条验收标准最多 500 字，请拆成清晰的小项。";
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
        <fieldset className="goal-mode-control" aria-label="执行方式">
          <button
            type="button"
            aria-pressed={verified}
            onClick={() => onChange({ ...value, mode: "verified" })}
          >
            <Icon name="shield" size={15} />
            实现并验收
          </button>
          <button
            type="button"
            aria-pressed={!verified}
            onClick={() => onChange({ ...value, mode: "direct" })}
          >
            直接执行
          </button>
        </fieldset>
        {verified && (
          <label className="iteration-control">
            最多
            <select
              aria-label="最多实现与验收轮数"
              value={value.maxIterations}
              onChange={(event) =>
                onChange({
                  ...value,
                  maxIterations: Number(event.target.value),
                })
              }
            >
              <option value={1}>1 轮</option>
              <option value={2}>2 轮</option>
              <option value={3}>3 轮</option>
            </select>
          </label>
        )}
      </div>
      {verified && (
        <div className="criteria-editor">
          <label htmlFor="goal-criteria">
            <span>怎样才算完成？</span>
            <small>每行一条 · 独立会话逐项检查</small>
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
              "例如：刷新页面后仍保留登录状态\n退出登录后不能访问受保护页面\n回归测试覆盖以上两种情况"
            }
          />
          <p>
            <Icon name="refresh" size={13} />
            测试或审查未通过时，带着证据继续修订；达到轮数上限后交回你处理。
          </p>
        </div>
      )}
      <details
        className="goal-context-editor"
        open={value.context.length > 10000 ? true : undefined}
      >
        <summary>
          <Icon name="file" size={14} />
          项目背景与已有决定{" "}
          <span>{value.context.trim() ? "已补充" : "可选"}</span>
        </summary>
        <label htmlFor="goal-context" className="sr-only">
          项目背景与已有决定
        </label>
        <textarea
          id="goal-context"
          value={value.context}
          onChange={(event) =>
            onChange({ ...value, context: event.target.value })
          }
          rows={3}
          maxLength={10000}
          placeholder="为什么做这件事、已确定的方案、需要保留的行为，以及相关讨论或文档链接…"
        />
        <p>
          这些内容会与目标一起交给执行者和审查者。链接本身不代表 Agent
          已获得访问权限。
        </p>
      </details>
      {!verified && (
        <p className="direct-mode-note">
          运行一次 Agent，使用项目配置的测试与发布流程；不增加独立验收会话。
        </p>
      )}
    </div>
  );
}

export const workflowPhases: Record<GoalWorkflow["phase"], string> = {
  implementing: "正在实现",
  testing: "运行测试",
  reviewing: "独立审查",
  revising: "根据证据修订",
  publishing: "发布交付",
  completed: "验收完成",
  blocked: "需要你处理",
};
export function taskWorkflowLabel(task: Task): string {
  if (task.status === "canceled") return "已取消";
  if (task.status === "needs_attention") return "需要你处理";
  if (task.status === "queued") return "等待执行位";
  if (task.status === "waiting_for_agent") return "等待 Runner";
  if (task.status === "waiting_for_owner") return "等待所有者确认";
  return task.workflow ? workflowPhases[task.workflow.phase] : "目标验收";
}
const testStates = {
  not_run: "尚未运行",
  passed: "测试通过",
  failed: "测试失败",
  not_configured: "未配置测试命令",
};
const checkStates = { pass: "通过", fail: "未通过", unknown: "尚无法确认" };
const steps = [
  { id: "implementing", label: "实现" },
  { id: "testing", label: "测试" },
  { id: "reviewing", label: "审查" },
  { id: "publishing", label: "交付" },
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
      aria-label="目标验收"
    >
      <div className="workflow-evidence-heading">
        <div>
          <span className="section-label">GOAL → EVIDENCE → DELIVERY</span>
          <h3>
            <Icon name="shield" size={17} />
            目标验收
          </h3>
        </div>
        <span className="workflow-round">
          {workflow && !pending
            ? `第 ${workflow.iteration} / ${brief.maxIterations} 轮`
            : `最多 ${brief.maxIterations} 轮`}
        </span>
      </div>
      <ol className="workflow-steps" aria-label="执行阶段">
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
          {simulated ? "模拟 · " : ""}
          {testStates[workflow?.testStatus ?? "not_run"]}
        </span>
      </div>
      {phase === "revising" && (
        <p className="workflow-guidance">
          审查发现了未满足的要求，Agent 会先修订，再重新运行测试和审查。
        </p>
      )}
      {phase === "blocked" && (
        <p className="workflow-guidance">
          本轮没有完成交付。请查看未通过或无法确认的标准，再补充信息或处理后重试。
        </p>
      )}
      <div className="acceptance-title">
        <strong>完成标准</strong>
        <span>
          {priorReview ? "上一轮参考 · " : simulated ? "模拟结论 · " : ""}
          {passed} / {brief.acceptanceCriteria.length} 项已确认
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
                    ? `上轮${checkStates[state]}`
                    : check
                      ? checkStates[state]
                      : "等待验收"}
                </small>
                {check?.evidence && <p>{check.evidence}</p>}
              </div>
            </li>
          );
        })}
      </ul>
      {latest && (
        <div className="review-conclusion">
          <strong>独立审查结论</strong>
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
              {simulated ? "模拟版本标记" : "被审查的代码树"}{" "}
              <code>{latest.reviewedTreeSha}</code>
            </small>
          )}
        </div>
      )}
      {workflow && workflow.reviews.length > 1 && (
        <details className="review-history">
          <summary>查看前 {workflow.reviews.length - 1} 轮审查记录</summary>
          {workflow.reviews.slice(0, -1).map((review) => (
            <div key={review.iteration}>
              <strong>
                第 {review.iteration} 轮 ·{" "}
                {review.verdict === "pass"
                  ? "通过"
                  : review.verdict === "revise"
                    ? "需要修订"
                    : "阻塞"}
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
          ? "这是固定模拟流程，用于体验验收和修订；没有调用模型或运行测试。"
          : "实现与审查使用同一 Runner 上不同的 Codex 会话。审查会话只读；实际测试由 Runner 执行。"}
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
      ? `${text.slice(0, limit)}\n[历史记录较长，已截取；完整内容请查看来源任务。]`
      : text;
  const context = [
    `延续任务 ${task.id}：${excerpt(task.prompt, 1800)}`,
    task.brief?.context ? `原有背景与决定：${task.brief.context}` : "",
    task.result ? `上次结果：${excerpt(task.result, 2500)}` : "",
    task.commitSha ? `上次提交：${task.commitSha}` : "",
    task.error ? `需要解决：${excerpt(task.error, 1000)}` : "",
    "上次任务记录仅供参考；本次必须重新验证，不继承通过结论。",
  ]
    .filter(Boolean)
    .join("\n\n");
  return {
    prompt: `继续改进：${excerpt(task.prompt.split("\n")[0] ?? "", 160)}\n\n${feedback}`,
    goal: {
      mode: "verified",
      context,
      criteria: task.brief?.acceptanceCriteria.join("\n") ?? "",
      maxIterations: task.brief?.maxIterations ?? 2,
    },
  };
}
