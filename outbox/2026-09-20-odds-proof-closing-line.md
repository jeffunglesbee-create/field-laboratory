# A closing summary that contradicted its own document, and the month it cost

**2026-09-20** · `docs/ODDS-PROOF.md`, the "What this does not claim" section

## The line

> Nothing about `spread` or `total`, which are decoded by nobody. Only the
> moneyline is modelled.

False when written. The same file models both — "`Spread` is therefore `Balanced of
homeHandicap` or `Unbalanced of home * away`" — with verbatim captures,
**127 lines above it**.

## What actually existed

`85afee8`, **2026-08-10**:

- `src/Desk.fs:1230` — `Balanced of homeHandicap`, beside `Unbalanced of home: float * away: float`
- `src/Desk.fs:1242` — `OneLine of line: float`, beside `TwoNumbers of over: float * under: float`
- `src/Desk.fs:1256` — `spreadOf`, `totalOf`, `favouriteAgreement`
- `src/Scoreboard.fs:171` — `spreadOf`, rendering them on the card
- `scripts/drift-check.mjs:222` — `spreadOf`, asserting on them every run
- `docs/ODDS-PROOF.md:193` — `<!-- proof: FS0025 -->`, the compiler rejecting a
  consumer that handles only `OneLine`

Not dead code, not a sketch. Decoded, rendered, asserted on, and proven.

## The cost

`docs/CC-CMD-2026-09-11-spread-total-model.md` — filed **32 days later** — quotes
that one line as its entire justification:

> `docs/ODDS-PROOF.md` closes with an explicit limit: […] That is the largest
> unmodelled surface in the odds layer.

Its Task 1 specifies building `Spread` and `TotalLine` unions with degenerate
cases and an `FS0025` proof. All of that already existed. The document was filed,
carried a "FILED, not started" status for nine days, and named a blocker
(`guards` red) that is also no longer true.

## Why this line rotted and the ones above it did not

Every other bounded claim in that section names the sample it rests on:

> `Moved` is unreachable **in the committed captures** and is therefore the one
> branch here with no real-data coverage

> on **every sample observed so far**, it is not a closing line

Those survive because they are claims about a named corpus. **This one named
nothing.** "Decoded by nobody" is a claim about the whole repository at all
times, and nothing could contradict it — not a capture, not a test, not the file
it was written in.

A summary that generalises past its evidence has no failure mode. That is what
makes it dangerous, not what makes it safe.

## What is genuinely still unmodelled

Recorded in the corrected line so the next reader gets the real remainder rather
than a blank:

- **Neither market carries a price.** `ODDS-PROOF.md` establishes this directly —
  the moneyline is the only priced market in the payload — so there is no
  implied-probability path for spread or total.
- **The sentinel reports line SHAPE, never sport COVERAGE.** `drift-check.mjs`
  counts `Balanced`/`Unbalanced`/`OneLine`/`TwoNumbers` across the whole slate
  and never breaks down which sports carry odds at all. That is the CC-CMD's
  Task 2 and it is accurate and open.

## What was NOT done here

Task 2 is not built. Tasks 0.2 and 0.3 need live data — **no committed capture
holds a single `spread` or `total` key**, and the sandbox cannot reach the
worker, so a runner is required. The CC-CMD's own coverage table is dated
2026-09-11 and was not re-probed; the odds layer changed on 09-12, 09-14, 09-16
and 09-19, so every figure in it is unverified and is now labelled as such.
