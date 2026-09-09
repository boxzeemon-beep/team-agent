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
  { id: "overview", label: "Workbench", icon: "grid" },
  { id: "tasks", label: "All tasks", icon: "tasks" },
  { id: "agents", label: "Team Agents", icon: "agents" },
  { id: "activity", label: "Activity", icon: "activity" },
];
const templates = [
  {
    label: "Fix a bug",
    icon: "code",
    text: "Fix the loss of login state after a page refresh.\nReproduce the issue, add regression tests, and describe the changes and verification results.",
    criteria:
      "A valid session survives a page refresh\nProtected pages cannot be accessed after signing out\nAutomated tests cover both behaviors",
  },
  {
    label: "Improve the experience",
    icon: "spark",
    text: "Improve the empty state.\nProvide a clear next action, support keyboard navigation, and check the mobile layout.",
    criteria:
      "An empty task list offers a clear next action\nAll primary actions are accessible by keyboard\nThere is no horizontal overflow at 390px",
  },
  {
    label: "Add key tests",
    icon: "terminal",
    text: "Add tests for API timeouts and retries.\nCover successful responses, network failures, and exhausted retries, and report the test results.",
    criteria:
      "Tests cover successful responses and network failures\nRetries have a fixed limit and return a clear error when exhausted\nNew tests and existing regression tests pass",
  },
] as const;
const filters: { id: TaskFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "attention", label: "Needs attention" },
  { id: "completed", label: "Completed" },
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
        <small>{agent.ownerName}’s local Agent</small>
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
    document.title = `${navigation.find((item) => item.id === view)?.label ?? "Workbench"} · Team Agent`;
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
      ? "Goals are limited to 20,000 characters. Your full draft is saved; shorten it before submitting."
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
        setRefreshError(
          "Cannot sync right now. Showing the last snapshot while reconnecting.",
        );
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
      setNotice(
        "Goal sent to the Agent. Open its details to follow progress and review evidence.",
      );
      openTask(task.id);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Submission failed. Your draft has been kept.",
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
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not update sharing status.",
      );
    } finally {
      setBusy(false);
    }
  }
  const projectName = snapshot.settings.projectName.replace(/^\[DEMO\]\s*/, "");
  const launchHint = !selectedAgent
    ? "Choose an Agent to run this goal."
    : selectedAgent.status === "offline"
      ? "This Agent is offline. The goal will wait for a connection, or you can reassign it."
      : selectedAgent.status === "busy" || running
        ? "Coding tasks run one at a time per project. This goal will join the queue."
        : "The Agent is ready to start your goal.";
  const title =
    view === "overview"
      ? "Give your team a goal."
      : view === "tasks"
        ? "Follow every step."
        : view === "agents"
          ? "Meet your team’s Agents."
          : "Keep the work in context.";
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Skip to main content
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
            <small>{simulated ? "Demo workspace" : "Team workspace"}</small>
          </span>
          <Icon name="down" size={14} />
        </button>
        <div className="nav-label">Workspace</div>
        <nav aria-label="Main navigation">
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
              Your Agent.
              <br />
              Your whole team.
            </strong>
            <p>
              Connect your local Agent
              <br />
              and help your team build.
            </p>
            <button type="button" onClick={() => setModal("connect")}>
              Connect Agent <Icon name="arrow" size={14} />
            </button>
          </div>
          <a
            className="nav-item"
            href="https://github.com/boxzeemon-beep/team-agent/blob/main/docs/getting-started.md"
            target="_blank"
            rel="noreferrer"
          >
            <Icon name="book" size={17} />
            <span>Setup and usage guide</span>
            <Icon name="up" size={14} />
          </a>
          <button
            type="button"
            className="nav-item"
            onClick={() => setModal("settings")}
          >
            <Icon name="settings" size={18} />
            <span>Project settings</span>
          </button>
          <div className="user-card">
            <Avatar name={snapshot.me.name} small />
            <span>
              <strong>{snapshot.me.name}</strong>
              <small>
                {snapshot.me.isAdmin
                  ? "Administrator"
                  : simulated
                    ? "Demo visitor"
                    : "Team member"}
              </small>
            </span>
            <span className="version-label">Preview</span>
          </div>
        </div>
      </aside>
      <div className="workspace-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              type="button"
              className="breadcrumb-project"
              aria-label={`Project settings: ${projectName}`}
              title={`${projectName} · Project settings`}
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
                ? "Browser demo"
                : connected && !refreshError
                  ? "Live"
                  : "Reconnecting"}
            </span>
            <button
              type="button"
              className="button button-secondary button-small"
              onClick={() => setModal("connect")}
            >
              <Icon name="plus" size={15} />
              Connect Agent
            </button>
          </div>
        </header>
        {simulated && (
          <div className="demo-bar">
            <span className="demo-tag">DEMO</span>
            <p>
              {isStaticDemo
                ? "Explore freely. All Agents, execution steps, and evidence are simulated."
                : "Demo mode: execution and evidence are simulated. No Codex or Git operations run."}
            </p>
            {isStaticDemo && (
              <button type="button" onClick={() => setModal("reset")}>
                <Icon name="refresh" size={13} />
                Reset demo
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
                    ? "Add context and acceptance criteria. Let an Agent implement, verify, and deliver."
                    : view === "tasks"
                      ? "From a clear request to a result you can review."
                      : view === "agents"
                        ? "Use a teammate’s local Agent. Credentials stay with its owner."
                        : "Requests, discussions, and results form your team’s shared context."}
                </p>
              </div>
              {view !== "overview" && (
                <button
                  type="button"
                  className="button button-primary"
                  onClick={focusComposer}
                >
                  <Icon name="plus" size={16} />
                  New task
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
                  Try again
                </button>
              </div>
            )}
            {error && (
              <div className="alert alert-error" role="alert">
                {error}
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Dismiss error"
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
                    <label htmlFor="task-prompt">
                      What would you like to build?
                    </label>
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
                    placeholder="Describe the goal, constraints, and what success looks like…"
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
                            ? "Append this example to your draft"
                            : "Use this example"
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
                        aria-label="Select an Agent"
                        value={agentId}
                        onChange={(event) => setAgentId(event.target.value)}
                      >
                        <option value="">Choose an Agent</option>
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
                        ? "Submitting…"
                        : selectedAgent?.status === "offline"
                          ? "Queue for Agent"
                          : running || selectedAgent?.status === "busy"
                            ? "Add to queue"
                            : "Send to Agent"}
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
                        : "Ctrl / ⌘ + Enter to submit"}
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
                        <small>Active</small>
                      </strong>
                      <p>
                        {running
                          ? "An Agent is working"
                          : "Follow work as it happens"}
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
                        <small>Needs attention</small>
                      </strong>
                      <p>
                        {attention.length
                          ? "Tasks need your attention"
                          : "Nothing needs attention"}
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
                        <small>Completed</small>
                      </strong>
                      <p>Every delivery includes evidence</p>
                    </span>
                    <Icon name="chevron" size={13} />
                  </button>
                </div>
              </>
            )}
            {(view === "overview" || view === "tasks") && (
              <section className="task-section" aria-label="Team tasks">
                <div className="section-heading">
                  <h2>
                    {view === "overview" ? "Team tasks" : "Task history"}
                    <span className="count">{snapshot.tasks.length}</span>
                  </h2>
                  <label className="mine-filter">
                    <input
                      type="checkbox"
                      checked={mine}
                      onChange={(event) => setMine(event.target.checked)}
                    />
                    Requested by me
                  </label>
                </div>
                <div className="task-toolbar">
                  <nav
                    className="filter-tabs"
                    aria-label="Filter tasks by status"
                  >
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
                      placeholder="Search tasks or teammates…"
                      aria-label="Search tasks"
                    />
                    {query ? (
                      <button
                        type="button"
                        aria-label="Clear search"
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
                          ? "No matching tasks"
                          : "Start your first task"
                      }
                    >
                      <p>
                        {snapshot.tasks.length
                          ? "Try another search or adjust the filters."
                          : "Describe a specific goal, then choose an Agent."}
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
                        {snapshot.tasks.length
                          ? "Clear filters"
                          : "Create your first task"}
                      </button>
                    </EmptyState>
                  )}
                </div>
                <div className="task-list-footer">
                  <span>
                    {tasks.length} {tasks.length === 1 ? "task" : "tasks"}
                    {mine ? " · Requested by me" : " · Shared with the team"}
                  </span>
                  <span>
                    <Icon name="shield" size={12} />
                    One coding task at a time per project
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
                      <p>Local coding Agent shared by {agent.ownerName}</p>
                      <dl>
                        <div>
                          <dt>Last connected</dt>
                          <dd>{timeLabel(agent.lastSeenAt, true)}</dd>
                        </div>
                        <div>
                          <dt>Current task</dt>
                          <dd>
                            {snapshot.tasks
                              .find(
                                (task) =>
                                  task.selectedAgentId === agent.id &&
                                  ["running", "waiting_for_owner"].includes(
                                    task.status,
                                  ),
                              )
                              ?.prompt.split("\n")[0] ?? "No active task"}
                          </dd>
                        </div>
                      </dl>
                      <button
                        type="button"
                        className="button button-secondary"
                        disabled={agent.status === "paused"}
                        onClick={() => chooseAgent(agent.id)}
                      >
                        Use this Agent
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
                          {agent.status === "paused"
                            ? "Resume sharing"
                            : "Pause sharing"}
                        </button>
                      )}
                    </article>
                  ))
                ) : (
                  <EmptyState
                    icon="agents"
                    title="Connect your team’s first Agent"
                  >
                    <p>
                      Connect a local Runner so your team can start assigning
                      tasks.
                    </p>
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
                  <strong>Connect Agent</strong>
                  <p>Bring your Agent to the team</p>
                </button>
              </section>
            )}
            {view === "activity" && (
              <section className="activity-page">
                <div className="section-heading">
                  <h2>Recent activity</h2>
                  <span className="muted small">Newest first</span>
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
                            ? "System"
                            : message.memberName}
                          <small>
                            {message.role === "agent"
                              ? "returned a result"
                              : message.role === "member"
                                ? "added project context"
                                : "updated the task"}
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
                  <EmptyState
                    icon="activity"
                    title="Your team’s work will appear here"
                  >
                    <p>
                      Create a task to start a shared record of requests,
                      discussions, and results.
                    </p>
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
                <h2>Your Agent teammates</h2>
                <span className="count">{snapshot.agents.length}</span>
              </div>
              <p className="rail-caption">
                <span className="live-dot" />
                {online} available<span>Select an Agent</span>
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
                Connect Agent
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
                      ? "Waiting for the owner"
                      : running
                        ? "Work in progress"
                        : "Ready for the next goal"}
                  </strong>
                  <p>
                    {running
                      ? `${running.selectedAgentName} · ${taskStates[running.status].label}`
                      : "No task is running. What’s next?"}
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
                <h2>Recent updates</h2>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setView("activity")}
                >
                  All
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
                <p className="muted small">
                  Create a task to start your team’s activity feed.
                </p>
              )}
            </section>
            <div className="trust-card">
              <Icon name="shield" size={21} />
              <strong>Shared capability. Local credentials.</strong>
              <p>
                Codex and Git credentials stay on the Agent owner’s computer.
                Results and execution records are shared with the team.
              </p>
              <p>
                The Runner’s device must stay online. Closing the browser does
                not stop it; shutting down its computer interrupts execution.
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
                ? "Your full feedback and context are in the draft. Shorten the content to meet the submission limits."
                : prompt.trim()
                  ? "Feedback was added to your existing draft. Check the goal and acceptance criteria."
                  : "The previous result and your feedback are in the draft. Confirm the new acceptance criteria before submitting.",
            );
            closeTask();
            focusComposer();
            return true;
          }}
        />
      )}
      {selectedId && !selectedTask && (
        <Modal title="Task link" onClose={closeTask}>
          <EmptyState title="Task not found">
            <p>
              The task may belong to another workspace, or the demo may have
              been reset.
            </p>
            <button
              type="button"
              className="button button-secondary"
              onClick={closeTask}
            >
              Back to workbench
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
        <Modal title="Reset demo workspace" onClose={() => setModal(null)}>
          <div className="management-content">
            <h2>Start the demo again?</h2>
            <p className="muted">
              This removes simulated tasks and discussions in this browser and
              restores the initial examples. Real repositories and team data are
              unaffected.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setModal(null)}
              >
                Keep current demo
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
                  setNotice(
                    "The demo has been reset. You’re ready to explore again.",
                  );
                }}
              >
                Reset demo
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
          message:
            cause instanceof Error
              ? cause.message
              : "Could not load the workspace.",
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
        <p>Connecting to your team…</p>
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
        <h1>Could not connect to the workspace</h1>
        <p>{state.message}</p>
        <button type="button" className="button button-primary" onClick={load}>
          <Icon name="refresh" size={16} />
          Reconnect
        </button>
      </main>
    );
  return <Workspace initial={state.snapshot} onUnauthorized={onUnauthorized} />;
}
