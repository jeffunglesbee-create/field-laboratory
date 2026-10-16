# Tactical Lock: a lock is computed, never written down

`docs/CC-CMD-2026-10-15-empowerment-metrics.md`, Task 2, asks for a lock that
"carries its counterexample": the constructor takes the opponent's best chance in
the window, "must be private, refusing to build when that chance exceeds
threshold. A lock cannot be minted without showing what it suppressed."

`src/TacticalLock.fs` builds that as follows:

- `DefenseState` is private, so classifying a window is the only way to hold one.
- The lock's one constructor takes both bars. It refuses when the opponent's
  total xG exceeds the total bar or their best chance exceeds the best-chance
  bar. Its comparisons are written so that holding is the condition, so a NaN
  never mints a lock.
- `Bars` are private too. Their smart constructor refuses a best-chance bar that
  is negative, not a number, or at or above the total bar. A best chance never
  exceeds the total it is part of, so under such bars the counterexample could
  never refuse anything.

The cases below are the compile-time half of that claim. Each was compiled for
real by `scripts/proof-check.mjs` against the tree that ships this doc, and the
errors are copied from that tree.

The runtime half is the refusal arithmetic: equal to a bar locks, one over it
does not, and a NaN or negative chance is its own unmeasured case. Suite checks
in the "Tactical Lock" group hold it, and mutations in
`scripts/mutation-check.mjs` (ids `tactical-lock-*`) break it on purpose.

**What no case here can show.** No real window reaches the lock at all. The
premise pass over every R2 capture (field-relay-nba run 38962367310,
`outbox/empowerment-premises-latest.json`, key `soccer.T`) found no clock below
the minute on any shot and no restart incident type. So every window keeps its
dead time and classifies as `ActivePlayUnmeasured`. These cases prove the lock
cannot be forged. They do not show that one exists.

## 1 — write a lock down instead of computing it

<!-- proof: FS1093 -->
```fsharp
let none : float32<xg> = 0.0f<xg>
TacticalLock.LockedOn(none, none)
```
```
src/Scoreboard.fs(148,5): error FS1093: The union cases or fields of the type
'DefenseState' are not accessible from this code location
```

## 2 — read a lock's xG back out of it

The numbers leave a lock in one place only: its accessible name, which requires
the amnesty witness (`docs/AMNESTY-PROOF.md`, Tactical Lock section).

<!-- proof: FS1093 -->
```fsharp
let state : TacticalLock.DefenseState option = None
match state with
| Some(TacticalLock.LockedOn(suppressed, _)) -> float suppressed
| _ -> 0.0
```
```
src/Scoreboard.fs(149,12): error FS1093: The union cases or fields of the type
'DefenseState' are not accessible from this code location
```

## 3 — choose bars the counterexample can never refuse under

A best-chance bar of 0.90 against a total of 0.30 would let any window under the
total lock, whatever its best chance was.

<!-- proof: FS1093 -->
```fsharp
let total : float32<xg> = 0.30f<xg>
({ TacticalLock.Total = total; TacticalLock.BestChance = 0.90f<xg> } : TacticalLock.Bars)
```
```
src/Scoreboard.fs(148,6): error FS1093: The union cases or fields of the type
'Bars' are not accessible from this code location
```

## 4 — draw a shape the classifier did not choose

<!-- proof: FS1093 -->
```fsharp
let shield : TacticalLock.LockShape = TacticalLock.LockShape.Shield
TacticalLock.LockEncoding shield
```
```
src/Scoreboard.fs(148,5): error FS1093: The union cases or fields of the type
'LockEncoding' are not accessible from this code location
```

## 5 — compare two states to learn which one a value is

`DefenseState` has no equality. Without it, comparing an unknown state with a
known lock would reveal the case of a value that has no other way out.

<!-- proof: FS0001 -->
```fsharp
let state : TacticalLock.DefenseState option = None
state = state
```
```
src/Scoreboard.fs(148,5): error FS0001: The type 'TacticalLock.DefenseState'
does not support the 'equality' constraint because it has the
'NoEquality' attribute
```

## The limit of all five

F# privacy is a property of F# source. Fable exports every union as a JavaScript
class, so a `.mjs` file importing `build/TacticalLock.js` can construct any case
it likes. That is why the per-capture census, `lockWindows`, is written in F#
and returns counts: a node script calls it, and never classifies anything
itself.
