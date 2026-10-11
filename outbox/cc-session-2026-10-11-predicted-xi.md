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
