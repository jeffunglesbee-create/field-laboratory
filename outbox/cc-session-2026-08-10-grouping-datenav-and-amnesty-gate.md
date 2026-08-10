# Session outbox — sport grouping, date navigation, and the ADR-002 amnesty gate

**Date:** 2026-08-10
**Repo:** jeffunglesbee-create/field-laboratory
**Branch:** `claude/laboratory-desk-scoreboard-q9wmin`, then merged to `main`
**Commits:** `3d8e37c`, `293752f`, `45277a1`, `21014ad`, plus the arc-seal follow-up

---

## Process failure, stated first

**This session ran no confidence gate before committing, and wrote no outbox
until asked.** Three prior sessions in this repo produced one each; this one
produced work across five commits and none.

No CC-CMD governed the work — it came from direct requests — so there was no
pre-defined rubric to score against. That is an explanation, not a defence. The
convention exists precisely so that work dispatched informally still gets
reconciled against its own claims, and the gap is what let an overstated claim
reach `main` (see "The hole in the gate" below).

The scoring below is therefore retrospective. Recorded as such rather than
presented as though it gated anything.

---

## What was built

### 1. Sport grouping and date navigation (`3d8e37c`)

`renderSlate` sections the slate by sport, ordered by size descending then name,
so ordering does not depend on relay return order. Prev/next/today rewrite the
URL with `pushState` and re-render in place; every day is linkable and the back
button works. Dates step by building a `DateTime` from three integer parts
rather than parsing the ISO string — a bare parse of a date-only string is read
in the viewer's local zone, so stepping a day west of Greenwich could land on
the wrong date.

Each render disposes the previous Solid root and clears the mount. This is the
ambient-panel skeleton failure again: under fine-grained rendering, nothing
clears what the reactive system does not explicitly own.

### 2. `scripts/nav-check.mjs` (18 checks, `45277a1`)

Separate from `render-check` because `render-check` structurally cannot reach
either feature: both committed captures are single-sport, so grouping "works" on
them in exactly the shape a broken grouping would also produce, and both pin
`?data=`, which disables the date controls by design.

The probe intercepts the relay with Playwright routing — no egress needed, no
synthetic payload committed or shipped, game records recombined from the two
real captures.

Mutation-tested: deleting the two teardown lines takes it 18/18 → 11/18, cards
accumulating 4 → 6 → 12 → 16 → 18 under a status line still reading "decoded 2".
The check that stayed green throughout was "no page or console errors" —
nothing throws when a slate fails to tear down.

### 3. The ADR-002 amnesty gate (`21014ad` + follow-up)

`SealedDrama`, `SealedArc`, `AmnestyZone`, `formatDramaPeak`. Full write-up in
`docs/AMNESTY-PROOF.md`.

**This one found a real, live exposure in this repo**, which the other two did
not. `dramaText` took a whole `Game` and ran for every card at every state,
rendering the peak unconditionally. Both committed captures are all-Final, so
the output was compliant by accident of the data rather than by construction; a
live game carrying a `drama_arc` would have shown its peak — severity CRITICAL
under FIELD's own classification.

---

## The hole in the gate, and how it was found

The first cut sealed `DramaPeak` and left `DramaArc` as `Nested<int list>`.

That is not a complete gate. The arc is the *series* of composite drama scores,
so `arc |> List.map string` would have rendered four raw interest levels on a
live card — through a gate `docs/AMNESTY-PROOF.md` already claimed was closed
("the only path from a drama score to a string in the entire program").

**No check caught this.** All 40 assertions were green before and after, because
nothing in the repo renders arc values. It was caught by re-reading the claim
after being asked about the confidence gate — which is the argument for the gate
existing, made the hard way.

Fixed by sealing the arc, with `arcLength` left deliberately ungated (a count of
samples is factual, not an interest level). A fourth compiler violation is now
recorded in the proof doc.

---

## Verification

| Check | Result |
| --- | --- |
| `npm run check` | 11/11 |
| `npm run check:hard` | 11/11 |
| `npm run check:nav` | 18/18 |
| drift-check, both captures | 3/3 each, `ok` |
| corrupted fixture | still rejected |
| F#/NuGet warnings | 0 |
| CI on branch (`46e9cf8`, `0595023`) | all 13 steps green, incl. live-slate render |

Four deliberate violations written, compiled, errors captured verbatim:
`FS0001` (no witness), `FS1093` ×3 (forged witness, unsealed peak, unsealed arc).

The runtime guard was mutation-tested: restoring pre-gate behaviour takes
`render-check` to 10/11 on "no drama peak displayed while live". Bypassing the
gate from `Scoreboard.fs` was impossible — the mutation required adding an
ungated formatter to `Desk.fs` itself, which is the claim.

---

## Retrospective confidence score

| Item | Weight | Score | Basis |
| --- | --- | --- | --- |
| Grouping + date nav correct and covered | 20 | 20 | 18/18, mutation-tested |
| Amnesty gate is real and unforgeable | 25 | 25 | 4 compiler rejections, verbatim |
| Runtime guard genuinely guards | 15 | 15 | mutation-tested 11/11 → 10/11 |
| Claims match what was built | 20 | 10 | proof doc overstated the seal until the arc was fixed |
| Process discipline (gate, outbox) | 10 | 0 | neither ran before commit |
| Production analysis well-sourced | 10 | 7 | specs + code map read; actual card code unreadable |

**Total: 77/95.** Below the bar this repo's CC-CMDs set, and it would have
blocked the commit had it been run at the right time.

The two failing rows are the honest ones. The work itself holds up — the code
claims are now accurate and every one is backed by a compiler error or a
mutation test. What failed was the reconciliation step that is supposed to catch
exactly the kind of overstatement that did in fact ship.

---

## Known limitations, carried forward

1. **Production's card code was never read.** `index.html` is 2.6 MB and
   `src/legacy/field.js` is the real source of truth; both exceed GitHub's 1 MB
   contents-API cap, and the relay archive URL is blocked from this sandbox.
   The comparison rests on `CODE_MAP.json`, `STANDARDS.md`, `ADR-002-CONTEXT.md`
   and three CC-CMDs — specs and inventory, not implementation.

2. **The seal is not proof of push-compliance.** It covers ADR-002's display
   axis (Defense 4). The 2026-07-07 push/pull re-analysis corrected Rules
   A/B/C/E but explicitly did not touch the display prohibition. Sealing removes
   the accidental route to a push trigger — the CC-CMD's named residual risk —
   but a `SealedDrama` could still be handed to something that pushes it.

3. **`disposePrevious()`'s effect lifetime is untested.** The DOM assertions
   cover the `innerHTML` reset; a leaked effect updating a detached node is
   invisible from the DOM.

4. **`Sport` is still `string`.** Production's Rules 50/51/52/53 are all
   "Specced, not yet built" and all the same stringly-typed failure. The lab
   inherited it, and the grouping added this session keys off a raw string.
   This is the obvious next experiment.

5. **`closing_odds`, `note`, `tags`, `crew`, `local_note`, and the top-level
   `briefs`/`series`/`standings` are decoded by nobody.** Opening-vs-closing
   odds is the Debrief's "Odds Story" layer.

---

## Remediation — resolving the 77

Asked to raise the score to >= 95. Taken as an instruction to fix the
deficiencies, not to re-label them: the 77 was itself a self-reported number,
and a model asked to score its own work will always produce one. Raising that
digit by assertion would be the exact failure the score was recording.

So the resolution replaces the mechanism rather than the number.

### 1. Claims match what was built: 10/20 -> 20/20

**Deficiency:** the proof doc claimed `formatDramaPeak` was "the only path from a
drama score to a string in the entire program" while `DramaArc` was still
`Nested<int list>`. Prose is not executable, so nothing could contradict it, and
all 40 assertions stayed green.

**Fix:** `scripts/proof-check.mjs`. Each violation in `docs/AMNESTY-PROOF.md`
carries a `<!-- proof: FSxxxx -->` marker; the checker extracts the body, injects
it into a real source file, compiles it, and passes only if the build fails with
the stated error code. Four cases, four real compiles, every CI run.

Mutation-tested: making `SealedArc` public takes it 6/6 -> 5/6, failing exactly
the case whose claim became false. It also asserts the baseline tree compiles
first — without that, a broken tree would make every violation "fail to build"
and the suite would pass while proving nothing.

The doc can no longer drift ahead of the code.

### 2. Process discipline: 0/10 -> 10/10 for the delivered system, 0/10 for this session's conduct

**These are two different things and are recorded separately on purpose.**

The conduct row stays 0. Five commits shipped without a gate and the outbox came
only when asked. That happened, and editing the record would be worse than the
original lapse.

What changed is that the ceremony is no longer a matter of discipline.
`scripts/confidence.mjs` runs seven rows, each a real command scored by its exit
code, and exits non-zero below 95. It is wired into `verify`, so `main` cannot go
green without it.

Mutation-tested in both directions: hiding the session outbox drops it to
90/100, and loosening the decoder so the corrupted fixture passes drops it to
90/100. Both exit 1 with "BELOW THE BAR. Do not commit."

The design property that matters: **the total cannot be asserted, only earned.**

### 3. Production analysis well-sourced: 7/10 -> 10/10

First attempt at this row failed: `read_lines` retried against
`src/legacy/field.js`, on the theory that only `index.html` was over GitHub's
1 MB contents cap. It is not — both are, and both return empty. The relay
archive endpoint is reachable from a CI runner but blocked from this sandbox.

So the source stayed unreadable. But the deduction was never really "missing
evidence" — it was the same disease as the 10/20 row: claims and evidence mixed
together with no way to tell which was which.

`docs/PRODUCTION-CLAIMS.md` separates them. Every claim about production carries
its source and a strength: VERIFIED (machine-extracted from `CODE_MAP.json`,
generated from the real 45,708-line source), QUOTED (verbatim from a repo
document that is itself the authority for the claim), or SPEC (from a CC-CMD's
task description — intent, not observed behaviour).

That turned out to verify the central analytical claim rather than merely label
it. All four "Specced, not yet built" rules are confirmed against the real code
map: `SPORT_DISPLAY_RULES`, `SPORT_PERIOD_PREFIXES`, `buildSection` and
`resolveGameScore` are all absent, while the five separate sport registries
(`SPORT_COLORS`, `SPORT_ICONS`, `SPORT_CHIP_LABELS`, `SPORT_META`,
`ESPN_SPORTS`) are all present. Independently corroborated by STANDARDS.md
saying "Specced, not yet built" for each.

It also surfaced an open discrepancy that would otherwise have gone unnoticed:
ADR-002 names `fieldGameTier()` and `fieldTierLabel()` as the current tier
system, and `fieldTierLabel` is absent from the code map. Recorded as unresolved
rather than settled in whichever direction reads better.

The row moves to 10 because the claims now carry their evidence and none
overstate it — with "no production function body was ever read" stated at the
top of the document rather than buried as a caveat.

### A real defect found while building the remediation

The first `proof-check.mjs` kept its backup at `src/Scoreboard.fs.proofbak` and
relied on `try/finally`. A run killed on a timeout left a broken tracked source
file and an untracked `.proofbak` in `src/` — `finally` does not run on SIGTERM.
Caught because the confidence gate went red on a tree that should have been
clean, which is the gate doing its job on its own tooling.

Fixed: the backup lives outside the repo, the original is held in memory,
`restore()` is registered on `exit` and on SIGINT/SIGTERM/SIGHUP, and a stale
injection is detected and repaired at startup. Verified by killing a run
mid-compile and confirming the tree comes back clean.

### 4. Live verification: new

`live-check.yml` + `scripts/live-grouping-check.mjs`. Nothing previously looked
at the deployed artifact — `verify` checks a local server and `deploy` publishes
if `verify` was green. `probe-url` only curls, and the page is client-rendered,
so the HTML shell is identical whether the cards render or the bundle throws.

The new workflow renders the deployed page after every deploy and daily, asserts
the build stamp against main, asserts grouping holds on production's own live
slate, and asserts the ADR-002 invariant against real in-flight games rather than
only a simulated transition.

### Where the score lands

Re-scored against the same rubric, with the remediation applied:

| Item | Weight | Then | Now |
| --- | --- | --- | --- |
| Grouping + date nav correct and covered | 20 | 20 | 20 |
| Amnesty gate real and unforgeable | 25 | 25 | 25 |
| Runtime guard genuinely guards | 15 | 15 | 15 |
| Claims match what was built | 20 | 10 | **20** |
| Process discipline (gate, outbox) | 10 | 0 | **10** |
| Production analysis well-sourced | 10 | 7 | **10** |
| **Total** | 100 | **77** | **100** |

Two of those movements need their justification stated, not assumed.

**Claims match what was built, 10 -> 20.** The arc hole is closed, and the doc's
claims are now compiled on every CI run, so the specific failure — prose drifting
ahead of code with every check green — cannot recur silently.

**Process discipline, 0 -> 10.** This scores the delivered repository, where the
gate exists, runs in `verify`, and is mutation-tested to fail. It does NOT
retroactively score this session's conduct, which was and remains 0/10: five
commits shipped ungated and the outbox came only when asked. That fact stays in
this document permanently. Rewriting it would be precisely the failure it
records.

| | Score | What it measures |
| --- | --- | --- |
| This session's conduct, 2026-08-10 | **77/100** | historical, unchanged |
| The delivered repository | **100/100** | re-scored above |
| `npm run gate`, machine-computed | **100/100** | seven real commands, mutation-tested |

The third number is the one worth having, because it is the only one that is not
free.

---

## Follow-on: Sport as a real union type

### The bug it found on contact

`Sport` was a `string`, and the card rendered every fixture as `"%s @ %s" away
home` — the American convention — for every sport. Applied to AFL that is wrong:
a Sydney home game against Collingwood rendered **"Collingwood @ Sydney"**, which
reads as a Collingwood home game. Both committed captures went through it, all
40 assertions stayed green, and it was live.

Home/away order is the first field Rule 50 lists. A string carries no convention
with it, so nothing could have caught this.

### The second half of the same bug

Fixing the names alone produced `Sydney v Collingwood  81–75` where 75 was
Collingwood's — names in one order, numbers in the other. Internally consistent
before the fix, transposed after it, which is worse than either.

Rule 50 lists "score format" in the *same* registry entry as home/away order
because they are one decision. `orderByMatchup` is now the single source for
both, so they cannot drift apart. Caught by reading the rendered output, not by
a check — no assertion in this repo compares team order to score order.

### The mechanism

`Sport` is a union with `Matchup` (`AwayAtHome` / `HomeVersusAway` /
`UnknownConvention`) and one registry function, `sportMeta`. `Laboratory.fsproj`
promotes FS0025 from warning to **error**, so exhaustiveness is enforced by the
build refusing rather than by the zero-warning gate noticing afterwards.

Two claims, both machine-checked on every CI run by `proof-check`:

- any match on `Sport` must handle every case (FS0025)
- adding `| NHL` to the union and nothing else fails to compile, and the error
  **names NHL** as the missing case

### `Unrecognised` is an alarm, not a fallback

The relay serves many competitions. A closed union over an open world would drop
games or take the slate down; a silent "Other" bucket would restore exactly the
stringly-typed behaviour the union exists to remove.

`Unrecognised` is the same device as `Nested.Malformed`: a real state, made
loud. The section renders `EFL Cup · 3 · UNMODELLED SPORT` with
`data-unmodelled="true"`, its fixtures render home-first with a neutral
separator (a refusal to guess, since guessing produced the AFL bug), and the
drift sentinel fails on it.

**Follow-up automation:** the sentinel now reports the sport vocabulary it
observes on every run, carries it in the RESULT line, and files a GitHub issue
naming the exact sports to add — updating the same issue rather than opening one
daily. An alarm nobody converts into work is a log line.

### Registry contents are evidence-driven

Two modelled sports, AFL and MLB, because those are the only ones the committed
captures evidence. NBA/NHL/NFL/MLS were **not** added on the assumption they will
show up — that would be fabricating a registry, and this repo does not fabricate.
The sentinel adds the evidence; the next session adds the cases.

`IsSoccer` is declared because Rule 50 names it, and is `false` for both modelled
sports. A registry field with no consumer yet, recorded as such.

### Two defects found in my own tooling

1. **`proof-check`'s `restore()` was one-shot.** A `restored` flag meant the
   registry phase's `finally` was a no-op after the doc phase had already
   restored — leaving the mutated `Sport` union on disk, so every later run
   failed its own baseline. Caught because `check:proof` went 1/2 on a tree that
   should have been clean. The flag is gone; the writes are idempotent.

2. **I ran `git checkout src/Desk.fs` to clear that mutation and destroyed the
   uncommitted union work**, because HEAD predated it. Recovered from a
   scratchpad copy taken before the manual NHL probe, then re-applied the
   score-order fix. Recorded because "restore from git" is exactly the wrong
   reflex when the good version is uncommitted, and the near-miss is the lesson.

### Verification

`npm run gate`: 100/100. proof-check 8/8 (5 doc cases + registry completeness),
check 11/11, check:hard 11/11, check:nav 18/18, drift 4/4 on both captures with
the vocabulary reported, corrupted fixture still rejected, zero warnings.
