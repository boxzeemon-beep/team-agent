import type { Agent, DashboardSnapshot, Task } from "@team-agent/shared";
import {
  type FormEvent,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ApiError,
  api,
  getSnapshot,
  isStaticDemo,
  json,
  resetDemo,
  subscribeSnapshots,
} from "./api.js";
import {
  criteriaLines,
  emptyGoalDraft,
  followupDraft,
  GoalComposer,
  type GoalDraft,
  goalDraftError,
  readGoalDraft,
  taskWorkflowLabel,
  toGoalBrief,
} from "./GoalWorkflow.js";
import { AccessScreen, ConnectModal, SettingsModal } from "./Management.js";
import { TaskDetail } from "./TaskDetail.js";
import { matchesFilter, selectTasks, type TaskFilter } from "./task-model.js";
import {
  Avatar,
  agentStates,
  EmptyState,
  Icon,
  type IconName,
  Logo,
  Modal,
  TaskBadge,
  taskStates,
  timeLabel,
} from "./ui.js";

type View = "overview" | "tasks" | "agents" | "activity";
const navigation: { id: View; label: string; icon: IconName }[] = [
  { id: "overview", label: "工作台", icon: "grid" },
  { id: "tasks", label: "全部任务", icon: "tasks" },
  { id: "agents", label: "团队 Agent", icon: "agents" },
  { id: "activity", label: "协作动态", icon: "activity" },
];
const templates = [
  {
    label: "修复一个问题",
    icon: "code",
    text: "修复登录状态在页面刷新后丢失的问题。\n请先复现问题，补充回归测试，并说明修改范围和验证结果。",
    criteria:
      "刷新页面后保留有效的登录状态\n退出登录后不能访问受保护页面\n自动化测试覆盖以上两种情况",
  },
  {
    label: "打磨使用体验",
    icon: "spark",
    text: "优化空状态的使用体验。\n提供清楚的下一步引导，确保键盘可操作，并检查移动端布局。",
    criteria:
      "空任务列表显示可操作的下一步引导\n所有主要操作可通过键盘访问\n390px 宽度下没有横向溢出",
  },
  {
    label: "补齐关键测试",
    icon: "terminal",
    text: "为 API 请求的超时与重试逻辑补充测试。\n覆盖正常响应、网络失败和重试耗尽的场景，说明测试运行结果。",
    criteria:
      "测试覆盖正常响应与网络失败\n重试有明确上限，耗尽后返回可理解的错误\n新增测试和已有回归测试全部通过",
  },
] as const;
const filters: { id: TaskFilter; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "active", label: "进行中" },
  { id: "attention", label: "待处理" },
  { id: "completed", label: "已完成" },
];

function AgentTile({
  agent,
  index,
  selected,
  onChoose,
}: {
  agent: Agent;
  index: number;
  selected: boolean;
  onChoose: () => void;
}) {
  return (
    <button
      type="button"
      className={`agent-tile ${selected ? "selected" : ""}`}
      aria-pressed={selected}
      disabled={agent.status === "paused"}
      onClick={onChoose}
    >
      <span className="agent-portrait">
        <Avatar name={agent.ownerName} index={index} />
        <i className={`presence presence-${agent.status}`} />
      </span>
      <span className="agent-tile-text">
        <strong>{agent.displayName}</strong>
        <small>{agent.ownerName} 的本地 Agent</small>
        <span
          className={`agent-availability tone-${agentStates[agent.status].tone}`}
        >
          {agentStates[agent.status].label}
        </span>
      </span>
      <span className="select-indicator">
        {selected ? (
          <Icon name="check" size={13} />
        ) : (
          <Icon name="plus" size={13} />
        )}
      </span>
    </button>
  );
}
function TaskRow({ task, onOpen }: { task: Task; onOpen: () => void }) {
  const state = taskStates[task.status];
  return (
    <button type="button" className="task-row" onClick={onOpen}>
      <span className={`task-type-icon tone-${state.tone}`}>
        <Icon name={state.icon} size={18} />
      </span>
      <span className="task-row-main">
        <strong>{task.prompt.split("\n")[0]}</strong>
        <span>
          <span>{task.requesterName}</span>
          <span className="metadata-dot">·</span>
          <span>{task.selectedAgentName}</span>
          <span className="metadata-dot">·</span>
          <time>{timeLabel(task.createdAt, true)}</time>
          {task.brief?.mode === "verified" && (
            <span className="task-workflow-label">
              <Icon name="shield" size={11} />
              {taskWorkflowLabel(task)}
            </span>
          )}
        </span>
      </span>
      <TaskBadge status={task.status} />
      <Icon name="chevron" size={15} />
    </button>
  );
}

function Workspace({
  initial,
  onUnauthorized,
}: {
  initial: DashboardSnapshot;
  onUnauthorized: () => void;
}) {
  const [snapshot, setSnapshot] = useState(initial);
  const [view, setView] = useState<View>("overview");
  useEffect(() => {
    // Navigation starts at the page heading, including after scrolling a long
    // list on mobile. Choosing an Agent subsequently focuses the composer.
    document.title = `${navigation.find((item) => item.id === view)?.label ?? "工作台"} · Team Agent`;
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [view]);
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [query, setQuery] = useState("");
  const [mine, setMine] = useState(false);
  const [selectedId, setSelectedId] = useState(
    location.hash.startsWith("#task-") ? location.hash.slice(6) : "",
  );
  const [agentId, setAgentId] = useState("");
  const draftKey = `team-agent:draft:${initial.me.id}:${initial.settings.repositoryUrl}`;
  const goalDraftKey = `${draftKey}:goal`;
  const [draft, setDraft] = useState(() => {
    let prompt = "";
    try {
      prompt = sessionStorage.getItem(draftKey) ?? "";
    } catch {
      /* Session storage is optional. */
    }
    return { prompt, goal: readGoalDraft(goalDraftKey) };
  });
  const { prompt, goal: goalDraft } = draft;
  function setPrompt(update: SetStateAction<string>) {
    setDraft((current) => ({
      ...current,
      prompt: typeof update === "function" ? update(current.prompt) : update,
    }));
  }
  function setGoalDraft(update: SetStateAction<GoalDraft>) {
    setDraft((current) => ({
      ...current,
      goal: typeof update === "function" ? update(current.goal) : update,
    }));
  }
  const briefProblem =
    prompt.length > 20000
      ? "目标最多 20,000 字，完整草稿已保留，请删减后提交。"
      : goalDraftError(goalDraft);
  useEffect(() => {
    try {
      sessionStorage.setItem(goalDraftKey, JSON.stringify(goalDraft));
    } catch {
      /* Keep working when storage is unavailable. */
    }
  }, [goalDraftKey, goalDraft]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [connected, setConnected] = useState(isStaticDemo);
  const [refreshError, setRefreshError] = useState("");
  const [modal, setModal] = useState<"connect" | "settings" | "reset" | null>(
    null,
  );
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const refreshVersion = useRef(0);
  const simulated =
    isStaticDemo || snapshot.settings.projectName.startsWith("[DEMO]");
  const available = snapshot.agents.filter(
    (agent) => agent.status !== "paused",
  );
  const selectedAgent = snapshot.agents.find((agent) => agent.id === agentId);
  const selectedTask = snapshot.tasks.find((task) => task.id === selectedId);
  const online = snapshot.agents.filter(
    (agent) => agent.status === "online",
  ).length;
  const activeTasks = snapshot.tasks.filter((task) =>
    matchesFilter(task, "active"),
  );
  const attention = snapshot.tasks.filter((task) =>
    matchesFilter(task, "attention"),
  );
  const completed = snapshot.tasks.filter(
    (task) => task.status === "completed",
  ).length;
  const running = snapshot.tasks.find((task) =>
    ["running", "waiting_for_owner"].includes(task.status),
  );
  const tasks = useMemo(
    () =>
      selectTasks(
        snapshot.tasks,
        filter,
        query,
        mine ? snapshot.me.id : undefined,
      ),
    [snapshot.tasks, snapshot.me.id, filter, query, mine],
  );
  const messages = useMemo(
    () =>
      snapshot.tasks
        .flatMap((task) =>
          task.messages.map((message) => ({ ...message, task })),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [snapshot.tasks],
  );
  const refresh = useCallback(async () => {
    const version = ++refreshVersion.current;
    try {
      const next = await getSnapshot();
      if (version !== refreshVersion.current) return;
      setSnapshot(next);
      setRefreshError("");
    } catch (cause) {
      if (version !== refreshVersion.current) return;
      if (cause instanceof ApiError && cause.status === 401) onUnauthorized();
      else
        setRefreshError("暂时无法同步最新数据。当前显示上一次快照，正在重连。");
    }
  }, [onUnauthorized]);
  useEffect(() => {
    const unsubscribe = subscribeSnapshots(() => void refresh(), setConnected);
    // Close the gap between the initial fetch and subscribing, including a
    // development hot reload that remounts this view from an older snapshot.
    void refresh();
    return unsubscribe;
  }, [refresh]);
  useEffect(() => {
    if (!refreshError) return;
    const retry = window.setInterval(() => void refresh(), 5000);
    return () => clearInterval(retry);
  }, [refresh, refreshError]);
  useEffect(() => {
    try {
      if (prompt) sessionStorage.setItem(draftKey, prompt);
      else sessionStorage.removeItem(draftKey);
    } catch {
      /* Draft remains available in memory. */
    }
  }, [draftKey, prompt]);
  useEffect(() => {
    if (!agentId) return;
    if (
      !snapshot.agents.some(
        (agent) => agent.id === agentId && agent.status !== "paused",
      )
    )
      setAgentId("");
  }, [agentId, snapshot.agents]);
  useEffect(() => {
    const changed = () =>
      setSelectedId(
        location.hash.startsWith("#task-") ? location.hash.slice(6) : "",
      );
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(timer);
  }, [notice]);
  const focusComposer = useCallback(() => {
    setView("overview");
    window.setTimeout(() => {
      composerRef.current?.focus();
      composerRef.current?.scrollIntoView({
        block: "center",
        behavior: "smooth",
      });
    }, 0);
  }, []);
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (document.querySelector("dialog[open]")) return;
      const target = event.target as HTMLElement;
      if (target.matches("input,textarea,select") || target.isContentEditable)
        return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setView("tasks");
        window.setTimeout(() => searchRef.current?.focus(), 0);
      } else if (
        event.key === "n" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        event.preventDefault();
        focusComposer();
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [focusComposer]);
  function openTask(id: string) {
    setSelectedId(id);
    history.replaceState(
      {},
      "",
      `${location.pathname}${location.search}#task-${id}`,
    );
  }
  function closeTask() {
    setSelectedId("");
    history.replaceState({}, "", `${location.pathname}${location.search}`);
  }
  function chooseAgent(id: string) {
    setAgentId(id);
    if (view !== "overview") focusComposer();
  }
  async function submitTask(event: FormEvent) {
    event.preventDefault();
    if (briefProblem) {
      setError(briefProblem);
      return;
    }
    if (
      !prompt.trim() ||
      !selectedAgent ||
      selectedAgent.status === "paused" ||
      busy
    )
      return;
    const submittedPrompt = prompt;
    const submittedBrief = JSON.stringify(goalDraft);
    setBusy(true);
    setError("");
    try {
      const task = await api<Task>(
        "/api/tasks",
        json("POST", {
          prompt: submittedPrompt.trim(),
          agentId,
          brief: toGoalBrief(goalDraft),
        }),
      );
      setDraft((current) =>
        current.prompt === submittedPrompt &&
        JSON.stringify(current.goal) === submittedBrief
          ? {
              prompt: "",
              goal: {
                ...emptyGoalDraft,
                mode: current.goal.mode,
                maxIterations: current.goal.maxIterations,
              },
            }
          : current,
      );
      // A confirmed creation stays visible even if the follow-up snapshot fails.
      // Ignore older in-flight snapshots, and keep any newer SSE copy of this task.
      refreshVersion.current++;
      setSnapshot((current) =>
        current.tasks.some((existing) => existing.id === task.id)
          ? current
          : { ...current, tasks: [task, ...current.tasks] },
      );
      await refresh();
      setFilter("all");
      setQuery("");
      setNotice("目标已交给 Agent，可在详情中查看进展与验收证据。");
      openTask(task.id);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "提交失败，草稿已保留。",
      );
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
  const projectName = snapshot.settings.projectName.replace(/^\[DEMO\]\s*/, "");
  const launchHint = !selectedAgent
    ? "请明确选择一位执行 Agent"
    : selectedAgent.status === "offline"
      ? "这位 Agent 离线，提交后将等待连接，也可改派。"
      : selectedAgent.status === "busy" || running
        ? "项目一次执行一个代码任务，本任务将按顺序排队。"
        : "Agent 已就绪，提交后将开始执行。";
  const title =
    view === "overview"
      ? "给团队一个目标。"
      : view === "tasks"
        ? "每一步，都有迹可循。"
        : view === "agents"
          ? "你的团队，不止于人。"
          : "协作，在这里持续发生。";
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        跳到主要内容
      </a>
      <aside className="sidebar">
        <button
          type="button"
          className="brand"
          onClick={() => setView("overview")}
        >
          <Logo />
          <span>
            Team Agent<span className="brand-sub">A LITTLE MORE TOGETHER</span>
          </span>
        </button>
        <button
          type="button"
          className="project-switch"
          onClick={() => setModal("settings")}
        >
          <span className="project-icon">
            <Icon name="code" size={19} />
          </span>
          <span>
            <strong>{projectName}</strong>
            <small>{simulated ? "演示工作空间" : "团队工作空间"}</small>
          </span>
          <Icon name="down" size={14} />
        </button>
        <div className="nav-label">工作空间</div>
        <nav aria-label="主导航">
          {navigation.map((item) => (
            <button
              type="button"
              key={item.id}
              className={`nav-item ${view === item.id ? "active" : ""}`}
              aria-current={view === item.id ? "page" : undefined}
              onClick={() => setView(item.id)}
            >
              <Icon name={item.icon} size={18} />
              <span>{item.label}</span>
              {item.id === "tasks" && (
                <span className="nav-count">{snapshot.tasks.length}</span>
              )}
              {item.id === "agents" && <span className="nav-live-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="tiny-spark">✳</span>
            <strong>
              一个人很快，
              <br />
              一起走得更远。
            </strong>
            <p>
              把你的 Agent 接入团队，
              <br />
              让好的协作自然发生。
            </p>
            <button type="button" onClick={() => setModal("connect")}>
              接入我的 Agent <Icon name="arrow" size={14} />
            </button>
          </div>
          <a
            className="nav-item"
            href="https://github.com/boxzeemon-beep/team-agent"
            target="_blank"
            rel="noreferrer"
          >
            <Icon name="book" size={17} />
            <span>项目与使用指南</span>
            <Icon name="up" size={14} />
          </a>
          <button
            type="button"
            className="nav-item"
            onClick={() => setModal("settings")}
          >
            <Icon name="settings" size={18} />
            <span>项目设置</span>
          </button>
          <div className="user-card">
            <Avatar name={snapshot.me.name} small />
            <span>
              <strong>{snapshot.me.name}</strong>
              <small>
                {snapshot.me.isAdmin
                  ? "项目管理员"
                  : simulated
                    ? "欢迎来体验"
                    : "团队成员"}
              </small>
            </span>
            <span className="version-label">v0.2</span>
          </div>
        </div>
      </aside>
      <div className="workspace-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              type="button"
              className="breadcrumb-project"
              aria-label={`项目设置：${projectName}`}
              title={`${projectName} · 项目设置`}
              onClick={() => setModal("settings")}
            >
              <Icon name="settings" size={15} />
              <span>{projectName}</span>
            </button>
            <span>/</span>
            <strong>
              {navigation.find((item) => item.id === view)?.label}
            </strong>
          </div>
          <div className="topbar-actions">
            <span
              className={`connection ${connected && !refreshError ? "is-connected" : ""}`}
              role="status"
            >
              <i />
              {isStaticDemo
                ? "本地演示"
                : connected && !refreshError
                  ? "实时同步"
                  : "正在重连"}
            </span>
            <button
              type="button"
              className="button button-secondary button-small"
              onClick={() => setModal("connect")}
            >
              <Icon name="plus" size={15} />
              接入 Agent
            </button>
          </div>
        </header>
        {simulated && (
          <div className="demo-bar">
            <span className="demo-tag">DEMO</span>
            <p>
              {isStaticDemo
                ? "自由体验，放心探索。所有 Agent、执行过程与交付证据均为模拟。"
                : "演示模式：执行过程与交付证据为模拟，不调用 Codex 或 Git。"}
            </p>
            {isStaticDemo && (
              <button type="button" onClick={() => setModal("reset")}>
                <Icon name="refresh" size={13} />
                重置演示
              </button>
            )}
          </div>
        )}
        <div className="workspace-layout">
          <main id="main-content" className="main-content">
            <div className="page-heading">
              <div>
                <div className="section-label">
                  {view === "overview"
                    ? "YOUR TEAM, IN SYNC"
                    : view === "tasks"
                      ? "MAKE PROGRESS VISIBLE"
                      : view === "agents"
                        ? "BETTER, TOGETHER"
                        : "THE WORK BEHIND THE WORK"}
                </div>
                <h1>{title}</h1>
                <p>
                  {view === "overview"
                    ? "带上背景与完成标准，让 Agent 推进实现、验证与交付。"
                    : view === "tasks"
                      ? "从一句需求，到一份可审阅的交付。"
                      : view === "agents"
                        ? "借用队友的本地能力，凭据仍由所有者掌握。"
                        : "需求、讨论与结果，汇成团队的共同上下文。"}
                </p>
              </div>
              {view !== "overview" && (
                <button
                  type="button"
                  className="button button-primary"
                  onClick={focusComposer}
                >
                  <Icon name="plus" size={16} />
                  新任务
                </button>
              )}
            </div>
            {refreshError && (
              <div className="alert alert-error" role="alert">
                {refreshError}
                <button
                  type="button"
                  className="text-button"
                  onClick={() => void refresh()}
                >
                  立即重试
                </button>
              </div>
            )}
            {error && (
              <div className="alert alert-error" role="alert">
                {error}
                <button
                  type="button"
                  className="icon-button"
                  aria-label="关闭错误提示"
                  onClick={() => setError("")}
                >
                  <Icon name="close" size={14} />
                </button>
              </div>
            )}
            {view === "overview" && (
              <>
                <form className="composer-card" onSubmit={submitTask}>
                  <div className="composer-heading">
                    <span className="composer-symbol">
                      <Icon name="spark" size={19} />
                    </span>
                    <label htmlFor="task-prompt">今天，想一起完成什么？</label>
                    <kbd>N</kbd>
                  </div>
                  <textarea
                    id="task-prompt"
                    ref={composerRef}
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    onKeyDown={(event) => {
                      if (
                        (event.ctrlKey || event.metaKey) &&
                        event.key === "Enter"
                      ) {
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                      }
                    }}
                    rows={3}
                    maxLength={20000}
                    placeholder="描述你的目标、约束，以及怎样才算完成…"
                  />
                  <div className="composer-templates">
                    {templates.map((template) => (
                      <button
                        type="button"
                        key={template.label}
                        disabled={
                          prompt.length + template.text.length + 2 > 20000
                        }
                        title={
                          prompt.trim()
                            ? "将示例追加到现有草稿"
                            : "使用示例需求"
                        }
                        onClick={() => {
                          setPrompt((current) =>
                            current.trim()
                              ? `${current}\n\n${template.text}`
                              : template.text,
                          );
                          setGoalDraft((current) => ({
                            ...current,
                            criteria: criteriaLines(
                              `${current.criteria}\n${template.criteria}`,
                            ).join("\n"),
                          }));
                          composerRef.current?.focus();
                        }}
                      >
                        <Icon name={template.icon} size={13} />
                        {template.label}
                      </button>
                    ))}
                  </div>
                  <GoalComposer value={goalDraft} onChange={setGoalDraft} />
                  <div className="composer-bottom">
                    <div className="composer-agent">
                      <Icon name="agents" size={17} />
                      <select
                        aria-label="选择执行 Agent"
                        value={agentId}
                        onChange={(event) => setAgentId(event.target.value)}
                      >
                        <option value="">选择一位 Agent</option>
                        {available.map((agent) => (
                          <option key={agent.id} value={agent.id}>
                            {agent.displayName} ·{" "}
                            {agentStates[agent.status].label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="submit"
                      className="button button-primary"
                      disabled={
                        busy ||
                        Boolean(briefProblem) ||
                        !prompt.trim() ||
                        !selectedAgent ||
                        selectedAgent.status === "paused"
                      }
                    >
                      {busy
                        ? "正在提交…"
                        : selectedAgent?.status === "offline"
                          ? "排队等待 Agent"
                          : running || selectedAgent?.status === "busy"
                            ? "加入队列"
                            : "交给 Agent"}
                      <Icon name="arrow" size={17} />
                    </button>
                  </div>
                  <div className="composer-footnote">
                    <span>
                      {prompt.trim() && briefProblem
                        ? briefProblem
                        : launchHint}
                    </span>
                    <span>
                      {prompt.length
                        ? `${prompt.length.toLocaleString()} / 20,000`
                        : "Ctrl / ⌘ + Enter 提交"}
                    </span>
                  </div>
                </form>
                <div className="stats-row">
                  <button
                    type="button"
                    onClick={() => {
                      setView("tasks");
                      setFilter("active");
                    }}
                  >
                    <span className="stat-icon tone-blue">
                      <Icon name="activity" size={18} />
                    </span>
                    <span>
                      <strong>
                        {activeTasks.length}
                        <small>进行中</small>
                      </strong>
                      <p>
                        {running ? "有 Agent 正在接力" : "每一份进展都值得关注"}
                      </p>
                    </span>
                    <Icon name="chevron" size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setView("tasks");
                      setFilter("attention");
                    }}
                  >
                    <span className="stat-icon tone-amber">
                      <Icon name="alert" size={18} />
                    </span>
                    <span>
                      <strong>
                        {attention.length}
                        <small>待处理</small>
                      </strong>
                      <p>
                        {attention.length
                          ? "有任务需要你看一眼"
                          : "暂时没有待处理事项"}
                      </p>
                    </span>
                    <Icon name="chevron" size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setView("tasks");
                      setFilter("completed");
                    }}
                  >
                    <span className="stat-icon tone-green">
                      <Icon name="check" size={18} />
                    </span>
                    <span>
                      <strong>
                        {completed}
                        <small>已完成</small>
                      </strong>
                      <p>每次交付，都留下证据</p>
                    </span>
                    <Icon name="chevron" size={13} />
                  </button>
                </div>
              </>
            )}
            {(view === "overview" || view === "tasks") && (
              <section className="task-section" aria-label="团队任务">
                <div className="section-heading">
                  <h2>
                    {view === "overview" ? "团队任务" : "任务记录"}
                    <span className="count">{snapshot.tasks.length}</span>
                  </h2>
                  <label className="mine-filter">
                    <input
                      type="checkbox"
                      checked={mine}
                      onChange={(event) => setMine(event.target.checked)}
                    />
                    只看我发起的
                  </label>
                </div>
                <div className="task-toolbar">
                  <nav className="filter-tabs" aria-label="任务状态筛选">
                    {filters.map((item) => (
                      <button
                        type="button"
                        key={item.id}
                        className={filter === item.id ? "active" : ""}
                        aria-pressed={filter === item.id}
                        onClick={() => setFilter(item.id)}
                      >
                        {item.label}
                        {item.id === "attention" && attention.length > 0 && (
                          <span>{attention.length}</span>
                        )}
                      </button>
                    ))}
                  </nav>
                  <label className="search-box">
                    <Icon name="search" size={15} />
                    <input
                      ref={searchRef}
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="搜索任务、队友…"
                      aria-label="搜索任务"
                    />
                    {query ? (
                      <button
                        type="button"
                        aria-label="清空搜索"
                        onClick={() => setQuery("")}
                      >
                        <Icon name="close" size={13} />
                      </button>
                    ) : (
                      <kbd>⌘ K</kbd>
                    )}
                  </label>
                </div>
                <div className="task-list">
                  {tasks.length ? (
                    tasks.map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        onOpen={() => openTask(task.id)}
                      />
                    ))
                  ) : (
                    <EmptyState
                      title={
                        snapshot.tasks.length
                          ? "没有匹配的任务"
                          : "第一份协作，从你开始"
                      }
                    >
                      <p>
                        {snapshot.tasks.length
                          ? "试试其他关键词，或调整筛选条件。"
                          : "描述一个具体目标，再选择一位 Agent。"}
                      </p>
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => {
                          if (snapshot.tasks.length) {
                            setFilter("all");
                            setQuery("");
                            setMine(false);
                          } else focusComposer();
                        }}
                      >
                        {snapshot.tasks.length ? "清除筛选" : "创建第一个任务"}
                      </button>
                    </EmptyState>
                  )}
                </div>
                <div className="task-list-footer">
                  <span>
                    {tasks.length} 项任务{mine ? " · 我发起的" : " · 团队共享"}
                  </span>
                  <span>
                    <Icon name="shield" size={12} />
                    代码任务按项目串行执行
                  </span>
                </div>
              </section>
            )}
            {view === "agents" && (
              <section className="agents-grid">
                {snapshot.agents.length ? (
                  snapshot.agents.map((agent, index) => (
                    <article key={agent.id} className="agent-detail-card">
                      <div className="agent-card-top">
                        <Avatar name={agent.ownerName} index={index} />
                        <span
                          className={`badge tone-${agentStates[agent.status].tone}`}
                        >
                          <span className="status-dot" />
                          {agentStates[agent.status].label}
                        </span>
                      </div>
                      <h2>{agent.displayName}</h2>
                      <p>{agent.ownerName} 共享的本地编码 Agent</p>
                      <dl>
                        <div>
                          <dt>最近连接</dt>
                          <dd>{timeLabel(agent.lastSeenAt, true)}</dd>
                        </div>
                        <div>
                          <dt>当前任务</dt>
                          <dd>
                            {snapshot.tasks
                              .find(
                                (task) =>
                                  task.selectedAgentId === agent.id &&
                                  ["running", "waiting_for_owner"].includes(
                                    task.status,
                                  ),
                              )
                              ?.prompt.split("\n")[0] ?? "暂无执行中的任务"}
                          </dd>
                        </div>
                      </dl>
                      <button
                        type="button"
                        className="button button-secondary"
                        disabled={agent.status === "paused"}
                        onClick={() => chooseAgent(agent.id)}
                      >
                        交给这位 Agent
                        <Icon name="arrow" size={15} />
                      </button>
                      {!simulated && agent.ownerMemberId === snapshot.me.id && (
                        <button
                          type="button"
                          className="button button-quiet"
                          disabled={busy || agent.status === "busy"}
                          onClick={() => toggleAgent(agent)}
                        >
                          <Icon
                            name={agent.status === "paused" ? "play" : "pause"}
                            size={14}
                          />
                          {agent.status === "paused" ? "恢复共享" : "暂停共享"}
                        </button>
                      )}
                    </article>
                  ))
                ) : (
                  <EmptyState
                    icon="agents"
                    title="团队的第一位 Agent，等你接入"
                  >
                    <p>连接本地 Runner 后，团队就能开始派发任务。</p>
                  </EmptyState>
                )}
                <button
                  type="button"
                  className="add-agent-card"
                  onClick={() => setModal("connect")}
                >
                  <span>
                    <Icon name="plus" size={24} />
                  </span>
                  <strong>接入我的 Agent</strong>
                  <p>让团队多一份能力</p>
                </button>
              </section>
            )}
            {view === "activity" && (
              <section className="activity-page">
                <div className="section-heading">
                  <h2>最近的协作记录</h2>
                  <span className="muted small">按时间倒序</span>
                </div>
                {messages.length ? (
                  messages.map((message) => (
                    <button
                      type="button"
                      className="activity-row"
                      key={message.id}
                      onClick={() => openTask(message.taskId)}
                    >
                      <Avatar
                        name={message.memberName}
                        small
                        index={message.role === "agent" ? 1 : 0}
                      />
                      <span>
                        <strong>
                          {message.role === "system"
                            ? "系统"
                            : message.memberName}
                          <small>
                            {message.role === "agent"
                              ? "返回执行记录"
                              : message.role === "member"
                                ? "补充了项目上下文"
                                : "更新了任务"}
                          </small>
                        </strong>
                        <p>{message.content}</p>
                        <span className="activity-task-link">
                          {message.task.prompt.split("\n")[0]}
                        </span>
                      </span>
                      <time>{timeLabel(message.createdAt, true)}</time>
                    </button>
                  ))
                ) : (
                  <EmptyState icon="activity" title="记录，随协作而来">
                    <p>发起一项任务后，这里会汇集团队的需求、讨论和结果。</p>
                  </EmptyState>
                )}
              </section>
            )}
            <footer className="workspace-footer">
              <span>Made for people. Powered by your agents.</span>
              <span>
                <span className="small-dot" />
                Team Agent Workbench
              </span>
            </footer>
          </main>
          <aside className="right-rail">
            <section className="team-section">
              <div className="section-heading">
                <h2>你的 Agent 队友</h2>
                <span className="count">{snapshot.agents.length}</span>
              </div>
              <p className="rail-caption">
                <span className="live-dot" />
                {online} 位在线待命<span>点击选择执行者</span>
              </p>
              <div className="agent-roster">
                {snapshot.agents.map((agent, index) => (
                  <AgentTile
                    key={agent.id}
                    agent={agent}
                    index={index}
                    selected={agentId === agent.id}
                    onChoose={() => chooseAgent(agent.id)}
                  />
                ))}
              </div>
              <button
                type="button"
                className="invite-agent"
                onClick={() => setModal("connect")}
              >
                <Icon name="plus" size={15} />
                接入我的 Agent
              </button>
            </section>
            <section className="execution-card">
              <div className="section-label">PROJECT PULSE</div>
              <div className="execution-status">
                <span
                  className={running ? "pulse-orbit is-running" : "pulse-orbit"}
                >
                  <Icon name={running ? "activity" : "check"} size={19} />
                </span>
                <div>
                  <strong>
                    {running?.status === "waiting_for_owner"
                      ? "等待所有者处理"
                      : running
                        ? "协作正在进行"
                        : "准备好，开始下一件事"}
                  </strong>
                  <p>
                    {running
                      ? `${running.selectedAgentName} · ${taskStates[running.status].label}`
                      : "执行位空闲，等待好想法"}
                  </p>
                </div>
              </div>
              {running && (
                <button
                  type="button"
                  className="running-task-link"
                  onClick={() => openTask(running.id)}
                >
                  {running.prompt.split("\n")[0]}
                  <Icon name="arrow" size={15} />
                </button>
              )}
              <div className="project-branch">
                <Icon name="branch" size={14} />
                <code>{snapshot.settings.sharedBranch}</code>
              </div>
            </section>
            <section className="recent-section">
              <div className="section-heading">
                <h2>最近动态</h2>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setView("activity")}
                >
                  全部
                  <Icon name="arrow" size={13} />
                </button>
              </div>
              {[...snapshot.tasks]
                .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
                .slice(0, 3)
                .map((task) => (
                  <button
                    type="button"
                    className="recent-item"
                    key={task.id}
                    onClick={() => openTask(task.id)}
                  >
                    <span
                      className={`timeline-dot tone-${taskStates[task.status].tone}`}
                    />
                    <span>
                      <strong>
                        {task.selectedAgentOwnerName}
                        <small>{taskStates[task.status].label}</small>
                      </strong>
                      <p>{task.prompt.split("\n")[0]}</p>
                      <time>{timeLabel(task.updatedAt, true)}</time>
                    </span>
                  </button>
                ))}
              {!snapshot.tasks.length && (
                <p className="muted small">团队的第一条动态，从新任务开始。</p>
              )}
            </section>
            <div className="trust-card">
              <Icon name="shield" size={21} />
              <strong>能力共享，凭据留在本地。</strong>
              <p>
                Codex 与 Git 凭据留在 Agent
                所有者的电脑。任务结果与执行记录供团队共同审阅。
              </p>
              <p>
                运行依赖 Runner 所在设备保持在线；关闭浏览器不会停止
                Runner，关闭其所在电脑则会中断执行。
              </p>
              <span>LOCAL AGENTS. SHARED PROGRESS.</span>
            </div>
          </aside>
        </div>
      </div>
      {notice && (
        <div className="toast" role="status">
          <Icon name="check" size={16} />
          {notice}
        </div>
      )}
      {selectedTask && (
        <TaskDetail
          key={selectedTask.id}
          task={selectedTask}
          snapshot={snapshot}
          simulated={simulated}
          onClose={closeTask}
          onRefresh={refresh}
          onFollowup={(task, feedback) => {
            const draft = followupDraft(task, feedback);
            const nextPrompt = prompt.trim()
              ? `${prompt}\n\n${draft.prompt}`
              : draft.prompt;
            const nextContext = goalDraft.context.trim()
              ? `${goalDraft.context}\n\n${draft.goal.context}`
              : draft.goal.context;
            setPrompt(nextPrompt);
            setGoalDraft({
              ...draft.goal,
              context: nextContext,
              criteria: criteriaLines(
                `${goalDraft.criteria}\n${draft.goal.criteria}`,
              ).join("\n"),
            });
            setAgentId(task.selectedAgentId);
            setNotice(
              nextPrompt.length > 20000 || nextContext.length > 10000
                ? "完整反馈和背景已带入草稿。内容超出提交上限，请在编辑区删减后提交。"
                : prompt.trim()
                  ? "反馈已追加到现有草稿，请核对目标与验收标准。"
                  : "已带入上次结果与本次反馈，请确认新的验收标准后提交。",
            );
            closeTask();
            focusComposer();
            return true;
          }}
        />
      )}
      {selectedId && !selectedTask && (
        <Modal title="任务链接" onClose={closeTask}>
          <EmptyState title="这里找不到这项任务">
            <p>任务可能属于另一个工作空间，或演示数据已经重置。</p>
            <button
              type="button"
              className="button button-secondary"
              onClick={closeTask}
            >
              返回工作台
            </button>
          </EmptyState>
        </Modal>
      )}
      {modal === "connect" && (
        <ConnectModal simulated={simulated} onClose={() => setModal(null)} />
      )}
      {modal === "settings" && (
        <SettingsModal
          snapshot={snapshot}
          simulated={simulated}
          onClose={() => setModal(null)}
          onRefresh={refresh}
        />
      )}
      {modal === "reset" && (
        <Modal title="重置演示工作空间" onClose={() => setModal(null)}>
          <div className="management-content">
            <h2>重新开始一轮体验？</h2>
            <p className="muted">
              将删除当前浏览器中的模拟任务和讨论，恢复初始示例。不会影响真实仓库或团队数据。
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setModal(null)}
              >
                保留当前演示
              </button>
              <button
                type="button"
                className="button button-primary"
                onClick={() => {
                  resetDemo();
                  setPrompt("");
                  setGoalDraft({ ...emptyGoalDraft });
                  setAgentId("");
                  setFilter("all");
                  setQuery("");
                  setMine(false);
                  closeTask();
                  setModal(null);
                  setNotice("演示已恢复，随时开始新一轮协作。");
                }}
              >
                重置演示
              </button>
            </div>
          </div>
        </Modal>
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
  const onUnauthorized = useCallback(() => setState({ kind: "claim" }), []);
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
        <Logo />
        <span className="loading-line" />
        <p>正在连接你的团队…</p>
      </main>
    );
  if (state.kind === "claim") {
    const search = new URLSearchParams(location.search);
    return (
      <AccessScreen
        token={search.get("token") ?? search.get("invite") ?? ""}
        onClaimed={load}
      />
    );
  }
  if (state.kind === "error")
    return (
      <main className="loading-screen">
        <Logo />
        <h1>暂时没能连接工作台</h1>
        <p>{state.message}</p>
        <button type="button" className="button button-primary" onClick={load}>
          <Icon name="refresh" size={16} />
          重新连接
        </button>
      </main>
    );
  return <Workspace initial={state.snapshot} onUnauthorized={onUnauthorized} />;
}
