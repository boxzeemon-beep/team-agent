# Public release checklist

Use this checklist for a versioned Team Agent release. It focuses on reproducible installation, the shared-Agent workflow, recovery, and an honest public support matrix.

## Distribution

- [ ] Coordinator installation works from the documented release artifact.
- [ ] The default Compose image and `.env.example` pin the version being released, and every documented architecture is published.
- [ ] `compose.dev.yaml` still builds the Coordinator from the current checkout.
- [ ] Runner installation works on every listed operating system.
- [ ] Version and upgrade instructions are published.
- [ ] A clean environment completes the quickstart without repository-specific knowledge.
- [ ] The sample project produces a visible response, diff, test result, and commit.

## Core workflow

- [ ] A project administrator can create individual invitations.
- [ ] At least two owners can pair and share independent Codex Runners.
- [ ] A browser-only member can explicitly select either shared Agent.
- [ ] An offline selected Agent causes the task to wait without blocking another runnable task.
- [ ] A waiting task can be reassigned before execution.
- [ ] Cross-Agent work includes new shared discussion and preceding commit context.
- [ ] Every completed task identifies its requester, actual Agent, owner, conversation, diff, tests, and commit.

## Scheduling and recovery

- [ ] Concurrent submissions still produce at most one active code task.
- [ ] Coordinator restart restores members, Agents, queue, messages, settings, context cursors, and active lock.
- [ ] Runner restart restores pairing identity, managed clones, project Codex threads, and unfinished assignment state.
- [ ] Test and Git failures preserve diagnostics and enter `needs_attention`.
- [ ] Emergency release requires an administrator, a disconnected Agent, and an active task.

## Security and operations

- [ ] HTTPS and network access controls follow [`security.md`](security.md).
- [ ] The base branch is protected and shared-branch changes are reviewed.
- [ ] The Coordinator data directory has restricted filesystem permissions.
- [ ] Stop-and-copy backup and restore have been exercised with the release artifact.
- [ ] No Codex or Git credential appears in Coordinator logs, database records, task results, or screenshots.
- [ ] Private vulnerability reporting is available.

## Public repository

- [ ] README commands match the published artifacts exactly.
- [ ] Support matrix, known limitations, license, contributing guide, and security model are visible.
- [ ] CI passes on the release commit.
- [ ] Release notes describe changes, migration steps, and known issues.
- [ ] Screenshots or recordings show the released UI rather than a mockup.
- [ ] Issues and Discussions have maintainers and response expectations.
