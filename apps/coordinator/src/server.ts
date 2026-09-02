import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import {
  type Agent,
  addTaskMessageSchema,
  type ContextMessage,
  createTaskSchema,
  type Member,
  type PairingResponse,
  projectSettingsSchema,
  type RunnerServerMessage,
  runnerClientMessageSchema,
  type Task,
  type TaskAssignment,
} from "@team-agent/shared";
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import type { WebSocket } from "ws";
import { CoordinatorDatabase } from "./database.js";

const SESSION_COOKIE = "team_agent_session";
const DEFAULT_INVITE_TTL = 7 * 24 * 60 * 60_000;
const PAIRING_TTL = 15 * 60_000;

function token(): string {
  return randomBytes(32).toString("base64url");
}
function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
function expiresIn(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

export interface CoordinatorOptions {
  databasePath?: string;
  publicUrl?: string;
  logger?: boolean | object;
  webRoot?: string;
  heartbeatTimeoutMs?: number;
  heartbeatCheckMs?: number;
}

export interface CoordinatorApp {
  app: FastifyInstance;
  db: CoordinatorDatabase;
  bootstrapInvite: { token: string; url: string; expiresAt: string } | null;
  schedule: () => void;
}

interface RunnerConnection {
  socket: WebSocket;
  agentId: string;
  lastHeartbeat: number;
}

export async function createApp(
  options: CoordinatorOptions = {},
): Promise<CoordinatorApp> {
  const dbPath =
    options.databasePath ??
    join(
      process.env.TEAM_AGENT_DATA_DIR ?? ".data/coordinator",
      "coordinator.sqlite",
    );
  if (dbPath !== ":memory:")
    mkdirSync(dirname(resolve(dbPath)), { recursive: true });
  const db = new CoordinatorDatabase(dbPath);
  db.normalizeAfterRestart();
  const runnerCredentialSecret = db.getOrCreateSecret(
    "runner-credential-hmac-v1",
    token(),
  );
  const publicUrl = (
    options.publicUrl ??
    process.env.TEAM_AGENT_PUBLIC_URL ??
    "http://127.0.0.1:4310"
  ).replace(/\/$/, "");
  const app = Fastify({ logger: options.logger ?? false });
  await app.register(cookie);
  await app.register(websocket);

  const runners = new Map<string, RunnerConnection>();
  const streams = new Set<FastifyReply>();
  let scheduling = false;
  let closing = false;

  const makeInvite = (isAdmin: boolean, ttl = DEFAULT_INVITE_TTL) => {
    const raw = token();
    const expiresAt = expiresIn(ttl);
    db.createInvite(randomUUID(), hash(raw), isAdmin, expiresAt);
    return {
      token: raw,
      expiresAt,
      url: `${publicUrl}/invite?token=${encodeURIComponent(raw)}`,
    };
  };
  const makeBootstrapInvite = () => {
    const raw = token();
    const expiresAt = expiresIn(DEFAULT_INVITE_TTL);
    if (!db.replaceBootstrapInvite(randomUUID(), hash(raw), expiresAt))
      return null;
    return {
      token: raw,
      expiresAt,
      url: `${publicUrl}/invite?token=${encodeURIComponent(raw)}`,
    };
  };
  const bootstrapInvite =
    db.countMembers() === 0 ? makeBootstrapInvite() : null;

  const authenticated = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<Member | undefined> => {
    const raw = request.cookies[SESSION_COOKIE];
    const member = raw ? db.memberBySessionHash(hash(raw)) : null;
    if (!member) {
      await reply.code(401).send({ error: "authentication_required" });
      return undefined;
    }
    return member;
  };

  const broadcast = () => {
    for (const reply of streams) {
      try {
        const raw = reply.request.cookies[SESSION_COOKIE];
        const member = raw ? db.memberBySessionHash(hash(raw)) : null;
        if (member)
          reply.raw.write(
            `event: snapshot\ndata: ${JSON.stringify(db.snapshot(member))}\n\n`,
          );
      } catch {
        streams.delete(reply);
      }
    }
  };

  const send = (socket: WebSocket, message: RunnerServerMessage) =>
    socket.send(JSON.stringify(message));
  const isConnected = (agentId: string): boolean =>
    runners.get(agentId)?.socket.readyState === 1;

  const deriveRunnerToken = (pairingToken: string, deviceId: string): string =>
    createHmac("sha256", runnerCredentialSecret)
      .update(JSON.stringify([pairingToken, deviceId]))
      .digest("base64url");

  const assignmentFor = (
    task: Task,
    agent: Agent,
    persistedThrough?: number,
  ): TaskAssignment => {
    const requestMessages: ContextMessage[] = task.messages
      .filter(
        (message) =>
          persistedThrough === undefined ||
          message.sequence <= persistedThrough,
      )
      .map((message) => ({
        sequence: message.sequence,
        taskId: message.taskId,
        author: message.memberName,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
      }));
    let contextMessages = db.contextAfter(
      agent.lastContextMessageSequence,
      task.id,
    );
    if (persistedThrough !== undefined)
      contextMessages = contextMessages.filter(
        (message) => message.sequence <= persistedThrough,
      );
    const contextThroughSequence =
      persistedThrough ??
      Math.max(
        agent.lastContextMessageSequence,
        ...requestMessages.map((message) => message.sequence),
        ...contextMessages.map((message) => message.sequence),
      );
    return {
      taskId: task.id,
      agentId: agent.id,
      agentDisplayName: agent.displayName,
      agentOwnerName: agent.ownerName,
      requestedBy: task.requesterName,
      requestMessages,
      contextMessages,
      contextThroughSequence,
      settings: db.getSettings(),
    };
  };

  const resumeActiveTask = (agent: Agent, socket: WebSocket): boolean => {
    const task = db.activeTaskForAgent(agent.id);
    if (!task) return false;
    const persisted = db.activeAssignmentForAgent(agent.id);
    send(socket, {
      type: "task.assign",
      // Only pre-migration active rows need reconstruction.
      assignment:
        persisted ??
        assignmentFor(task, agent, task.assignedThroughMessageSequence),
    });
    return true;
  };

  const schedule = () => {
    if (scheduling) return;
    scheduling = true;
    try {
      if (db.hasActiveTask()) return;
      const online = [...runners.keys()].filter(
        (agentId) =>
          isConnected(agentId) && db.agentById(agentId)?.status === "online",
      );
      const task = db.earliestRunnable(online);
      if (!task) return;
      const agent = db.agentById(task.selectedAgentId);
      const connection = runners.get(task.selectedAgentId);
      if (!agent || !connection || connection.socket.readyState !== 1) return;
      const assignment = assignmentFor(task, agent);
      if (
        !db.assignTask(
          task.id,
          agent.id,
          assignment.contextThroughSequence,
          assignment,
        )
      )
        return;
      send(connection.socket, { type: "task.assign", assignment });
      broadcast();
    } finally {
      scheduling = false;
    }
  };

  app.post("/api/invites/claim", async (request, reply) => {
    const body = request.body as { token?: unknown; name?: unknown };
    if (
      typeof body?.token !== "string" ||
      typeof body.name !== "string" ||
      !body.name.trim() ||
      body.name.trim().length > 80
    ) {
      return reply.code(400).send({ error: "invalid_invite_claim" });
    }
    const session = token();
    const member = db.claimInvite(
      hash(body.token),
      randomUUID(),
      body.name.trim(),
      hash(session),
    );
    if (!member)
      return reply.code(400).send({ error: "invite_invalid_or_expired" });
    reply.setCookie(SESSION_COOKIE, session, {
      path: "/",
      httpOnly: true,
      sameSite: "strict",
      secure: publicUrl.startsWith("https://"),
      maxAge: 365 * 24 * 60 * 60,
    });
    broadcast();
    return { member };
  });

  app.get("/api/snapshot", async (request, reply) => {
    const member = await authenticated(request, reply);
    if (member) return db.snapshot(member);
  });

  app.get("/api/me", async (request, reply) => {
    const member = await authenticated(request, reply);
    if (member) return member;
  });

  app.post("/api/logout", async (request, reply) => {
    const member = await authenticated(request, reply);
    if (!member) return;
    db.clearMemberSession(member.id);
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  });

  app.get("/api/agents", async (request, reply) => {
    if (!(await authenticated(request, reply))) return;
    return db.listAgents();
  });

  app.post("/api/invites", async (request, reply) => {
    const member = await authenticated(request, reply);
    if (!member) return;
    if (!member.isAdmin)
      return reply.code(403).send({ error: "admin_required" });
    const invite = makeInvite(false);
    return { inviteUrl: invite.url, expiresAt: invite.expiresAt };
  });

  app.put("/api/settings", async (request, reply) => {
    const member = await authenticated(request, reply);
    if (!member) return;
    if (!member.isAdmin)
      return reply.code(403).send({ error: "admin_required" });
    const parsed = projectSettingsSchema.safeParse(request.body);
    if (!parsed.success)
      return reply
        .code(400)
        .send({ error: "invalid_settings", issues: parsed.error.issues });
    const settings = db.updateSettings(parsed.data);
    broadcast();
    return settings;
  });

  app.post("/api/agents/pair", async (request, reply) => {
    const member = await authenticated(request, reply);
    if (!member) return;
    const displayName =
      typeof (request.body as { displayName?: unknown })?.displayName ===
      "string"
        ? (request.body as { displayName: string }).displayName.trim()
        : `${member.name}的 Codex`;
    if (!displayName || displayName.length > 80)
      return reply.code(400).send({ error: "invalid_display_name" });
    const raw = token();
    const expiresAt = expiresIn(PAIRING_TTL);
    db.createPairingToken(
      randomUUID(),
      hash(raw),
      member.id,
      displayName,
      expiresAt,
    );
    const result: PairingResponse = {
      pairingToken: raw,
      expiresAt,
      command: `pnpm runner --coordinator ${JSON.stringify(publicUrl)} --pair ${JSON.stringify(raw)} --name ${JSON.stringify(displayName)}`,
    };
    return result;
  });

  app.post("/api/agents/:id/pause", async (request, reply) => {
    const member = await authenticated(request, reply);
    if (!member) return;
    const agent = db.agentById((request.params as { id: string }).id);
    if (!agent) return reply.code(404).send({ error: "agent_not_found" });
    if (agent.ownerMemberId !== member.id)
      return reply.code(403).send({ error: "agent_owner_required" });
    if (agent.status === "busy")
      return reply.code(409).send({ error: "agent_busy" });
    db.setAgentStatus(agent.id, "paused");
    broadcast();
    return db.agentById(agent.id);
  });

  app.post("/api/agents/:id/resume", async (request, reply) => {
    const member = await authenticated(request, reply);
    if (!member) return;
    const agent = db.agentById((request.params as { id: string }).id);
    if (!agent) return reply.code(404).send({ error: "agent_not_found" });
    if (agent.ownerMemberId !== member.id)
      return reply.code(403).send({ error: "agent_owner_required" });
    db.setAgentStatus(agent.id, isConnected(agent.id) ? "online" : "offline");
    broadcast();
    schedule();
    return db.agentById(agent.id);
  });

  app.post("/api/agents/:id/status", async (request, reply) => {
    const member = await authenticated(request, reply);
    if (!member) return;
    const agent = db.agentById((request.params as { id: string }).id);
    if (!agent) return reply.code(404).send({ error: "agent_not_found" });
    if (agent.ownerMemberId !== member.id)
      return reply.code(403).send({ error: "agent_owner_required" });
    const status = (request.body as { status?: unknown })?.status;
    if (status !== "paused" && status !== "online")
      return reply.code(400).send({ error: "invalid_agent_status" });
    if (status === "paused" && agent.status === "busy")
      return reply.code(409).send({ error: "agent_busy" });
    db.setAgentStatus(
      agent.id,
      status === "paused"
        ? "paused"
        : isConnected(agent.id)
          ? "online"
          : "offline",
    );
    broadcast();
    schedule();
    return db.agentById(agent.id);
  });

  app.post("/api/tasks", async (request, reply) => {
    const member = await authenticated(request, reply);
    if (!member) return;
    const parsed = createTaskSchema.safeParse(request.body);
    if (!parsed.success)
      return reply
        .code(400)
        .send({ error: "invalid_task", issues: parsed.error.issues });
    const agent = db.agentById(parsed.data.agentId);
    if (!agent || agent.status === "paused")
      return reply.code(400).send({ error: "agent_unavailable" });
    const task = db.createTask(
      randomUUID(),
      member,
      agent,
      parsed.data.prompt,
      isConnected(agent.id) ? "queued" : "waiting_for_agent",
    );
    broadcast();
    schedule();
    return reply.code(201).send(task);
  });

  app.post("/api/tasks/:id/reassign", async (request, reply) => {
    const member = await authenticated(request, reply);
    if (!member) return;
    const existing = db.taskById((request.params as { id: string }).id);
    if (!existing) return reply.code(404).send({ error: "task_not_found" });
    if (existing.requesterMemberId !== member.id && !member.isAdmin)
      return reply.code(403).send({ error: "task_owner_required" });
    const agentId = (request.body as { agentId?: unknown })?.agentId;
    if (typeof agentId !== "string")
      return reply.code(400).send({ error: "invalid_agent" });
    const agent = db.agentById(agentId);
    if (!agent || agent.status === "paused")
      return reply.code(400).send({ error: "agent_unavailable" });
    if (
      !db.reassignTask(
        (request.params as { id: string }).id,
        agent.id,
        isConnected(agent.id) ? "queued" : "waiting_for_agent",
      )
    ) {
      return reply.code(409).send({ error: "task_not_reassignable" });
    }
    broadcast();
    schedule();
    return db.taskById((request.params as { id: string }).id);
  });

  app.post("/api/tasks/:id/messages", async (request, reply) => {
    const member = await authenticated(request, reply);
    if (!member) return;
    const taskId = (request.params as { id: string }).id;
    if (!db.taskById(taskId))
      return reply.code(404).send({ error: "task_not_found" });
    const parsed = addTaskMessageSchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({ error: "invalid_message" });
    const message = db.addMessage(
      taskId,
      member.id,
      member.name,
      "member",
      parsed.data.content,
    );
    broadcast();
    return reply.code(201).send(message);
  });

  app.post("/api/tasks/:id/retry", async (request, reply) => {
    const member = await authenticated(request, reply);
    if (!member) return;
    const taskId = (request.params as { id: string }).id;
    const task = db.taskById(taskId);
    if (!task) return reply.code(404).send({ error: "task_not_found" });
    const agent = db.agentById(task.selectedAgentId);
    if (
      task.requesterMemberId !== member.id &&
      agent?.ownerMemberId !== member.id &&
      !member.isAdmin
    )
      return reply.code(403).send({ error: "task_owner_required" });
    if (
      !db.retryTask(
        taskId,
        agent?.status === "online" && isConnected(task.selectedAgentId)
          ? "queued"
          : "waiting_for_agent",
      )
    ) {
      return reply.code(409).send({ error: "task_not_retryable" });
    }
    db.addMessage(taskId, null, "System", "system", "Task prepared for retry");
    broadcast();
    schedule();
    return db.taskById(taskId);
  });

  app.post("/api/tasks/:id/cancel", async (request, reply) => {
    const member = await authenticated(request, reply);
    if (!member) return;
    const taskId = (request.params as { id: string }).id;
    const task = db.taskById(taskId);
    if (!task) return reply.code(404).send({ error: "task_not_found" });
    if (task.requesterMemberId !== member.id && !member.isAdmin)
      return reply.code(403).send({ error: "task_owner_required" });
    if (!db.cancelTask(taskId))
      return reply.code(409).send({ error: "task_not_cancelable" });
    db.addMessage(taskId, null, "System", "system", "Task canceled");
    broadcast();
    schedule();
    return db.taskById(taskId);
  });

  app.post("/api/tasks/:id/force-release", async (request, reply) => {
    const member = await authenticated(request, reply);
    if (!member) return;
    if (!member.isAdmin)
      return reply.code(403).send({ error: "admin_required" });
    if ((request.body as { confirm?: unknown })?.confirm !== "FORCE_RELEASE")
      return reply.code(400).send({ error: "explicit_confirmation_required" });

    const taskId = (request.params as { id: string }).id;
    const task = db.taskById(taskId);
    if (!task) return reply.code(404).send({ error: "task_not_found" });
    const agent = db.agentById(task.selectedAgentId);
    if (
      agent?.status !== "offline" ||
      isConnected(agent.id) ||
      !["running", "waiting_for_owner"].includes(task.status)
    ) {
      return reply.code(409).send({ error: "task_not_force_releasable" });
    }
    if (
      !db.forceReleaseOfflineTask(taskId, agent.id, randomUUID(), member.name)
    ) {
      return reply.code(409).send({ error: "task_not_force_releasable" });
    }
    broadcast();
    schedule();
    return db.taskById(taskId);
  });

  app.get("/api/stream", async (request, reply) => {
    const member = await authenticated(request, reply);
    if (!member) return;
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    });
    streams.add(reply);
    reply.raw.write(
      `event: snapshot\ndata: ${JSON.stringify(db.snapshot(member))}\n\n`,
    );
    const ping = setInterval(() => reply.raw.write(": ping\n\n"), 20_000);
    request.raw.on("close", () => {
      clearInterval(ping);
      streams.delete(reply);
    });
  });

  app.get("/api/runner", { websocket: true }, (socket) => {
    let registeredAgentId: string | null = null;
    socket.on("message", (raw) => {
      let data: unknown;
      try {
        data = JSON.parse(raw.toString());
      } catch {
        send(socket, { type: "runner.error", message: "Invalid JSON" });
        return;
      }
      const parsed = runnerClientMessageSchema.safeParse(data);
      if (!parsed.success) {
        send(socket, {
          type: "runner.error",
          message: "Invalid runner message",
        });
        return;
      }
      const message = parsed.data;
      if (message.type === "runner.register") {
        let agent: Agent | null = null;
        let runnerRaw = message.runnerToken;
        if (runnerRaw) {
          agent = db.agentByRunnerHash(hash(runnerRaw), message.deviceId);
        } else if (message.pairingToken) {
          runnerRaw = deriveRunnerToken(message.pairingToken, message.deviceId);
          agent = db.exchangePairingToken(
            hash(message.pairingToken),
            randomUUID(),
            hash(runnerRaw),
            message.deviceId,
          );
        }
        if (!agent || !runnerRaw) {
          send(socket, {
            type: "runner.error",
            message: "Registration credentials rejected",
          });
          return;
        }
        db.markAgentConnected(agent.id);
        agent = db.agentById(agent.id);
        if (!agent) return;
        const previous = runners.get(agent.id);
        if (previous && previous.socket !== socket)
          previous.socket.close(4001, "Replaced by a newer connection");
        registeredAgentId = agent.id;
        runners.set(agent.id, {
          socket,
          agentId: agent.id,
          lastHeartbeat: Date.now(),
        });
        send(socket, {
          type: "runner.registered",
          agentId: agent.id,
          runnerToken: runnerRaw,
          ownerMemberId: agent.ownerMemberId,
        });
        send(socket, { type: "runner.ready", agentId: agent.id });
        broadcast();
        if (!resumeActiveTask(agent, socket)) schedule();
        return;
      }
      if (!registeredAgentId) {
        send(socket, { type: "runner.error", message: "Register first" });
        return;
      }
      const agentId = registeredAgentId;
      if (message.type === "runner.heartbeat") {
        if (message.agentId !== agentId) return;
        const connection = runners.get(agentId);
        if (connection) connection.lastHeartbeat = Date.now();
        db.touchAgent(agentId);
        return;
      }
      const task = db.taskById(message.taskId);
      if (!task || task.selectedAgentId !== agentId) {
        send(socket, {
          type: "runner.error",
          message: "Task is not assigned to this agent",
        });
        return;
      }
      if (message.type === "task.progress") {
        if (
          db.updateTaskFromRunner(message.taskId, agentId, {
            status: "running",
            progress: message.message,
          })
        ) {
          db.addMessage(
            message.taskId,
            null,
            task.selectedAgentName,
            "agent",
            message.message,
          );
          broadcast();
        }
      } else if (message.type === "task.waiting_owner") {
        if (
          db.updateTaskFromRunner(message.taskId, agentId, {
            status: "waiting_for_owner",
            progress: message.message,
          })
        ) {
          db.addMessage(
            message.taskId,
            null,
            "System",
            "system",
            message.message,
          );
          broadcast();
        }
      } else if (message.type === "task.complete") {
        if (
          db.finishTask(
            message.taskId,
            agentId,
            // The coordinator authored and persisted this boundary. A runner
            // result may acknowledge it, but never advances the shared cursor
            // beyond the assignment it actually received.
            task.assignedThroughMessageSequence,
            {
              status: "completed",
              result: message.result,
              diff: message.diff,
              test_output: message.testOutput,
              commit_sha: message.commitSha,
              progress: "Completed",
              error: "",
            },
          )
        ) {
          db.addMessage(
            message.taskId,
            null,
            task.selectedAgentName,
            "agent",
            message.result || "Task completed",
          );
          db.addMessage(
            message.taskId,
            null,
            "System",
            "system",
            [
              `Completed on ${db.getSettings().sharedBranch} at commit ${message.commitSha}.`,
              message.testOutput.trim()
                ? `Tests:\n${message.testOutput.slice(0, 2_000)}`
                : "Tests produced no output.",
            ].join("\n"),
          );
          broadcast();
          schedule();
        }
      } else if (message.type === "task.needs_attention") {
        if (
          db.finishTask(
            message.taskId,
            agentId,
            task.assignedThroughMessageSequence,
            {
              status: "needs_attention",
              error: message.message,
              diff: message.diff,
              test_output: message.testOutput,
              progress: "Needs attention",
            },
            "paused",
          )
        ) {
          db.addMessage(
            message.taskId,
            null,
            "System",
            "system",
            message.message,
          );
          broadcast();
          schedule();
        }
      }
    });
    socket.on("close", () => {
      if (closing) return;
      if (!registeredAgentId) return;
      const current = runners.get(registeredAgentId);
      if (current?.socket === socket) {
        runners.delete(registeredAgentId);
        db.markDisconnected(registeredAgentId);
        broadcast();
        schedule();
      }
    });
  });

  const heartbeatTimer = setInterval(() => {
    const cutoff = Date.now() - (options.heartbeatTimeoutMs ?? 45_000);
    for (const connection of runners.values())
      if (connection.lastHeartbeat < cutoff)
        connection.socket.close(4000, "Heartbeat timeout");
  }, options.heartbeatCheckMs ?? 10_000);
  heartbeatTimer.unref();
  app.addHook("onClose", async () => {
    closing = true;
    clearInterval(heartbeatTimer);
    for (const r of runners.values()) r.socket.close();
    db.close();
  });

  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const webRoot =
    options.webRoot ??
    resolve(
      moduleDir,
      basename(moduleDir) === "src" ? "../dist/web" : "../web",
    );
  if (existsSync(webRoot)) {
    await app.register(fastifyStatic, { root: webRoot });
    app.setNotFoundHandler(async (request, reply) => {
      if (request.url === "/api" || request.url.startsWith("/api/"))
        return reply.code(404).send({ error: "not_found" });
      return reply.sendFile("index.html");
    });
  } else {
    app.get("/", async (_request, reply) =>
      reply
        .type("text/html")
        .send(
          "<!doctype html><title>Team Agent Alpha</title><h1>Team Agent Alpha</h1><p>Web assets have not been built yet.</p>",
        ),
    );
  }

  return { app, db, bootstrapInvite, schedule };
}

export async function createServer(
  options: CoordinatorOptions = {},
): Promise<CoordinatorApp> {
  return createApp(options);
}
