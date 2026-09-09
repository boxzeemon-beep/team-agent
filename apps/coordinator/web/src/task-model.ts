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
      current = { path: "变更记录", lines: [], additions: 0, deletions: 0 };
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
    simulated ? "> 模拟演示记录：没有调用 Codex，也没有执行 Git 或测试。" : "",
    `状态：${task.status}`,
    `任务 ID：${task.id}`,
    `运行 ID：${task.runId || "旧版记录未提供"}`,
    `发起人：${task.requesterName}`,
    `Agent：${task.selectedAgentName}（${task.selectedAgentOwnerName}）`,
    `创建时间：${task.createdAt}`,
    `更新时间：${task.updatedAt}`,
    ...(task.brief
      ? [
          "\n## 目标契约\n",
          `执行方式：${task.brief.mode === "verified" ? "实现并独立验收" : "直接执行"}`,
          `最多实现与验收轮数：${task.brief.maxIterations}`,
          `背景：${task.brief.context || "未补充"}`,
          ...task.brief.acceptanceCriteria.map(
            (criterion, index) => `${index + 1}. ${criterion}`,
          ),
        ]
      : []),
    ...(task.workflow
      ? [
          "\n## 验收记录\n",
          `阶段：${task.workflow.phase}；第 ${task.workflow.iteration} 轮；测试：${task.workflow.testStatus}`,
          `检查点序号：${task.workflow.sequence}`,
          "独立审查使用新只读 Codex 会话；演示记录除外。没有记录的标准不能认定通过。",
          ...task.workflow.reviews.flatMap((review) => [
            `\n### 第 ${review.iteration} 轮：${review.verdict}\n`,
            review.summary,
            `被审查代码树：${review.reviewedTreeSha || "未记录"}`,
            ...review.checks.map(
              (check) =>
                `- [${check.status === "pass" ? "x" : " "}] ${check.criterion}（${check.status}）\n  证据：${check.evidence}`,
            ),
            ...review.issues.map((issue) => `- 问题：${issue}`),
          ]),
        ]
      : []),
    "\n## 结果\n",
    task.result || "尚无结果",
    "\n## 需要处理\n",
    task.error || "无",
    "\n## 代码差异\n",
    task.diff ? codeBlock(task.diff, "diff") : "无",
    "\n## 测试原始输出\n",
    task.testOutput
      ? codeBlock(task.testOutput)
      : "没有测试输出，无法据此认定测试通过。",
    "\n## 提交\n",
    task.commitSha || "无",
    "\n## 协作记录\n",
    ...task.messages.map(
      (message) =>
        `${message.createdAt} · ${message.memberName}\n${message.content}\n`,
    ),
  ].join("\n");
}
