# RPG experience

Team Agent presents real collaborative development as a shared project world. The
game layer helps people understand and enjoy the workflow; Git, tests, approvals,
and task ownership remain the source of truth.

## Product promise

> Choose a teammate's Agent, send it on a real project quest, follow the journey,
> and inspect the code evidence together.

The interface maps existing product concepts to an RPG language:

| Engineering concept | World concept |
| --- | --- |
| Shared Codex Agent | Party member |
| Task | Quest |
| Queue | Quest board |
| Running task | Expedition |
| Project conversation | Adventure log |
| Diff, tests, commit | Quest evidence |
| Shared branch | Current route |
| Owner approval | Owner decision |

The engineering term stays visible wherever it affects a decision. A commit is
still called a commit, tests still show their real output, and the user always
sees the requester, actual Agent, and Agent owner.

## Playable interface

The first vertical slice is deliberately small:

- A full-screen project world shows the active objective and real task state.
- The top-left HUD shows team connectivity, selected Agent status, and completed
  project quests.
- The project map jumps to the real Agent party or quest log.
- Party slots select a specific Agent with `Alt+1` through `Alt+4`.
- The command wheel opens quests, Agent pairing, the log, and the party with
  `Alt+Q`, `Alt+C`, `Alt+J`, and `Alt+P`.
- The lower guild interface preserves the complete task form, queue, progress,
  conversation, diff, tests, and commit.

Shortcuts use a modifier, stop while a dialog is open, and never fire while the
user is editing a field. Motion follows the operating system's reduced-motion
preference.

## The repeatable game loop

The next gameplay increment should add one loop rather than a collection of
unrelated rewards:

> Accept a quest → watch real progress → review evidence → continue the quest.

1. **Your next move** shows one highest-priority real action: handle a local
   approval, inspect a completed result, resolve a blocked task, reassign an
   offline Agent, watch the active expedition, or publish a new quest.
2. **Quest evidence** asks the requester to inspect the diff, tests, and commit,
   then choose either **Accept result** or **Continue this quest**.
3. **Quest chain** carries the previous task, discussion, result, and commit into
   a follow-up task. The requester may switch to another Agent while keeping the
   project context.

Suggested durable fields:

```ts
Task {
  chainId: string;
  parentTaskId: string | null;
  reviewStatus: "pending" | "accepted" | "followup" | null;
  reviewedByMemberId: string | null;
  reviewedAt: string | null;
}

QuestEvent {
  id: string;
  taskId: string;
  chainId: string;
  kind:
    | "task_started"
    | "owner_action_required"
    | "test_passed"
    | "test_failed"
    | "commit_pushed"
    | "task_ready_for_review"
    | "task_accepted"
    | "followup_created";
  summary: string;
  commitSha: string | null;
  createdAt: string;
}
```

Events must be created from Coordinator or Runner facts and use an idempotency
key. Heartbeats do not create events.

## Reward rules

The product rewards useful collaboration rather than screen time:

- A completion moment is triggered only by a persisted Runner result.
- Test and commit feedback always comes from the real execution record.
- Shared progress advances through reviewed project outcomes, not button presses.
- Agent choice remains explicit; the game layer never hides who owns or runs it.
- There are no individual rankings, random loot, streak penalties, Agent rarity,
  or purchasable power.

## One-week validation

For 3–5 participants, including at least two browser-only members:

- At least 60% return and perform a meaningful action on a second day.
- At least 10 real tasks reach evidence review.
- At least 70% of finished tasks are accepted or continued within one workday.
- At least three quest chains receive a real follow-up task.
- At least one chain switches to an Agent owned by another teammate.
- At least half of returning sessions begin from **Your next move**.
- Every test, commit, and completion event matches stored Runner output.
- The project-wide execution lock is never bypassed.

This validates the desired behavior: people return because the shared project has
made real progress and needs their next decision.
