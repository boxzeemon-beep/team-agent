# Smoke demo

Run the complete local coordination smoke test from the repository root.

macOS or Linux:

```bash
./examples/smoke-demo/run.sh
```

Windows PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\examples\smoke-demo\run.ps1
```

After workspace dependencies are installed, this platform-neutral package
script runs the same demo:

```bash
pnpm demo:smoke
```

It uses an isolated repository and a deterministic protocol Runner, so the first
proof needs no Docker, public URL, remote Git host, or Codex login.

See [the five-minute demo guide](../../docs/quickstart-demo.md) for the verified
flow, expected output, retained-workspace option, and scope.
