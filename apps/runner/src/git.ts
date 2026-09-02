import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { ProjectSettings } from "@team-agent/shared";
import { checkedCommand, runCommand } from "./process.js";

export interface PreparedRepository {
  path: string;
  baselineSha: string;
  taskCommitSha?: string;
  taskCommitAlreadyPublished?: boolean;
}

export interface PrepareOptions {
  recoverTaskId?: string;
}

async function git(cwd: string, ...args: string[]): Promise<string> {
  return checkedCommand("git", args, cwd);
}

async function isAncestor(cwd: string, ancestor: string, descendant: string) {
  return (
    (
      await runCommand(
        "git",
        ["merge-base", "--is-ancestor", ancestor, descendant],
        {
          cwd,
        },
      )
    ).exitCode === 0
  );
}

async function taskAtHead(cwd: string, taskId: string) {
  const body = await git(cwd, "show", "-s", "--format=%B", "HEAD");
  return body
    .split("\n")
    .some((line) => line.trim() === `Team-Agent-Task: ${taskId}`)
    ? git(cwd, "rev-parse", "HEAD")
    : undefined;
}

export class GitWorkspace {
  constructor(private readonly projectsDir: string) {}

  async prepare(
    projectKey: string,
    settings: ProjectSettings,
    options: PrepareOptions = {},
  ): Promise<PreparedRepository> {
    await mkdir(this.projectsDir, { recursive: true });
    const path = join(this.projectsDir, projectKey);
    const probe = await runCommand(
      "git",
      ["-C", path, "rev-parse", "--git-dir"],
      {
        cwd: this.projectsDir,
      },
    );
    if (probe.exitCode !== 0) {
      await checkedCommand("git", ["clone", settings.repositoryUrl, path]);
    }
    const origin = await git(path, "remote", "get-url", "origin");
    if (origin !== settings.repositoryUrl) {
      throw new Error(
        `Managed clone origin mismatch: expected ${settings.repositoryUrl}, found ${origin}`,
      );
    }

    await git(path, "fetch", "--prune", "origin");
    const remoteRef = `refs/remotes/origin/${settings.sharedBranch}`;
    const remoteProbe = await runCommand(
      "git",
      ["show-ref", "--verify", remoteRef],
      {
        cwd: path,
      },
    );
    const remoteSha =
      remoteProbe.exitCode === 0
        ? await git(path, "rev-parse", remoteRef)
        : undefined;
    const dirty = await git(
      path,
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
    );
    const branch = await git(path, "branch", "--show-current");
    const head = await git(path, "rev-parse", "HEAD");

    if (options.recoverTaskId) {
      const taskCommitSha = await taskAtHead(path, options.recoverTaskId);
      if (branch !== settings.sharedBranch) {
        if (dirty || taskCommitSha)
          throw new Error(
            `Task ${options.recoverTaskId} owns this workspace, but it is on branch ${branch || "(detached)"}. Preserve it and inspect manually or use --reset-managed ${projectKey}.`,
          );
        // A process may stop after persisting activeTaskId but before checking
        // out the managed branch. A clean untouched clone can continue through
        // ordinary preparation below.
      } else if (taskCommitSha) {
        const baselineSha = await git(path, "rev-parse", `${taskCommitSha}^`);
        const taskCommitAlreadyPublished = remoteSha
          ? await isAncestor(path, taskCommitSha, remoteSha)
          : false;
        if (
          remoteSha &&
          !(await isAncestor(path, remoteSha, taskCommitSha)) &&
          !(await isAncestor(path, taskCommitSha, remoteSha))
        ) {
          throw new Error(
            `The preserved commit for task ${options.recoverTaskId} diverged from origin/${settings.sharedBranch}. It remains at ${taskCommitSha}; reconcile it or explicitly reset the managed workspace.`,
          );
        }
        if (dirty && taskCommitAlreadyPublished) {
          throw new Error(
            `Task ${options.recoverTaskId} is already present on origin/${settings.sharedBranch}, while its older local checkout also has new edits. The workspace was left untouched for manual inspection.`,
          );
        }
        return {
          path,
          baselineSha,
          taskCommitSha,
          ...(taskCommitAlreadyPublished ? { taskCommitAlreadyPublished } : {}),
        };
      } else if (dirty) {
        if (remoteSha && head !== remoteSha) {
          throw new Error(
            `Task ${options.recoverTaskId} has preserved edits on a base that differs from origin/${settings.sharedBranch}. The workspace was left untouched.`,
          );
        }
        return { path, baselineSha: head };
      }
      // activeTaskId can be persisted before Codex makes its first edit. A clean
      // workspace with no task commit can safely follow ordinary preparation.
    } else if (dirty) {
      throw new Error(
        `Managed workspace contains uncommitted files:\n${dirty}`,
      );
    }

    if (remoteSha) {
      // A local-only commit can be the only copy of a task after a failed push.
      // Ordinary preparation therefore never resets commits that origin lacks.
      if (!(await isAncestor(path, head, remoteSha))) {
        throw new Error(
          `Managed workspace has local commits not contained in origin/${settings.sharedBranch}. It was left untouched; retry its task or use --reset-managed ${projectKey}.`,
        );
      }
      await git(path, "checkout", "-B", settings.sharedBranch, remoteRef);
    } else {
      await git(
        path,
        "checkout",
        "-B",
        settings.sharedBranch,
        `origin/${settings.baseBranch}`,
      );
    }
    return { path, baselineSha: await git(path, "rev-parse", "HEAD") };
  }

  async finish(
    repository: PreparedRepository,
    details: {
      taskId: string;
      requester: string;
      agent: string;
      testCommand: string;
      sharedBranch: string;
    },
  ): Promise<{ diff: string; testOutput: string; commitSha: string }> {
    const { path, baselineSha } = repository;
    const testOutput = await this.test(path, details.testCommand);
    try {
      const dirty =
        (await git(
          path,
          "status",
          "--porcelain=v1",
          "--untracked-files=all",
        )) !== "";
      const existingTaskCommit = await taskAtHead(path, details.taskId);
      const message = [
        `Complete team task ${details.taskId}`,
        "",
        `Team-Agent-Task: ${details.taskId}`,
        `Team-Agent-Requester: ${details.requester}`,
        `Team-Agent-Agent: ${details.agent}`,
      ].join("\n");

      if (dirty) await git(path, "add", "--all");
      if (existingTaskCommit) {
        if (dirty) {
          await checkedCommand(
            "git",
            [
              "-c",
              "user.name=Team Agent",
              "-c",
              "user.email=team-agent@local",
              "commit",
              "--amend",
              "-m",
              message,
            ],
            path,
          );
        }
      } else {
        await checkedCommand(
          "git",
          [
            "-c",
            "user.name=Team Agent",
            "-c",
            "user.email=team-agent@local",
            "commit",
            ...(dirty ? [] : ["--allow-empty"]),
            "-m",
            message,
          ],
          path,
        );
      }

      const commitSha = await git(path, "rev-parse", "HEAD");
      const diff = await git(
        path,
        "diff",
        "--no-ext-diff",
        "--no-color",
        `${baselineSha}..${commitSha}`,
      );
      if (!repository.taskCommitAlreadyPublished) {
        await git(path, "push", "origin", `HEAD:${details.sharedBranch}`);
      }
      return { diff, testOutput, commitSha };
    } catch (error) {
      if (error && typeof error === "object")
        Object.assign(error, { testOutput });
      throw error;
    }
  }

  async diagnosticDiff(repository: PreparedRepository): Promise<string> {
    await runCommand("git", ["add", "--intent-to-add", "--all"], {
      cwd: repository.path,
    });
    const committed = await runCommand(
      "git",
      [
        "diff",
        "--no-ext-diff",
        "--no-color",
        `${repository.baselineSha}..HEAD`,
      ],
      { cwd: repository.path },
    );
    const working = await runCommand(
      "git",
      ["diff", "--no-ext-diff", "--no-color", "HEAD"],
      { cwd: repository.path },
    );
    return [committed.stdout, working.stdout].filter(Boolean).join("\n");
  }

  async reset(projectKey: string): Promise<void> {
    const path = join(this.projectsDir, projectKey);
    await git(path, "fetch", "--prune", "origin");
    const branch = await git(path, "branch", "--show-current");
    const remote = `refs/remotes/origin/${branch}`;
    const remoteProbe = await runCommand(
      "git",
      ["show-ref", "--verify", remote],
      {
        cwd: path,
      },
    );
    const originHead = await runCommand(
      "git",
      ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"],
      { cwd: path },
    );
    await git(
      path,
      "reset",
      "--hard",
      remoteProbe.exitCode === 0
        ? remote
        : originHead.exitCode === 0
          ? originHead.stdout.trim()
          : "HEAD",
    );
    await git(path, "clean", "-fd");
  }

  private async test(cwd: string, command: string): Promise<string> {
    if (!command.trim()) return "No test command configured.";
    const result = await runCommand(command, [], { cwd, shell: true });
    const output = [result.stdout, result.stderr]
      .filter(Boolean)
      .join("\n")
      .trim();
    if (result.exitCode !== 0) {
      const error = new Error(`Tests failed (${result.exitCode})\n${output}`);
      Object.assign(error, { testOutput: output });
      throw error;
    }
    return output || "Tests passed.";
  }
}
