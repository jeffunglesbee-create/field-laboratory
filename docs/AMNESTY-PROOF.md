# The amnesty gate: a compliance boundary the compiler enforces

FIELD's ADR-002 classifies **"raw composite drama number displayed to user"** as
a bright-line violation, severity **CRITICAL** — explicitly including values
computed client-side, because the number itself *is* the interest level the RUWT
patents claim (US 9,421,446 B2 and continuations).

Defense 4, the Amnesty Zone, is what permits displaying it at all: post-game
content is outside the patent scope. The amnesty CC-CMD states the required
shape precisely:

> Any function that displays the raw arc number must be a dedicated function
> with **no live-state call site**, not a shared live+post function with a
> runtime conditional.

In JavaScript that is a review obligation. It is upheld by a design doc, a
manual `call-graph.js` run, and an outbox note asking the next session to
re-check. Production's own audit record says how well that works:

> string-search RUWT audits are not reliable, only reading the actual
> composite-value flow into DOM catches this class of bug.

Production has had to walk this back at least four separate times:
`renderAmbientPanel`'s `FIRE ${tier}`, `updatePinWidget`'s threshold icon,
`getOTWMomentum`'s drama delta, and `_otwGetLiveTier`'s T3/T4 tier *selection* —
the last of which survived an earlier fix that was display-only and was recorded
as "RESOLVED" at the time.

A data flow cannot be grepped. It can be typed.

## What this laboratory got wrong first

Before the gate, `src/Scoreboard.fs` had this, called unconditionally for every
card at every state:

```fsharp
let private dramaText (g: Game) =
    match g.DramaArc with
    | Decoded arc ->
        let peak = match g.DramaPeak with
                   | Some p -> formatDrama p
                   | None -> "?"
        sprintf "arc %d pts, peak %s" (List.length arc) peak
```

`formatDrama` took a bare `float<drama>` and returned a string. Any call site
anywhere could render the number. Nothing consulted `GameState`.

In the committed captures every game is already Final, so the rendered output
happened to sit inside the amnesty zone — by accident of the data, not by
construction. A live game carrying a `drama_arc` would have rendered its peak.

The unit of measure did not help here, and was never going to: `[<Measure>]
type drama` stops a drama score being confused with a probability. *Where the
number is allowed to appear* is a different question, and needs a different
mechanism.

## The mechanism

Three private union cases, in `src/Desk.fs`:

```fsharp
type SealedDrama = private SealedDrama of float<drama>

type SealedArc = private SealedArc of int list
let arcLength (SealedArc points) = List.length points

type AmnestyZone = private | AmnestyZone

let amnestyZone (state: GameState) : AmnestyZone option =
    match state with
    | Final _ -> Some AmnestyZone
    | Scheduled -> None
    | InProgress _ -> None

let formatDramaPeak (_zone: AmnestyZone) (SealedDrama peak) : string =
    sprintf "%.0f" (float peak)
```

Both the peak and the arc are sealed at the decode boundary, so no unwrapped
drama value is ever stored on a `Game`. `formatDramaPeak` is the only path from
a drama score to a string in the program, and it demands a witness that only a
`Final` game yields — or, since 2026-10-16, a kickoff two FIELD days gone
(`amnestyZoneAfterKickoff`, below under "Flow"). `arcLength` is deliberately ungated: a count of samples is
a factual property of the data, not an interest level.

### The version of this that was wrong

The first cut sealed the peak alone and left `DramaArc` as `Nested<int list>`.
That looked complete and was not: the arc is the *series* of composite drama
scores, so `arc |> List.map string` would have rendered four raw interest levels
on a live card, past a gate that this document already claimed was closed.

It was caught by re-reading the claim rather than by any check — the tests were
green throughout, because nothing in the repo renders arc values. Worth
recording plainly: the peak looks like "the drama number" and the arc looks like
a chart input, and that intuition is what left the hole open.

## What the compiler said

Each violation below was written on purpose, compiled, and the error copied
verbatim. Then it was deleted.

**1 — display the peak from a live branch, with no witness:**

<!-- proof: FS0001 -->
```fsharp
match g.DramaPeak with
| Some peak -> formatDramaPeak peak
| None -> ""
```
```
src/Scoreboard.fs(75,36): error FS0001: This expression was expected to have type
    'AmnestyZone'    but here has type    'SealedDrama'
```

**2 — forge the witness:**

<!-- proof: FS1093 -->
```fsharp
match g.DramaPeak with
| Some peak -> formatDramaPeak AmnestyZone peak
| None -> ""
```
```
src/Scoreboard.fs(75,36): error FS1093: The union cases or fields of the type
'AmnestyZone' are not accessible from this code location
```

**3 — skip the formatter and unseal the number directly:**

<!-- proof: FS1093 -->
```fsharp
match g.DramaPeak with
| Some (SealedDrama raw) -> sprintf "%.0f" (float raw)
| None -> ""
```
```
src/Scoreboard.fs(75,13): error FS1093: The union cases or fields of the type
'SealedDrama' are not accessible from this code location
```

**4 — render the arc's raw score series instead of the peak:**

<!-- proof: FS1093 -->
```fsharp
match g.DramaArc with
| Decoded (SealedArc points) -> points |> List.map string |> String.concat ","
| _ -> ""
```
```
src/Scoreboard.fs(75,16): error FS1093: The union cases or fields of the type
'SealedArc' are not accessible from this code location
```

"No live-state call site" is now a compile error rather than an audit finding.

## The runtime guard, and proof that it bites

`scripts/render-check.mjs` drives a real card post-game → live and asserts the
number disappears:

```
drama slot:   post-game "arc 4 pts, peak 53"
          ->  live      ""
```

That assertion was mutation-tested rather than assumed. Restoring the pre-gate
behaviour takes the suite from 11/11 to 10/11 with `no drama peak displayed
while live` failing.

Worth noting *how* the mutation had to be written: there was no way to bypass
the gate from `Scoreboard.fs` at all. It required adding an ungated formatter to
`Desk.fs` itself — which is exactly the property being claimed.

## What this does and does not cover

These are two independent defenses, and the amnesty CC-CMD is explicit that they
must not be conflated.

**Display (Defense 4) — covered.** ADR-002 PROHIBITED #3, severity CRITICAL.
This is the gate above.

**Push (Rules A/B/C/E) — partially covered, and not by the witness.** The
2026-07-07 push/pull re-analysis corrected these rules: the patents' actual
missing element is an *autonomous notification engine*, not the location of
computation, so derived drama state may now be computed, stored, and served on
pull. That correction is narrower than it first reads, and ADR-002 says so
directly:

> This does NOT touch the separate, still-fully-enforced prohibition on
> displaying a raw composite number to the user — see "What is PROHIBITED" #3
> and the Severity Classification section, **both unchanged by this
> correction.**

So the push/pull reading does not relax the display gate at all. What it adds is
a second axis, and the amnesty CC-CMD names the residual risk exactly:

> the risk is a *later* session reusing this same arc-score data as a push
> trigger without re-checking this gate.

`SealedDrama` addresses that axis, and it is the reason the value is sealed
rather than merely the formatter being gated. An unwrapped drama number cannot
leave `Desk`, so no future notification path can be handed one without editing
that file. The seal is not a proof of push-compliance — a `SealedDrama` could
still be passed to something that pushes it — but it removes the accidental
route, which is the one the CC-CMD is worried about.

Both are client-side here in any case, and a page the user loaded is pull-side
by construction.

## Why this is the laboratory's strongest result so far

The other experiments in this repo catch bugs. This one catches a bug class that
FIELD's own documentation says its audits *cannot reliably catch* — and it does
it at the only moment that matters, before the code exists.

It is also a legal constraint rather than a correctness one, which is the more
interesting claim: the boundary was being held by prose, process, and a
follow-up reminder. Here it is held by the type checker, and no reviewer has to
remember it.

---

## The sparkline is under the same gate

A 30-bar chart of `drama_arc` is a rendering of the same composite the peak is,
so it goes through the same witness. Both violations below were compiled for
real and the errors copied verbatim.

The interesting part is what could NOT be sealed. A bar's height **must** reach
the DOM — there is no chart without it — so "no number escapes" is not
implementable here. `barHeightStyle` returns the CSS length instead of the int,
and requires the zone:

```fsharp
let barHeightStyle (_zone: AmnestyZone) (DramaBar value) : string =
    sprintf "height: %d%%" value
```

The claim is therefore narrower than the peak's, and worth stating exactly: the
number leaves this module only as a style string, and only post-game.

**A — draw a bar with no amnesty witness:**

<!-- proof: FS0001 -->
```fsharp
let bar : DramaBar = Unchecked.defaultof<_>
barHeightStyle bar
```
```
src/Scoreboard.fs(28,20): (28,23) error FSHARP: This expression was expected to
have type    'AmnestyZone'    but here has type    'DramaBar' (code 1)
```

**B — unseal the bar and format the number directly:**

<!-- proof: FS1093 -->
```fsharp
match (Unchecked.defaultof<DramaBar>) with
| DramaBar v -> sprintf "height: %d%%" v
```
```
src/Scoreboard.fs(28,7): (28,17) error FSHARP: The union cases or fields of the
type 'DramaBar' are not accessible from this code location (code 1093)
```

## Flow (CC-CMD 2026-10-15 Task 1)

`InFlow` is the first composite verdict in this repo about a named TEAM rather
than a game, and the 2026-10-15 ruling lets it reach a page only as geometry,
colour or opacity, with an accessible name as the one sanctioned string. Ruling
2(b) of 2026-10-16 adds when: only once the match is over. Most captures it is
computed over stop in play (the club writer fires from minute 80 and drops
finished events), so "over" cannot be read from the capture alone.

### The verdict never leaves Flow as a value

`Flow.TeamState` is a private TYPE (`docs/FLOW-PROOF.md`), and `readingAt`
returns only `Recorded | NotRead | NotRecorded`. So outside `Flow` there is no
verdict value at all: nothing to format, compare, serialise or reflect on. The
verdict reaches a page through two functions only, and both demand the witness:

```fsharp
val ariaLabel  : Flow.Finished -> Flow.Side -> Flow.Clock -> string
val pulseStyle : Flow.Finished -> Flow.Side -> Flow.Clock -> string
```

### The witness is Flow's own, and it holds its capture

`Flow.Finished` is private and holds the capture it was built from, so a
witness for one match cannot label another. A bare `AmnestyZone` parameter
would have allowed that: it carries no identity. The ONE route to it is
`witnessAfterKickoff`: the capture's own BSD event row, joined by the
`event_id` the capture carries, with a kickoff FIELD day at least two days
before today's. It goes through a second route in `Desk.fs`,
`amnestyZoneAfterKickoff`, which takes no score. Every capture carries
`event_id` and every event row a kickoff (789 of 789, field-relay-nba run
38963130231).

**There is no full-time route, and there was one for a day.** Built first from
ruling 2(b)'s "a full-time period incident in the capture", it gave the witness
to a capture whose markers showed FT at 90' with no extra-time marker. The
review that followed found that BSD writes FT at 90' BEFORE extra time as well
(FT sits beside an extra-time marker in 17 of 17 extra-time captures), so a
knockout match captured in the break before extra time carries exactly that
shape and is still in play. Its score would have gone into `Final`, which the
ruling forbids. The kickoff route is sound for every capture; the full-time
route was removed.

### What the compiler said

**F1 — the accessible name from a capture, with no witness:**

<!-- proof: FS0001 -->
```fsharp
let capture : Flow.Capture = Unchecked.defaultof<_>
Flow.ariaLabel capture Flow.Home { Flow.Clock.Minute = 30; Flow.Clock.Added = 0 }
```
```
error FS0001: This expression was expected to have type    'Flow.Finished'
but here has type    'Flow.Capture'
```

**F2 — the pulse from a Desk witness:** `AmnestyZone` is a witness about A game
and says nothing about which capture it is.

<!-- proof: FS0001 -->
```fsharp
let zone : AmnestyZone = Unchecked.defaultof<_>
Flow.pulseStyle zone Flow.Home { Flow.Clock.Minute = 30; Flow.Clock.Added = 0 }
```
```
error FS0001: This expression was expected to have type    'Flow.Finished'
but here has type    'AmnestyZone'
```

**F3 — the option instead of the witness:** a capture whose kickoff is not two
FIELD days gone gets `None`, and skipping the match would skip the refusal.

<!-- proof: FS0001 -->
```fsharp
let capture : Flow.Capture = Unchecked.defaultof<_>
let row = "{}"
Flow.ariaLabel (Flow.witnessAfterKickoff capture row System.DateTimeOffset.UtcNow) Flow.Home { Flow.Clock.Minute = 30; Flow.Clock.Added = 0 }
```
```
error FS0001: This expression was expected to have type    'Flow.Finished'
but here has type    'Flow.Finished option'
```

**F4 — format a reading as a number:** the only Flow value a caller can hold
without the witness is a reading, and it is not a number.

<!-- proof: FS0001 -->
```fsharp
let reading : Flow.Reading = Unchecked.defaultof<_>
sprintf "%.2f" reading
```
```
error FS0001: The type 'Flow.Reading' is not compatible with any of the types
float,float32,decimal, arising from the use of a printf-style format string
```

**F5 — the second route does not open the constructor:** adding
`amnestyZoneAfterKickoff` did not make the case public. It is still built in
`Desk.fs` only, by those two functions.

<!-- proof: FS1093 -->
```fsharp
let forged : AmnestyZone option = Some AmnestyZone
forged
```
```
error FS1093: The union cases or fields of the type 'AmnestyZone' are not
accessible from this code location
```

### Checked at run time, not by the compiler

- **That a match not over gets no witness.** Suite rows, each made to fail on
  purpose: the kickoff route refuses a kickoff one FIELD day gone and accepts
  two, at instants chosen so that a UTC-day reading would answer the other way,
  for a capture with a full-time marker and for one taken in play; it refuses
  another event's row, and a capture whose shots could not all be read.
- **That a witness prints nothing it holds.** `string`, `sprintf "%A"`, `%O`,
  interpolation and `JSON.stringify` compile on every value. `Finished`
  overrides `ToString` and attaches a `toJSON`, and a Suite row checks all five
  under Fable.

### What no type here can stop, said plainly

- **The row and the clock are the caller's data.** `witnessAfterKickoff`
  checks that the event row is the capture's own and does the date arithmetic.
  It cannot tell a genuine row from a made-up one with an old date, or a real
  clock from one set to 2099, any more than a decoder can tell a genuine
  payload from a forged one. A renderer that passes `DateTimeOffset.UtcNow` and
  the event row it fetched gets the rule the owner set.
- **Reflection builds any private value.** `FSharpValue.MakeRecord` or an
  `unbox` of a look-alike object yields a `Finished` that no route produced,
  as it does a `Desk.AmnestyZone`. That is outside what a type can enforce. It
  cannot yield a verdict, because outside `Flow` there is no verdict value to
  reflect on.
- **Where a Desk witness came from.** Unchanged in kind: the `GameState` cases
  are public, so `amnestyZone (Final(0, 0, false))` compiles anywhere, and so
  does `amnestyZoneAfterKickoff` given two made-up instants. Flow does not
  accept a Desk witness at all (F2).

## Second Wind (CC-CMD 2026-10-15 Task 3)

`SecondWind` is the third live composite verdict the 2026-10-15 ruling names,
and the spec puts its string-path cases here. The module is `src/Stamina.fs`;
its constructor cases are in `docs/STAMINA-PROOF.md`. Nothing renders a reading
to a page in this CC-CMD, so the boundary below precedes any render path.

A reading leaves the module two ways, and both demand a witness:

```fsharp
let staminaMark (curve: Curve) (game: FinishedGame) (player: int) : Mark option
let staminaLabel (curve: Curve) (game: FinishedGame) (player: int) : string option
```

`staminaLabel` is the one string site the accessibility amendment requires:
the state's name and the numbers that produced it, for example
`SecondWind state active, last third 7 attempts against 3.6 expected`. Neither
projection takes a reading. Each takes a `FinishedGame` and a player id and
computes the reading from the game held inside the witness, so a witness earned
by one game cannot be spent on another (`docs/STAMINA-PROOF.md` case 4).

### What is a second witness route, and what is not compile-checked

`staminaWitness` is a second way this program obtains the amnesty witness. It
calls the existing `Desk.amnestyZone (Desk.Final(home, away, overtime))` with
the game's own final score, only when the play-by-play's own `gameState` is
`FINAL` or `OFF` and both scores are present. `LIVE`, `CRIT`, `PRE`, `FUT`, an
unrecognised word and a final with no score are each a named `None`, with no
wildcard. `Desk.fs` is unchanged.

**The exclusivity of how a `Final` is obtained is NOT compile-checked.**
`Desk.GameState`'s cases are public, and `src/Program.fs` already builds
`Final(7, 4, true)` from a query string, so any module can hold an
`AmnestyZone`. What the compiler does hold is narrower: Second Wind's
projections do not accept an `AmnestyZone` at all (case C below), only a
`FinishedGame`; that type's representation is private and `staminaWitness` is
the only function returning one; and its input, a decoded `PlayByPlay`, is
private too, so no F# code can relabel a decoded game as over. A body whose
text says `OFF` is still believed: the decoder cannot know where text came
from.

The runtime half (Rule 90): the Suite's "Second Wind" rows "every vendor state
word decodes, an unseen one included" and "only FINAL or OFF with both scores
yields the witness; LIVE, CRIT, PRE, FUT, an unseen word and a scoreless final
do not". Mutation `stamina-live-witness` hands `LIVE` a witness and that row
goes red.

### `string`, `%A` and interpolation

They compile on every type, so they cannot be compile errors. What holds them
here is that no public function returns a `Stamina` or an `Evidence`: no code
outside the module has a reading to print. What can be printed:

- a `FinishedGame`: its zone, its game id and per-player attempt counts (counts
  of shot attempts, not a reading);
- a `Mark`: its two fractions and its opacity. Those DO encode the reading, the
  way a bar height encodes a drama score, so `Mark` is witness-gated the same
  way `barHeightStyle`'s string is above, and its doc comment carries no colour.

### Measured while writing this: the existing seals print their numbers

`SealedDrama`, `DramaBar` and `SealedArc` override nothing, and under Fable
5.13 a union's default `toString` prints its fields. Compiled and run on
2026-10-16 (a throwaway module after `VerifyMain.fs` in a copy of this tree,
decoding `data/context-2026-05-15.json` and `data/games-2026-08-09.json`):

```
data/context-2026-05-15.json | sprintf %A of the SealedDrama: SealedDrama 53
data/context-2026-05-15.json | string of the SealedDrama: SealedDrama 53
data/context-2026-05-15.json | sprintf %O of the SealedDrama: SealedDrama 53
data/context-2026-05-15.json | interpolated SealedDrama: SealedDrama 53
data/context-2026-05-15.json | sprintf %A of a DramaBar: DramaBar 15
data/context-2026-05-15.json | sprintf %A of the SealedArc: SealedArc ([15; 15; 36; 53])
data/games-2026-08-09.json | sprintf %A of the SealedDrama: SealedDrama 81
```

None of those needs a witness. So the sentence near the top of this document,
"`formatDramaPeak` is the only path from a drama score to a string in the
program", is false as of this measurement. No current code takes that path;
the fix and the correction are filed as
`docs/CC-CMD-2026-10-16-sealed-drama-string-path.md`. Second Wind does not have
the exposure, because no public function hands out a reading at all.

### What the compiler said

**A — speak the label with no witness, handing it a reading:**

<!-- proof: FS0001 -->
```fsharp
let curve : Stamina.Curve = Unchecked.defaultof<_>
let reading : Stamina.Stamina = Unchecked.defaultof<_>
Stamina.staminaLabel curve reading 10
```
```
src/Scoreboard.fs(149,32): error FS0001: This expression was expected to have
type    'Stamina.FinishedGame'    but here has type    'Stamina.Stamina'
```

**B — draw the mark with no witness:**

<!-- proof: FS0001 -->
```fsharp
let curve : Stamina.Curve = Unchecked.defaultof<_>
let reading : Stamina.Stamina = Unchecked.defaultof<_>
Stamina.staminaMark curve reading 10
```
```
src/Scoreboard.fs(149,31): error FS0001: This expression was expected to have
type    'Stamina.FinishedGame'    but here has type    'Stamina.Stamina'
```

**C — hand the label Desk's witness for some `Final` instead of the game's own:**

<!-- proof: FS0001 -->
```fsharp
let curve : Stamina.Curve = Unchecked.defaultof<_>
match amnestyZone (Final(3, 2, false)) with
| Some zone -> Stamina.staminaLabel curve zone 10
| None -> None
```
```
src/Scoreboard.fs(149,47): error FS0001: This expression was expected to have
type    'Stamina.FinishedGame'    but here has type    'AmnestyZone'
```

**D — format the count a verdict carries as a number:**

<!-- proof: FS1093 -->
```fsharp
let evidence : Stamina.Evidence = Unchecked.defaultof<_>
sprintf "%d attempts in the last third" evidence.InLast
```
```
src/Scoreboard.fs(148,45): error FS1093: The union cases or fields of the type
'Evidence' are not accessible from this code location
```

**E — format the count an Insufficient reading carries:**

<!-- proof: FS1093 -->
```fsharp
match (Unchecked.defaultof<Stamina.Stamina>) with
| Stamina.Insufficient events -> sprintf "%d attempts" events
| _ -> ""
```
```
src/Scoreboard.fs(148,7): error FS1093: The union cases or fields of the type
'Stamina' are not accessible from this code location
```

---

## Tactical Lock (CC-CMD 2026-10-15 Task 2)

`LockedOn` is a composite verdict about a team, so the 2026-10-15 ruling binds
it: it may reach the DOM only as geometry, colour or opacity, plus one accessible
name that "strictly describe[s] the math and state". `src/TacticalLock.fs` puts
both of those paths behind this document's witness:

- `lockEncode` turns a state into a `LockEncoding`, a sealed shape with no
  colour or opacity chosen yet. It demands `AmnestyZone`.
- `lockAriaLabel` is the one string site. It gives the state's name and the
  numbers that produced it: "LockedOn state active, opponent xG 0.09, opponent
  best chance xG 0.05". It demands `AmnestyZone`. It says "opponent xG" rather
  than "suppressed" because what the spec means by `suppressed` is still the
  owner's question.

Classifying is NOT gated. A census may compute a verdict for every capture; the
witness gates drawing it and naming it.

**A — draw a state with no witness:**

<!-- proof: FS0001 -->
```fsharp
let state : TacticalLock.DefenseState option = None
match state with
| Some s -> Some(TacticalLock.lockEncode s)
| None -> None
```
```
src/Scoreboard.fs(149,46): error FS0001: This expression was expected to have
type    'AmnestyZone'    but here has type    'TacticalLock.DefenseState'
```

**B — give it an accessible name with no witness:**

<!-- proof: FS0001 -->
```fsharp
let state : TacticalLock.DefenseState option = None
match state with
| Some s -> Some(TacticalLock.lockAriaLabel s)
| None -> None
```
```
src/Scoreboard.fs(149,49): error FS0001: This expression was expected to have
type    'AmnestyZone'    but here has type    'TacticalLock.DefenseState'
```

**C — format a state as a number:**

<!-- proof: FS0001 -->
```fsharp
let state : TacticalLock.DefenseState option = None
match state with
| Some s -> sprintf "%.2f" s
| None -> ""
```
```
src/Scoreboard.fs(149,32): error FS0001: The type 'TacticalLock.DefenseState'
is not compatible with any of the types float,float32,System.Decimal, arising from
the use of a printf-style format string
```

**D — convert a state to a number:**

<!-- proof: FS0001 -->
```fsharp
let state : TacticalLock.DefenseState option = None
match state with
| Some s -> float s
| None -> 0.0
```
```
src/Scoreboard.fs(149,23): error FS0001: The type 'TacticalLock.DefenseState'
does not support a conversion to the type 'float'
```

### What the compiler does not refuse

`string s`, `sprintf "%A" s`, `$"{s}"` and `JSON.stringify s` compile on any F#
value, a `DefenseState` included. The public `lockShapeOf` returns a `LockShape`,
and a shape maps one-to-one onto a state, so printing a shape would print the
state. None of these paths can be a compile error in F#.

They are held at runtime instead. `DefenseState`, `LockEncoding` and `LockShape`
each override `ToString` to return their type name. Under Fable that covers
`string`, `%A` and interpolation. Each also implements a `toJSON` that returns
the type name, which covers `JSON.stringify`. Two Suite checks pin all twelve
outputs to the type names. Their counterexamples are what Fable writes with the
overrides removed, measured on the same lock: `LockedOn (0.09, 0.05)` and
`["LockedOn",0.09,0.05]`.

### What the witness does not prove

**Omitting the witness is a compile error.** Cases A and B show it.

**Where the witness came from is not compiler-checked.** `GameState`'s cases are
public, so `amnestyZone (Final(0, 0, false))` compiles in any module. The Suite's
Tactical Lock group mints its witness exactly that way. The type proves that a
witness is held. It does not prove the match is over. That rests on callers
obtaining the witness from a real game state, as `Scoreboard.fs` does.

**No real window gives a lock to render.** The premise pass over every R2
capture (field-relay-nba run 38962367310,
`outbox/empowerment-premises-latest.json`, key `soccer.T`) found no clock below
the minute on any shot and no restart incident type. So every real window
classifies as `ActivePlayUnmeasured`, and nothing renders any of these states
today. The gate is built ahead of a source that could feed it.
