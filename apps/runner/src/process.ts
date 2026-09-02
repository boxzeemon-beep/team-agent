import { spawn } from "node:child_process";

export const MAX_COMMAND_OUTPUT_BYTES = 1_048_576;
export const COMMAND_OUTPUT_TRUNCATION_MARKER = "\n...[output truncated]";

class BoundedOutput {
  private readonly chunks: Buffer[] = [];
  private bytes = 0;
  private truncated = false;

  append(chunk: Buffer | string): void {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    const markerBytes = Buffer.byteLength(COMMAND_OUTPUT_TRUNCATION_MARKER);
    const contentLimit = MAX_COMMAND_OUTPUT_BYTES - markerBytes;
    const remaining = contentLimit - this.bytes;
    if (remaining > 0) {
      const kept = buffer.subarray(0, remaining);
      this.chunks.push(kept);
      this.bytes += kept.length;
    }
    if (buffer.length > Math.max(remaining, 0)) this.truncated = true;
  }

  toString(): string {
    const value = Buffer.concat(this.chunks, this.bytes).toString("utf8");
    return this.truncated
      ? `${value}${COMMAND_OUTPUT_TRUNCATION_MARKER}`
      : value;
  }
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function runCommand(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; shell?: boolean } = {},
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      shell: options.shell ?? false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = new BoundedOutput();
    const stderr = new BoundedOutput();
    child.stdout.on("data", (chunk: Buffer) => stdout.append(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.append(chunk));
    child.once("error", reject);
    child.once("close", (code) =>
      resolve({
        stdout: stdout.toString(),
        stderr: stderr.toString(),
        exitCode: code ?? 1,
      }),
    );
  });
}

export async function checkedCommand(
  command: string,
  args: string[],
  cwd?: string,
): Promise<string> {
  const result = await runCommand(command, args, { ...(cwd ? { cwd } : {}) });
  if (result.exitCode !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed (${result.exitCode}): ${result.stderr || result.stdout}`,
    );
  }
  return result.stdout.trim();
}
