import { createApp } from "./server.js";

export { CoordinatorDatabase } from "./database.js";
export {
  type CoordinatorApp,
  type CoordinatorOptions,
  createApp,
  createServer,
} from "./server.js";

async function main(): Promise<void> {
  const coordinator = await createApp({
    logger: { level: process.env.TEAM_AGENT_LOG_LEVEL ?? "info" },
  });
  const port = Number(process.env.TEAM_AGENT_PORT ?? 4310);
  const host = process.env.TEAM_AGENT_HOST ?? "127.0.0.1";
  await coordinator.app.listen({ port, host });
  if (coordinator.bootstrapInvite) {
    coordinator.app.log.info(
      `Bootstrap admin invite: ${coordinator.bootstrapInvite.url}`,
    );
  }
}

const launchedDirectly =
  process.argv[1] && new URL(import.meta.url).pathname === process.argv[1];
if (launchedDirectly)
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
