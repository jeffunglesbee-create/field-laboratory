# Session record: the registry's "moved on but still anchored" case gets a clause (R2, commit 1)

**Date:** 2026-11-06. **Scope:** `scripts/proof-check.mjs` (one self-test clause) and `scripts/mutation-check.mjs` (one table entry). Finding D14 of the sixth review (integration lens). New file because `check:staged-outbox` wants an `outbox/` path in any commit that stages `scripts/`; fold it into the session document when merging.

## Premise commands, run first

- `node scripts/mutation-check.mjs --ids proof-main-flow-registry-always-intact,proof-main-flow-target-always-intact` on this clone: both caught (`3/3 checks passed`). The finding (entry survives) does not reproduce here: later commits restored fixtures whose registry has lost its last case.
- With `registryIntact: true` by hand, `proof-check --self-test` is `115/122` (7 FAIL). Every one of those fixtures uses a registry with no last case (an empty file, a link to /dev/null). That is the finding's real content: the case "registry moved on but keeps its last case" had no clause.
- A mutant that reads an anchored registry as intact (`currentRegistry === backupRegistry || currentRegistry.includes(REGISTRY_ANCHOR.slice(1))`) survived: `122/122`, exit 0.

## Built

- One clause after the target's mirror: a registry that is its backup plus a line, last case kept, under a marker with `restoreFailed: true`, must exit 1, not print STALE, print `nothing was written` and `src/Desk.fs is not what that run backed up`, leave the state and the file; the same registry under a marker with no flag must be discarded as stale (the control, which pins that the flag is what flips the outcome). Message says `2 planted states`.
- One table entry, `proof-main-flow-registry-intact-when-anchored`, for the mutant above.

## Red evidence

- Clause against `registryIntact: true`: `115/123`, the new clause among the 8 FAIL lines.
- Clause against the anchored-is-intact mutant: `122/123`, exactly the new clause fails (before: `122/122`).
- Unmutated: `123/123`.
- Entry through the harness: `PASS [proof-main-flow-registry-intact-when-anchored]`, `3/3 checks passed`.

## Not verified

Nothing beyond the above. The pre-existing entry `proof-main-flow-registry-always-intact` is unchanged and still caught.
