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
      setError(cause instanceof Error ? cause.message : "加入失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="access-screen">
      <section className="access-card">
        <Logo />
        <span className="section-label">TEAM AGENT / WORK TOGETHER</span>
        <h1>{token ? "好队友，在这里相遇。" : "你的团队工作空间"}</h1>
        <p>
          {token
            ? "加入项目，借用队友的本地编码 Agent。让每一次协作，都有可追溯的结果。"
            : "使用管理员发给你的个人邀请链接，进入团队工作台。"}
        </p>
        {token ? (
          <form onSubmit={submit} className="stack">
            <label className="field">
              <span>怎么称呼你？</span>
              <input
                required
                maxLength={80}
                placeholder="团队里大家熟悉的名字"
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
              {busy ? "正在加入…" : "加入工作空间"}
              <Icon name="arrow" />
            </button>
          </form>
        ) : (
          <div className="info-note">
            <Icon name="shield" />
            每个邀请链接仅供一位成员使用。
          </div>
        )}
        <footer>
          <Icon name="shield" size={14} />
          Codex 和 Git 凭据始终留在所有者的电脑上
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
  const [name, setName] = useState("我的 Codex");
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
      setError(cause instanceof Error ? cause.message : "配对失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={simulated ? "把工作台带到你的团队" : "接入我的 Agent"}
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
            ? "同一个团队，各自的 Agent。"
            : "让你的 Codex，成为团队的队友。"}
        </h2>
        <p className="muted">
          {simulated
            ? "当前是演示工作台。部署 Coordinator 并连接本地 Runner 后，即可执行真实开发任务。"
            : "共享后，项目成员可以选择你的 Agent 执行代码任务，使用你本机已有的 Codex 和 Git 权限。你可以在空闲时暂停共享。"}
        </p>
        <ol className="connect-steps">
          <li>
            <b>01</b>
            <div>
              <strong>启动团队工作台</strong>
              <p>部署 Coordinator，配置仓库与共享分支。</p>
            </div>
          </li>
          <li>
            <b>02</b>
            <div>
              <strong>在所有者电脑上配对</strong>
              <p>本机安装并登录 Codex，确认 Git 仓库可读写。</p>
            </div>
          </li>
          <li>
            <b>03</b>
            <div>
              <strong>邀请队友，开始协作</strong>
              <p>队友用浏览器提交任务，一起检查交付记录。</p>
            </div>
          </li>
        </ol>
        {simulated ? (
          <a
            className="button button-primary"
            href="https://github.com/boxzeemon-beep/team-agent/blob/main/README.zh-CN.md"
            target="_blank"
            rel="noreferrer"
          >
            打开部署指南
            <Icon name="up" size={16} />
          </a>
        ) : pairing ? (
          <div className="stack">
            <h3>在你的电脑上运行</h3>
            {pairing.sourceCommands && (
              <>
                <p className="muted">
                  目标验收需要本版 Runner。请打开本版源码目录，先执行
                  <code> pnpm install --frozen-lockfile </code>和
                  <code> pnpm build </code>，再运行下方配对命令。
                </p>
                <label className="field">
                  <span>你的终端</span>
                  <select
                    value={commandShell}
                    onChange={(event) =>
                      setCommandShell(
                        event.target.value as "powershell" | "posix",
                      )
                    }
                  >
                    <option value="powershell">Windows（PowerShell 7+）</option>
                    <option value="posix">macOS / Linux（bash、zsh）</option>
                  </select>
                </label>
              </>
            )}
            <pre className="command-output">{pairingCommand}</pre>
            <CopyButton value={pairingCommand} label="复制配对命令" />
            <small className="muted">
              单次有效，过期时间：{timeLabel(pairing.expiresAt, true)}。Runner
              连接后会出现在 Agent 列表中。
            </small>
          </div>
        ) : (
          <form onSubmit={create} className="stack">
            <label className="field">
              <span>Agent 名称</span>
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
              {busy ? "生成中…" : "生成一次性配对命令"}
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
      setNotice("项目设置已保存。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存失败");
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
      setError(cause instanceof Error ? cause.message : "邀请生成失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="项目设置" onClose={onClose}>
      <div className="management-content">
        <h2>让团队朝同一个方向。</h2>
        <p className="muted">
          {simulated
            ? "演示项目的只读配置。真实部署后，管理员可配置仓库并邀请成员。"
            : "所有 Agent 使用同一份项目配置，按顺序在共享分支上工作。"}
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
              { key: "projectName", label: "项目名称", max: 100 },
              { key: "repositoryUrl", label: "Git 仓库地址", max: 2000 },
              { key: "baseBranch", label: "基础分支", max: 200 },
              { key: "sharedBranch", label: "共享工作分支", max: 200 },
              {
                key: "testCommand",
                label: "测试命令（验收目标必填）",
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
              {busy ? "保存中…" : "保存项目设置"}
            </button>
          )}
        </form>
        {canEdit && (
          <section className="invite-section">
            <h3>邀请新队友</h3>
            <p className="muted">每个链接仅供一位成员使用，请单独分享。</p>
            {invite ? (
              <div className="stack">
                <input
                  aria-label="个人邀请链接"
                  readOnly
                  value={invite.inviteUrl}
                />
                <div className="inline-form">
                  <CopyButton value={invite.inviteUrl} label="复制邀请链接" />
                  <span className="muted small">
                    有效期至 {timeLabel(invite.expiresAt, true)}
                  </span>
                </div>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={createInvite}
                  disabled={busy}
                >
                  为下一位队友生成邀请
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
                生成个人邀请
              </button>
            )}
          </section>
        )}
      </div>
    </Modal>
  );
}
