# 2026-10-09 — the claim harness's own control was pinned to a line number

**Asked for:** nothing. Found while shipping the axis manifest, fixed because it
was the reason that mechanism could not run on its own.
**Credits spent at any vendor:** 0

---

## What was red, and what it was taking down with it

`verify` has failed its last three runs on main. Two steps, in two jobs:

```
JOB verify      -> failure
    failure | Doc citations are anchored, not just numbered
    skipped | ...27 steps below it
JOB claim-sweep -> failure
    failure | The claim harness can be made to fail
```

The citations step is handled in `a6c5b52` — two of its three bare citations
were mine, written the day before. This entry is the second one.

The cost of either is not the step. `verify`'s citation step fails fast, so
twenty-seven gates below it were **skipped rather than run** for six days — the
F# suite, the gate-row teeth check, the confidence gate, the exposed-credential
scan, every live probe. And a red `verify` means `deploy` never fires: it
triggers on `workflow_run: [verify] completed` gated on `conclusion == 'success'`,
so the site only reached main's HEAD through the hourly schedule or a manual
dispatch for those six days.

## The defect

`scripts/claim-check.mjs` ends its premise scanner's self-test with a control,
and the control's comment states why it exists better than I could:

> A scanner that silently stops reaching it is indistinguishable from a repo
> with no undated premises, so the control is a check, not a paragraph.

It then identified its subject by line number:

```js
check('THE CONTROL: src/Desk.fs:1369 is found as a present-tense premise',
  real.some(p => p.line === 1369), ...)
```

That `1369` is the whole defect. The premise it names — the comment beginning
`FIELD app computes a win-probability away side as` — is still in the file and
still undated; it is at 1468.

The scanner is fine. Run today it finds sixteen premises in `src/Desk.fs`:
`53, 173, 339, 443 (dated), 500 (dated), 501 (dated), 526, 527, 653, 745, 888,
909, 1259, 1275, 1468, 1678`. The subject moved to **1468**. There is no 1369 in
that list, so the control failed — not because the scanner stopped reaching its
subject, but because the control stopped knowing where the subject was.

Six days of a red `claim-sweep` job for a stale integer.

It is also, exactly, the failure this repository already has a gate for one
layer up. `check:citations` ratchets *documents* that cite a `path:line` without
quoting anything from the file, on the grounds that a citation quoting nothing
cannot survive its subject moving. The same mistake was committed inside the
harness written to catch that class of error, where no gate was looking.

## The fix

The subject is looked up by its text. `CC-CMD-2026-09-11` names it as the
`1 - homeWP` premise, so that string is the anchor and the line number is
derived:

```js
const SUBJECT = '1 - homeWP'
const at = body.split('\n').findIndex(l => l.includes(SUBJECT)) + 1
```

**And "the subject is gone" became a separate check from "the scanner is
blind."** Those are different facts and the old form reported them identically —
two failures either way, with nothing in the output to tell a reader which had
happened. Now a missing subject fails one named check that says the control
cannot run, and the two scanner assertions below it say so in their detail
rather than pretending to a verdict.

`scripts/mutate-claim-check.mjs`'s C7 description cited `Desk.fs:1369` in prose
as well. Rewritten to name the premise instead of its address, so it cannot go
stale the same way.

## What was measured

```
node scripts/claim-check.mjs --self-test        25/25   (was 22/24)
node scripts/mutate-claim-check.mjs             11 of 11 mutations caught
```

The mutation run is the part that matters, and it had not been possible. The
harness refuses to mutate a red baseline — correctly, since a mutation applied
to already-failing source proves nothing — so for six days there was no
mutation coverage of the premise scanner at all. With the baseline green it
runs, and the two mutations aimed at the scanner are both caught **by this
control**:

| mutation | what it breaks |
|---|---|
| C7 the premise scanner stops collapsing whitespace | the window reads `"the  field app"` with two spaces and the wrapped premise escapes |
| C8 the premise scanner stops looking at the previous line | a subject wrapped across two comment lines becomes invisible |

So the re-anchored control is not merely green; it has been made to fail, twice,
for the two reasons it exists. Its own COVERAGE line still applies and is worth
repeating where the result is read: `--self-test` never executes the live sweep,
so no mutation of the sweep's own no-resolver branch could go red.

## What is still red, and is not mine

One bare citation remains, at the budget of 1: `docs/NON-CONTEST-DESIGN.md`
cites `scripts/sport-registry-check.mjs:92` for an assertion of
`golf.Modelled === false`. Line 92 today is
`check('score ordering agrees with the matchup text for every sport',` — the
same drift, in a design document rather than a harness. Not touched: it is
inside the budget, it is not mine, and tightening the ratchet to 0 belongs in a
commit about that document.
