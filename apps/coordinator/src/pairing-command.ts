import type { PairingResponse } from "@team-agent/shared";

/** Literal arguments, including newlines, without interpolation in either shell. */
export function quotePosixArgument(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

export function quotePowerShellArgument(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export function pairingCommands(
  coordinator: string,
  pairingToken: string,
  displayName: string,
): Pick<PairingResponse, "command" | "sourceCommands"> {
  const argumentsFor = (quote: (value: string) => string) =>
    `--coordinator ${quote(coordinator)} --pair ${quote(pairingToken)} --name ${quote(displayName)}`;
  const source = "node apps/runner/dist/cli.js runner";
  return {
    command: `npx --yes --package=https://github.com/boxzeemon-beep/team-agent/releases/latest/download/team-agent-runner.tgz team-agent runner ${argumentsFor(quotePosixArgument)}`,
    sourceCommands: {
      powershell: `${source} ${argumentsFor(quotePowerShellArgument)}`,
      posix: `${source} ${argumentsFor(quotePosixArgument)}`,
    },
  };
}
