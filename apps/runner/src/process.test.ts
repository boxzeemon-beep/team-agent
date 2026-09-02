import { describe, expect, it } from "vitest";
import {
  COMMAND_OUTPUT_TRUNCATION_MARKER,
  MAX_COMMAND_OUTPUT_BYTES,
  runCommand,
} from "./process.js";

describe("runCommand output bounds", () => {
  it("bounds stdout and stderr independently with visible markers", async () => {
    const result = await runCommand(process.execPath, [
      "-e",
      `process.stdout.write("a".repeat(${MAX_COMMAND_OUTPUT_BYTES + 50_000})); process.stderr.write("b".repeat(${MAX_COMMAND_OUTPUT_BYTES + 50_000}))`,
    ]);
    expect(Buffer.byteLength(result.stdout)).toBeLessThanOrEqual(
      MAX_COMMAND_OUTPUT_BYTES,
    );
    expect(Buffer.byteLength(result.stderr)).toBeLessThanOrEqual(
      MAX_COMMAND_OUTPUT_BYTES,
    );
    expect(result.stdout.endsWith(COMMAND_OUTPUT_TRUNCATION_MARKER)).toBe(true);
    expect(result.stderr.endsWith(COMMAND_OUTPUT_TRUNCATION_MARKER)).toBe(true);
  });
});
