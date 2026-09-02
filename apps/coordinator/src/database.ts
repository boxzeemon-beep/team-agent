import { DatabaseSync } from "node:sqlite";
import type {
  Agent,
  ContextMessage,
  DashboardSnapshot,
  Member,
  ProjectSettings,
  Task,
  TaskAssignment,
  TaskMessage,
  TaskStatus,
} from "@team-agent/shared";

type SqlValue = string | number | null;

function now(): string {
  return new Date().toISOString();
}

export class CoordinatorDatabase {
  readonly sqlite: DatabaseSync;

  constructor(path: string) {
    this.sqlite = new DatabaseSync(path);
    this.sqlite.exec(
      "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;",
    );
    this.migrate();
  }

  close(): void {
    this.sqlite.close();
  }

  private migrate(): void {
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        project_name TEXT NOT NULL,
        repository_url TEXT NOT NULL,
        base_branch TEXT NOT NULL,
        shared_branch TEXT NOT NULL,
        test_command TEXT NOT NULL
      );
      INSERT OR IGNORE INTO settings VALUES (1, 'Team Agent Alpha', '', 'main', 'internal-alpha', '');

      CREATE TABLE IF NOT EXISTS coordinator_secrets (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS members (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        is_admin INTEGER NOT NULL DEFAULT 0,
        session_token_hash TEXT UNIQUE,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS invites (
        id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL UNIQUE,
        is_admin INTEGER NOT NULL DEFAULT 0,
        expires_at TEXT NOT NULL,
        claimed_at TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS pairing_tokens (
        id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL UNIQUE,
        owner_member_id TEXT NOT NULL REFERENCES members(id),
        display_name TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        used_at TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        owner_member_id TEXT NOT NULL REFERENCES members(id),
        display_name TEXT NOT NULL,
        status TEXT NOT NULL,
        last_context_message_sequence INTEGER NOT NULL DEFAULT 0,
        last_seen_at TEXT,
        runner_token_hash TEXT NOT NULL UNIQUE,
        device_id TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        requester_member_id TEXT NOT NULL REFERENCES members(id),
        selected_agent_id TEXT NOT NULL REFERENCES agents(id),
        status TEXT NOT NULL,
        prompt TEXT NOT NULL,
        progress TEXT NOT NULL DEFAULT '',
        result TEXT NOT NULL DEFAULT '',
        diff TEXT NOT NULL DEFAULT '',
        test_output TEXT NOT NULL DEFAULT '',
        commit_sha TEXT NOT NULL DEFAULT '',
        error TEXT NOT NULL DEFAULT '',
        assigned_through_message_sequence INTEGER NOT NULL DEFAULT 0,
        assignment_json TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS messages (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        member_id TEXT REFERENCES members(id),
        member_name TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS tasks_queue ON tasks(status, created_at);
      CREATE INDEX IF NOT EXISTS messages_task ON messages(task_id, sequence);
    `);
    const taskColumns = this.sqlite
      .prepare("PRAGMA table_info(tasks)")
      .all() as Array<{ name: string }>;
    if (!taskColumns.some((column) => column.name === "assignment_json"))
      this.sqlite.exec(
        "ALTER TABLE tasks ADD COLUMN assignment_json TEXT NOT NULL DEFAULT ''",
      );
  }

  private transaction<T>(operation: () => T): T {
    this.sqlite.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      this.sqlite.exec("COMMIT");
      return result;
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  normalizeAfterRestart(): void {
    // A running task owns the project-wide execution lock. Keep that durable
    // state intact; its runner receives the same assignment after reconnecting.
    this.sqlite
      .prepare(
        "UPDATE agents SET status='offline' WHERE status IN ('online','busy')",
      )
      .run();
    this.sqlite
      .prepare(
        "UPDATE tasks SET status='waiting_for_agent', progress='Waiting for the selected agent', updated_at=? WHERE status='queued'",
      )
      .run(now());
  }

  getOrCreateSecret(key: string, candidate: string): string {
    return this.transaction(() => {
      const existing = this.sqlite
        .prepare("SELECT value FROM coordinator_secrets WHERE key=?")
        .get(key) as { value: string } | undefined;
      if (existing) return existing.value;
      this.sqlite
        .prepare("INSERT INTO coordinator_secrets (key, value) VALUES (?, ?)")
        .run(key, candidate);
      return candidate;
    });
  }

  getSettings(): ProjectSettings {
    const row = this.sqlite
      .prepare("SELECT * FROM settings WHERE id=1")
      .get() as Record<string, SqlValue>;
    return {
      projectName: String(row.project_name),
      repositoryUrl: String(row.repository_url),
      baseBranch: String(row.base_branch),
      sharedBranch: String(row.shared_branch),
      testCommand: String(row.test_command),
    };
  }

  updateSettings(value: ProjectSettings): ProjectSettings {
    this.sqlite
      .prepare(
        `UPDATE settings SET project_name=?, repository_url=?, base_branch=?, shared_branch=?, test_command=? WHERE id=1`,
      )
      .run(
        value.projectName,
        value.repositoryUrl,
        value.baseBranch,
        value.sharedBranch,
        value.testCommand,
      );
    return this.getSettings();
  }

  countMembers(): number {
    return Number(
      (
        this.sqlite.prepare("SELECT COUNT(*) AS count FROM members").get() as {
          count: number;
        }
      ).count,
    );
  }

  createInvite(
    id: string,
    tokenHash: string,
    isAdmin: boolean,
    expiresAt: string,
  ): void {
    this.sqlite
      .prepare("INSERT INTO invites VALUES (?, ?, ?, ?, NULL, ?)")
      .run(id, tokenHash, isAdmin ? 1 : 0, expiresAt, now());
  }

  replaceBootstrapInvite(
    id: string,
    tokenHash: string,
    expiresAt: string,
  ): boolean {
    return this.transaction(() => {
      if (this.sqlite.prepare("SELECT 1 FROM members LIMIT 1").get())
        return false;
      const stamp = now();
      this.sqlite
        .prepare(
          "UPDATE invites SET claimed_at=? WHERE is_admin=1 AND claimed_at IS NULL",
        )
        .run(stamp);
      this.sqlite
        .prepare("INSERT INTO invites VALUES (?, ?, 1, ?, NULL, ?)")
        .run(id, tokenHash, expiresAt, stamp);
      return true;
    });
  }

  claimInvite(
    tokenHash: string,
    memberId: string,
    name: string,
    sessionHash: string,
  ): Member | null {
    return this.transaction(() => {
      const invite = this.sqlite
        .prepare("SELECT * FROM invites WHERE token_hash=?")
        .get(tokenHash) as Record<string, SqlValue> | undefined;
      if (
        !invite ||
        invite.claimed_at ||
        Date.parse(String(invite.expires_at)) <= Date.now()
      )
        return null;
      const createdAt = now();
      const isFirstAdmin =
        Boolean(invite.is_admin) &&
        !this.sqlite
          .prepare("SELECT 1 FROM members WHERE is_admin=1 LIMIT 1")
          .get();
      this.sqlite
        .prepare("INSERT INTO members VALUES (?, ?, ?, ?, ?)")
        .run(memberId, name, Number(invite.is_admin), sessionHash, createdAt);
      this.sqlite
        .prepare("UPDATE invites SET claimed_at=? WHERE id=?")
        .run(createdAt, String(invite.id));
      if (isFirstAdmin) {
        // Concurrent coordinator boots may have emitted several admin links.
        // The first successful claim retires all of them in this transaction.
        this.sqlite
          .prepare(
            "UPDATE invites SET claimed_at=? WHERE is_admin=1 AND claimed_at IS NULL",
          )
          .run(createdAt);
      }
      return {
        id: memberId,
        name,
        isAdmin: Boolean(invite.is_admin),
        createdAt,
      };
    });
  }

  memberBySessionHash(hash: string): Member | null {
    const row = this.sqlite
      .prepare("SELECT * FROM members WHERE session_token_hash=?")
      .get(hash) as Record<string, SqlValue> | undefined;
    return row ? this.mapMember(row) : null;
  }

  memberById(id: string): Member | null {
    const row = this.sqlite
      .prepare("SELECT * FROM members WHERE id=?")
      .get(id) as Record<string, SqlValue> | undefined;
    return row ? this.mapMember(row) : null;
  }

  clearMemberSession(id: string): void {
    this.sqlite
      .prepare("UPDATE members SET session_token_hash=NULL WHERE id=?")
      .run(id);
  }

  private mapMember(row: Record<string, SqlValue>): Member {
    return {
      id: String(row.id),
      name: String(row.name),
      isAdmin: Boolean(row.is_admin),
      createdAt: String(row.created_at),
    };
  }

  createPairingToken(
    id: string,
    hash: string,
    ownerId: string,
    displayName: string,
    expiresAt: string,
  ): void {
    this.sqlite
      .prepare("INSERT INTO pairing_tokens VALUES (?, ?, ?, ?, ?, NULL, ?)")
      .run(id, hash, ownerId, displayName, expiresAt, now());
  }

  exchangePairingToken(
    pairingHash: string,
    agentId: string,
    runnerHash: string,
    deviceId: string,
  ): Agent | null {
    return this.transaction(() => {
      const pair = this.sqlite
        .prepare("SELECT * FROM pairing_tokens WHERE token_hash=?")
        .get(pairingHash) as Record<string, SqlValue> | undefined;
      if (!pair) return null;
      if (Date.parse(String(pair.expires_at)) <= Date.now()) return null;
      if (pair.used_at) {
        // A response can be lost after the exchange commits. An exact retry
        // recovers the existing agent during the original pairing window.
        const existing = this.agentByRunnerHash(runnerHash, deviceId);
        return existing?.ownerMemberId === String(pair.owner_member_id)
          ? existing
          : null;
      }
      const stamp = now();
      this.sqlite
        .prepare(
          `INSERT INTO agents (id, owner_member_id, display_name, status, last_seen_at, runner_token_hash, device_id, created_at) VALUES (?, ?, ?, 'online', ?, ?, ?, ?)`,
        )
        .run(
          agentId,
          String(pair.owner_member_id),
          String(pair.display_name),
          stamp,
          runnerHash,
          deviceId,
          stamp,
        );
      this.sqlite
        .prepare("UPDATE pairing_tokens SET used_at=? WHERE id=?")
        .run(stamp, String(pair.id));
      return this.agentById(agentId);
    });
  }

  agentByRunnerHash(hash: string, deviceId: string): Agent | null {
    const row = this.sqlite
      .prepare(
        this.agentSelect("WHERE a.runner_token_hash=? AND a.device_id=?"),
      )
      .get(hash, deviceId) as Record<string, SqlValue> | undefined;
    return row ? this.mapAgent(row) : null;
  }

  agentById(id: string): Agent | null {
    const row = this.sqlite.prepare(this.agentSelect("WHERE a.id=?")).get(id) as
      | Record<string, SqlValue>
      | undefined;
    return row ? this.mapAgent(row) : null;
  }

  listAgents(): Agent[] {
    return (
      this.sqlite
        .prepare(this.agentSelect("ORDER BY a.created_at"))
        .all() as Record<string, SqlValue>[]
    ).map((r) => this.mapAgent(r));
  }

  private agentSelect(suffix: string): string {
    return `SELECT a.*, m.name AS owner_name FROM agents a JOIN members m ON m.id=a.owner_member_id ${suffix}`;
  }

  private mapAgent(row: Record<string, SqlValue>): Agent {
    return {
      id: String(row.id),
      ownerMemberId: String(row.owner_member_id),
      ownerName: String(row.owner_name),
      displayName: String(row.display_name),
      status: String(row.status) as Agent["status"],
      lastContextMessageSequence: Number(row.last_context_message_sequence),
      lastSeenAt: row.last_seen_at ? String(row.last_seen_at) : null,
    };
  }

  setAgentStatus(id: string, status: Agent["status"]): void {
    const stamp = now();
    this.sqlite
      .prepare("UPDATE agents SET status=?, last_seen_at=? WHERE id=?")
      .run(status, stamp, id);
    if (status === "paused" || status === "offline")
      this.sqlite
        .prepare(
          "UPDATE tasks SET status='waiting_for_agent', progress='Waiting for the selected agent', updated_at=? WHERE selected_agent_id=? AND status='queued'",
        )
        .run(stamp, id);
  }

  markAgentConnected(id: string): void {
    this.sqlite
      .prepare(
        `UPDATE agents SET status=CASE
          WHEN status='paused' THEN 'paused'
          WHEN EXISTS (SELECT 1 FROM tasks WHERE selected_agent_id=? AND status IN ('running','waiting_for_owner')) THEN 'busy'
          ELSE 'online'
        END, last_seen_at=? WHERE id=?`,
      )
      .run(id, now(), id);
  }

  touchAgent(id: string): void {
    this.sqlite
      .prepare("UPDATE agents SET last_seen_at=? WHERE id=?")
      .run(now(), id);
  }

  createTask(
    id: string,
    requester: Member,
    agent: Agent,
    prompt: string,
    status: TaskStatus,
  ): Task {
    const stamp = now();
    this.transaction(() => {
      this.sqlite
        .prepare(
          `INSERT INTO tasks (id, requester_member_id, selected_agent_id, status, prompt, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(id, requester.id, agent.id, status, prompt, stamp, stamp);
      this.addMessage(id, requester.id, requester.name, "member", prompt);
    });
    return this.taskById(id) as Task;
  }

  addMessage(
    taskId: string,
    memberId: string | null,
    memberName: string,
    role: TaskMessage["role"],
    content: string,
  ): TaskMessage {
    const id = crypto.randomUUID();
    const createdAt = now();
    const result = this.sqlite
      .prepare(
        "INSERT INTO messages (id, task_id, member_id, member_name, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(id, taskId, memberId, memberName, role, content, createdAt);
    this.sqlite
      .prepare("UPDATE tasks SET updated_at=? WHERE id=?")
      .run(createdAt, taskId);
    return {
      id,
      sequence: Number(result.lastInsertRowid),
      taskId,
      memberId,
      memberName,
      role,
      content,
      createdAt,
    };
  }

  taskById(id: string): Task | null {
    const row = this.sqlite.prepare(this.taskSelect("WHERE t.id=?")).get(id) as
      | Record<string, SqlValue>
      | undefined;
    return row ? this.mapTask(row) : null;
  }

  listTasks(): Task[] {
    return (
      this.sqlite
        .prepare(this.taskSelect("ORDER BY t.created_at DESC"))
        .all() as Record<string, SqlValue>[]
    ).map((r) => this.mapTask(r));
  }

  private taskSelect(suffix: string): string {
    return `SELECT t.*, requester.name AS requester_name, a.display_name AS agent_name, owner.name AS owner_name
      FROM tasks t JOIN members requester ON requester.id=t.requester_member_id
      JOIN agents a ON a.id=t.selected_agent_id JOIN members owner ON owner.id=a.owner_member_id ${suffix}`;
  }

  private mapTask(row: Record<string, SqlValue>): Task {
    const id = String(row.id);
    return {
      id,
      requesterMemberId: String(row.requester_member_id),
      requesterName: String(row.requester_name),
      selectedAgentId: String(row.selected_agent_id),
      selectedAgentName: String(row.agent_name),
      selectedAgentOwnerName: String(row.owner_name),
      status: String(row.status) as TaskStatus,
      prompt: String(row.prompt),
      progress: String(row.progress),
      result: String(row.result),
      diff: String(row.diff),
      testOutput: String(row.test_output),
      commitSha: String(row.commit_sha),
      error: String(row.error),
      assignedThroughMessageSequence: Number(
        row.assigned_through_message_sequence,
      ),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      messages: this.messagesForTask(id),
    };
  }

  messagesForTask(taskId: string): TaskMessage[] {
    return (
      this.sqlite
        .prepare("SELECT * FROM messages WHERE task_id=? ORDER BY sequence")
        .all(taskId) as Record<string, SqlValue>[]
    ).map(this.mapMessage);
  }

  contextAfter(sequence: number, excludeTaskId?: string): ContextMessage[] {
    const sql = `SELECT * FROM messages WHERE sequence>? ${excludeTaskId ? "AND task_id<>?" : ""} ORDER BY sequence`;
    const rows = (
      excludeTaskId
        ? this.sqlite.prepare(sql).all(sequence, excludeTaskId)
        : this.sqlite.prepare(sql).all(sequence)
    ) as Record<string, SqlValue>[];
    return rows.map((row) => ({
      sequence: Number(row.sequence),
      taskId: String(row.task_id),
      author: String(row.member_name),
      role: String(row.role) as TaskMessage["role"],
      content: String(row.content),
      createdAt: String(row.created_at),
    }));
  }

  private mapMessage = (row: Record<string, SqlValue>): TaskMessage => ({
    id: String(row.id),
    sequence: Number(row.sequence),
    taskId: String(row.task_id),
    memberId: row.member_id ? String(row.member_id) : null,
    memberName: String(row.member_name),
    role: String(row.role) as TaskMessage["role"],
    content: String(row.content),
    createdAt: String(row.created_at),
  });

  hasActiveTask(): boolean {
    return Boolean(
      this.sqlite
        .prepare(
          "SELECT 1 FROM tasks WHERE status IN ('running','waiting_for_owner') LIMIT 1",
        )
        .get(),
    );
  }

  activeTaskForAgent(agentId: string): Task | null {
    const row = this.sqlite
      .prepare(
        this.taskSelect(
          "WHERE t.selected_agent_id=? AND t.status IN ('running','waiting_for_owner') ORDER BY t.created_at LIMIT 1",
        ),
      )
      .get(agentId) as Record<string, SqlValue> | undefined;
    return row ? this.mapTask(row) : null;
  }

  activeAssignmentForAgent(agentId: string): TaskAssignment | null {
    const row = this.sqlite
      .prepare(
        "SELECT assignment_json FROM tasks WHERE selected_agent_id=? AND status IN ('running','waiting_for_owner') ORDER BY created_at LIMIT 1",
      )
      .get(agentId) as { assignment_json: string } | undefined;
    if (!row?.assignment_json) return null;
    try {
      return JSON.parse(row.assignment_json) as TaskAssignment;
    } catch {
      return null;
    }
  }

  earliestRunnable(onlineAgentIds: string[]): Task | null {
    if (onlineAgentIds.length === 0) return null;
    const marks = onlineAgentIds.map(() => "?").join(",");
    const row = this.sqlite
      .prepare(
        this.taskSelect(
          `WHERE t.status IN ('queued','waiting_for_agent') AND t.selected_agent_id IN (${marks}) ORDER BY t.created_at LIMIT 1`,
        ),
      )
      .get(...onlineAgentIds) as Record<string, SqlValue> | undefined;
    return row ? this.mapTask(row) : null;
  }

  assignTask(
    taskId: string,
    agentId: string,
    throughSequence: number,
    assignment: TaskAssignment,
  ): boolean {
    return this.transaction(() => {
      if (this.hasActiveTask()) return false;
      const result = this.sqlite
        .prepare(
          "UPDATE tasks SET status='running', progress='Assigned to agent', assigned_through_message_sequence=?, assignment_json=?, updated_at=? WHERE id=? AND selected_agent_id=? AND status IN ('queued','waiting_for_agent')",
        )
        .run(
          throughSequence,
          JSON.stringify(assignment),
          now(),
          taskId,
          agentId,
        );
      if (!result.changes) return false;
      this.setAgentStatus(agentId, "busy");
      return true;
    });
  }

  reassignTask(taskId: string, agentId: string, status: TaskStatus): boolean {
    const result = this.sqlite
      .prepare(
        "UPDATE tasks SET selected_agent_id=?, status=?, progress='', updated_at=? WHERE id=? AND status IN ('queued','waiting_for_agent')",
      )
      .run(agentId, status, now(), taskId);
    return Boolean(result.changes);
  }

  retryTask(taskId: string, status: TaskStatus): boolean {
    const result = this.sqlite
      .prepare(
        "UPDATE tasks SET status=?, progress='', error='', updated_at=? WHERE id=? AND status='needs_attention'",
      )
      .run(status, now(), taskId);
    return Boolean(result.changes);
  }

  cancelTask(taskId: string): boolean {
    const result = this.sqlite
      .prepare(
        "UPDATE tasks SET status='canceled', progress='Canceled', updated_at=? WHERE id=? AND status IN ('queued','waiting_for_agent','needs_attention')",
      )
      .run(now(), taskId);
    return Boolean(result.changes);
  }

  forceReleaseOfflineTask(
    taskId: string,
    agentId: string,
    messageId: string,
    administratorName: string,
  ): boolean {
    return this.transaction(() => {
      const stamp = now();
      const released = this.sqlite
        .prepare(
          `UPDATE tasks
           SET status='needs_attention',
               progress='管理员已紧急释放任务',
               error='离线活动任务已由管理员紧急释放，请检查 Agent 本地工作区',
               updated_at=?
           WHERE id=? AND selected_agent_id=?
             AND status IN ('running','waiting_for_owner')
             AND EXISTS (
               SELECT 1 FROM agents
               WHERE agents.id=? AND agents.status='offline'
             )`,
        )
        .run(stamp, taskId, agentId, agentId);
      if (!released.changes) return false;

      this.sqlite
        .prepare("UPDATE agents SET status='paused', last_seen_at=? WHERE id=?")
        .run(stamp, agentId);
      this.sqlite
        .prepare(
          "UPDATE tasks SET status='waiting_for_agent', progress='Waiting for the selected agent', updated_at=? WHERE selected_agent_id=? AND status='queued'",
        )
        .run(stamp, agentId);
      this.sqlite
        .prepare(
          `INSERT INTO messages
           (sequence, id, task_id, member_id, member_name, role, content, created_at)
           VALUES (NULL, ?, ?, NULL, 'System', 'system', ?, ?)`,
        )
        .run(
          messageId,
          taskId,
          `管理员 ${administratorName} 在确认 Agent 所有者电脑上的 Runner 已停止后紧急释放了此任务；Agent 已暂停，请检查其本地工作区后再恢复。`,
          stamp,
        );
      return true;
    });
  }

  updateTaskFromRunner(
    taskId: string,
    agentId: string,
    fields: Record<string, SqlValue>,
  ): boolean {
    const task = this.taskById(taskId);
    if (
      !task ||
      task.selectedAgentId !== agentId ||
      !["running", "waiting_for_owner"].includes(task.status)
    )
      return false;
    const entries = Object.entries(fields);
    this.sqlite
      .prepare(
        `UPDATE tasks SET ${entries.map(([key]) => `${key}=?`).join(",")}, updated_at=? WHERE id=?`,
      )
      .run(...entries.map(([, value]) => value), now(), taskId);
    return true;
  }

  finishTask(
    taskId: string,
    agentId: string,
    contextThrough: number,
    fields: Record<string, SqlValue>,
    agentStatus: Agent["status"] = "online",
  ): boolean {
    return this.transaction(() => {
      if (!this.updateTaskFromRunner(taskId, agentId, fields)) return false;
      this.sqlite
        .prepare(
          "UPDATE agents SET status=?, last_context_message_sequence=MAX(last_context_message_sequence, ?), last_seen_at=? WHERE id=?",
        )
        .run(agentStatus, contextThrough, now(), agentId);
      if (agentStatus === "paused")
        this.sqlite
          .prepare(
            "UPDATE tasks SET status='waiting_for_agent', progress='Waiting for the selected agent', updated_at=? WHERE selected_agent_id=? AND status='queued'",
          )
          .run(now(), agentId);
      return true;
    });
  }

  markDisconnected(agentId: string): void {
    // The active task deliberately keeps the global lock while its owner is
    // offline. Reconnection resumes this exact task rather than scheduling a
    // different one against the same shared branch.
    this.transaction(() => {
      const stamp = now();
      this.sqlite
        .prepare(
          "UPDATE agents SET status='offline', last_seen_at=? WHERE id=? AND status<>'paused'",
        )
        .run(stamp, agentId);
      this.sqlite
        .prepare(
          "UPDATE tasks SET status='waiting_for_agent', progress='Waiting for the selected agent', updated_at=? WHERE selected_agent_id=? AND status='queued'",
        )
        .run(stamp, agentId);
    });
  }

  snapshot(me: Member): DashboardSnapshot {
    return {
      me,
      settings: this.getSettings(),
      agents: this.listAgents(),
      tasks: this.listTasks(),
    };
  }
}
