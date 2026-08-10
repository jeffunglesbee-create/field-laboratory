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

---

## Follow-on: closing_odds and the Odds Story layer

### The layer found that the field is not what it is named

The Odds Story is meant to narrate line movement between opening and closing
prices. Decoding `closing_odds` to build it produced this, from a verbatim live
capture:

```
MLB_2026-08-09_yankees_braves
  opening_odds.captured_at = 2026-08-09T10:01:24.241Z   moneyline {home: -142, away: 132}
  closing_odds.captured_at = 2026-08-09T10:01:00.322Z   moneyline {home: -142, away: 132}
```

The "closing" snapshot was captured **~22 seconds before** the "opening" one, in
both games, from the same adapter — and the two are identical across moneyline,
spread *and* total. They are one snapshot written to two columns.

This is the laboratory's first finding about the DATA rather than about a type.
The type system's contribution was to make it impossible to ignore: `captured_at`
had to be decoded to check the relationship at all, and `NotASequence` is a case
the renderer must handle.

**A layer built without checking would have rendered "line unchanged" on every
card** — a true-sounding statement about a market never observed twice. That is
worse than rendering nothing, because it invents a finding.

### Scope of the claim

Bounded deliberately. Sample of two games, one day, one sport, one adapter. The
sentinel now measures the odds shape across the whole live slate every run and
carries it in the log:

```
odds: both=2 not-sequenced=2 moved=0 unmoved=0 single=0 none=0
```

**Follow-up automation:** if every game carrying both prices is `NotASequence`,
the sentinel files an issue recording it, updating the same issue rather than
opening one daily. On the first run where any game shows a real sequence it
closes the issue itself — that would mean the relay was fixed upstream, and an
issue outliving its cause trains people to ignore the next one.

### The units finally have a real consumer

A moneyline's implied probability is not a win probability. `-142 / +132` implies
0.587 and 0.431, which sum to **1.018** — the book's margin. Both are plain
floats in the 0-1 range; nothing but a type separates "what this price implies"
from "the chance this team wins".

`[<Measure>] type implied` makes that a compile error (FS0001, in the proof
doc), and `devig` is the only sanctioned route to `prob`. This is the same
failure the prob/pct split already guards, one level deeper: not a scale
mismatch but a meaning mismatch at the same scale.

It is also the first time the units in this repo have carried real data rather
than a demo constant, which changes the README's standing honest negative.

### ADR-002 position, stated rather than assumed

Clean. A bookmaker's price is the textbook case of Rule F's permitted category,
"anything a neutral data vendor could plausibly publish". No composite score, no
threshold, no tier, no recommendation. Movement is reported as a factual shift
in implied percentage points, never as a signal that a game became worth
watching — which is the whole of Rule F's labelling-independent test.

### Verification

Gate 100/100. proof-check 9/9 (6 doc cases across three proof docs plus registry
completeness), check 13/13, check:hard 13/13, check:nav 18/18, drift 4/4 with
odds shape reported, corrupted fixture still rejected, zero warnings.

Two new runtime assertions, including one that verifies the NOT SEQUENCED
classification *from outside* the type system: the card prints both timestamps,
so the claim is checked against them. A card that flagged a genuine sequence as
unsequenced would pass every internal test and fail that one.

### Untested branch, recorded as such

`Moved` is unreachable in the committed captures — no observed pair is a real
sequence, so the one branch that would exercise `devig` and the implied-shift
arithmetic has no real-data coverage. Recorded as untested rather than presented
as working. It becomes reachable the day the sentinel sees a genuine sequence,
which is the same day the issue closes itself.

---

## Follow-on: spread and total

Same treatment as `closing_odds`. The spread held up; the total produced a
second structural finding.

### spread is a symmetric handicap, and holds

`{home: -1.5, away: 1.5}` — the two numbers are exact opposites in every
observed snapshot, which is what a single handicap requires. Modelled as
`Balanced of homeHandicap` / `Unbalanced of home * away`.

Stated relative to **home**, not to "the favourite". This repo has already
shipped one bug from a number whose referent was implicit — every fixture
rendered away-first because `%s @ %s` carried no convention with it. A signed
handicap with an unstated side is the same mistake waiting.

### total is one line written twice

```
total = {over: 8.5, under: 8.5}     # every game, both snapshots
```

`over` and `under` hold the same number. The field reads as two prices and
carries one line, duplicated. There is no over price and no under price anywhere
in the payload — the moneyline is the only priced market, which is why it is the
only one the implied-probability work touches.

Modelled as `OneLine of line`, with `TwoNumbers of over * under` for the shape
the field's name implies and which has never been observed.

### A cross-field invariant that could have been assumed

The side giving points on the handicap should be the side priced shorter on the
moneyline. Checkable, and true on every observed game:

  yankees_braves     home -142 favoured, home -1.5 gives   agree
  whitesox_guardians away -105 favoured, home +1.5 receives agree

`FavouriteAgreement` makes a disagreement a first-class case rather than a card
that merely looks odd.

### Three invariants, all mutation-tested

| mutation | result |
| --- | --- |
| `spread.away` 1.5 -> 2.5 | FAIL "every spread is a balanced handicap" |
| `total.under` 8.5 -> 9.5 | FAIL "every total is a single line" |
| handicap flipped against the moneyline | FAIL "moneyline and handicap agree on the favourite" |

**The second one initially did not fail, and that was a defect in this work.**
The split total was measured into the log as a counter while the other two
failed — inconsistent, and it would have let a real shape change pass as green.
Fixed by making it a check.

The reasoning behind making it fail is worth recording, because it is not
obvious: a split total is *not* a data-integrity violation the way an unbalanced
handicap is. It could equally mean the relay started serving genuine over/under
prices instead of the duplicated line — an upstream improvement. It fails for
the same reason an unmodelled sport does: an assumption this repo encoded has
stopped holding, and the model needs revisiting. The alarm says investigate, not
broken.

### Compile-time claim

Handling only the shape the data currently takes does not compile:

```
error FS0025: Incomplete pattern matches on this expression. For example, the
value 'Some (TwoNumbers (_, _))' may indicate a case not covered by the pattern(s).
```

Recorded in `docs/ODDS-PROOF.md` and compiled on every CI run. This is the point
of modelling `TwoNumbers` and `Unbalanced` at all: they are the cases that would
otherwise be discovered by a card rendering something quietly wrong.

### Verification

Gate 100/100. proof-check 10/10 (7 doc cases across three proof docs plus
registry completeness), check 13/13, check:hard 13/13, check:nav 18/18, drift
7/7 on both captures, corrupted fixture still rejected, zero warnings.

### Not claimed

- No price data for spread or total exists in this payload, so nothing here
  computes an implied probability for either. Only the moneyline is priced.
- `Unbalanced`, `TwoNumbers` and `Disagrees` have never been observed. They are
  modelled and mutation-tested but have no real-data coverage — the same
  standing as `Moved`.
- Nothing is claimed about sport-specific handicap vocabulary (runline, spread,
  handicap). The card renders a neutral "H" because nothing in this repo
  evidences what FIELD calls them per sport, and inventing a vocabulary is how
  production ended up with five disagreeing sport registries.

---

## The favourite invariant was wrong, and the sentinel caught it in one run

Shipped in the spread/total commit, `favouriteAgreement` treated any moneyline
difference as naming a favourite. The first live run flagged `mismatch=2` and I
deliberately did not call it a data finding, because the invariant was one commit
old and unvalidated against anything but MLB.

That caution was right, though not for the reason I guessed. I expected a soccer
handicap convention my rule did not cover. The named game was MLB:

```
MLB_2026-08-10_cardinals_phillies: ML -113/-107, H +1.5/-1.5
```

Those prices imply 0.5305 and 0.5169 — separated by 0.0136 against an overround
of 0.0474, three and a half times larger. There is no favourite there. **The
data was consistent; my invariant was too strict.**

The same check also revealed a false negative hiding beside the false positive:
`whitesox_guardians` in the committed capture (-102/-105, separation 0.0072 vs
overround 0.0171) had been *passing* by luck, not because the rule worked.
Neither error was visible until live data arrived with a wider spread of prices.

Fixed by requiring the separation to exceed the overround, computed from the
same two prices. Not a tuned constant — there is no constant. A market that does
not separate the sides by more than its own margin has not named a favourite.

Verified the check kept its teeth rather than being softened into uselessness:
flipping `yankees_braves`' handicap (separation 0.1557, overround 0.0178) still
fails. Comparisons on the committed capture dropped 4 -> 2, and both survivors
are genuine.

### Two logging defects found on the way

1. The RESULT status was computed from malformed/unmodelled only, so the run
   whose favourite check FAILED still logged `ok` — a row contradicting its own
   exit code. Status now carries spread-unbalanced / total-split /
   favourite-mismatch.

2. The mismatch was a bare count. A count cannot be judged. The note now names
   the sport, the game id and both sets of numbers, which is the only reason
   this was diagnosable at all rather than a standing mystery.

### What this says about the method

The alarm was built one commit before it fired, on two MLB games, and was wrong.
It was caught within a single live run — by the naming fix, not by the alarm
itself. An alarm that reports a count is not an alarm, it is a rumour.

---

## Follow-on: briefs, series, standings — and the gate earning its keep

### Context checked first, and it changed the build

Asked to check the cost-savings and J-layer/JQ docs on Drive before proceeding.
That was the right instruction and it redirected the work twice.

`FIELD — Insights Layer Spec ADDENDUM: O(1) Newspaper Architecture` establishes
that journalism is generated once per sport section per cron cycle, stored in
KV, and served flat from `/journalism/tonight` — $19/month at 1 user and at
10,000, against $145,800/month for the per-user pattern it replaced. Its stated
invariant: **"Client makes ZERO AI calls. Ever."**

First correction: I had been about to frame the three empty sections as a gap
the client needs filled. Journalism has its own endpoints; that framing would
have been wrong.

Second correction, from the relay's own source rather than the Drive docs:
`/context/date/{iso}` genuinely does return all three, from D1. So they are not
empty by architecture — which made the emptiness worth understanding rather than
explaining away.

### The finding: an empty array that means two things

```javascript
const [regular, postseason, briefs, enrichment, standings] =
  await Promise.allSettled([ /* five D1 queries */ ]);
briefs: briefs.status === 'fulfilled' ? briefs.value.results : []
```

`Promise.allSettled` is deliberate and correct — the CC-CMD's own rule is
"partial results are better than total failure". But a rejected query collapses
to `[]`, and `[]` is also what a genuinely quiet date returns. One is a fact
about the slate, the other is an outage, and after the collapse no consumer can
recover which happened.

Modelled as `Absent | EmptyOrFailed | Present of 'T list`. `EmptyOrFailed` is
deliberately awkward to read; calling it `Empty` would invent a certainty the
payload does not carry — the same mistake that would have rendered "line
unchanged" over `closing_odds`.

Deliberately NOT alarmed on. Firing on an ambiguous state would alarm on every
quiet slate; it is recorded in the drift log on every run instead.

`Brief` is modelled from the relay's own SQL (`findBriefs` selects id,
brief_type, brief_text, quality_score, source, model, word_count), every field
optional because the date-level query is `SELECT *`. `series` and `standings`
stay key-sets: never observed non-empty, so no shape to model.

### The confidence gate blocked a real regression, for the first time

While wiring the section reporting I used
`check('no malformed nested payloads', ...)` as a text anchor across several
edits, and the last edit REPLACED it rather than inserting before it. That
deleted the sentinel's central guard — the one that gives
`test/malformed-nested.json` its teeth.

The suite still read 7/7 green. The corrupted fixture decoded cleanly and the
`decoders still REJECT the corrupted fixture` row went red, taking the gate
below the bar and refusing the commit.

Worth stating plainly: every previous time the gate has run it confirmed work
that was already correct, and I described it as insurance. This is the first
time it caught something, and what it caught was me silently removing the check
that protects the repo's oldest claim. A green 7/7 next to a deleted assertion
is exactly the shape the gate exists to see through.

### Verification

Gate 100/100. proof-check 11/11 (8 doc cases across four proof docs plus
registry completeness), check 13/13, check:hard 13/13, check:nav 18/18, drift
8/8 on both captures, corrupted fixture rejected, zero warnings.

### Not claimed

`Present` has never been observed — modelled and compiling, no real-data
coverage. Same standing as `Moved`, `Unbalanced`, `TwoNumbers` and `Disagrees`:
five modelled cases now waiting on data that may never arrive.

---

## Follow-on: note, tags, crew, local_note — a fourth double-encoded field

Checked Drive first, as instructed, and it supplied every meaning rather than
leaving them to be guessed:

| field | meaning | source |
| --- | --- | --- |
| `crew` | broadcast crew, commentators | Archive-Consuming Client Features Phase 2 |
| `note` | editorial note | Archive D1 + Relay Endpoints, ADR-002 status |
| `local_note` | local/regional variant | same |
| `tags` | a JSON array **stored as a string** | `/archive/tagged/:tag` route SQL |

`crew` has a documented production render — two, actually: a full `.crew-line`
in the card body and a compact `.crew-chip` beside the broadcast pills, both
conditional on truthiness. The same log records crew as populated on POSTSEASON
objects (NBA Finals, Stanley Cup Final, named commentary teams per network),
which explains why neither capture here carries one: both are regular season.

### The finding

`src/Desk.fs` has said this since the first session:

> Three real fields do this: drama_arc, opening_odds, closing_odds.

It is four. The relay's archive route gives it away:

```javascript
const tagged = await env.ARCHIVE_DB.prepare(
  `SELECT * FROM regular_season_games WHERE tags LIKE ?`
).bind(`%"${tag}"%`).all();
```

Binding `%"tag"%` with the quotes INSIDE the pattern only matches a JSON array
serialised as text. A native array column would never be queried that way.

So `tags` carries the same hazard as `drama_arc` — a `string` annotation that is
completely accurate and tells you nothing about whether the contents parse. That
is the exact failure this laboratory exists to study, sitting undecoded in a
field nobody had looked at, with the repo's own documentation undercounting it.

### Modelled for both encodings, because the evidence is indirect

The evidence is a SQL binding pattern, not an observed value: `tags` is null in
every game of both captures, so the encoding has never been seen directly.
`nestedJson` gained a final branch accepting the value directly as well as
string-wrapped, ordered last so it cannot shadow the string branch.

Verified both ways — `'["rivalry","playoff-race"]'` and `["direct","array"]` both
decode — and the corrupted fixture is still rejected, which is the check that
matters most, since a more permissive decoder is exactly how a guard loses its
teeth. That check was run at every step of this change rather than at the end.

### Sentinel

`desk: note=0 local_note=0 crew=0 tags=0 of 2 games` on every run. `tags` gets
the same alarm as the other three double-encoded fields — malformed inner
payload fails the run. The other three are counted, not alarmed: a null
editorial note is a normal Tuesday, not a fault.

### A false alarm of my own, worth recording

Running `npm run check` directly reported a crash while the confidence gate
reported render checks 20/20. The discrepancy was mine: the local server had
died, and the gate starts its own if nothing is listening. Confirmed by
restarting it and re-running to 13/13 rather than assuming the gate was right.

The habit is the point. A gate disagreeing with a direct run is exactly the
shape of a gate reporting on something other than what it claims, and it
deserved thirty seconds of checking rather than a shrug.

### Verification

Gate 100/100. proof-check 11/11, check 13/13, check:hard 13/13, check:nav 18/18,
drift 9/9 on both captures, corrupted fixture rejected, zero warnings.

### Not claimed

- Not that `tags` is string-encoded on the wire. The SQL says the COLUMN is;
  whether `/context/date` re-serialises it is unobserved. Both encodings decode,
  which is the honest answer to not knowing.
- Nothing renders for these fields on the committed data, because there is
  nothing to render. The slot exists so the first crew or note that arrives
  appears, rather than being discovered missing then.

---

## Follow-on: the zone as a type

### The question I got wrong first

Asked whether the scoreboard runs on ET or UTC, I answered UTC (correct) and
then said the fix was blocked on measuring the relay's keying. Jeff corrected
that: assuming an American convention is wrong for PRESENTATION — that is the
AFL bug — but timing is not presentation. The reader is on the US east coast.
Their day is ET, and no measurement changes it.

I had collapsed two questions:

1. **What zone does the relay's `date` use?** A property of the data. Genuinely
   unknown, worth measuring, since per-competition local keying would make ET as
   wrong as UTC for an AFL fixture.
2. **What day is it for the viewer?** A property of the person. Definite.

Only (1) needed evidence. Treating both as blocked was over-caution, and it
would have left a live bug in place for no reason.

### The measurement, which settled (1) anyway

Live 18-game slate: `MLB:starts-after-date=6  WNBA:starts-after-date=2`,
`MLB:same-utc-day=4  EFL Cup:same-utc-day=1  MLS:no-start-time=5`.

Eight games start on a LATER UTC day than their date; none start earlier. The
date runs behind UTC and never ahead — Western-hemisphere keying, consistent
with ET, inconsistent with UTC.

### The window

00:00-04:00 UTC is 20:00-midnight ET. Every night, in US prime time:

- `viewedDate()` requested tomorrow's slate while tonight's games were live.
- `datePassed = g.Date < todayUtc()` went true for tonight's fixtures, so
  `gameState` rendered LIVE GAMES AS FINAL. Same family as the AFL "In progress
  in August" bug, sign reversed.

### The version that was not enough, and why it matters

The first cut added `FieldDay` and left `Game.Date` a `string`. The bypass
compiled cleanly:

```fsharp
if g.Date < fieldDayIso (fieldToday ()) then "past" else "not past"
```

The original defect, one line, straight past a type that only guarded the
unwrap. Both sides are `string`; nothing objected. "The zone is now a type"
would have been half true and the false half was the one that mattered.

Caught by writing the bypass and watching it BUILD rather than assuming a
private constructor was sufficient. That is now the third time in this session
that a guard looked complete and was not — the drama arc, the split total, and
this. The pattern is consistent: sealing the accessor is not the same as
removing the raw value, and only the second one holds.

Fixed by lifting at the boundary, the `SealedDrama` principle: the decoder
produces `Day: FieldDay option`, so no bare date string reaches the renderer.

### Everything else that carried a clock

- `drift-sentinel.yml` probed `date -u +%F`, so between 00:00 and 04:00 UTC it
  asked the relay for tomorrow's slate during ET prime time. Now
  `TZ=America/New_York date +%F`.
- `nav-check.mjs` asserted the Today button against a UTC date — it would have
  failed four hours a night once the page moved to ET. Same window, inverted.
- `drift-check.mjs` read `g.Date`, which no longer exists. It would have printed
  `date=undefined` in exactly the alarm line whose job is to be judgeable —
  the failure the favourite-mismatch round trip already taught. Fixed and
  verified against a synthetic evening start rather than assumed.

### DST is not hand-rolled

`Intl` with `America/New_York`, not a UTC offset. Verified the fall-back hour
repeats (`2026-11-01T05:59Z` and `06:00Z` both render 01h), which an offset
would get wrong twice a year.

Canonical ET rather than browser-local, deliberately: FIELD's smoke, cron,
SW_VERSION and relay day-boundary are all America/New_York, so a browser-local
page would disagree with the rest of FIELD the moment the reader travels.

### Also observed this run: the sections went live

`briefs=present(192)` and `standings=present(8)` on the live slate. Both were
`empty-or-failed` in every capture and `Present` was recorded as having no
real-data coverage. It now has some — 192 real briefs decoded through the
`Brief` type that was modelled from the relay's SQL, with the payload decoding
clean. `series` remains `empty-or-failed`.

### Verification

Gate 100/100. proof-check 13/13 (10 doc cases across five proof docs plus
registry completeness), check 13/13, check:hard 13/13, check:nav 18/18, drift
9/9 both captures, corrupted fixture rejected, zero warnings.

---

## The zone check was false confidence, and mutation testing caught it

Asked to confirm ET on live. Ran the sentinel — clean, `2026-08-10`, keying
unchanged — and stated up front that it could not demonstrate anything, because
at 18:35 UTC the two zones agree. That was the honest caveat, and it pointed at
a real hole.

### Every scheduled job runs outside the window

```
drift-sentinel   0 12 * * *   12:00 UTC = 08:00 ET   same day
live-check      37  6 * * *   06:37 UTC = 02:37 ET   same day
verify                        whenever a push lands
```

The zone fix is only observable from 00:00 to 04:00 UTC. Nothing in this repo
was scheduled to run there. The fix would have been exercised by luck, on
whichever pushes happened to land after 8pm Eastern.

### The first zone check did not work, and passed anyway

Wrote `zone-check.mjs`, got 16/16, then mutation-tested it. **A hardcoded UTC-4
passed 11/11. Plain UTC passed 11/11.**

Two reasons, both mine:

1. The fixed-instant assertions tested `etDay`, a helper defined inside the
   check file. They verified my test's own arithmetic, not the F# code.
2. The one assertion that did reach F# compared `fieldToday()` to today — which
   is identical under UTC, under a fixed offset, and under the correct rules,
   for twenty hours out of every twenty-four.

A guard whose only real assertion is time-dependent, in exactly the window that
is hard to reach, is worse than no guard: it reports green and means nothing.

### The fix: make the conversion pure

`fieldDayAt (instant: DateTimeOffset) : FieldDay`, with `fieldToday()` a
one-liner over it. Now the checks call the real compiled F# at chosen instants,
each picked so a wrong implementation gives a different answer:

| instant | correct | catches |
| --- | --- | --- |
| 2026-08-11T02:00Z | 2026-08-10 | plain UTC |
| 2026-01-01T04:30Z | 2025-12-31 | a fixed -4 |
| 2026-07-01T04:30Z | 2026-07-01 | a fixed -5 |

Re-mutated: UTC-4 now fails 1, UTC-5 fails 2, plain UTC fails 2. 16/16 clean.

### Coverage, not luck

- `zone-check` is in `verify` and is a gate row — deterministic, so it runs at
  any hour.
- The sentinel gains a second cron at `30 1 * * *` — 21:30 ET, inside the
  window, and also the busiest slate of the day in ET. That makes it the most
  informative run rather than merely the most awkward.

### The pattern, four times now

The drama arc, the split total, the `Game.Date` string, and this. Each time a
guard looked complete and was not, and each time the tell was the same: the
thing being asserted was not the thing that could break. Only mutation testing
distinguished them, and in this case the check I had just written to protect the
fix was itself the thing that needed protecting.

---

## Testing the ET window without waiting for it

The fix is observable only from 00:00 to 04:00 UTC, and the sentinel cron that
reaches it was seven hours out. `scripts/window-check.mjs` removes the wait.

`fieldDayAt` is a pure function of an instant — built an hour earlier to fix the
false-confidence problem, then not used for the obvious thing. The window can be
NAMED rather than waited for: pick an instant inside it, ask the real compiled
F# which day that is, and fetch BOTH that day and the day the old UTC code would
have chosen from the live relay.

```
simulated instant : 2026-08-11T02:00:00.000Z
FIELD-zone day    : 2026-08-10   <- what the page asks for now
UTC day           : 2026-08-11   <- what it asked for before the fix
```

`2026-08-10` is tonight's 18-game slate. `2026-08-11` is what a reader at 10pm
Eastern would have been served. Two HTTP responses instead of an argument.

Runs as a `live-check` step, not a gate row: it needs relay egress, and putting
it in the gate would turn a deterministic gate into an environment-dependent
one.

**Deliberately not asserted:** which slate is correct. That needs ground truth
about which games are live at the simulated instant. What the check shows is
that the choice changes the answer, and that the fixed code chooses the day the
reader is living in.

**The general lesson,** which is the same one four different ways today: a
time-dependent test is a design problem, not a scheduling problem. The reason
this needed a seven-hour wait was that `fieldToday()` read the clock internally.
Once the instant became a parameter the wait disappeared — and that same change
is what made the mutation testing possible in the first place.

---

## The gate could not detect an undocumented commit

Asked whether every ET item had a gate and an outbox. Gates: yes, all four.
Outboxes: no.

| commit | gate | outbox |
| --- | --- | --- |
| `70b2584` measurement | yes | written an hour later, with the zone fix |
| `82475ca` zone as a type | yes | yes |
| `a288961` false confidence | yes | yes |
| `b187a91` window simulation | yes | **none until now** |

The gate's outbox row checks that a dated file exists with more than 1500
characters. That is satisfiable by ANY dated file, so it cannot tell a
documented commit from an undocumented one — and it passed on both gaps above.

This is the second time this session the outbox mechanism has been the weak
link, and the first time was the reason the gate exists at all. A row that
cannot fail for the reason it was written is decoration.

**Fixed:** a new row compares the actual changed files. If a commit touches
`src/` or `scripts/`, it must also touch `outbox/`. Uncommitted work is judged
on the working tree, committed work on `HEAD~1..HEAD`, so it answers the same
question in both places; merge commits are exempt rather than failed on someone
else's merge.

Mutation-tested both ways: appending one line to `scripts/serve.mjs` with no
outbox change takes the gate to 92/100 and refuses the commit; touching both
passes at 120/120.

The positive case failed first, and the reason is worth keeping. The check
parsed `git status --porcelain` with `l.slice(3)`, which ate a character off one
entry — `"utbox/..."` — because the two status columns are not always both
occupied. It was reporting "no outbox change" on a commit that had one.

Caught by testing the PASS direction, not just the FAIL direction. A guard that
has only been shown to fail correctly is half-tested, and this one would have
blocked every future commit while looking like a working gate. Replaced with
`git diff --name-only` plus `ls-files --others`, which emit bare paths and have
nothing to mis-slice.

**What it still cannot do:** verify that the outbox entry actually *describes*
the change. A one-word edit to any outbox file satisfies it. That is a real
limit, stated rather than papered over — the row raises the floor from "a file
exists" to "this commit touched it", which would have caught both gaps, and no
further.
