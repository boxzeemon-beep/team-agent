# Team Agent — goal-and-acceptance workbench

Delivery evidence and remaining limits: [2026-09-09 validation record](docs/delivery.md).

**The `main` source includes the goal-and-acceptance workbench.** Describe an
outcome, provide context and acceptance criteria, then select a teammate's Agent.
A verified goal runs real project tests and a fresh read-only Codex review before
publication; fixable failures return to implementation within a 1–3 round limit.
Try the **[browser workbench on GitHub Pages](https://boxzeemon-beep.github.io/team-agent/)**,
or run the same simulation locally. The historical screenshots and videos below
still show the original v0.2.0 interface.

This update covers source and Pages. It does not create a version tag or update
the Docker images: `:0.2.0` and `:latest` still contain the original release.
Use current `main` source or build it yourself for the new workbench and Runner.

From this source checkout, use Node.js 22.13+ and pnpm 11:

```bash
pnpm install --frozen-lockfile
pnpm demo:browser
```

Open **[the local workbench](http://127.0.0.1:4321/team-agent/)**. The browser
simulation starts with six sample tasks. The keyboard-accessibility example
contains a failed first review and a passing second review. The API-retry example
is blocked at its one-round limit: retrying preserves that limit. Create a new
two-round goal to watch the complete simulated revision cycle. Task details also
offer file-by-file diffs, raw test records, feedback, and Markdown export.

**The browser preview does not call Codex, modify a repository, or run tests.**
Its examples and results are simulated. Real execution still uses the Coordinator
and a paired Runner on the Agent owner's computer.

The isolated real-Codex smoke attempt completed implementation and project tests,
but network timeouts prevented the independent review from finishing. It ended
**blocked**, without publishing code. A complete real-model acceptance-and-push
cycle has not yet been demonstrated; see the [recorded evidence](docs/delivery.md#真实-codex-尝试实现成功完整验收未通过).

### Two execution modes

| Mode | Agreement and completion |
| --- | --- |
| Verified goal | Context, 1–12 unique acceptance criteria and a 1–3 round limit. A configured project test command is required. Every criterion must pass a fresh read-only review of the tested tree, with no unresolved issues, before Git commit and push. |
| Direct task | The existing implement → configured tests → commit/push workflow. It does not produce an independent per-criterion acceptance verdict. |

Implementation and review use separate Codex sessions on the **same selected
Runner**. The review session is read-only and cannot approve write escalation.
Unverifiable evidence, a failed final review, a changed reviewed tree, or an
exhausted round budget leaves the goal needing attention; a completed model turn
alone cannot authorize publication. Code writes remain serialized per project.

Use task feedback to prepare a **new editable goal draft** with the source task,
previous result, and context. This does not silently submit another job or inherit
the old acceptance verdict. Retry instead keeps the same agreed goal, creates a
new run ID and archives earlier evidence. Reconnection restores the existing run
and frozen assignment. Old Runners show an explicit `goal-workflow-v1` upgrade
requirement for verified goals while remaining compatible with direct tasks.

The product direction is informed by [Anthropic's team workflow discussion](docs/claude-team-research.md);
this implementation continues to execute through Codex, not a Claude backend.

[Workbench guide, architecture, and validation](docs/workbench.md) ·
[简体中文](README.zh-CN.md) · [Deployment guide](#deploy-for-your-team)

---

The artwork and video below document the original v0.2.0 tactical lobby. The
public Pages link opens the browser workbench. Pinned release commands still run
v0.2.0; source commands run whichever branch you have checked out.

<p align="center">
  <img src="docs/assets/social-preview.png" alt="Team Agent — the multiplayer lobby for coding agents" width="100%" />
</p>

## Team workflow

**The multiplayer lobby for your team's coding agents.**

Let anyone on your team send coding tasks from a browser—even if they do not
have a local coding agent. They choose a teammate's Codex, follow the work live,
and inspect the response, diff, tests, and commit when it finishes.

**Codex and Git credentials stay on the Agent owner's computer.**

[▶ Open the browser workbench](https://boxzeemon-beep.github.io/team-agent/) ·
[🚀 Deploy for your team](#deploy-for-your-team) ·
[⭐ Star Team Agent](https://github.com/boxzeemon-beep/team-agent)

[![CI](https://github.com/boxzeemon-beep/team-agent/actions/workflows/ci.yml/badge.svg)](https://github.com/boxzeemon-beep/team-agent/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/boxzeemon-beep/team-agent)](https://github.com/boxzeemon-beep/team-agent/releases/latest)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.13-43853d.svg)](package.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[简体中文](README.zh-CN.md) · [Tactical lobby](docs/tactical-lobby-experience.md) · [Architecture](docs/architecture.md) · [Security](SECURITY.md) · [Roadmap](ROADMAP.md) · [Contributing](CONTRIBUTING.md)

![Historical v0.2.0 tactical lobby: choose an Agent and inspect a simulated result](docs/assets/team-agent-demo.gif)

**Pick your squad → launch a task → watch it work → review the evidence**

_[Watch the historical MP4](docs/assets/team-agent-demo.mp4) · [Original workflow guide](docs/quickstart-demo.md). These assets show the v0.2.0 tactical UI; use the Pages demo for the current workbench. Task evidence in these assets is simulated._

## Understand Team Agent in 30 seconds

1. **Contribute an Agent.** A teammate pairs a Runner with their existing local Codex and Git sessions.
2. **Borrow it from the browser.** Another teammate writes a task and explicitly chooses which Agent should run it.
3. **Follow the mission.** The Coordinator streams progress, carries forward project context, and serializes code writes.
4. **Review the evidence.** Every completed task records the requester, Agent owner, messages, response, diff, tests, and commit.

```text
Browser-only teammate
        ↓ chooses
Teammate's Agent
        ↓ works through
Local Codex + local Git credentials
        ↓ returns
Response + diff + tests + commit
```

No Codex login or Git credential is uploaded to the Coordinator.

## Why teams use Team Agent

### Access without account sharing

Browser-only teammates can use contributed Agents while Codex and Git
credentials remain on their owners' computers.

### Explicit control

The requester chooses the Agent. Offline tasks wait or can be reassigned;
project writes remain serialized by one project-wide execution lock.

### Results you can review

The team sees who requested the task, which Agent ran it, what changed, which
tests ran, and which commit was created.

## Open the browser demo

**[Open the public browser workbench →](https://boxzeemon-beep.github.io/team-agent/)** — no install, login, Coordinator, Codex, or Git repository required. Explore goals, bounded revision, per-criterion reviews, feedback drafts and evidence export. All data and actions are simulated and run only in the browser. Pages is not a hosted Coordinator and cannot pair a real Runner.

For the historical v0.2.0 tactical lobby, run its pinned image locally without a Codex login or Git repository:

```bash
docker run --rm -p 127.0.0.1:4310:4310 -e TEAM_AGENT_DEMO_MODE=1 \
  ghcr.io/boxzeemon-beep/team-agent:0.2.0
```

Open <http://127.0.0.1:4310>. Pick the online Demo Agent and submit a task. It
will move through `queued → running → completed`, then show an explicitly
simulated result, diff, tests, and commit. Demo Mode never launches Codex or
touches a Git repository; Runner pairing and deployment-management actions are
disabled. The command binds the playground to your local machine only.

From a source checkout, run `pnpm install` followed by `pnpm demo:playground`
and open <http://127.0.0.1:4311>.

## Try it in 5 minutes

Run the real Coordinator, SQLite store, Runner protocol, task queue, Git change,
test, commit, and push flow on one computer. This smoke demo does not require
Docker, a remote Git host, a public tunnel, or a Codex login.

```bash
git clone https://github.com/boxzeemon-beep/team-agent.git
cd team-agent
./examples/smoke-demo/run.sh
```

A successful run ends with:

```text
SMOKE DEMO PASSED
Validated: invite → pairing → Runner → task → Git → completion
```

Windows users can run `powershell -ExecutionPolicy Bypass -File .\examples\smoke-demo\run.ps1`.

[Read the demo guide](docs/quickstart-demo.md) · [Connect a real Codex Runner](#3-pair-a-runner)

## How it works

1. A Coordinator host creates a project and invites members.
2. An Agent owner clicks **Contribute my Codex** and runs the generated one-time pairing command.
3. The Runner creates a managed Git clone and connects to the owner's local Codex app-server.
4. A requester enters a task and explicitly selects an available Agent.
5. The Coordinator assigns the earliest runnable task while holding the project-wide lock.
6. The Runner updates the shared branch, asks Codex to work, runs the configured tests, commits, and pushes.
7. The web app streams progress and stores the final response, diff, test output, and commit.

Native Codex approvals remain on the Agent owner's computer. When approval is needed, the task is shown as **waiting for owner**.

## Deploy for your team

### Requirements

#### Coordinator host

- Docker with Compose
- A Git repository writable by all contributing Agent owners
- A private HTTPS route to the Coordinator; [Tailscale Serve](https://tailscale.com/docs/reference/tailscale-cli/serve) is the documented path

#### Runner host

- Node.js 22.13+ and npm for the Runner installer
- Codex CLI installed and signed in
- Git pull/push access to the project repository
- Network access to the Coordinator

Browser-only members install nothing.

### 1. Start the Coordinator

```bash
git clone https://github.com/boxzeemon-beep/team-agent.git
cd team-agent
cp .env.example .env
docker compose up -d
```

The default Compose configuration pulls the released multi-architecture
Coordinator image `ghcr.io/boxzeemon-beep/team-agent:0.2.0`, so the first start
does not build the source tree. Docker selects the published `linux/amd64` or
`linux/arm64` image for the current host. Set `TEAM_AGENT_IMAGE` in `.env` when
pinning another published version.

This image, and the `:latest` image, still contain v0.2.0. To deploy the new
workbench from `main`, use the source-build Compose override below or the
non-Docker source commands. This source/Pages update does not publish a new image.

Set `TEAM_AGENT_PUBLIC_URL` in `.env` to the HTTPS URL your team will use. Docker Compose publishes port `4310`; restrict that port to your private network or host firewall. With Tailscale Serve:

```bash
tailscale serve --bg 4310
tailscale serve status
```

Restart the stack after changing `.env`. The first one-time administrator invite is available in `docker compose logs coordinator`. The named Docker volume preserves Coordinator state across container restarts.

For a local container built from the current checkout, apply the development
override explicitly:

```bash
docker compose -f compose.yaml -f compose.dev.yaml up -d --build
```

For source development without Docker, use Node.js 22.13+ and pnpm 11. Install with
`pnpm install --frozen-lockfile`, then use `pnpm coordinator:dev` for the development
server and web UI at `http://127.0.0.1:4311`. For a production build, run `pnpm build`
followed by `pnpm coordinator:built`. The Coordinator listens on `127.0.0.1:4310`
by default. Running `pnpm coordinator` starts only the backend; build the web assets
first if it should serve the UI as well.

### 2. Configure a project

Claim the administrator invite in a browser, then set:

- project name;
- Git repository URL;
- base branch;
- shared working branch;
- test command (required for verified goals; optional for direct tasks).

Generate one invite per teammate from the project page.

### 3. Pair a Runner

For the new workbench, use a current `main` checkout on the Agent owner's
computer and click **Connect Agent** in the web UI. Install and build the source,
then run the generated one-time pairing command from that checkout:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm runner --coordinator "https://COORDINATOR.example" --pair "PAIRING_TOKEN" --name "Alex's Codex"
```

The current Runner supports `goal-workflow-v1`, which verified goals require.
The latest GitHub Release Runner remains v0.2.0 and does not gain this capability
from a `main` or Pages update. For the older release workflow, its command is:

```bash
npx --yes --package=https://github.com/boxzeemon-beep/team-agent/releases/latest/download/team-agent-runner.tgz \
  team-agent runner --coordinator "https://COORDINATOR.example" --pair "PAIRING_TOKEN" --name "Alex's Codex"
```

The release command runs the latest GitHub Release artifact directly and does not assume that an npm package has been published. For a persistent global command for that release, use `scripts/runner-install.sh` or `scripts/runner-install.ps1`, then verify the host with `team-agent doctor --coordinator "https://COORDINATOR.example"`. Use the source workflow above for verified goals.

The pairing token is single-use. The Runner stores its device identity, Codex thread IDs, and managed clones under `~/.team-agent/runner/` unless `--data-dir` is set. Restart it later with the same Coordinator, name, and data directory, but without `--pair`.

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
| Runner OS | Node.js 22.13+; shell installer for macOS/Linux and PowerShell installer for Windows |

## Current scope

Team Agent deliberately starts with one project, Codex, and serialized execution. Automatic Agent routing, parallel worktrees, multiple projects, additional coding agents, and managed cloud infrastructure are roadmap items rather than hidden complexity in the current release.

## Roadmap

Near-term priorities:

1. Repeatable clean-host installation plus upgrade, backup, and rollback guidance.
2. A 5-minute real-Codex first-task walkthrough and sample repository.
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

## Build the shared-Agent workflow with us

If Team Agent would help your team:

- ⭐ [Star the repository](https://github.com/boxzeemon-beep/team-agent)
- ▶ [Open the demo lobby](#open-the-demo-lobby)
- 💬 [Tell us about your workflow](https://github.com/boxzeemon-beep/team-agent/discussions)
- 🛠️ [Pick a good first issue](https://github.com/boxzeemon-beep/team-agent/issues?q=is%3Aissue%20is%3Aopen%20label%3A%22good%20first%20issue%22)

## Join the first 20 design partners

We are looking for 20 teams to try one bounded development task with Team Agent and help prioritize the next releases.

- [Apply as a design partner](https://github.com/boxzeemon-beep/team-agent/issues/new?template=design_partner.yml) if your team can run one bounded task and share product feedback. The application is a public issue, so use sanitized details.
- [Share a sanitized workflow](https://github.com/boxzeemon-beep/team-agent/issues/new?template=workflow_story.yml) if you already use Team Agent.
- Use [GitHub Discussions](https://github.com/boxzeemon-beep/team-agent/discussions) for setup questions and product ideas.

## License

[MIT](LICENSE)
