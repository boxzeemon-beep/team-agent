import {
  canCompleteGoal,
  type GoalBrief,
  type Task,
  type TaskMessage,
} from "@team-agent/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDemoEngine,
  DEMO_STORAGE_KEY,
  type DemoEngine,
} from "./demo-engine.js";

const online = "static-agent-luna";
const otherOnline = "static-agent-forge";
const offline = "static-agent-scout";
const post = (body?: unknown): RequestInit => ({
  method: "POST",
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const engines: DemoEngine[] = [];

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

function start(storage = memoryStorage()) {
  const engine = createDemoEngine({
    storage,
    queueDelayMs: 10,
    stageDelayMs: 20,
  });
  engines.push(engine);
  return engine;
}

function create(engine: DemoEngine, prompt: string, agentId = online) {
  return engine.request<Task>("/api/tasks", post({ prompt, agentId }));
}

function task(engine: DemoEngine, taskId: string) {
  const found = engine.getSnapshot().tasks.find((item) => item.id === taskId);
  if (!found) throw new Error(`Missing test task: ${taskId}`);
  return found;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-09T02:00:00.000Z"));
});

afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("browser demonstration state machine", () => {
  it("runs two separate implementation/test/review rounds and preserves the first failed review on refresh", () => {
    const storage = memoryStorage();
    const first = start(storage);
    const brief: GoalBrief = {
      mode: "verified",
      context: "Demo only",
      acceptanceCriteria: ["Keyboard opens details", "Focus visible"],
      maxIterations: 2,
    };
    const created = first.request<Task>(
      "/api/tasks",
      post({ prompt: "验收流程演示", agentId: online, brief }),
    );
    vi.advanceTimersByTime(70);
    const revised = task(first, created.id);
    expect(revised.workflow?.phase).toBe("revising");
    expect(revised.workflow?.reviews[0]?.verdict).toBe("revise");
    expect(revised.workflow?.reviews[0]?.checks.at(-1)?.status).toBe("fail");
    first.dispose();
    const restored = start(storage);
    expect(task(restored, created.id).runId).toBe(created.runId);
    expect(task(restored, created.id).workflow).toEqual(revised.workflow);
    vi.runAllTimers();
    const completed = task(restored, created.id);
    expect(completed.workflow?.reviews.map((review) => review.verdict)).toEqual(
      ["revise", "pass"],
    );
    expect(completed.status).toBe("completed");
    expect(canCompleteGoal(brief, completed.workflow)).toBe(true);
    expect(completed.commitSha).toBe("");
    expect(completed.testOutput).toContain("SIMULATED TEST OUTPUT");
    expect(
      completed.workflow?.reviews[1]?.checks.every((check) =>
        check.evidence.includes("SIMULATED EVIDENCE"),
      ),
    ).toBe(true);
  });

  it("rejects malformed goal contracts instead of silently treating them as direct tasks", () => {
    const engine = start();
    const valid = {
      mode: "verified",
      context: "",
      acceptanceCriteria: ["pass"],
      maxIterations: 2,
    };
    for (const brief of [
      { ...valid, acceptanceCriteria: [] },
      { ...valid, acceptanceCriteria: ["same", "same"] },
      { ...valid, maxIterations: 4 },
      { ...valid, context: "a".repeat(10001) },
    ])
      expect(() =>
        engine.request(
          "/api/tasks",
          post({ prompt: "Goal", agentId: online, brief }),
        ),
      ).toThrow();
    expect(engine.getSnapshot().tasks).toHaveLength(6);
  });

  it("starts with useful history, no active work, and a non-admin visitor", () => {
    const engine = start();
    const initial = engine.getSnapshot();
    expect(initial.tasks).toHaveLength(6);
    expect(initial.me.isAdmin).toBe(false);
    expect(initial.agents.map((agent) => agent.status)).toEqual([
      "online",
      "online",
      "offline",
    ]);
    vi.advanceTimersByTime(60_000);
    expect(engine.getSnapshot()).toEqual(initial);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("serializes tasks across different Agents and exposes each execution stage", () => {
    const engine = start();
    const first = create(engine, "第一项需求");
    const second = create(engine, "第二项需求", otherOnline);
    expect(first.status).toBe("queued");
    expect(second.status).toBe("queued");
    const unsubscribe = engine.subscribe(() => {
      expect(
        engine.getSnapshot().tasks.filter((item) => item.status === "running"),
      ).toHaveLength(
        engine.getSnapshot().agents.filter((agent) => agent.status === "busy")
          .length,
      );
      expect(
        engine.getSnapshot().tasks.filter((item) => item.status === "running")
          .length,
      ).toBeLessThanOrEqual(1);
    });
    vi.advanceTimersByTime(10);
    expect(task(engine, first.id).progress).toContain("1/3");
    expect(task(engine, second.id).status).toBe("queued");
    vi.advanceTimersByTime(20);
    expect(task(engine, first.id).progress).toContain("2/3");
    vi.advanceTimersByTime(20);
    expect(task(engine, first.id).progress).toContain("3/3");
    vi.advanceTimersByTime(20);
    expect(task(engine, first.id).status).toBe("completed");
    expect(task(engine, second.id).status).toBe("queued");
    vi.runAllTimers();
    expect(task(engine, second.id).status).toBe("completed");
    expect(task(engine, second.id).result).toContain(
      "does not implement your request",
    );
    expect(task(engine, second.id).commitSha).toBe("");
    unsubscribe();
  });

  it("never completes a canceled queued task and continues the next task", () => {
    const engine = start();
    const canceled = create(engine, "取消此需求");
    const next = create(engine, "继续此需求");
    engine.request(`/api/tasks/${canceled.id}/cancel`, post());
    vi.runAllTimers();
    expect(task(engine, canceled.id)).toMatchObject({
      status: "canceled",
      result: "",
      diff: "",
    });
    expect(task(engine, next.id).status).toBe("completed");
  });

  it("clears an active simulation timer on cancellation and releases its Agent", () => {
    const engine = start();
    const canceled = create(engine, "停止运行中的模拟");
    const next = create(engine, "接续任务", otherOnline);
    vi.advanceTimersByTime(30);
    engine.request(`/api/tasks/${canceled.id}/cancel`, post());
    vi.runAllTimers();
    expect(task(engine, canceled.id).status).toBe("canceled");
    expect(task(engine, canceled.id).result).toBe("");
    expect(task(engine, next.id).status).toBe("completed");
    expect(
      engine.getSnapshot().agents.some((agent) => agent.status === "busy"),
    ).toBe(false);
  });

  it("keeps offline tasks waiting without blocking eligible work, then allows reassignment", () => {
    const engine = start();
    const waiting = create(engine, "等待离线 Agent", offline);
    const eligible = create(engine, "在线任务", otherOnline);
    vi.runAllTimers();
    expect(task(engine, waiting.id).status).toBe("waiting_for_agent");
    expect(task(engine, eligible.id).status).toBe("completed");
    const reassigned = engine.request<Task>(
      `/api/tasks/${waiting.id}/reassign`,
      post({ agentId: online }),
    );
    expect(reassigned.status).toBe("queued");
    vi.runAllTimers();
    expect(task(engine, waiting.id)).toMatchObject({
      selectedAgentId: online,
      status: "completed",
    });
  });

  it("retries the attention fixture without silently losing its failure history", () => {
    const engine = start();
    engine.request("/api/tasks/demo-task-retry/retry", post());
    expect(task(engine, "demo-task-retry")).toMatchObject({
      status: "queued",
      error: "",
    });
    vi.runAllTimers();
    const retried = task(engine, "demo-task-retry");
    expect(retried.status).toBe("needs_attention");
    expect(
      retried.messages.some((message) =>
        message.content.includes("SIMULATED FAILURE"),
      ),
    ).toBe(true);
    expect(retried.error).toContain("round limit");
    expect(retried.workflow?.phase).toBe("blocked");
    expect(
      retried.messages.some((message) =>
        message.content.includes("SIMULATED HISTORY"),
      ),
    ).toBe(true);
  });

  it("recovers an interrupted task on refresh and retains messages and completed work", () => {
    const storage = memoryStorage();
    const first = start(storage);
    const created = create(first, "刷新恢复测试");
    vi.advanceTimersByTime(30);
    const message = first.request<TaskMessage>(
      `/api/tasks/${created.id}/messages`,
      post({ content: "补充：保留加载状态" }),
    );
    expect(message.role).toBe("member");
    first.dispose();
    const restored = start(storage);
    expect(task(restored, created.id).status).toBe("queued");
    expect(task(restored, created.id).progress).toContain("Page restored");
    expect(
      task(restored, created.id).messages.some(
        (item) => item.id === message.id,
      ),
    ).toBe(true);
    expect(task(restored, "demo-task-login").status).toBe("completed");
    vi.runAllTimers();
    expect(task(restored, created.id).status).toBe("completed");
    expect(
      task(restored, created.id).messages.filter((item) =>
        item.content.includes("[FIXED EXAMPLE — NO LIVE DEVELOPMENT]"),
      ),
    ).toHaveLength(1);
  });

  it("restores a completed user task with full result, diff and history on repeated reloads", () => {
    const storage = memoryStorage();
    const first = start(storage);
    const created = create(first, "修复刷新后任务详情丢失的问题");
    vi.runAllTimers();
    const completed = task(first, created.id);
    expect(completed.status).toBe("completed");
    expect(completed.diff).toContain("diff --git");
    first.dispose();
    const second = start(storage);
    expect(second.getSnapshot().tasks).toHaveLength(7);
    expect(task(second, created.id)).toEqual(completed);
    expect(storage.getItem(DEMO_STORAGE_KEY)).not.toBeNull();
    second.dispose();
    const third = start(storage);
    expect(task(third, created.id)).toEqual(completed);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    "{broken",
    JSON.stringify({ version: 1, snapshot: {} }),
    JSON.stringify({
      version: 2,
      sequence: 2,
      snapshot: { me: { isAdmin: true } },
    }),
  ])("recovers from corrupt or incompatible local data (%s)", (raw) => {
    const storage = memoryStorage();
    storage.setItem(DEMO_STORAGE_KEY, raw);
    const engine = start(storage);
    expect(engine.getSnapshot().tasks).toHaveLength(6);
    expect(engine.getSnapshot().me.isAdmin).toBe(false);
    expect(storage.getItem(DEMO_STORAGE_KEY)).toBeNull();
  });

  it("works with blocked storage and returns copies that cannot mutate internal state", () => {
    const engine = start({
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    });
    const created = create(engine, "不依赖本地存储");
    created.status = "canceled";
    const snapshot = engine.getSnapshot();
    snapshot.tasks.length = 0;
    vi.runAllTimers();
    expect(task(engine, created.id).status).toBe("completed");
  });

  it("reset clears only the demo namespace and prevents an old run from reappearing", () => {
    const storage = memoryStorage();
    storage.setItem("unrelated-site-setting", "keep");
    const engine = start(storage);
    const changed = vi.fn();
    engine.subscribe(changed);
    create(engine, "重置期间运行");
    vi.advanceTimersByTime(30);
    engine.reset();
    vi.runAllTimers();
    expect(engine.getSnapshot().tasks).toHaveLength(6);
    expect(
      engine.getSnapshot().tasks.some((item) => item.status === "running"),
    ).toBe(false);
    expect(storage.getItem(DEMO_STORAGE_KEY)).toBeNull();
    expect(storage.getItem("unrelated-site-setting")).toBe("keep");
    expect(changed).toHaveBeenCalled();
  });

  it("rejects malformed requests, forbidden management and invalid state transitions", () => {
    const engine = start();
    expect(() => engine.request("/api/tasks", post({ prompt: " " }))).toThrow(
      "Task description",
    );
    expect(() =>
      engine.request("/api/tasks", { method: "POST", body: "null" }),
    ).toThrow("JSON object");
    expect(() => engine.request("/api/invites", post())).toThrow(
      "real Coordinator",
    );
    expect(() =>
      engine.request("/api/tasks/demo-task-cleanup/retry", post()),
    ).toThrow("Only tasks needing attention");
    expect(() =>
      engine.request("/api/tasks/demo-task-cleanup/cancel", post()),
    ).toThrow("already ended");
    expect(() =>
      engine.request("/api/tasks/demo-task-login/cancel", post()),
    ).toThrow("Only the task requester");
  });
});

describe("API transport selection", () => {
  it("runs the public demo without fetch or EventSource and preserves ApiError", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_STATIC_DEMO", "1");
    const fetch = vi.fn();
    const EventSource = vi.fn();
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("EventSource", EventSource);
    const transport = await import("./api.js");
    expect(transport.isStaticDemo).toBe(true);
    const onChange = vi.fn();
    const onConnection = vi.fn();
    const unsubscribe = transport.subscribeSnapshots(onChange, onConnection);
    const created = await transport.api<Task>(
      "/api/tasks",
      transport.json("POST", { prompt: "纯浏览器测试", agentId: online }),
    );
    expect(created.status).toBe("queued");
    expect(onChange).toHaveBeenCalled();
    expect(onConnection).toHaveBeenCalledWith(true);
    await expect(
      transport.api("/api/settings", transport.json("POST", {})),
    ).rejects.toBeInstanceOf(transport.ApiError);
    expect(fetch).not.toHaveBeenCalled();
    expect(EventSource).not.toHaveBeenCalled();
    transport.resetDemo();
    unsubscribe();
  });

  it("polls while the real stream is disconnected and cleans up on unsubscribe", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_STATIC_DEMO", "0");
    const stream = {
      onopen: undefined as (() => void) | undefined,
      onerror: undefined as (() => void) | undefined,
      addEventListener: vi.fn(),
      close: vi.fn(),
    };
    vi.stubGlobal(
      "EventSource",
      vi.fn(() => stream),
    );
    const transport = await import("./api.js");
    const changed = vi.fn();
    const connection = vi.fn();
    const unsubscribe = transport.subscribeSnapshots(changed, connection);
    stream.onerror?.();
    vi.advanceTimersByTime(5_000);
    expect(changed).toHaveBeenCalledTimes(1);
    stream.onopen?.();
    expect(connection).toHaveBeenLastCalledWith(true);
    vi.advanceTimersByTime(10_000);
    expect(changed).toHaveBeenCalledTimes(1);
    stream.onerror?.();
    unsubscribe();
    vi.advanceTimersByTime(10_000);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(stream.close).toHaveBeenCalledOnce();
  });
});
