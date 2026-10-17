# STAMINA-PROOF

What `src/Stamina.fs` makes impossible, demonstrated by compiling the violation
rather than describing it. Each case below is injected into `src/Scoreboard.fs`
and built by `scripts/proof-check.mjs`; it passes only if the compiler refuses
it with the stated code. The compiler's own words are quoted under each case,
from a build of this tree on 2026-10-16.

Second Wind is Task 3 of `docs/CC-CMD-2026-10-15-empowerment-metrics.md`. The
string-path cases (a label or a mark without the witness, a reading printed as
a number) are in `docs/AMNESTY-PROOF.md` under "Second Wind (CC-CMD 2026-10-15
Task 3)", because that document is where the spec puts them. This one holds
the constructors.

## A verdict cannot be minted without the test that earns it

`Stamina` has four cases, each private. `SecondWind` and `TrailingRate` (the
spec's `Fatiguing`, renamed by the owner's 2026-10-16 ruling) carry the
`Evidence` that passed a 2.5% binomial tail against the band's expected share,
and `PopulationRate` carries the evidence that passed neither. The only code
that builds one is `staminaOf`, which is private too, so no reading exists
outside the module that the test did not produce.

**1 — mint a SecondWind directly:**

<!-- proof: FS1093 -->
```fsharp
let evidence : Stamina.Evidence = Unchecked.defaultof<_>
Stamina.SecondWind evidence
```
```
src/Scoreboard.fs(148,5): error FS1093: The union cases or fields of the type
'Stamina' are not accessible from this code location
```

**2 — choose the counts a reading carries:**

<!-- proof: FS1093 -->
```fsharp
let counts : Stamina.Evidence = { Stamina.Evidence.InFirst = 1; InLast = 7; ExpectedShare = 0.5 }
counts
```
```
src/Scoreboard.fs(147,37): error FS1093: The union cases or fields of the type
'Evidence' are not accessible from this code location
```

**3 — branch on a reading's state outside the module:**

<!-- proof: FS1093 -->
```fsharp
match (Unchecked.defaultof<Stamina.Stamina>) with
| Stamina.SecondWind _ -> "second wind"
| _ -> ""
```
```
src/Scoreboard.fs(148,7): error FS1093: The union cases or fields of the type
'Stamina' are not accessible from this code location
```

## The witness is bound to the game it came from

`FinishedGame` holds the amnesty witness together with the finished game's own
player-games, and both projections read the player-game out of it. Carrying a
witness across to other player-games would let one finished game unlock the
reading of another, live or not.

**4 — carry a finished game's witness over other player-games:**

<!-- proof: FS1093 -->
```fsharp
let finished : Stamina.FinishedGame = Unchecked.defaultof<_>
let otherPlayers : Stamina.PlayerGame list = []
{ finished with Readable = otherPlayers }
```
```
src/Scoreboard.fs(149,5): error FS1093: The union cases or fields of the type
'FinishedGame' are not accessible from this code location
```

**5 — take a decoded game and relabel what its vendor said about its state:**

<!-- proof: FS1093 -->
```fsharp
match Stamina.staminaPlayByPlay "{}" with
| Ok pbp -> Some { pbp with State = Stamina.VendorState.Off }
| Error _ -> None
```
```
src/Scoreboard.fs(148,22): error FS1093: The union cases or fields of the type
'PlayByPlay' are not accessible from this code location
```

What case 5 does NOT prove, stated so it is not inferred: the decoder takes any
text, so a caller can still hand it a body that says `OFF`. The claim is that no
F# code can change a decoded game's state; whether the text came from the
vendor is the capture's job (`scripts/capture-nhl-fixture.mjs` writes response
bytes verbatim and refuses a game whose own play-by-play is not FINAL or OFF).

## The population curve cannot skip its floor

**6 — build a curve whose bands carry one attempt each:**

<!-- proof: FS1093 -->
```fsharp
let thin : Stamina.BandCounts = { PlayerGames = 1; FirstThirds = 1; LastThirds = 1 }
({ Stamina.Curve.Under12 = thin; From12To18 = thin; From18 = thin } : Stamina.Curve)
```
```
src/Scoreboard.fs(148,6): error FS1093: The union cases or fields of the type
'Curve' are not accessible from this code location
```

`staminaCurve` is the only way to a `Curve`, and it refuses any band with fewer
than 1000 attempts in either third, naming the band and its counts.

## What the compiler does not hold

- **The thresholds.** 2.5%, the 1000 floor, the cut points at 720 s and 1080 s
  and the fewest-readable-attempts rule are values, not types. The Suite's
  "Second Wind" group writes each boundary as a literal. `scripts/mutation-check.mjs`
  breaks the tail, the fewest-readable-attempts rule and the measured null on
  purpose (`stamina-tail-loosened`, `stamina-reach-min`,
  `stamina-null-is-flat`); the floor and the cut points are held by rows with
  literal boundaries and carry no mutation yet.
- **The seal itself.** `stamina-sealed` deletes `private` from `Stamina`;
  cases 1 and 3 above then compile and this document's check goes red.
- **Where a FINAL comes from.** `Desk.GameState`'s cases are public, so
  `amnestyZone (Final ...)` compiles in any module. `docs/AMNESTY-PROOF.md`'s
  Second Wind section says what that leaves open.
