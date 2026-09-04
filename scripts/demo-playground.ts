import { spawn } from "node:child_process";

const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

console.log("Starting the credential-free Team Agent demo lobby…");
console.log("Open http://127.0.0.1:4311 when the web server is ready.\n");

const child = spawn(command, ["coordinator:dev"], {
  env: { ...process.env, TEAM_AGENT_DEMO_MODE: "1" },
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    if (!child.killed) child.kill(signal);
  });
}

child.once("error", (error) => {
  console.error(`Demo lobby failed to start: ${error.message}`);
  process.exitCode = 1;
});

child.once("exit", (code, signal) => {
  if (signal) process.exitCode = 1;
  else process.exitCode = code ?? 0;
});
