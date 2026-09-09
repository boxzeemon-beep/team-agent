import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runnerTextLimits, textTruncationMarker } from "@team-agent/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CodexAppServerClient } from "./codex-client.js";

const roots: string[] = [];

async function fakeServer(
  source: string,
): Promise<{ command: string; args: string[] }> {
  const root = await mkdtemp(join(tmpdir(), "team-agent-codex-"));
  roots.push(root);
  const script = join(root, "codex.cjs");
  await writeFile(
    script,
    `if (!process.argv.includes("--stdio")) process.exit(2);\n${source}`,
  );
  return { command: process.execPath, args: [script, "app-server", "--stdio"] };
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true })),
  );
});

describe("CodexAppServerClient lifecycle", () => {
  it("shows the owner the actual file path and diff when the approval RPC only carries an item ID", async () => {
    const launch = await fakeServer(`
const readline = require("node:readline");
readline.createInterface({ input: process.stdin }).on("line", line => {
  const message = JSON.parse(line);
  if (message.method === "initialize") reply(message.id, {});
  if (message.method === "account/read") reply(message.id, { account: { type: "chatgpt" } });
  if (message.method === "thread/start") reply(message.id, { thread: { id: "implementation" } });
  if (message.method === "turn/start") {
    process.stdout.write([
      { id: message.id, result: { turn: { id: "turn" } } },
      { method: "item/started", params: { threadId: "implementation", turnId: "turn", item: { type: "fileChange", id: "patch-1", changes: [{ path: "math.cjs", kind: { type: "update", move_path: null }, diff: "-exports.sum = (a,b) => a-b;\\n+exports.sum = (a,b) => a+b;" }] } } },
      { id: "approve-patch", method: "item/fileChange/requestApproval", params: { threadId: "implementation", turnId: "turn", itemId: "patch-1", reason: null } },
    ].map(value => JSON.stringify(value)).join("\\n") + "\\n");
  }
  if (message.id === "approve-patch" && message.result) {
    process.stdout.write(JSON.stringify({ method: "turn/completed", params: { threadId: "implementation", turn: { id: "turn", status: "completed" } } }) + "\\n");
  }
});
function reply(id, result) { process.stdout.write(JSON.stringify({ id, result }) + "\\n"); }
`);
    const client = new CodexAppServerClient(launch);
    // Substitute only terminal input; the complete app-server RPC and
    // notification handling path still runs through a real child process.
    const terminal = vi
      .spyOn(
        client as unknown as {
          askOwner(method: string, detail: string): Promise<boolean>;
        },
        "askOwner",
      )
      .mockResolvedValue(false);
    const waiting: string[] = [];
    try {
      await client.runTurn(
        { cwd: process.cwd(), prompt: "Fix addition" },
        {
          onProgress() {},
          onWaitingOwner: (message) => {
            waiting.push(message);
          },
        },
      );
      expect(terminal).toHaveBeenCalledWith(
        "item/fileChange/requestApproval",
        "math.cjs\n-exports.sum = (a,b) => a-b;\n+exports.sum = (a,b) => a+b;",
      );
      expect(waiting[0]).toContain("math.cjs");
      expect(waiting[0]).toContain("+exports.sum");
    } finally {
      await client.close();
      terminal.mockRestore();
    }
  });

  it("starts independent reviews in fresh read-only threads and denies write approvals", async () => {
    const root = await mkdtemp(join(tmpdir(), "team-agent-review-protocol-"));
    roots.push(root);
    const marker = join(root, "messages.jsonl");
    const launch = await fakeServer(`
const fs = require("node:fs");
const readline = require("node:readline");
readline.createInterface({ input: process.stdin }).on("line", line => {
  fs.appendFileSync(${JSON.stringify(marker)}, line + "\\n");
  const message = JSON.parse(line);
  if (message.method === "initialize") reply(message.id, {});
  if (message.method === "account/read") reply(message.id, { account: { type: "chatgpt" } });
  if (message.method === "thread/start") reply(message.id, { thread: { id: "fresh-review" } });
  if (message.method === "turn/start") {
    reply(message.id, { turn: { id: "review-turn" } });
    process.stdout.write(JSON.stringify({ id: "approval-1", method: "item/fileChange/requestApproval", params: { reason: "Let me edit" } }) + "\\n");
  }
  if (message.id === "approval-1" && message.result) {
    process.stdout.write(JSON.stringify({ method: "item/agentMessage/delta", params: { threadId: "fresh-review", turnId: "review-turn", delta: '{"verdict":"pass"}' } }) + "\\n");
    process.stdout.write(JSON.stringify({ method: "turn/completed", params: { threadId: "fresh-review", turn: { id: "review-turn", status: "completed" } } }) + "\\n");
  }
});
function reply(id, result) { process.stdout.write(JSON.stringify({ id, result }) + "\\n"); }
`);
    const client = new CodexAppServerClient(launch);
    let ownerPrompts = 0;
    try {
      await client.runTurn(
        {
          cwd: process.cwd(),
          prompt: "Review only",
          threadId: "implementation-thread",
          readOnly: true,
          outputSchema: { type: "object" },
        },
        {
          onProgress() {},
          onWaitingOwner() {
            ownerPrompts += 1;
          },
        },
      );
      const messages = (await readFile(marker, "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      expect(
        messages.some((message) => message.method === "thread/resume"),
      ).toBe(false);
      expect(
        messages.find((message) => message.method === "thread/start").params,
      ).toMatchObject({
        sandbox: "read-only",
        approvalPolicy: "never",
        ephemeral: false,
      });
      expect(
        messages.find((message) => message.method === "turn/start").params,
      ).toMatchObject({
        approvalPolicy: "never",
        sandboxPolicy: { type: "readOnly", networkAccess: false },
        outputSchema: { type: "object" },
      });
      expect(
        messages.find((message) => message.id === "approval-1").result,
      ).toEqual({ decision: "decline" });
      expect(ownerPrompts).toBe(0);
    } finally {
      await client.close();
    }
  });

  it("identifies itself with the shared release version", async () => {
    const root = await mkdtemp(join(tmpdir(), "team-agent-codex-version-"));
    roots.push(root);
    const marker = join(root, "client-info.json");
    const launch = await fakeServer(`
const fs = require("node:fs");
const readline = require("node:readline");
readline.createInterface({ input: process.stdin }).on("line", line => {
  const message = JSON.parse(line);
  if (message.method === "initialize") {
    fs.writeFileSync(${JSON.stringify(marker)}, JSON.stringify(message.params.clientInfo));
    reply(message.id, {});
  }
  if (message.method === "account/read") reply(message.id, { account: { type: "chatgpt" } });
});
function reply(id, result) { process.stdout.write(JSON.stringify({ id, result }) + "\\n"); }
`);

    const client = new CodexAppServerClient(launch);
    await client.start();
    expect(JSON.parse(await readFile(marker, "utf8"))).toEqual({
      name: "team-agent-runner",
      title: "Team Agent Runner",
      version: "0.2.0",
    });
    await client.close();
  });

  it("does not lose completion notifications sharing the turn/start chunk", async () => {
    const launch = await fakeServer(`
const readline = require("node:readline");
readline.createInterface({ input: process.stdin }).on("line", line => {
  const message = JSON.parse(line);
  if (message.method === "initialize") reply(message.id, {});
  if (message.method === "account/read") reply(message.id, { account: { type: "chatgpt" } });
  if (message.method === "thread/start") reply(message.id, { thread: { id: "thread-1" } });
  if (message.method === "turn/start") {
    process.stdout.write([
      JSON.stringify({ id: message.id, result: { turn: { id: "turn-1" } } }),
      JSON.stringify({ method: "item/agentMessage/delta", params: { turnId: "turn-1", delta: "x".repeat(${runnerTextLimits.result + 1}) } }),
      JSON.stringify({ method: "turn/completed", params: { turnId: "turn-1", turn: { status: "completed" } } }),
    ].join("\\n") + "\\n");
  }
});
function reply(id, result) { process.stdout.write(JSON.stringify({ id, result }) + "\\n"); }
`);
    const client = new CodexAppServerClient(launch);
    const result = await client.runTurn(
      { cwd: process.cwd(), prompt: "work" },
      { onProgress() {}, onWaitingOwner() {} },
    );
    expect(result.threadId).toBe("thread-1");
    expect(result.text).toHaveLength(runnerTextLimits.result);
    expect(result.text.endsWith(textTruncationMarker)).toBe(true);
    await client.close();
  });

  it("terminates app-server when the login preflight fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "team-agent-codex-marker-"));
    roots.push(root);
    const marker = join(root, "pid");
    const launch = await fakeServer(`
const fs = require("node:fs");
const readline = require("node:readline");
fs.writeFileSync(${JSON.stringify(marker)}, String(process.pid));
readline.createInterface({ input: process.stdin }).on("line", line => {
  const message = JSON.parse(line);
  if (message.method === "initialize") reply(message.id, {});
  if (message.method === "account/read") reply(message.id, { requiresOpenaiAuth: true });
});
function reply(id, result) { process.stdout.write(JSON.stringify({ id, result }) + "\\n"); }
`);
    const client = new CodexAppServerClient(launch);
    await expect(client.start()).rejects.toThrow("not signed in");
    const pid = Number(await readFile(marker, "utf8"));
    await expect(waitForExit(pid)).resolves.toBeUndefined();
  });

  it("ignores another thread and stale nested turn completions in the start response chunk", async () => {
    const launch = await fakeServer(`
const readline = require("node:readline");
readline.createInterface({ input: process.stdin }).on("line", line => {
  const message = JSON.parse(line);
  if (message.method === "initialize") reply(message.id, {});
  if (message.method === "account/read") reply(message.id, { account: { type: "chatgpt" } });
  if (message.method === "thread/start") reply(message.id, { thread: { id: "current-thread" } });
  if (message.method === "turn/start") {
    process.stdout.write([
      { id: message.id, result: { turn: { id: "current-turn" } } },
      { method: "item/agentMessage/delta", params: { threadId: "other-thread", turnId: "current-turn", delta: "WRONG THREAD" } },
      { method: "turn/completed", params: { threadId: "other-thread", turn: { id: "current-turn", status: "completed" } } },
      { method: "turn/completed", params: { threadId: "current-thread", turn: { id: "previous-turn", status: "completed" } } },
      { method: "item/agentMessage/delta", params: { threadId: "current-thread", turnId: "current-turn", delta: "Correct result" } },
      { method: "turn/completed", params: { threadId: "current-thread", turn: { id: "current-turn", status: "completed" } } },
    ].map(value => JSON.stringify(value)).join("\\n") + "\\n");
  }
});
function reply(id, result) { process.stdout.write(JSON.stringify({ id, result }) + "\\n"); }
`);
    const client = new CodexAppServerClient(launch);
    try {
      const result = await client.runTurn(
        { cwd: process.cwd(), prompt: "work" },
        { onProgress() {}, onWaitingOwner() {} },
      );
      expect(result).toEqual({
        threadId: "current-thread",
        text: "Correct result",
      });
    } finally {
      await client.close();
    }
  });
});

async function waitForExit(pid: number): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ESRCH") return;
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Codex app-server process ${pid} did not exit`);
}
