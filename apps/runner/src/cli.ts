import { parseCliOptions, parseDoctorOptions } from "./config.js";
import { runDoctor } from "./doctor.js";
import { TeamAgentRunner } from "./runner.js";

let runner: TeamAgentRunner | undefined;

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const command = argv[0];
  if (command === "doctor") {
    process.exitCode = await runDoctor(parseDoctorOptions(argv.slice(1)));
    return;
  }
  if (command === "--help" || command === "-h" || command === "help") {
    console.log(usage());
    return;
  }
  if (command && !command.startsWith("--") && command !== "runner")
    throw new Error(`Unknown command: ${command}\n\n${usage()}`);
  const options = parseCliOptions(command === "runner" ? argv.slice(1) : argv);
  runner = new TeamAgentRunner(options);
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      console.log(`Received ${signal}; stopping runner…`);
      void runner?.stop().finally(() => process.exit(0));
    });
  }
  await runner.start();
}

function usage(): string {
  return [
    "Team Agent Runner",
    "",
    "Usage:",
    "  team-agent runner --coordinator URL --pair TOKEN [--name NAME] [--data-dir PATH]",
    "  team-agent doctor [--coordinator URL] [--data-dir PATH]",
    "",
    "Legacy direct Runner arguments remain supported.",
  ].join("\n");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
