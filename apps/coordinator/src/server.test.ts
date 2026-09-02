import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RunnerServerMessage, Task } from "@team-agent/shared";
import type { LightMyRequestResponse } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { type CoordinatorApp, createApp } from "./server.js";

interface Runtime extends CoordinatorApp {
  baseUrl: string;
}

const runtimes: Runtime[] = [];
const temporaryDirectories: string[] = [];

async function startRuntime(databasePath?: string): Promise<Runtime> {
  const directory = databasePath
    ? null
    : mkdtempSync(join(tmpdir(), "team-agent-coordinator-"));
  if (directory) temporaryDirectories.push(directory);
  const coordinator = await createApp({
    databasePath:
      databasePath ?? join(directory as string, "coordinator.sqlite"),
    publicUrl: "http://127.0.0.1:4310",
    webRoot: join(tmpdir(), "team-agent-web-assets-do-not-exist"),
    heartbeatCheckMs: 60_000,
  });
  await coordinator.app.listen({ host: "127.0.0.1", port: 0 });
  const address = coordinator.app.server.address() as AddressInfo;
  const runtime = {
    ...coordinator,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
  runtimes.push(runtime);
  return runtime;
}

function cookieFrom(response: LightMyRequestResponse): string {
  const header = response.headers["set-cookie"];
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) throw new Error("Expected a session cookie");
  return value.split(";", 1)[0] as string;
}

async function claimBootstrap(runtime: Runtime, name = "项目管理员") {
  if (!runtime.bootstrapInvite) throw new Error("Expected a bootstrap invite");
  const response = await runtime.app.inject({
    method: "POST",
    url: "/api/invites/claim",
    payload: { token: runtime.bootstrapInvite.token, name },
  });
  expect(response.statusCode).toBe(200);
  return {
    cookie: cookieFrom(response),
    member: response.json().member as { id: string; name: string },
  };
}

async function inviteAndClaim(
  runtime: Runtime,
  adminCookie: string,
  name: string,
) {
  const invitation = await runtime.app.inject({
    method: "POST",
    url: "/api/invites",
    headers: { cookie: adminCookie },
  });
  expect(invitation.statusCode).toBe(200);
  const inviteToken = new URL(invitation.json().inviteUrl).searchParams.get(
    "token",
  ) as string;
  const claim = await runtime.app.inject({
    method: "POST",
    url: "/api/invites/claim",
    payload: { token: inviteToken, name },
  });
  expect(claim.statusCode).toBe(200);
  return cookieFrom(claim);
}

async function createPairing(
  runtime: Runtime,
  cookie: string,
  displayName: string,
): Promise<string> {
  const response = await runtime.app.inject({
    method: "POST",
    url: "/api/agents/pair",
    headers: { cookie },
    payload: { displayName },
  });
  expect(response.statusCode).toBe(200);
  return response.json().pairingToken as string;
}

class TestRunner {
  readonly socket: WebSocket;
  readonly received: RunnerServerMessage[] = [];
  private readonly listeners = new Set<() => void>();

  private constructor(socket: WebSocket) {
    this.socket = socket;
    socket.on("message", (raw) => {
      this.received.push(JSON.parse(raw.toString()) as RunnerServerMessage);
      for (const listener of this.listeners) listener();
    });
  }

  static async connect(baseUrl: string): Promise<TestRunner> {
    const socket = new WebSocket(
      `${baseUrl.replace(/^http/, "ws")}/api/runner`,
    );
    const runner = new TestRunner(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once("open", resolve);
      socket.once("error", reject);
    });
    return runner;
  }

  send(value: unknown): void {
    this.socket.send(JSON.stringify(value));
  }

  async waitFor<T extends RunnerServerMessage>(
    predicate: (message: RunnerServerMessage) => message is T,
    timeoutMs = 2_000,
  ): Promise<T> {
    const existing = this.received.find(predicate);
    if (existing) return existing;
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.listeners.delete(check);
        reject(
          new Error(
            `Timed out waiting for runner message. Received: ${JSON.stringify(this.received)}`,
          ),
        );
      }, timeoutMs);
      const check = () => {
        const found = this.received.find(predicate);
        if (!found) return;
        clearTimeout(timeout);
        this.listeners.delete(check);
        resolve(found);
      };
      this.listeners.add(check);
    });
  }

  async registerWithPairing(pairingToken: string, deviceId: string) {
    this.send({
      type: "runner.register",
      pairingToken,
      deviceId,
      displayName: "test",
    });
    return this.waitFor(
      (
        message,
      ): message is Extract<
        RunnerServerMessage,
        { type: "runner.registered" }
      > => message.type === "runner.registered",
    );
  }

  async registerWithToken(runnerToken: string, deviceId: string) {
    this.send({
      type: "runner.register",
      runnerToken,
      deviceId,
      displayName: "test",
    });
    return this.waitFor(
      (
        message,
      ): message is Extract<
        RunnerServerMessage,
        { type: "runner.registered" }
      > => message.type === "runner.registered",
    );
  }

  async close(): Promise<void> {
    if (this.socket.readyState === WebSocket.CLOSED) return;
    const closed = new Promise<void>((resolve) =>
      this.socket.once("close", () => resolve()),
    );
    this.socket.close();
    await closed;
  }
}

async function createTask(
  runtime: Runtime,
  cookie: string,
  agentId: string,
  prompt: string,
): Promise<Task> {
  const response = await runtime.app.inject({
    method: "POST",
    url: "/api/tasks",
    headers: { cookie },
    payload: { agentId, prompt },
  });
  expect(response.statusCode).toBe(201);
  return response.json() as Task;
}

async function snapshot(runtime: Runtime, cookie: string) {
  const response = await runtime.app.inject({
    method: "GET",
    url: "/api/snapshot",
    headers: { cookie },
  });
  expect(response.statusCode).toBe(200);
  return response.json() as {
    agents: Array<{ id: string; status: string }>;
    tasks: Task[];
    me: { name: string };
  };
}

async function eventually(
  assertion: () => void,
  timeoutMs = 2_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw lastError;
}

afterEach(async () => {
  while (runtimes.length) {
    const runtime = runtimes.pop();
    if (runtime) await runtime.app.close();
  }
  while (temporaryDirectories.length)
    rmSync(temporaryDirectories.pop() as string, {
      recursive: true,
      force: true,
    });
});

describe("coordinator", () => {
  it("exposes an unauthenticated health check", async () => {
    const runtime = await startRuntime();
    const response = await runtime.app.inject({
      method: "GET",
      url: "/api/health",
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "ok",
      service: "team-agent-coordinator",
      version: "0.1.0",
    });
  });

  it("returns a one-command Runner pairing flow from the public release", async () => {
    const runtime = await startRuntime();
    const { cookie } = await claimBootstrap(runtime, "Alice");
    const response = await runtime.app.inject({
      method: "POST",
      url: "/api/agents/pair",
      headers: { cookie },
      payload: { displayName: "Alice's Codex" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().command).toContain(
      "releases/latest/download/team-agent-runner.tgz",
    );
    expect(response.json().command).toContain("team-agent runner");
    expect(response.json().command).toContain("Alice's Codex");
  });

  it("serves nested web assets and uses the SPA fallback only outside the API", async () => {
    const directory = mkdtempSync(join(tmpdir(), "team-agent-static-"));
    temporaryDirectories.push(directory);
    const webRoot = join(directory, "web");
    mkdirSync(join(webRoot, "assets"), { recursive: true });
    writeFileSync(join(webRoot, "index.html"), "<main>alpha shell</main>");
    writeFileSync(join(webRoot, "assets", "app.js"), "window.alpha = true;");
    const coordinator = await createApp({
      databasePath: join(directory, "coordinator.sqlite"),
      webRoot,
    });
    runtimes.push({ ...coordinator, baseUrl: "" });

    const asset = await coordinator.app.inject({
      method: "GET",
      url: "/assets/app.js",
    });
    expect(asset.statusCode).toBe(200);
    expect(asset.headers["content-type"]).toContain("application/javascript");
    expect(asset.body).toBe("window.alpha = true;");

    const invite = await coordinator.app.inject({
      method: "GET",
      url: "/invite?token=example",
    });
    expect(invite.statusCode).toBe(200);
    expect(invite.body).toBe("<main>alpha shell</main>");

    const unknownApi = await coordinator.app.inject({
      method: "GET",
      url: "/api/unknown",
    });
    expect(unknownApi.statusCode).toBe(404);
    expect(unknownApi.json()).toEqual({ error: "not_found" });
  });

  it("claims every invite once and authenticates the resulting cookie session", async () => {
    const runtime = await startRuntime();
    const bootstrapToken = runtime.bootstrapInvite?.token as string;
    const { cookie } = await claimBootstrap(runtime, "Alice");

    const me = await runtime.app.inject({
      method: "GET",
      url: "/api/me",
      headers: { cookie },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ name: "Alice", isAdmin: true });

    const anonymous = await runtime.app.inject({
      method: "GET",
      url: "/api/me",
    });
    expect(anonymous.statusCode).toBe(401);

    const reusedBootstrap = await runtime.app.inject({
      method: "POST",
      url: "/api/invites/claim",
      payload: { token: bootstrapToken, name: "Mallory" },
    });
    expect(reusedBootstrap.statusCode).toBe(400);

    const inviteResponse = await runtime.app.inject({
      method: "POST",
      url: "/api/invites",
      headers: { cookie },
    });
    expect(inviteResponse.statusCode).toBe(200);
    const inviteToken = new URL(
      inviteResponse.json().inviteUrl,
    ).searchParams.get("token") as string;
    const claim = await runtime.app.inject({
      method: "POST",
      url: "/api/invites/claim",
      payload: { token: inviteToken, name: "Bob" },
    });
    expect(claim.statusCode).toBe(200);
    expect(claim.json().member).toMatchObject({ name: "Bob", isAdmin: false });
    const reuse = await runtime.app.inject({
      method: "POST",
      url: "/api/invites/claim",
      payload: { token: inviteToken, name: "Charlie" },
    });
    expect(reuse.statusCode).toBe(400);
  });

  it("keeps only the newest bootstrap invite and atomically retires all admin links on first claim", async () => {
    const directory = mkdtempSync(join(tmpdir(), "team-agent-bootstrap-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "coordinator.sqlite");
    const first = await startRuntime(databasePath);
    const firstToken = first.bootstrapInvite?.token as string;
    const second = await startRuntime(databasePath);
    const secondToken = second.bootstrapInvite?.token as string;

    const stale = await first.app.inject({
      method: "POST",
      url: "/api/invites/claim",
      payload: { token: firstToken, name: "Stale Admin" },
    });
    expect(stale.statusCode).toBe(400);

    const claimed = await second.app.inject({
      method: "POST",
      url: "/api/invites/claim",
      payload: { token: secondToken, name: "Only Admin" },
    });
    expect(claimed.statusCode).toBe(200);
    expect(claimed.json().member).toMatchObject({ isAdmin: true });

    const remainingAdminInvites = second.db.sqlite
      .prepare(
        "SELECT COUNT(*) AS count FROM invites WHERE is_admin=1 AND claimed_at IS NULL",
      )
      .get() as { count: number };
    expect(remainingAdminInvites.count).toBe(0);
  });

  it("recovers a committed pairing exchange with the same token and device", async () => {
    const directory = mkdtempSync(join(tmpdir(), "team-agent-pairing-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "coordinator.sqlite");
    const initialRuntime = await startRuntime(databasePath);
    const { cookie } = await claimBootstrap(initialRuntime);
    const pairingToken = await createPairing(
      initialRuntime,
      cookie,
      "可恢复 Codex",
    );

    const first = await TestRunner.connect(initialRuntime.baseUrl);
    const firstRegistration = await first.registerWithPairing(
      pairingToken,
      "recovery-device",
    );
    // Model the response-loss window: the database exchange has committed, but
    // the runner has not persisted the credential it was sent.
    await first.close();
    runtimes.splice(runtimes.indexOf(initialRuntime), 1);
    await initialRuntime.app.close();

    // Recovery also survives a coordinator restart; SQLite stores the HMAC
    // secret and credential hash, never the plaintext runner credential.
    const runtime = await startRuntime(databasePath);

    const retry = await TestRunner.connect(runtime.baseUrl);
    const recovered = await retry.registerWithPairing(
      pairingToken,
      "recovery-device",
    );
    expect(recovered.agentId).toBe(firstRegistration.agentId);
    expect(recovered.runnerToken).toBe(firstRegistration.runnerToken);
    expect(runtime.db.listAgents()).toHaveLength(1);

    const wrongDevice = await TestRunner.connect(runtime.baseUrl);
    wrongDevice.send({
      type: "runner.register",
      pairingToken,
      deviceId: "different-device",
      displayName: "test",
    });
    const rejected = await wrongDevice.waitFor(
      (
        message,
      ): message is Extract<RunnerServerMessage, { type: "runner.error" }> =>
        message.type === "runner.error",
    );
    expect(rejected.message).toBe("Registration credentials rejected");
    await wrongDevice.close();
    await retry.close();
  });

  it("pairs runners, skips an offline target, and keeps all online execution serial", async () => {
    const runtime = await startRuntime();
    const { cookie } = await claimBootstrap(runtime);
    const offlineRunner = await TestRunner.connect(runtime.baseUrl);
    const runnerB = await TestRunner.connect(runtime.baseUrl);
    const runnerC = await TestRunner.connect(runtime.baseUrl);

    const offlineRegistration = await offlineRunner.registerWithPairing(
      await createPairing(runtime, cookie, "离线 Codex"),
      "device-offline",
    );
    const registrationB = await runnerB.registerWithPairing(
      await createPairing(runtime, cookie, "在线 Codex B"),
      "device-b",
    );
    const registrationC = await runnerC.registerWithPairing(
      await createPairing(runtime, cookie, "在线 Codex C"),
      "device-c",
    );
    await offlineRunner.close();
    await eventually(() =>
      expect(runtime.db.agentById(offlineRegistration.agentId)?.status).toBe(
        "offline",
      ),
    );

    const offlineTask = await createTask(
      runtime,
      cookie,
      offlineRegistration.agentId,
      "先排队等待离线 Agent",
    );
    const taskB = await createTask(
      runtime,
      cookie,
      registrationB.agentId,
      "执行在线任务 B",
    );
    const assignmentB = await runnerB.waitFor(
      (
        message,
      ): message is Extract<RunnerServerMessage, { type: "task.assign" }> =>
        message.type === "task.assign" &&
        message.assignment.taskId === taskB.id,
    );
    expect(assignmentB.assignment.requestMessages[0]?.content).toBe(
      "执行在线任务 B",
    );

    const taskC = await createTask(
      runtime,
      cookie,
      registrationC.agentId,
      "执行在线任务 C",
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(
      runnerC.received.some(
        (message) =>
          message.type === "task.assign" &&
          message.assignment.taskId === taskC.id,
      ),
    ).toBe(false);

    runnerB.send({
      type: "task.progress",
      taskId: taskB.id,
      message: "正在修改核心模块",
    });
    await eventually(() => {
      const task = runtime.db.taskById(taskB.id);
      expect(task?.status).toBe("running");
      expect(task?.progress).toBe("正在修改核心模块");
      expect(task?.messages.at(-1)?.content).toBe("正在修改核心模块");
    });

    runnerB.send({
      type: "task.complete",
      taskId: taskB.id,
      result: "B 已完成",
      diff: "+export const complete = true;",
      testOutput: "1 test passed",
      commitSha: "b".repeat(40),
      contextThroughSequence: assignmentB.assignment.contextThroughSequence,
    });
    const assignmentC = await runnerC.waitFor(
      (
        message,
      ): message is Extract<RunnerServerMessage, { type: "task.assign" }> =>
        message.type === "task.assign" &&
        message.assignment.taskId === taskC.id,
    );
    expect(
      assignmentC.assignment.contextMessages.some(
        (message) => message.content === "B 已完成",
      ),
    ).toBe(true);
    expect(
      assignmentC.assignment.contextMessages.some(
        (message) =>
          message.role === "system" &&
          message.content.includes(`commit ${"b".repeat(40)}`) &&
          message.content.includes("1 test passed"),
      ),
    ).toBe(true);

    const state = await snapshot(runtime, cookie);
    expect(state.tasks.find((task) => task.id === offlineTask.id)?.status).toBe(
      "waiting_for_agent",
    );
    expect(state.tasks.find((task) => task.id === taskB.id)).toMatchObject({
      status: "completed",
      result: "B 已完成",
      testOutput: "1 test passed",
      commitSha: "b".repeat(40),
    });
    expect(
      state.tasks.filter((task) =>
        ["running", "waiting_for_owner"].includes(task.status),
      ),
    ).toHaveLength(1);

    runnerC.send({
      type: "task.complete",
      taskId: taskC.id,
      result: "C 已完成",
      diff: "",
      testOutput: "ok",
      commitSha: "c".repeat(40),
      contextThroughSequence: 0,
    });
    await eventually(() =>
      expect(runtime.db.taskById(taskC.id)?.status).toBe("completed"),
    );

    const failingB = await createTask(
      runtime,
      cookie,
      registrationB.agentId,
      "保留工作区并暂停 Agent B",
    );
    await runnerB.waitFor(
      (
        message,
      ): message is Extract<RunnerServerMessage, { type: "task.assign" }> =>
        message.type === "task.assign" &&
        message.assignment.taskId === failingB.id,
    );
    const waitingForB = await createTask(
      runtime,
      cookie,
      registrationB.agentId,
      "等待 Agent B 处理本地工作区",
    );
    const nextForC = await createTask(
      runtime,
      cookie,
      registrationC.agentId,
      "Agent C 继续执行",
    );
    runnerB.send({
      type: "task.needs_attention",
      taskId: failingB.id,
      message: "测试失败，需要所有者处理",
      diff: "+preserved change",
      testOutput: "failed",
    });
    await runnerC.waitFor(
      (
        message,
      ): message is Extract<RunnerServerMessage, { type: "task.assign" }> =>
        message.type === "task.assign" &&
        message.assignment.taskId === nextForC.id,
    );
    expect(runtime.db.agentById(registrationB.agentId)?.status).toBe("paused");
    expect(runtime.db.taskById(failingB.id)?.status).toBe("needs_attention");
    expect(runtime.db.taskById(waitingForB.id)?.status).toBe(
      "waiting_for_agent",
    );
    runnerC.send({
      type: "task.complete",
      taskId: nextForC.id,
      result: "C 后续任务已完成",
      diff: "",
      testOutput: "ok",
      commitSha: "f".repeat(40),
      contextThroughSequence: 0,
    });
    await eventually(() =>
      expect(runtime.db.taskById(nextForC.id)?.status).toBe("completed"),
    );
    await runnerB.close();
    await runnerC.close();
  });

  it("holds the global lock across a runner disconnect and resends the persisted assignment", async () => {
    const runtime = await startRuntime();
    const { cookie } = await claimBootstrap(runtime);
    const runnerA = await TestRunner.connect(runtime.baseUrl);
    const runnerB = await TestRunner.connect(runtime.baseUrl);
    const registrationA = await runnerA.registerWithPairing(
      await createPairing(runtime, cookie, "Owner A"),
      "lock-device-a",
    );
    const registrationB = await runnerB.registerWithPairing(
      await createPairing(runtime, cookie, "Owner B"),
      "lock-device-b",
    );
    const active = await createTask(
      runtime,
      cookie,
      registrationA.agentId,
      "保持这个任务的锁",
    );
    const original = await runnerA.waitFor(
      (
        message,
      ): message is Extract<RunnerServerMessage, { type: "task.assign" }> =>
        message.type === "task.assign" &&
        message.assignment.taskId === active.id,
    );
    const queued = await createTask(
      runtime,
      cookie,
      registrationB.agentId,
      "必须等待前一个任务恢复",
    );

    await runnerA.close();
    await eventually(() => {
      expect(runtime.db.taskById(active.id)?.status).toBe("running");
      expect(runtime.db.agentById(registrationA.agentId)?.status).toBe(
        "offline",
      );
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(
      runnerB.received.some(
        (message) =>
          message.type === "task.assign" &&
          message.assignment.taskId === queued.id,
      ),
    ).toBe(false);

    const settingsChangedWhileOffline = await runtime.app.inject({
      method: "PUT",
      url: "/api/settings",
      headers: { cookie },
      payload: {
        projectName: "Changed after assignment",
        repositoryUrl: "git@example.invalid:team/project.git",
        baseBranch: "main",
        sharedBranch: "internal-alpha",
        testCommand: "pnpm test",
      },
    });
    expect(settingsChangedWhileOffline.statusCode).toBe(200);

    const resumed = await TestRunner.connect(runtime.baseUrl);
    await resumed.registerWithToken(registrationA.runnerToken, "lock-device-a");
    const replay = await resumed.waitFor(
      (
        message,
      ): message is Extract<RunnerServerMessage, { type: "task.assign" }> =>
        message.type === "task.assign" &&
        message.assignment.taskId === active.id,
    );
    expect(replay.assignment).toEqual(original.assignment);
    expect(runtime.db.agentById(registrationA.agentId)?.status).toBe("busy");

    resumed.send({
      type: "task.complete",
      taskId: active.id,
      result: "恢复后完成",
      diff: "",
      testOutput: "ok",
      commitSha: "e".repeat(40),
      contextThroughSequence: Number.MAX_SAFE_INTEGER,
    });
    await runnerB.waitFor(
      (
        message,
      ): message is Extract<RunnerServerMessage, { type: "task.assign" }> =>
        message.type === "task.assign" &&
        message.assignment.taskId === queued.id,
    );
    expect(
      runtime.db.agentById(registrationA.agentId)?.lastContextMessageSequence,
    ).toBe(replay.assignment.contextThroughSequence);
    await resumed.close();
    await runnerB.close();
  });

  it("lets the selected Agent owner prepare an attention task for retry", async () => {
    const runtime = await startRuntime();
    const { cookie: requesterCookie } = await claimBootstrap(
      runtime,
      "Requester",
    );
    const ownerCookie = await inviteAndClaim(
      runtime,
      requesterCookie,
      "Agent Owner",
    );
    const runner = await TestRunner.connect(runtime.baseUrl);
    const registration = await runner.registerWithPairing(
      await createPairing(runtime, ownerCookie, "Owner Codex"),
      "owner-retry-device",
    );
    const task = await createTask(
      runtime,
      requesterCookie,
      registration.agentId,
      "需要所有者修复后重试",
    );
    await runner.waitFor(
      (
        message,
      ): message is Extract<RunnerServerMessage, { type: "task.assign" }> =>
        message.type === "task.assign" && message.assignment.taskId === task.id,
    );
    runner.send({
      type: "task.needs_attention",
      taskId: task.id,
      message: "本地测试需要处理",
      diff: "+work in progress",
      testOutput: "failed",
    });
    await eventually(() => {
      expect(runtime.db.taskById(task.id)?.status).toBe("needs_attention");
      expect(runtime.db.agentById(registration.agentId)?.status).toBe("paused");
    });

    const retry = await runtime.app.inject({
      method: "POST",
      url: `/api/tasks/${task.id}/retry`,
      headers: { cookie: ownerCookie },
    });
    expect(retry.statusCode).toBe(200);
    expect(retry.json()).toMatchObject({ status: "waiting_for_agent" });
    await runner.close();
  });

  it("lets only an administrator force-release an offline active task and schedules the next task", async () => {
    const runtime = await startRuntime();
    const { cookie: adminCookie } = await claimBootstrap(runtime, "Admin");
    const memberCookie = await inviteAndClaim(
      runtime,
      adminCookie,
      "Regular Member",
    );
    const runnerA = await TestRunner.connect(runtime.baseUrl);
    const runnerB = await TestRunner.connect(runtime.baseUrl);
    const registrationA = await runnerA.registerWithPairing(
      await createPairing(runtime, adminCookie, "Offline Active Agent"),
      "force-release-device-a",
    );
    const registrationB = await runnerB.registerWithPairing(
      await createPairing(runtime, adminCookie, "Next Agent"),
      "force-release-device-b",
    );
    const active = await createTask(
      runtime,
      adminCookie,
      registrationA.agentId,
      "Active task to release",
    );
    await runnerA.waitFor(
      (
        message,
      ): message is Extract<RunnerServerMessage, { type: "task.assign" }> =>
        message.type === "task.assign" &&
        message.assignment.taskId === active.id,
    );
    const queued = await createTask(
      runtime,
      adminCookie,
      registrationB.agentId,
      "Task scheduled after release",
    );
    const assignmentBeforeRelease = runtime.db.sqlite
      .prepare("SELECT assignment_json FROM tasks WHERE id=?")
      .get(active.id) as { assignment_json: string };

    const onlineDenied = await runtime.app.inject({
      method: "POST",
      url: `/api/tasks/${active.id}/force-release`,
      headers: { cookie: adminCookie },
      payload: { confirm: "FORCE_RELEASE" },
    });
    expect(onlineDenied.statusCode).toBe(409);

    await runnerA.close();
    await eventually(() =>
      expect(runtime.db.agentById(registrationA.agentId)?.status).toBe(
        "offline",
      ),
    );

    const memberDenied = await runtime.app.inject({
      method: "POST",
      url: `/api/tasks/${active.id}/force-release`,
      headers: { cookie: memberCookie },
      payload: { confirm: "FORCE_RELEASE" },
    });
    expect(memberDenied.statusCode).toBe(403);
    const unconfirmed = await runtime.app.inject({
      method: "POST",
      url: `/api/tasks/${active.id}/force-release`,
      headers: { cookie: adminCookie },
      payload: { confirm: true },
    });
    expect(unconfirmed.statusCode).toBe(400);

    const released = await runtime.app.inject({
      method: "POST",
      url: `/api/tasks/${active.id}/force-release`,
      headers: { cookie: adminCookie },
      payload: { confirm: "FORCE_RELEASE" },
    });
    expect(released.statusCode).toBe(200);
    expect(released.json()).toMatchObject({
      status: "needs_attention",
      selectedAgentId: registrationA.agentId,
    });
    expect(runtime.db.agentById(registrationA.agentId)?.status).toBe("paused");
    expect(runtime.db.taskById(active.id)?.messages.at(-1)).toMatchObject({
      role: "system",
      memberName: "System",
    });
    expect(
      (
        runtime.db.sqlite
          .prepare("SELECT assignment_json FROM tasks WHERE id=?")
          .get(active.id) as { assignment_json: string }
      ).assignment_json,
    ).toBe(assignmentBeforeRelease.assignment_json);

    await runnerB.waitFor(
      (
        message,
      ): message is Extract<RunnerServerMessage, { type: "task.assign" }> =>
        message.type === "task.assign" &&
        message.assignment.taskId === queued.id,
    );
    expect(runtime.db.taskById(queued.id)?.status).toBe("running");
    await runnerB.close();
  });

  it("restores sessions, agents, queued work, and context cursors after restart", async () => {
    const directory = mkdtempSync(join(tmpdir(), "team-agent-restart-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "coordinator.sqlite");
    const first = await startRuntime(databasePath);
    const { cookie } = await claimBootstrap(first, "Persisted Member");
    const runner = await TestRunner.connect(first.baseUrl);
    const registration = await runner.registerWithPairing(
      await createPairing(first, cookie, "持久化 Codex"),
      "persistent-device",
    );
    const task = await createTask(
      first,
      cookie,
      registration.agentId,
      "跨重启继续这个任务",
    );
    const initialAssignment = await runner.waitFor(
      (
        message,
      ): message is Extract<RunnerServerMessage, { type: "task.assign" }> =>
        message.type === "task.assign" && message.assignment.taskId === task.id,
    );
    await runner.close();
    await eventually(() =>
      expect(first.db.taskById(task.id)?.status).toBe("running"),
    );
    const firstIndex = runtimes.indexOf(first);
    runtimes.splice(firstIndex, 1);
    await first.app.close();

    const second = await startRuntime(databasePath);
    expect(second.bootstrapInvite).toBeNull();
    const restored = await snapshot(second, cookie);
    expect(restored.me.name).toBe("Persisted Member");
    expect(restored.agents).toContainEqual(
      expect.objectContaining({ id: registration.agentId, status: "offline" }),
    );
    expect(restored.tasks).toContainEqual(
      expect.objectContaining({ id: task.id, status: "running" }),
    );

    const resumedRunner = await TestRunner.connect(second.baseUrl);
    await resumedRunner.registerWithToken(
      registration.runnerToken,
      "persistent-device",
    );
    const resumedAssignment = await resumedRunner.waitFor(
      (
        message,
      ): message is Extract<RunnerServerMessage, { type: "task.assign" }> =>
        message.type === "task.assign" && message.assignment.taskId === task.id,
    );
    expect(resumedAssignment.assignment.contextThroughSequence).toBe(
      initialAssignment.assignment.contextThroughSequence,
    );
    resumedRunner.send({
      type: "task.complete",
      taskId: task.id,
      result: "重启后完成",
      diff: "",
      testOutput: "ok",
      commitSha: "d".repeat(40),
      contextThroughSequence:
        resumedAssignment.assignment.contextThroughSequence,
    });
    await eventually(() => {
      expect(second.db.taskById(task.id)?.status).toBe("completed");
      expect(
        second.db.agentById(registration.agentId)?.lastContextMessageSequence,
      ).toBe(resumedAssignment.assignment.contextThroughSequence);
    });
    await resumedRunner.close();
  });
});
