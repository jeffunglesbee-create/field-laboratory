# "(no card / no kind)" was two failures wearing one string

**Date:** 2026-08-31
**Scope:** `scripts/brief-phase-live-check.mjs`

`live-check` has been RED since `af7483d`, and I did not notice for two commits.
I checked CI after `e3ec02e`, saw green, and did not re-check after the next two
pushes. `deploy`, `verify` and `guards` were green throughout, so the run list
read as healthy at a glance.

```
FAIL  every final game with both phases shows its after-play brief (36 testable)
      → Dallas @ St. Louis: expected game_recap, shown (no card / no kind)
```

35 of 36 pass. One row fails, and **the message cannot say why.**

## The collapse, in a check written to catch collapses

`(no card / no kind)` is one string for two different failures:

- **the desk did not render that game** — a bug in the app
- **the desk rendered it and this matcher did not find it** — a bug in this file

Opposite fixes. The run reported neither, and I could not tell them apart from
the log. That is the sixth instance of this shape this session, and this time it
is in a check I wrote three days ago specifically to test a rendering claim
end-to-end.

## Split, with the row carrying its own evidence

Three states now:

```
(card found, NO KIND rendered)
(NO EXACT MATCH; page has: "…", "…")
(NOT RENDERED — no card on the page shares a word with either team)
```

When nothing matches exactly, the row prints the closest team lines the page
actually rendered. The next run diagnoses itself without anyone opening a
browser.

**The verdict still uses exact substring matching.** Loosening it would make the
check agree with the page more often without anyone learning why it disagreed,
which is how a red turns into a shrug. Normalisation is for the diagnostic only.

## A second finding, counted and not asserted on

The 2026-08-30 payload carried the same fixture **twice**, under two naming
conventions:

```
Lynx @ Dream                          game_recap    game_recap
Minnesota Lynx @ Atlanta Dream        game_recap    game_recap
Sparks @ Storm                        game_recap    game_recap
Los Angeles Sparks @ Seattle Storm    game_recap    game_recap
```

47 games, 281 briefs, 47 cards — and four of the 36 testable rows are two
fixtures counted twice. A duplicate inflates the population and lets one card
satisfy two rows.

That is relay-side, not this repo's bug, so it is **counted and printed, never
asserted on**. Failing here for the relay's naming would be the same mistake as
failing a sibling repo for installing a skill.

## What is not being done

I am not guessing the fix for `Dallas @ St. Louis`. The sandbox cannot reach
`*.workers.dev`, so the payload is not readable from here, and choosing between
"MLS is not rendered" and "my matcher misses `FC Dallas` / `St. Louis City`" by
plausibility is the rationalisation Rule 77 forbids. The next `live-check` run
prints which it is.

## Verified

```
node scripts/brief-phase-live-check.mjs --self-test   11/11
npm run check:import-purity                            2/2
```

Five of those eleven are new, on the helpers the diagnostic uses — including
that `FC` is not a token, because a two-letter token would make every club match
every club and print confident nonsense as the nearest card.

---

## Round two: the split answered it, and eliminated both hypotheses

Run `33354621508`, on the deployed `8b647bd`:

```
Dallas @ St. Louis: expected game_recap, shown (card found, NO KIND rendered)
```

Not "the desk did not render it" and not "this matcher missed the card."
**Both are wrong.** The desk renders the game, this file finds its card, and the
card carries no brief — while the payload carries a `game_recap` that
`expectedKind` resolved to that same game.

So the divergence is between **two implementations of one rule**: this file's
`briefMatches`, transcribed independently, and `briefKeyMatches` in
`src/Desk.fs`. That is exactly what this check's own header says it exists to
catch:

> the expectation is written independently and a divergence between the two is a
> real finding.

The duplicate-fixture note also fired, confirming the second observation:

```
NOTE: 2 fixture(s) appear more than once in the payload under
different naming conventions: lynx|dream x2, sparks|storm x2
```

## Reading the two matchers side by side did not find it

They look equivalent. The `espn:` prefix strip is the same operation in both.
`usable = briefs |> List.filter hasText` is the same non-empty-text filter this
file applies. Nothing in either explains a brief that resolves here and not
there.

Continuing to read source until a difference appears is the guessing Rule 77
forbids, and the sandbox cannot reach `*.workers.dev` to look at the payload.

## So the row prints the keys instead

On any failing row: `game.id`, `espn_event_id`, `finalized_at`, `sport`, every
brief this file resolved to that game with its `game_id` and type, and the
card's own `teams` / `status` / `kind`.

One `live-check` run returns the keys both sides are matching on. That is the
third round of the same discipline — narrow the state, print the evidence, do
not name a cause the data has not named.

---

## Round three: the evidence named it, and the bug was mine

Run `33354964345`:

```
evidence: game.id="MLS_2026-08-30_stlouis_dallas" espn_event_id="761769"
          finalized_at="2026-08-31 01:15:29" sport="MLS"
          brief game_id="761769" type="game_live"  text=268ch
          brief game_id="761769" type="game_recap" text=276ch
          brief game_id="761769" type="pre_game"   text=276ch
          card teams="St. Louis CITY SC v FC Dallas"
               status="Scheduled — no start time" kind=null
```

The payload game is **final** — `finalized_at` set, three briefs including the
recap. The card matched is **"Scheduled — no start time"** with no brief.

They are not the same row. The payload carries this fixture **twice**: once
finalized and once as an unplayed stub. `cards.find` took the first, which was
the stub, and reported `NO KIND rendered` — a phrase that reads as a rendering
defect in the desk.

**The desk is right.** It rendered both rows the relay served. Taking the first
of two and calling it "the" card is this file's bug.

## Both cards say the same thing

```
"St. Louis CITY SC v FC Dallas"
```

So matching on **both** team names instead of either would not have separated
them. There is no name-based matcher that distinguishes two cards for one
fixture. The honest handling is to stop pretending there is one card:

```
(AMBIGUOUS — 2 cards match: "Scheduled — no start time"/null "FT"/"game_recap")
```

`filter`, not `find`. Zero, one, and many are three different answers.

## The duplicate detector missed this one

The name key took the last significant word of each side — `Dallas @ St. Louis`
became `dallas|louis`, and `FC Dallas @ St. Louis CITY SC` became `dallas|sc`.
Two keys, one fixture, no note. It caught the WNBA pair only because both of
those spellings end on the same word.

Now keyed on `espn_event_id` where present, falling back to names. An event id
names a fixture exactly and needs no naming convention to agree with itself. The
note also says which side is final, because *that* is the interesting part here:

```
espn:761769 → Dallas @ St. Louis (final) | FC Dallas @ St. Louis CITY SC (not final)
```

## Three rounds, three wrong answers, and none of them guessed

| round | reported | what it ruled out |
|---|---|---|
| 1 | `(no card / no kind)` | nothing — two failures, one string |
| 2 | `(card found, NO KIND rendered)` | the desk renders it; the matcher finds it |
| 3 | the keys themselves | the desk is innocent; `find` picked a stub |

Each round narrowed the state and printed evidence rather than naming a cause.
Round two's conclusion — "the divergence is between `briefMatches` and
`briefKeyMatches`" — was **wrong**, and reading those two functions side by side
correctly found no difference, because there isn't one.

Had I trusted that reading and started editing `Desk.fs`, I would have changed
correct F# to accommodate a JavaScript `find`.

---

## Round four: my AMBIGUOUS state failed the rule holding twice

Run `33355284626`, four failures:

```
Lynx @ Dream:          2 cards: "Final"/"game_recap"  "Final"/"game_recap"
Sparks @ Storm:        2 cards: "Final"/"game_recap"  "Final"/"game_recap"
Athletic @ Celta Vigo: 2 cards: "Final"/"game_recap"  "Final"/"game_recap"
Dallas @ St. Louis:    2 cards: "Scheduled — no start time"/null  "Final"/"game_recap"
```

**Three of the four are the rule holding twice.** Both cards final, both showing
the recap. I failed them for being duplicated.

The fourth pairs a correct `Final`/`game_recap` card with the unplayed stub — so
even there, the recap did reach a card.

The previous round replaced `find` with `filter`, which was right, and then
treated *any* multiplicity as a failure, which was not. Fixing a collapse by
adding a state is only progress if the new state means something.

## The contract was five lines from the top of the file

```
FAIL  a card shows a during-play kind while an after-play brief for that
      same game exists in the payload.
```

That is the only failure this check defines. Two cards agreeing on `game_recap`
is not it. A stub with no brief is not it.

`verdictForCards(matching, want, duringPlay)` now applies exactly that:

- any matching card showing a **during-play kind** → FAIL
- no matching card carrying the expected kind at all → FAIL (a recap that
  reached no card is a real miss)
- otherwise PASS, and the row says `game_recap (2 cards, duplicated upstream)`
  so the duplication stays visible

Duplication is reported, never failed on. It is the relay's to fix, and the NOTE
block names each instance with its event id:

```
espn:401857186 → Lynx @ Dream (final) | Minnesota Lynx @ Atlanta Dream (final)
espn:401857187 → Sparks @ Storm (final) | Los Angeles Sparks @ Seattle Storm (final)
```

## Not tuning toward green

The distinction matters because relaxing a check to make it pass is the failure
mode this whole session has been about. Three things keep it honest:

1. The relaxation is **transcribed from the file's own stated contract**, written
   before any of these failures existed — not derived from what would make
   today's slate pass.
2. The defined failure is fixture-pinned and mutation-proven:
   ```
   during-play detection removed  →  18/19
   "no card carries want" removed →  18/19
   restored                       →  19/19
   ```
3. `...and it fails even when a correct card sits beside it` exists specifically
   so one right card cannot launder a wrong one. It is the only fixture that
   discriminates: with a single card, either guard catches the failure, so the
   pair is what proves the first guard is doing work.

## Eight fixtures, every one a row from the real slate

None of them invented. Lynx/Sparks/Athletic supply the two-correct-cards case,
Dallas supplies the stub case, and the during-play cases come from the bug this
check was written for in the first place.

---

## Round five: the red moved twice, and neither move was the brief rule

Re-ran `33356339613`. Two more failures, and both were mine to fix — neither was
the thing the check exists to test.

### The build crashed, and it was a genuine flake

Attempt 1 died in the F# compiler:

```
Object reference not set to an instance of an object.
  at FSharp.Compiler.NicePrint.stringOfMethInfo
  at FSharp.Compiler.CompilerDiagnostics.overloadMethodInfo
  at FSharp.Compiler.CompilerDiagnostics.formatOverloads
```

The compiler crashed *formatting* an overload-resolution diagnostic. Ruled out
as a source error before re-running, not after:

- `git diff e08c8e1..44e82a9 -- 'src/*.fs' '*.fsproj'` is **empty** — the only
  changes were `STATUS.md`, `outbox/`, and one `.mjs`.
- Fable is pinned at `5.13.0` with `rollForward: false`.
- `verify` builds the same source with the same command on the **same commit**
  and its build step reads `success`.

Identical source, identical pinned toolchain, same commit, opposite results in
two jobs. That is the one case the rules allow a re-run for, and attempt 2's
build passed.

### I misread my own re-run

I first reported "failed again on attempt 2 — reproduces, so it's real." Wrong.
The *run* failed again; the *build* succeeded. I conflated the two, which is the
same error as reading `$?` after a pipe and getting `tail`'s status — an
instrument pointed at the wrong thing, twice in one session.

### The real attempt-2 failure: an empty slate read as a crash

```
page.waitForSelector: Timeout 30000ms exceeded.
  waiting for locator('.desk-card') to be visible
```

04:26 UTC is **00:26 in FIELD's zone** — twenty-six minutes into a new day with
nothing on it yet. The page was fine. It had no games to draw.

Left alone, that is a red every night between midnight ET and the first fixture,
on a check whose own header already defines a state for "the rule could not be
exercised". A nightly red nobody can act on is how a check gets ignored and then
disabled.

The wait still happens, so a slow or broken page cannot masquerade as an empty
slate. The timeout is caught, and the two are separated by evidence the page
already produces: `#viewed-date` is written after the app decodes a payload, so
a page that reports its own date **loaded, ran, and rendered**. Zero cards on top
of that is a day with no games.

```
NOT OBSERVABLE — the deployed page reports 2026-08-31 and rendered 0 cards.
The page loaded and knows its own date, so this is an empty slate, not a
broken deploy.
```

`::warning::`, exit 0. The same three-state discipline the header already
described, applied one level earlier than it was written for.

---

## The daily beat was scheduled where the rule cannot run

`live-check`'s schedule was `37 6 * * *` — **06:37 UTC, which is 02:37 in
FIELD's zone.** The page renders the current ET day, and at 02:37 that day is
two and a half hours old with nothing on it.

So every scheduled run met an empty slate. Until this morning that surfaced as a
raw `TimeoutError`; with the fix above it is correctly reported NOT OBSERVABLE.
Both are honest and both mean the same thing: **the brief-phase rule,
live-grouping and the schedule-row checks were never exercised by the schedule.**
Only deploys ever tested them, which makes the daily beat a run that proves the
site is up and nothing else.

Moved to `37 3 * * *` — 23:37 EDT, 22:37 EST. Evening ET in both halves of the
year, with the day's early fixtures final and carrying recaps. That is the state
these checks are written for.

**Same one run a day.** The cost is identical; the coverage is not.

### Why this is the follow-up, not a new idea

The previous entry ended with a carry-forward: *"the brief-phase verdict fix
still hasn't been exercised against a populated slate — it'll get its first real
test when today's fixtures land."* That sentence puts a human in the loop to
remember to look. Moving the schedule into a populated window is the same
outcome with nobody remembering anything.

---

## Round six: the same empty slate, one panel further along

With the empty-slate state in place, the brief-phase step **passed** and the red
moved to step 13:

```
FAIL  the Scout's Pick panel reports gates
      → panel said: Scout's Pick … No game qualifies from this p…
```

`src/PickView.fs` has exactly two branches:

```fsharp
match games with
| [] -> ()
| first :: _ ->
    child panel (el "h3" "pick-panel__what" (sprintf "Gates — %s" …))
    for gate in gatesFor first seriesEntries do …
```

**On an empty slate no gate is rendered at all** — not by accident, by
construction. The panel prints its `pick-empty` paragraph instead. So
`/Gate /.test(scoutText)` was unsatisfiable between midnight ET and the first
fixture, and it went red for a panel behaving exactly as written.

### Its two siblings in the same file already model this

```js
check('the Field\'s Pick panel is in a stated state, not blank',
  /No pick section|Passed on tonight|Also ranked|level with/i.test(fieldText) || …)

check('the Pick\'em legend explains its two numbers',
  /Chips count games/.test(pickemText) || /No games on this slate/.test(pickemText))
```

Field's Pick accepts `No pick section`. Pick'em accepts `No games on this slate`.
Scout's Pick accepted nothing. It was the odd assertion out, not a considered
stricter contract.

Now: gates, **or** the panel's own stated reason there are none — transcribed
from `src/PickView.fs:136` rather than from the truncated run log. A blank panel
still fails, which is the failure shape this project actually records.

## Six rounds, one slate, and the check never moved toward green

Each round the red moved forward a step and each cause was different:

| round | red | cause |
|---|---|---|
| 1–3 | brief phase | `find` took a duplicate stub |
| 4 | brief phase | AMBIGUOUS failed the rule holding twice |
| 5 | page load | empty slate thrown as a TimeoutError |
| 6 | pick tabs | an assertion with no empty-slate branch |

Rounds 1–4 were bugs in a check. Rounds 5–6 are the same root fact — **a slate
with no games** — meeting two different assertions that had never seen one,
because the daily beat ran at 02:37 ET and every other run came from a deploy.

Moving that beat to 23:37 ET is what stops this class arriving one panel at a
time.
