# Team Agent

**Share coding agents across your team—without sharing credentials.**

![Team Agent demo: choose a teammate's Agent, follow execution, and inspect the result](docs/assets/team-agent-demo.gif)

_Real product states shown with isolated demo data._

[![CI](https://github.com/boxzeemon-beep/team-agent/actions/workflows/ci.yml/badge.svg)](https://github.com/boxzeemon-beep/team-agent/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[简体中文](README.zh-CN.md) · [Architecture](docs/architecture.md) · [Security](SECURITY.md) · [Roadmap](ROADMAP.md) · [Contributing](CONTRIBUTING.md)

Team Agent lets a teammate who only has a browser assign a coding task to a Codex Runner contributed by another team member. The Runner works on its owner's computer with that owner's existing Codex and Git sessions. A central Coordinator keeps the shared conversation, serializes code changes, and records the result.

```text
Requester writes a task
        ↓
Explicitly chooses a teammate's Agent
        ↓
Owner's Runner uses local Codex + Git credentials
        ↓
Team sees progress, response, diff, tests, and commit
```

No Codex login or Git credential is uploaded to the Coordinator.

## Why Team Agent

- **Let every teammate participate.** Members without a local coding agent only need the web app.
- **Keep credentials on the owner's machine.** The Runner reuses local Codex and Git sessions.
- **Make agent choice explicit.** The requester chooses whose Agent should do the work; offline work waits or can be reassigned.
- **Preserve team context.** Each Runner receives the project discussion and commits added since its Agent last participated.
- **Keep changes auditable.** Completed tasks include the requester, Agent owner, messages, diff, tests, and commit SHA.
- **Avoid branch races.** One project-wide execution lock serializes active code tasks.

## How it works

1. A Coordinator host creates a project and invites members.
2. An Agent owner clicks **Contribute my Codex** and runs the generated one-time pairing command.
3. The Runner creates a managed Git clone and connects to the owner's local Codex app-server.
4. A requester enters a task and explicitly selects an available Agent.
5. The Coordinator assigns the earliest runnable task while holding the project-wide lock.
6. The Runner updates the shared branch, asks Codex to work, runs the configured tests, commits, and pushes.
7. The web app streams progress and stores the final response, diff, test output, and commit.

Native Codex approvals remain on the Agent owner's computer. When approval is needed, the task is shown as **waiting for owner**.

## Quickstart

### Requirements

**Coordinator host**

- Docker with Compose
- A Git repository writable by all contributing Agent owners
- A private HTTPS route to the Coordinator; [Tailscale Serve](https://tailscale.com/docs/reference/tailscale-cli/serve) is the documented path

**Runner host**

- Node.js 22.5+ and npm for the Runner installer
- Codex CLI installed and signed in
- Git pull/push access to the project repository
- Network access to the Coordinator

Browser-only members install nothing.

### 1. Start the Coordinator

```bash
git clone https://github.com/boxzeemon-beep/team-agent.git
cd team-agent
cp .env.example .env
docker compose up -d --build
```

Set `TEAM_AGENT_PUBLIC_URL` in `.env` to the HTTPS URL your team will use. Docker Compose publishes port `4310`; restrict that port to your private network or host firewall. With Tailscale Serve:

```bash
tailscale serve --bg 4310
tailscale serve status
```

Restart the stack after changing `.env`. The first one-time administrator invite is available in `docker compose logs coordinator`. The named Docker volume preserves Coordinator state across container restarts.

For source development instead, use Node.js 22.5+ and pnpm 11, then run `pnpm coordinator` or `pnpm coordinator:built`; the source process listens on `127.0.0.1:4310` by default.

### 2. Configure a project

Claim the administrator invite in a browser, then set:

- project name;
- Git repository URL;
- base branch;
- shared working branch;
- optional test command.

Generate one invite per teammate from the project page.

### 3. Pair a Runner

On the Agent owner's computer, install the released Runner, verify its environment, then open the project and click **Contribute my Codex**:

```bash
curl -fsSL https://raw.githubusercontent.com/boxzeemon-beep/team-agent/main/scripts/runner-install.sh | sh
team-agent doctor --coordinator "https://COORDINATOR.example"
team-agent runner --coordinator "https://COORDINATOR.example" --pair "PAIRING_TOKEN" --name "Alex's Codex"
```

PowerShell users can run `scripts/runner-install.ps1`. Contributors working from a source checkout can install dependencies and use `pnpm runner -- ...` with the same options.

The pairing token is single-use. The Runner stores its device identity, Codex thread IDs, and managed clones under `~/.team-agent/runner/` unless `--data-dir` is set. Restart it later without `--pair`, using the same data directory.

## Architecture

```mermaid
flowchart LR
    B[Team browsers] -->|HTTPS + SSE| C[Coordinator]
    C --> DB[(SQLite)]
    C <-->|WebSocket| R1[Owner A Runner]
    C <-->|WebSocket| R2[Owner B Runner]
    R1 --> X1[Local Codex]
    R1 --> G1[Local Git credentials]
    R2 --> X2[Local Codex]
    R2 --> G2[Local Git credentials]
    G1 --> R[(Shared Git repository)]
    G2 --> R
```

The TypeScript monorepo has two processes and one shared protocol package:

```text
apps/coordinator/   Fastify API, SQLite, SSE, Runner WebSocket, React web app
apps/runner/        Codex app-server client, managed Git clone, tests, commit, push
packages/shared/    Types and wire protocol shared by Coordinator, web, and Runner
```

See [Architecture](docs/architecture.md) for scheduling, context, and recovery details.

## Security boundaries

- Codex and Git credentials stay on each Runner owner's computer.
- Browser sessions, invites, and Runner pairing credentials are stored server-side as SHA-256 digests.
- Session cookies use `HttpOnly` and `SameSite=Strict`; HTTPS deployments also use `Secure`.
- Pairing tokens are short-lived and single-use.
- Network reachability and application membership are separate controls: Tailscale ACLs or equivalent firewall rules limit who can reach the Coordinator, while project invites control who can enter.
- A contributed Agent can modify and push to the configured shared branch using its owner's Git permissions. Only pair Runners and invite members you trust for that repository.
- The project owner reviews the shared branch before merging into a protected branch.

Read the [security policy](SECURITY.md) and the detailed [security model and deployment checklist](docs/security.md). Use private vulnerability reporting for security-sensitive reports.

## Support matrix

| Capability | Current status |
| --- | --- |
| Coding agent | Codex first; adapter ecosystem is planned |
| Projects per Coordinator | One |
| Active code tasks | One per project, serialized |
| Agent selection | Explicit requester choice |
| Offline Agent | Task waits and can be reassigned |
| Git workflow | One configurable shared working branch |
| Owner approvals | Handled in the owner's local Codex session |
| Coordinator state | Local SQLite with restart recovery |
| Runner state | Local device token, Codex threads, managed clones, completion receipts |
| Network exposure | Source process uses loopback by default; Compose publishes configurable port `4310` |
| Browsers | Modern desktop browsers |
| Runner OS | Node.js 22.5+; shell installer for macOS/Linux and PowerShell installer for Windows |

## Current scope

Team Agent deliberately starts with one project, Codex, and serialized execution. Automatic Agent routing, parallel worktrees, multiple projects, additional coding agents, and managed cloud infrastructure are roadmap items rather than hidden complexity in the current release.

## Roadmap

Near-term priorities:

1. Reproducible, versioned Coordinator and Runner release artifacts.
2. A 5-minute first-task walkthrough and sample repository.
3. A documented Agent adapter interface, followed by a second coding-agent integration.
4. Multi-project support, isolated parallel worktrees, and web-based approval workflows.

See the public [roadmap](ROADMAP.md) and detailed [release gates](docs/roadmap.md). Feature proposals are welcome in [GitHub Discussions](https://github.com/boxzeemon-beep/team-agent/discussions); focused implementation issues and pull requests are welcome too.

## Development

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm coordinator:dev

# Before opening a pull request
pnpm exec biome check .
pnpm typecheck
pnpm test
pnpm build
```

The automated suite covers invitations and cookies, Runner pairing, serial scheduling, offline-Agent skipping, result persistence, and SQLite restart recovery.

See [CONTRIBUTING.md](CONTRIBUTING.md) to get started. If Team Agent solves a real problem for your team, share the workflow that worked—those examples will shape the adapter API and installation experience.

## License

[MIT](LICENSE)
