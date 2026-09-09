import type {
  Agent,
  DashboardSnapshot,
  Task,
  TaskMessage,
} from "@team-agent/shared";
import {
  canCompleteGoal,
  createTaskSchema,
  goalBriefSchema,
  goalWorkflowSchema,
  initialGoalWorkflow,
} from "@team-agent/shared";
import { z } from "zod";
import {
  advanceSimulatedGoal,
  createDemoSnapshot,
  staticDemoResult,
} from "./static-demo.js";

export const DEMO_STORAGE_KEY = "team-agent:browser-demo:v3";
const VERSION = 3;
const text = z.string().max(500_000);
const id = z.string().min(1).max(200);
const date = z.string().datetime();
const integer = z.number().int().nonnegative();
const messageSchema = z.object({
  id,
  sequence: integer,
  taskId: id,
  memberId: id.nullable(),
  memberName: text,
  role: z.enum(["member", "agent", "system"]),
  content: text,
  createdAt: date,
});
const taskSchema = z.object({
  id,
  requesterMemberId: id,
  requesterName: text,
  selectedAgentId: id,
  selectedAgentName: text,
  selectedAgentOwnerName: text,
  status: z.enum([
    "queued",
    "waiting_for_agent",
    "running",
    "waiting_for_owner",
    "completed",
    "needs_attention",
    "canceled",
  ]),
  prompt: text,
  progress: text,
  result: text,
  diff: text,
  testOutput: text,
  commitSha: text,
  error: text,
  assignedThroughMessageSequence: integer,
  createdAt: date,
  updatedAt: date,
  messages: z.array(messageSchema).max(500),
  brief: goalBriefSchema.optional(),
  workflow: goalWorkflowSchema.optional(),
  runId: id.optional(),
});
const savedSchema = z.object({
  version: z.literal(VERSION),
  sequence: integer,
  snapshot: z.object({
    me: z.object({
      id: z.literal("static-demo-visitor"),
      name: z.literal("试玩访客"),
      isAdmin: z.literal(false),
      createdAt: date,
    }),
    settings: z.object({
      projectName: text,
      repositoryUrl: z.literal("simulated://browser-only"),
      baseBranch: text,
      sharedBranch: text,
      testCommand: text,
    }),
    agents: z
      .array(
        z.object({
          id,
          ownerMemberId: id,
          ownerName: text,
          displayName: text,
          status: z.enum(["online", "busy", "offline", "paused"]),
          lastContextMessageSequence: integer,
          lastSeenAt: date.nullable(),
        }),
      )
      .length(3),
    tasks: z.array(taskSchema).max(100),
  }),
});

type DemoStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export class DemoApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export interface DemoEngineOptions {
  storage?: DemoStorage;
  now?: () => number;
  queueDelayMs?: number;
  stageDelayMs?: number;
}

function browserStorage(): DemoStorage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * Browser-only state machine; no network, Codex, Git or React dependency.
 * One project timer serializes work across all Agents. Timers are never saved:
 * after a refresh, an interrupted run safely re-enters the queue.
 */
export function createDemoEngine(options: DemoEngineOptions = {}) {
  const storage = options.storage ?? browserStorage();
  const now = options.now ?? Date.now;
  const queueDelay = options.queueDelayMs ?? 700;
  const stageDelay = options.stageDelayMs ?? 1_600;
  const listeners = new Set<() => void>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  let snapshot: DashboardSnapshot = createDemoSnapshot(now());
  let sequence = 0;

  function removeSavedState() {
    try {
      storage?.removeItem(DEMO_STORAGE_KEY);
    } catch {
      // Storage failure affects persistence, never the in-memory workflow.
    }
  }

  try {
    const raw = storage?.getItem(DEMO_STORAGE_KEY);
    if (raw) {
      if (raw.length > 4_000_000) throw new Error("oversized_demo_state");
      const saved = savedSchema.parse(JSON.parse(raw));
      const agents = new Set(saved.snapshot.agents.map((agent) => agent.id));
      const taskIds = new Set(saved.snapshot.tasks.map((task) => task.id));
      if (
        agents.size !== 3 ||
        taskIds.size !== saved.snapshot.tasks.length ||
        saved.snapshot.tasks.some(
          (task) =>
            !agents.has(task.selectedAgentId) ||
            (task.brief?.mode === "verified" &&
              (!task.runId ||
                !task.workflow ||
                task.workflow.maxIterations !== task.brief.maxIterations ||
                (task.status === "completed" &&
                  !canCompleteGoal(task.brief, task.workflow)))) ||
            task.messages.some((message) => message.taskId !== task.id),
        )
      )
        throw new Error("invalid_demo_relationships");
      snapshot = {
        ...saved.snapshot,
        tasks: saved.snapshot.tasks.map(
          ({ brief, workflow, runId, ...task }) => ({
            ...task,
            ...(brief ? { brief } : {}),
            ...(workflow ? { workflow } : {}),
            ...(runId ? { runId } : {}),
          }),
        ),
      };
      sequence = saved.sequence;
    }
  } catch {
    removeSavedState();
  }
  const maxSequence = () =>
    Math.max(
      0,
      ...snapshot.tasks.flatMap((task) =>
        task.messages.map((message) => message.sequence),
      ),
    );
  sequence = Math.max(sequence, maxSequence());

  function persist() {
    try {
      storage?.setItem(
        DEMO_STORAGE_KEY,
        JSON.stringify({ version: VERSION, sequence, snapshot }),
      );
    } catch {
      // Quota and privacy restrictions must not break the demonstration.
    }
  }

  function notify() {
    for (const listener of listeners) listener();
  }

  function changed() {
    persist();
    notify();
  }

  function addMessage(
    task: Task,
    role: TaskMessage["role"],
    content: string,
  ): TaskMessage {
    const message: TaskMessage = {
      id: `demo-message-${++sequence}`,
      sequence,
      taskId: task.id,
      memberId: role === "member" ? snapshot.me.id : null,
      memberName:
        role === "member"
          ? snapshot.me.name
          : role === "agent"
            ? task.selectedAgentName
            : "演示系统",
      role,
      content,
      createdAt: new Date(now()).toISOString(),
    };
    task.messages.push(message);
    task.updatedAt = message.createdAt;
    return message;
  }

  let recovered = false;
  for (const agent of snapshot.agents) {
    if (agent.status === "busy") agent.status = "online";
  }
  for (const task of snapshot.tasks) {
    if (task.status === "running" || task.status === "waiting_for_owner") {
      const agent = snapshot.agents.find(
        (candidate) => candidate.id === task.selectedAgentId,
      );
      task.status = agent?.status === "online" ? "queued" : "waiting_for_agent";
      task.progress = "页面已恢复，未完成的模拟任务已安全重新排队。";
      addMessage(task, "system", task.progress);
      recovered = true;
    }
  }
  if (recovered) persist();

  function setTimer(callback: () => void, delay: number) {
    timer = setTimeout(() => {
      timer = undefined;
      if (!disposed) callback();
    }, delay);
  }

  function releaseAgent(task: Task) {
    const agent = snapshot.agents.find(
      (candidate) => candidate.id === task.selectedAgentId,
    );
    if (agent?.status === "busy") agent.status = "online";
  }

  function runStage(taskId: string, stage: number) {
    const task = snapshot.tasks.find((candidate) => candidate.id === taskId);
    if (task?.status !== "running") {
      schedule();
      return;
    }
    if (task.brief?.mode === "verified" && task.workflow) {
      task.workflow = advanceSimulatedGoal(task.brief, task.workflow);
      task.progress = `【模拟】${task.workflow.phase} · 第 ${task.workflow.iteration}/${task.workflow.maxIterations} 轮，所有证据均为预置示例。`;
      if (
        ["reviewing", "revising", "publishing", "blocked"].includes(
          task.workflow.phase,
        )
      ) {
        task.diff = staticDemoResult.diff;
        task.testOutput = staticDemoResult.testOutput;
      }
      addMessage(task, "agent", task.progress);
      if (task.workflow.phase === "blocked") {
        task.status = "needs_attention";
        task.error =
          "【模拟受阻】审查发现问题，已达到约定轮次上限；没有将未通过的目标标为完成。";
        addMessage(task, "system", task.error);
        releaseAgent(task);
        changed();
        schedule();
        return;
      }
      if (task.workflow.phase !== "completed") {
        changed();
        setTimer(() => runStage(taskId, stage + 1), stageDelay);
        return;
      }
      if (!canCompleteGoal(task.brief, task.workflow))
        throw new Error("Invalid simulated goal completion");
    } else if (stage < 2) {
      task.progress =
        stage === 0
          ? "模拟 2/3 · 展示预置变更，保留任务对话与上下文。"
          : "模拟 3/3 · 展示固定测试样例，准备可审查记录。";
      addMessage(task, "agent", task.progress);
      changed();
      setTimer(() => runStage(taskId, stage + 1), stageDelay);
      return;
    }
    task.status = "completed";
    task.progress = "模拟流程已完成 · 请审查固定示例，不代表已实现输入需求。";
    Object.assign(task, staticDemoResult);
    task.error = "";
    addMessage(task, "agent", task.result);
    const agent = snapshot.agents.find(
      (candidate) => candidate.id === task.selectedAgentId,
    );
    if (agent)
      agent.lastContextMessageSequence = task.assignedThroughMessageSequence;
    releaseAgent(task);
    changed();
    schedule();
  }

  function schedule() {
    if (disposed || timer !== undefined) return;
    if (snapshot.tasks.some((task) => task.status === "running")) return;
    const next = snapshot.tasks
      .filter(
        (task) =>
          task.status === "queued" &&
          snapshot.agents.some(
            (agent) =>
              agent.id === task.selectedAgentId && agent.status === "online",
          ),
      )
      .sort(
        (a, b) =>
          (a.messages[0]?.sequence ?? 0) - (b.messages[0]?.sequence ?? 0),
      )[0];
    if (!next) return;
    setTimer(() => {
      // A task can be canceled or reassigned during its visible queue stage.
      if (next.status !== "queued") {
        schedule();
        return;
      }
      const agent = snapshot.agents.find(
        (candidate) => candidate.id === next.selectedAgentId,
      );
      if (agent?.status !== "online") {
        next.status = "waiting_for_agent";
        changed();
        schedule();
        return;
      }
      next.status = "running";
      next.progress = next.workflow
        ? `【模拟】${next.workflow.phase} · 第 ${next.workflow.iteration}/${next.workflow.maxIterations} 轮；恢复同一执行记录。`
        : "模拟 1/3 · 同步项目上下文，独占当前项目执行通道。";
      next.assignedThroughMessageSequence = sequence;
      agent.status = "busy";
      agent.lastSeenAt = new Date(now()).toISOString();
      addMessage(next, "agent", next.progress);
      changed();
      setTimer(() => runStage(next.id, 0), stageDelay);
    }, queueDelay);
  }

  function findAgent(value: unknown): Agent {
    const agent = snapshot.agents.find((candidate) => candidate.id === value);
    if (!agent || agent.status === "paused")
      throw new DemoApiError("请选择一位可用的演示 Agent。", 400);
    return agent;
  }

  function requiredText(value: unknown, label: string): string {
    if (
      typeof value !== "string" ||
      !value.trim() ||
      value.trim().length > 20_000
    )
      throw new DemoApiError(`${label}需为 1–20,000 个字符。`, 400);
    return value.trim();
  }

  function enqueue(task: Task, agent: Agent) {
    task.status = agent.status === "offline" ? "waiting_for_agent" : "queued";
    task.progress =
      task.status === "waiting_for_agent"
        ? `${agent.displayName} 当前离线，可重新指派给在线 Agent。`
        : "已加入模拟队列 · 同一时间只执行一项任务。";
    task.selectedAgentId = agent.id;
    task.selectedAgentName = agent.displayName;
    task.selectedAgentOwnerName = agent.ownerName;
  }

  function request<T>(path: string, init?: RequestInit): T {
    if (disposed) throw new DemoApiError("演示会话已关闭，请刷新页面。", 409);
    const method = (init?.method ?? "GET").toUpperCase();
    if (method === "GET" && path === "/api/snapshot")
      return structuredClone(snapshot) as T;
    if (method !== "POST")
      throw new DemoApiError("浏览器演示不支持此操作。", 403);
    const match =
      /^\/api\/tasks\/([^/]+)\/(messages|cancel|reassign|retry)$/.exec(path);
    if (path !== "/api/tasks" && !match)
      throw new DemoApiError(
        "管理、邀请与 Agent 接入仅在真实 Coordinator 中可用。",
        403,
      );
    let body: Record<string, unknown> = {};
    if (init?.body !== undefined) {
      try {
        const parsed: unknown = JSON.parse(String(init.body));
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
          throw new Error("invalid_body");
        body = parsed as Record<string, unknown>;
      } catch {
        throw new DemoApiError("请求内容必须是 JSON 对象。", 400);
      }
    }
    if (path === "/api/tasks") {
      if (snapshot.tasks.length >= 100)
        throw new DemoApiError(
          "演示最多保存 100 项任务，请重置演示后继续。",
          409,
        );
      const prompt = requiredText(body.prompt, "任务描述");
      const parsed = createTaskSchema.safeParse({ ...body, prompt });
      if (!parsed.success)
        throw new DemoApiError(
          parsed.error.issues[0]?.message ?? "目标参数无效。",
          400,
        );
      const agent = findAgent(body.agentId);
      const createdAt = new Date(now()).toISOString();
      const task: Task = {
        id: `demo-task-${now()}-${++sequence}`,
        requesterMemberId: snapshot.me.id,
        requesterName: snapshot.me.name,
        selectedAgentId: agent.id,
        selectedAgentName: agent.displayName,
        selectedAgentOwnerName: agent.ownerName,
        status: "queued",
        prompt,
        progress: "",
        result: "",
        diff: "",
        testOutput: "",
        commitSha: "",
        error: "",
        assignedThroughMessageSequence: 0,
        createdAt,
        updatedAt: createdAt,
        messages: [],
        ...(parsed.data.brief ? { brief: parsed.data.brief } : {}),
        ...(parsed.data.brief?.mode === "verified"
          ? {
              workflow: initialGoalWorkflow(parsed.data.brief),
              runId: `simulated-run-${now()}-${sequence}`,
            }
          : {}),
      };
      enqueue(task, agent);
      addMessage(task, "member", prompt);
      addMessage(
        task,
        "system",
        "仅演示操作流程：你的输入会保存在此浏览器，完成后展示固定的可访问性示例；不会实现输入需求，也不会调用 Codex、Git 或测试命令。",
      );
      snapshot.tasks.unshift(task);
      changed();
      schedule();
      return structuredClone(task) as T;
    }
    const task = snapshot.tasks.find(
      (candidate) => candidate.id === match?.[1],
    );
    if (!task) throw new DemoApiError("找不到这项演示任务。", 404);
    const action = match?.[2];
    if (
      action !== "messages" &&
      task.requesterMemberId !== snapshot.me.id &&
      !snapshot.me.isAdmin
    )
      throw new DemoApiError("只有任务发布者可以管理这项任务。", 403);
    if (action === "messages") {
      if (task.messages.length >= 480)
        throw new DemoApiError("此演示任务的对话已达上限。", 409);
      const content = requiredText(body.content, "补充说明");
      const message = addMessage(task, "member", content);
      changed();
      return structuredClone(message) as T;
    }
    if (action === "cancel") {
      if (!["queued", "waiting_for_agent", "running"].includes(task.status))
        throw new DemoApiError("这项任务已结束，无法取消。", 409);
      if (task.status === "running") {
        clearTimeout(timer);
        timer = undefined;
        releaseAgent(task);
      }
      task.status = "canceled";
      task.progress = "模拟任务已取消，执行通道已释放。";
      addMessage(task, "system", task.progress);
    } else if (action === "reassign") {
      if (!["queued", "waiting_for_agent"].includes(task.status))
        throw new DemoApiError("仅排队或等待 Agent 的任务可以重新指派。", 409);
      const agent = findAgent(body.agentId);
      enqueue(task, agent);
      addMessage(task, "system", `已重新指派给 ${agent.displayName}。`);
    } else if (action === "retry") {
      if (task.status !== "needs_attention")
        throw new DemoApiError("仅需要处理的任务可以重新排队。", 409);
      const agent = findAgent(task.selectedAgentId);
      if (task.workflow && task.brief) {
        addMessage(
          task,
          "system",
          `【模拟历史证据】上一执行 ${task.runId}：${JSON.stringify({ workflow: task.workflow, result: task.result, diff: task.diff, testOutput: task.testOutput, error: task.error })}`,
        );
        task.workflow = initialGoalWorkflow(task.brief);
        task.runId = `simulated-run-${now()}-${++sequence}`;
      }
      enqueue(task, agent);
      task.error = "";
      task.result = "";
      task.diff = "";
      task.testOutput = "";
      task.commitSha = "";
      addMessage(
        task,
        "system",
        task.workflow
          ? "已按原验收约定重新排队并创建新执行记录；1 轮目标仍会停在审查未通过，2–3 轮目标将演示修订。"
          : "已重新排队。本次模拟将演示恢复成功；完成结果仍为固定示例。",
      );
    }
    changed();
    schedule();
    return structuredClone(task) as T;
  }

  schedule();
  return {
    request,
    getSnapshot: () => structuredClone(snapshot),
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    reset() {
      clearTimeout(timer);
      timer = undefined;
      removeSavedState();
      snapshot = createDemoSnapshot(now());
      sequence = maxSequence();
      notify();
    },
    dispose() {
      disposed = true;
      clearTimeout(timer);
      timer = undefined;
      listeners.clear();
    },
  };
}

export type DemoEngine = ReturnType<typeof createDemoEngine>;
