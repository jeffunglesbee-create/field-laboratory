# Tactical Lock (empowerment Task 2): built; every real window is unmeasured

2026-10-16. Built for `docs/CC-CMD-2026-10-15-empowerment-metrics.md`, Task 2.

## Result

No window in any R2 capture can construct `LockedOn`, `Quiet` or `Searching`.
Every window keeps its dead time and classifies as `ActivePlayUnmeasured`. That
is the measured result (done condition 2). It does not leave Task 2 incomplete.

The premise comes from the premise pass over every capture: field-relay-nba run
38962367310, `outbox/empowerment-premises-latest.json`, key `soccer.T`. It read
stats.json for 788 of 788 non-shell captures and incidents.json for 786.

- **Clocks.** The only key finer than the minute anywhere is `period_second`, on
  66 incident objects (which incident types carry it was not recorded). No shot
  carries a clock finer than `min`/`added`.
- **Incident types.** period 1589, card 2830, goal 2378, injuryTime 1298,
  substitution 7240, varDecision 220. None is a throw-in, goal kick or foul.
- **Restarts.** They appear only inside goals' build-up `sequence[]`: throw-in
  64 and free-kick 2 of 8166 events. None of the 8166 carries a time key.

So no stoppage can be placed on a clock, and none can be taken out of a window.

A second blocker sits behind the first. No territory reading exists at window
grain: final-third entries and possession are reported per half or per match,
and `momentum` is validated as territory at half grain only.

## What changed

- **`src/TacticalLock.fs`** (new). It sits immediately above `Scoreboard.fs` in
  `src/Laboratory.fsproj` and depends only on Units, Desk and Thoth. It holds:
  - `Territory` and `WindowEvidence` (`DeadTimeIn | ActivePlayOnly`).
  - `Bars`, private, behind a smart constructor.
  - `DefenseState`, private and without equality.
  - `LockShape` and `LockEncoding`, sealed.
  - The classifier, the encoder, the accessible name, and the per-capture
    census `lockWindows`.
- **`src/Suite.fs`**: a "Tactical Lock" group of 15 checks, placed between
  "Team colours" and "Tennis scorelines". It sits mid-list so that the
  `verify-panel-drops-a-group` anchor (the last two groups) is untouched.
- **`docs/LOCK-PROOF.md`** (new). Five compile rejections: forging a lock (FS1093),
  reading its xG out (FS1093), forging bars (FS1093), forging an encoding
  (FS1093), and comparing two states (FS0001).
- **`docs/AMNESTY-PROOF.md`**: a Tactical Lock section with four cases. Drawing
  or naming a state without the witness is FS0001, and so is formatting a state
  as a number or converting it to one. The section also states what the
  compiler does NOT refuse.
- **`scripts/mutation-check.mjs`**: 8 `tactical-lock-*` records at the end.
- **`src/Units.fs`**: `[<Measure>] type xg`, shared with Task 1.
- Docs: a dated CC note under Task 2 in the CC-CMD, and done condition 5 in
  `docs/CC-CMD-2026-10-16-bsd-ws-frame-shape.md`, which asks the WebSocket
  frames for restart types and the clock grain of `uts`. That is the
  follow-up for reopening the window (Rule 87.4).

## Decisions

- **The accessible name says what the numbers are.** "LockedOn state active,
  opponent xG 0.09, opponent best chance xG 0.05". The type keeps the spec's
  field names `suppressed` and `bestChanceAllowed`. What `suppressed` means
  (held to, or taken away) is a question for the owner.
- **Section 0.4 says "Task 2 cannot be built" without a denominator.** The
  module header reconciles this:
  - `ActivePlayOnly` is a test seam for the table and the private constructor
    (done condition 5).
  - `Territory` is a judgement handed in.
  - The bars are uncalibrated and ship no production value.
- **An xG that is NaN, infinite or negative gets its own case,
  `ChanceUnmeasured`.** The same premise pass found `xg` null on 123 of 21020
  shots (`soccer.P1`).
- **Classifying is ungated; drawing and naming need `Desk.AmnestyZone`.** The
  compiler checks that a witness is held, not where it came from: GameState is
  public.
- **The string paths the compiler cannot refuse are held at runtime.** These
  are `string`, `%A`, interpolation and `JSON.stringify`. Each sealed type
  overrides `ToString` and implements `toJSON` to return its type name only.

## What a mutation found in the checks

The boundary checks first used decimal inputs: bars of 0.30 and 0.10, a best
chance of 0.10, and four chances of 0.075. They passed. The mutation that
refuses a best chance EQUAL to its bar (`<` for `<=`) survived them.

The cause is that Fable compiles `float32 x` to `x * 1`, with no rounding to
single precision. Only literals are single-rounded: a `0.10f` bar is
0.10000000149011612, while the 0.10 a check typed stays 0.1. The "equal" input
sat below the bar, so the check never tested equality.

The test bars are now binary fractions (0.5 and 0.125). So is every input that
must land exactly on a bar: 0.125 for the best chance, and eight chances of
0.0625 for the total. Those values are exact in any precision. The suite
comment records why.

Two other consequences of the same fact:

- The `float32` measure is nominal under Fable. Nothing in the census relies on
  single-precision rounding.
- The string-path counterexamples were measured again on the final values:
  `LockedOn (0.09, 0.05)` and `["LockedOn",0.09,0.05]`.

## The census function

`lockWindows (stats: string) (incidents: string option) :
Result<LockWindows, string>`. A node census calls it once per capture with the
file texts, passing `undefined` when there is no incidents.json. In JS, `tag 0`
is Ok and `fields[0]` holds the record.

The record has `TeamWindows`, `RestartsUnclocked`, `ShotsUnclocked`,
`Unmeasured`, `Clocked`, `LockedOnPossible` and `XgMissing`, all ints.

The windows are Task 0's grid: the four minutes ending at minute e, for e from 4
to 90, never across half time, up to the capture's last minute. Each window is
counted once per defending side.

`Unmeasured` and `LockedOnPossible` come from the real classifier, never from a
literal. An unreadable file is an Error, never zero windows.

## Not verified here

- The census function has run on inline captures only. No R2 capture was read
  from this sandbox (`*.workers.dev` is refused), and no workflow was added: the
  parent owns the one soccer census.
- `npm run gate` was not run.
- Nothing renders a Tactical Lock state on any page.
