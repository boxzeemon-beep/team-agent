# Five-minute local smoke demo

## Public browser playground (no credentials)

To open a populated Team Agent lobby without connecting Codex or a Git
repository, run this single command from the repository root:

```bash
pnpm demo:playground
```

Then visit <http://127.0.0.1:4311>. The playground signs in as a demo member,
seeds four clearly labelled demo Agents plus representative task states, and
lets you submit work to an online Agent. Each submitted task progresses through
`queued → running → completed` automatically. Its result, diff, test output,
and commit identifier are explicitly marked as simulated demo data. Demo mode
does not launch Codex and does not read, modify, commit, or push a Git
repository. Its SQLite file is isolated under `.data/demo/` by default, or
under `$TEAM_AGENT_DATA_DIR/demo/` when an explicit data root is configured.
Runner pairing and real deployment-management endpoints are disabled in Demo
Mode, so the playground cannot hand work to a local Runner.

Remove `TEAM_AGENT_DEMO_MODE=1` to use the regular invitation, Runner, Codex,
and Git workflow; the normal coordinator behavior is unchanged.

The smoke demo below is a separate protocol-level check that exercises a local
Git repository.

This demo proves Team Agent's basic coordination loop on one computer, with no
cloud account, public tunnel, remote repository, Docker, or Codex session.

## Prerequisites

- Node.js 22.5 or newer;
- Git;
- pnpm 11 or Corepack when workspace dependencies are not already installed.

The launchers install the locked workspace dependencies when needed, so the
first run also requires access to the package registry.

## Run it

From a fresh checkout on macOS or Linux:

```bash
./examples/smoke-demo/run.sh
```

From Windows PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\examples\smoke-demo\run.ps1
```

Both launchers check Node.js and Git, install the locked workspace dependencies
when needed, and then run the same isolated demo. With dependencies available,
the demo itself is designed to finish in under five minutes and removes its
temporary files afterward. First-run dependency download time varies by host and
network.

When workspace dependencies are already installed, the package script is
platform-neutral:

```bash
pnpm demo:smoke
```

To keep the generated SQLite database, Git repositories, and Runner workspace
for inspection:

```bash
TEAM_AGENT_DEMO_KEEP=1 ./examples/smoke-demo/run.sh
```

In PowerShell, set `$env:TEAM_AGENT_DEMO_KEEP = "1"` before running `run.ps1`.

## What it validates

The demo uses the real Coordinator and its SQLite database. A small protocol
smoke Runner connects over the real WebSocket endpoint and performs a real
change in an isolated local Git repository:

```text
health check
  → bootstrap invite and browser-style session
  → project settings
  → one-time Runner pairing
  → WebSocket registration
  → queued task assignment
  → progress update
  → local test and Git commit
  → shared branch push
  → stored result, diff, test output, and commit SHA
```

A successful run ends with output similar to:

```text
SMOKE DEMO PASSED
Task: TASK_ID
Commit: COMMIT_SHA
Validated: invite → session → pairing → WebSocket Runner → task → Git → completion
```

## Scope

The smoke Runner intentionally makes a deterministic edit instead of launching
Codex. This keeps the first proof independent of credentials and confirms that
the Coordinator, queue, Runner protocol, SQLite persistence, and Git result path
work together.

After this passes, continue with the main quickstart to connect a real Runner.
That second step covers Codex login, owner approvals, Git credentials, and access
through your team's HTTPS URL.

## Onboarding friction this isolates

The production quickstart spans Docker, HTTPS routing, a writable remote Git
repository, browser invitation, a Codex login, and the Runner release artifact.
Those are all required at their respective trust boundaries, but combining them
in the first attempt makes failures hard to locate. This demo establishes a
known-good local baseline before any external dependency is introduced.
