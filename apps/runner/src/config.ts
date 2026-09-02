import { createHash, randomUUID } from "node:crypto";
import {
  type FileHandle,
  mkdir,
  open,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { RunnerClientMessage } from "@team-agent/shared";

export interface RunnerState {
  deviceId: string;
  runnerToken?: string;
  agentId?: string;
  ownerMemberId?: string;
  activeTaskId?: string;
  projects: Record<string, { threadId?: string; lastTaskId?: string }>;
  completedTasks: Record<
    string,
    Extract<RunnerClientMessage, { type: "task.complete" }>
  >;
}

export interface CliOptions {
  coordinator: string;
  pair?: string;
  name: string;
  dataDir: string;
  resetManaged?: string;
}

export function parseCliOptions(argv: string[]): CliOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") continue;
    if (!argument?.startsWith("--")) continue;
    const value = argv[index + 1];
    if (!value || value.startsWith("--"))
      throw new Error(`Missing value for ${argument}`);
    values.set(argument.slice(2), value);
    index += 1;
  }
  const coordinator = values.get("coordinator");
  if (!coordinator) {
    throw new Error(
      "Usage: runner --coordinator URL [--pairing-token TOKEN] [--name NAME] [--data-dir PATH] [--reset-managed KEY|all]",
    );
  }
  const pair = values.get("pairing-token") ?? values.get("pair");
  const resetManaged = values.get("reset-managed");
  return {
    coordinator,
    ...(pair ? { pair } : {}),
    name: values.get("name") ?? "My Codex",
    dataDir:
      values.get("data-dir") ?? join(homedir(), ".team-agent-alpha", "runner"),
    ...(resetManaged ? { resetManaged } : {}),
  };
}

export class StateStore {
  readonly workspacesDir: string;
  private readonly statePath: string;
  private state: RunnerState | undefined;
  private persistChain: Promise<void> = Promise.resolve();
  private lockHandle: FileHandle | undefined;
  private lockToken: string | undefined;

  constructor(readonly dataDir: string) {
    this.statePath = join(dataDir, "runner.json");
    this.workspacesDir = join(dataDir, "projects");
  }

  async load(): Promise<RunnerState> {
    await mkdir(this.workspacesDir, { recursive: true, mode: 0o700 });
    try {
      this.state = JSON.parse(
        await readFile(this.statePath, "utf8"),
      ) as RunnerState;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      this.state = { deviceId: randomUUID(), projects: {}, completedTasks: {} };
      await this.save();
    }
    this.state.projects ??= {};
    this.state.completedTasks ??= {};
    return this.state;
  }

  async acquireProcessLock(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true, mode: 0o700 });
    const lockPath = join(this.dataDir, "runner.lock");
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const handle = await open(lockPath, "wx", 0o600);
        const token = randomUUID();
        await handle.writeFile(
          `${JSON.stringify({ pid: process.pid, token })}\n`,
        );
        this.lockHandle = handle;
        this.lockToken = token;
        return;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        let pid: number | undefined;
        try {
          const parsed = JSON.parse(await readFile(lockPath, "utf8")) as {
            pid?: unknown;
          };
          if (typeof parsed.pid === "number") pid = parsed.pid;
        } catch {
          // The owning process may still be writing the newly-created file.
        }
        if (pid && processIsAlive(pid)) {
          throw new Error(
            `Another Runner process (PID ${pid}) already owns data directory ${this.dataDir}. Stop it or choose a different --data-dir.`,
          );
        }
        if (!pid) {
          const age = Date.now() - (await stat(lockPath)).mtimeMs;
          if (age < 10_000) {
            throw new Error(
              `Another Runner is acquiring data directory ${this.dataDir}. Try again after that process exits.`,
            );
          }
        }
        await unlink(lockPath).catch((unlinkError: NodeJS.ErrnoException) => {
          if (unlinkError.code !== "ENOENT") throw unlinkError;
        });
      }
    }
    throw new Error(
      `Runner data directory lock could not be acquired: ${this.dataDir}`,
    );
  }

  async releaseProcessLock(): Promise<void> {
    const handle = this.lockHandle;
    const token = this.lockToken;
    if (!handle || !token) return;
    this.lockHandle = undefined;
    this.lockToken = undefined;
    await handle.close();
    const lockPath = join(this.dataDir, "runner.lock");
    try {
      const current = JSON.parse(await readFile(lockPath, "utf8")) as {
        token?: unknown;
      };
      if (current.token === token) await unlink(lockPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  get(): RunnerState {
    if (!this.state) throw new Error("Runner state has not been loaded");
    return this.state;
  }

  async update(mutator: (state: RunnerState) => void): Promise<void> {
    mutator(this.get());
    await this.save();
  }

  async save(): Promise<void> {
    if (!this.state) throw new Error("Runner state has not been loaded");
    const serialized = `${JSON.stringify(this.state, null, 2)}\n`;
    this.persistChain = this.persistChain.then(async () => {
      await mkdir(this.dataDir, { recursive: true, mode: 0o700 });
      const temporary = `${this.statePath}.${process.pid}.${randomUUID()}.tmp`;
      await writeFile(temporary, serialized, { mode: 0o600 });
      await rename(temporary, this.statePath);
    });
    await this.persistChain;
  }

  projectKey(repositoryUrl: string): string {
    return createHash("sha256")
      .update(repositoryUrl)
      .digest("hex")
      .slice(0, 16);
  }
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

export function runnerWebSocketUrl(coordinator: string): string {
  const url = new URL(coordinator);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `${url.pathname.replace(/\/$/, "")}/api/runner`;
  url.search = "";
  url.hash = "";
  return url.toString();
}
