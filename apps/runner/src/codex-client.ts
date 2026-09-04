import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import {
  createInterface as createLineReader,
  type Interface as LineInterface,
} from "node:readline";
import {
  createInterface as createPrompt,
  type Interface as PromptInterface,
} from "node:readline/promises";
import {
  runnerTextLimits,
  TEAM_AGENT_VERSION,
  truncateText,
} from "@team-agent/shared";

type JsonObject = Record<string, unknown>;

export interface CodexTurnCallbacks {
  onProgress(message: string): void;
  onWaitingOwner(message: string): void;
  onThreadReady?(threadId: string): void | Promise<void>;
}

export interface CodexTurnResult {
  threadId: string;
  text: string;
}

interface PendingRequest {
  resolve(value: unknown): void;
  reject(error: Error): void;
}

interface ActiveTurn {
  threadId: string;
  turnId?: string;
  text: string;
  lastTextProgressAt: number;
  callbacks: CodexTurnCallbacks;
  resolve(value: CodexTurnResult): void;
  reject(error: Error): void;
}

export class CodexAppServerClient {
  private child: ChildProcessWithoutNullStreams | undefined;
  private lines: LineInterface | undefined;
  private prompt: PromptInterface | undefined;
  private nextRequestId = 1;
  private pending = new Map<number, PendingRequest>();
  private activeTurn: ActiveTurn | undefined;
  private approvalChain = Promise.resolve();

  async start(): Promise<void> {
    if (this.child) return;
    const binary = process.env.CODEX_BIN ?? "codex";
    const child = spawn(binary, ["app-server", "--stdio"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child = child;
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) =>
      process.stderr.write(`[codex] ${chunk}`),
    );
    child.once("error", (error) => {
      if (this.child === child) this.failAll(error);
    });
    child.once("exit", (code, signal) => {
      if (this.child !== child) return;
      this.failAll(
        new Error(
          `Codex app-server exited (code=${String(code)}, signal=${String(signal)})`,
        ),
      );
      this.child = undefined;
    });
    this.lines = createLineReader({ input: child.stdout });
    this.lines.on("line", (line) => this.receive(line));
    try {
      await this.request("initialize", {
        clientInfo: {
          name: "team-agent-runner",
          title: "Team Agent Runner",
          version: TEAM_AGENT_VERSION,
        },
        capabilities: { experimentalApi: true, requestAttestation: false },
      });
      this.notify("initialized");
      const account = (await this.request("account/read", {})) as {
        account?: unknown;
        requiresOpenaiAuth?: boolean;
      };
      if (account.requiresOpenaiAuth && !account.account) {
        throw new Error(
          "Codex is not signed in on this computer. Run `codex login` first.",
        );
      }
    } catch (error) {
      await this.close();
      throw error;
    }
  }

  async runTurn(
    options: { cwd: string; prompt: string; threadId?: string },
    callbacks: CodexTurnCallbacks,
  ): Promise<CodexTurnResult> {
    await this.start();
    if (this.activeTurn)
      throw new Error("Codex already has an active team task");
    let threadId = options.threadId;
    if (threadId) {
      try {
        await this.request("thread/resume", {
          threadId,
          cwd: options.cwd,
          approvalPolicy: "untrusted",
          approvalsReviewer: "user",
          sandbox: "workspace-write",
          excludeTurns: true,
        });
      } catch (error) {
        callbacks.onProgress(
          `Previous Codex thread could not be resumed; starting a fresh thread (${errorMessage(error)})`,
        );
        threadId = undefined;
      }
    }
    if (!threadId) {
      const started = (await this.request("thread/start", {
        cwd: options.cwd,
        approvalPolicy: "untrusted",
        approvalsReviewer: "user",
        sandbox: "workspace-write",
        ephemeral: false,
      })) as { thread?: { id?: string } };
      threadId = started.thread?.id;
      if (!threadId)
        throw new Error("Codex thread/start returned no thread id");
    }
    await callbacks.onThreadReady?.(threadId);
    // Install the turn before sending turn/start. app-server may write the RPC
    // response and notifications in one stdout chunk; readline dispatches every
    // line before the awaiting continuation gets a chance to run.
    const completion = new Promise<CodexTurnResult>((resolve, reject) => {
      this.activeTurn = {
        threadId,
        text: "",
        lastTextProgressAt: 0,
        callbacks,
        resolve,
        reject,
      };
    });
    try {
      const startedTurn = (await this.request("turn/start", {
        threadId,
        input: [{ type: "text", text: options.prompt, text_elements: [] }],
        cwd: options.cwd,
        approvalPolicy: "untrusted",
        approvalsReviewer: "user",
        sandboxPolicy: {
          type: "workspaceWrite",
          writableRoots: [options.cwd],
          networkAccess: false,
          excludeTmpdirEnvVar: false,
          excludeSlashTmp: false,
        },
      })) as { turn?: { id?: string } };
      const turnId = startedTurn.turn?.id;
      if (!turnId) throw new Error("Codex turn/start returned no turn id");
      const active = this.activeTurn as ActiveTurn | undefined;
      if (active) {
        if (active.turnId && active.turnId !== turnId)
          throw new Error(
            `Codex turn id mismatch (${active.turnId} != ${turnId})`,
          );
        active.turnId = turnId;
      }
      callbacks.onProgress("Codex started working on the task.");
      return completion;
    } catch (error) {
      const active = this.activeTurn as ActiveTurn | undefined;
      this.activeTurn = undefined;
      active?.reject(error instanceof Error ? error : new Error(String(error)));
      // The completion promise is not returned on this path; observe its
      // rejection so it never becomes an unhandled rejection.
      void completion.catch(() => undefined);
      throw error;
    }
  }

  async close(): Promise<void> {
    this.failAll(new Error("Codex app-server closed"));
    this.lines?.close();
    this.lines = undefined;
    this.prompt?.close();
    this.prompt = undefined;
    const child = this.child;
    this.child = undefined;
    if (child && child.exitCode === null && child.signalCode === null)
      child.kill("SIGTERM");
  }

  private request(method: string, params: JsonObject): Promise<unknown> {
    const id = this.nextRequestId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.write({ id, method, params });
    });
  }

  private notify(method: string, params?: JsonObject): void {
    this.write({ method, ...(params ? { params } : {}) });
  }

  private write(message: JsonObject): void {
    if (!this.child?.stdin.writable)
      throw new Error("Codex app-server is not running");
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private receive(line: string): void {
    let message: JsonObject;
    try {
      message = JSON.parse(line) as JsonObject;
    } catch {
      process.stderr.write(`[codex] Ignoring malformed JSONL: ${line}\n`);
      return;
    }
    if (
      typeof message.id === "number" &&
      ("result" in message || "error" in message) &&
      !message.method
    ) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error)
        pending.reject(new Error(formatUnknown(message.error)));
      else pending.resolve(message.result);
      return;
    }
    if (typeof message.method !== "string") return;
    if ("id" in message) {
      this.approvalChain = this.approvalChain
        .then(() => this.handleServerRequest(message))
        .catch((error) => {
          process.stderr.write(
            `[codex] Approval handler error: ${errorMessage(error)}\n`,
          );
        });
      return;
    }
    this.handleNotification(message.method, asObject(message.params));
  }

  private handleNotification(method: string, params: JsonObject): void {
    const turn = this.activeTurn;
    if (!turn) return;
    if (typeof params.turnId === "string") {
      if (turn.turnId && params.turnId !== turn.turnId) return;
      turn.turnId ??= params.turnId;
    }
    if (
      method === "item/agentMessage/delta" &&
      typeof params.delta === "string"
    ) {
      turn.text = truncateText(
        `${turn.text}${params.delta}`,
        runnerTextLimits.result,
      );
      const compact = params.delta.trim();
      const now = Date.now();
      if (compact && now - turn.lastTextProgressAt >= 1_500) {
        turn.lastTextProgressAt = now;
        turn.callbacks.onProgress(turn.text.slice(-500));
      }
      return;
    }
    if (method === "item/started" || method === "item/completed") {
      const item = asObject(params.item);
      const type = typeof item.type === "string" ? item.type : "work item";
      if (type === "commandExecution" && typeof item.command === "string") {
        turn.callbacks.onProgress(
          `${method.endsWith("started") ? "Running" : "Finished"}: ${item.command.slice(0, 300)}`,
        );
      } else if (type === "fileChange") {
        turn.callbacks.onProgress(
          method.endsWith("started")
            ? "Preparing code changes."
            : "Applied code changes.",
        );
      }
      if (
        method === "item/completed" &&
        type === "agentMessage" &&
        typeof item.text === "string"
      ) {
        turn.text = truncateText(item.text, runnerTextLimits.result);
      }
      return;
    }
    if (method === "turn/completed") {
      const completed = asObject(params.turn);
      const status = completed.status;
      this.activeTurn = undefined;
      if (status === "completed")
        turn.resolve({ threadId: turn.threadId, text: turn.text.trim() });
      else
        turn.reject(
          new Error(
            `Codex turn ended with status ${String(status)}: ${formatUnknown(completed.error)}`,
          ),
        );
      return;
    }
    if (method === "error") {
      turn.callbacks.onProgress(`Codex reported: ${formatUnknown(params)}`);
    }
  }

  private async handleServerRequest(message: JsonObject): Promise<void> {
    const method = String(message.method);
    const id = message.id;
    const params = asObject(message.params);
    if (typeof id !== "number" && typeof id !== "string") return;
    const active = this.activeTurn;
    const detail =
      (typeof params.command === "string" && params.command) ||
      (typeof params.reason === "string" && params.reason) ||
      formatUnknown(params.permissions ?? params);
    active?.callbacks.onWaitingOwner(`${method}: ${detail}`.slice(0, 1_000));
    const approved = await this.askOwner(method, detail);
    let result: JsonObject;
    if (method === "item/commandExecution/requestApproval") {
      result = { decision: approved ? "accept" : "decline" };
    } else if (method === "item/fileChange/requestApproval") {
      result = { decision: approved ? "accept" : "decline" };
    } else if (method === "item/permissions/requestApproval") {
      result = {
        permissions: approved ? params.permissions : {},
        scope: "turn",
      };
    } else if (
      method === "execCommandApproval" ||
      method === "applyPatchApproval"
    ) {
      result = {
        decision: approved
          ? "approved"
          : { denied: { rejection: "Declined by the Agent owner." } },
      };
    } else {
      this.write({
        id,
        error: {
          code: -32601,
          message: `Unsupported server request: ${method}`,
        },
      });
      return;
    }
    this.write({ id, result });
    active?.callbacks.onProgress(
      `Owner ${approved ? "approved" : "declined"} the requested action.`,
    );
  }

  private async askOwner(method: string, detail: string): Promise<boolean> {
    this.prompt ??= createPrompt({
      input: process.stdin,
      output: process.stdout,
    });
    const answer = await this.prompt.question(
      `\nCodex requests approval (${method})\n${detail}\nApprove once? [y/N] `,
    );
    return (
      answer.trim().toLowerCase() === "y" ||
      answer.trim().toLowerCase() === "yes"
    );
  }

  private failAll(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
    this.activeTurn?.reject(error);
    this.activeTurn = undefined;
  }
}

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" ? (value as JsonObject) : {};
}

function formatUnknown(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
