import { z } from "zod";

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
  }),
  z.object({ type: z.literal("runner.heartbeat"), agentId: z.string() }),
  z.object({
    type: z.literal("task.progress"),
    taskId: z.string(),
    message: z.string().max(runnerTextLimits.progress),
  }),
  z.object({
    type: z.literal("task.waiting_owner"),
    taskId: z.string(),
    message: z.string().max(runnerTextLimits.progress),
  }),
  z.object({
    type: z.literal("task.complete"),
    taskId: z.string(),
    result: z.string().max(runnerTextLimits.result),
    diff: z.string().max(runnerTextLimits.diff),
    testOutput: z.string().max(runnerTextLimits.testOutput),
    commitSha: z.string().min(1).max(200),
    contextThroughSequence: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal("task.needs_attention"),
    taskId: z.string(),
    message: z.string().max(runnerTextLimits.attention),
    diff: z.string().max(runnerTextLimits.diff).default(""),
    testOutput: z.string().max(runnerTextLimits.testOutput).default(""),
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
}

export interface InviteResponse {
  inviteUrl: string;
  expiresAt: string;
}

export const createTaskSchema = z.object({
  prompt: z.string().trim().min(1).max(20_000),
  agentId: z.string().min(1),
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
