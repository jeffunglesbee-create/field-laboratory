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
`Final` game yields. `arcLength` is deliberately ungated: a count of samples is
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
