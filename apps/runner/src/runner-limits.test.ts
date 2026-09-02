import {
  runnerClientMessageSchema,
  runnerTextLimits,
  textTruncationMarker,
} from "@team-agent/shared";
import { describe, expect, it } from "vitest";
import { boundRunnerMessage } from "./runner.js";

describe("boundRunnerMessage", () => {
  it("bounds every large completion field before transport", () => {
    const message = boundRunnerMessage({
      type: "task.complete",
      taskId: "task",
      result: "r".repeat(runnerTextLimits.result + 1),
      diff: "d".repeat(runnerTextLimits.diff + 1),
      testOutput: "t".repeat(runnerTextLimits.testOutput + 1),
      commitSha: "abc",
      contextThroughSequence: 0,
    });
    const parsed = runnerClientMessageSchema.parse(message);
    expect(parsed.type).toBe("task.complete");
    if (parsed.type !== "task.complete") return;
    expect(parsed.result).toHaveLength(runnerTextLimits.result);
    expect(parsed.diff).toHaveLength(runnerTextLimits.diff);
    expect(parsed.testOutput).toHaveLength(runnerTextLimits.testOutput);
    expect(parsed.result.endsWith(textTruncationMarker)).toBe(true);
  });

  it("bounds attention diagnostics and progress", () => {
    const attention = boundRunnerMessage({
      type: "task.needs_attention",
      taskId: "task",
      message: "m".repeat(runnerTextLimits.attention + 1),
      diff: "d".repeat(runnerTextLimits.diff + 1),
      testOutput: "t".repeat(runnerTextLimits.testOutput + 1),
    });
    const progress = boundRunnerMessage({
      type: "task.progress",
      taskId: "task",
      message: "p".repeat(runnerTextLimits.progress + 1),
    });
    expect(() => runnerClientMessageSchema.parse(attention)).not.toThrow();
    expect(() => runnerClientMessageSchema.parse(progress)).not.toThrow();
  });
});
