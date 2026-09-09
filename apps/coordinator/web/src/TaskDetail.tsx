import type { DashboardSnapshot, Task } from "@team-agent/shared";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { api, json } from "./api.js";
import { WorkflowEvidence } from "./GoalWorkflow.js";
import { evidenceReport, parseDiff } from "./task-model.js";
import {
  Avatar,
  agentStates,
  CopyButton,
  EmptyState,
  Icon,
  Modal,
  TaskBadge,
  timeLabel,
} from "./ui.js";

type DetailTab = "overview" | "diff" | "tests" | "activity" | "export";
export function TaskDetail({
  task,
  snapshot,
  simulated,
  onClose,
  onRefresh,
  onFollowup,
}: {
  task: Task;
  snapshot: DashboardSnapshot;
  simulated: boolean;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onFollowup: (task: Task, feedback: string) => boolean;
}) {
  const [tab, setTab] = useState<DetailTab>("overview");
  const [fileIndex, setFileIndex] = useState(0);
  const replyDraftKey = useRef(
    `team-agent:reply:${snapshot.me.id}:${snapshot.settings.repositoryUrl}:${task.id}`,
  ).current;
  const [reply, setReply] = useState(() => {
    try {
      return sessionStorage.getItem(replyDraftKey) ?? "";
    } catch {
      return "";
    }
  });
  const [agentId, setAgentId] = useState(task.selectedAgentId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [stopped, setStopped] = useState(false);
  const files = useMemo(() => parseDiff(task.diff), [task.diff]);
  const file = files[fileIndex] ?? files[0];
  const additions = files.reduce((sum, item) => sum + item.additions, 0);
  const deletions = files.reduce((sum, item) => sum + item.deletions, 0);
  const canManage =
    snapshot.me.isAdmin || task.requesterMemberId === snapshot.me.id;
  const assigned = snapshot.agents.find(
    (agent) => agent.id === task.selectedAgentId,
  );
  const canRetry = canManage || assigned?.ownerMemberId === snapshot.me.id;
  const waiting =
    task.status === "queued" || task.status === "waiting_for_agent";
  const canRelease =
    !simulated &&
    snapshot.me.isAdmin &&
    assigned?.status === "offline" &&
    ["running", "waiting_for_owner"].includes(task.status);
  useEffect(() => {
    try {
      if (reply) sessionStorage.setItem(replyDraftKey, reply);
      else sessionStorage.removeItem(replyDraftKey);
    } catch {
      // Storage may be unavailable; keep the draft in memory while open.
    }
  }, [replyDraftKey, reply]);
  async function action(path: string, body?: unknown) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(`/api/tasks/${task.id}/${path}`, json("POST", body));
      await onRefresh();
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Action failed. Please try again.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function sendReply(event: FormEvent) {
    event.preventDefault();
    if (busy || !reply.trim()) return;
    const submittedReply = reply;
    if (await action("messages", { content: submittedReply.trim() })) {
      setReply((current) => (current === submittedReply ? "" : current));
      try {
        // Also clear a saved submission after the user has closed this dialog.
        // A newer draft for the same task must survive the pending request.
        if (sessionStorage.getItem(replyDraftKey) === submittedReply)
          sessionStorage.removeItem(replyDraftKey);
      } catch {
        // Saving the server message succeeded even when local storage is blocked.
      }
      setNotice("Your note was saved to the project context.");
    }
  }
  function downloadReport() {
    const url = URL.createObjectURL(
      new Blob([evidenceReport(task, simulated)], {
        type: "text/markdown;charset=utf-8",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `team-agent-${task.id.replace(/[^a-z0-9-]/gi, "_")}.md`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    setNotice(
      "Download requested. If the file does not appear, copy the full record below.",
    );
  }
  const explanation =
    task.status === "waiting_for_agent"
      ? `${task.selectedAgentName} is unavailable. This task has not started; wait for the Agent to reconnect or reassign it.`
      : task.status === "waiting_for_owner"
        ? `${task.selectedAgentOwnerName} needs to handle approval in their local Codex. This task still holds the project execution slot; later tasks remain queued.`
        : task.status === "queued"
          ? "This task is queued. It will start when earlier work finishes and the selected Agent is available."
          : task.status === "running"
            ? "The Agent is working. Coding tasks run one at a time per project; progress updates automatically."
            : task.status === "needs_attention"
              ? assigned?.status === "paused"
                ? "This run did not complete and the Agent is paused. Requeue the task to reassign it, or wait for the owner to resume sharing."
                : "This run did not complete. Review the error and test output, add any useful context, then requeue it."
              : task.status === "canceled"
                ? "This task was canceled before execution. Its record remains available to the team."
                : "The result is ready. Review the changes and raw test output before deciding whether to accept the work.";
  return (
    <Modal title="Goal and delivery" onClose={onClose} wide>
      <div className="detail-intro">
        <div className="detail-status">
          <TaskBadge status={task.status} />
          <span className="mono muted">{task.id.slice(0, 12)}</span>
          {simulated && <span className="demo-tag">Simulated evidence</span>}
        </div>
        <h2>{task.prompt.split("\n")[0]}</h2>
        <div className="detail-facts">
          <span>
            <Avatar name={task.requesterName} small />
            Requested by {task.requesterName}
          </span>
          <span>
            <Icon name="agents" size={15} />
            {task.selectedAgentName}
          </span>
          <span>
            <Icon name="clock" size={15} />
            {timeLabel(task.updatedAt, true)}
          </span>
        </div>
      </div>
      <nav className="detail-tabs" aria-label="Task detail views">
        {(
          [
            { id: "overview", label: "Overview", icon: "grid" },
            { id: "diff", label: "Code changes", icon: "code" },
            { id: "tests", label: "Test output", icon: "terminal" },
            { id: "activity", label: "Activity", icon: "activity" },
          ] as const
        ).map((item) => (
          <button
            type="button"
            key={item.id}
            className={tab === item.id ? "active" : ""}
            aria-pressed={tab === item.id}
            onClick={() => setTab(item.id)}
          >
            <Icon name={item.icon} size={16} />
            {item.label}
            {item.id === "diff" && files.length > 0 && (
              <span className="count">{files.length}</span>
            )}
          </button>
        ))}
      </nav>
      <div className="detail-body">
        {tab === "export" && (
          <section className="export-panel">
            <div className="section-label">TAKE YOUR WORK WITH YOU</div>
            <h3>Take the full record with you.</h3>
            <p className="muted">
              Export the requirements, assigned Agent, results, changes, tests,
              and activity. Simulated evidence stays clearly labeled.
            </p>
            <textarea
              readOnly
              aria-label="Markdown export"
              value={evidenceReport(task, simulated)}
              rows={12}
            />
            <div className="modal-actions">
              <CopyButton
                value={evidenceReport(task, simulated)}
                label="Copy Markdown"
              />
              <button
                type="button"
                className="button button-primary"
                onClick={downloadReport}
              >
                <Icon name="download" size={15} />
                Download Markdown
              </button>
            </div>
          </section>
        )}
        {error && (
          <div role="alert" className="alert alert-error">
            {error}
          </div>
        )}
        {notice && (
          <div role="status" className="alert alert-success">
            {notice}
          </div>
        )}
        {tab === "overview" && (
          <div className="overview-detail">
            <WorkflowEvidence task={task} simulated={simulated} />
            <div
              className={`state-explanation ${["needs_attention", "waiting_for_owner", "waiting_for_agent"].includes(task.status) ? "needs-action" : ""}`}
            >
              <Icon name={task.status === "completed" ? "check" : "activity"} />
              <div>
                <strong>
                  {task.status === "completed"
                    ? "Ready for your review"
                    : "What happens next"}
                </strong>
                <p>{explanation}</p>
              </div>
            </div>
            {task.error && (
              <section className="detail-section">
                <h3>
                  <Icon name="alert" size={16} />
                  Execution error
                </h3>
                <pre className="error-output">{task.error}</pre>
              </section>
            )}
            {task.result ? (
              <section className="detail-section result-section">
                <div className="section-label">DELIVERY NOTE</div>
                <h3>Result</h3>
                <div className="prose">{task.result}</div>
              </section>
            ) : (
              <section className="detail-section">
                <h3>Current progress</h3>
                <p className="prose muted">
                  {task.progress ||
                    "Waiting to start. Progress from the Agent will appear here."}
                </p>
              </section>
            )}
            <div className="evidence-cards">
              <button type="button" onClick={() => setTab("diff")}>
                <Icon name="code" />
                <span>
                  Code changes
                  <strong>
                    {files.length
                      ? `${files.length} ${files.length === 1 ? "file" : "files"}`
                      : "No changes yet"}
                  </strong>
                </span>
                {files.length > 0 && (
                  <span className="diff-stat">
                    <b>+{additions}</b>
                    <i>−{deletions}</i>
                  </span>
                )}
                <Icon name="chevron" size={15} />
              </button>
              <button type="button" onClick={() => setTab("tests")}>
                <Icon name="terminal" />
                <span>
                  Test evidence
                  <strong>
                    {task.brief?.mode === "verified"
                      ? task.workflow?.testStatus === "passed"
                        ? `${simulated ? "Simulated · " : ""}Tests passed`
                        : task.workflow?.testStatus === "failed"
                          ? "Tests failed"
                          : task.workflow?.testStatus === "not_configured"
                            ? "Test command not configured"
                            : "Not run"
                      : task.testOutput.trim()
                        ? "Output available · View details"
                        : "No test output"}
                  </strong>
                </span>
                <Icon name="chevron" size={15} />
              </button>
            </div>
            {task.commitSha && (
              <div className="commit-box">
                <span>
                  <Icon name="branch" size={16} />
                  {simulated ? "Simulated commit" : "Git commit"}
                </span>
                <code>{task.commitSha}</code>
                <CopyButton value={task.commitSha} />
              </div>
            )}
            <details className="original-request">
              <summary>View the full request</summary>
              <p className="prose">{task.prompt}</p>
              {task.brief?.context && (
                <>
                  <h4>Context and decisions</h4>
                  <p className="prose">{task.brief.context}</p>
                </>
              )}
            </details>
            {canManage && waiting && (
              <section className="reassign-box">
                <label htmlFor="reassign-agent">Reassign</label>
                <p>
                  Assign another Agent while preserving the task and discussion.
                </p>
                <div className="inline-form">
                  <select
                    id="reassign-agent"
                    value={agentId}
                    onChange={(event) => setAgentId(event.target.value)}
                  >
                    {snapshot.agents
                      .filter((agent) => agent.status !== "paused")
                      .map((agent) => (
                        <option key={agent.id} value={agent.id}>
                          {agent.displayName} ·{" "}
                          {agentStates[agent.status].label}
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    className="button button-secondary"
                    disabled={
                      busy ||
                      agentId === task.selectedAgentId ||
                      !snapshot.agents.some(
                        (agent) =>
                          agent.id === agentId && agent.status !== "paused",
                      )
                    }
                    onClick={() => action("reassign", { agentId })}
                  >
                    Update assignment
                  </button>
                </div>
              </section>
            )}
          </div>
        )}
        {tab === "diff" &&
          (files.length ? (
            <div className="diff-review">
              <div className="diff-file-list">
                <div className="file-list-heading">
                  Changed files <span>{files.length}</span>
                </div>
                {files.map((item, index) => (
                  <button
                    type="button"
                    key={item.path}
                    className={item === file ? "selected" : ""}
                    aria-pressed={item === file}
                    onClick={() => setFileIndex(index)}
                  >
                    <Icon name="file" size={15} />
                    <span>{item.path}</span>
                    <span className="diff-stat">
                      <b>+{item.additions}</b>
                      <i>−{item.deletions}</i>
                    </span>
                  </button>
                ))}
              </div>
              {file && (
                <div className="diff-content">
                  <header>
                    <code>{file.path}</code>
                    <CopyButton value={task.diff} label="Copy full diff" />
                  </header>
                  <section
                    className="diff-scroll"
                    // biome-ignore lint/a11y/noNoninteractiveTabindex: The scrollable patch needs keyboard focus for horizontal and vertical scrolling.
                    tabIndex={0}
                    aria-label="Code diff with original and updated line numbers"
                  >
                    <table className="diff-table">
                      <tbody>
                        {file.lines.map((line, index) => (
                          <tr
                            // biome-ignore lint/suspicious/noArrayIndexKey: An immutable patch has a fixed line order, including repeated metadata lines.
                            key={index}
                            className={`diff-line diff-${line.kind}`}
                          >
                            <td className="line-number">{line.oldLine}</td>
                            <td className="line-number">{line.newLine}</td>
                            <td className="line-code">
                              <pre>{line.content || " "}</pre>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                </div>
              )}
            </div>
          ) : (
            <EmptyState
              icon="code"
              title={
                task.status === "completed"
                  ? "No code changes in this run"
                  : "No changes to review yet"
              }
            >
              <p>The Agent’s original diff will appear here.</p>
            </EmptyState>
          ))}
        {tab === "tests" && (
          <>
            <div className="test-notice">
              <Icon name="terminal" />
              <div>
                <strong>
                  {simulated ? "Simulated test evidence" : "Raw test output"}
                </strong>
                <p>
                  {simulated
                    ? "This is simulated output. No tests were executed."
                    : "This is the output returned by the Agent. A completed task does not by itself prove every test passed."}
                </p>
              </div>
              {task.testOutput && <CopyButton value={task.testOutput} />}
            </div>
            {task.testOutput.trim() ? (
              <section
                className="terminal-output"
                // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users need focus to scroll long raw test output in either direction.
                tabIndex={0}
                aria-label="Raw test output"
              >
                <pre style={{ margin: 0 }}>{task.testOutput}</pre>
              </section>
            ) : (
              <EmptyState icon="terminal" title="No test output">
                <p>
                  No test evidence is available. Test success cannot be
                  inferred.
                </p>
              </EmptyState>
            )}
          </>
        )}
        {tab === "activity" && (
          <div className="activity-detail">
            <div className="conversation">
              {task.messages.length ? (
                task.messages.map((message) => (
                  <article
                    className={`conversation-item message-${message.role}`}
                    key={message.id}
                  >
                    <Avatar
                      name={
                        message.role === "system" ? "S" : message.memberName
                      }
                      index={message.role === "agent" ? 1 : 0}
                      small
                    />
                    <div>
                      <header>
                        <strong>
                          {message.role === "system"
                            ? "System"
                            : message.memberName}
                        </strong>
                        <span>{message.role === "agent" ? "Agent" : ""}</span>
                        <time>{timeLabel(message.createdAt, true)}</time>
                      </header>
                      <p>{message.content}</p>
                    </div>
                  </article>
                ))
              ) : (
                <EmptyState icon="activity" title="Your team’s shared context">
                  <p>Requests, notes, and Agent responses are kept here.</p>
                </EmptyState>
              )}
            </div>
            <form onSubmit={sendReply} className="reply-form">
              <label htmlFor="task-reply">Feedback and notes</label>
              <textarea
                id="task-reply"
                value={reply}
                onChange={(event) => setReply(event.target.value)}
                placeholder="Add feedback, constraints, or debugging context…"
                maxLength={20000}
                rows={3}
              />
              <div>
                <p>
                  Notes are saved to shared context. The current goal and
                  criteria were frozen when assigned; use new feedback in a
                  follow-up goal.
                </p>
                <button
                  className="button button-primary"
                  type="submit"
                  disabled={busy || !reply.trim()}
                >
                  {busy ? "Saving…" : "Save note"}
                  <Icon name="arrow" size={16} />
                </button>
              </div>
            </form>
            {["completed", "needs_attention", "canceled"].includes(
              task.status,
            ) && (
              <div className="feedback-next-goal">
                <div>
                  <strong>Turn feedback into the next improvement</strong>
                  <p>
                    Create an editable draft from this result and your feedback,
                    with fresh acceptance checks.
                  </p>
                </div>
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={busy || !reply.trim()}
                  onClick={() => {
                    if (!onFollowup(task, reply.trim()))
                      setError(
                        "The workspace draft is too long to merge. Shorten it first to preserve your content.",
                      );
                  }}
                >
                  <Icon name="plus" size={15} />
                  Create follow-up goal
                </button>
              </div>
            )}
          </div>
        )}
        {releaseOpen && (
          <div className="release-confirm">
            <strong>
              Confirm the Runner has stopped on the owner’s computer
            </strong>
            <p>
              Releasing the execution slot pauses the Agent and marks the task
              as needing attention. The owner must stop any local process that
              is still running.
            </p>
            <label>
              <input
                type="checkbox"
                checked={stopped}
                onChange={(event) => setStopped(event.target.checked)}
              />
              I have confirmed the owner stopped the local Runner
            </label>
            <button
              className="button button-danger"
              type="button"
              disabled={busy || !stopped}
              onClick={async () => {
                if (await action("force-release", { confirm: "FORCE_RELEASE" }))
                  setReleaseOpen(false);
              }}
            >
              Confirm release
            </button>
          </div>
        )}
      </div>
      <footer className="detail-footer">
        <div>
          {canManage && waiting && (
            <button
              type="button"
              className="button button-quiet"
              disabled={busy}
              onClick={() => action("cancel")}
            >
              Cancel task
            </button>
          )}
          {canRetry && task.status === "needs_attention" && (
            <button
              type="button"
              className="button button-primary"
              disabled={busy}
              onClick={() => action("retry")}
            >
              <Icon name="refresh" size={16} />
              {busy ? "Requeuing…" : "Requeue task"}
            </button>
          )}
          {canRelease && (
            <button
              type="button"
              className="button button-quiet danger-text"
              disabled={busy}
              onClick={() => setReleaseOpen(true)}
            >
              Emergency release
            </button>
          )}
        </div>
        <div>
          <CopyButton
            value={
              tab === "export"
                ? evidenceReport(task, simulated)
                : `${location.href.split("#")[0]}#task-${task.id}`
            }
            label={tab === "export" ? "Copy Markdown" : "Task link"}
          />
          <button
            type="button"
            className="button button-secondary"
            onClick={() =>
              tab === "export" ? downloadReport() : setTab("export")
            }
          >
            <Icon name="download" size={15} />
            {tab === "export" ? "Download Markdown" : "Export"}
          </button>
        </div>
      </footer>
    </Modal>
  );
}
