import type { AgentStatus, TaskStatus } from "@team-agent/shared";
import { type ReactNode, useEffect, useRef, useState } from "react";

const paths = {
  grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  tasks: "M9 5h12M9 12h12M9 19h12M3 5l1 1 2-2M3 12l1 1 2-2M3 19l1 1 2-2",
  agents:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.87M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  activity: "M2 12h4l3-8 6 16 3-8h4",
  plus: "M12 5v14M5 12h14",
  arrow: "M5 12h14M13 6l6 6-6 6",
  up: "M7 17 17 7M7 7h10v10",
  chevron: "m9 5 7 7-7 7",
  down: "m6 9 6 6 6-6",
  check: "m5 12 4 4L19 6",
  clock: "M12 8v4l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  alert:
    "M12 8v5M12 17h.01M10.3 3.9 1.8 18.1A2 2 0 0 0 3.5 21h17a2 2 0 0 0 1.7-2.9L13.7 3.9a2 2 0 0 0-3.4 0",
  close: "m6 6 12 12M6 18 18 6",
  search: "m21 21-4.35-4.35M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  code: "m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16",
  branch:
    "M6 3v12M18 6v2a4 4 0 0 1-4 4h-4M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0M21 5a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  shield: "M12 3 3 7v5c0 5 9 10 9 10s9-5 9-10V7zM8 12l3 3 5-6",
  settings: "M4 7h16M4 17h16M9 4v6M15 14v6",
  copy: "M9 9h12v12H9zM5 15H3V3h12v2",
  file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5",
  terminal: "m4 6 6 6-6 6M13 18h7",
  download: "M12 3v12m-5-5 5 5 5-5M5 17v4h14v-4",
  refresh:
    "M20 7v5h-5M4 17v-5h5M6.1 6a8 8 0 0 1 13.2 2M4.7 16a8 8 0 0 0 13.2 2",
  spark: "m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6z",
  book: "M12 5v16M12 5C9 2 4 3 2 4v16c4-2 7-1 10 1 3-2 6-3 10-1V4c-2-1-7-2-10 1",
  pause: "M8 5v14M16 5v14",
  play: "m7 3 14 9-14 9z",
  logout: "M9 21H3V3h6M9 12h12m-5-5 5 5-5 5",
} as const;
export type IconName = keyof typeof paths;
export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
export function Logo() {
  return (
    <span className="logo-symbol" aria-hidden="true">
      <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <path
          d="M7 8h18M16 8v17M7 15h8M17 21h8"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle cx="25" cy="21" r="3" fill="currentColor" />
      </svg>
    </span>
  );
}
export const taskStates: Record<
  TaskStatus,
  { label: string; tone: string; icon: IconName }
> = {
  queued: { label: "排队中", tone: "neutral", icon: "clock" },
  waiting_for_agent: { label: "等待 Agent", tone: "amber", icon: "clock" },
  running: { label: "执行中", tone: "blue", icon: "activity" },
  waiting_for_owner: { label: "等待所有者", tone: "amber", icon: "shield" },
  completed: { label: "已完成", tone: "green", icon: "check" },
  needs_attention: { label: "待处理", tone: "red", icon: "alert" },
  canceled: { label: "已取消", tone: "neutral", icon: "close" },
};
export const agentStates: Record<AgentStatus, { label: string; tone: string }> =
  {
    online: { label: "在线 · 可接任务", tone: "green" },
    busy: { label: "忙碌 · 可排队", tone: "blue" },
    offline: { label: "离线", tone: "neutral" },
    paused: { label: "已暂停共享", tone: "amber" },
  };
export function TaskBadge({ status }: { status: TaskStatus }) {
  const state = taskStates[status];
  return (
    <span className={`badge tone-${state.tone}`}>
      <span
        className={status === "running" ? "status-dot pulse" : "status-dot"}
      />
      {state.label}
    </span>
  );
}
export function Avatar({
  name,
  index = 0,
  small = false,
}: {
  name: string;
  index?: number;
  small?: boolean;
}) {
  return (
    <span
      className={`avatar avatar-${index % 4} ${small ? "avatar-small" : ""}`}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
export function timeLabel(value: string | null, full = false) {
  if (!value) return "尚未连接";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未知时间";
  return new Intl.DateTimeFormat(
    "zh-CN",
    full
      ? { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }
      : { hour: "2-digit", minute: "2-digit" },
  ).format(date);
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "modal-wide" : ""}`}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header className="modal-header">
        <div className="modal-kicker">
          <Logo />
          <span>{title}</span>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          aria-label="关闭弹窗"
        >
          <Icon name="close" />
        </button>
      </header>
      {children}
    </dialog>
  );
}
export function CopyButton({
  value,
  label = "复制",
}: {
  value: string;
  label?: string;
}) {
  const [state, setState] = useState("");
  useEffect(() => {
    if (!state) return;
    const timer = window.setTimeout(() => setState(""), 2400);
    return () => clearTimeout(timer);
  }, [state]);
  return (
    <button
      type="button"
      className="button button-quiet button-small"
      aria-label={state || label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setState("已复制");
        } catch {
          setState("复制失败，请手动选择");
        }
      }}
    >
      <Icon name={state === "已复制" ? "check" : "copy"} size={14} />
      <span role="status">{state || label}</span>
    </button>
  );
}
export function EmptyState({
  title,
  children,
  icon = "tasks",
}: {
  title: string;
  children: ReactNode;
  icon?: IconName;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon name={icon} size={26} />
      </span>
      <h3>{title}</h3>
      <div>{children}</div>
    </div>
  );
}
