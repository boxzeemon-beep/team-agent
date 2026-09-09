import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const entry = fileURLToPath(new URL("./index.ts", import.meta.url));

describe("Coordinator executable entry", () => {
  it("starts a reachable HTTP service when directly executed, including Windows paths", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "team-agent-entry-"));
    const child = spawn(process.execPath, ["--import", "tsx", entry], {
      env: {
        ...process.env,
        TEAM_AGENT_DATA_DIR: dataDir,
        TEAM_AGENT_PORT: "0",
        TEAM_AGENT_HOST: "127.0.0.1",
        TEAM_AGENT_LOG_LEVEL: "info",
      },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const exited = once(child, "exit");
    let output = "";
    try {
      const origin = await new Promise<string>((resolveStart, reject) => {
        const timeout = setTimeout(
          () =>
            reject(
              new Error("Coordinator never announced a listening HTTP server."),
            ),
          15000,
        );
        child.once("error", (error) => {
          clearTimeout(timeout);
          reject(error);
        });
        child.once("exit", () => {
          clearTimeout(timeout);
          reject(new Error("Coordinator exited without listening."));
        });
        child.stdout.on("data", (chunk) => {
          output += chunk.toString();
          const match = output.match(
            /Server listening at (http:\/\/127\.0\.0\.1:\d+)/,
          );
          if (match?.[1]) {
            clearTimeout(timeout);
            resolveStart(match[1]);
          }
        });
      });
      const response = await fetch(`${origin}/api/health`);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ status: "ok" });
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill();
      await exited;
      if (
        resolve(dirname(dataDir)) === resolve(tmpdir()) &&
        basename(dataDir).startsWith("team-agent-entry-")
      )
        rmSync(dataDir, { recursive: true, force: true });
    }
  }, 20000);

  it("can be imported as a library without starting a server", () => {
    const source = `await import(${JSON.stringify(pathToFileURL(entry).href)}); process.stdout.write("library-imported");`;
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "-e", source],
      { encoding: "utf8", windowsHide: true, timeout: 15000 },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("library-imported");
  });
});
