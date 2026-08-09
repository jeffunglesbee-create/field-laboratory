#!/bin/bash
# Install the .NET SDK, which Fable needs and which cloud sessions do not
# pre-install.
#
# WHY THIS EXISTS AS A REPO SCRIPT AT ALL
# The right home for a toolchain install is the environment's own setup script
# (it runs once, before Claude Code launches, and the environment cache keeps
# the result). That field is a claude.ai/code UI setting with no API — see
# docs/SETUP-SCRIPT.md for the text to paste there. This script is the same
# install, committed so it is real, testable, and callable from the
# SessionStart hook as a self-healing fallback when the field hasn't been
# pasted in yet.
#
# WHY apt AND NOT dotnet-install.sh
# The official installer does not work in this environment. `dot.net` redirects
# to builds.dotnet.microsoft.com, which the gateway denies with HTTP 403 — a
# different host from the allowlisted bare `dotnet.microsoft.com` entry.
# Measured, not assumed. Ubuntu's own archive carries the SDK and is reachable.
#
# WHY SDK 10 AND NOT 8
# Fable 5.x ships `tools/net10.0/` only — confirmed by unpacking the real
# .nupkg for both 5.5.0 and 5.13.0. Under SDK 8 the tool install fails with
# "Settings file 'DotnetToolSettings.xml' was not found in the package".
# dotnet-sdk-9.0 does not exist in Ubuntu noble.
#
# Always exits 0. This runs on a session-start path and must never hard-fail a
# session the way the original environment setup script did.

set -uo pipefail

REQUIRED_MAJOR=10

# Fast path. The hook calls this on every session start, so the already-present
# case has to be effectively free — no apt, no network.
if command -v dotnet >/dev/null 2>&1; then
  if dotnet --list-sdks 2>/dev/null | grep -q "^${REQUIRED_MAJOR}\."; then
    exit 0
  fi
  echo "install_dotnet.sh: dotnet present but no ${REQUIRED_MAJOR}.x SDK; installing." >&2
fi

# Slow path: ~40 seconds. Say so, so a slow session start is explained rather
# than mysterious.
echo "install_dotnet.sh: installing .NET SDK ${REQUIRED_MAJOR} from the Ubuntu archive (~40s)..." >&2

# `apt-get update` is NOT optional. Without it the install fails on a stale
# index with 404s on the .deb files — the real first failure when this was
# worked out.
if ! apt-get update >/dev/null 2>&1; then
  echo "install_dotnet.sh: apt-get update failed; continuing anyway." >&2
fi

if apt-get install -y --no-install-recommends "dotnet-sdk-${REQUIRED_MAJOR}.0" >/dev/null 2>&1; then
  echo "install_dotnet.sh: installed $(dotnet --version 2>/dev/null || echo 'unknown')." >&2
else
  echo "install_dotnet.sh: .NET SDK install FAILED. Fable builds will not work" >&2
  echo "  in this session. See docs/SETUP-SCRIPT.md — the durable fix is the" >&2
  echo "  environment setup-script field, not this fallback." >&2
fi

exit 0
