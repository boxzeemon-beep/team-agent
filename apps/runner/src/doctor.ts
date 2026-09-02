import { execFile } from "node:child_process";
import { mkdir, open, unlink } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { CodexAppServerClient } from "./codex-client.js";
import type { DoctorOptions } from "./config.js";

const execFileAsync = promisify(execFile);
const minimumNodeVersion = [22, 5, 0] as const;

export interface DoctorCheck {
  name: string;
  ok: boolean;
  detail: string;
}

interface DoctorDependencies {
  nodeVersion: string;
  checkCoordinator(coordinator: string): Promise<string>;
  checkGit(): Promise<string>;
  checkCodex(): Promise<string>;
  checkDataDirectory(dataDir: string): Promise<string>;
}

interface DoctorOutput {
  log(message: string): void;
}

const defaultDependencies: DoctorDependencies = {
  nodeVersion: process.versions.node,
  checkCoordinator: checkCoordinatorHealth,
  async checkGit() {
    const { stdout } = await execFileAsync("git", ["--version"], {
      encoding: "utf8",
    });
    return stdout.trim();
  },
  async checkCodex() {
    const client = new CodexAppServerClient();
    try {
      await client.start();
      return "signed in and app-server is ready";
    } finally {
      await client.close();
    }
  },
  checkDataDirectory,
};

export async function runDoctor(
  options: DoctorOptions,
  dependencies: DoctorDependencies = defaultDependencies,
  output: DoctorOutput = console,
): Promise<number> {
  output.log("Team Agent Runner doctor");

  const checks: DoctorCheck[] = [];
  checks.push(checkNode(dependencies.nodeVersion));
  if (options.coordinator)
    checks.push(
      await capture("Coordinator", () =>
        dependencies.checkCoordinator(options.coordinator as string),
      ),
    );
  checks.push(await capture("Git", dependencies.checkGit));
  checks.push(await capture("Codex login", dependencies.checkCodex));
  checks.push(
    await capture("Data directory", () =>
      dependencies.checkDataDirectory(options.dataDir),
    ),
  );

  for (const check of checks)
    output.log(`${check.ok ? "PASS" : "FAIL"}  ${check.name}: ${check.detail}`);
  const failures = checks.filter((check) => !check.ok).length;
  output.log(
    failures === 0
      ? "Ready: all Runner checks passed."
      : `Not ready: ${failures} check${failures === 1 ? "" : "s"} failed.`,
  );
  return failures === 0 ? 0 : 1;
}

export async function checkCoordinatorHealth(
  coordinator: string,
  fetchHealth: typeof fetch = fetch,
): Promise<string> {
  const url = new URL(coordinator);
  url.pathname = `${url.pathname.replace(/\/$/, "")}/api/health`;
  url.search = "";
  url.hash = "";
  const response = await fetchHealth(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok)
    throw new Error(`HTTP ${response.status} from ${url.toString()}`);
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error(`Invalid JSON from ${url.toString()}`);
  }
  const health = body as { service?: unknown; version?: unknown };
  if (health?.service !== "team-agent-coordinator")
    throw new Error(
      `Unexpected service from ${url.toString()}: ${String(health?.service ?? "missing")}`,
    );
  return `${health.service}${typeof health.version === "string" ? ` ${health.version}` : ""} at ${url.origin}`;
}

export function checkNode(version: string): DoctorCheck {
  const parsed = version
    .replace(/^v/, "")
    .split(".")
    .slice(0, 3)
    .map((part) => Number.parseInt(part, 10));
  const ok = minimumNodeVersion.every((minimum, index) => {
    const actual = parsed[index] ?? 0;
    const prefixEqual = minimumNodeVersion
      .slice(0, index)
      .every((part, prefixIndex) => (parsed[prefixIndex] ?? 0) === part);
    return !prefixEqual || actual >= minimum;
  });
  return {
    name: "Node.js",
    ok,
    detail: ok
      ? `${version} (requires >=22.5.0)`
      : `${version}; install Node.js >=22.5.0`,
  };
}

async function capture(
  name: string,
  check: () => Promise<string>,
): Promise<DoctorCheck> {
  try {
    return { name, ok: true, detail: await check() };
  } catch (error) {
    return {
      name,
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkDataDirectory(dataDir: string): Promise<string> {
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const probe = join(
    dataDir,
    `.doctor-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  const handle = await open(probe, "wx", 0o600);
  try {
    await handle.writeFile("team-agent-doctor\n");
  } finally {
    await handle.close();
    await unlink(probe).catch(() => undefined);
  }
  return `${dataDir} is writable`;
}
