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
# `npm install` alone is genuinely sufficient to bootstrap this Fable project —
# verified, not assumed. The compiler here is the JS-hosted Fable
# (@fable-org/fable-compiler-js), which bundles the reference assemblies it
# needs (FSharp.Core, Fable.Core, Browser.*, core BCL) inside
# @fable-org/fable-metadata. There is no `dotnet tool restore` or
# `dotnet restore` step, because there is no .NET SDK dependency at all. That
# changes the moment the project references a NuGet package outside that
# bundled set — see docs and the outbox note for what that would require.
#
# Every command degrades safely. A failed install must not hard-fail the
# session the way the original environment setup script did.

if [ "$CLAUDE_CODE_REMOTE" != "true" ]; then
  exit 0
fi

npm install || true

exit 0
