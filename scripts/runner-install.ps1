$ErrorActionPreference = "Stop"

$repository = if ($env:TEAM_AGENT_REPOSITORY) { $env:TEAM_AGENT_REPOSITORY } else { "boxzeemon-beep/team-agent" }
$version = if ($env:TEAM_AGENT_VERSION) { $env:TEAM_AGENT_VERSION } else { "latest" }
$packageName = "@team-agent/runner"

if (-not (Get-Command node -ErrorAction SilentlyContinue) -or -not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw "Node.js >=22.5.0 and npm are required."
}

& node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 22 || (major === 22 && minor >= 5) ? 0 : 1)'
if ($LASTEXITCODE -ne 0) {
  throw "Node.js >=22.5.0 is required (found $(& node --version))."
}

$temporaryDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ("team-agent-" + [guid]::NewGuid())
$archive = Join-Path $temporaryDirectory "team-agent-runner.tgz"
New-Item -ItemType Directory -Path $temporaryDirectory | Out-Null

try {
  if ($version -eq "latest") {
    $releaseUrl = "https://github.com/$repository/releases/latest/download/team-agent-runner.tgz"
    $npmSpec = "$packageName@latest"
  } else {
    $releaseUrl = "https://github.com/$repository/releases/download/v$version/team-agent-runner.tgz"
    $npmSpec = "$packageName@$version"
  }

  $downloaded = $false
  try {
    Invoke-WebRequest -Uri $releaseUrl -OutFile $archive -UseBasicParsing
    $downloaded = $true
  } catch {
    Write-Host "Release archive was not found; using npm."
  }

  if ($downloaded) {
    Write-Host "Installing Team Agent Runner from GitHub Release..."
    & npm install --global $archive
  } else {
    Write-Host "Installing $npmSpec from npm..."
    & npm install --global $npmSpec
  }
  if ($LASTEXITCODE -ne 0) { throw "npm installation failed with exit code $LASTEXITCODE." }
} finally {
  Remove-Item -Path $temporaryDirectory -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "Team Agent Runner installed."
Write-Host "Run: team-agent doctor"
