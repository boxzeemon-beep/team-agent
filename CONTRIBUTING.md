# Contributing to Team Agent

Thanks for helping teams share coding agents while keeping credentials with
their owners.

## Before you start

- Use [GitHub Discussions](https://github.com/boxzeemon-beep/team-agent/discussions)
  for open-ended product ideas and workflow questions.
- Open an issue for a reproducible bug or a focused implementation proposal.
- Keep the core workflow small: contribute an Agent, choose it explicitly,
  submit a task, and inspect the result.

Team Agent is a pnpm workspace. Use Node.js 22.5+ and pnpm 11, then run from
the repository root:

```bash
pnpm install --frozen-lockfile
pnpm exec biome check .
pnpm typecheck
pnpm test
pnpm build
```

## Pull requests

- Add or update tests for behavior changes.
- Update the relevant English and Chinese documentation when user-facing
  behavior changes.
- Keep Coordinator and Runner protocol types in `packages/shared`.
- Explain the user problem, the smallest useful outcome, and how you verified
  the change.
- Avoid unrelated formatting or refactoring in a focused pull request.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

---

中文说明：功能变更请同时补充测试与中英文文档；开放式产品讨论请使用
[GitHub Discussions](https://github.com/boxzeemon-beep/team-agent/discussions)，可复现的问题请提交 Issue。
