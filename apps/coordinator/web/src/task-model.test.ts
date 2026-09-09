import type { Task } from "@team-agent/shared";
import { describe, expect, it } from "vitest";
import { parseDiff, selectTasks } from "./task-model.js";

describe("reviewable task evidence", () => {
  it("does not count a prose preamble as a changed file", () => {
    expect(
      parseDiff(
        "# simulated evidence\ndiff --git a/app.ts b/app.ts\n@@ -1 +1 @@\n-old\n+new",
      ).map((file) => file.path),
    ).toEqual(["app.ts"]);
  });
  it("tracks old and new line numbers across multiple hunks and files", () => {
    const files = parseDiff(
      "diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -4,2 +4,3 @@\n keep\n-old\n+new\n+more\n@@ -12 +13 @@\n-last\n+changed\ndiff --git a/b.ts b/b.ts\nBinary files differ\n",
    );
    expect(
      files.map(({ path, additions, deletions }) => ({
        path,
        additions,
        deletions,
      })),
    ).toEqual([
      { path: "a.ts", additions: 3, deletions: 2 },
      { path: "b.ts", additions: 0, deletions: 0 },
    ]);
    expect(
      files[0]?.lines
        .filter((line) => line.kind === "add")
        .map((line) => line.newLine),
    ).toEqual([5, 6, 13]);
    expect(
      files[0]?.lines
        .filter((line) => line.kind === "remove")
        .map((line) => line.oldLine),
    ).toEqual([5, 12]);
  });
  it("does not interpret source beginning with plus signs as a file header inside a hunk", () => {
    const files = parseDiff(
      "diff --git a/a b/a\n@@ -1 +1 @@\n---old\n+++new\n",
    );
    expect(files[0]?.additions).toBe(1);
    expect(files[0]?.deletions).toBe(1);
    expect(parseDiff("")).toEqual([]);
  });
  it("combines attention status, owner and case-insensitive text filters", () => {
    const task = {
      id: "task-1",
      prompt: "Repair OAuth refresh",
      requesterMemberId: "me",
      requesterName: "Lin",
      selectedAgentName: "Forge",
      status: "waiting_for_owner",
      createdAt: "2026-09-09",
    } as Task;
    expect(selectTasks([task], "attention", " OAUTH ", "me")).toEqual([task]);
    expect(selectTasks([task], "completed", "", "me")).toEqual([]);
    expect(selectTasks([task], "all", "", "other")).toEqual([]);
  });
});
