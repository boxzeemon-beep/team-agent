import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runnerTextLimits, textTruncationMarker } from "@team-agent/shared";
import { afterEach, describe, expect, it } from "vitest";
import { CodexAppServerClient } from "./codex-client.js";

const roots: string[] = [];
const originalCodexBin = process.env.CODEX_BIN;

async function fakeServer(source: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "team-agent-codex-"));
  roots.push(root);
  const script = join(root, "codex");
  await writeFile(
    script,
    `#!/usr/bin/env node\nif (!process.argv.includes("--stdio")) process.exit(2);\n${source}`,
    { mode: 0o755 },
  );
  return script;
}

afterEach(async () => {
  if (originalCodexBin === undefined) delete process.env.CODEX_BIN;
  else process.env.CODEX_BIN = originalCodexBin;
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true })),
  );
});

describe("CodexAppServerClient lifecycle", () => {
  it("identifies itself with the shared release version", async () => {
    const root = await mkdtemp(join(tmpdir(), "team-agent-codex-version-"));
    roots.push(root);
    const marker = join(root, "client-info.json");
    process.env.CODEX_BIN = await fakeServer(`
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

    const client = new CodexAppServerClient();
    await client.start();
    expect(JSON.parse(await readFile(marker, "utf8"))).toEqual({
      name: "team-agent-runner",
      title: "Team Agent Runner",
      version: "0.2.0",
    });
    await client.close();
  });

  it("does not lose completion notifications sharing the turn/start chunk", async () => {
    process.env.CODEX_BIN = await fakeServer(`
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
    const client = new CodexAppServerClient();
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
    const marker = join(root, "terminated");
    process.env.CODEX_BIN = await fakeServer(`
const fs = require("node:fs");
const readline = require("node:readline");
process.on("SIGTERM", () => { fs.writeFileSync(${JSON.stringify(marker)}, "yes"); process.exit(0); });
readline.createInterface({ input: process.stdin }).on("line", line => {
  const message = JSON.parse(line);
  if (message.method === "initialize") reply(message.id, {});
  if (message.method === "account/read") reply(message.id, { requiresOpenaiAuth: true });
});
function reply(id, result) { process.stdout.write(JSON.stringify({ id, result }) + "\\n"); }
`);
    const client = new CodexAppServerClient();
    await expect(client.start()).rejects.toThrow("not signed in");
    await expect(waitForFile(marker)).resolves.toBe("yes");
  });
});

async function waitForFile(path: string): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      return await readFile(path, "utf8");
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  throw new Error(`Timed out waiting for ${path}`);
}
