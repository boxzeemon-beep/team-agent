import { z } from "zod";
import packageMetadata from "../package.json" with { type: "json" };

/** Release version shared by the Coordinator and Runner at build time. */
export const TEAM_AGENT_VERSION = packageMetadata.version;

export const agentStatuses = ["online", "busy", "offline", "paused"] as const;
export const taskStatuses = [
  "queued",
  "waiting_for_agent",
  "running",
  "waiting_for_owner",
  "completed",
  "needs_attention",
  "canceled",
] as const;

export type AgentStatus = (typeof agentStatuses)[number];
export type TaskStatus = (typeof taskStatuses)[number];

export interface Member {
  id: string;
  name: string;
  isAdmin: boolean;
  createdAt: string;
}

export interface Agent {
  id: string;
  ownerMemberId: string;
  ownerName: string;
  displayName: string;
  status: AgentStatus;
  lastContextMessageSequence: number;
  lastSeenAt: string | null;
}

export interface ProjectSettings {
  projectName: string;
  repositoryUrl: string;
  baseBranch: string;
  sharedBranch: string;
  testCommand: string;
}

export interface TaskMessage {
  id: string;
  sequence: number;
  taskId: string;
  memberId: string | null;
  memberName: string;
  role: "member" | "agent" | "system";
  content: string;
  createdAt: string;
}

export const GOAL_WORKFLOW_CAPABILITY = "goal-workflow-v1";

export const goalBriefSchema = z
  .object({
    mode: z.enum(["direct", "verified"]),
    context: z.string().trim().max(10_000),
    acceptanceCriteria: z.array(z.string().trim().min(1).max(500)).max(12),
    maxIterations: z.number().int().min(1).max(3),
  })
  .superRefine((brief, context) => {
    if (brief.mode === "verified" && brief.acceptanceCriteria.length === 0)
      context.addIssue({
        code: "custom",
        path: ["acceptanceCriteria"],
        message: "A verified goal requires at least one acceptance criterion.",
      });
    if (
      new Set(brief.acceptanceCriteria).size !== brief.acceptanceCriteria.length
    )
      context.addIssue({
        code: "custom",
        path: ["acceptanceCriteria"],
        message: "Acceptance criteria must be unique.",
      });
  });

export const goalReviewSchema = z.object({
  iteration: z.number().int().min(1).max(3),
  verdict: z.enum(["pass", "revise", "blocked"]),
  summary: z.string().trim().min(1).max(8_000),
  checks: z
    .array(
      z.object({
        criterion: z.string().trim().min(1).max(500),
        status: z.enum(["pass", "fail", "unknown"]),
        evidence: z.string().trim().min(1).max(8_000),
      }),
    )
    .max(12),
  issues: z.array(z.string().trim().min(1).max(4_000)).max(20),
  reviewedTreeSha: z.string().min(1).max(200).optional(),
});

export const goalWorkflowSchema = z
  .object({
    phase: z.enum([
      "implementing",
      "testing",
      "reviewing",
      "revising",
      "publishing",
      "completed",
      "blocked",
    ]),
    iteration: z.number().int().min(1).max(3),
    maxIterations: z.number().int().min(1).max(3),
    sequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    testStatus: z.enum(["not_run", "passed", "failed", "not_configured"]),
    reviews: z.array(goalReviewSchema).max(3),
  })
  .refine((workflow) => workflow.iteration <= workflow.maxIterations, {
    message: "The current round cannot exceed the agreed limit.",
  });

export type GoalBrief = z.infer<typeof goalBriefSchema>;
export type GoalReview = z.infer<typeof goalReviewSchema>;
export type GoalWorkflow = z.infer<typeof goalWorkflowSchema>;

export function initialGoalWorkflow(brief: GoalBrief): GoalWorkflow {
  return {
    phase: "implementing",
    iteration: 1,
    maxIterations: brief.maxIterations,
    sequence: 0,
    testStatus: "not_run",
    reviews: [],
  };
}

/** Completion must account for every agreed criterion and a real reviewed tree. */
export function canCompleteGoal(
  brief: GoalBrief,
  workflow?: GoalWorkflow,
): boolean {
  const review = workflow?.reviews.at(-1);
  return Boolean(
    brief.mode === "verified" &&
      workflow &&
      review &&
      ["publishing", "completed"].includes(workflow.phase) &&
      workflow.testStatus === "passed" &&
      workflow.maxIterations === brief.maxIterations &&
      review.iteration === workflow.iteration &&
      review.verdict === "pass" &&
      review.issues.length === 0 &&
      /^[a-f\d]{40}(?:[a-f\d]{24})?$/i.test(review.reviewedTreeSha ?? "") &&
      review.checks.length === brief.acceptanceCriteria.length &&
      brief.acceptanceCriteria.every(
        (criterion) =>
          review.checks.filter(
            (check) => check.criterion === criterion && check.status === "pass",
          ).length === 1,
      ),
  );
}

export interface Task {
  id: string;
  requesterMemberId: string;
  requesterName: string;
  selectedAgentId: string;
  selectedAgentName: string;
  selectedAgentOwnerName: string;
  status: TaskStatus;
  prompt: string;
  progress: string;
  result: string;
  diff: string;
  testOutput: string;
  commitSha: string;
  error: string;
  assignedThroughMessageSequence: number;
  createdAt: string;
  updatedAt: string;
  messages: TaskMessage[];
  brief?: GoalBrief;
  workflow?: GoalWorkflow;
  runId?: string;
}

export interface DashboardSnapshot {
  me: Member;
  settings: ProjectSettings;
  agents: Agent[];
  tasks: Task[];
}

export interface ContextMessage {
  sequence: number;
  taskId: string;
  author: string;
  role: TaskMessage["role"];
  content: string;
  createdAt: string;
}

export interface TaskAssignment {
  taskId: string;
  agentId: string;
  agentDisplayName?: string;
  agentOwnerName?: string;
  requestedBy: string;
  requestMessages: ContextMessage[];
  contextMessages: ContextMessage[];
  contextThroughSequence: number;
  settings: ProjectSettings;
  brief?: GoalBrief;
  runId?: string;
}

/** Character limits for Runner-originated text persisted by the Coordinator. */
export const runnerTextLimits = {
  progress: 8_000,
  result: 100_000,
  diff: 500_000,
  testOutput: 200_000,
  attention: 20_000,
} as const;

export const textTruncationMarker = "\n...[truncated]";

/** Keeps the truncation marker inside `maxLength`, matching Zod string limits. */
export function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  if (maxLength <= textTruncationMarker.length)
    return textTruncationMarker.slice(0, maxLength);
  return `${value.slice(0, maxLength - textTruncationMarker.length)}${textTruncationMarker}`;
}

export const runnerClientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("runner.register"),
    pairingToken: z.string().optional(),
    runnerToken: z.string().optional(),
    deviceId: z.string(),
    displayName: z.string().min(1).max(80),
    activeTaskId: z.string().optional(),
    capabilities: z.array(z.string().min(1).max(100)).max(20).optional(),
  }),
  z.object({ type: z.literal("runner.heartbeat"), agentId: z.string() }),
  z.object({
    type: z.literal("task.progress"),
    taskId: z.string(),
    runId: z.string().min(1).max(200).optional(),
    message: z.string().max(runnerTextLimits.progress),
  }),
  z.object({
    type: z.literal("task.waiting_owner"),
    taskId: z.string(),
    runId: z.string().min(1).max(200).optional(),
    message: z.string().max(runnerTextLimits.progress),
  }),
  z.object({
    type: z.literal("task.complete"),
    taskId: z.string(),
    runId: z.string().min(1).max(200).optional(),
    result: z.string().max(runnerTextLimits.result),
    diff: z.string().max(runnerTextLimits.diff),
    testOutput: z.string().max(runnerTextLimits.testOutput),
    commitSha: z.string().min(1).max(200),
    contextThroughSequence: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal("task.needs_attention"),
    taskId: z.string(),
    runId: z.string().min(1).max(200).optional(),
    message: z.string().max(runnerTextLimits.attention),
    diff: z.string().max(runnerTextLimits.diff).default(""),
    testOutput: z.string().max(runnerTextLimits.testOutput).default(""),
  }),
  z.object({
    type: z.literal("task.workflow"),
    taskId: z.string(),
    runId: z.string().min(1).max(200),
    workflow: goalWorkflowSchema,
  }),
]);

export type RunnerClientMessage = z.infer<typeof runnerClientMessageSchema>;

export type RunnerServerMessage =
  | {
      type: "runner.registered";
      agentId: string;
      runnerToken: string;
      ownerMemberId: string;
    }
  | { type: "runner.ready"; agentId: string }
  | { type: "task.assign"; assignment: TaskAssignment }
  | { type: "runner.error"; message: string };

export interface PairingResponse {
  pairingToken: string;
  expiresAt: string;
  command: string;
  /** Run from this source checkout after building; PowerShell 7 or a POSIX shell. */
  sourceCommands?: { powershell: string; posix: string };
}

export interface InviteResponse {
  inviteUrl: string;
  expiresAt: string;
}

export const createTaskSchema = z.object({
  prompt: z.string().trim().min(1).max(20_000),
  agentId: z.string().min(1),
  brief: goalBriefSchema.optional(),
});

export const addTaskMessageSchema = z.object({
  content: z.string().trim().min(1).max(20_000),
});

export const projectSettingsSchema = z.object({
  projectName: z.string().trim().min(1).max(100),
  repositoryUrl: z.string().trim().min(1).max(2_000),
  baseBranch: z.string().trim().min(1).max(200),
  sharedBranch: z.string().trim().min(1).max(200),
  testCommand: z.string().trim().max(2_000),
});

export function isTerminalTaskStatus(status: TaskStatus): boolean {
  return (
    status === "completed" ||
    status === "needs_attention" ||
    status === "canceled"
  );
}
