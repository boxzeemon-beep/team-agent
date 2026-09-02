import type {
  RunnerClientMessage,
  RunnerServerMessage,
  TaskAssignment,
} from "@team-agent/shared";
import { runnerTextLimits, truncateText } from "@team-agent/shared";
import WebSocket from "ws";
import { CodexAppServerClient } from "./codex-client.js";
import { type CliOptions, runnerWebSocketUrl, StateStore } from "./config.js";
import { GitWorkspace, type PreparedRepository } from "./git.js";

export class TeamAgentRunner {
  private readonly store: StateStore;
  private readonly git: GitWorkspace;
  private readonly codex = new CodexAppServerClient();
  private socket: WebSocket | undefined;
  private registered = false;
  private stopping = false;
  private activeAssignment: TaskAssignment | undefined;
  private queuedMessages: RunnerClientMessage[] = [];
  private heartbeat: NodeJS.Timeout | undefined;

  constructor(private readonly options: CliOptions) {
    this.store = new StateStore(options.dataDir);
    this.git = new GitWorkspace(this.store.workspacesDir);
  }

  async start(): Promise<void> {
    await this.store.acquireProcessLock();
    try {
      const state = await this.store.load();
      if (!optionsHasCredential(this.options, state.runnerToken)) {
        throw new Error(
          "This runner is not paired. Provide the one-time --pair token shown in the project.",
        );
      }
      if (this.options.resetManaged) {
        await this.resetManaged(this.options.resetManaged);
        return;
      }
      console.log(`Team Agent Runner: ${this.options.name}`);
      console.log(`Device: ${state.deviceId}`);
      console.log(`Coordinator: ${this.options.coordinator}`);
      console.log(`Data: ${this.options.dataDir}`);
      await this.codex.start();
      console.log("Codex: signed in and ready");
      await this.connectionLoop();
    } finally {
      await this.codex.close();
      await this.store.releaseProcessLock();
    }
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.socket?.close();
    await this.codex.close();
    await this.store.releaseProcessLock();
  }

  private async resetManaged(projectKey: string): Promise<void> {
    if (projectKey === "all") {
      for (const key of Object.keys(this.store.get().projects))
        await this.git.reset(key);
      console.log("Reset every known managed workspace to its remote branch.");
    } else {
      await this.git.reset(projectKey);
      console.log(
        `Reset managed workspace ${projectKey} to its remote branch.`,
      );
    }
    await this.store.update((state) => {
      delete state.activeTaskId;
    });
  }

  private async connectionLoop(): Promise<void> {
    let delay = 1_000;
    while (!this.stopping) {
      const connectedAt = Date.now();
      try {
        await this.connectOnce();
      } catch (error) {
        if (this.stopping) break;
        console.error(`Coordinator connection ended: ${errorMessage(error)}`);
      }
      if (this.stopping) break;
      delay =
        Date.now() - connectedAt > 60_000 ? 1_000 : Math.min(delay * 2, 30_000);
      console.log(`Reconnecting in ${Math.round(delay / 1_000)}s…`);
      await sleep(delay);
    }
  }

  private connectOnce(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(
        runnerWebSocketUrl(this.options.coordinator),
      );
      this.socket = socket;
      this.registered = false;
      let opened = false;
      socket.once("open", () => {
        opened = true;
        console.log("Coordinator: connected, registering…");
        const state = this.store.get();
        this.sendRaw({
          type: "runner.register",
          ...(state.runnerToken
            ? { runnerToken: state.runnerToken }
            : { pairingToken: this.options.pair }),
          deviceId: state.deviceId,
          displayName: this.options.name,
          ...(state.activeTaskId ? { activeTaskId: state.activeTaskId } : {}),
        });
      });
      socket.on("message", (data) =>
        this.handleServerMessage(data.toString()).catch((error) => {
          console.error(`Runner message error: ${errorMessage(error)}`);
        }),
      );
      socket.once("error", (error) => {
        if (!opened) reject(error);
      });
      socket.once("close", (code, reason) => {
        this.registered = false;
        if (this.heartbeat) clearInterval(this.heartbeat);
        this.heartbeat = undefined;
        this.socket = undefined;
        console.log(
          `Coordinator: offline (${code}${reason.length ? `, ${reason.toString()}` : ""})`,
        );
        resolve();
      });
    });
  }

  private async handleServerMessage(raw: string): Promise<void> {
    const message = JSON.parse(raw) as RunnerServerMessage;
    if (message.type === "runner.registered") {
      await this.store.update((state) => {
        state.agentId = message.agentId;
        state.runnerToken = message.runnerToken;
        state.ownerMemberId = message.ownerMemberId;
      });
      this.registered = true;
      console.log(`Agent: online (${message.agentId})`);
      this.flushMessages();
      this.startHeartbeat(message.agentId);
      return;
    }
    if (message.type === "runner.ready") {
      console.log("Agent: ready for team tasks");
      return;
    }
    if (message.type === "runner.error") {
      console.error(`Coordinator rejected a request: ${message.message}`);
      return;
    }
    if (message.type === "task.assign")
      await this.acceptAssignment(message.assignment);
  }

  private startHeartbeat(agentId: string): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = setInterval(
      () => this.send({ type: "runner.heartbeat", agentId }),
      15_000,
    );
  }

  private async acceptAssignment(assignment: TaskAssignment): Promise<void> {
    const cached = this.store.get().completedTasks[assignment.taskId];
    if (cached) {
      console.log(`Task ${assignment.taskId}: replaying cached completion`);
      this.send(cached);
      return;
    }
    if (this.activeAssignment) {
      if (this.activeAssignment.taskId !== assignment.taskId) {
        console.error(
          `Ignored task ${assignment.taskId}: already working on ${this.activeAssignment.taskId}`,
        );
      }
      return;
    }
    const persistedTaskId = this.store.get().activeTaskId;
    if (persistedTaskId && persistedTaskId !== assignment.taskId) {
      this.send({
        type: "task.needs_attention",
        taskId: assignment.taskId,
        message: `Managed workspace is preserved for unfinished task ${persistedTaskId}. Retry that task or explicitly run --reset-managed before assigning ${assignment.taskId}.`,
        diff: "",
        testOutput: "",
      });
      return;
    }
    this.activeAssignment = assignment;
    await this.store.update((state) => {
      state.activeTaskId = assignment.taskId;
    });
    void this.execute(assignment, persistedTaskId === assignment.taskId).then(
      () => {
        // Terminal messages normally clear this before transport so a newly
        // assigned task from the same Coordinator connection is accepted. The
        // guard prevents an older completion callback from clearing a newer task.
        if (this.activeAssignment?.taskId === assignment.taskId)
          this.activeAssignment = undefined;
      },
    );
  }

  private async execute(
    assignment: TaskAssignment,
    recovering: boolean,
  ): Promise<boolean> {
    const projectKey = this.store.projectKey(assignment.settings.repositoryUrl);
    let repository: PreparedRepository | undefined;
    let testOutput = "";
    try {
      console.log(
        `Task ${assignment.taskId}: preparing ${assignment.settings.projectName}`,
      );
      this.progress(
        assignment.taskId,
        "Preparing the managed project clone and shared branch.",
      );
      repository = await this.git.prepare(projectKey, assignment.settings, {
        ...(recovering ? { recoverTaskId: assignment.taskId } : {}),
      });
      const project = this.store.get().projects[projectKey] ?? {};
      if (repository.taskCommitSha) {
        this.progress(
          assignment.taskId,
          "Found the preserved task commit. Verifying and publishing it before running Codex again.",
        );
        const finished = await this.git.finish(repository, {
          taskId: assignment.taskId,
          requester: assignment.requestedBy,
          agent: assignment.agentDisplayName ?? assignment.agentId,
          testCommand: assignment.settings.testCommand,
          sharedBranch: assignment.settings.sharedBranch,
        });
        const complete: Extract<
          RunnerClientMessage,
          { type: "task.complete" }
        > = {
          type: "task.complete",
          taskId: assignment.taskId,
          result: "Recovered and published the preserved task commit.",
          diff: finished.diff,
          testOutput: finished.testOutput,
          commitSha: finished.commitSha,
          contextThroughSequence: assignment.contextThroughSequence,
        };
        await this.cacheCompletion(assignment.taskId, complete);
        await this.finishLocalCompletion(assignment.taskId);
        this.send(complete);
        return true;
      }
      const prompt = buildPrompt(assignment, repository.baselineSha);
      const result = await this.codex.runTurn(
        {
          cwd: repository.path,
          prompt,
          ...(project.threadId ? { threadId: project.threadId } : {}),
        },
        {
          onProgress: (message) => this.progress(assignment.taskId, message),
          onThreadReady: async (threadId) => {
            await this.store.update((state) => {
              state.projects[projectKey] = {
                ...state.projects[projectKey],
                threadId,
                lastTaskId: assignment.taskId,
              };
            });
          },
          onWaitingOwner: (message) => {
            console.log(
              `Task ${assignment.taskId}: waiting for owner approval`,
            );
            this.send({
              type: "task.waiting_owner",
              taskId: assignment.taskId,
              message,
            });
          },
        },
      );
      await this.store.update((state) => {
        state.projects[projectKey] = {
          threadId: result.threadId,
          lastTaskId: assignment.taskId,
        };
      });
      this.progress(
        assignment.taskId,
        "Codex finished. Running tests and publishing the shared branch.",
      );
      const finished = await this.git.finish(repository, {
        taskId: assignment.taskId,
        requester: assignment.requestedBy,
        agent: assignment.agentDisplayName ?? assignment.agentId,
        testCommand: assignment.settings.testCommand,
        sharedBranch: assignment.settings.sharedBranch,
      });
      testOutput = finished.testOutput;
      const complete: Extract<RunnerClientMessage, { type: "task.complete" }> =
        {
          type: "task.complete",
          taskId: assignment.taskId,
          result: result.text || "Codex completed the task.",
          diff: finished.diff,
          testOutput: finished.testOutput,
          commitSha: finished.commitSha,
          contextThroughSequence: assignment.contextThroughSequence,
        };
      await this.cacheCompletion(assignment.taskId, complete);
      await this.finishLocalCompletion(assignment.taskId);
      this.send(complete);
      console.log(
        `Task ${assignment.taskId}: completed at ${finished.commitSha.slice(0, 12)}`,
      );
      return true;
    } catch (error) {
      testOutput = getTestOutput(error) || testOutput;
      const diff = repository
        ? await this.git.diagnosticDiff(repository).catch(() => "")
        : "";
      const resetHint = `Resolve files in ${repository?.path ?? "the managed clone"}, or run this runner with --reset-managed ${projectKey}.`;
      const message = `${errorMessage(error)}\n\n${resetHint}`;
      if (this.activeAssignment?.taskId === assignment.taskId)
        this.activeAssignment = undefined;
      this.send({
        type: "task.needs_attention",
        taskId: assignment.taskId,
        message,
        diff,
        testOutput,
      });
      console.error(`Task ${assignment.taskId}: needs attention\n${message}`);
      return false;
    }
  }

  private async finishLocalCompletion(taskId: string): Promise<void> {
    await this.store.update((state) => {
      if (state.activeTaskId === taskId) delete state.activeTaskId;
    });
    if (this.activeAssignment?.taskId === taskId)
      this.activeAssignment = undefined;
  }

  private async cacheCompletion(
    taskId: string,
    complete: Extract<RunnerClientMessage, { type: "task.complete" }>,
  ): Promise<void> {
    const bounded = boundRunnerMessage(complete) as Extract<
      RunnerClientMessage,
      { type: "task.complete" }
    >;
    await this.store.update((state) => {
      state.completedTasks[taskId] = bounded;
      const ids = Object.keys(state.completedTasks);
      for (const oldId of ids.slice(0, Math.max(0, ids.length - 100)))
        delete state.completedTasks[oldId];
    });
  }

  private progress(taskId: string, message: string): void {
    console.log(`Task ${taskId}: ${message}`);
    this.send({ type: "task.progress", taskId, message });
  }

  private send(message: RunnerClientMessage): void {
    message = boundRunnerMessage(message);
    if (!this.registered || this.socket?.readyState !== WebSocket.OPEN) {
      if (message.type !== "runner.heartbeat")
        this.queuedMessages.push(message);
      return;
    }
    this.sendRaw(message);
  }

  private sendRaw(message: RunnerClientMessage): void {
    this.socket?.send(JSON.stringify(message));
  }

  private flushMessages(): void {
    const queued = this.queuedMessages;
    this.queuedMessages = [];
    for (const message of queued) this.send(message);
  }
}

export function boundRunnerMessage(
  message: RunnerClientMessage,
): RunnerClientMessage {
  switch (message.type) {
    case "task.progress":
    case "task.waiting_owner":
      return {
        ...message,
        message: truncateText(message.message, runnerTextLimits.progress),
      };
    case "task.complete":
      return {
        ...message,
        result: truncateText(message.result, runnerTextLimits.result),
        diff: truncateText(message.diff, runnerTextLimits.diff),
        testOutput: truncateText(
          message.testOutput,
          runnerTextLimits.testOutput,
        ),
      };
    case "task.needs_attention":
      return {
        ...message,
        message: truncateText(message.message, runnerTextLimits.attention),
        diff: truncateText(message.diff, runnerTextLimits.diff),
        testOutput: truncateText(
          message.testOutput,
          runnerTextLimits.testOutput,
        ),
      };
    default:
      return message;
  }
}

function buildPrompt(assignment: TaskAssignment, baselineSha: string): string {
  const render = (messages: TaskAssignment["contextMessages"]) =>
    messages
      .map(
        (message) =>
          `[${message.createdAt}] ${message.author} (${message.role}): ${message.content}`,
      )
      .join("\n");
  return [
    "You are working on a task requested through the internal Team Agent service.",
    "Work directly in the current repository. Inspect the project, implement the request, and summarize the result.",
    "Do not commit, push, switch branches, or modify Git remotes; the local Runner performs those steps after tests.",
    "Treat the shared project context below as background, and the task conversation as the current request.",
    `Execution identity: ${assignment.agentDisplayName ?? assignment.agentId}${assignment.agentOwnerName ? `, shared by ${assignment.agentOwnerName}` : ""}.`,
    `Current code state: ${assignment.settings.sharedBranch} at ${baselineSha}.`,
    "",
    "## Shared project context since this Agent last participated",
    render(assignment.contextMessages) || "(No new shared context.)",
    "",
    "## Current task conversation",
    render(assignment.requestMessages),
  ].join("\n");
}

function optionsHasCredential(
  options: CliOptions,
  runnerToken: string | undefined,
): boolean {
  return Boolean(options.pair || runnerToken);
}

function getTestOutput(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "testOutput" in error &&
    typeof error.testOutput === "string"
  ) {
    return error.testOutput;
  }
  return "";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
