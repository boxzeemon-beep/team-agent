import type { DashboardSnapshot } from "@team-agent/shared";
import {
  createDemoEngine,
  DemoApiError,
  type DemoEngine,
} from "./demo-engine.js";

export const isStaticDemo = import.meta.env?.VITE_STATIC_DEMO === "1";
let demoEngine: DemoEngine | undefined;

function getDemoEngine() {
  demoEngine ??= createDemoEngine();
  return demoEngine;
}

// Vite may replace this module while a simulation is active. Retiring its
// timers prevents an old engine from overwriting the recovered engine's state.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    demoEngine?.dispose();
    demoEngine = undefined;
  });
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  if (isStaticDemo) {
    try {
      return getDemoEngine().request<T>(path, init);
    } catch (cause) {
      if (cause instanceof DemoApiError)
        throw new ApiError(cause.message, cause.status);
      throw cause;
    }
  }
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("content-type"))
    headers.set("content-type", "application/json");
  const response = await fetch(path, {
    ...init,
    headers,
    credentials: "same-origin",
  });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = (await response.json()) as {
        message?: string;
        error?: string;
      };
      message = body.message ?? body.error ?? message;
    } catch {
      // Keep the useful status-based message for non-JSON responses.
    }
    throw new ApiError(message, response.status);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const getSnapshot = () => api<DashboardSnapshot>("/api/snapshot");

/** Restores only this browser demo's own storage entry, never other site data. */
export function resetDemo(): void {
  if (!isStaticDemo)
    throw new ApiError("Reset is only available in the browser demo.", 403);
  getDemoEngine().reset();
}

/** Same refresh contract for the real Coordinator and the browser simulation. */
export function subscribeSnapshots(
  onChange: () => void,
  onConnection?: (connected: boolean) => void,
): () => void {
  if (isStaticDemo) {
    onConnection?.(true);
    return getDemoEngine().subscribe(onChange);
  }
  let stream: EventSource | undefined;
  let polling: ReturnType<typeof setInterval> | undefined;
  let closed = false;
  const stopPolling = () => {
    clearInterval(polling);
    polling = undefined;
  };
  const disconnected = () => {
    if (closed) return;
    onConnection?.(false);
    if (polling === undefined) polling = setInterval(onChange, 5_000);
  };
  onConnection?.(false);
  try {
    stream = new EventSource("/api/stream");
    stream.onopen = () => {
      if (closed) return;
      stopPolling();
      onConnection?.(true);
    };
    stream.addEventListener("snapshot", () => {
      if (!closed) onChange();
    });
    // EventSource reconnects automatically; polling keeps data fresh meanwhile.
    stream.onerror = disconnected;
  } catch {
    disconnected();
  }
  return () => {
    closed = true;
    stopPolling();
    stream?.close();
  };
}

export function json(method: string, body?: unknown): RequestInit {
  return body === undefined
    ? { method }
    : { method, body: JSON.stringify(body) };
}
