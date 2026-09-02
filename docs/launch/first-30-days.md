# First 30 days: public adoption runbook

The long-term star goal is a distribution outcome, not the first operating metric. The first month should prove that teams understand the shared-Agent handoff, finish a real task, return for a second use, and can describe the result publicly.

## Launch sequence

### Day 0 — make first use reproducible

- [ ] Run `pnpm demo:smoke`, `pnpm test`, `pnpm typecheck`, and `pnpm build` from the launch commit, and record its immutable SHA in the private launch log.
- [ ] Confirm the Runner artifact, GHCR image, README recording, Discussions, and private vulnerability reporting.
- [ ] Publish the v0.1.0 GitHub Discussion announcement and remain available for responses.

### Day 1 — start with five warm teams

- [ ] Select one candidate from each design-partner cohort plus one backup.
- [ ] Personalize the reason for contacting each team; send no bulk message.
- [ ] Offer one 30-minute setup session around a bounded, reviewable repository task.
- [ ] Record replies and mismatch reasons in the private tracker.

### Day 2 — developer launch

- [ ] Submit the repository as a Show HN with the prepared first comment.
- [ ] Answer questions with source, architecture, security, or support-matrix links.
- [ ] Turn repeated setup questions into documentation or focused issues within one working day.

### Day 3 — self-hosting audience

- [ ] Re-check the current community rules, then adapt the self-hosted post rather than duplicating the HN text.
- [ ] Lead with outbound Runner connections, SQLite recovery, private networking, and credential boundaries.
- [ ] Record deployment objections separately from product-workflow objections.

### Day 4 — founder network

- [ ] Publish the short demo on X and LinkedIn with the channel-specific copy.
- [ ] Ask for one concrete workflow response, not a generic repost.
- [ ] Reply to interested teams with the screening questions before scheduling setup.

### Days 5–7 — support and conversion

- [ ] Follow up with the first warm cohort once.
- [ ] Schedule qualified setup sessions.
- [ ] Label recurring friction as install, pairing, trust, context, approval, Git, or review.
- [ ] Ship the smallest documented fix that removes the most common first-use blocker.
- [ ] Publish a weekly summary containing shipped fixes, current limits, and the next test cohort.

## Weeks 2–4

1. Contact candidates in four balanced cohorts until 20 qualified teams enter the program.
2. Run setup sessions in small batches so each repeated failure can be fixed before the next batch.
3. Check voluntary second use seven days after every first completed task.
4. Convert observed workflows into reviewed case studies using `case-study-template.md`.
5. Release fixes at a predictable cadence and update every active design partner directly.
6. Expand to another public channel only when support response time remains sustainable.

## Private funnel ledger

Keep names and contact details outside the public repository. Track only the aggregate definitions here:

| Stage | Definition | First-month operating threshold |
| --- | --- | ---: |
| Targeted | A specific team matches the ideal profile and has a personalized reason for contact | 60 |
| Replied | A human answers positively or negatively | 30 |
| Qualified | Recent shared-Agent handoff, named owner/requester, bounded task, clear reviewer | 20 |
| Setup completed | Coordinator and at least one real Runner are paired | 12 |
| First task completed | The team reviews a stored response, diff, tests, and commit | 8 |
| Second use | The team initiates another task within seven days without a maintainer prompting the task | 4 |
| Publishable study | The team approves a factual, reviewed case study | 3 |

These are decision thresholds rather than public performance claims. Report the numerator, denominator, and measurement window whenever quoting a rate.

## Weekly scorecard

Record every Monday for the previous seven days:

| Metric | Source | Week value | Cumulative | Decision |
| --- | --- | ---: | ---: | --- |
| Repository unique visitors | GitHub Traffic |  |  | Which referrer produced qualified interest? |
| Clones | GitHub Traffic |  |  | Did quickstart changes improve clone-to-reply signals? |
| Release asset downloads | GitHub Releases API |  |  | Are users reaching the Runner install step? |
| Design-partner applications | GitHub Issues |  |  | Which cohort and workflow are represented? |
| Setup sessions completed | Private partner tracker |  |  | Which step consumed the most assistance? |
| First tasks completed | Sanitized Coordinator observation |  |  | Why did incomplete tasks stop? |
| Seven-day second uses | Private partner tracker |  |  | Which workflow was worth repeating? |
| New workflow stories | GitHub Issues / approved interviews |  |  | Which evidence can become documentation? |
| Stars, forks, and watchers | GitHub repository |  |  | Treat as distribution signals, not product success by themselves. |

## Operating rules

- Personalize outreach and stop after two unanswered follow-ups.
- Follow each community's current self-promotion rules.
- Never trade incentives for stars or ask a partner to star before using the product.
- Publish measured failures and limitations alongside successes.
- Keep credentials, private code, repository URLs, tokens, personal contact details, and unapproved quotes out of public artifacts.
- Prioritize repeat usage and case-study evidence; star growth should follow demonstrated usefulness.
