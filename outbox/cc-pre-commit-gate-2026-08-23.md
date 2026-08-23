# Outbox — a pre-commit gate, so the cheap checks run before the commit exists

**Date:** 2026-08-23
**Ships:** `.githooks/pre-commit`, enabled per cloud session by
`scripts/install_pkgs.sh`. Second of the cross-repo optimisations.

## The gap

The cross-repo comparison found the client runs a blocking pre-commit gate
(smoke + units + lint), while the laboratory had no commit hook at all —
everything it verifies ran only in CI, after the bad commit was already in
history. That is not hypothetical: an injected proof body was once committed to a
source file and survived the build, the warning gate, and fifteen further steps,
caught only ninety seconds into CI by `check:clean-source` — which exists solely
because of it.

## What shipped

`.githooks/pre-commit` — a fast, no-network, no-build gate: `package.json`
validity, the injected-proof guard (`check:clean-source`), and workflow sanity
(`check:workflows`). Under a couple of seconds, so it stays enabled; the full
suite — build, browser, mutation, the confidence gate — stays in `verify`, where
a pre-commit that ran all of it would be one nobody keeps on.

`scripts/install_pkgs.sh` enables it each cloud session with
`git config core.hooksPath .githooks`, scoped by the existing
`CLAUDE_CODE_REMOTE` guard so a contributor's local git is never reconfigured
behind their back — they opt in with the same one line.

## Why this and not more

The gate is deliberately the cheap half. Its whole value is being *kept on*, and
the way you keep a gate on is by making it cost seconds, not minutes. The
injected-proof disaster is exactly the class it catches at the door instead of in
CI.

## Verified

The hook runs green directly: `check:clean-source` 3/3, `check:workflows` 6/6,
`pre-commit: ok`, exit 0. Enabled in this session, so this very commit passed
through it.

## Screenshot gaps, accounted for

- **Deploy-landed proof** — shipped (`cc-deploy-landed-2026-08-23.md`).
- **Pre-commit gate** — this.
- **Assertions against the shipped artifact** — already covered: `live-check`
  renders the deployed `index.html` and asserts on it.
- **SW_VERSION cache invariant** — does not apply; the laboratory ships no
  service worker, and inventing one to match would be cargo-culting, not
  optimising.
