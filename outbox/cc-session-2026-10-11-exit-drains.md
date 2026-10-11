# CC session — a check script must not be killed mid-write

**Date:** 2026-10-11
**Repo:** field-laboratory
**Document:** `docs/CC-CMD-2026-10-11-process-exit-drops-the-annotation.md`
**HEAD at start:** `68b5d05`

Five tasks, four done conditions. Task 0 refuted the figure the document was
filed on, which changed what Tasks 2 and 3 should be — so the scope below is
narrower than the document asked for, and the reason is a measurement.

---

## Task 0 — the figure was wrong, and it was mine

The document was filed on this, from the session that found the bug:

> runs where the ::error annotation was LOST: 5 of 30

That came from **one synthetic script printing 400 rows**. Nothing in this
repository prints 400 rows. `scripts/exit-truncation-probe.mjs` measures the
real programs instead — twenty piped runs of each, idle and then under eight CPU
burners on four cores:

| program | bytes | idle | under load |
|---|---|---|---|
| `build/VerifyMain.js` (pre-fix) | 13,146 | 0/20 | **5/20** |
| `check-doc-citations.mjs` | 3,021 | 0/20 | 0/20 |
| `palette-check.mjs` | 1,909 | 0/20 | 0/20 |
| `design-tokens-check.mjs` | 1,535 | 0/20 | 0/20 |
| `typography-check.mjs` | 1,310 | 0/20 | 0/20 |
| `sport-registry-check.mjs` | 834 | 0/20 | 0/20 |

**One** program here has ever been shown to lose a tail, and it is the one
already fixed. No `createChecks` script lost anything in 240 piped runs.

"Roughly one failing check in six publishes no annotation" is not true of this
repository. It was published in a commit message and in the document's own body,
from a single synthetic measurement, which is the Rule 100 corollary exactly:
believing it cost nothing, publishing it cost a reader something to un-learn.
The sentence stays in the document under a correction rather than being deleted,
because deleting it would hide that it was said.

### What the variable actually is

**Load, not size.** The same 13 KB loses nothing idle. And a bare loop printing
13 KB loses nothing even loaded — the ladder only starts losing at 16–64 KB:

```
  exit         32000 bytes    0 lost of 40  0.0%
  exit         64000 bytes    2 lost of 40  5.0%
```

The program that *did* lose output also loads thirty modules and reads four
fixtures off disk. The race is between the last write draining and the process
being told to die, and the amount of other work in flight is a term in it. That
is why a CI runner shows what an idle sandbox does not, and why the first local
reproduction attempt after the machine went quiet returned 0 of 40 on the very
program that had failed CI.

### What was tried and rejected

Writing the tail with `fs.writeSync(1, ...)`, so nothing is ever pending. It
looked like the better fix — one file, no call-site churn, no control-flow
change. On a pipe it throws `EAGAIN` and takes the process down with it:

```
  writeSync tail + process.exit:
  idle     200 lines  1 lost of 30
  loaded   200 lines  21 lost of 30
  loaded   800 lines  22 lost of 30
```

Worse than the bug, and loudly. Measured before adopting, not after.

---

## Task 1 — `finish()`, one place

```js
export const finish = (failures) => {
  process.exitCode = failures === 0 ? 0 : 1
}
```

It also closes a second thing quietly. Four sites wrote
`process.exit(summarize())`, which exits with the **failure count** as the
status — that is where the `Process completed with exit code 6` in the run that
opened this document came from — and a count above 255 wraps to 0, so a script
with 256 failures would have reported success.

Proven to still block: the clean self-test exits 0, and a deliberately broken
one exits 1.

---

## Task 2 — 65 converted, 62 deliberately not

`process.exit()` does two things: it sets the status **and it stops**.
`finish()` only does the first. So the conversion is safe exactly where nothing
executable follows.

| | |
|---|---|
| report-ending exits before | **127** |
| converted to `finish()` | **65** |
| left as `process.exit` | **62** |
| terminal report exits remaining | **0** |

The 62 are early exits, almost all inside `if (SELF_TEST) { … }` blocks whose
live half is **not** separately guarded. Converting those would let a
`--self-test` run fall through into the live half — which for several of them
means launching a browser or reaching the network in CI.

Restructuring sixty-one blocks into `if/else` is a large diff against a loss
nothing in this repository has exhibited. They are frozen at a count instead,
and the probe is the thing that will say if that stops being true. That is
narrower than the document's done condition 2 ("used by every script that prints
before exiting"), and the narrowing is the measurement's doing rather than a
shortcut.

One site needed a hand: `gate-inventory.mjs` imports `checks.mjs` dynamically
(`const { createChecks } = await import('./checks.mjs')`), which the rewrite's
static-import patch did not match. Caught by running every converted script, not
by reading the diff.

---

## Task 3 — the guard, and what it counts

`scripts/check-exit-drains.mjs`. Two strengths, because the measurement does not
support treating them the same:

- **FATAL** — a script whose last executable statement is
  `process.exit(summarize(...))`. Currently **0**, and `finish()` is a drop-in,
  so a new one has no excuse.
- **RATCHET** — an early one. `docs/early-exit-budget.txt` = **61**. It fails if
  the count grows *and* if the budget drifts loose above the real count, since a
  ratchet with slack has stopped ratcheting.

A bare early refusal — `console.error('UNREACHABLE'); process.exit(1)` — is
correct and is not flagged. The rule keys on `summarize`, which is what makes an
exit the end of a printed report.

### It counted its own fixtures

The first live run reported **74** early exits against a grep's 65. The nine
extra were this checker's own self-test strings — `'process.exit(summarize())'`
as test data, matched as if it were code.

That is the third time this session a checker has been bitten by the difference
between a mention and the thing, after the empty-catch gate and two others
before it. Fixed by blanking comments *and string literals* before scanning,
with four self-tests that pin it, and the count fell to 61 — matching the grep
exactly.

---

## Task 4 — two mutations, both caught

| mutation | what it does |
|---|---|
| `exit-kills-a-script-mid-write` | restores `process.exit(summarize())` as `workflow-check.mjs`'s last line |
| `early-exit-ratchet-grows` | adds one new early exit to `glyph-check.mjs` |

Both caught by `check-exit-drains`. The first is a one-word edit that reads as a
tidy-up; the second is the only thing standing between the ratchet and a number
in a file.

---

## Done conditions

1. **A measured rate with its output sizes** — the table above, and
   `outbox/exit-truncation-probe-latest.json`. It also carries the ladder, so
   the size dimension and the load dimension are both readable.
2. **One exported way to end a check, with a before/after count** — `finish()`,
   127 → 65 converted, 0 terminal remaining.
3. **A check that fails on the pattern and passes on a bare early refusal** —
   `check-exit-drains.mjs`, 18 self-tests, one of them exactly that distinction.
4. **A mutation that restores the pattern and is caught** — two of them.

## Not covered

- **Six programs measured, not 138.** The probe names its targets rather than
  globbing, because a script that needs a browser would time out and read as a
  truncation. A program absent from that list is unmeasured, not clean — the
  probe prints that sentence itself.
- **The 61 early exits are frozen, not fixed.** If a `--self-test` block ever
  grows past the threshold, the probe will say so before the ratchet does.
- **The full probe is dispatch-only** (`npm run probe:exit-truncation`). It
  spawns CPU burners and takes minutes; CI runs its self-tests only.

## Two pre-existing failures, unrelated

`check:sport-vocabulary` needs `RELAY_SHARED_SECRET`, which this sandbox does
not have. `check:adhd-skill` reports the installed skill has drifted from source
— last touched by `0fc1fe3`. Neither script is in this diff.
