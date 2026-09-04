# Tactical collaboration lobby

Team Agent presents collaborative development as a shared operations lobby. The
layout borrows the clarity of a squad game lobby—project mode, selected Agent,
squad status, action brief, and one dominant start button—while every displayed
state remains tied to the real Coordinator, Runner, Git, and test records.

## Lobby mapping

| Lobby element | Team Agent fact |
| --- | --- |
| Featured operator | Explicitly selected Codex Agent |
| Four squad slots | Team members' shared Agents |
| Operation mode | Project, repository, shared branch, test command |
| Action brief | Real task prompt |
| Start task | `POST /api/tasks` with an explicit Agent |
| Live operation | The single project-wide running task |
| After-action report | Messages, result, diff, tests, and commit |

The visual layer never implies extra concurrency, combat power, currency, or
random rewards. The lobby says exactly who owns the Agent, whether it is online,
busy, offline, or paused, and what happens when the task is submitted.

## Primary interaction

1. Read the current project and shared branch in the mode card.
2. Choose an Agent from the squad panel or with `Alt+1` through `Alt+4`.
3. Enter a development goal in the action brief.
4. Use the state-aware primary action:
   - **Start task** for an online Agent.
   - **Join task queue** for a busy Agent.
   - **Wait for Agent** for an offline Agent.
5. Follow the real running-task strip.
6. Inspect the after-action report, including diff, tests, and commit.

The button remains disabled until a task and valid Agent are selected. A paused
Agent stays visible but is not assignable.

## Navigation and accessibility

- `Alt+Q` focuses the action brief.
- `Alt+C` opens Agent pairing.
- `Alt+J` opens the mission log.
- `Alt+P` opens the squad list.
- Shortcuts stop while a dialog is open and while the user edits a field.
- Dialogs keep focus inside and mark the lobby background inert.
- Agent state is always represented by text in addition to color.
- Motion follows the operating system's reduced-motion preference.
- Mobile layouts turn the overlay into a readable vertical flow.

## Repeat-use loop

The product's durable loop remains grounded in project progress:

> Start a task → watch execution → inspect evidence → continue the project.

A later increment can add a single **Your next action** card and explicit result
review. That card should surface one factual action: handle an owner approval,
review a completed result, resolve a blocked task, reassign an offline Agent,
watch the active task, or start a new task.

## Validation

For 3–5 participants, including at least two browser-only members:

- Everyone can identify the selected Agent and primary task action in three
  seconds.
- Busy and offline Agents produce the correct queue explanation.
- At least 10 real tasks reach an after-action report.
- At least 70% of completed tasks have diff, test, or commit evidence inspected.
- Two browser-only members return and take a meaningful action on another day.
- The project-wide execution lock is never bypassed.
