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

Team Agent is a pnpm workspace. Use Node.js 22.13+ and pnpm 11, then run from
the repository root:

```bash
pnpm install --frozen-lockfile
pnpm exec biome check .
pnpm typecheck
pnpm test
pnpm build
```

The default `compose.yaml` pulls the older pinned v0.2.0 GHCR release. The current
workbench requires source installation or a source-built container. To build and
run the Coordinator container from your current checkout, use the override:

```bash
docker compose -f compose.yaml -f compose.dev.yaml up -d --build
```

Override `TEAM_AGENT_IMAGE` when testing a specific published image. Keep its
value in `.env.example` and the default in `compose.yaml` aligned; the release
image supports both `linux/amd64` and `linux/arm64`.

## Pull requests

- Add or update tests for behavior changes.
- Update the relevant English documentation when user-facing behavior changes.
  English is the primary language for the interface, examples, and setup guide.
- Keep Coordinator and Runner protocol types in `packages/shared`.
- Explain the user problem, the smallest useful outcome, and how you verified
  the change.
- Avoid unrelated formatting or refactoring in a focused pull request.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

See [Getting started](docs/getting-started.md) for real execution setup and
[the workbench guide](docs/workbench.md) for the English browser simulation.
