import { describe, expect, it } from "vitest";
import { checkCoordinatorHealth, checkNode, runDoctor } from "./doctor.js";

describe("Runner doctor", () => {
  it("returns success and reports every required check", async () => {
    const lines: string[] = [];
    const exitCode = await runDoctor(
      { dataDir: "/tmp/team-agent-test" },
      {
        nodeVersion: "22.5.0",
        async checkCoordinator() {
          return "online";
        },
        async checkGit() {
          return "git version 2.50.0";
        },
        async checkCodex() {
          return "signed in";
        },
        async checkDataDirectory(path) {
          return `${path} is writable`;
        },
      },
      { log: (line) => lines.push(line) },
    );

    expect(exitCode).toBe(0);
    expect(lines.filter((line) => line.startsWith("PASS"))).toHaveLength(4);
    expect(lines.at(-1)).toMatch(/^Ready:/);
  });

  it("returns failure while continuing the remaining checks", async () => {
    const lines: string[] = [];
    const exitCode = await runDoctor(
      { dataDir: "/read-only" },
      {
        nodeVersion: "20.0.0",
        async checkCoordinator() {
          return "online";
        },
        async checkGit() {
          throw new Error("git was not found");
        },
        async checkCodex() {
          return "signed in";
        },
        async checkDataDirectory() {
          throw new Error("permission denied");
        },
      },
      { log: (line) => lines.push(line) },
    );

    expect(exitCode).toBe(1);
    expect(lines.filter((line) => line.startsWith("FAIL"))).toHaveLength(3);
    expect(lines.join("\n")).toContain("git was not found");
    expect(lines.at(-1)).toBe("Not ready: 3 checks failed.");
  });

  it("compares Node versions numerically", () => {
    expect(checkNode("22.4.99").ok).toBe(false);
    expect(checkNode("22.5.0").ok).toBe(true);
    expect(checkNode("23.0.0").ok).toBe(true);
  });

  it("checks the Coordinator health endpoint and service identity", async () => {
    let requestedUrl = "";
    const fetchHealth = async (input: string | URL | Request) => {
      requestedUrl = input.toString();
      return new Response(
        JSON.stringify({
          status: "ok",
          service: "team-agent-coordinator",
          version: "0.1.0",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    await expect(
      checkCoordinatorHealth(
        "https://example.test/team-agent/?ignored=yes",
        fetchHealth,
      ),
    ).resolves.toContain("team-agent-coordinator 0.1.0");
    expect(requestedUrl).toBe("https://example.test/team-agent/api/health");
  });

  it("rejects non-2xx and unrelated health services", async () => {
    await expect(
      checkCoordinatorHealth(
        "https://example.test",
        async () => new Response("down", { status: 503 }),
      ),
    ).rejects.toThrow("HTTP 503");
    await expect(
      checkCoordinatorHealth("https://example.test", async () =>
        Response.json({ service: "different-service" }),
      ),
    ).rejects.toThrow("Unexpected service");
  });

  it("includes the optional Coordinator in the doctor result", async () => {
    const lines: string[] = [];
    const checked: string[] = [];
    const exitCode = await runDoctor(
      {
        coordinator: "https://team-agent.example",
        dataDir: "/tmp/team-agent-test",
      },
      {
        nodeVersion: "22.5.0",
        async checkCoordinator(url) {
          checked.push(url);
          return "team-agent-coordinator 0.1.0";
        },
        async checkGit() {
          return "git version 2.50.0";
        },
        async checkCodex() {
          return "signed in";
        },
        async checkDataDirectory() {
          return "writable";
        },
      },
      { log: (line) => lines.push(line) },
    );

    expect(exitCode).toBe(0);
    expect(checked).toEqual(["https://team-agent.example"]);
    expect(lines).toContain("PASS  Coordinator: team-agent-coordinator 0.1.0");
  });
});
