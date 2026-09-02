# Team Agent case study template

Use this structure after a team has completed a real workflow. The public case study should describe an observed handoff, not a testimonial assembled from expectations. Every quote, logo, screenshot, metric, and identifying detail needs explicit publication approval.

## Consent and evidence record — private working section

- Team: `[TEAM]`
- Primary contact: `[NAME / ROLE]`
- Interview date: `[DATE]`
- Team Agent commit or release: `[VERSION]`
- Coordinator deployment: `[ENVIRONMENT]`
- Repository classification: `[PUBLIC / PRIVATE / SYNTHETIC]`
- Approved attribution: `[NAMED / ANONYMOUS / INTERNAL ONLY]`
- Approved assets: `[LOGO / SCREENSHOTS / QUOTES / METRICS]`
- Final approval owner and date: `[NAME / DATE]`
- Evidence links: `[RECORDING / TASK RECORD / COMMIT / NOTES]`
- Redactions required: `[LIST]`

Remove this section and all unapproved evidence links from the public draft.

## Public title

> How [TEAM OR “a X-person team”] used Team Agent to [SPECIFIC, OBSERVED OUTCOME]

Avoid sweeping transformation or speed claims unless a defined baseline and repeatable measurement support them.

## Summary card

| Field | Value |
| --- | --- |
| Team | `[APPROVED NAME OR ANONYMOUS DESCRIPTION]` |
| Team size | `[NUMBER OR RANGE]` |
| Workflow | `[ONE-SENTENCE HANDOFF]` |
| Agent owner | `[ROLE]` |
| Requester | `[ROLE]` |
| Task | `[BOUNDED TASK DESCRIPTION]` |
| Product scope used | One project, Codex Runner, shared working branch, serial task |
| Result | `[RESPONSE / DIFF / TEST / COMMIT OUTCOME]` |
| Version | `[TEAM AGENT RELEASE]` |

## 1. The situation

Describe only the context needed to understand the handoff:

- What does the team build?
- Who already used Codex locally?
- Who needed to request code work?
- How was this handled before Team Agent?
- What made this specific task appropriate for a shared working branch?

### Draft prompt

> [TEAM] is a [SIZE]-person [TYPE] team working on [PUBLIC CONTEXT]. [AGENT OWNER ROLE] already used Codex with the repository, while [REQUESTER ROLE] needed to [TASK GOAL]. Before Team Agent, the handoff required [OBSERVED PRIOR PROCESS].

## 2. Why the team tried it

State the decision criteria before describing results:

- credentials remain on the Runner owner's computer;
- requester explicitly chooses the Agent;
- project context and result are visible to the team;
- code changes remain reviewable through Git;
- current single-project and serial-execution limits fit the trial.

Include limits the team accepted and any concern they had before setup.

## 3. Setup

Record the reproducible environment:

- Coordinator host and Docker version;
- private HTTPS route or reverse proxy;
- Runner operating system, Node.js, Codex CLI, and Git setup;
- repository host, base branch, shared branch, and test command;
- number of members and paired Runners;
- time measurement start and end definitions.

Never publish tokens, repository secrets, private URLs, local usernames, private source, or unredacted logs.

## 4. The task, step by step

Use one screenshot or short clip per meaningful transition:

1. Requester writes the bounded task.
2. Requester explicitly selects the owner's Agent.
3. Coordinator queues and assigns the task.
4. Runner updates the managed clone and invokes local Codex.
5. Owner handles any native Codex approval locally.
6. Runner runs tests, commits, and pushes to the shared branch.
7. Requester and reviewer inspect the response, diff, test output, and commit.
8. Reviewer decides whether to merge, revise, or discard the change.

For each step, note what happened, how long it took if measured, and where a maintainer assisted.

## 5. Result

Report concrete artifacts before interpretation:

- Task status: `[COMPLETED / NEEDS_ATTENTION / CANCELED]`
- Files changed: `[COUNT, IF APPROVED]`
- Test command and result: `[APPROVED SUMMARY]`
- Commit: `[PUBLIC LINK OR REDACTED SHA]`
- Review decision: `[MERGED / REVISED / NOT MERGED]`
- Setup duration: `[VALUE + START/END DEFINITION]`
- Task duration: `[VALUE + START/END DEFINITION]`
- Maintainer interventions: `[COUNT + DESCRIPTION]`
- Second voluntary use within seven days: `[YES / NO / NOT YET OBSERVED]`

Do not convert one team's timing into a general product-speed claim. If there was a failure, preserve it and explain what changed afterward.

## 6. What worked and what did not

Use paired evidence:

| Observation | Evidence | Product implication |
| --- | --- | --- |
| `[WHAT HAPPENED]` | `[QUOTE, EVENT, OR ARTIFACT]` | `[KEEP / FIX / INVESTIGATE]` |
| `[WHAT HAPPENED]` | `[QUOTE, EVENT, OR ARTIFACT]` | `[KEEP / FIX / INVESTIGATE]` |
| `[WHAT HAPPENED]` | `[QUOTE, EVENT, OR ARTIFACT]` | `[KEEP / FIX / INVESTIGATE]` |

Cover setup, requester clarity, owner control, context quality, approval, Git state, and result review. Include at least one limitation or unresolved point.

## 7. Approved quotes

> “[EXACT APPROVED QUOTE, LIGHTLY EDITED ONLY WITH SPEAKER APPROVAL.]”
>
> — `[NAME, ROLE, TEAM]` or `[ANONYMOUS ROLE]`

Store the source recording or written approval privately. If grammar is edited, have the speaker approve the final wording.

## 8. Changes made after the study

Link observed feedback to shipped work:

| Feedback | Decision | Issue or release |
| --- | --- | --- |
| `[OBSERVATION]` | `[CHANGE / DOCUMENT / DEFER]` | `[PUBLIC LINK]` |

This section distinguishes a design partnership from a promotional quote: the reader should see how the product learned.

## 9. Current boundaries

End every early case study with the product scope used:

> Team Agent currently supports one project per Coordinator, Codex first, one configurable shared working branch, and one active code task at a time. Agent selection is explicit, and native Codex approvals remain on the Runner owner's computer. See the [README](https://github.com/boxzeemon-beep/team-agent#current-scope) for the current support matrix.

## 10. Call to action

> Does your team have an informal “can you run your coding agent on this?” handoff? Read the [quickstart](https://github.com/boxzeemon-beep/team-agent#quickstart), review the [security model](https://github.com/boxzeemon-beep/team-agent/blob/main/docs/security.md), or open a Discussion describing your workflow.

## 中文访谈提纲

用于采集信息，公开文章仍以团队最终确认的语言版本为准：

1. 在使用 Team Agent 前，这次任务通常怎样交接？
2. 谁拥有本地 Codex 与 Git 权限，谁提出任务？
3. 从开始部署到 Runner 配对成功用了多久？计时起止点是什么？
4. 发起人是否始终理解正在使用谁的 Agent，以及任务为什么等待？
5. Agent 所有者在哪些时刻需要介入？
6. 共享上下文是否足以让 Codex 理解前序讨论和代码状态？
7. diff、测试输出和 commit 是否足以完成审查？
8. 哪一步最顺畅，哪一步最令人犹豫？
9. 团队是否在七天内主动发起第二个任务？
10. 哪些内容允许公开：团队名称、Logo、截图、数据、原话？

## Editorial verification

Before publication:

- [ ] Product behavior matches the cited Team Agent release.
- [ ] Every number includes a source, unit, denominator, and measurement window.
- [ ] Every quote matches the approved wording.
- [ ] Names, logos, screenshots, and repository details have written permission.
- [ ] Tokens, credentials, private URLs, local paths, personal data, and private source are redacted.
- [ ] Assistance from Team Agent maintainers is disclosed.
- [ ] Failures and current product limits are visible.
- [ ] The partner has approved the final rendered draft.
