# Pick'em — the one that was actually meant — 2026-08-10

I built the wrong pick. Asked to "bring pick 'em to laboratory", I read it as
FIELD's editorial picks and built **Field's Pick** and **Scout's Pick**. Jeff
sent the production screen: Pick'em is the **viewer's own picks**, one side per
game, with sport chips and PENDING status.

Those two are staying — they are real features and the seal work stands — but
this is the one that was asked for. The page now has four tabs and three
different things called "pick", so each panel says which it is:

| | Whose opinion | Output |
| --- | --- | --- |
| Field's Pick | FIELD's | one ranked winner |
| Scout's Pick | FIELD's | one hidden-gem qualifier |
| **Pick'em** | **yours** | one side per game |

## Read from the screen, not copied from it

The screenshot is the only evidence — no capture in this repo holds a picks
route. Three things in it are treated as findings.

### 1. The two numbers

Chips read MLB 10, WNBA 2, EFL Cup 1, MLS 5 — eighteen. The banner says
*"12 of your real picks still pending or live."* Both numbers are correct and
they count different populations: games on the slate versus picks actually made.
Nothing on screen says which is which.

Here both come from one `Summary`, and a legend states it outright: *"Chips
count games in each sport (7 total). The line above counts picks (0)."* The
banner is also derived, never written — `summaryLine` builds the sentence from
the same counts the rows render, so it cannot contradict them.

The banner deliberately counts the **whole slate**, not the selected sport.
Scoping it to the active chip would make "your picks" change as you browse. The
check asserts that.

### 2. "still pending or live" is three states, not two

The production sentence distinguishes pending from live, so a pick on a game in
progress is not the same as a pick on one that has not started. `PickStatus` has
five cases: `NotPicked`, `Pending`, `Live`, `Undecidable`, `Decided`.

`Undecidable` is the draw. MLS and EFL Cup are both on that slate, and forcing a
draw into a correct/wrong boolean would silently grade every drawn game as a
loss.

### 3. The row that wraps

On the production screen, **Rockies @ Diamondbacks** pushes its PENDING chip
onto a second line while every other row keeps it inline. Two long names overflow
and the chip is what gives way.

The rows here are a CSS grid with fixed tracks, so the chip has its own column
and the matchup cell is the one that shrinks (and truncates). The check measures
it on the exact fixture that breaks in production: every row's chip must sit on
the same visual centre-line as its matchup, within 3px.

## The invariant worth the type system

The production banner says "No picks decided yet", so decidedness is a claim
about a real outcome. The failure mode is grading from a score that is still
moving — a game leading 3–1 in the sixth is not a win, and
`if (pick === leader) 'CORRECT'` cannot tell the difference.

```fsharp
type Verdict = private Verdict of correct: bool

let decide (state: GameState) (side: Side) : Verdict option =
    match state with
    | Final(home, away, _) -> if home = away then None else Some(...)
    | Scheduled -> None
    | InProgress _ -> None
```

The case is private and `decide` is the only source, so `Decided` cannot be
constructed without a `Final`. Same shape as `AmnestyZone`, same reason: the
rule is about which state you are in, and a witness type makes that unforgeable.

Asserted at runtime too — the check picks a side on a game that is 3–1 **and
still in progress**, and requires the chip to read LIVE. Type and behaviour, not
one standing in for the other.

## Two bugs the checks found

**The buttons were transposed against the label.** The label read
"Rockies @ Diamondbacks" while the left button was Diamondbacks — I re-derived
the order with my own `if` instead of using `orderByMatchup`.

That is exactly the failure that function's own comment was written about:

> Fixing the matchup text alone produced `Sydney v Collingwood 75–81` where 75
> was Collingwood's — names in one order, numbers in the other. Internally
> consistent before the fix and transposed after it, which is worse than either.

Third time this repo has hit it, from a third direction. Fixed by passing the
side *along with* the name through `orderByMatchup`, so label and controls come
from one call. Anything ordered beside a matchup has to come from that function,
not from a rule that happens to agree with it today.

**The first test fixture was the wrong shape.** I keyed `games` by sport; the
real payload keys it `regular`/`postseason` with the sport on each game. It
decoded to zero games and the panel rendered "0 game(s) on the slate" — no
error, no warning, a perfectly plausible empty page. Recorded because that is
this project's signature failure: three blank artifacts shipped on the strength
of everything upstream looking healthy.

## Honest limits

**Picks are stored in localStorage, keyed by date.** The production screen says
"your real picks", which implies server persistence; this is not that. No
capture in this repo carries a picks route, and inventing a server shape would
be fiction. The type work above is what the laboratory is testing, and it does
not depend on where the picks live.

**Storage is flat `gameId=side` pairs, not JSON.** A corrupt blob would take
every pick with it; a malformed pair loses one. Unreadable entries are dropped
rather than guessed — a pick that cannot be read is not a pick for the other
side.

**Sport chips are a tablist but not yet arrow-key navigable.** The top-level
tabs are; these carry `role`, `aria-selected` and a roving `tabindex`, and
respond to clicks only. Stated rather than left to be discovered.

## Verification

| | |
| --- | --- |
| `check:pickem` — chips, grading, layout, persistence, placeholder zeroes | 22/22 |
| `check:tabs` — four tabs, score still absent | 20/20 |
| build warnings | zero |
| confidence gate | 180/180, 14 rows |

### A third bug the gate caught

`tabs work and the pick score never renders` failed at **0/15**, taking the gate
to 92/100 and refusing the commit.

Pick'em's sport chips are themselves a tablist, so `tab-check.mjs`'s bare
`[role="tab"]` selector matched both lists at once — five tabs, two selected.
Nesting a tablist inside a tabpanel is legitimate; querying across them without
scoping is not. The selectors are now anchored to `.tabs`, and the keyboard
assertions extended for the fourth tab.

That is the third time today the gate has blocked a commit, and the second time
the cause was a check whose assumptions a new feature invalidated rather than a
bug in the feature itself.

---

## What field-playground's PickEm probe says about this one

Jeff sent a Playground session's audit of `field-playground`'s PickEm — a fourth
codebase with the same feature. Two of its four findings land directly on
laboratory, and they land differently.

### #1 Draws graded as away wins — laboratory already refuses this

```js
const winner = game.home_score > game.away_score ? 'home' : 'away'
```

No tie branch. 2–2 evaluates false and grades as `'away'`, so on every drawn
match a home pick is marked **incorrect** and an away pick **correct**, with no
indication anything is off. The probe notes soccer is in scope and MLS was
11–14 rows/day in the measured window, so it is producing wrong grades now, and
the "You're 7-3 (70%)" line inherits the error.

Laboratory's `decide` returns `None` for `home = away`, which surfaces as
`Undecidable` and renders DRAWN, and `pickem-check.mjs` asserts it on a 1–1 MLS
fixture. That was written before this probe arrived — the reasoning in
`Pickem.fs` says "forcing it into a boolean would silently grade every drawn
game as a loss", which is the same conclusion reached from the type rather than
from the incident.

Worth being precise about what that does and does not show. It is one case, the
draw is obvious once you are enumerating a union's cases, and a JS author
writing a tie branch would be equally correct. What the union changes is that
the case has to be *considered*, because `Verdict option` has nowhere to put a
draw except `None`.

### #4 Status from a null-check — laboratory had the same bug, latent

```js
function gameStatus(g) {
  if (g.home_score === null) return 'pre'
```

The probe's point: the CFL route writes `0` for all 47 unplayed fixtures, so if
CFL is ever archived from it, every unstarted CFL game returns `'live'` and
`disabled={gameStatus(g()) !== 'pre'}` **greys out both pick buttons on games
that have not kicked off**, with no explanation.

Laboratory had the same shape written the other way round:

```fsharp
match g.HomeScore, g.AwayScore with
| Some h, Some a -> ... InProgress(h, a)
| _ -> Scheduled
```

Score presence standing in for status. No route in either committed capture
writes placeholder zeroes, so it was latent rather than live — and latent is
exactly the state in which it is cheap to fix.

**Fixed**, using that probe's own recommendation — *"gate on status, never on a
score being present"*. `notYetStarted` reads `start_time`, the only status
signal this payload carries, and a game with scores that has not kicked off is
`Scheduled`. An absent `start_time` returns false rather than guessing: an
unknown kickoff is not evidence a game has not begun.

`pickem-check.mjs` now carries a 0–0 fixture with a start time in 2099 and
asserts it reads PENDING, not LIVE.

That fix immediately broke three of my own assertions, which is the useful part:
my in-progress fixture had a start time in the future, so under the new rule it
correctly became Scheduled. The fixture was wrong, not the rule. Corrected by
pinning that game's kickoff to a past instant.

### #3 Half the real game-id formats silently dropped

`parseGameId` requires `^YYYY-MM-DD-<lowercase>`, and three of four real relay
id formats fail it — dropped from the streak, dropped from "this week", and
`setOutcome` stores `date: null`. No error, no zero-state, just a shorter streak
than reality.

Not applicable here: laboratory never parses a game id. `Map<string, Side>` uses
it as an opaque key. Recorded because "we avoid this by not doing it" is a real
answer only while nothing starts doing it — an id parser added later inherits
the whole problem.

### #2 Brier score measures hindsight

Confidence is captured *after* the outcome, with the result rendered beside the
slider, so the number measures self-report discipline rather than forecasting
skill. No equivalent in laboratory — there is no confidence capture here at all.

The probe's own framing is worth keeping: the mechanism is a reasonable
engineering call, and *"what's wrong is the claim on top of it: a headline number
named for something it doesn't measure."* That is the same failure this repo
spent the earlier part of today correcting three times in its own prose.

### The count

Four codebases now have a pick feature: `jubilant-bassoon`, the relay,
`field-playground`, and this one. Of the playground's four findings, laboratory
was already right about one, had one latent and has now fixed it, and is
structurally out of range of the other two. That is a better result than
guessing, and it is one sample.
