import { describe, expect, it } from "vitest";
import {
  runnerClientMessageSchema,
  runnerTextLimits,
  textTruncationMarker,
  truncateText,
} from "./index.js";

describe("Runner text limits", () => {
  it("truncates inside the schema limit and includes a marker", () => {
    const message = truncateText("x".repeat(100), 32);
    expect(message).toHaveLength(32);
    expect(message.endsWith(textTruncationMarker)).toBe(true);
  });

  it("rejects Runner payloads above the matching persisted-field limit", () => {
    expect(() =>
      runnerClientMessageSchema.parse({
        type: "task.progress",
        taskId: "task",
        message: "x".repeat(runnerTextLimits.progress + 1),
      }),
    ).toThrow();
  });
});
