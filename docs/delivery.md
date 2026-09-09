# Validation and delivery record — September 9, 2026

Team Agent's workbench rebuild adds explicit goals, acceptance criteria, bounded revision, fresh read-only review, and inspectable evidence to the existing Coordinator/Runner workflow. This document records what was actually checked and what remains unproven.

## Published source and browser demo

The rebuild started from `316f887a844e2381fef40f2a4486b0969eb91322` and was published on `main`, with the first workbench publication ending at [597c9de](https://github.com/boxzeemon-beep/team-agent/commit/597c9de5863436df5e20eefcff3f10ef28c8e34e).

That exact publication completed:

- [CI: Ubuntu/Windows × Node.js 22/24, plus workflow lint](https://github.com/boxzeemon-beep/team-agent/actions/runs/34336226380).
- [CodeQL analysis](https://github.com/boxzeemon-beep/team-agent/actions/runs/34336226287).
- [GitHub Pages build and deployment](https://github.com/boxzeemon-beep/team-agent/actions/runs/34336226258).

The public page and its JavaScript, CSS, and favicon returned HTTP 200 after deployment. Later changes, including English documentation and interface copy, should be checked against their own [CI runs](https://github.com/boxzeemon-beep/team-agent/actions/workflows/ci.yml) and [Pages deployment](https://github.com/boxzeemon-beep/team-agent/actions/workflows/pages.yml), rather than attributed to the earlier commit's run.

[GitHub Pages](https://boxzeemon-beep.github.io/team-agent/) is a browser simulation. It does not host a real Coordinator or invoke Codex or Git. Current installation instructions use `main` source or a source-built container. This publication did not create a new version tag, GitHub Release, Docker image, or hosted team service; existing `:0.2.0`, `:latest`, and Release Runner artifacts belong to v0.2.0.

## Implemented behavior

| Requirement | Implementation |
| --- | --- |
| Make completion explicit | Persist a goal, context, 1–12 criteria, and a 1–3 round limit; retain direct tasks |
| Require evidence | Run the real configured test command, then a fresh read-only Codex review of every criterion |
| Handle review failures | Revise within the agreed limit, retest and rereview, or retain evidence in an attention state |
| Prevent unreviewed publication | Capture the reviewed Git tree, check tree/HEAD around commit, and push the matching immutable commit SHA |
| Isolate recovery and retries | Freeze assignments, persist run IDs/checkpoints, reject late old-run messages, archive retry evidence |
| Continue from feedback | Create an editable new goal with source context, preserving old results and requiring new acceptance |
| Make results inspectable | Responsive UI, explicit Agent selection, filtering/search, file/hunk diffs, raw tests, review history, Markdown export |
| Detect older Runners | Require `goal-workflow-v1` for verified goals while preserving direct-task compatibility |

“Independent” review means a fresh read-only context on the same Runner. It does not mean another machine, another person, or a guaranteed different model. Publication means Git commit/push to the shared branch, not application deployment or automatic merge.

## Local validation of the rebuild

Environment: Windows, Node.js 24.19.0, pnpm 11.19.0, Git 2.53.0.

| Check | Observed result and scope |
| --- | --- |
| `pnpm test` | **104 tests across 16 files passed**, covering SQLite recovery, real WebSocket protocol, run isolation, acceptance gates, revision limits, simulated recovery, Git publication/recovery, drafts, and export |
| `pnpm typecheck` | Shared package, Coordinator, and Runner passed |
| `pnpm lint` | Passed |
| `pnpm build` | Coordinator server/web and Runner production builds passed |
| `pnpm build:pages` | Static demo build under `/team-agent/` passed |
| `pnpm demo:smoke` | Passed using real invitations, sessions, pairing, WebSocket, SQLite, and local Git commit/push; Runner behavior was mocked and no model was called |
| Project `pnpm run doctor` | Signed-in Codex, app-server handshake, Git, and directory checks passed; this is not proof of model generation |
| Browser checks | Two-round simulation, review history, draft reload, long feedback preservation and disabled over-limit submission, actual Markdown download, desktop and 390px layout |
| Real backend UI | Temporary Coordinator invitation, empty workspace, one-time pairing command, and PowerShell/POSIX selection worked; that temporary test server was stopped |

The narrow layout had no page or detail-dialog horizontal overflow; the detail tabs intentionally scroll within their own strip. These browser checks were performed on the original rebuild before the English copy update.

Git regressions used isolated temporary repositories and local bare remotes, including rejection of changes made after review and commit-hook replacement of reviewed code. Pairing-command tests executed PowerShell 7 and checked that quotes, dollar signs, command substitution, backticks, line breaks, and Unicode arguments survived as literal data. Rollup emitted dependency-annotation notices from Zod, but the builds succeeded.

## Real Codex attempt: implementation passed, full acceptance did not

A separate isolated smoke attempt used the Runner goal-execution module, a real Codex app-server, and local Git. Its tiny test repository was not Team Agent and was not connected to GitHub.

- The model changed `math.cjs` to `exports.sum = (a, b) => a + b;`.
- The Runner executed Node assertions and recorded `3 sum assertions passed`; the test file's Git blob was unchanged.
- Implementation and review used different real thread IDs. The read-only reviewer began inspecting Git evidence.
- Model communication repeatedly timed out over WebSocket and fell back. The review did not return acceptance JSON before the script's 260-second deadline, after which the script closed app-server.
- The workflow ended **blocked, without publication**. Local HEAD remained the baseline and the bare remote contained only its original `main` branch.

The [machine-readable evidence](validation/real-codex-smoke.json) preserves the implementation, test output, thread identities, Git state, and no-publication result. **A complete real-model acceptance-and-push cycle has not yet been demonstrated.** It still needs a successful run in an environment with stable model connectivity.

This attempt also exposed a possible compatibility issue between ephemeral review threads and local collaboration tooling. The final review-thread setting became `ephemeral: false`, while retaining a fresh context, read-only sandbox, and no write approvals. Protocol tests cover that adjustment; the full real-model smoke was not rerun afterward.

## Source material and limits

The research used the official Claude video [How the Claude Code team uses Claude Code](https://www.youtube.com/watch?v=S-sYlFiGFv8), published September 2, 2026, with a duration of 22:23, and its publicly available English captions. The [research notes](claude-team-research.md) distinguish chapter summaries, supplementary official sources, and this project's design choices. No video copy or full transcript is distributed in this repository.

The execution backend remains Codex. This work does not implement cloud-hosted Runners, execution while the owner's machine is asleep, Slack organization identities, scheduled routines, or parallel writable worktrees. Actual use depends on an available Runner, working Codex access, a runnable project test command, and the owner's Git permissions.

[Set up real execution](getting-started.md) · [Workbench guide](workbench.md) · [Repository overview](../README.md)
