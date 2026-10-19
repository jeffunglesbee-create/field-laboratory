# Claude Code Command — the "no-build" pre-commit hook cannot pass without a build

**Branch:** main — commit directly, do not create a feature branch or PR
**Repo:** field-laboratory
**Confidence gate:** `npm run gate` >= 95 before any commit
**Filed:** 2026-10-19 by CC, from `docs/CC-CMD-2026-10-18-lab-first.md` (Rule 87.4)
**Status:** FILED

## Measured

`.githooks/pre-commit` describes itself as "A fast, no-network, no-build gate".
One of its rows, `scripts/import-purity-check.mjs`, imports every exporting
script. Eight of them import `../build/*.js`, the Fable output. With no `build/`,
each import throws `ERR_MODULE_NOT_FOUND`, and the check reports it as "the
import terminated the process (exit 1)". That is a different fault, misnamed.
- **Reproduced on unmodified main** (`c8d25b3`) with no `build/`:
  "FAIL importing a module never runs it or exits the process", 2/3.
- **The same row passes on CI**, which builds first (verify run 39168027300 on
  `ce240fe`).
- **Consequence:** in any checkout without .NET (this sandbox has none), every
  commit, a markdown one included, is refused by the hook, and the only way
  past it is `--no-verify`. `outbox/cc-session-2026-10-19-lab-first.md` records
  that commit and why.

## Tasks

0. **Probe.** List the eight modules and confirm that each failure is
   `ERR_MODULE_NOT_FOUND` on `build/`.
1. **Name the state.** A module that cannot be imported because `build/` is
   absent is reported as **not checked here, needs a build**. It is never
   reported as terminating the process, and never as passing.
2. **Decide (owner):** whether the hook passes when its only findings are
   "needs a build", given that CI checks those modules with a build. Or whether
   the hook should run `npm run build` when .NET is present and refuse when it
   is not.

## Done condition

On a checkout with no `build/`, the hook names the eight modules as unchecked
and needs a build, and reports no module as "terminated the process". A
mutation that makes one of them really exit on import is still caught on CI.
