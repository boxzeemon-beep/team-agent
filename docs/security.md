# Security model

Team Agent coordinates local coding agents. Its security model keeps high-value credentials at the edge and makes the repository boundary explicit.

## Trust boundaries

### Coordinator

The Coordinator stores members, project conversation, task prompts and results, diffs, test output, commit SHAs, project settings, and hashed application credentials. Anyone with administrative access to the Coordinator host or its data directory can read that project data.

The Coordinator does not receive a Runner owner's Codex login or Git credential.

### Runner owner

A Runner executes Codex and Git commands with the permissions already available on its owner's computer. A task assigned to that Agent may therefore read the managed clone, change files, run the configured test command, and push to the configured shared branch.

Pair only devices whose owners you trust for the project. Apply branch protection and least-privilege repository access independently of Team Agent.

### Project member

An invited member can view project conversations and results, submit tasks, and select from shared Agents. Treat membership as access to the project's development context.

### Network

The source Coordinator binds to loopback by default. Docker Compose publishes its configured host port. Tailscale Serve is the documented team-access path: Tailscale ACLs control network reachability, while Team Agent invitations and sessions control application access. If another reverse proxy is used, it should terminate HTTPS and restrict the origin from direct public access.

## Credential handling

- Invite tokens, browser sessions, and Runner pairing/device credentials are stored server-side as SHA-256 digests.
- Browser cookies use `HttpOnly` and `SameSite=Strict`; HTTPS deployments also receive the `Secure` attribute.
- Pairing tokens expire after 15 minutes and are single-use.
- Member invitations expire after seven days.
- A Runner keeps its device credential in its local data directory. Protect that directory with normal operating-system account controls.
- Codex and Git credentials remain in the tools and credential stores already configured on the Runner host.

Token hashing protects database-only disclosure from directly revealing bearer tokens. It does not replace host security or TLS.

## Deployment checklist

- [ ] Expose the Coordinator through HTTPS only.
- [ ] Restrict network access with Tailscale ACLs or equivalent controls.
- [ ] Use a persistent absolute `TEAM_AGENT_DATA_DIR` with owner-only filesystem permissions.
- [ ] Invite one named person per link; rotate access by removing application and network access together.
- [ ] Grant Runner owners only the Git permissions required for the configured shared branch.
- [ ] Protect the base branch and require review before merge.
- [ ] Configure a bounded, reviewed test command; it executes on every assigned Runner host.
- [ ] Back up the entire Coordinator data directory while the process is stopped.
- [ ] Keep Node.js, Codex CLI, Git, and Team Agent dependencies current.
- [ ] Review task prompts, diffs, tests, and commits before merging.

## Operational incidents

If a Runner device token or member session may be exposed, stop the affected Runner or session, restrict Coordinator reachability, and rotate application access before reconnecting the device. Inspect the shared branch and Coordinator task history for unexpected work.

For a disconnected active task, retain the project lock until the owner confirms that the Runner process has stopped. The administrator emergency-release operation preserves the assignment and pauses the Agent for inspection.

## Vulnerability reporting

Use [GitHub's private vulnerability reporting](https://github.com/boxzeemon-beep/team-agent/security/advisories/new) for security-sensitive reports. Include the affected commit or version, reproduction steps, impact, and any suggested remediation. Use public issues for ordinary bugs that do not expose credentials or project data.
