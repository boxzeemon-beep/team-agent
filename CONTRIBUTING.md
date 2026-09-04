# Contributing to Team Agent

Thanks for helping teams share coding agents while keeping credentials with
their owners.

**New to the project?** Start with the scoped
[`good first issue`](https://github.com/boxzeemon-beep/team-agent/issues?q=is%3Aissue%20is%3Aopen%20label%3A%22good%20first%20issue%22)
list. Each task includes acceptance criteria and likely files; leave a comment
before starting so contributors do not duplicate work.

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

The default `compose.yaml` is the user installation path and pulls the pinned
GHCR release. To build and run the Coordinator container from your current
checkout, use the development override:

```bash
docker compose -f compose.yaml -f compose.dev.yaml up -d --build
```

Override `TEAM_AGENT_IMAGE` when testing a specific published image. Keep its
value in `.env.example` and the default in `compose.yaml` aligned; the release
image supports both `linux/amd64` and `linux/arm64`.

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

中文说明：默认 `compose.yaml` 会拉取固定版本的 GHCR 镜像；从当前源码构建容器时，请叠加 `compose.dev.yaml`。功能变更请同时补充测试与中英文文档；开放式产品讨论请使用
[GitHub Discussions](https://github.com/boxzeemon-beep/team-agent/discussions)，可复现的问题请提交 Issue；首次贡献可从
[`good first issue`](https://github.com/boxzeemon-beep/team-agent/issues?q=is%3Aissue%20is%3Aopen%20label%3A%22good%20first%20issue%22)
列表开始。
