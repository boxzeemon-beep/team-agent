import type { Task } from "@team-agent/shared";

export type TaskFilter = "all" | "active" | "attention" | "completed";
export function matchesFilter(task: Task, filter: TaskFilter) {
  if (filter === "active")
    return [
      "queued",
      "waiting_for_agent",
      "running",
      "waiting_for_owner",
    ].includes(task.status);
  if (filter === "attention")
    return [
      "needs_attention",
      "waiting_for_owner",
      "waiting_for_agent",
    ].includes(task.status);
  if (filter === "completed") return task.status === "completed";
  return true;
}
export function selectTasks(
  tasks: Task[],
  filter: TaskFilter,
  query: string,
  mineId?: string,
) {
  const search = query.trim().toLocaleLowerCase();
  return tasks
    .filter(
      (task) =>
        matchesFilter(task, filter) &&
        (!mineId || task.requesterMemberId === mineId) &&
        (!search ||
          [
            task.prompt,
            task.selectedAgentName,
            task.requesterName,
            task.id,
            task.brief?.context ?? "",
            ...(task.brief?.acceptanceCriteria ?? []),
          ].some((value) => value.toLocaleLowerCase().includes(search))),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export interface DiffLine {
  kind: "add" | "remove" | "context" | "meta";
  content: string;
  oldLine: number | null;
  newLine: number | null;
}
export interface DiffFile {
  path: string;
  lines: DiffLine[];
  additions: number;
  deletions: number;
}

/** Display unified diffs as text. Never render patch contents as HTML. */
export function parseDiff(diff: string): DiffFile[] {
  const files: DiffFile[] = [];
  let current: DiffFile | undefined;
  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;
  const hasGitHeaders = /^diff --git /m.test(diff);
  for (const content of diff.split(/\r?\n/)) {
    if (content.startsWith("diff --git ")) {
      current = {
        path: content.match(/ b\/(.+)$/)?.[1] ?? content.slice(11),
        lines: [],
        additions: 0,
        deletions: 0,
      };
      files.push(current);
      inHunk = false;
      continue;
    }
    if (!current) {
      // A prose preamble is not a changed file. Demo labels and tool notes can
      // precede the first Git header without inflating the evidence counts.
      if (hasGitHeaders) continue;
      if (!content.trim()) continue;
      current = { path: "Changes", lines: [], additions: 0, deletions: 0 };
      files.push(current);
    }
    const hunk = content.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      inHunk = true;
    }
    let kind: DiffLine["kind"] = "meta";
    let oldNumber: number | null = null;
    let newNumber: number | null = null;
    if (inHunk && !hunk) {
      if (content.startsWith("+")) {
        kind = "add";
        current.additions++;
        newNumber = newLine++;
      } else if (content.startsWith("-")) {
        kind = "remove";
        current.deletions++;
        oldNumber = oldLine++;
      } else if (content.startsWith(" ")) {
        kind = "context";
        oldNumber = oldLine++;
        newNumber = newLine++;
      }
    }
    current.lines.push({
      kind,
      content,
      oldLine: oldNumber,
      newLine: newNumber,
    });
  }
  return files;
}
export function evidenceReport(task: Task, simulated: boolean) {
  const codeBlock = (text: string, language = "text") => {
    const longestRun = Math.max(
      2,
      ...(text.match(/`+/g) ?? []).map((run) => run.length),
    );
    const fence = "`".repeat(longestRun + 1);
    return `${fence}${language}\n${text}\n${fence}`;
  };
  return [
    `# ${task.prompt}`,
    simulated
      ? "> Simulated demo record: no Codex calls, Git operations, or tests were executed."
      : "",
    `Status: ${task.status}`,
    `Task ID: ${task.id}`,
    `Run ID: ${task.runId || "Not recorded in this older task"}`,
    `Requested by: ${task.requesterName}`,
    `Agent: ${task.selectedAgentName} (${task.selectedAgentOwnerName})`,
    `Created: ${task.createdAt}`,
    `Updated: ${task.updatedAt}`,
    ...(task.brief
      ? [
          "\n## Goal brief\n",
          `Execution mode: ${task.brief.mode === "verified" ? "Verified goal" : "Direct task"}`,
          `Maximum implementation and review rounds: ${task.brief.maxIterations}`,
          `Context: ${task.brief.context || "Not provided"}`,
          ...task.brief.acceptanceCriteria.map(
            (criterion, index) => `${index + 1}. ${criterion}`,
          ),
        ]
      : []),
    ...(task.workflow
      ? [
          "\n## Acceptance record\n",
          `Phase: ${task.workflow.phase}; round ${task.workflow.iteration}; tests: ${task.workflow.testStatus}`,
          `Checkpoint sequence: ${task.workflow.sequence}`,
          "Reviews use a fresh read-only Codex session, except in simulations. Criteria without evidence cannot be counted as passed.",
          ...task.workflow.reviews.flatMap((review) => [
            `\n### Round ${review.iteration}: ${review.verdict}\n`,
            review.summary,
            `Reviewed Git tree: ${review.reviewedTreeSha || "Not recorded"}`,
            ...review.checks.map(
              (check) =>
                `- [${check.status === "pass" ? "x" : " "}] ${check.criterion} (${check.status})\n  Evidence: ${check.evidence}`,
            ),
            ...review.issues.map((issue) => `- Issue: ${issue}`),
          ]),
        ]
      : []),
    "\n## Result\n",
    task.result || "No result yet",
    "\n## Needs attention\n",
    task.error || "None",
    "\n## Code changes\n",
    task.diff ? codeBlock(task.diff, "diff") : "None",
    "\n## Raw test output\n",
    task.testOutput
      ? codeBlock(task.testOutput)
      : "No test output was recorded. Test success cannot be inferred.",
    "\n## Commit\n",
    task.commitSha || "None",
    "\n## Activity\n",
    ...task.messages.map(
      (message) =>
        `${message.createdAt} · ${message.memberName}\n${message.content}\n`,
    ),
  ].join("\n");
}
