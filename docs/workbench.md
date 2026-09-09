# Workbench guide

[Overview](../README.md) · [Installation and configuration](getting-started.md) · [Validation record](delivery.md)

The workbench brings the goal, selected Agent, progress, acceptance results, code changes, tests, and follow-up feedback into one place. This guide describes the current `main` source and the English browser demo. For real execution, first [set up a Coordinator and Runner](getting-started.md).

## Choose the right environment

| Entry point | What runs | What it proves |
| --- | --- | --- |
| [Public browser demo](https://boxzeemon-beep.github.io/team-agent/) or `pnpm demo:browser` | Browser simulation; no Coordinator, Codex, or Git execution | Interface behavior and fixed example workflows |
| `pnpm demo:playground` | Coordinator in Demo Mode plus a local web development server | Server-provided demo data and event updates; still simulated |
| `pnpm demo:smoke` | Temporary Coordinator, SQLite, WebSocket Runner protocol, and real local Git | Invitations, pairing, scheduling, tests, commit/push, and result persistence using a mock Runner |
| Coordinator plus paired Runner | Your server, the owner's Codex, and a managed Git clone | Actual work, subject to the configured tests, review, and Git permissions |

After `pnpm install --frozen-lockfile`, run `pnpm demo:browser` and open `http://127.0.0.1:4321/team-agent/`. This command requires port 4321 and does not silently choose a different port. Keep the terminal open; stop it with Ctrl+C. The playground web address defaults to `http://127.0.0.1:4311`.

## Explore the browser demo

A fresh demo contains six sample tasks. Reloading preserves this browser's demo state. The reset control restores the fixed examples; it does not delete real server data or other sites' storage.

1. **Inspect a completed goal.** Open the keyboard and screen-reader accessibility example. Compare its failed first review with its passing second review, then inspect the diff and test record. These are historical simulated results.
2. **Reassign an offline task.** Open the dark-mode contrast example, switch from offline Scout to an available Agent, and watch the simulated queue. A queued task for an offline Agent does not block runnable work for online Agents.
3. **Understand the round limit.** The API timeout/retry example has a one-round budget. Retrying starts a new run with the same budget; it does not turn a failed first-round review into an automatic pass. Earlier evidence remains available in the task history.
4. **Create a two-round goal.** Supply a goal, context, and one criterion per line. Choose an online Agent and two rounds. The demo illustrates implementation, testing, review, revision, and a second review. Refresh during revision to check recovery. Its result is a fixed example, not code generated from your request.
5. **Turn feedback into a new draft.** Add feedback to a task and use the follow-up action. Review the carried-forward source task, previous result, context, and acceptance criteria before submitting. An existing draft is preserved until you choose to replace it.
6. **Export evidence.** Filter or search for a task, inspect its file-by-file diff and raw test output, and export the record as Markdown. The export includes the agreed goal, review history, current state, diff, tests, commit, and conversation. Simulated records retain their simulation labels.

Task and reply drafts use the current tab's session storage; demo state uses local storage. They do not synchronize across devices. If browser storage is unavailable, the current page can still work, but refresh recovery is not guaranteed. Existing user-authored or saved historical content is not automatically translated.

## Direct tasks and verified goals

| Mode | Input | Completion |
| --- | --- | --- |
| **Direct task** | A request and an explicitly selected Agent | Implements, runs configured tests if present, and follows the existing commit/push workflow; no independent per-criterion verdict |
| **Verified goal** | Goal, context, acceptance criteria, selected Agent, and round limit | Real configured tests pass, every criterion passes a fresh read-only review, and the reviewed Git state matches the state being published |

Context accepts up to 10,000 characters. A verified goal requires 1–12 nonempty, unique acceptance criteria, up to 500 characters each. Leading and trailing whitespace is trimmed. The one-to-three-round limit bounds the implementation/test/review loop. Choose at least two rounds if you want room for a revision after the first review.

The administrator must configure a real project test command before using verified goals. An empty command or missing test evidence cannot count as a passing check. Use the target project's own validation, including dependency installation when a fresh managed clone needs it. Project tests and acceptance review answer different questions; both must pass.

## What happens during a verified goal?

1. **Implementation.** Codex works in the managed clone using the frozen goal, context, criteria, and earlier review issues.
2. **Testing.** The Runner executes the configured project command and records its output and exit result.
3. **Review.** A new Codex session on the same Runner inspects the repository, baseline diff, and test evidence. This session is read-only and cannot approve write escalation. It returns a verdict and evidence for every criterion. It is a fresh context, not another person or necessarily another model.
4. **Revision or attention.** Fixable issues return to implementation while rounds remain. Each revision is tested and reviewed again. Missing evidence, invalid review data, inability to continue, or an exhausted budget leaves the task needing attention.
5. **Publication.** Only after tests and review pass does the Runner check the reviewed Git tree and HEAD, create the commit, and push the exact matching commit. Changes after review invalidate the evidence. The Coordinator also validates the workflow completion record.

A review verdict can be `pass`, `fail`, or `unknown`. Unknown, missing, duplicate, or malformed criterion results do not satisfy acceptance. A model saying that it finished does not authorize publication. Review can still miss defects, so inspect the recorded evidence before merging the shared branch.

In this product, **publication means Git commit and push**. It does not deploy an application, open a pull request, merge a protected branch, or replace your team's release process.

## Progress and recovery

| State or action | What it means | What to do |
| --- | --- | --- |
| Waiting for Agent | The selected Agent is offline or paused | Bring it online or reassign eligible queued work |
| Waiting for owner | Codex requires an owner decision | The owner checks the Runner terminal and responds locally |
| Needs attention | Tests, review, Git, or another execution step could not complete | Inspect the error and evidence, resolve the local issue, then resume/retry as appropriate |
| Reconnect | Restores the existing run and frozen assignment | Restart with the same persistent data directories; do not expect a new budget |
| Retry | Creates a new run of the same agreed goal and round limit | Earlier evidence is archived; resuming a paused real Agent may also be needed |
| Follow-up draft | Creates a new editable agreement using feedback and earlier context | Review the new goal and criteria, then explicitly submit it |

Each verified execution has a persistent `runId`. The assignment freezes project settings and context boundaries. Late messages from an old run cannot overwrite a new run. Workflow sequences advance monotonically and recorded review history cannot be silently replaced.

A disconnected active Runner retains the project lock and its assignment. Reconnection resumes from persisted state; it does not give a task unlimited fresh rounds. Recovery of a previously accepted goal still rechecks tests, review, and Git consistency. Retry archives the previous run's review, diff, tests, and errors, while preserving the original goal and round limit.

A comment alone does not submit another task, alter an assigned goal, or authorize another publication. Follow-up drafts reference earlier results without inheriting a passing verdict. Long feedback is kept for editing; content beyond submission limits must be shortened before it can be sent.

If an administrator needs to release a disconnected active task, first confirm that its Runner process has stopped. The emergency operation preserves the assignment, pauses the Agent, and records the intervention. See [troubleshooting](getting-started.md#troubleshooting).

## Compatibility and execution boundaries

Verified goals require a Runner that advertises `goal-workflow-v1`. Older Runners can still handle direct tasks, but verified goals need a current source-built Runner. The `v0.2.0` Release Runner and published Docker images do not automatically gain new features when `main` or Pages changes.

One project-wide lock serializes code work on the configured shared branch. The current implementation does not provide multiple projects, concurrent writable worktrees, automatic Agent selection, or cloud workers. The Runner computer must remain available, with working Codex access and Git permissions.

Real mode uses HTTP, SSE, and fallback polling. Browser mode uses a separate simulation engine. Both demo environments share a simulation state machine and label example tests/reviews/version values. Restored connectivity is a transport signal, not proof that a task succeeded.

## Reproduce the checks

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm demo:smoke
pnpm build
pnpm build:pages
```

For a local Codex/Git/environment check, use `pnpm run doctor --data-dir .data/workbench-doctor`. The `run` is intentional: `pnpm doctor` invokes pnpm's own command. The project doctor checks login, app-server handshake, Git availability, and directory access; it does not prove model generation or remote Git write permission.

The [validation record](delivery.md) distinguishes mock protocol tests, real local Git checks, browser checks, and the real-Codex attempt that remained blocked after review network timeouts. Neither the browser demo nor the integration smoke test proves a complete real-model acceptance-and-push run.
