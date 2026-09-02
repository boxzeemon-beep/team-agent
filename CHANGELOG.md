# Changelog

Notable changes to Team Agent are recorded here. This project follows [Semantic Versioning](https://semver.org/) and keeps upcoming changes under `Unreleased`.

## [Unreleased]

No changes yet.

## [0.1.0] - 2026-09-01

### Added

- Coordinator with invitation-based membership, shared project context, SQLite persistence, SSE updates, and a serial task queue.
- Local Runner integration for Codex app-server, managed Git workspaces, owner approvals, tests, commits, and pushes.
- Explicit Agent selection, offline task waiting and reassignment, task recovery, progress, diff, test, and commit records.
- Docker Compose Coordinator deployment and an unauthenticated health endpoint.
- Installable Runner CLI with `runner` and `doctor` commands for Node.js, Coordinator, Git, Codex, and data-directory checks.
- English and Chinese product documentation with a reproducible demo, architecture, security model, support policy, and public roadmap.
- Node.js 22 and 24 CI, CodeQL, workflow linting, issue forms, pull request templates, and tag-based release artifacts.
- Versioned Coordinator and Runner archives, checksums, and a GHCR Coordinator image.

[Unreleased]: https://github.com/boxzeemon-beep/team-agent/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/boxzeemon-beep/team-agent/releases/tag/v0.1.0
