import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  COPY_RESET_MS,
  type CopyStatus,
  createCopyFeedback,
} from "./copy-feedback.js";

describe("createCopyFeedback", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reports copied then resets to idle after the timeout", async () => {
    const statuses: CopyStatus[] = [];
    const { copy } = createCopyFeedback((status) => statuses.push(status), {
      writeText: async () => {},
    });

    await copy("hello");
    expect(statuses).toEqual(["copied"]);

    vi.advanceTimersByTime(COPY_RESET_MS);
    expect(statuses).toEqual(["copied", "idle"]);
  });

  it("reports error when writeText rejects and never reports copied", async () => {
    const statuses: CopyStatus[] = [];
    const { copy } = createCopyFeedback((status) => statuses.push(status), {
      writeText: async () => {
        throw new Error("denied");
      },
    });

    await copy("hello");
    expect(statuses).toEqual(["error"]);

    vi.advanceTimersByTime(COPY_RESET_MS);
    expect(statuses).toEqual(["error"]);
  });

  it("does not accumulate timers on repeated copies", async () => {
    const statuses: CopyStatus[] = [];
    const { copy } = createCopyFeedback((status) => statuses.push(status), {
      writeText: async () => {},
      resetAfterMs: 1000,
    });

    await copy("a");
    await copy("b");
    await copy("c");
    expect(statuses).toEqual(["copied", "copied", "copied"]);

    vi.advanceTimersByTime(1000);
    expect(statuses).toEqual(["copied", "copied", "copied", "idle"]);
  });

  it("clears a pending timer when a later copy fails", async () => {
    const statuses: CopyStatus[] = [];
    let fail = false;
    const { copy } = createCopyFeedback((status) => statuses.push(status), {
      writeText: async () => {
        if (fail) throw new Error("denied");
      },
      resetAfterMs: 1000,
    });

    await copy("a");
    fail = true;
    await copy("b");
    expect(statuses).toEqual(["copied", "error"]);

    vi.advanceTimersByTime(1000);
    expect(statuses).toEqual(["copied", "error"]);
  });

  it("clears pending state on dispose", async () => {
    const statuses: CopyStatus[] = [];
    const { copy, dispose } = createCopyFeedback(
      (status) => statuses.push(status),
      { writeText: async () => {} },
    );

    await copy("a");
    dispose();
    vi.advanceTimersByTime(COPY_RESET_MS);
    expect(statuses).toEqual(["copied"]);
  });
});
