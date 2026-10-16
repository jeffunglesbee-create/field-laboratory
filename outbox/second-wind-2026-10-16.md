# Second Wind (NHL): CC-CMD 2026-10-15 Task 3, 2026-10-16

Task 3 of `docs/CC-CMD-2026-10-15-empowerment-metrics.md`, built against HEAD
8eaf5a0 as Commit A. Commit B (the real-bytes rows) waits on a CI capture; its
unblock criteria are below.

## Built

- `src/Stamina.fs`, compiled between `Stats.fs` and `Scoreboard.fs`. Two
  decoders (api-web.nhle.com play-by-play, api.nhle.com shift charts), the
  windows over each skater's own regulation ice, the measured credit boundary
  (`staminaCoverage`), the population curve, the sealed `Stamina` reading, the
  witness `FinishedGame`, and the two projections `staminaLabel` and
  `staminaMark`. Nothing renders a reading to a page.
- The Suite's "Second Wind" group: 25 rows, every input a raw shape (counts,
  clock strings, JSON text), never a reading or a label.
- `docs/STAMINA-PROOF.md` (6 cases, the constructors) and a section appended to
  `docs/AMNESTY-PROOF.md` (5 cases, the string paths).
- 10 mutations in `scripts/mutation-check.mjs`, ids `stamina-*`.
- `scripts/capture-nhl-fixture.mjs` and `scripts/second-wind-population.mjs`,
  each with a `--self-test` over a fake fetch; npm scripts
  `capture:nhl-fixture` and `census:second-wind`.
- Two filed CC-CMDs: `docs/CC-CMD-2026-10-16-second-wind-denser-measure.md`
  and `docs/CC-CMD-2026-10-16-sealed-drama-string-path.md`, both FILED.
- CC notes in the spec: under Task 0.3 and at Task 3's source line (the
  `/nhl-stats/shiftcharts` refusal is stale since relay commit `bf284b0`,
  verified in that repo's log), and the Task 3 note recording the premises,
  the fourth case and the label question.

## The premises, measured before the types (Rule 100)

field-relay-nba run 38962367310, its `outbox/empowerment-premises-latest.json`
key `nhl`. Run 38963130231 (relay commit e09b74e) rewrote that file later the
same evening; its `nhl` key is identical, checked by diffing the two commits.

2025-26 regular season, ids 2025020001+4k, k = 0..327. 328/328 play-by-play
and 328/328 shift charts; `gameState` OFF 328, `gameType` 2 328; 13118 roster
spots, 0 without `positionCode` (G 1311); attempts goal 2102, shot-on-goal
16298, missed 9872, blocked 10071; 0 without a credited key, 0 without a
clock, 737 beyond regulation; 5 credited to a goalie, 0 to a non-roster id, 0
to a skater with no regulation shift; penalties 2429, 71 without
`committedByPlayerId`; shift charts 0 total-vs-rows mismatches, 0 games
without rows, 517 rows 247474 and 505 rows 2125, 0 unreadable 517 times, 0
end-before-start, 0 zero-length, 0 wrong-game rows, 2316 period-4+ shifts.
Regulation ice per skater-game (11807): p5 543 s, p10 631, p25 800, p50 989,
p75 1173, p90 1334, p95 1431.

**Refuted: "most players decline late, so flat is not the null".** Not under
this measure. Thirds of own regulation ice (first 3τ < T, last 3τ >= 2T),
credited attempts in periods 1-3, skaters only:

| band | skater-games | first third | last third | last/first |
|---|---|---|---|---|
| under 720 s | 1971 | 1061 | 1122 | 1.06 |
| 720 to 1079 s | 5505 | 5308 | 5286 | 1.00 |
| 1080 s and over | 4331 | 5791 | 5999 | 1.04 |

By ice-time decile: 1.11, 1.02, 0.96, 1.00, 1.00, 1.02, 0.98, 1.09, 0.98,
1.06. The population is flat to slightly rising. The metric stands because
each band's expected last-third share is measured (0.514, 0.499, 0.509, read
through `staminaBands` on these counts), never assumed. The Suite's
"declining" helper curves (1250 first, 1000 last) are test inputs and the
module header says so.

What these numbers changed in the build: the decoder's refusal of a bad 517
row stays (0 such rows in 247474), and the population script now counts
refusals and gates them at 1%; the 1000-attempt floor clears in every band at
stride 4, narrowly in the shortest (first third 1061); the fewest readable
attempts is 6 in every measured band; about 2.1 attempts per skater-game fall
in the two thirds (24567 over 11807, derived), so `Insufficient` will be most
readings.

## Decisions, each with its reason

- **Credited by name.** `scoringPlayerId` for goals, `shootingPlayerId` for the
  other three attempt types; nothing through on-ice membership, so every goal
  counts. Penalties excluded by name and counted.
- **The boundary is measured, not relied on.** `staminaCoverage` counts named
  credit under [a,b), (a,b] and in no interval, per class, with a same-period
  guard and the +600 s control. `moved` wraps only past the period's end, so a
  zero shift is the identity (the design's `%` form moved 20:00 to 00:00; the
  Suite's period-guard row would read NO TEETH under it).
- **`PopulationRate`, a fourth case.** Recorded in the spec's CC note for the
  owner to rule on.
- **The witness is bound to the game.** `FinishedGame` holds the zone and that
  game's own player-games; both projections take it plus a player id and
  compute the reading inside. `PlayByPlay` is private as well, so no F# code
  relabels a decoded game as over. The exclusivity of how a `Final` is
  obtained is NOT compile-checked (public `GameState` cases; `Program.fs`
  builds `Final(7, 4, true)`), and the AMNESTY-PROOF section says so.
- **No public `Stamina`.** `staminaOf` is private and no public function
  returns a reading, so `string` and `%A` have nothing to print; no
  `ToString` override was needed (spec: "no `ToString`").
- **Log-space tails.** The linear pmf recurrence underflows at n = 1300, share
  4/9, and reads SecondWind; a row and a mutation hold the fix.
- **No committed curve.** The curve lives in
  `outbox/second-wind-population-latest.json` only, computed by the F# on CI.
- **One body-word row was not written.** A ban-list row would either fail on
  the spec's own `Fatiguing` or need an exemption for it. The exact-label row
  holds the template instead, and the word is an owner question.

## Question for the owner

The label is "state name plus the number that produced it", for example
`Fatiguing state active, last third 0 attempts against 3.6 expected`. That puts
the spec's case word into UI copy against its own "nothing in ... the UI copy
may assert conditioning, fitness or biology". Mechanical alternative, ready:
`BelowPopulationRate`, `AbovePopulationRate`, `AtPopulationRate` in the label,
case names unchanged.

## Verified in the sandbox

Measured in an isolated copy of this tree; `npm run gate` NOT run here.

- `npm run build` and `dotnet build src/Laboratory.fsproj --no-restore`: 0
  `warning (FS|NU)` lines, 0 errors.
- `node build/VerifyMain.js`: 216/216 checks held; `grep -c 'Verify.check '
  src/Suite.fs` = 216 (191 before; 25 new).
- `node scripts/proof-check.mjs --only STAMINA-PROOF`: 6 of 6 cases rejected
  with their claimed codes. `--only AMNESTY-PROOF`: 11 of 11 (6 existing, 5
  new). Both are subsets of the full run and say so in their own output.
- `node scripts/mutation-check.mjs --only <id>`, one at a time. Every anchor
  occurs once in `src/Stamina.fs` (`grep -cF` = 1). Every mutant compiled, so
  each was caught by its expectation, not by the compiler. The rows that went
  red are from the same mutants applied in a scratch copy:

| id | expect | caught | rows that went red |
|---|---|---|---|
| stamina-sealed | proof-check --only STAMINA-PROOF | yes | STAMINA-PROOF cases 1 and 3 compile |
| stamina-reach-min | VerifyMain | yes | Insufficient below both-reachable; Insufficient sibling; band readings |
| stamina-insufficient-is-fatiguing | VerifyMain | yes | Insufficient below both-reachable; Insufficient sibling |
| stamina-tail-loosened | VerifyMain | yes | each verdict's own tail (NO TEETH); Insufficient rows; band readings |
| stamina-population-rate-folded | VerifyMain | yes | level against level reads PopulationRate |
| stamina-null-is-flat | VerifyMain | yes | flat is not the null; tails; label; mark |
| stamina-live-witness | VerifyMain | yes | only FINAL or OFF yields the witness |
| stamina-coverage-period-guard | VerifyMain | yes | 20:00 against the next period's 00:00 shift |
| stamina-coverage-end-rule | VerifyMain | yes | a goal on the shift-end second is end-inclusive |
| stamina-tails-underflow | VerifyMain | yes | 1300 first-third attempts is not SecondWind |

- The design's modulo form of the moved clock (20:00 read as 00:00 at a zero
  shift), applied in the scratch copy: the period-guard row read NO TEETH and
  218 of 219 rows held (that copy also carries Commit B's three rows). So the
  row also holds the identity fix. The seal mutation, applied there: STAMINA-PROOF
  cases 1 and 3 compiled; case 2 still failed with FS1093.
- `node scripts/capture-nhl-fixture.mjs --self-test`: 11/11.
  `node scripts/second-wind-population.mjs --self-test`: 18/18, the whole
  pipeline through `build/Stamina.js`, with each gate shown failing on a
  degenerate population (in play, two games not served, a short chart, credit
  outside the shifts, under the floor, a complete population that disagrees
  with the premise counts).
- check:unused, check:import-purity, check:citations, cc-cmd-status-check,
  check:exit-drains, short-circuit-check, clean-source-check, workflow-check,
  check:docs: all pass. check:script-orphans FAILS on this tree alone (the two
  new scripts are reached by no workflow yet); with a throwaway workflow running
  `npm run capture:nhl-fixture`, `npm run build`, `npm run census:second-wind`
  it passed 3/3, and workflow-check refused the same workflow without its build
  step. The throwaway was deleted.
- NOT verified: anything against real NHL bytes (the sandbox cannot reach the
  hosts), the Verify tab in a browser, the full gate, and the mutation suite's
  added duration (about 2 minutes per `VerifyMain` mutation and 5 for the
  proof-check one, measured here per `--only` run including its baseline).

## Staged: Commit B, the real-bytes rows

- What: `Fixtures.paths` gains `data/nhl-second-wind-pbp.json` and
  `data/nhl-second-wind-shifts.json`; accessors `nhlPlayByPlay`,
  `nhlShiftChart`, `nhlShiftChartTruncated`, `nhlPlayByPlayLive`; three Suite
  rows (the capture decodes and windows 30+ skaters with an attempt past
  regulation; named credit inside own shifts for 95% of other attempts, the
  +600 s control not; the capture's own state yields the witness, the same
  bytes marked LIVE do not).
- Blocked by: the two data files do not exist; the sandbox cannot reach the
  NHL hosts.
- Unblocked when: the dispatch-only data workflow runs
  `node scripts/capture-nhl-fixture.mjs` on a runner and commits the two files
  and the `data/PROVENANCE.md` entry.
- Verify: `node build/VerifyMain.js` prints 219/219 after the patch, and
  `grep -c 'Verify.check ' src/Suite.fs` prints 219. The rows compiled and
  held (219/219) in a scratch copy against a synthetic stand-in, which proves
  the mechanics and nothing about the vendor's bytes.

## Integration state

No relay contract: both scripts read the vendor hosts directly. No client
consumer: nothing renders. Integration status: UNTESTED against real NHL bytes
until the CI run.

## Found while building

- **A copied tree builds the original's source.** This work copy carried
  `build/fable_modules/project_cracked.json` from `/home/user/field-laboratory`,
  so `npm run build` compiled THAT tree's `src/*.fs` into `build/home/...` and
  `node build/VerifyMain.js` ran the copy's stale `build/` (191/191, my group
  absent). Deleting `build/`, `src/obj` and `src/bin` and restoring fixed it
  (216/216). Any isolated copy made by `cp` has the same trap.
- **The drama seals print their numbers.** Measured: `sprintf "%A"`, `string`,
  `%O` and interpolation of a `SealedDrama` print `SealedDrama 53` under Fable
  5.13. Filed as `docs/CC-CMD-2026-10-16-sealed-drama-string-path.md`.
