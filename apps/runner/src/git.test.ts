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
  it("publishes exactly the independently reviewed tree without re-running tests", async () => {
    const { settings, workspace, remote } = await fixture();
    const prepared = await workspace.prepare("project", settings);
    await writeFile(join(prepared.path, "README.md"), "reviewed behavior\n");
    const tree = await workspace.snapshotTree(prepared);
    const head = await workspace.head(prepared);
    const published = await workspace.publish(prepared, {
      taskId: "verified-pass",
      requester: "Member",
      agent: "Reviewer",
      sharedBranch: settings.sharedBranch,
      expectedTreeSha: tree,
      expectedHeadSha: head,
    });
    expect(
      await checkedCommand(
        "git",
        ["rev-parse", `${published.commitSha}^{tree}`],
        remote,
      ),
    ).toBe(tree);
    expect(
      await checkedCommand("git", ["rev-parse", settings.sharedBranch], remote),
    ).toBe(published.commitSha);
  });

  it("preserves edits and refuses publication when files change after acceptance", async () => {
    const { settings, workspace, remote } = await fixture();
    const prepared = await workspace.prepare("project", settings);
    await writeFile(join(prepared.path, "README.md"), "reviewed version\n");
    const tree = await workspace.snapshotTree(prepared);
    await writeFile(
      join(prepared.path, "README.md"),
      "unexpected later edit\n",
    );
    await expect(
      workspace.publish(prepared, {
        taskId: "verified-write",
        requester: "Member",
        agent: "Reviewer",
        sharedBranch: settings.sharedBranch,
        expectedTreeSha: tree,
      }),
    ).rejects.toThrow("changed after independent review");
    expect(await workspace.head(prepared)).toBe(prepared.baselineSha);
    expect(await readFile(join(prepared.path, "README.md"), "utf8")).toBe(
      "unexpected later edit\n",
    );
    await expect(
      checkedCommand("git", ["rev-parse", settings.sharedBranch], remote),
    ).rejects.toThrow();
  });

  it("preserves a checkpoint's clean baseline instead of resetting an interrupted goal", async () => {
    const { settings, workspace } = await fixture();
    const prepared = await workspace.prepare("project", settings);
    const recovered = await workspace.prepare("project", settings, {
      recoverTaskId: "verified-clean",
      recoverBaselineSha: prepared.baselineSha,
    });
    expect(recovered.baselineSha).toBe(prepared.baselineSha);
    expect(await workspace.head(recovered)).toBe(prepared.baselineSha);
  });

  it("rejects a commit hook that substitutes unreviewed code before the push", async () => {
    const { settings, workspace, remote } = await fixture();
    const prepared = await workspace.prepare("project", settings);
    await writeFile(
      join(prepared.path, "README.md"),
      "independently reviewed\n",
    );
    const tree = await workspace.snapshotTree(prepared);
    await writeFile(
      join(prepared.path, ".git", "hooks", "pre-commit"),
      "#!/bin/sh\nprintf 'unreviewed hook change\\n' > README.md\ngit add README.md\n",
      { mode: 0o755 },
    );
    await expect(
      workspace.publish(prepared, {
        taskId: "verified-hook",
        requester: "Member",
        agent: "Reviewer",
        sharedBranch: settings.sharedBranch,
        expectedTreeSha: tree,
      }),
    ).rejects.toThrow("changed after independent review");
    await expect(
      checkedCommand("git", ["rev-parse", settings.sharedBranch], remote),
    ).rejects.toThrow();
    expect(await readFile(join(prepared.path, "README.md"), "utf8")).toBe(
      "unreviewed hook change\n",
    );
  });

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

  it("preserves the published commit when recovery verification changes files", async () => {
    const { settings, workspace } = await fixture();
    const prepared = await workspace.prepare("project", settings);
    const details = {
      taskId: "task-published",
      requester: "Requester",
      agent: "Agent",
      testCommand: "",
      sharedBranch: settings.sharedBranch,
    };
    // Test tools can update snapshots or generated files during verification.
    // This command only references fixture-local paths and contains no shell
    // interpolation; it works with both cmd.exe and POSIX shells.
    await writeFile(
      join(prepared.path, "verify.cjs"),
      'require("node:fs").writeFileSync("README.md", "verification changed me\\n"); console.log("verification ran");',
    );
    const published = await workspace.finish(prepared, details);
    const recovered = await workspace.prepare("project", settings, {
      recoverTaskId: details.taskId,
    });
    expect(recovered.taskCommitAlreadyPublished).toBe(true);
    await expect(
      workspace.finish(recovered, {
        ...details,
        testCommand: "node verify.cjs",
      }),
    ).rejects.toMatchObject({
      message: expect.stringContaining("already published task checkout"),
      testOutput: "verification ran",
    });
    expect(
      await checkedCommand("git", ["rev-parse", "HEAD"], prepared.path),
    ).toBe(published.commitSha);
    expect(
      await checkedCommand(
        "git",
        ["rev-parse", `origin/${settings.sharedBranch}`],
        prepared.path,
      ),
    ).toBe(published.commitSha);
    expect(await readFile(join(prepared.path, "README.md"), "utf8")).toBe(
      "verification changed me\n",
    );
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
