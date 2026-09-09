import type {
  DashboardSnapshot,
  InviteResponse,
  PairingResponse,
  ProjectSettings,
} from "@team-agent/shared";
import { type FormEvent, useState } from "react";
import { api, json } from "./api.js";
import { CopyButton, Icon, Logo, Modal, timeLabel } from "./ui.js";

export function AccessScreen({
  token,
  onClaimed,
}: {
  token: string;
  onClaimed: () => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/invites/claim", json("POST", { token, name }));
      history.replaceState({}, "", location.pathname);
      onClaimed();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not join the workspace.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="access-screen">
      <section className="access-card">
        <Logo />
        <span className="section-label">TEAM AGENT / WORK TOGETHER</span>
        <h1>{token ? "Join your team." : "Your team workspace"}</h1>
        <p>
          {token
            ? "Join the project, use a teammate’s local coding Agent, and review the evidence behind every result."
            : "Open your personal invitation link from the project administrator to join the workspace."}
        </p>
        {token ? (
          <form onSubmit={submit} className="stack">
            <label className="field">
              <span>Your name</span>
              <input
                required
                maxLength={80}
                placeholder="The name your teammates know"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            {error && (
              <div className="alert alert-error" role="alert">
                {error}
              </div>
            )}
            <button
              type="submit"
              className="button button-primary"
              disabled={busy || !name.trim()}
            >
              {busy ? "Joining…" : "Join workspace"}
              <Icon name="arrow" />
            </button>
          </form>
        ) : (
          <div className="info-note">
            <Icon name="shield" />
            Each invitation can be used by one person.
          </div>
        )}
        <footer>
          <Icon name="shield" size={14} />
          Codex and Git credentials stay on the owner’s computer
        </footer>
      </section>
    </main>
  );
}

export function ConnectModal({
  simulated,
  onClose,
}: {
  simulated: boolean;
  onClose: () => void;
}) {
  const [name, setName] = useState("My Codex");
  const [pairing, setPairing] = useState<PairingResponse | null>(null);
  const [commandShell, setCommandShell] = useState<"powershell" | "posix">(
    "powershell",
  );
  const pairingCommand =
    pairing?.sourceCommands?.[commandShell] ?? pairing?.command ?? "";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      setPairing(
        await api<PairingResponse>(
          "/api/agents/pair",
          json("POST", { displayName: name }),
        ),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not create a pairing command.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={simulated ? "Set up Team Agent" : "Connect Agent"}
      onClose={onClose}
    >
      <div className="management-content">
        <div className="connect-visual">
          <span>
            <Icon name="agents" size={25} />
          </span>
          <i />
          <Logo />
          <i />
          <span>
            <Icon name="terminal" size={25} />
          </span>
        </div>
        <h2>
          {simulated
            ? "One team. Your own Agents."
            : "Share your Codex with your team."}
        </h2>
        <p className="muted">
          {simulated
            ? "This is a simulated workspace. Deploy a Coordinator and connect a local Runner to run real coding tasks."
            : "Project members can assign coding tasks to your Agent using your existing local Codex and Git access. You can pause sharing when it is idle."}
        </p>
        <ol className="connect-steps">
          <li>
            <b>01</b>
            <div>
              <strong>Start the workspace</strong>
              <p>
                Deploy the Coordinator and configure the repository and shared
                branch.
              </p>
            </div>
          </li>
          <li>
            <b>02</b>
            <div>
              <strong>Pair on the owner’s computer</strong>
              <p>
                Install and sign in to Codex, then confirm Git read and write
                access.
              </p>
            </div>
          </li>
          <li>
            <b>03</b>
            <div>
              <strong>Invite your teammates</strong>
              <p>
                Teammates submit tasks in the browser and review the results
                together.
              </p>
            </div>
          </li>
        </ol>
        {simulated ? (
          <a
            className="button button-primary"
            href="https://github.com/boxzeemon-beep/team-agent/blob/main/docs/getting-started.md"
            target="_blank"
            rel="noreferrer"
          >
            Open setup guide
            <Icon name="up" size={16} />
          </a>
        ) : pairing ? (
          <div className="stack">
            <h3>Run on your computer</h3>
            {pairing.sourceCommands && (
              <>
                <p className="muted">
                  Verified goals require the current Runner. In this version’s
                  source directory, run
                  <code> pnpm install --frozen-lockfile </code> and
                  <code> pnpm build </code>, then run the pairing command below.
                </p>
                <label className="field">
                  <span>Your terminal</span>
                  <select
                    value={commandShell}
                    onChange={(event) =>
                      setCommandShell(
                        event.target.value as "powershell" | "posix",
                      )
                    }
                  >
                    <option value="powershell">Windows (PowerShell 7+)</option>
                    <option value="posix">macOS / Linux (bash, zsh)</option>
                  </select>
                </label>
              </>
            )}
            <pre className="command-output">{pairingCommand}</pre>
            <CopyButton value={pairingCommand} label="Copy pairing command" />
            <small className="muted">
              Single use. Expires: {timeLabel(pairing.expiresAt, true)}. The
              Runner will appear in the Agent list once connected.
            </small>
          </div>
        ) : (
          <form onSubmit={create} className="stack">
            <label className="field">
              <span>Agent name</span>
              <input
                required
                maxLength={80}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            {error && (
              <div role="alert" className="alert alert-error">
                {error}
              </div>
            )}
            <button
              type="submit"
              className="button button-primary"
              disabled={busy || !name.trim()}
            >
              {busy ? "Generating…" : "Generate pairing command"}
              <Icon name="arrow" size={16} />
            </button>
          </form>
        )}
      </div>
    </Modal>
  );
}

export function SettingsModal({
  snapshot,
  simulated,
  onClose,
  onRefresh,
}: {
  snapshot: DashboardSnapshot;
  simulated: boolean;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}) {
  const [settings, setSettings] = useState<ProjectSettings>(snapshot.settings);
  const [invite, setInvite] = useState<InviteResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const canEdit = snapshot.me.isAdmin && !simulated;
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api("/api/settings", json("PUT", settings));
      await onRefresh();
      setNotice("Project settings saved.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save settings.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function createInvite() {
    setBusy(true);
    setError("");
    try {
      setInvite(await api<InviteResponse>("/api/invites", json("POST")));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not create an invitation.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Project settings" onClose={onClose}>
      <div className="management-content">
        <h2>One configuration for the whole team.</h2>
        <p className="muted">
          {simulated
            ? "This demo configuration is read-only. In a real deployment, administrators can configure the repository and invite members."
            : "All Agents use the same project settings and take turns working on the shared branch."}
        </p>
        {error && (
          <div role="alert" className="alert alert-error">
            {error}
          </div>
        )}
        {notice && (
          <div role="status" className="alert alert-success">
            {notice}
          </div>
        )}
        <form onSubmit={save} className="settings-form">
          {(
            [
              { key: "projectName", label: "Project name", max: 100 },
              { key: "repositoryUrl", label: "Git repository URL", max: 2000 },
              { key: "baseBranch", label: "Base branch", max: 200 },
              { key: "sharedBranch", label: "Shared working branch", max: 200 },
              {
                key: "testCommand",
                label: "Test command (required for verified goals)",
                max: 2000,
              },
            ] as const
          ).map(({ key, label, max }) => (
            <label className="field" key={key}>
              <span>{label}</span>
              <input
                required={key !== "testCommand"}
                maxLength={max}
                readOnly={!canEdit}
                value={settings[key]}
                onChange={(event) =>
                  setSettings({ ...settings, [key]: event.target.value })
                }
              />
            </label>
          ))}
          {canEdit && (
            <button
              type="submit"
              className="button button-primary"
              disabled={busy}
            >
              {busy ? "Saving…" : "Save project settings"}
            </button>
          )}
        </form>
        {canEdit && (
          <section className="invite-section">
            <h3>Invite a teammate</h3>
            <p className="muted">
              Each link is for one person. Share it individually.
            </p>
            {invite ? (
              <div className="stack">
                <input
                  aria-label="Personal invitation link"
                  readOnly
                  value={invite.inviteUrl}
                />
                <div className="inline-form">
                  <CopyButton
                    value={invite.inviteUrl}
                    label="Copy invite link"
                  />
                  <span className="muted small">
                    Expires {timeLabel(invite.expiresAt, true)}
                  </span>
                </div>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={createInvite}
                  disabled={busy}
                >
                  Create another invite
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="button button-secondary"
                onClick={createInvite}
                disabled={busy}
              >
                <Icon name="plus" size={16} />
                Create invite
              </button>
            )}
          </section>
        )}
      </div>
    </Modal>
  );
}
