import { describe, expect, it } from "vitest";
import { CoordinatorDatabase } from "./database.js";

describe("CoordinatorDatabase demo fixtures", () => {
  it("seeds an empty database once without overwriting later demo state", () => {
    const db = new CoordinatorDatabase(":memory:");
    try {
      const member = db.seedDemo();
      expect(member.id).toBe("demo-member");
      expect(db.listAgents()).toHaveLength(4);
      expect(db.listTasks()).toHaveLength(4);
      expect(
        db
          .listTasks()
          .filter((task) =>
            ["running", "waiting_for_owner"].includes(task.status),
          ),
      ).toHaveLength(1);

      db.updateSettings({
        ...db.getSettings(),
        projectName: "Customized demo lobby",
      });
      const taskCount = db.listTasks().length;

      expect(db.seedDemo()).toEqual(member);
      expect(db.listTasks()).toHaveLength(taskCount);
      expect(db.getSettings().projectName).toBe("Customized demo lobby");
    } finally {
      db.close();
    }
  });

  it("does not install demo fixtures over an occupied coordinator", () => {
    const db = new CoordinatorDatabase(":memory:");
    try {
      db.sqlite
        .prepare(
          "INSERT INTO members (id, name, is_admin, session_token_hash, created_at) VALUES ('real-member', 'Real member', 1, NULL, ?)",
        )
        .run(new Date().toISOString());

      expect(() => db.seedDemo()).toThrow(
        "Demo mode requires an empty, dedicated coordinator database",
      );
      expect(db.memberById("real-member")?.name).toBe("Real member");
      expect(db.memberById("demo-member")).toBeNull();
      expect(db.getSettings().projectName).toBe("Team Agent");
    } finally {
      db.close();
    }
  });

  it("repairs duplicate active demo tasks while preserving one user mission", () => {
    const db = new CoordinatorDatabase(":memory:");
    try {
      const member = db.seedDemo();
      const agent = db.agentById("demo-agent-rune");
      if (!agent) throw new Error("Expected demo agent");

      db.createTask("user-task-first", member, agent, "First", "running");
      db.createTask(
        "user-task-second",
        member,
        agent,
        "Second",
        "waiting_for_owner",
      );

      db.seedDemo();
      const active = db
        .listTasks()
        .filter((task) =>
          ["running", "waiting_for_owner"].includes(task.status),
        );
      expect(active).toHaveLength(1);
      expect(active[0]?.id).toMatch(/^user-task-/);
      expect(db.taskById("demo-task-running")?.status).toBe("completed");
    } finally {
      db.close();
    }
  });
});
