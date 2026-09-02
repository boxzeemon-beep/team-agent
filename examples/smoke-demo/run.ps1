$ErrorActionPreference = "Stop"

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
Push-Location $repositoryRoot

try {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js >=22.5.0 is required."
  }

  & node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 22 || (major === 22 && minor >= 5) ? 0 : 1)'
  if ($LASTEXITCODE -ne 0) {
    throw "Node.js >=22.5.0 is required (found $(& node --version))."
  }

  if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw "Git is required."
  }

  $tsx = Join-Path $repositoryRoot "node_modules/tsx/dist/cli.mjs"
  if (-not (Test-Path $tsx)) {
    Write-Host "Installing workspace dependencies..."
    if (Get-Command pnpm -ErrorAction SilentlyContinue) {
      & pnpm install --frozen-lockfile
    } elseif (Get-Command corepack -ErrorAction SilentlyContinue) {
      & corepack pnpm install --frozen-lockfile
    } else {
      throw "pnpm 11 or Corepack is required to install workspace dependencies."
    }
    if ($LASTEXITCODE -ne 0) {
      throw "Workspace dependency installation failed with exit code $LASTEXITCODE."
    }
  }

  & node $tsx "examples/smoke-demo/run.ts"
  if ($LASTEXITCODE -ne 0) {
    throw "Smoke demo failed with exit code $LASTEXITCODE."
  }
} finally {
  Pop-Location
}
