# Security Policy

## Supported versions

Team Agent is pre-1.0 software. Security fixes are applied to the latest release and the `main` branch. Upgrade to the newest release before reporting an issue that is already fixed there.

## Report a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/boxzeemon-beep/team-agent/security/advisories/new). Include:

- affected version or commit;
- Coordinator and Runner deployment details;
- reproduction steps or a minimal proof of concept;
- impact and any known mitigations.

Do not open a public issue for an undisclosed vulnerability. Do not include live session tokens, Runner tokens, pairing tokens, Git credentials, private repository contents, or personal data. Use synthetic values in reproduction material.

Maintainers will acknowledge the report, validate its impact, coordinate a fix and release, and credit reporters who request attribution. Disclosure timing is coordinated with the reporter after affected users have a practical upgrade path.

## Security boundaries

Team Agent executes coding tasks and project-configured commands on contributor machines. Operators should restrict Coordinator access, review membership and Agent sharing state, use least-privilege Git credentials, protect the Coordinator data directory, and review generated commits before merging them into protected branches.
