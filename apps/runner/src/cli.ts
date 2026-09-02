#!/usr/bin/env node
import { parseCliOptions } from "./config.js";
import { TeamAgentRunner } from "./runner.js";

let runner: TeamAgentRunner | undefined;

async function main(): Promise<void> {
  const options = parseCliOptions(process.argv.slice(2));
  runner = new TeamAgentRunner(options);
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      console.log(`Received ${signal}; stopping runner…`);
      void runner?.stop().finally(() => process.exit(0));
    });
  }
  await runner.start();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
