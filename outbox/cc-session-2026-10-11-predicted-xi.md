# CC session — the predicted XI, and who draws it

**Date:** 2026-10-11
**Repo:** field-laboratory
**Document:** `field-relay-nba/docs/CC-CMD-2026-10-11-predicted-xi-render-decision.md`
**HEAD at start:** `0264139`

Four tasks and four done conditions. The document's Repo line reads
"jubilant-bassoon or field-laboratory — the decision is which, and that is
Task 1", so the first commit of this session had to be in a repo the decision
had already picked.

---

## Task 1 — the owner is field-laboratory

Five measurements, taken before the decision rather than after it.

### 1. The client already has a Lineups box, and it is the problem

The premise this session started from was "jubilant-bassoon has no lineup
surface". One grep refuted it. `src/legacy/field.js` renders a Lineups section
for any game carrying a Premier League fixture id:

```js
const formation = tl.formation?.label || '';
const starters = tl.lineup || [];
```

Its data comes from a different vendor than the relay's route:

```js
const r = await fetch(`${PL_RELAY_BASE}/match/${fixtureId}`, { signal: AbortSignal.timeout(8000) });
```

`plData.fixture.teamLists` is the Premier League's own team sheet, which is
published about an hour before kickoff and is confirmed by definition. The rows
it draws are `#shirt POS Name` and carry no qualifier of any kind.

So a BSD predicted XI dropped into that surface would render in the same box,
in the same row format, from a different vendor, distinguished by nothing. That
is the document's central claim word for word — "a predicted XI rendered
identically to a confirmed one is a fabrication with a team sheet's authority" —
and it is not a gap in the client, it is a working renderer that would have to
be rewritten to accommodate the new thing (Rule 69).

### 2. The client collapses every non-answer to the same nothing

```js
if (!starters.length) continue;
```

and, on any failure:

```js
}).catch(() => { document.getElementById(`tg-pl-${id}`)?.remove(); });
```

Empty, failed and absent produce one outcome: the section disappears. Task 3
forbids exactly this ("a renderer that draws an empty grid for all three tells
the reader the same wrong thing three ways"), so the client's failure handling
would have to be replaced rather than extended.

### 3. The laboratory already carries the refusal Task 3 needs, at the type level

`src/Schedule.fs` makes the probable starter a private single-case union:

```fsharp
type ProbablePitcher = private ProbablePitcher of string
```

with the reason written beside it — nothing can construct one from an empty
string and render a blank row where a pitcher should be. The same discipline
appears in `src/Stats.fs` for a value that may genuinely not exist:

```fsharp
    | UmpireRow of name: string * rating: Scouting.UmpireRating option
```

and in `src/Desk.fs` for an answer the wire cannot disambiguate:

```fsharp
type Section<'T> =
    /// The key is absent from the payload entirely.
    | Absent
    /// Present and empty. Indistinguishable from a failed upstream query.
    | EmptyOrFailed
    | Present of 'T list
```

`Section`'s comment is the governing precedent and it cuts both ways: it says
`EmptyOrFailed` is one case *because the wire format cannot tell them apart*,
and "any code that treats `[]` as 'no briefs today' is guessing". The lineups
route can tell them apart — it carries `X-Lineup-Fill: served-empty` separately
from `absent` and `null` — so the lineup answer gets separate cases for the
opposite reason, which is a thing to state rather than copy.

A five-case lineup answer is this repository's existing idiom. In the client it
would be a new one.

### 4. Only the laboratory can satisfy done condition 2 today

The laboratory renders from committed captures pinned by a query parameter:

```fsharp
let private dataUrl () =
    match queryParam "data" with
    | Some name -> sprintf "./data/%s.json" name
    | None -> RELAY_DATE + viewedDate ()
```

It captures those fixtures from the live relay, refuses to write a hand-made
one, and already commits PNGs to `outbox/`. The client fetches PL live on page
load and has no fixture path at all, so a predicted-and-confirmed screenshot
pair there waits on the vendor's clock.

### 5. The laboratory is already a BSD consumer, and already renders the soccer equivalent

```fsharp
let private RELAY_DRAW = "https://field-relay-nba.jeffunglesbee.workers.dev/bsd/tennis/draw"
```

and the probable-starter row the document names:

```fsharp
              match Schedule.pitcherOf away with
              | Some p -> yield PitcherRow(Schedule.teamOf away, p)
```

### What argues the other way, and why it loses

The document's own counter-argument is that a pre-game XI is a match-page
object and the laboratory is an analysis surface. That is true and it loses to
(1): the client's match page already has a lineup box, the box is confirmed-only
by construction, and putting a predicted XI in it is the specific fabrication
the document exists to prevent.

**Nothing is built in jubilant-bassoon. The client is not touched by this
session.**

---

## The capture — `scripts/capture-lineups-fixture.mjs`

Done condition 2 needs a payload in each state. `data/PROVENANCE.md` opens with
"nothing in this directory is fabricated, hand-written, or shaped to make a
decoder pass", and `scripts/capture-render-fixture.mjs` says "the fixture is
CAPTURED, never written by hand. Rule 1 — a hand-made row is an invented row".

A hand-written `confirmed` payload was the easy route. It was also unnecessary:

| sample | state | n | beta |
|---|---|---|---|
| pre-match events, 2026-10-11 06:34Z | `predicted` | 8 of 8 | `true` |
| pre-match events, 2026-10-11 15:27Z | `predicted` | 8 of 8 | `true` |
| finished events, 2026-10-10 | `confirmed` | 3 of 3 | `false` |

Runs `38118474339`, `38151345923`, `38151411240` of field-relay-nba's
`bsd-lineups-probe.yml`. Sixteen pre-match observations nine hours apart never
said `confirmed`; three finished events never said anything else. So
**`confirmed` is captured from a played event and `predicted` from an unplayed
one**, which is why the script takes a state and discovers its own event rather
than being handed an id.

The event is discovered, never hardcoded, for the reason the relay's own probe
wrote down: event 220230 was pre-match on 2026-10-10 and has since been played,
so a script reusing it would capture a finished event while filing it as
pre-match.

### The premise the capture refuses to assume

The renderer must derive the lineup state from the **body**, not the headers,
because `?data=` pins the page to a file and a file has no headers. If the
renderer read `X-Lineup-State` it could not render a committed capture at all,
and the live path and the fixture path would be two decoders.

So the capture asserts that the relay's headers and the body-derived values
agree, on every event it touches, and **refuses to write** if they do not:

```
REFUSED — event <id>: the relay's headers and its body disagree.
```

That is a refusal rather than a warning because it is the one command that can
refute the design.

### Rule 90 — the self-tests were made to fail before they were trusted

18 self-tests. Three mutations of the derivation, all caught:

| mutation | result |
|---|---|
| an unrecognised `lineup_status` falls through to `confirmed` | 16/18 |
| `lineups: null` read as `absent` | 17/18 |
| `served-empty` read as `served` | 16/18 |

The first is the one worth having. If an unrecognised status resolved to
`confirmed`, the renderer would draw a fabrication with a confirmed sheet's
authority — the exact outcome the document is about.

### Coverage, where the result is read

The live run prints `tried N of M <status> event(s) (budget 8)` and one line
per event with its state, its fill, and whether the header agreed. Rule 91: a
capture that tried three of forty events must not read as a survey.

### No schedule

`capture-lineups-fixture.yml` is `workflow_dispatch` only. The document's first
stop condition is pull-only, and a scheduled capture is a watch by another name.

---

## Where the renderer lives

Not a `Stats.Row` case. Three reasons, one of them a landmine:

1. An XI is eleven rows a side plus substitutes. `Row` is a label and a value.
2. `scripts/schedule-live-check.mjs` identifies pitcher rows **by exclusion**
   against a hardcoded list of the other eight labels. A tenth `Row` case whose
   label is not added there would be counted as a pitcher row and then asserted
   against "every pitcher row carries a name" — passing the wrong assertion
   rather than failing.
3. `.st-row` declares three grid tracks and emits two children. A third element
   would land in a track whose layout has never been exercised.

So it is a surface of its own, following the `panel-field-pick` precedent
exactly — its own module, its own fixture when pinned, and a failure that must
not take the slate down:

```fsharp
                let pickUrl =
                    match queryParam "data" with
                    | Some _ -> "./data/pick-2026-07-07.json"
                    | None -> RELAY_PICK + payload.Date
```

`src/Lineups.fs` (the model, the decoder, the treatment) and
`src/LineupsView.fs` (the drawing), with `panel-lineups` and a `Lineups` tab.

---

## Task 2 — the treatment, and the number that is not shown

### An inference of mine that the bytes refuted

Partway through this session I concluded from the relay probe's key-path list
that `confidence` and `ai_score` are present on a confirmed sheet and therefore
cannot distinguish the two states. The captures say the opposite:

| | predicted (220230) | confirmed (5327) |
|---|---|---|
| `lineup_status` | `"predicted"` | `"confirmed"` |
| `beta` | `true` | `false` |
| `confidence` | 0.791 / 0.85 | **`null` / `null`** |
| `ai_score` | 22 of 22 populated, 0.411–0.87 | **0 of 22 populated** |
| `captain` | absent | present |

The key exists and the value is null — Rule 99's four states, and the probe's
`innerKeyPaths` was the copy while the bytes were the source. Four signals agree
on both captures, which is why `disagreements` reports a divergence rather than
resolving one.

It was recorded in a working note and never published. The corollary to Rule 100
is that believing an untested premise costs nothing and publishing it costs a
reader's trust; this one was caught on the near side of that line, by reading
the file instead of the summary of the file.

### The treatment

**A word in each row's own column, twenty-two times a side.**

```fsharp
    let word = child node (el "div" "lu-row__mark" (markWord mark))
```

Not a badge on the card. A legend in a header does not survive being separated
from the card, and a row that is screenshot, quoted, or read aloud on its own
carries no mark at all. With the column, the two sheets differ on every single
line.

The colour is the **redundant** channel — `Semantic.Caution`, the amber this
palette already assigns to "bracket trap / injury", painted from
`Palette.tokenOf` rather than from a hex in the stylesheet. A reader who cannot
distinguish amber reads the same word.

### The numbers are not rendered, and cannot be

```fsharp
type SealedScore = private SealedScore of float
```

`Pick.SealedRank`'s seal, for its reason and one more. The document says
"showing a number without saying what it ranges over is its own defect". The
observed interval can be stated; what the number MEASURES cannot — the vendor
does not say whether 0.87 is a likelihood of starting, a rating of form, or the
model's confidence in its own guess, and a team-sheet reader would take those
three very differently.

There is deliberately no formatter. "Do not print the score" is a compile error,
not a review note. The render check asserts the six observed values are absent
from the panel's text anyway, because that is where a future formatter would
show up.

---

## Task 3 — five non-answers, not three

The document names three: `status-absent`, `served-empty`, `upstream-failed`.
The relay emits **five** `X-Lineup-State` values and **four** `X-Lineup-Fill`
values:

```js
                    const state = (st === undefined || st === null || st === '')
                        ? 'status-absent'
                        : (st === 'predicted' || st === 'confirmed') ? st : `status-unrecognised:${st}`;
```

`status-unrecognised:<word>` is the one the document does not name, and it is
the dangerous one: a renderer built to three falls through on the fourth, and
falling through means drawing the sheet under whichever standing the
fall-through lands on. So `Answer` has **seven** cases, and the reason they are
separate is the inverse of `Desk.Section`'s reason for joining its own:

```fsharp
/// Naming it `EmptyOrFailed` is the honest model. It is deliberately awkward to
/// read, because the ambiguity is real and hiding it behind the word `Empty`
/// would be inventing certainty the payload does not carry.
```

`Section` folds empty and failed together because the wire cannot tell them
apart. The lineups route can — it sends `served-empty` separately from `absent`
separately from `null` — so following the payload means separating them here.
Same principle, opposite outcome, stated rather than copied.

Measured on the rendered page: five routed bodies, five distinct `data-answer`
values, five distinct sentences, and **no grid on the three that carry no
players**. The two that do carry players draw them marked `kind not stated`,
because a sheet whose kind nobody stated is still a sheet.

An eighth path exists and is not one of the seven: a `?xi=` this page cannot
read renders `not-requested`. The `Answer` type models what the vendor said, and
a malformed local parameter is not something the vendor said.

### The check that failed on its own first run

`Suite.fs`'s "NO headline says \"no lineup announced\"" went red immediately,
against the code it was written for. `headline` interpolated the upstream
failure detail into its prose, so a detail carrying that phrase came back out as
the page's own words — through a field the page does not control. The sentences
are fixed text now and the detail is a separate diagnostic line, following
`Pick.passReasonText`:

```fsharp
/// The only renderable form. Fixed text: none of the relay's sentence survives,
/// because there is no way to know which parts of a free-text field are safe.
```

A `lineup_status` is a token rather than a sentence, so `safeToken` keeps the
word and drops everything a word cannot contain — which is what lets the page
name the status it refused instead of saying "unknown".

---

## Task 4 — beside the XI, and a contradiction it exposed

**Beside the XI.** Measured: 2 named players on the predicted capture, 5 on the
confirmed, **7 of 7 carrying a non-null reason** (six injuries, one suspension).
It is the only part of this payload that is a fact in both states — eleven names
are a prediction on one sheet and a team sheet on the other, while an injury is
an injury either way. A reason is also a thing a reader can check against the
row in front of them, which a reason echoed into generated prose is not.

An earlier reading of mine said `unavailable_players` was absent on finished
events. It is not: the relay probe computes that figure from pre-match bodies
only (`if (s.state === 'pre-match' && r.ok) bodiesPre.push(r.body)`), and the
finished run had no pre-match events, so the zero was an empty denominator. The
probe's own note said so — "UNMEASURED, not zero" — and it was read as a claim
about finished events. Corrected before anything was built on it.

### What rendering it beside the XI revealed

```
CONTRADICTION home: Idan Toklomati is in the STARTING XI and listed injured (Knee Injury)
```

On a **confirmed** sheet — the kind this page tells the reader is the names as
submitted. Both halves drew, side by side, and the page said nothing. A reader
who scans the eleven and then the injury list has to notice the repetition
themselves.

So `disagreements` now reports it, for any answer that carries sides rather than
only for a stated standing, and the panel prints it above the sheets:

> **THE PAYLOAD DISAGREES WITH ITSELF**
> Idan Toklomati is named on Charlotte FC's sheet AND listed unavailable

Reported, never resolved. Which half is wrong is the vendor's question, and
dropping either one would be this page answering it.

---

## Done conditions

### 1. One owner, named, with the reason beside the code

field-laboratory. The reason is the header of `src/Lineups.fs`, not this
document — a reason in an outbox is a reason the next reader of the code does
not have.

### 2. A predicted XI is visually distinguishable from a confirmed one, in a committed screenshot of each

`outbox/lineups-predicted.png` and `outbox/lineups-confirmed.png`, both rendered
from captured bytes with nothing intercepted.

Two screenshots that happen to differ prove nothing unless the thing that
differs is the treatment, so the check asserts the comparison rather than two
separate passes:

```
PASS  DONE CONDITION 2 — the two sheets carry DIFFERENT mark words on every row
PASS  ...and different painted colours, as the redundant channel
PASS  ...and different headlines
```

| | predicted | confirmed |
|---|---|---|
| rows drawn | 46 | 40 |
| rows carrying a mark | 46 | 40 |
| distinct mark words | `["predicted"]` | `["confirmed"]` |
| painted colour | `rgb(245, 158, 11)` | `rgb(106, 106, 138)` |
| teams | Boyacá Chicó FC, Cúcuta Deportivo | Charlotte FC, FC Dallas |
| unavailable named / with a reason | 2 / 2 | 5 / 5 |
| disagreements reported | 0 | 1 |

The counts come from `outbox/lineups-render-manifest.json`, which carries
booleans rather than prose — `everyRowMarked`, `gridDrawn`, `oneMarkWordOnly`.

### 3. The non-answers render as different things, each stated

Five, not three.

| routed body | `data-answer` | grid drawn |
|---|---|---|
| `{"lineups":{}}` | `served-empty` | no |
| no `lineups` key | `not-in-payload` | no |
| `{"lineups":null}` | `explicitly-null` | no |
| players, no `lineup_status` | `kind-not-stated` | yes, marked *kind not stated* |
| players, `lineup_status:"probable"` | `kind-unrecognised` | yes, marked *kind not stated* |

plus `upstream-failed`, which needs a failing relay and is asserted in the F#
suite over a body that will not decode, and `not-requested`, which is this
page's own refusal and not one of the vendor's seven.

```
PASS  DONE CONDITION 3 — the five non-answers render as FIVE distinct data-answer values
PASS  ...and five distinct sentences
PASS  ...and none of the five is the predicted sheet's sentence
```

### 4. No cron, no watch, no diff-on-change anywhere in the diff

True of this diff, and — because that is a property of one diff and nothing
enforces it a week later — `scripts/check-lineups-pull-only.mjs` holds it
afterwards. It scans `src/Lineups.fs`, `src/LineupsView.fs`, `Program.fs`'s
lineups section between two named markers, and the capture workflow, for timers,
sockets, visibility listeners and schedule blocks.

It prints its own denominator, because a green line must not read as "nothing
anywhere polls this":

```
  scanned 4 of 4 lineups source region(s):
    src/Lineups.fs, src/LineupsView.fs, src/Program.fs (sliced), .github/workflows/capture-lineups-fixture.yml
  NOT scanned: build/ and public/ (compiled copies), and any timer a
               called library arms on its own.
```

A missing marker is a FAILURE rather than a pass over an empty string — the
`beforeFetch` lesson from the golf session, where a scan that found nothing read
as a scan that found nothing wrong.

---

## Rule 90 — what the mutations found

Five mutations added to `scripts/mutation-check.mjs`. Each is a change that
leaves a page which looks right.

| mutation | what it does | caught by |
|---|---|---|
| `lineups-polls` | `setInterval` re-renders the panel every minute | `check-lineups-pull-only` |
| `lineups-capture-scheduled` | a `*/15` cron on the capture workflow | `check-lineups-pull-only` |
| `lineups-unrecognised-falls-through` | an unseen `lineup_status` resolves to `predicted` | the F# suite |
| `lineups-empty-is-absent` | `served-empty` folded into `not-in-payload` | the F# suite |
| `lineups-mark-says-one-thing` | `markWord Announced` returns `"predicted"` | **survived, first run** |

### The one that survived

`lineups-mark-says-one-thing` passed every check in the F# suite. The two checks
written for exactly this invariant were:

```fsharp
      Verify.check "a predicted sheet and a confirmed one carry DIFFERENT row marks"
          (fun (a: Lineups.Answer, b: Lineups.Answer) ->
              match Lineups.markFor a, Lineups.markFor b with
              | Some x, Some y -> x <> y
```

`x <> y` compares `RowMark` **cases**. `markWord` prints **words**. Changing the
word left `Unannounced <> Announced` true, so both checks stayed green while
every row of a confirmed team sheet rendered the word `predicted` — which is
this feature's commissioning document in one line, reached through the one layer
its own checks were not looking at.

It is the second time in this session a check of mine turned out to be asserting
the right thing one level away from where the defect lives. The first was the
headline interpolating an upstream string, caught on the check's first run. Both
were found by making the code wrong on purpose; neither was found by reading.

Three checks added — the three marks print three distinct words, a predicted
sheet's word is not a confirmed sheet's, and the two resolve to different palette
tokens — and the mutation is now caught. 5 of 5.

---

## What is NOT covered, stated rather than left to be inferred

- **`upstream-failed` is never exercised against a real failing relay.** It is
  asserted in the F# suite over a body that will not decode, and in the view by
  a fetch that throws. A relay that 502s has not been observed by this page.
- **The non-answers are routed, not captured.** The vendor does not serve them
  on request, so five of the seven cases rest on synthetic bodies through the
  same decoder the live path uses. That is weaker evidence than the two
  captures, and `data/PROVENANCE.md` says so in each fixture's own entry.
- **`check-lineups-pull-only` reads source, not `build/`.** It cannot see a
  timer a called library arms on its own. Its printed coverage says so.
- **One confirmed sheet, one predicted sheet.** Two events on one afternoon.
  `confidence` and `ai_score` being null on a confirmed sheet is 2 sides and 22
  players of evidence, not a survey of the vendor's policy.
- **`captain` is present on the confirmed capture and absent on the predicted
  one.** Observed, not used, and not modelled — a fourth signal nobody needs
  while three agree.

---

## Two defects the repo's own checks caught before the push

Both were in the parts of the diff that are not F#, which is where this session
had the least help from the compiler.

**`--font-data` does not exist.** The stylesheet asked for
`font-family: var(--font-data)` twice — for the shirt-and-position cell and the
formation. `build-site.mjs` emits exactly four font tokens and that is not one of
them:

```
  --font-identity:${identityFont};--font-body:${bodyFont};--font-score:${scoreFont};
```

`check:computed-chrome` reads the rendered page rather than the source and said
so in the terms that matter: *"var() with no declaration resolves to nothing,
silently"*. Both are `--font-identity` now, which is the token `.dv-side__score`
already uses for a tabular number.

A source-level check could not have found this. Only the browser knows a custom
property resolved to nothing.

**The tab registry is named, not counted.** `tab-check.mjs` and
`live-tabs-check.mjs` each carry an explicit list, and a new tab is a failure
until it is added to both. `live-tabs-check.mjs` records why the list is named:

```
// Named, not counted. `live-tabs-check.mjs` records why: a bare count said
// "six" long after the Briefs tab made it seven, and stayed red without saying
// WHICH tab was unaccounted for.
```

Added in position, between Stats and Briefs, which also fixed the two ArrowRight
assertions that walk the list in order.

---

## The red CI run, and why a green re-run did not close it

`verify` run `38155172428` went red on step 32, **The Verify panel shows the
counterexample that gives each row teeth**, and every step after it was skipped —
including all three lineups steps, which therefore never ran in CI on that
attempt.

Six assertions failed at once, all of the same shape:

```
every row sits in a group — none is orphaned outside one
    191 rows inside groups, 3 rows on the page
the page reports the same total the node suite does
    data-total="191", node says 3
every check DECLARED in the suite source reaches the page
    src/Suite.fs declares 191 checks; 3 ran.
```

The page was right. The **node count** was wrong.

`nodeSuiteCount()` runs `node build/VerifyMain.js` through `execSync` and takes
the LAST `N/N checks held` line, because `VerifyMain` prints two — phase 1's
deliberate 1/3 counting probe and phase 2's real total. On that run everything
after line 18 was missing, so the last line *was* the probe's.

### Reproduced before anything was changed

```
--- via execSync, 5 times:
2 191
2 191
1 3      <- 13146 bytes of output, tail lost
2 191
2 191
```

`process.exit()` terminates immediately and drops pending asynchronous stdout
writes. To a terminal or a file Node's stdout is synchronous and nothing is
lost; to a PIPE it is not. `src/VerifyMain.fs` now sets `process.exitCode` and
lets Node drain and exit with the same status — 40 of 40 runs clean, and the
`lineups-unrecognised-falls-through` mutation still catches a broken suite,
which is the proof the gate did not go soft.

### The re-run

Attempt 2 passed. That is corroboration, not the reason to move on: a green
re-run of a race says nothing about whether the race exists, and this one was
measured at roughly one in five before the fix. The repository's own rule is
that "flake" is not a root cause — a re-run confirms an unrelated failure, it
does not explain one.

The second failing step, **Weather against the LIVE Open-Meteo API**, reported
`request failed — fetch failed` on all four venues and is a genuine external
outage. It passed on the re-run and nothing in this diff touches it.

### And the general case, which is bigger and is not this document's

Every script in `scripts/` ends `process.exit(summarize() === 0 ? 0 : 1)`, and
`summarize()` prints the `::error` annotations immediately before it. Measured,
400 passing rows and one failing, through `execSync`, 30 runs:

```
runs where the ::error annotation was LOST: 5 of 30
```

That is the channel `checks.mjs` exists to protect — its header says a job log
is unreachable from this sandbox and annotations are the only machine-readable
substitute. Roughly one failing check in six currently publishes nothing, and a
red step with no annotation looks exactly like a red step whose script emitted
none.

Filed as `docs/CC-CMD-2026-10-11-process-exit-drops-the-annotation.md` rather
than fixed here: it changes the exit behaviour of 136 scripts, which needs its
own impact analysis and its own mutation. Rule 87.4 — a second document, not a
carry-forward.
