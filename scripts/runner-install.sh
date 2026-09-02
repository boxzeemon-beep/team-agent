#!/bin/sh
set -eu

repository="${TEAM_AGENT_REPOSITORY:-boxzeemon-beep/team-agent}"
version="${TEAM_AGENT_VERSION:-latest}"
package="@team-agent/runner"
temporary_directory=""

cleanup() {
  if [ -n "$temporary_directory" ]; then
    rm -rf "$temporary_directory"
  fi
}
trap cleanup EXIT HUP INT TERM

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  printf '%s\n' "Node.js >=22.5.0 and npm are required." >&2
  exit 1
fi

node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 22 || (major === 22 && minor >= 5) ? 0 : 1)' || {
  printf '%s\n' "Node.js >=22.5.0 is required (found $(node --version))." >&2
  exit 1
}

temporary_directory="$(mktemp -d 2>/dev/null || mktemp -d -t team-agent)"
archive="$temporary_directory/team-agent-runner.tgz"
if [ "$version" = "latest" ]; then
  release_url="https://github.com/$repository/releases/latest/download/team-agent-runner.tgz"
  npm_spec="$package@latest"
else
  release_url="https://github.com/$repository/releases/download/v$version/team-agent-runner.tgz"
  npm_spec="$package@$version"
fi

downloaded=0
if command -v curl >/dev/null 2>&1; then
  if curl --fail --location --silent --show-error "$release_url" --output "$archive"; then
    downloaded=1
  fi
elif command -v wget >/dev/null 2>&1; then
  if wget --quiet "$release_url" --output-document "$archive"; then
    downloaded=1
  fi
fi

if [ "$downloaded" -eq 1 ]; then
  printf '%s\n' "Installing Team Agent Runner from GitHub Release..."
  npm install --global "$archive"
else
  printf '%s\n' "Release archive was not found; installing $npm_spec from npm..."
  npm install --global "$npm_spec"
fi

printf '%s\n' "Installed $(team-agent --help 2>/dev/null | sed -n '1p')."
printf '%s\n' "Run: team-agent doctor"
