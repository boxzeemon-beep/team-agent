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
  queued: { label: "等待接取", tone: "neutral" },
  waiting_for_agent: { label: "等待 Agent 归队", tone: "warn" },
  running: { label: "远征中", tone: "active" },
  waiting_for_owner: { label: "等待所有者", tone: "warn" },
  completed: { label: "委托完成", tone: "success" },
  needs_attention: { label: "遭遇阻碍", tone: "danger" },
  canceled: { label: "已撤回", tone: "neutral" },
};

const agentStatus: Record<AgentStatus, { label: string; tone: string }> = {
  online: { label: "待命", tone: "success" },
  busy: { label: "远征中", tone: "active" },
  offline: { label: "离开公会", tone: "neutral" },
  paused: { label: "休整中", tone: "warn" },
};

const agentConnectionLevel: Record<AgentStatus, number> = {
  online: 100,
  busy: 100,
  offline: 0,
  paused: 0,
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
        <p className="eyebrow">TEAM AGENT · THE CODING GUILD</p>
        <h1>{token ? "加入开发者公会" : "这座公会需要邀请"}</h1>
        <p className="muted auth-copy">
          {token
            ? "加入后，你可以召集并借用队友共享的 Codex Agent，一起完成真实的项目委托。"
            : "使用公会管理员发给你的个人邀请链接进入项目世界。"}
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
              {busy && <Spinner />}进入公会
            </button>
          </form>
        ) : (
          <div className="invite-hint">
            公会邀请通常形如 <code>?token=••••••</code>
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
        <span className="muted small">由 {agent.ownerName} 召集</span>
        <span className="muted micro">
          最近归队：{formatTime(agent.lastSeenAt)}
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
            {agent.status === "paused" ? "结束休整" : "进入休整"}
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
        <span>{task.requesterName} 发布</span>
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
                撤回委托
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
            <span>重新指派 Agent</span>
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
            更新指派
          </button>
        </div>
      )}
      {(task.progress || task.error) && (
        <div className={`progress-box ${task.error ? "has-error" : ""}`}>
          <span className="progress-icon">
            {task.error ? "!" : task.status === "running" ? <Spinner /> : "·"}
          </span>
          <div>
            <strong>{task.error ? "委托遭遇阻碍" : "远征动态"}</strong>
            <p>{task.error || task.progress}</p>
          </div>
        </div>
      )}
      <div className="conversation">
        <h3>冒险日志 · 项目对话</h3>
        {task.messages.length === 0 ? (
          <p className="empty-inline">这项委托还没有后续消息。</p>
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
            <h3>任务战报 · 执行结果</h3>
            <p>{task.result}</p>
          </div>
        </section>
      )}
      <CodePanel
        title="代码变更 · Diff"
        value={
          task.diff ||
          (task.status === "completed" ? "本任务没有产生文件差异。" : "")
        }
        variant="diff"
      />
      <CodePanel
        title="测试检定 · Test Output"
        value={task.testOutput}
        variant="plain"
      />
      {task.commitSha && (
        <div className="commit-row">
          <span>公会存档 · Commit</span>
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
            <span>补充任务线索</span>
            <textarea
              value={reply}
              onChange={(event) => setReply(event.target.value)}
              placeholder="记录补充要求，后续被指派的 Agent 会收到这段项目上下文…"
              rows={3}
            />
          </label>
          <button
            type="submit"
            className="button button-primary"
            disabled={busy || !reply.trim()}
          >
            {busy && <Spinner />}保存任务线索
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
      document.querySelector<HTMLElement>(".game-stage"),
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
    <Modal title="召集我的 Codex Agent" onClose={onClose}>
      {pairing ? (
        <div className="stack">
          <div className="step">
            <span>1</span>
            <p>确认召集 Agent 的电脑已安装并登录 Codex。</p>
          </div>
          <div className="step">
            <span>2</span>
            <p>在 Agent 所有者的电脑上运行下面的单次配对命令：</p>
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
            归队后，所有公会成员都能看到并指派你的 Agent。
          </p>
        </div>
      ) : (
        <form onSubmit={create} className="stack">
          <p className="muted">
            共享开启期间，公会成员可以明确选择并借用这台电脑上的
            Codex。你随时可以让它进入休整。
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
            {busy && <Spinner />}生成召集命令
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
    <Modal title="公会设置" onClose={onClose}>
      <div className="admin-section">
        <div>
          <h3>邀请公会成员</h3>
          <p className="muted small">每枚邀请印记仅供一位成员使用。</p>
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
            生成个人邀请
          </button>
        )}
      </div>
      <hr />
      <form onSubmit={save} className="settings-grid">
        <h3>项目世界设置</h3>
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
  const partyRef = useRef<HTMLElement>(null);
  const questsRef = useRef<HTMLElement>(null);
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
  const completedCount = snapshot.tasks.filter(
    (task) => task.status === "completed",
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
  const focusedAgent =
    snapshot.agents.find((agent) => agent.id === agentId) ??
    snapshot.agents.find((agent) => agent.id === running?.selectedAgentId) ??
    snapshot.agents[0];
  const onlineRatio = snapshot.agents.length
    ? Math.round((onlineCount / snapshot.agents.length) * 100)
    : 0;
  const chapterNumber = Math.floor(completedCount / 5) + 1;
  const chapterStep = completedCount % 5;
  const chapterProgress = chapterStep * 20;

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
  const revealParty = useCallback(() => {
    partyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);
  const revealQuests = useCallback((openComposer = false) => {
    if (openComposer) setComposerOpen(true);
    questsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        pairOpen ||
        adminOpen ||
        event.metaKey ||
        event.ctrlKey ||
        !event.altKey ||
        target?.matches("input, textarea, select, [contenteditable='true']")
      )
        return;
      const digitShortcut = /^(?:Digit|Numpad)([1-4])$/.exec(event.code);
      const slot = digitShortcut ? Number(digitShortcut[1]) - 1 : -1;
      if (slot >= 0 && slot < 4) {
        const agent = snapshot.agents[slot];
        if (agent) {
          if (agent.status !== "paused") setAgentId(agent.id);
        } else {
          setPairOpen(true);
        }
        event.preventDefault();
        return;
      }
      if (event.code === "KeyQ") {
        event.preventDefault();
        revealQuests(true);
      }
      if (event.code === "KeyP") {
        event.preventDefault();
        revealParty();
      }
      if (event.code === "KeyC") {
        event.preventDefault();
        setPairOpen(true);
      }
      if (event.code === "KeyJ") {
        event.preventDefault();
        revealQuests();
      }
      if (event.code === "KeyG" && snapshot.me.isAdmin) {
        event.preventDefault();
        setAdminOpen(true);
      }
    };
    addEventListener("keydown", handleShortcut);
    return () => removeEventListener("keydown", handleShortcut);
  }, [
    snapshot.agents,
    snapshot.me.isAdmin,
    pairOpen,
    adminOpen,
    revealParty,
    revealQuests,
  ]);
  return (
    <div className="app-shell rpg-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark small-mark">TA</div>
          <div>
            <strong>{snapshot.settings.projectName}</strong>
            <span>THE CODING GUILD · 团队 Agent 公会</span>
          </div>
        </div>
        <div className="header-right">
          <div className="presence">
            <span className="presence-dot" />
            {onlineCount} / {snapshot.agents.length} AGENTS 待命
          </div>
          {snapshot.me.isAdmin && (
            <button
              type="button"
              className="button button-quiet"
              onClick={() => setAdminOpen(true)}
              aria-keyshortcuts="Alt+G"
            >
              公会设置
            </button>
          )}
          <div className="user-chip">
            <span>{initials(snapshot.me.name)}</span>
            {snapshot.me.name}
          </div>
        </div>
      </header>

      <section className="game-stage" aria-label="项目世界总览">
        <div className="scene-vignette" aria-hidden="true" />

        <aside className="player-hud" aria-label="当前队伍状态">
          <div className="player-crest" aria-hidden="true">
            <span>
              {focusedAgent ? initials(focusedAgent.ownerName) : "TA"}
            </span>
            <i
              className={`crest-status crest-status-${focusedAgent?.status ?? "offline"}`}
            />
          </div>
          <div className="hud-meters">
            <div className="hud-title">
              <span>CURRENT AGENT</span>
              <strong>{focusedAgent?.displayName ?? "等待 Agent 归队"}</strong>
            </div>
            <div className="hud-meter hud-meter-crimson">
              <i style={{ width: `${onlineRatio}%` }} />
            </div>
            <small>
              队伍链接 · {onlineCount}/{snapshot.agents.length || 0} 待命
            </small>
            <div className="hud-meter hud-meter-cyan">
              <i
                style={{
                  width: `${focusedAgent ? agentConnectionLevel[focusedAgent.status] : 0}%`,
                }}
              />
            </div>
            <small>
              Agent 连接 ·{" "}
              {focusedAgent
                ? agentStatus[focusedAgent.status].label
                : "尚未召集"}
            </small>
            <div className="hud-meter hud-meter-gold">
              <i style={{ width: `${chapterProgress}%` }} />
            </div>
            <small>
              公会第 {chapterNumber} 章 · {chapterStep}/5 项委托
            </small>
          </div>
        </aside>

        <aside className="world-map" aria-label="项目地图">
          <span className="map-heading">PROJECT MAP</span>
          <div className="mini-map">
            <span className="map-ring" aria-hidden="true" />
            <button
              type="button"
              className="map-node map-node-party"
              onClick={revealParty}
              aria-label="前往 Agent 队伍"
              title="Agent 队伍"
            />
            <button
              type="button"
              className="map-node map-node-quests"
              onClick={() => revealQuests()}
              aria-label="前往委托日志"
              title="委托日志"
            />
            <button
              type="button"
              className="map-player"
              onClick={() => revealQuests(true)}
              aria-label="发布新委托"
              title="发布新委托"
            >
              ▲
            </button>
            <span className="map-sweep" aria-hidden="true" />
          </div>
          <strong>{snapshot.settings.sharedBranch}</strong>
          <span>
            {snapshot.tasks.length} 项委托 · {completedCount} 已完成
          </span>
        </aside>

        <div className="world-objective">
          <p className="eyebrow">ACT {chapterNumber} · THE SHARED CODEX</p>
          <h1>集结 Agent，开启项目远征</h1>
          <p>
            选择队友共享的
            Codex，把真实开发任务变成一场所有人都能参与的协作冒险。
          </p>
          <button
            type="button"
            className="button button-primary button-large objective-button"
            onClick={() => revealQuests(true)}
            aria-keyshortcuts="Alt+Q"
          >
            <span aria-hidden="true">⚑</span> 打开委托板
            <kbd>ALT Q</kbd>
          </button>
        </div>

        <div
          className={`now-running world-expedition ${running ? "" : "is-idle"}`}
          role="status"
          aria-live="polite"
        >
          <span className="live-pulse" />
          <div>
            <b>
              {running
                ? `${running.selectedAgentName} 正在远征`
                : "公会之门已经开启"}
            </b>
            <span>
              {running?.progress ||
                running?.prompt ||
                "从委托板选择一项任务，或者发布新的项目委托。"}
            </span>
          </div>
          <button
            type="button"
            onClick={() =>
              running ? chooseTask(running.id) : revealQuests(true)
            }
          >
            {running ? "查看战况 →" : "选择委托 →"}
          </button>
        </div>

        <fieldset className="party-dock">
          <legend className="dock-label">
            <span>ACTIVE PARTY</span>
            <small>ALT + 1–4 指派</small>
          </legend>
          <div className="party-slots">
            {snapshot.agents.slice(0, 4).map((agent, index) => (
              <button
                type="button"
                key={agent.id}
                className={`party-slot ${agent.id === focusedAgent?.id ? "is-focused" : ""} party-slot-${agent.status}`}
                onClick={() => setAgentId(agent.id)}
                disabled={agent.status === "paused"}
                aria-pressed={agent.id === focusedAgent?.id}
                aria-keyshortcuts={`Alt+${index + 1}`}
                aria-label={`${agent.displayName}，所有者 ${agent.ownerName}，${agentStatus[agent.status].label}，快捷键 Alt+${index + 1}`}
                title={`${agent.displayName} · ${agentStatus[agent.status].label}`}
              >
                <kbd>{index + 1}</kbd>
                <span>{initials(agent.ownerName)}</span>
                <i aria-hidden="true" />
              </button>
            ))}
            {["party-slot-a", "party-slot-b", "party-slot-c", "party-slot-d"]
              .slice(snapshot.agents.length)
              .map((slotId, index) => (
                <button
                  type="button"
                  className="party-slot party-slot-empty"
                  key={slotId}
                  onClick={() => setPairOpen(true)}
                  title="召集新的 Codex Agent"
                  aria-label="召集新的 Codex Agent"
                  aria-keyshortcuts={`Alt+${snapshot.agents.length + index + 1}`}
                >
                  <kbd>{snapshot.agents.length + index + 1}</kbd>
                  <span>＋</span>
                </button>
              ))}
          </div>
        </fieldset>

        <nav className="command-wheel" aria-label="公会快捷指令">
          <button
            type="button"
            className="command-action command-top"
            onClick={() => revealQuests(true)}
            aria-keyshortcuts="Alt+Q"
          >
            <span>⚑</span>
            <small>委托</small>
            <kbd>ALT Q</kbd>
          </button>
          <button
            type="button"
            className="command-action command-right"
            onClick={() => setPairOpen(true)}
            aria-keyshortcuts="Alt+C"
          >
            <span>＋</span>
            <small>召集</small>
            <kbd>ALT C</kbd>
          </button>
          <button
            type="button"
            className="command-action command-bottom"
            onClick={() => revealQuests()}
            aria-keyshortcuts="Alt+J"
          >
            <span>≡</span>
            <small>日志</small>
            <kbd>ALT J</kbd>
          </button>
          <button
            type="button"
            className="command-action command-left"
            onClick={revealParty}
            aria-keyshortcuts="Alt+P"
          >
            <span>◆</span>
            <small>队伍</small>
            <kbd>ALT P</kbd>
          </button>
          <span className="command-core" aria-hidden="true">
            TA
          </span>
        </nav>

        <button
          type="button"
          className="scroll-cue"
          onClick={revealParty}
          aria-label="进入公会界面"
        >
          <span>进入公会界面</span>
          <i aria-hidden="true">⌄</i>
        </button>
      </section>

      <main className="workspace">
        <section className="hero campaign-summary">
          <div>
            <p className="eyebrow">GUILD CAMPAIGN · 公会战役</p>
            <h1>{snapshot.settings.projectName}</h1>
            <p>每项委托都继承同一份项目对话、代码状态与真实 Git 记录。</p>
          </div>
          <div className="hero-summary">
            <div>
              <b>{snapshot.agents.length}</b>
              <span>队伍 Agent</span>
            </div>
            <div>
              <b>{completedCount}</b>
              <span>完成委托</span>
            </div>
            <div>
              <b>{snapshot.settings.sharedBranch}</b>
              <span>当前路线 · Branch</span>
            </div>
          </div>
        </section>

        <section className="section-block party-section" ref={partyRef}>
          <div className="section-heading">
            <div>
              <p className="section-kicker">PARTY</p>
              <h2>Agent 队伍</h2>
              <p>从队友共享的 Codex 中选择本次委托的执行者。</p>
            </div>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => setPairOpen(true)}
            >
              ＋ 召集我的 Codex
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
              <h3>队伍尚未集结</h3>
              <p>召集第一位 Codex Agent，所有成员就能开始发布委托。</p>
              <button
                type="button"
                className="button button-primary"
                onClick={() => setPairOpen(true)}
              >
                召集我的 Codex
              </button>
            </div>
          )}
        </section>

        <section
          className="section-block tasks-block quest-section"
          ref={questsRef}
        >
          <div className="section-heading">
            <div>
              <p className="section-kicker">QUEST BOARD</p>
              <h2>项目委托</h2>
              <p>同一时间展开一场远征，后续委托按可用 Agent 排队。</p>
            </div>
            <button
              type="button"
              className="button button-primary"
              onClick={() => setComposerOpen(!composerOpen)}
            >
              {composerOpen ? "收起委托单" : "＋ 发布委托"}
            </button>
          </div>
          {composerOpen && (
            <form className="composer" onSubmit={createTask}>
              <label className="composer-prompt">
                <span>委托目标</span>
                <textarea
                  rows={4}
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="例如：为登录页面增加忘记密码入口，并补充相关测试…"
                />
              </label>
              <div className="composer-footer">
                <label>
                  <span>指派 Agent</span>
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
                  {busy && <Spinner />}发布并加入队列
                </button>
              </div>
              {!availableAgents.length && (
                <p className="muted small" role="status">
                  当前没有可指派的 Agent。请先召集一台
                  Codex，或让所有者结束休整。
                </p>
              )}
              {error && <div className="alert alert-error">{error}</div>}
            </form>
          )}
          {sortedTasks.length ? (
            <div className="tasks-layout">
              <aside className="task-list" aria-label="委托列表">
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
                <div className="empty-detail">选择一项委托查看任务战报</div>
              )}
            </div>
          ) : (
            <div className="empty-state">
              <div>✓</div>
              <h3>发布第一项真实委托</h3>
              <p>写下目标、指派 Agent，所有进展与代码证据都会记录在这里。</p>
            </div>
          )}
        </section>
      </main>
      <footer>
        <span>Team Agent · The Coding Guild</span>
        <span>项目世界：{snapshot.settings.repositoryUrl || "尚未配置"}</span>
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
        <p>正在进入项目世界…</p>
      </main>
    );
  if (state.kind === "claim")
    return <ClaimView token={token} onClaimed={load} />;
  if (state.kind === "error")
    return (
      <main className="loading-screen">
        <div className="error-glyph">!</div>
        <h2>通往公会的连接中断</h2>
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
