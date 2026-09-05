import { useEffect, useRef, useState } from "react";

export type CopyStatus = "idle" | "copied" | "error";

export const COPY_RESET_MS = 1800;

export interface CopyFeedbackOptions {
  writeText?: (text: string) => Promise<void>;
  resetAfterMs?: number;
}

export interface CopyFeedbackController {
  copy: (text: string) => Promise<void>;
  dispose: () => void;
}

function defaultWriteText(text: string): Promise<void> {
  return navigator.clipboard.writeText(text);
}

/**
 * Small state machine for short-lived copy feedback. Pure (no React, no DOM)
 * so the timer hygiene and status transitions are unit-testable.
 */
export function createCopyFeedback(
  onStatus: (status: CopyStatus) => void,
  options: CopyFeedbackOptions = {},
): CopyFeedbackController {
  const writeText = options.writeText ?? defaultWriteText;
  const resetAfterMs = options.resetAfterMs ?? COPY_RESET_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function clearTimer() {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  }

  async function copy(text: string): Promise<void> {
    try {
      await writeText(text);
    } catch {
      clearTimer();
      onStatus("error");
      return;
    }
    clearTimer();
    onStatus("copied");
    timer = setTimeout(() => {
      timer = undefined;
      onStatus("idle");
    }, resetAfterMs);
  }

  function dispose() {
    clearTimer();
  }

  return { copy, dispose };
}

export function useCopyFeedback(options: CopyFeedbackOptions = {}): {
  status: CopyStatus;
  copy: (text: string) => Promise<void>;
} {
  const [status, setStatus] = useState<CopyStatus>("idle");
  const controllerRef = useRef<CopyFeedbackController | null>(null);

  if (controllerRef.current === null) {
    controllerRef.current = createCopyFeedback(setStatus, options);
  }

  useEffect(() => {
    const controller = controllerRef.current;
    return () => controller?.dispose();
  }, []);

  return { status, copy: controllerRef.current.copy };
}
