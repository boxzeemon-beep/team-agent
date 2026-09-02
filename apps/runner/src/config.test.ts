import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  defaultRunnerDataDir,
  parseCliOptions,
  parseDoctorOptions,
  StateStore,
} from "./config.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("runner process lock", () => {
  it("allows only one process owner per data directory and releases cleanly", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "team-agent-lock-"));
    temporaryDirectories.push(dataDir);
    const first = new StateStore(dataDir);
    const second = new StateStore(dataDir);
    await first.acquireProcessLock();
    await expect(second.acquireProcessLock()).rejects.toThrow(
      /already owns data directory/,
    );
    await first.releaseProcessLock();
    await second.acquireProcessLock();
    await second.releaseProcessLock();
  });
});

describe("Runner CLI options", () => {
  it("uses the public Team Agent data directory", () => {
    expect(
      parseCliOptions(["--coordinator", "http://localhost:4310"]).dataDir,
    ).toBe(defaultRunnerDataDir);
    expect(defaultRunnerDataDir).toContain(".team-agent/runner");
    expect(defaultRunnerDataDir).not.toContain("alpha");
  });

  it("accepts optional doctor settings", () => {
    expect(
      parseDoctorOptions([
        "--coordinator",
        "https://team-agent.example",
        "--data-dir",
        "/tmp/runner",
      ]),
    ).toEqual({
      coordinator: "https://team-agent.example",
      dataDir: "/tmp/runner",
    });
  });
});
