#!/bin/bash
# Project setup for cloud sessions, run by the SessionStart hook in
# .claude/settings.json.
#
# Per Claude Code's cloud-environments documentation, this is the mechanism for
# project setup that should run everywhere (cloud and local) — as distinct from
# the environment's own setup script, which is for provisioning the VM with
# toolchains that aren't pre-installed. The CLAUDE_CODE_REMOTE check below is
# the documented way to scope this to cloud sessions only, so local machines
# are left untouched.
#
# Three steps, in dependency order: the .NET SDK, then the Fable tool pinned by
# the committed manifest, then npm packages.
#
# The SDK step is a FALLBACK, not the intended mechanism. Its proper home is the
# environment's own setup-script field, where the environment cache makes it
# free after the first run — see docs/SETUP-SCRIPT.md for the text to paste.
# It lives here too so a session on a cold VM can heal itself instead of failing
# every Fable build. install_dotnet.sh no-ops in ~6ms when the SDK is already
# present, so the common case costs nothing.
#
# Every command degrades safely. A failed install must not hard-fail the
# session the way the original environment setup script did.

if [ "$CLAUDE_CODE_REMOTE" != "true" ]; then
  exit 0
fi

bash "$(dirname "${BASH_SOURCE[0]}")/install_dotnet.sh" || true

dotnet tool restore || true

npm install || true

exit 0
