# From the Claude Code team's practices to Team Agent

[Product overview](../README.md) · [Workbench guide](workbench.md) · [Validation record](delivery.md)

These notes connect source material to Team Agent's design. They distinguish what the sources describe from what this project implements. The execution backend is still Codex; this is not a Claude integration or a reproduction of Anthropic's internal systems. Actual verification coverage belongs in the [validation record](delivery.md).

## Original video

| Field | Recorded information |
| --- | --- |
| Video | [How the Claude Code team uses Claude Code](https://www.youtube.com/watch?v=S-sYlFiGFv8) |
| Publisher | Official Claude channel |
| Published | September 2, 2026 |
| Duration | 1,343 seconds / 22:23 |
| Participants | Thariq Shihipar, Sid Bidasaria, Robert Boyce |
| Research method | YouTube metadata and publicly available English captions |

The research did not download the full video or save/distribute a complete transcript. The metadata's empty license field did not establish permission to redistribute it. The chapter notes below are short paraphrases; the later implementation contract is this project's own design.

## Chapter notes

| Chapter | Main theme |
| --- | --- |
| [0:00 Introduction](https://www.youtube.com/watch?v=S-sYlFiGFv8&t=0s) | How working practices have changed as models improve. |
| [0:35 From tool calls to goals](https://www.youtube.com/watch?v=S-sYlFiGFv8&t=35s) | Delegating outcomes with shared context. The 70–80% estimate near 1:23 is one participant's estimate of their own workload, not an organization-wide statistic. |
| [2:17 Adapting to progress](https://www.youtube.com/watch?v=S-sYlFiGFv8&t=137s) | Reconsidering supporting mechanisms when model capabilities change. |
| [4:48 Questions, artifacts, and Claude Tag](https://www.youtube.com/watch?v=S-sYlFiGFv8&t=288s) | Visual artifacts as a way to discuss work; a participant's experience, not a universal rule. |
| [6:41 Remote loops and routines](https://www.youtube.com/watch?v=S-sYlFiGFv8&t=401s) | Remote execution reduces dependence on an always-awake laptop. |
| [8:52 Dynamic workflows](https://www.youtube.com/watch?v=S-sYlFiGFv8&t=532s) | Parallel investigation, independent challenge, and synthesis leave humans more room for overall judgment. |
| [14:04 Verification and feedback](https://www.youtube.com/watch?v=S-sYlFiGFv8&t=844s) | Connecting checks, review, and user feedback into an improvement loop. |
| [18:37 Earlier development experiences](https://www.youtube.com/watch?v=S-sYlFiGFv8&t=1117s) | What autonomous execution changes and which earlier experiences participants miss. |

## Supplementary primary sources

These sources support related practices. They are not transcripts of the video, and individual experiences do not establish a required process for every team.

| Source | Relevant observation | Team Agent design choice |
| --- | --- | --- |
| [How Anthropic employees use Claude Tag](https://claude.com/blog/how-anthropic-employees-use-claude-tag), August 28, 2026 | Work can be delegated within a shared thread whose context accompanies the request. | Preserve context, source tasks, and follow-up feedback with each goal. |
| [Using Claude Code: The unreasonable effectiveness of HTML](https://claude.com/blog/using-claude-code-the-unreasonable-effectiveness-of-html), Thariq Shihipar, May 20, 2026 | The author uses HTML for specifications, exploration, and interactive choices as a personal working preference. | Make criteria, evidence, and next actions readable in the workbench; do not add arbitrary HTML execution. |
| [A harness for every task: dynamic workflows in Claude Code](https://claude.com/blog/a-harness-for-every-task-dynamic-workflows-in-claude-code), Thariq Shihipar and Sid Bidasaria, June 2, 2026 | Independent contexts, adversarial checks, stopping conditions, and recovery can help complex work; parallelism adds cost. | Start with a bounded implementation/review loop rather than imposing many Agent stages on every request. |
| [Building verification loops in Claude Code with skills](https://claude.com/blog/building-verification-loops-in-claude-code-with-skills), Delba de Oliveira, July 22, 2026 | Repeated manual checks can become reusable run/observe/fix workflows. | Require actual project test evidence alongside model review. |
| [Automate work with routines](https://code.claude.com/docs/en/routines) and [Desktop scheduled tasks](https://code.claude.com/docs/en/desktop-scheduled-tasks) | Remote and local scheduled work have different execution environments; local tasks depend on the computer and app running. | Show Runner availability and document that local work stops depending on the host's availability; defer hosted routines. |
| [What is Claude Tag?](https://support.claude.com/en/articles/15594475-what-is-claude-tag) | Organization/channel identity and personal direct-message identity have distinct permissions. | Describe Team Agent's actual owner-local permissions instead of claiming Slack organization identity or channel authorization. |

## The implementation contract

### A goal is an agreement

A brief contains the requested outcome and context, stable acceptance criteria, the execution mode, and a round limit. Criteria are matched by their normalized text and must not disappear just because implementation failed a check. A verified goal supports one to three rounds; reconnecting must not create an unbounded revision budget.

Direct tasks retain the existing implementation, configured-test, and result workflow. Verified goals add per-criterion acceptance before commit/push. The UI explains both modes in English and keeps them identifiable when reading results.

### Evidence comes before publication

```text
Goal and context
  → Local Agent implementation
  → Actual project tests and saved output
  → Fresh read-only Codex review of each criterion
  → All requirements satisfied: commit and push the reviewed state
  → Fixable issues with rounds remaining: revise, retest, rereview
  → Limit reached or cannot verify: needs attention, evidence preserved
```

The reviewer receives the agreement, current changes, and actual test record in a fresh Codex context. It does not inherit the implementation thread's reasoning history, modify files, commit, or push. Fresh context supports an independent check but does not guarantee that the second opinion is correct.

Each criterion receives `pass`, `fail`, or `unknown`, with concrete evidence. Unknown is not success. Failed tests, missing evidence, malformed JSON, missing/duplicate criteria, or unresolved review issues cannot cross the publication gate. The presence of a test log and a natural-language completion claim are insufficient.

Publication means the existing Git commit/push workflow to the configured shared branch. It does not mean deployment, protected-branch merge, or external approval. The tested and reviewed Git tree must remain the tree being published.

### Run identity and recovery are durable

The current phase, round, limit, checks, and run identity are persisted facts. The real UI follows Runner/Coordinator records rather than estimating execution with browser timers. Late messages from an older `runId` cannot overwrite newer progress or release the current execution lock.

Reconnection restores the existing assignment and checkpoints. Retry preserves the agreed goal and limit while starting a new run and archiving earlier evidence. New feedback creates a new editable agreement, without rewriting the original outcome or inheriting its passing verdict.

The project-wide lock still serializes code writes. Adding a read-only review session does not implement parallel writable worktrees.

### The interface should answer acceptance questions

Task details should make it easy to understand the goal, satisfied criteria, supporting evidence, and the next person/action needed. Detailed logs remain available for diagnosis. Waiting for owner approval, an offline Agent, failed tests, missing evidence, and a round limit are distinct situations with different recovery actions.

Saving a comment is not permission to start another task. The follow-up action prepares a draft that the user reviews and explicitly submits. Simulated examples remain marked as simulated, including exports.

## Deliberately outside this implementation

- Slack integration, shared-channel memory, organization Agent identities, and channel permissions.
- Hosted Runners, execution while the owner's machine is asleep, remote routines, and scheduled triggers.
- Multi-project routing, concurrent writable worktrees, or large-scale dynamic Agent orchestration.
- A trusted environment for arbitrary HTML artifacts or a substitute for every human decision.
- Automatic deployment, protected-branch merges, or treating model review as a correctness guarantee.

## Verification requirements

These are design acceptance requirements, not assertions that every external integration passed:

1. Validate and persist the goal, criteria, mode, and round limit; preserve older direct tasks.
2. Start a genuinely fresh read-only review context and require valid per-criterion results.
3. Block publication on failed tests, failed/unknown criteria, or invalid review data.
4. Run tests and fresh review again after revisions; stop at the agreed limit.
5. Reject stale run messages and preserve correct locking through reconnects, duplicates, and restarts.
6. Present criteria, phases, rounds, evidence, and follow-up context without rewriting history.
7. Distinguish mock, real local Git, and real Codex checks in both the UI and validation record.

Read the [observed results](delivery.md) for successful checks, failures, and environment limits. A design contract cannot replace execution evidence.
