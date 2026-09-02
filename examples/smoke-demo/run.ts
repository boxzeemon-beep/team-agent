import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { createApp } from "../../apps/coordinator/src/server.js";
import type {
  DashboardSnapshot,
  RunnerServerMessage,
} from "../../packages/shared/src/index.js";

const execFileAsync = promisify(execFile);
const keepDemo = process.env.TEAM_AGENT_DEMO_KEEP === "1";

interface JsonResponse<T> {
  body: T;
  response: Response;
}

interface PairingResponse {
  pairingToken: string;
}

interface TaskResponse {
  id: string;
}

async function main(): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "team-agent-smoke-"));
  const remote = join(root, "demo.git");
  const seed = join(root, "seed");
  const runnerWorkspace = join(root, "runner-workspace");
  let socket: WebSocket | undefined;
  let coordinator: Awaited<ReturnType<typeof createApp>> | undefined;

  console.log("Team Agent five-minute smoke demo");
  console.log(`Workspace: ${root}`);

  try {
    await createLocalRepository(remote, seed);
    pass("Created an isolated Git repository");

    coordinator = await createApp({
      databasePath: join(root, "coordinator.sqlite"),
      publicUrl: "http://127.0.0.1",
      logger: false,
      heartbeatTimeoutMs: 30_000,
      heartbeatCheckMs: 1_000,
    });
    await coordinator.app.listen({ host: "127.0.0.1", port: 0 });
    const address = coordinator.app.server.address();
    if (!address || typeof address === "string")
      throw new Error("Coordinator did not expose a TCP address");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const health = await request<{ service: string }>(`${baseUrl}/api/health`);
    assert(
      health.body.service === "team-agent-coordinator",
      "Coordinator health service identity did not match",
    );
    pass(`Coordinator is healthy at ${baseUrl}`);

    const invite = coordinator.bootstrapInvite;
    if (!invite)
      throw new Error("Coordinator did not create a bootstrap invite");
    const claim = await request<{ member: { name: string } }>(
      `${baseUrl}/api/invites/claim`,
      {
        method: "POST",
        body: JSON.stringify({ token: invite.token, name: "Demo Owner" }),
      },
    );
    const cookie = claim.response.headers.get("set-cookie")?.split(";", 1)[0];
    if (!cookie) throw new Error("Invite claim returned no session cookie");
    pass("Claimed the administrator invite");

    await request(`${baseUrl}/api/settings`, {
      method: "PUT",
      headers: { cookie },
      body: JSON.stringify({
        projectName: "Five-minute demo",
        repositoryUrl: remote,
        baseBranch: "main",
        sharedBranch: "team-agent-demo",
        testCommand: "node --test",
      }),
    });

    const pairing = await request<PairingResponse>(
      `${baseUrl}/api/agents/pair`,
      {
        method: "POST",
        headers: { cookie },
        body: JSON.stringify({ displayName: "Demo Runner" }),
      },
    );

    const runner = await connectRunner(
      baseUrl.replace(/^http/, "ws"),
      pairing.body.pairingToken,
    );
    socket = runner.socket;
    pass(`Paired and registered Runner ${runner.agentId}`);

    const created = await request<TaskResponse>(`${baseUrl}/api/tasks`, {
      method: "POST",
      headers: { cookie },
      body: JSON.stringify({
        agentId: runner.agentId,
        prompt: "Add a team greeting and a passing test",
      }),
    });
    const assignmentMessage = await runner.waitFor(
      (message) =>
        message.type === "task.assign" &&
        message.assignment.taskId === created.body.id,
    );
    if (assignmentMessage.type !== "task.assign")
      throw new Error("Runner received an unexpected message");
    pass("Coordinator queued and assigned the task");

    socket.send(
      JSON.stringify({
        type: "task.progress",
        taskId: created.body.id,
        message: "Demo Runner is editing the local project",
      }),
    );
    const artifact = await executeSampleTask(remote, runnerWorkspace);
    socket.send(
      JSON.stringify({
        type: "task.complete",
        taskId: created.body.id,
        result: "Added a reusable team greeting with a passing Node test.",
        diff: artifact.diff,
        testOutput: artifact.testOutput,
        commitSha: artifact.commitSha,
        contextThroughSequence:
          assignmentMessage.assignment.contextThroughSequence,
      }),
    );

    const completed = await waitForCompletedTask(
      baseUrl,
      cookie,
      created.body.id,
    );
    assert(
      completed.commitSha === artifact.commitSha,
      "Commit SHA was not persisted",
    );
    assert(
      completed.testOutput.includes("pass 1"),
      "Test output was not persisted",
    );
    assert(
      completed.result ===
        "Added a reusable team greeting with a passing Node test.",
      "Runner result was not persisted",
    );
    assert(
      completed.diff.includes("welcome to Team Agent"),
      "Git diff was not persisted",
    );
    assert(
      completed.messages.some((message) =>
        message.content.includes("Demo Runner is editing the local project"),
      ),
      "Runner progress message was not persisted",
    );
    pass("Stored progress, diff, tests, result, and commit SHA");
    pass("Verified the commit on the shared Git branch");

    console.log("");
    console.log("SMOKE DEMO PASSED");
    console.log(`Task: ${completed.id}`);
    console.log(`Commit: ${completed.commitSha}`);
    console.log(
      "Validated: invite → session → pairing → WebSocket Runner → task → Git → completion",
    );
  } finally {
    socket?.close();
    if (coordinator) await coordinator.app.close();
    if (keepDemo) console.log(`Preserved demo workspace: ${root}`);
    else await rm(root, { recursive: true, force: true });
  }
}

async function createLocalRepository(
  remote: string,
  seed: string,
): Promise<void> {
  await git(["init", "--bare", remote]);
  await mkdir(seed);
  await git(["init", "--initial-branch=main"], seed);
  await git(["config", "user.name", "Team Agent Demo"], seed);
  await git(["config", "user.email", "demo@team-agent.local"], seed);
  await writeFile(
    join(seed, "package.json"),
    `${JSON.stringify({ private: true, type: "module" }, null, 2)}\n`,
  );
  await writeFile(
    join(seed, "greeting.js"),
    'export function greeting(name) { return "Hello, " + name + "!"; }\n',
  );
  await git(["add", "."], seed);
  await git(["commit", "-m", "Initialize smoke demo"], seed);
  await git(["remote", "add", "origin", remote], seed);
  await git(["push", "-u", "origin", "main"], seed);
}

async function executeSampleTask(
  remote: string,
  workspace: string,
): Promise<{ commitSha: string; diff: string; testOutput: string }> {
  await git(["clone", remote, workspace]);
  await git(["checkout", "-b", "team-agent-demo", "origin/main"], workspace);
  await git(["config", "user.name", "Demo Runner"], workspace);
  await git(["config", "user.email", "runner@team-agent.local"], workspace);
  await writeFile(
    join(workspace, "greeting.js"),
    'export function greeting(name) { return "Hello, " + name + " — welcome to Team Agent!"; }\n',
  );
  await writeFile(
    join(workspace, "greeting.test.js"),
    [
      'import test from "node:test";',
      'import assert from "node:assert/strict";',
      'import { greeting } from "./greeting.js";',
      "",
      'test("greets a teammate", () => {',
      '  assert.equal(greeting("Alex"), "Hello, Alex — welcome to Team Agent!");',
      "});",
      "",
    ].join("\n"),
  );
  const testRun = await execFileAsync(process.execPath, ["--test"], {
    cwd: workspace,
    encoding: "utf8",
  });
  await git(["add", "."], workspace);
  await git(["commit", "-m", "Add team greeting [team-agent demo]"], workspace);
  const commitSha = (await git(["rev-parse", "HEAD"], workspace)).trim();
  const diff = await git(
    ["show", "--format=", "--no-ext-diff", "HEAD"],
    workspace,
  );
  await git(["push", "-u", "origin", "team-agent-demo"], workspace);
  const remoteSha = (
    await git(["--git-dir", remote, "rev-parse", "refs/heads/team-agent-demo"])
  ).trim();
  assert(
    remoteSha === commitSha,
    "Shared branch did not receive the demo commit",
  );
  return { commitSha, diff, testOutput: testRun.stdout };
}

async function connectRunner(baseWsUrl: string, pairingToken: string) {
  const socket = new WebSocket(`${baseWsUrl}/api/runner`);
  const messages: RunnerServerMessage[] = [];
  const listeners = new Set<() => void>();
  socket.addEventListener("message", (event) => {
    messages.push(JSON.parse(String(event.data)) as RunnerServerMessage);
    for (const listener of listeners) listener();
  });
  await eventPromise(socket, "open", 5_000);
  socket.send(
    JSON.stringify({
      type: "runner.register",
      pairingToken,
      deviceId: "five-minute-smoke-demo",
      displayName: "Demo Runner",
    }),
  );

  const waitFor = async (
    predicate: (message: RunnerServerMessage) => boolean,
    timeoutMs = 5_000,
  ): Promise<RunnerServerMessage> => {
    const existing = messages.find(predicate);
    if (existing) return existing;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        listeners.delete(check);
        reject(
          new Error(
            `Timed out waiting for Runner message: ${JSON.stringify(messages)}`,
          ),
        );
      }, timeoutMs);
      const check = () => {
        const found = messages.find(predicate);
        if (!found) return;
        clearTimeout(timeout);
        listeners.delete(check);
        resolve(found);
      };
      listeners.add(check);
    });
  };

  const registered = await waitFor(
    (message) => message.type === "runner.registered",
  );
  if (registered.type !== "runner.registered")
    throw new Error("Runner registration did not complete");
  await waitFor((message) => message.type === "runner.ready");
  return { socket, agentId: registered.agentId, waitFor };
}

async function waitForCompletedTask(
  baseUrl: string,
  cookie: string,
  taskId: string,
): Promise<DashboardSnapshot["tasks"][number]> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const snapshot = await request<DashboardSnapshot>(
      `${baseUrl}/api/snapshot`,
      {
        headers: { cookie },
      },
    );
    const task = snapshot.body.tasks.find(
      (candidate) => candidate.id === taskId,
    );
    if (task?.status === "completed") return task;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Task ${taskId} did not complete`);
}

async function request<T = unknown>(
  url: string,
  init: RequestInit = {},
): Promise<JsonResponse<T>> {
  const response = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...init.headers },
  });
  const text = await response.text();
  if (!response.ok)
    throw new Error(
      `${init.method ?? "GET"} ${url} returned ${response.status}: ${text}`,
    );
  return { body: text ? (JSON.parse(text) as T) : (undefined as T), response };
}

async function git(args: string[], cwd?: string): Promise<string> {
  const result = await execFileAsync("git", args, { cwd, encoding: "utf8" });
  return result.stdout;
}

function eventPromise(
  socket: WebSocket,
  name: "open",
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`WebSocket ${name} timed out`)),
      timeoutMs,
    );
    socket.addEventListener(
      name,
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
    socket.addEventListener(
      "error",
      () => {
        clearTimeout(timeout);
        reject(new Error("WebSocket connection failed"));
      },
      { once: true },
    );
  });
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function pass(message: string): void {
  console.log(`PASS  ${message}`);
}

main().catch((error: unknown) => {
  console.error(
    `SMOKE DEMO FAILED: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
