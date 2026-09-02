# Design partner outreach

The goal is to recruit 20 external teams that have a real shared-Agent handoff, not to collect passive sign-ups. Each team should try one bounded repository task, report setup friction, and decide whether the workflow deserves a second use.

## Ideal partner profile

Prioritize teams with all of these characteristics:

- 2–15 people contributing to the same software project;
- at least one member already using Codex locally;
- at least one collaborator who does not have the same Agent setup;
- a repository and shared branch suitable for a low-risk trial;
- willingness to spend 30 minutes on setup and a 20-minute debrief;
- a clear owner for Runner approval and Git review.

Deprioritize teams seeking unattended production changes, many concurrent repositories, automatic Agent routing, or a hosted service. Those needs are outside the current one-project, serialized, Codex-first scope.

## 20-team portfolio

Recruit across four cohorts so feedback is not dominated by one workflow:

| Cohort | Teams | Useful signal |
| --- | ---: | --- |
| Small product startups | 5 | Product/engineering handoff and speed to first task |
| Open-source maintainer groups | 5 | Contributor access, audit trail, and Git review |
| Agencies or studios | 5 | Switching requesters while preserving project context |
| Internal tools / data teams | 5 | Browser-only stakeholders requesting bounded changes |

Track candidates privately with: contact, cohort, team size, current Agent, repository type, requester role, owner role, outreach date, response, setup date, first-task result, second-use date, friction, and publication permission. Do not put credentials, private code, or task content in the tracker.

## Initial email

**Subject:** Would your team test one shared Codex handoff?

> Hi [NAME],
>
> I am working on Team Agent, an open-source, self-hosted tool for sharing coding agents across a team without sharing credentials.
>
> The specific workflow is: one teammate contributes a Codex Runner from their own computer; another teammate uses a browser to choose that Agent and request a task. Codex and Git credentials stay on the owner's machine, while the team can follow the task and review the response, diff, tests, and commit.
>
> I thought of [TEAM] because [ONE SPECIFIC, OBSERVED REASON]. The current release is deliberately narrow—one project, Codex first, one shared working branch, and one active code task—so I am looking for teams willing to test one bounded task rather than evaluate a broad automation platform.
>
> I can join a 30-minute setup and a 20-minute debrief. The useful outcome for me is candid feedback on setup, trust, and whether anyone chooses to use it a second time. A public quote or case study is optional and requires separate approval.
>
> Would this match a real handoff in your team during the next two weeks?
>
> Repository: https://github.com/boxzeemon-beep/team-agent
>
> Thanks,
> [SENDER]

## Short direct message

> Hi [NAME] — I built an open-source tool for a narrow team workflow: a member with only a browser can request a task from a teammate's local Codex Runner, while Codex and Git credentials stay on the owner's computer. I thought it might fit [SPECIFIC WORKFLOW AT TEAM]. Would you be open to trying one bounded task with me observing the setup? Current scope is one project and serialized tasks. Repo: https://github.com/boxzeemon-beep/team-agent

## Warm introduction request

> Hi [INTRODUCER], I am looking for small software teams where one person uses Codex locally and another teammate occasionally needs to request coding work without setting up the same Agent. I built an open-source, self-hosted Coordinator + Runner for that handoff. Do you know one team that would try a single low-risk repository task and give direct feedback? I would handle onboarding, and any public use of their name or feedback would be a separate choice.

## 中文一对一邀请

**主题：想邀请你们测试一次团队共享 Codex 的真实交接**

> 你好，[姓名]：
>
> 我在做 Team Agent，一个开源、自托管的团队 Coding Agent 协作工具。它解决的场景很具体：一位成员在自己电脑贡献 Codex Runner，另一位成员只用网页就能选择这个 Agent 并提交任务；Codex 和 Git 凭据留在所有者电脑上，团队可以查看回复、diff、测试和 commit。
>
> 我想到你们，是因为[具体且真实的原因]。当前版本聚焦一个项目、Codex、一个共享工作分支和串行代码任务。我想邀请你们选择一个低风险的真实任务，花约 30 分钟完成部署和首次执行，再用 20 分钟直接反馈配对、信任边界与任务交接中最卡的环节。
>
> 我会协助整个过程。公开引用、团队名称和案例都需要另外征得你们同意。
>
> 你们未来两周是否刚好有一次类似的交接？
>
> 项目：https://github.com/boxzeemon-beep/team-agent

## Follow-up sequence

### Follow-up 1 — after 3–4 working days

> Hi [NAME], following up once in case the shared-Agent workflow is relevant. A suitable test is small: one Codex owner, one browser-only requester, and one reviewable task on a working branch. I can handle the Coordinator setup. If that pattern does not occur at [TEAM], a quick “not a fit” is useful signal too.

### Follow-up 2 — after 7–10 more days

> Hi [NAME], I will close the loop after this note. We are still looking for teams that already have an informal “can you run your coding agent on this?” handoff. If that becomes relevant later, the repository and setup are here: https://github.com/boxzeemon-beep/team-agent. Thanks for considering it.

Stop after the second follow-up unless the recipient responds.

## Screening questions

Ask these before scheduling setup:

1. Who uses a local coding Agent today, and which Agent do they use?
2. Who currently asks that person to make or run changes?
3. How often has this handoff occurred in the last month?
4. What is the smallest real task you would trust to a shared working branch?
5. Can every Runner owner pull and push that repository with their existing Git identity?
6. Is a one-project, one-active-task workflow acceptable for this test?
7. Who will review the resulting diff and commit before merge?
8. Does the team have a private HTTPS path such as Tailscale, or prefer help configuring one?
9. Which repository content, logs, screenshots, or metrics must stay private?
10. What would make someone voluntarily use Team Agent a second time?

A strong fit has a recent handoff, a named Agent owner and requester, a bounded task, and a clear reviewer. Record “not a fit” reasons; they are evidence for positioning and roadmap decisions.

## Setup session agenda — 30 minutes

1. **5 min — boundary review:** one project, Codex first, serial execution, local approvals.
2. **10 min — Coordinator:** start with Docker Compose, set the HTTPS URL, claim the administrator invite, configure the repository and branch.
3. **5 min — Runner:** verify the host with the released Runner's `doctor` command, generate pairing from the web app, and run its one-time command.
4. **5 min — first task:** requester chooses the Agent and submits one bounded request.
5. **5 min — record friction:** note each undocumented decision, failed step, and moment of uncertainty.

Never ask a partner to paste credentials, pairing tokens, private repository content, or unredacted logs into a shared research document.

## Debrief — 20 minutes

- What did you expect to happen before starting?
- Which step required explanation?
- When did the Agent owner feel in control or out of the loop?
- Did the requester understand which Agent was acting and why the task was waiting?
- Were the diff, tests, and commit enough to review the result?
- Would this team use it again without the maintainer present? For what task?
- Which current limitation blocks the next use?
- May we follow up after seven days to check for voluntary reuse?
- May we quote this feedback privately, anonymously, or with attribution?

## Success criteria for the 20-team program

Measure the workflow rather than attention:

- invited teams, replies, qualified teams, and completed setup sessions;
- time from clean start to paired Runner;
- time from task submission to inspectable result;
- first-task completion and reason for every incomplete task;
- number of teams that initiate a second task within seven days;
- recurring setup, trust, approval, context, and Git friction;
- number of teams willing to publish a reviewed case study.

Report denominators and definitions with every rate. Treat targets as internal decision thresholds, not public claims.
