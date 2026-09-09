import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  pairingCommands,
  quotePosixArgument,
  quotePowerShellArgument,
} from "./pairing-command.js";

const values = {
  coordinator: "https://team.invalid/a'b?x=$HOME&y=$(echo ignored)",
  token: "one'two\"three`four\nfive",
  name: '队友\'s "Codex" $HOME $(echo injected) `echo injected`\nline two',
};

describe("literal Runner pairing commands", () => {
  it("uses shell literal quoting for apostrophes, quotes, dollars, backticks and newlines", () => {
    expect(quotePosixArgument("a'b\"$()`\nc")).toBe("'a'\"'\"'b\"$()`\nc'");
    expect(quotePowerShellArgument("a'b\"$()`\nc")).toBe("'a''b\"$()`\nc'");
    const commands = pairingCommands(
      values.coordinator,
      values.token,
      values.name,
    );
    expect(commands.sourceCommands?.posix).toBe(
      `node apps/runner/dist/cli.js runner --coordinator ${quotePosixArgument(values.coordinator)} --pair ${quotePosixArgument(values.token)} --name ${quotePosixArgument(values.name)}`,
    );
    expect(
      commands.command.endsWith(`--name ${quotePosixArgument(values.name)}`),
    ).toBe(true);
  });

  it("passes every generated source argument unchanged through the platform's real shell", () => {
    const directory = mkdtempSync(join(tmpdir(), "team-agent-shell-"));
    try {
      const capture = join(directory, "capture.cjs");
      writeFileSync(
        capture,
        "process.stdout.write(JSON.stringify(process.argv.slice(2)))",
      );
      const commands = pairingCommands(
        values.coordinator,
        values.token,
        values.name,
      ).sourceCommands;
      if (!commands) throw new Error("Expected source commands");
      const windows = process.platform === "win32";
      const quote = windows ? quotePowerShellArgument : quotePosixArgument;
      const command = (windows ? commands.powershell : commands.posix).replace(
        "node apps/runner/dist/cli.js",
        `${windows ? "& " : ""}${quote(process.execPath)} ${quote(capture)}`,
      );
      const output = windows
        ? execFileSync(
            "pwsh",
            ["-NoProfile", "-NonInteractive", "-Command", command],
            { encoding: "utf8" },
          )
        : execFileSync("/bin/sh", ["-c", command], { encoding: "utf8" });
      expect(JSON.parse(output)).toEqual([
        "runner",
        "--coordinator",
        values.coordinator,
        "--pair",
        values.token,
        "--name",
        values.name,
      ]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
