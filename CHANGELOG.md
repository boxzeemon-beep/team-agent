# Changelog

Notable changes to Team Agent are recorded here. This project follows [Semantic Versioning](https://semver.org/) and keeps upcoming changes under `Unreleased`.

## [Unreleased]

### Added

- Verified goals with a durable brief, context, up to 12 acceptance criteria and a bounded 1–3 round implementation/test/review loop.
- A fresh read-only Codex review session on the selected Runner for each acceptance check. Real configured tests, complete per-criterion evidence, no unresolved issues and a stable reviewed Git tree gate commit and push.
- Goal progress, per-criterion results, previous review history and source-linked feedback that prepares a new editable goal draft without inheriting prior acceptance.
- Persisted goal run IDs and Runner checkpoints, frozen assignment recovery, monotonic workflow events, archived retry evidence and an explicit `goal-workflow-v1` capability requirement.
- A shared simulation state machine for browser and Coordinator demos: first-review failure, bounded revision, second-review success, and a blocked outcome at a one-round limit.
- A task workbench preview with task search and filters, Agent availability, session drafts, recovery actions, and a dedicated task evidence view.
- File-by-file unified diff inspection with old/new line numbers, raw test records, activity history, and Markdown export that preserves simulated-evidence labels.
- `pnpm demo:browser` for a local browser-only preview at `http://127.0.0.1:4321/team-agent/`, with six initial examples covering completion, failure, an offline Agent, and cancellation.
- A browser simulation engine with a serial queue, offline reassignment, failure retry, persisted demo state, interrupted-task recovery, and a reset scoped to its own storage entry.
- A [workbench guide](docs/workbench.md) describing the preview, architecture decisions, validation commands, and the boundary between simulated and real execution.

### Changed

- Goal mode requires a real project test command; direct tasks retain the existing execution path. Independent review uses a separate Codex session on the same Runner, while project writes remain serial.
- Retrying a verified goal creates a new run and clears current evidence while preserving the original brief and previous evidence in history. Reconnecting preserves the current run; an older run cannot overwrite its progress or terminal outcome.
- Browser demo storage now validates the goal contract and restores interrupted review/revision work. The failed one-round seed remains blocked on retry until the user creates a new goal with a different agreement.
- Real and simulated task views share the API and snapshot subscription interface; real execution continues to use the Coordinator, SQLite, and paired Runners.
- English and Chinese READMEs lead with the unreleased local preview. Existing v0.2.0 deployment instructions remain available, and original tactical screenshots and videos are marked as historical.

### Fixed

- Generate source Runner pairing commands for the unreleased goal workflow, with literal argument quoting for PowerShell 7 and POSIX shells.
- Show the actual file paths and diffs before local file-change approvals, including approval requests that only contain an item ID.
- Preserve complete oversized follow-up drafts for editing, block over-limit submission, and stop labeling canceled goals as actively implementing.
- Start the Coordinator correctly when directly invoked through a Windows filesystem path, while keeping library imports side-effect free.

- Reject incomplete or inconsistent acceptance evidence before entering publishing/completed workflow phases or marking a verified task complete.
- Reject stale goal run messages and non-increasing workflow sequences; preserve the immutable prefix of recorded reviews.
- Recheck tests, read-only acceptance and the reviewed tree when recovering a previously accepted goal, rather than treating a cached model result as authorization to publish.
- Reject messages from replaced Runner connections before they can update tasks or release the project execution lock.
- Prevent a registered WebSocket from rebinding to another Agent or consuming another pairing token.
- Match Codex notifications to both thread and turn identity, including nested completion IDs and notifications delivered in the same stdout chunk as the start response.
- Record the branch from the persisted task assignment when reporting completion, even if project settings changed during execution.
- Preserve an already published task commit when recovery verification changes files, instead of amending it and reporting an unpublished replacement SHA as complete.
- Launch the local demo through Node and the package manager entry point on Windows; make Runner path and mock-process tests independent of Unix paths, executable shebangs, and signal callbacks.

The workbench preview is not a published release. Browser evidence is simulated;
verification commands and execution boundaries are documented in the workbench guide.

## [0.2.0] - 2026-09-04

### Added

- A credential-free browser Demo Mode with four sample Agents and simulated task completion, diff, tests, and commit evidence.
- A credential-free smoke demo with macOS/Linux and Windows launchers that exercises the real Coordinator, SQLite store, Runner WebSocket protocol, task lifecycle, local Git branch, test output, diff, and commit persistence.
- A tactical collaboration lobby that keeps Agent selection, queue state, project context, and task evidence visible in one screen.
- Responsive lobby layouts for desktop, tablet, and mobile viewports.
- Design-partner and workflow-story issue forms for recruiting real teams and collecting sanitized adoption evidence.
- Reusable launch, outreach, and case-study templates for the first public adoption program.

### Changed

- The README now leads with the product's multiplayer-lobby positioning, a runnable Demo Mode, and direct trial, deployment, and contribution paths.
- Runner pairing documentation now matches the one-time GitHub Release command generated by the Coordinator.
- Docker Compose now pulls the pinned Coordinator release by default, with an explicit development override for local source builds and published `linux/amd64` plus `linux/arm64` images.
- CI now executes the smoke demo on the Node.js 22 and 24 matrix entries.

## [0.1.0] - 2026-09-01

### Added

- Coordinator with invitation-based membership, shared project context, SQLite persistence, SSE updates, and a serial task queue.
- Local Runner integration for Codex app-server, managed Git workspaces, owner approvals, tests, commits, and pushes.
- Explicit Agent selection, offline task waiting and reassignment, task recovery, progress, diff, test, and commit records.
- Docker Compose Coordinator deployment and an unauthenticated health endpoint.
- Installable Runner CLI with `runner` and `doctor` commands for Node.js, Coordinator, Git, Codex, and data-directory checks.
- English and Chinese product documentation with a recorded product walkthrough, architecture, security model, support policy, and public roadmap.
- Node.js 22 and 24 CI, CodeQL, workflow linting, issue forms, pull request templates, and tag-based release artifacts.
- Versioned Coordinator and Runner archives, checksums, and a GHCR Coordinator image.

[Unreleased]: https://github.com/boxzeemon-beep/team-agent/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/boxzeemon-beep/team-agent/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/boxzeemon-beep/team-agent/releases/tag/v0.1.0
