import type {
  Agent,
  AgentStatus,
  DashboardSnapshot,
  InviteResponse,
  PairingResponse,
  ProjectSettings,
  Task,
  TaskStatus,
} from "@team-agent/shared";
import { isTerminalTaskStatus } from "@team-agent/shared";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ApiError, api, getSnapshot, json } from "./api.js";

const taskStatus: Record<TaskStatus, { label: string; tone: string }> = {
  queued: { label: "排队中", tone: "neutral" },
  waiting_for_agent: { label: "等待 Agent", tone: "warn" },
  running: { label: "执行中", tone: "active" },
  waiting_for_owner: { label: "等待所有者", tone: "warn" },
  completed: { label: "已完成", tone: "success" },
  needs_attention: { label: "需要处理", tone: "danger" },
  canceled: { label: "已取消", tone: "neutral" },
};

const agentStatus: Record<AgentStatus, { label: string; tone: string }> = {
  online: { label: "在线", tone: "success" },
  busy: { label: "忙碌", tone: "active" },
  offline: { label: "离线", tone: "neutral" },
  paused: { label: "已暂停", tone: "warn" },
};

function formatTime(value: string | null) {
  if (!value) return "尚未连接";
  const date = new Date(value);
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function initials(name: string) {
  return name.trim().slice(0, 2).toUpperCase();
}

function Badge({ label, tone }: { label: string; tone: string }) {
  return (
    <span className={`badge badge-${tone}`}>
      <i />
      {label}
    </span>
  );
}

function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}

function ClaimView({
  token,
  onClaimed,
}: {
  token: string;
  onClaimed: () => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/invites/claim", json("POST", { token, name }));
      history.replaceState({}, "", location.pathname);
      onClaimed();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "加入项目时出现问题");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand-mark">TA</div>
        <p className="eyebrow">TEAM AGENT · INTERNAL ALPHA</p>
        <h1>{token ? "加入团队项目" : "这是一个内部工作台"}</h1>
        <p className="muted auth-copy">
          {token
            ? "加入后，你可以选择并借用团队成员共享的 Codex，共同推进同一个项目。"
            : "请使用管理员发给你的个人邀请链接进入。"}
        </p>
        {token ? (
          <form onSubmit={submit} className="stack">
            <label className="field">
              <span>你的名字</span>
              <input
                required
                maxLength={80}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="团队成员看到的名字"
              />
            </label>
            {error && <div className="alert alert-error">{error}</div>}
            <button
              type="submit"
              className="button button-primary button-large"
              disabled={busy || !name.trim()}
            >
              {busy && <Spinner />}加入项目
            </button>
          </form>
        ) : (
          <div className="invite-hint">
            邀请链接通常形如 <code>?token=••••••</code>
          </div>
        )}
      </section>
    </main>
  );
}

function AgentCard({
  agent,
  mine,
  onToggle,
  busy,
}: {
  agent: Agent;
  mine: boolean;
  onToggle: (agent: Agent) => void;
  busy: boolean;
}) {
  const status = agentStatus[agent.status];
  return (
    <article
      className={`agent-card ${agent.status === "offline" || agent.status === "paused" ? "agent-muted" : ""}`}
    >
      <div className="agent-avatar">{initials(agent.ownerName)}</div>
      <div className="agent-main">
        <div className="agent-title">
          <strong>{agent.displayName}</strong>
          {mine && <span className="mine-label">我的</span>}
        </div>
        <span className="muted small">由 {agent.ownerName} 共享</span>
        <span className="muted micro">
          最近连接：{formatTime(agent.lastSeenAt)}
        </span>
      </div>
      <div className="agent-actions">
        <Badge {...status} />
        {mine && (
          <button
            type="button"
            className="button button-quiet button-small"
            disabled={busy || agent.status === "busy"}
            onClick={() => onToggle(agent)}
          >
            {agent.status === "paused" ? "恢复共享" : "暂停共享"}
          </button>
        )}
      </div>
    </article>
  );
}

function TaskCard({
  task,
  selected,
  onClick,
}: {
  task: Task;
  selected: boolean;
  onClick: () => void;
}) {
  const status = taskStatus[task.status];
  return (
    <button
      type="button"
      className={`task-card ${selected ? "selected" : ""}`}
      onClick={onClick}
    >
      <div className="task-card-top">
        <Badge {...status} />
        <time>{formatTime(task.updatedAt)}</time>
      </div>
      <strong>{task.prompt}</strong>
      <div className="task-meta">
        <span>{task.requesterName} 发起</span>
        <span>→</span>
        <span>{task.selectedAgentName}</span>
      </div>
      {(task.progress || task.error) && <p>{task.error || task.progress}</p>}
    </button>
  );
}

function CodePanel({
  title,
  value,
  variant,
}: {
  title: string;
  value: string;
  variant?: "diff" | "plain";
}) {
  const [open, setOpen] = useState(variant !== "plain");
  if (!value) return null;
  return (
    <section className="code-panel">
      <button
        type="button"
        className="code-heading"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span>{title}</span>
        <span>{open ? "收起" : "展开"}</span>
      </button>
      {open && <pre className={variant === "diff" ? "diff" : ""}>{value}</pre>}
    </section>
  );
}

function TaskDetail({
  task,
  agents,
  canManage,
  canRetry,
  isAdmin,
  onRefresh,
}: {
  task: Task;
  agents: Agent[];
  canManage: boolean;
  canRetry: boolean;
  isAdmin: boolean;
  onRefresh: () => Promise<void>;
}) {
  const [reply, setReply] = useState("");
  const [agentId, setAgentId] = useState(task.selectedAgentId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const availableAgents = useMemo(
    () => agents.filter((agent) => agent.status !== "paused"),
    [agents],
  );
  useEffect(() => {
    if (availableAgents.some((agent) => agent.id === agentId)) return;
    setAgentId(
      availableAgents.find((agent) => agent.id === task.selectedAgentId)?.id ??
        availableAgents[0]?.id ??
        "",
    );
  }, [agentId, availableAgents, task.selectedAgentId]);
  const waiting =
    task.status === "queued" || task.status === "waiting_for_agent";
  const canForceRelease =
    isAdmin &&
    (task.status === "running" || task.status === "waiting_for_owner") &&
    agents.find((agent) => agent.id === task.selectedAgentId)?.status ===
      "offline";

  async function action(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await onRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }
  async function sendReply(event: FormEvent) {
    event.preventDefault();
    const content = reply.trim();
    if (!content) return;
    await action(() =>
      api(`/api/tasks/${task.id}/messages`, json("POST", { content })),
    );
    setReply("");
  }
  return (
    <section className="detail-panel">
      <header className="detail-header">
        <div>
          <Badge {...taskStatus[task.status]} />
          <h2>{task.prompt}</h2>
        </div>
        <div className="detail-actions">
          {canForceRelease && (
            <button
              type="button"
              className="button button-quiet button-small danger-text"
              disabled={busy}
              onClick={() => {
                if (
                  !window.confirm(
                    "紧急释放会把任务标记为需要处理并暂停该 Agent。请先确认所有者电脑上的 Runner 已停止，再继续。",
                  )
                )
                  return;
                void action(() =>
                  api(
                    `/api/tasks/${task.id}/force-release`,
                    json("POST", { confirm: "FORCE_RELEASE" }),
                  ),
                );
              }}
            >
              紧急释放
            </button>
          )}
          {canRetry && task.status === "needs_attention" && (
            <button
              type="button"
              className="button button-secondary button-small"
              disabled={busy}
              onClick={() =>
                action(() => api(`/api/tasks/${task.id}/retry`, json("POST")))
              }
            >
              重新排队
            </button>
          )}
          {canManage &&
            (task.status === "queued" ||
              task.status === "waiting_for_agent") && (
              <button
                type="button"
                className="button button-quiet button-small danger-text"
                disabled={busy}
                onClick={() =>
                  action(() =>
                    api(`/api/tasks/${task.id}/cancel`, json("POST")),
                  )
                }
              >
                取消任务
              </button>
            )}
          <button
            type="button"
            className="icon-button"
            onClick={() =>
              navigator.clipboard.writeText(
                `${location.href.split("#")[0]}#task-${task.id}`,
              )
            }
            title="复制任务链接"
            aria-label="复制任务链接"
          >
            ↗
          </button>
        </div>
      </header>
      <div className="detail-facts">
        <span>
          <b>发起人</b>
          {task.requesterName}
        </span>
        <span>
          <b>执行 Agent</b>
          {task.selectedAgentName}
        </span>
        <span>
          <b>Agent 所有者</b>
          {task.selectedAgentOwnerName}
        </span>
        <span>
          <b>更新时间</b>
          {formatTime(task.updatedAt)}
        </span>
      </div>
      {canManage && waiting && (
        <div className="reassign-row">
          <label>
            <span>重新选择 Agent</span>
            <select
              required
              value={agentId}
              onChange={(event) => setAgentId(event.target.value)}
            >
              {!availableAgents.length && (
                <option value="">暂无可借用的 Agent</option>
              )}
              {availableAgents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.displayName} · {agent.ownerName} ·{" "}
                  {agentStatus[agent.status].label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="button button-secondary"
            disabled={
              busy ||
              agentId === task.selectedAgentId ||
              !availableAgents.some((agent) => agent.id === agentId)
            }
            onClick={() =>
              action(() =>
                api(
                  `/api/tasks/${task.id}/reassign`,
                  json("POST", { agentId }),
                ),
              )
            }
          >
            更新选择
          </button>
        </div>
      )}
      {(task.progress || task.error) && (
        <div className={`progress-box ${task.error ? "has-error" : ""}`}>
          <span className="progress-icon">
            {task.error ? "!" : task.status === "running" ? <Spinner /> : "·"}
          </span>
          <div>
            <strong>{task.error ? "执行遇到问题" : "当前进度"}</strong>
            <p>{task.error || task.progress}</p>
          </div>
        </div>
      )}
      <div className="conversation">
        <h3>项目对话</h3>
        {task.messages.length === 0 ? (
          <p className="empty-inline">任务尚无后续消息。</p>
        ) : (
          task.messages.map((message) => (
            <div className={`message message-${message.role}`} key={message.id}>
              <div className="message-avatar">
                {message.role === "agent" ? "AI" : initials(message.memberName)}
              </div>
              <div>
                <div className="message-author">
                  <strong>{message.memberName}</strong>
                  <time>{formatTime(message.createdAt)}</time>
                </div>
                <p>{message.content}</p>
              </div>
            </div>
          ))
        )}
      </div>
      {task.result && (
        <section className="result-box">
          <span>✓</span>
          <div>
            <h3>执行结果</h3>
            <p>{task.result}</p>
          </div>
        </section>
      )}
      <CodePanel
        title="代码差异"
        value={
          task.diff ||
          (task.status === "completed" ? "本任务没有产生文件差异。" : "")
        }
        variant="diff"
      />
      <CodePanel title="测试输出" value={task.testOutput} variant="plain" />
      {task.commitSha && (
        <div className="commit-row">
          <span>Commit</span>
          <code>{task.commitSha}</code>
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(task.commitSha)}
          >
            复制
          </button>
        </div>
      )}
      {error && <div className="alert alert-error">{error}</div>}
      {isTerminalTaskStatus(task.status) && (
        <form className="reply-form" onSubmit={sendReply}>
          <label>
            <span>补充项目上下文</span>
            <textarea
              value={reply}
              onChange={(event) => setReply(event.target.value)}
              placeholder="记录补充要求，后续被选中的 Agent 会收到这段上下文…"
              rows={3}
            />
          </label>
          <button
            type="submit"
            className="button button-primary"
            disabled={busy || !reply.trim()}
          >
            {busy && <Spinner />}保存补充说明
          </button>
        </form>
      )}
    </section>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const modalRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const background = [
      document.querySelector<HTMLElement>(".topbar"),
      document.querySelector<HTMLElement>(".workspace"),
      document.querySelector<HTMLElement>(".app-shell > footer"),
    ].filter((element): element is HTMLElement => Boolean(element));
    for (const element of background) element.inert = true;

    const focusable = () =>
      [
        ...(modalRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ) ?? []),
      ].filter((element) => element.offsetParent !== null);
    focusable()[0]?.focus();

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    addEventListener("keydown", handleKeydown);
    return () => {
      removeEventListener("keydown", handleKeydown);
      for (const element of background) element.inert = false;
      previouslyFocused?.focus();
    };
  }, []);
  return (
    <div className="modal-backdrop">
      <section
        ref={modalRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <h2>{title}</h2>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="关闭"
          >
            ×
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

function PairModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("我的 Codex");
  const [pairing, setPairing] = useState<PairingResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      setPairing(
        await api<PairingResponse>(
          "/api/agents/pair",
          json("POST", { displayName: name }),
        ),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "生成配对命令失败");
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    if (!pairing) return;
    await navigator.clipboard.writeText(pairing.command);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }
  return (
    <Modal title="贡献我的 Codex" onClose={onClose}>
      {pairing ? (
        <div className="stack">
          <div className="step">
            <span>1</span>
            <p>确认贡献 Agent 的电脑已安装并登录 Codex。</p>
          </div>
          <div className="step">
            <span>2</span>
            <p>
              在该电脑的 Team Agent Alpha 源码根目录运行下面的单次配对命令：
            </p>
          </div>
          <div className="command-box">
            <code>{pairing.command}</code>
            <button
              type="button"
              className="button button-secondary"
              onClick={copy}
            >
              {copied ? "已复制" : "复制命令"}
            </button>
          </div>
          <p className="muted small">
            命令有效期至 {formatTime(pairing.expiresAt)}。Runner
            连上后，团队即可看到你的 Agent。
          </p>
        </div>
      ) : (
        <form onSubmit={create} className="stack">
          <p className="muted">
            共享开启期间，团队成员可以明确选择并借用这台电脑上的
            Codex。你随时可以暂停。
          </p>
          <label className="field">
            <span>Agent 显示名称</span>
            <input
              required
              maxLength={80}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          {error && <div className="alert alert-error">{error}</div>}
          <button
            type="submit"
            className="button button-primary button-large"
            disabled={busy || !name.trim()}
          >
            {busy && <Spinner />}生成配对命令
          </button>
        </form>
      )}
    </Modal>
  );
}

function AdminModal({
  snapshot,
  onClose,
  onRefresh,
}: {
  snapshot: DashboardSnapshot;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}) {
  const [settings, setSettings] = useState<ProjectSettings>(snapshot.settings);
  const [invite, setInvite] = useState<InviteResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api("/api/settings", json("PUT", settings));
      await onRefresh();
      setNotice("项目设置已保存");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }
  async function createInvite() {
    setBusy(true);
    setError("");
    try {
      setInvite(await api<InviteResponse>("/api/invites", json("POST")));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "生成邀请失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="项目管理" onClose={onClose}>
      <div className="admin-section">
        <div>
          <h3>邀请团队成员</h3>
          <p className="muted small">每个链接仅供一位成员使用。</p>
        </div>
        {invite ? (
          <div className="invite-result">
            <input readOnly value={invite.inviteUrl} />
            <button
              type="button"
              className="button button-secondary"
              onClick={() => navigator.clipboard.writeText(invite.inviteUrl)}
            >
              复制链接
            </button>
            <small>有效期至 {formatTime(invite.expiresAt)}</small>
          </div>
        ) : (
          <button
            type="button"
            className="button button-secondary"
            disabled={busy}
            onClick={createInvite}
          >
            生成个人邀请链接
          </button>
        )}
      </div>
      <hr />
      <form onSubmit={save} className="settings-grid">
        <h3>项目设置</h3>
        <label className="field">
          <span>项目名称</span>
          <input
            required
            value={settings.projectName}
            onChange={(event) =>
              setSettings({ ...settings, projectName: event.target.value })
            }
          />
        </label>
        <label className="field field-wide">
          <span>Git 仓库地址</span>
          <input
            required
            value={settings.repositoryUrl}
            onChange={(event) =>
              setSettings({ ...settings, repositoryUrl: event.target.value })
            }
          />
        </label>
        <label className="field">
          <span>基础分支</span>
          <input
            required
            value={settings.baseBranch}
            onChange={(event) =>
              setSettings({ ...settings, baseBranch: event.target.value })
            }
          />
        </label>
        <label className="field">
          <span>共享分支</span>
          <input
            required
            value={settings.sharedBranch}
            onChange={(event) =>
              setSettings({ ...settings, sharedBranch: event.target.value })
            }
          />
        </label>
        <label className="field field-wide">
          <span>测试命令</span>
          <input
            value={settings.testCommand}
            onChange={(event) =>
              setSettings({ ...settings, testCommand: event.target.value })
            }
            placeholder="pnpm test"
          />
        </label>
        {error && <div className="alert alert-error field-wide">{error}</div>}
        {notice && (
          <div className="alert alert-success field-wide">{notice}</div>
        )}
        <div className="form-actions field-wide">
          <button
            type="submit"
            className="button button-primary"
            disabled={busy}
          >
            {busy && <Spinner />}保存设置
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Dashboard({
  initial,
  onUnauthorized,
}: {
  initial: DashboardSnapshot;
  onUnauthorized: () => void;
}) {
  const [snapshot, setSnapshot] = useState(initial);
  const [selectedId, setSelectedId] = useState(() =>
    location.hash.startsWith("#task-")
      ? location.hash.slice(6)
      : (initial.tasks[0]?.id ?? ""),
  );
  const [pairOpen, setPairOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(true);
  const [prompt, setPrompt] = useState("");
  const [agentId, setAgentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const availableAgents = useMemo(
    () => snapshot.agents.filter((agent) => agent.status !== "paused"),
    [snapshot.agents],
  );

  const refresh = useCallback(async () => {
    try {
      setSnapshot(await getSnapshot());
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onUnauthorized();
    }
  }, [onUnauthorized]);
  useEffect(() => {
    const stream = new EventSource("/api/stream");
    stream.onmessage = () => void refresh();
    stream.addEventListener("snapshot", () => void refresh());
    const backup = window.setInterval(() => void refresh(), 30_000);
    return () => {
      stream.close();
      clearInterval(backup);
    };
  }, [refresh]);
  useEffect(() => {
    if (availableAgents.some((agent) => agent.id === agentId)) return;
    setAgentId(
      availableAgents.find((agent) => agent.status === "online")?.id ??
        availableAgents[0]?.id ??
        "",
    );
  }, [agentId, availableAgents]);
  const selected =
    snapshot.tasks.find((task) => task.id === selectedId) ?? null;
  const onlineCount = snapshot.agents.filter(
    (agent) => agent.status === "online",
  ).length;
  const running = snapshot.tasks.find(
    (task) => task.status === "running" || task.status === "waiting_for_owner",
  );
  const sortedTasks = useMemo(
    () =>
      [...snapshot.tasks].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      ),
    [snapshot.tasks],
  );

  async function createTask(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api<{ task?: Task; id?: string } | Task>(
        "/api/tasks",
        json("POST", { prompt, agentId }),
      );
      const id =
        "task" in result && result.task
          ? result.task.id
          : "id" in result && result.id
            ? result.id
            : "id" in result
              ? result.id
              : undefined;
      setPrompt("");
      await refresh();
      if (id) {
        setSelectedId(id);
        location.hash = `task-${id}`;
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "创建任务失败");
    } finally {
      setBusy(false);
    }
  }
  async function toggleAgent(agent: Agent) {
    setBusy(true);
    setError("");
    try {
      await api(
        `/api/agents/${agent.id}/status`,
        json("POST", {
          status: agent.status === "paused" ? "online" : "paused",
        }),
      );
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "更新共享状态失败");
    } finally {
      setBusy(false);
    }
  }
  function chooseTask(id: string) {
    setSelectedId(id);
    location.hash = `task-${id}`;
  }
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark small-mark">TA</div>
          <div>
            <strong>{snapshot.settings.projectName}</strong>
            <span>Team Agent · 内部内测</span>
          </div>
        </div>
        <div className="header-right">
          <div className="presence">
            <span className="presence-dot" />
            {onlineCount} 个 Agent 在线
          </div>
          {snapshot.me.isAdmin && (
            <button
              type="button"
              className="button button-quiet"
              onClick={() => setAdminOpen(true)}
            >
              项目管理
            </button>
          )}
          <div className="user-chip">
            <span>{initials(snapshot.me.name)}</span>
            {snapshot.me.name}
          </div>
        </div>
      </header>
      <main className="workspace">
        <section className="hero">
          <div>
            <p className="eyebrow">SHARED PROJECT</p>
            <h1>把任务交给团队的 Agent</h1>
            <p>选择一位成员共享的 Codex，基于同一份项目对话和代码继续推进。</p>
          </div>
          <div className="hero-summary">
            <div>
              <b>{snapshot.agents.length}</b>
              <span>共享 Agent</span>
            </div>
            <div>
              <b>
                {
                  snapshot.tasks.filter((task) => task.status === "completed")
                    .length
                }
              </b>
              <span>已完成任务</span>
            </div>
            <div>
              <b>{snapshot.settings.sharedBranch}</b>
              <span>共享分支</span>
            </div>
          </div>
        </section>
        {running && (
          <div className="now-running">
            <span className="live-pulse" />
            <div>
              <b>{running.selectedAgentName} 正在执行</b>
              <span>{running.progress || running.prompt}</span>
            </div>
            <button type="button" onClick={() => chooseTask(running.id)}>
              查看任务 →
            </button>
          </div>
        )}
        <section className="section-block">
          <div className="section-heading">
            <div>
              <h2>团队 Agent</h2>
              <p>所有成员都可以借用当前在线的 Agent。</p>
            </div>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => setPairOpen(true)}
            >
              ＋ 贡献我的 Codex
            </button>
          </div>
          {snapshot.agents.length ? (
            <div className="agent-grid">
              {snapshot.agents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  mine={agent.ownerMemberId === snapshot.me.id}
                  onToggle={toggleAgent}
                  busy={busy}
                />
              ))}
            </div>
          ) : (
            <div className="empty-state compact">
              <div>⌁</div>
              <h3>团队里还没有共享的 Agent</h3>
              <p>连接第一台 Codex，团队成员就可以开始借用。</p>
              <button
                type="button"
                className="button button-primary"
                onClick={() => setPairOpen(true)}
              >
                贡献我的 Codex
              </button>
            </div>
          )}
        </section>
        <section className="section-block tasks-block">
          <div className="section-heading">
            <div>
              <h2>项目任务</h2>
              <p>同一时间只执行一个任务，后续任务按可用 Agent 排队。</p>
            </div>
            <button
              type="button"
              className="button button-primary"
              onClick={() => setComposerOpen(!composerOpen)}
            >
              {composerOpen ? "收起任务框" : "＋ 发起任务"}
            </button>
          </div>
          {composerOpen && (
            <form className="composer" onSubmit={createTask}>
              <label className="composer-prompt">
                <span>要推进什么？</span>
                <textarea
                  rows={4}
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="例如：为登录页面增加忘记密码入口，并补充相关测试…"
                />
              </label>
              <div className="composer-footer">
                <label>
                  <span>使用</span>
                  <select
                    required
                    value={agentId}
                    onChange={(event) => setAgentId(event.target.value)}
                  >
                    <option value="" disabled>
                      明确选择一位 Agent
                    </option>
                    {availableAgents.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.displayName} · {agent.ownerName}（
                        {agentStatus[agent.status].label}）
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="submit"
                  className="button button-primary button-large"
                  disabled={
                    busy ||
                    !prompt.trim() ||
                    !availableAgents.some((agent) => agent.id === agentId)
                  }
                >
                  {busy && <Spinner />}加入任务队列
                </button>
              </div>
              {!availableAgents.length && (
                <p className="muted small" role="status">
                  当前没有可借用的 Agent。请先连接一台
                  Codex，或让所有者恢复共享。
                </p>
              )}
              {error && <div className="alert alert-error">{error}</div>}
            </form>
          )}
          {sortedTasks.length ? (
            <div className="tasks-layout">
              <aside className="task-list" aria-label="任务列表">
                {sortedTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    selected={task.id === selected?.id}
                    onClick={() => chooseTask(task.id)}
                  />
                ))}
              </aside>
              {selected ? (
                <TaskDetail
                  task={selected}
                  agents={snapshot.agents}
                  canManage={
                    snapshot.me.isAdmin ||
                    selected.requesterMemberId === snapshot.me.id
                  }
                  canRetry={
                    snapshot.me.isAdmin ||
                    selected.requesterMemberId === snapshot.me.id ||
                    snapshot.agents.some(
                      (agent) =>
                        agent.id === selected.selectedAgentId &&
                        agent.ownerMemberId === snapshot.me.id,
                    )
                  }
                  isAdmin={snapshot.me.isAdmin}
                  onRefresh={refresh}
                />
              ) : (
                <div className="empty-detail">选择一项任务查看详情</div>
              )}
            </div>
          ) : (
            <div className="empty-state">
              <div>✓</div>
              <h3>从第一个真实任务开始</h3>
              <p>选择团队成员的 Agent，写下目标，所有进展都会留在这里。</p>
            </div>
          )}
        </section>
      </main>
      <footer>
        <span>Team Agent Internal Alpha</span>
        <span>仓库：{snapshot.settings.repositoryUrl || "尚未配置"}</span>
      </footer>
      {pairOpen && <PairModal onClose={() => setPairOpen(false)} />}
      {adminOpen && (
        <AdminModal
          snapshot={snapshot}
          onClose={() => setAdminOpen(false)}
          onRefresh={refresh}
        />
      )}
    </div>
  );
}

export function App() {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "claim" }
    | { kind: "ready"; snapshot: DashboardSnapshot }
    | { kind: "error"; message: string }
  >({ kind: "loading" });
  const search = new URLSearchParams(location.search);
  const token = search.get("token") ?? search.get("invite") ?? "";
  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      setState({ kind: "ready", snapshot: await getSnapshot() });
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401)
        setState({ kind: "claim" });
      else
        setState({
          kind: "error",
          message: cause instanceof Error ? cause.message : "工作台加载失败",
        });
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  if (state.kind === "loading")
    return (
      <main className="loading-screen">
        <div className="brand-mark">TA</div>
        <Spinner />
        <p>正在打开项目工作台…</p>
      </main>
    );
  if (state.kind === "claim")
    return <ClaimView token={token} onClaimed={load} />;
  if (state.kind === "error")
    return (
      <main className="loading-screen">
        <div className="error-glyph">!</div>
        <h2>工作台暂时没连上</h2>
        <p>{state.message}</p>
        <button type="button" className="button button-primary" onClick={load}>
          重新连接
        </button>
      </main>
    );
  return (
    <Dashboard
      initial={state.snapshot}
      onUnauthorized={() => setState({ kind: "claim" })}
    />
  );
}
