# "Written but never read back" — 2026-08-11

*Dated 08-11, not 08-10. The work began on the 10th and crossed midnight ET
while running; the entry belongs to the day it lands on. `outboxToday` caught
that before I noticed it — the row failed because every file I had was dated
yesterday, which is the row doing exactly its job on the one night a session
spans the boundary.*

Jeff sent jubilant-bassoon's account of what the confidence gate actually
scores, plus the full phrasing:

> Do not commit unless confidence >= 95. If score < 95, report verbatim and stop.

Reviewed against what this laboratory built today. Its definition is better than
the one I was working to, in three specific ways, and one of them was directly
portable.

## Where their definition is sharper

> It scores *the strength of the evidence chain behind the claim of done* …
> does a live artifact exist that would have come out differently if the work
> were wrong? … Reading the code and reasoning it should work is not evidence
> at all.

**Mutation testing is the mechanised form of that sentence.** Break the work;
does an artifact change? This repo's 27 mutations are that question asked 27
times. Laboratory arrived at the same test without naming it as well as they do.

Three places laboratory is genuinely worse:

**The subtraction is missing.** Their method starts at what the artifacts
support and subtracts for every claim no artifact covers — *"that subtraction is
the whole point; it forces naming the gap rather than rounding it away."*
Laboratory's gate has no representation of claims made but uncovered. It scores
its own rows and reports 100 while a session does work no row touches.

**I scored the wrong items.** Asked whether confidence ran per item or
cumulatively, I built per-ROW scores. But the items in this ceremony are *tasks
in a dispatch* — 30/30, 45/45, 17/25 — not rows in a suite. Laboratory's number
answers "is the guard suite healthy", not "is what I just did evidenced". Those
are different questions and I answered the easier one.

**"Report verbatim and stop" is under-built.** The gate exits 1 and names the
failing rows, but its rows only cover what someone already wrote a row for. Their
point is stronger: the gate's value is making stopping a legitimate outcome, so
a session that finds its premise false reports a STOP rather than substituting a
mechanism that satisfies the done condition. That is what `/archive/backfill`
did, and it is the half laboratory cannot yet do.

## The one that was portable, and what it found

> Docked for `went_to_ot` — written but never read back, so it's a value I set
> without proof.

`scripts/unused-check.mjs` mechanises that: a public value nothing reads has
never been observed by anything. The compiler only says it is well-typed.

Four real instances:

| | |
| --- | --- |
| `Desk.notYetStarted` | a dead wrapper left behind when `notYetStartedAt` was introduced |
| `Desk.arcOutOfDomain` | written *this evening* to report drift, wired to nothing |
| `Units.toProb` | "the only sanctioned way back", never exercised |
| `Units.devig` | **claimed in `docs/ODDS-PROOF.md` as "the only sanctioned route from `implied` to `prob`"** |

The last is the sharpest: a documented claim about a function no assertion had
ever run. `arcOutOfDomain` is the closest analogue to `went_to_ot` — I wrote it
hours earlier *specifically* to surface drift, and nothing surfaced it.

**Fixed rather than deleted where the value was real.** `notYetStarted` is gone.
`arcOutOfDomain` now names out-of-domain samples under the sparkline, which is
what it was written for. `toProb` and `devig` are exercised by
`scripts/units-check.mjs` against the real captured market ODDS-PROOF records —
`0.5305 / 0.5169` devigs to `0.5065 / 0.4935`, sums to exactly 1, keeps the
favourite favoured, and refuses a zero or negative market.

## Four detectors, four times the same bug

This one took four attempts, and every failure was the same shape: **a detector
reading its own documentation as code.**

1. `workflow-check` read the comment explaining why a step was absent.
2. `row-confidence` read `drift-check`'s `--url` usage example.
3. `unused-check` reported `arcOutOfDomain` and `notYetStarted`, then lost them —
   because I wrote their names into its own comment explaining the finding.
4. Its mutation `value-never-read` survived, because the dead value the mutation
   injects is spelled out in that mutation's `replace` string, and
   `mutation-check.mjs` was being scanned.

The first two were fixed by stripping comments. That is not enough for the last
two: a mention anywhere in those files counts, and in (4) the mention *is* source
code. Both files are now excluded, on a stated rule — neither contains code that
runs the values it names.

Recorded at length because four repetitions is not bad luck. Any tool that
searches a repo for a pattern will eventually search the file describing the
pattern.

## Verification

| | |
| --- | --- |
| `unused-check` | passes; four orphans resolved |
| `units-check` | 10/10 against the real market |
| mutation `value-never-read` | killed |
| new gate row `no value is written without being read back` | weight 20 |

## Not fixed, and stated

The subtraction, and "report verbatim and stop" for work no row covers. Both
need the gate to know what a session *claimed*, not just what the suite checks.
That is a real gap and this entry does not close it.


---

## The junk file this session's own tool created

`outbox-stub` mutates by stubbing today's outbox entries:

```sh
for f in outbox/cc-*$(TZ=America/New_York date +%F)*.md; do echo stub > "$f"; done
```

Once the ET date rolled to 08-11 there were no matching files, so `sh` passed
the literal pattern through and `echo stub >` **created a file named
`cc-*2026-08-11*.md`**. It then satisfied `outboxToday`'s filename match at five
bytes, under the 1500-byte floor.

Nothing was lost — all twelve entries were intact at full size — but a world
mutation that writes files must not assume its glob matched. Guarded with
`[ -e "$f" ] || continue`.

Worth naming as its own category. Every other bug today was a check answering
the wrong question; this one was a check **creating the condition it then
measured**. A mutation that changes the world has to be able to change it back,
and this one could produce something there was nothing to restore from.
