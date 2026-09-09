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
      setError(cause instanceof Error ? cause.message : "操作失败，请重试");
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
      setNotice("补充说明已保存到项目上下文。");
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
    setNotice("已向浏览器发起下载。如果没有收到文件，也可以复制下方完整记录。");
  }
  const explanation =
    task.status === "waiting_for_agent"
      ? `${task.selectedAgentName} 当前无法接单。任务尚未开始，可等待它上线，或改派给其他 Agent。`
      : task.status === "waiting_for_owner"
        ? `请 ${task.selectedAgentOwnerName} 在本机 Codex 处理审批。当前任务仍占用项目执行位，后续任务会继续排队。`
        : task.status === "queued"
          ? "任务已进入项目队列。前面的任务完成且所选 Agent 可用时，会自动开始。"
          : task.status === "running"
            ? "Agent 正在处理需求。项目按顺序执行代码任务，进度会自动更新。"
            : task.status === "needs_attention"
              ? assigned?.status === "paused"
                ? "本次执行未能完成，原 Agent 已暂停。重新排队后可改派给其他 Agent，或等待所有者恢复共享。"
                : "本次执行未能完成。先查看错误和测试输出，补充说明后可重新排队。"
              : task.status === "canceled"
                ? "任务在开始执行前已取消。记录保留，便于团队追溯。"
                : "执行结果已返回。请查看代码差异和测试原始输出，再决定是否接受这次变更。";
  return (
    <Modal title="目标与交付" onClose={onClose} wide>
      <div className="detail-intro">
        <div className="detail-status">
          <TaskBadge status={task.status} />
          <span className="mono muted">{task.id.slice(0, 12)}</span>
          {simulated && <span className="demo-tag">模拟证据</span>}
        </div>
        <h2>{task.prompt.split("\n")[0]}</h2>
        <div className="detail-facts">
          <span>
            <Avatar name={task.requesterName} small />
            {task.requesterName} 发起
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
      <nav className="detail-tabs" aria-label="任务详情视图">
        {(
          [
            { id: "overview", label: "交付概览", icon: "grid" },
            { id: "diff", label: "代码变更", icon: "code" },
            { id: "tests", label: "测试输出", icon: "terminal" },
            { id: "activity", label: "协作记录", icon: "activity" },
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
            <h3>把这次协作，完整带走。</h3>
            <p className="muted">
              导出当前任务的要求、执行者、结果、Diff、测试和协作记录。模拟证据会保留明确标记。
            </p>
            <textarea
              readOnly
              aria-label="Markdown 导出内容"
              value={evidenceReport(task, simulated)}
              rows={12}
            />
            <div className="modal-actions">
              <CopyButton
                value={evidenceReport(task, simulated)}
                label="复制 Markdown"
              />
              <button
                type="button"
                className="button button-primary"
                onClick={downloadReport}
              >
                <Icon name="download" size={15} />
                下载 Markdown
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
                    ? "交付已就绪，等你审阅"
                    : "接下来会发生什么"}
                </strong>
                <p>{explanation}</p>
              </div>
            </div>
            {task.error && (
              <section className="detail-section">
                <h3>
                  <Icon name="alert" size={16} />
                  执行错误
                </h3>
                <pre className="error-output">{task.error}</pre>
              </section>
            )}
            {task.result ? (
              <section className="detail-section result-section">
                <div className="section-label">DELIVERY NOTE</div>
                <h3>执行结果</h3>
                <div className="prose">{task.result}</div>
              </section>
            ) : (
              <section className="detail-section">
                <h3>当前进度</h3>
                <p className="prose muted">
                  {task.progress ||
                    "任务等待开始。这里会显示 Agent 返回的进度。"}
                </p>
              </section>
            )}
            <div className="evidence-cards">
              <button type="button" onClick={() => setTab("diff")}>
                <Icon name="code" />
                <span>
                  代码变更
                  <strong>
                    {files.length ? `${files.length} 个文件` : "尚无差异"}
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
                  测试记录
                  <strong>
                    {task.brief?.mode === "verified"
                      ? task.workflow?.testStatus === "passed"
                        ? `${simulated ? "模拟 · " : ""}测试通过`
                        : task.workflow?.testStatus === "failed"
                          ? "测试失败"
                          : task.workflow?.testStatus === "not_configured"
                            ? "未配置测试命令"
                            : "尚未运行"
                      : task.testOutput.trim()
                        ? "有输出 · 查看详情"
                        : "未提供测试输出"}
                  </strong>
                </span>
                <Icon name="chevron" size={15} />
              </button>
            </div>
            {task.commitSha && (
              <div className="commit-box">
                <span>
                  <Icon name="branch" size={16} />
                  {simulated ? "模拟提交" : "Git 提交"}
                </span>
                <code>{task.commitSha}</code>
                <CopyButton value={task.commitSha} />
              </div>
            )}
            <details className="original-request">
              <summary>查看完整任务要求</summary>
              <p className="prose">{task.prompt}</p>
              {task.brief?.context && (
                <>
                  <h4>项目背景与已有决定</h4>
                  <p className="prose">{task.brief.context}</p>
                </>
              )}
            </details>
            {canManage && waiting && (
              <section className="reassign-box">
                <label htmlFor="reassign-agent">重新指派</label>
                <p>换一位队友接手，保留原任务和讨论。</p>
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
                    更新指派
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
                  变更文件 <span>{files.length}</span>
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
                    <CopyButton value={task.diff} label="复制完整 Diff" />
                  </header>
                  <section
                    className="diff-scroll"
                    // biome-ignore lint/a11y/noNoninteractiveTabindex: The scrollable patch needs keyboard focus for horizontal and vertical scrolling.
                    tabIndex={0}
                    aria-label="代码差异，包含原始行号和变更行号"
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
                  ? "本次没有代码差异"
                  : "还没有可查看的变更"
              }
            >
              <p>Agent 返回的原始 Diff 会显示在这里。</p>
            </EmptyState>
          ))}
        {tab === "tests" && (
          <>
            <div className="test-notice">
              <Icon name="terminal" />
              <div>
                <strong>{simulated ? "模拟测试记录" : "测试原始输出"}</strong>
                <p>
                  {simulated
                    ? "以下内容为演示数据，未实际运行测试。"
                    : "保留 Agent 返回的输出。任务完成状态不等于测试全部通过。"}
                </p>
              </div>
              {task.testOutput && <CopyButton value={task.testOutput} />}
            </div>
            {task.testOutput.trim() ? (
              <section
                className="terminal-output"
                // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users need focus to scroll long raw test output in either direction.
                tabIndex={0}
                aria-label="测试原始输出"
              >
                <pre style={{ margin: 0 }}>{task.testOutput}</pre>
              </section>
            ) : (
              <EmptyState icon="terminal" title="未提供测试输出">
                <p>当前没有测试证据，无法据此判断测试是否通过。</p>
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
                            ? "系统"
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
                <EmptyState icon="activity" title="这里是团队的共同上下文">
                  <p>需求、补充说明和 Agent 的回复都会保留在这里。</p>
                </EmptyState>
              )}
            </div>
            <form onSubmit={sendReply} className="reply-form">
              <label htmlFor="task-reply">反馈与补充说明</label>
              <textarea
                id="task-reply"
                value={reply}
                onChange={(event) => setReply(event.target.value)}
                placeholder="补充验收标准、约束或排查线索…"
                maxLength={20000}
                rows={3}
              />
              <div>
                <p>
                  保存到共享上下文。本轮目标与验收标准在分配时冻结；
                  新反馈可用于下一轮目标。
                </p>
                <button
                  className="button button-primary"
                  type="submit"
                  disabled={busy || !reply.trim()}
                >
                  {busy ? "保存中…" : "保存说明"}
                  <Icon name="arrow" size={16} />
                </button>
              </div>
            </form>
            {["completed", "needs_attention", "canceled"].includes(
              task.status,
            ) && (
              <div className="feedback-next-goal">
                <div>
                  <strong>把反馈带到下一次改进</strong>
                  <p>以上次交付和本次反馈生成可编辑的目标草稿，重新验收。</p>
                </div>
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={busy || !reply.trim()}
                  onClick={() => {
                    if (!onFollowup(task, reply.trim()))
                      setError(
                        "工作台中已有较长草稿。请先整理草稿，避免合并时丢失内容。",
                      );
                  }}
                >
                  <Icon name="plus" size={15} />
                  生成后续目标
                </button>
              </div>
            )}
          </div>
        )}
        {releaseOpen && (
          <div className="release-confirm">
            <strong>确认 Runner 已在所有者电脑上停止</strong>
            <p>
              释放执行位会暂停该
              Agent，并将任务标记为待处理。仍在运行的本地进程需要由所有者停止。
            </p>
            <label>
              <input
                type="checkbox"
                checked={stopped}
                onChange={(event) => setStopped(event.target.checked)}
              />
              我已确认所有者停止了本地 Runner
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
              确认释放执行位
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
              取消任务
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
              {busy ? "排队中…" : "重新排队"}
            </button>
          )}
          {canRelease && (
            <button
              type="button"
              className="button button-quiet danger-text"
              disabled={busy}
              onClick={() => setReleaseOpen(true)}
            >
              紧急释放
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
            label={tab === "export" ? "复制 Markdown" : "任务链接"}
          />
          <button
            type="button"
            className="button button-secondary"
            onClick={() =>
              tab === "export" ? downloadReport() : setTab("export")
            }
          >
            <Icon name="download" size={15} />
            {tab === "export" ? "下载 Markdown" : "导出记录"}
          </button>
        </div>
      </footer>
    </Modal>
  );
}
