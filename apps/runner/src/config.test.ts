import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { StateStore } from "./config.js";

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
