import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProjectSettings } from "@team-agent/shared";
import { afterEach, describe, expect, it } from "vitest";
import { GitWorkspace } from "./git.js";
import { checkedCommand } from "./process.js";

const temporaryDirectories: string[] = [];

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "team-agent-git-"));
  temporaryDirectories.push(root);
  const remote = join(root, "remote.git");
  const seed = join(root, "seed");
  await checkedCommand("git", ["init", "--bare", remote]);
  await checkedCommand("git", ["clone", remote, seed]);
  await writeFile(join(seed, "README.md"), "seed\n");
  await checkedCommand("git", ["add", "."], seed);
  await checkedCommand(
    "git",
    [
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@local",
      "commit",
      "-m",
      "seed",
    ],
    seed,
  );
  await checkedCommand("git", ["branch", "-M", "main"], seed);
  await checkedCommand("git", ["push", "-u", "origin", "main"], seed);
  await checkedCommand(
    "git",
    ["symbolic-ref", "HEAD", "refs/heads/main"],
    remote,
  );
  const settings: ProjectSettings = {
    projectName: "Fixture",
    repositoryUrl: remote,
    baseBranch: "main",
    sharedBranch: "internal-alpha",
    testCommand: "",
  };
  const projects = join(root, "projects");
  return { root, remote, settings, workspace: new GitWorkspace(projects) };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })),
  );
});

describe("GitWorkspace recovery", () => {
  it("keeps dirty edits for the same task and creates an auditable commit", async () => {
    const { settings, workspace } = await fixture();
    const prepared = await workspace.prepare("project", settings);
    await writeFile(join(prepared.path, "README.md"), "continued work\n");

    const recovered = await workspace.prepare("project", settings, {
      recoverTaskId: "task-dirty",
    });
    expect(await readFile(join(recovered.path, "README.md"), "utf8")).toBe(
      "continued work\n",
    );
    const finished = await workspace.finish(recovered, {
      taskId: "task-dirty",
      requester: "Requester",
      agent: "Owner's Codex",
      testCommand: "",
      sharedBranch: "internal-alpha",
    });
    const body = await checkedCommand(
      "git",
      ["show", "-s", "--format=%B", finished.commitSha],
      recovered.path,
    );
    expect(body).toContain("Team-Agent-Task: task-dirty");
  });

  it("creates and publishes an empty audit commit when Codex changes no files", async () => {
    const { settings, workspace } = await fixture();
    const prepared = await workspace.prepare("project", settings);
    const finished = await workspace.finish(prepared, {
      taskId: "task-empty",
      requester: "Requester",
      agent: "Agent",
      testCommand: "",
      sharedBranch: "internal-alpha",
    });
    expect(finished.commitSha).not.toBe(prepared.baselineSha);
    expect(finished.diff).toBe("");
    expect(
      await checkedCommand(
        "git",
        ["show", "-s", "--format=%B", "HEAD"],
        prepared.path,
      ),
    ).toContain("Team-Agent-Task: task-empty");
  });

  it("reuses a task commit left by a failed push instead of resetting it", async () => {
    const { remote, settings, workspace } = await fixture();
    const prepared = await workspace.prepare("project", settings);
    await writeFile(join(prepared.path, "README.md"), "valuable work\n");
    await checkedCommand(
      "git",
      ["remote", "set-url", "origin", join(prepared.path, "missing")],
      prepared.path,
    );
    await expect(
      workspace.finish(prepared, {
        taskId: "task-push",
        requester: "Requester",
        agent: "Agent",
        testCommand: "",
        sharedBranch: "internal-alpha",
      }),
    ).rejects.toThrow();
    const preservedSha = await checkedCommand(
      "git",
      ["rev-parse", "HEAD"],
      prepared.path,
    );
    await checkedCommand(
      "git",
      ["remote", "set-url", "origin", remote],
      prepared.path,
    );

    const recovered = await workspace.prepare("project", settings, {
      recoverTaskId: "task-push",
    });
    expect(recovered.taskCommitSha).toBe(preservedSha);
    const finished = await workspace.finish(recovered, {
      taskId: "task-push",
      requester: "Requester",
      agent: "Agent",
      testCommand: "",
      sharedBranch: "internal-alpha",
    });
    expect(finished.commitSha).toBe(preservedSha);
    expect(
      await checkedCommand(
        "git",
        ["rev-parse", "origin/internal-alpha"],
        prepared.path,
      ),
    ).toBe(preservedSha);
  });

  it("only discards preserved commits through explicit reset", async () => {
    const { settings, workspace } = await fixture();
    const prepared = await workspace.prepare("project", settings);
    await workspace.finish(prepared, {
      taskId: "task-reset",
      requester: "Requester",
      agent: "Agent",
      testCommand: "",
      sharedBranch: "internal-alpha",
    });
    await writeFile(join(prepared.path, "local.txt"), "discard me\n");
    await workspace.reset("project");
    await expect(
      readFile(join(prepared.path, "local.txt"), "utf8"),
    ).rejects.toThrow();
  });
});
