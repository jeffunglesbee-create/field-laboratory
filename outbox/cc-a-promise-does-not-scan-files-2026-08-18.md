# Outbox — a refusal is a promise, and a promise does not scan files

**Date:** 2026-08-18
**Ships:** `docs/exposed-secrets.sha256`, `scripts/exposed-secret-check.mjs`,
`scripts/import-purity-check.mjs`, `isMain` in `checks.mjs`, three modules
guarded, run-id conflict semantics in `scripts/confidence-record-check.mjs`,
`verify-full` records its measurement, `docs/JLAYER-PLAN.md` redacted

## The security finding, first

**The relay's `X-FIELD-Relay` value has been committed in this repository since
2026-08-16.**

`docs/JLAYER-PLAN.md`, line 189, written by `41f0b33` — whose subject is
*"Correct Phase 4: laboratory generates nothing"*. The value appeared inside the
sentence explaining that the credential is write-capable against the production
briefs table and that laboratory must not hold it.

Across this project I said repeatedly that I would not copy that value into
laboratory, and separately declined to put it into laboratory's Actions secrets.
Both statements were true when I made them. Neither was worth anything, because
the value was already there and I had never looked.

### What has and has not been done

**Redacted from the working tree.** The paragraph now describes the header
without quoting it.

**Not removed from history.** `41f0b33` still carries it, and nothing in this
commit changes that. The repository is private, which bounds the exposure and
does not end it. **Rotation is the only thing that ends it, and rotation is not
laboratory's to perform.** This is now the seventh credential on that list and
the only one this repo caused.

### The guard, which is the part that generalises

`docs/exposed-secrets.sha256` pins SHA-256 hashes — never plaintext — of three
credentials known to be exposed. `scripts/exposed-secret-check.mjs` walks every
tracked file, splits it into candidate tokens, hashes each, and fails on a match.

Hashing candidates rather than searching for values is what lets the pinned list
stay hashed. There is nothing in that file to leak, and a failure names the
credential by description, never by value — a scanner that printed the secret it
found would be the leak it was reporting.

Verified against the real thing rather than a fixture: restoring `41f0b33`'s
version of `JLAYER-PLAN.md` into the working tree produces

```
FAIL  no tracked file contains a known-exposed credential
      → docs/JLAYER-PLAN.md: relay shared auth header value
        (gates POST /d1/execute — write path to production briefs)
```

Stated plainly, three times, in the file itself: it does not purge history, it
is not a general scanner, and a hash is not a vault — these are low-entropy
strings and anyone holding a candidate can confirm it. The threat model is a
paste by someone who already has the value, which is exactly what happened.

It is a `verify` step, not a gate row, for the reason `docs-check` records: gate
rows run weekly now, and a leaked credential caught seven days late is most of
the way to not catching it.

## Importing a module must not run it

Yesterday I wrote a probe against the real confidence log:

```js
import { parseLog, verdictsFor } from './scripts/confidence-record-check.mjs'
… console.log(results)
```

It printed the checker's output and none of mine. The module did its real work
at import time and called `process.exit(0)`, so every line after the import
never ran. **The command exited 0. The output was plausible.** I nearly reported
the results of a probe that had not executed.

Three modules were like that — `confidence-record-check.mjs`, the new
`exposed-secret-check.mjs`, and `history-check.mjs` — each exporting functions
for reuse while terminating any process that reused them.

`checks.mjs` now exports `isMain`, all three guard their executable half, and
`import-purity-check.mjs` enforces it across every module in `scripts/` that
declares an export. Ten modules, all clean.

**The test is a sentinel, not an output check**, and the distinction is the whole
point. The probe imports the module and then prints a marker. A missing marker
means the import terminated the process *whatever its exit code said*; extra
output means the module did work it should not have. "Produces no output" would
have missed the actual bug, because a module exiting 0 silently is
indistinguishable from a clean import. The self-test pins that case by name.

## A duplicate run id was the wrong idea

Yesterday's fix gave each gate run an id of HEAD plus a digest of everything not
in HEAD, and refused duplicate ids as "the log is inconsistent". That was right
about the collision and wrong about what a duplicate means.

**A clean run's id is a function of the tree.** For a clean checkout the digest
is `e3b0c44298fc` — SHA-256 of the empty string — so CI scoring commit X
produces the *same id* as a local run of commit X. Refusing that would have
thrown away the only chance this project has to ask whether the gate is
deterministic with respect to what it scores.

So a repeated id is now read for what it is:

- **agreeing** → corroboration, from a different machine with a different build
  directory and none of my local state. Reported, and worth more than either run
  alone.
- **disagreeing** → the gate is not a function of the tree. Something outside it
  — a stale `build/`, a cached artifact, the network, the clock — moved the
  score.

The second is a worse finding than any single failing row, because every other
guarantee here assumes the score describes the tree. Nothing could detect it
before run ids existed. Failing-row sets are compared as sets, so ordering is
not a conflict.

`verify-full` now commits its measurement, and that is the point of recording a
CI run — not more numbers. A CI run cannot back a citation written before it
existed; local runs do that. What CI supplies is an *independent second
measurement of the same tree*. It runs `if: always()`, because a failing
measurement is exactly what a record has to be able to hold.

## Three open items, answered

| item | the obvious answer | what shipped |
|---|---|---|
| `verify-full` does not commit its record | commit it, so the log grows | commit it so the log can *disagree with itself* — the same tree scored twice is a determinism check |
| the checker executes on import | add a main guard | add the guard, then enforce it repo-wide with a sentinel that catches the silent-exit case a guard alone would not reveal |
| six exposed credentials pending rotation | still the user's call | still the user's call — and meanwhile find the seventh, which was ours, redact it, and make the refusal mechanical |

## Verified

`exposed-secret-check --self-test` 9/9, and the real 2026-08-16 paste replayed
and caught. `import-purity-check --self-test` 5/5 including the exit-zero case,
and 10 of 10 modules clean. `confidence-record-check --self-test` 22/22, up from
19, with conflict, corroboration and set-ordering cases added. `check:workflows`,
`check:history`, `check:docs`, `check:unused` pass. `verify-full.yml` parses to
11 steps.

No score is stated. Every gate run so far was taken against a dirty tree, and a
dirty run cannot back one.

## Next

The first thing that will exercise the determinism check is the next
`verify-full`, which will re-measure whatever commit is on `main` and either
corroborate a local run of it or reveal that the score is not a property of the
tree.
