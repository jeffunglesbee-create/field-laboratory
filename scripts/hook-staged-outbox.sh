#!/usr/bin/env bash
# PreToolUse guard: refuse a `git commit` that stages src/ or scripts/ with no
# outbox/ entry in the same commit.
#
# WHY THIS EXISTS ALONGSIDE .githooks/pre-commit, WHICH ASKS THE SAME QUESTION
#
# The git hook only runs when `core.hooksPath` points at .githooks, and the only
# thing that sets it is scripts/install_pkgs.sh, called from the SessionStart
# hook. Measured at the start of the 2026-10-09 session: `dotnet` absent,
# node_modules empty, `git config core.hooksPath` EMPTY — the bootstrap had not
# run, so the guard was not in the path. docs/history-boundary.txt records the
# same cause for three of its five boundary moves, in its own words: "an opt-in
# guard that nothing opted into produces exactly this shape: not one lapse
# repeated three times, but one missing install that removed the guard for a
# whole session."
#
# This guard is read straight from .claude/settings.json by Claude Code. It needs
# no install step, no `git config`, and no npm packages — staged-outbox-check.mjs
# imports only ./checks.mjs and shells out to git. Two independent deliveries of
# one predicate; neither is a fallback for the other, because they fail for
# different reasons.
#
# EXIT 2 IS WHAT BLOCKS. Anything else lets the commit through, so a guard that
# cannot run must exit 2 rather than 0 — failing open is the state that produced
# twelve violations.
#
# `--no-verify` passes through untouched, because that is the override
# staged-outbox-check.mjs's own error message documents and it must keep working.
set -uo pipefail

CMD=$(jq -r '.tool_input.command // ""' 2>/dev/null)

case "$CMD" in
  *--no-verify*) exit 0 ;;
esac

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$(dirname "$(readlink -f "$0")")")}" || {
  echo "hook-staged-outbox: cannot reach the project directory; blocking." >&2
  echo "Override with: git commit --no-verify, and say why in the message." >&2
  exit 2
}

if [ ! -f scripts/staged-outbox-check.mjs ]; then
  echo "hook-staged-outbox: scripts/staged-outbox-check.mjs is missing; blocking." >&2
  echo "Override with: git commit --no-verify, and say why in the message." >&2
  exit 2
fi

node scripts/staged-outbox-check.mjs >&2 || exit 2
exit 0
