# Session — empowerment metrics, Tasks 1-4 — 2026-10-15 to 2026-10-17

`docs/CC-CMD-2026-10-15-empowerment-metrics.md`, Tasks 1-4, after Task 0
(`outbox/cc-session-2026-10-16-empowerment-task0.md`). Status: **DONE**. All
four built, none rejected. The owner delegated every open decision ("Go with
Claude's best recommendations"); each one is listed below for ratification.

## HEAD progression

**field-laboratory** (`main`):

| commit | what |
| --- | --- |
| `8eaf5a0` | start: the owner's delegated rulings on Flow's two remaining questions |
| `b6f1fcf` | the four metrics, measured before they were typed (gate 530/530) |
| `5e65e87` | four bare "Rule 91" comments re-cited by tag and file, after the owner's `fae6b6b`/`f86390f` |
| `c64251c` | bot: Flow census, Second Wind population and both fixtures (run 38984743564) |
| `85db9fe` | bot: Gravity Well census (run 38984745121) |
| `db75760` | the eight real-bytes rows, seven mutation records, the frames route hash check (gate 530/530) |
| `d2aed99` | bot: Gravity Well census and the first route hash (run 38995271211) |
| `4268577` | the owner's new deploy-landed CC-CMD's Status word, which had turned guards red |
| `d9f2cce` | `Fatiguing` renamed `TrailingRate`, per the owner's 2026-10-16 ruling (gate 530/530) |
| this commit | this document, the README, the CC-CMD Status line, the Flow write-up's unread count, the weather CC-CMD |

**field-relay-nba** (`main`): `b88ac64`, `2dfd4f0`, `8bc3f69`, `4c80173` (the
premise pass, `scripts/empowerment-premises.mjs`, now importing the lab's R2
walk rather than a copy), `93b0fda` (run 38967053334), `a5306bd` (its session
doc), `81d4072` (that header re-cited by rule tag), `62b0dce` (the `STAGED`
marker on `bdb_event_frames.json` removed, deployed), `aaeb9d9` (its session
doc and HANDOFF).

## Measured first (PREMISE-FIRST-A, `field-relay-nba/CLAUDE.md`)

Before any type, every load-bearing premise of the four designs was counted
over the whole population on a relay runner (run 38963130231: 789 BSD captures,
328 NHL games). Two premises were wrong and changed the build:

1. **No shot has xG 0** (0 of 21,055 shotmap rows). The owner's ruling on
   zero-xG shots has nothing to act on yet; it stays implemented and tested on
   inline inputs.
2. **The late-game decline Second Wind was specified against does not exist
   under its measure.** Last third over first third, per band: 1.057, 0.996,
   1.036 (identical on lab run 38984743564). Each band's expected share is
   therefore measured, never assumed.

Two more shaped Flow: BSD writes the full-time marker at 90' **before extra time
too** (FT beside an extra-time marker in all 17 extra-time captures), and every
capture carries its own `event_id`.

## What was built

| metric | source | proof cases | Suite rows | mutations |
| --- | --- | --- | --- | --- |
| Flow | `src/Flow.fs`, `Desk.amnestyZoneAfterKickoff` | FLOW-PROOF 5, AMNESTY-PROOF 5 | 41 + 5 on real bytes | 18 + 4 |
| Tactical Lock | `src/TacticalLock.fs` | LOCK-PROOF 5, AMNESTY-PROOF 4 | 15 | 8 |
| Second Wind | `src/Stamina.fs` | STAMINA-PROOF 6, AMNESTY-PROOF 5 | 25 + 3 on real bytes | 10 + 3 |
| Gravity Well | `src/Vintage.fs`, `src/Gridiron.fs`, `src/Gravity.fs` | GRAVITY-PROOF 12, VINTAGE-PROOF 5 | 22 | 10 |

Counted from source, not recalled: 47 proof cases (`<!-- proof: FSxxxx -->`
markers; AMNESTY-PROOF went 6 -> 20), 111 Suite rows (`Verify.check` per group
function), 53 mutation records.

Suite 191 -> 302 checks. Mutation records 109 -> 163. The per-metric write-ups
are `outbox/flow-2026-10-16.md`, `outbox/tactical-lock-2026-10-16.md`,
`outbox/second-wind-2026-10-16.md` and `outbox/gravity-well-2026-10-16.md`; the
real-bytes rows and the frames hash check are
`outbox/2026-10-16-empowerment-real-bytes.md`.

## The populations, as measured

- **Flow** (run 38984743564): 791 of 791 non-shell captures decoded; 787 read;
  2,732 Flow runs, each closed exactly once (opponent shot 2,026, half time 299,
  capture end 297, shared minute 88, full time 17, extra-time interval 5). 4
  captures unread, all UCL (210771-210774, 118 rows with no xG).
- **Tactical Lock** (same run): 132,798 team windows, every one
  `ActivePlayUnmeasured`, because no capture clocks a restart below the minute.
- **Second Wind** (same run): 328 of 328 games decoded and witnessed, 11,807
  skater-games: Insufficient 11,232, PopulationRate 551, SecondWind 15,
  Fatiguing 9 (the run predates the rename; that case is now `TrailingRate`). Named credit sits in the shooter's own shifts for every one of
  35,627 other attempts; the +600 s control misses 24,912 of them.
- **Gravity Well** (run 38984745121): 545 of 545 plays accounted for, 489
  measured (54 no release frame, 2 a sole route runner); drawn cancels on all
  489; 13/13 checks.

## Gates

| tree | result | duration |
| --- | --- | --- |
| `b6f1fcf` (all four merged) | 530/530, run `8eaf5a059861-0bf25d1ca66a` | 6846 s; mutation row 5610 s |
| `5e65e87` (comments only) | quick gate 270/270, run `b6f1fcf5df08-42e9490187a2`; build 0 warnings; harness 294/294 | 3 s quick |
| `db75760` (real-bytes rows) | 530/530, run `c64251c249b0-5f020ec3320c` | 6808 s; mutation row 5596 s |
| `d9f2cce` (the rename) | 530/530, run `db75760e555f-bdb15544bdf3` | 6853 s; mutation row 5658 s |

The first full gate with all four took 6846 s (114 min). That is the number
`verify-full.yml`'s 240-minute ceiling was raised against; it said so before the
number existed, and this is the number.

Done condition 5 ("loosening each new constructor drops the gate below 95 and
exits non-zero"): every new record's expectation is a 20-point gate row, and on
a tree with `Flow.Finished` made public both the proof row and the mutation
row's own baseline exit 1 — 92.45 at most. Measured, not derived from weights
alone; `outbox/2026-10-16-empowerment-real-bytes.md` has the commands.

## CI

- `verify` on `5e65e87` (run 38984732123) failed at "Weather against the LIVE
  Open-Meteo API": Coors Field HTTP 503, then Yankee Stadium `fetch failed`.
  Nothing in either commit touches weather. `verify` on `db75760` (run
  38995263400) passed, that step included, so the failure was the service's.
  The step's `--tolerate-unreachable` covers a first request that throws, not
  a 503 later in its per-venue loop; that is why an outage failed verify.
- `guards` on `db75760` (run 38995263410) failed at the CC-CMD status check:
  the owner's `511e2cb` filed `CC-CMD-2026-10-16-deploy-landed-skip-ci.md` with
  "NOT STARTED", outside the closed vocabulary, and landed with the skip
  directive, so no guard saw it until the next push. `4268577` opened it with
  "FILED, not started"; `guards` passed on that commit (run 38995772010).
- `verify` on `d9f2cce` (run 39003023704) failed on the same outage, wider: 17
  venues answered 503 or did not connect, and "Render check against the LIVE
  slate" failed too, one venue's weather timing out at 8 s. One re-run of the
  failed job (attempt 2) passed, both steps included.
- `verify` on `b6f1fcf` was cancelled by the next push (`cancel-in-progress:
  true` on `verify-${{ github.ref }}`), not failed.

## Delegated decisions, for the owner to ratify

1. **Flow's full-time witness route was removed.** Ruling 2(b) named it, and the
   measurement says FT at 90' cannot tell a finished match from the break before
   extra time. The witness comes only from the kickoff, two FIELD days gone.
2. **Own-goal rows and shootout kicks are set aside** from Flow and counted
   (73 and 8 on run 38984743564).
3. **A shot with no xG leaves its whole capture unread** until the owner says
   how a run treats it (4 captures).
4. **Tactical Lock's field names** `suppressed` and `bestChanceAllowed`: which
   meaning `suppressed` carries (held to, or taken away) is the owner's.
5. **Second Wind's label word and fourth case: RULED by the owner on
   2026-10-16** (`545b589`). `PopulationRate` is retained; `Fatiguing` is
   renamed `TrailingRate`, implemented in `d9f2cce`
   (`outbox/2026-10-16-second-wind-trailing-rate.md`), with a mutation that
   puts the old word back in the label and goes red. Left open by that
   ruling, and still the owner's: whether `SecondWind` becomes `LeadingRate`.
6. **Gravity Well is not position-adjusted**; route runner and coverage are a
   line-geometry proxy, because `wasRunningRoute` and `wasInitialPassRusher` are
   not in the artifact.

Follow-ups with their own CC-CMDs, FILED:
`docs/CC-CMD-2026-10-16-second-wind-denser-measure.md`,
`docs/CC-CMD-2026-10-16-sealed-drama-string-path.md`, and
`docs/CC-CMD-2026-10-17-weather-live-http-outage.md` (the verify step above:
its tolerance covers a first request that throws, not an HTTP failure).

## Owner steps this session cannot take

- **Rotate the relay shared secret** (`rotate-relay-secret.yml`, `confirm=ROTATE`)
  **and the Odds API key at the provider.** Both are in field-laboratory's git
  history, which became public on 2026-10-16. A session dispatch of the
  rotation was refused by the permission policy, correctly; it is a
  secret-store write.

## Integration state (Rule 65)

- **Relay contract:** `GET /nflverse/bdb_event_frames.json`, R2-first
  (`nfl/<year>/`, `X-Source: r2`), raw-GitHub fallback, `max-age=86400`. Its
  served bytes against the committed capture: equal (lab run 38995271211,
  HTTP 200, `X-Source: r2`, 1,816,808 bytes, sha256 `6be5a282…d249`). Its
  `STAGED` marker came off in relay `62b0dce`; the deployed route re-verified
  11/11 after it (run 38996158837).
- **Client consumer:** none. Nothing renders any of the four; each witness is
  a requirement a renderer inherits, not a tested path to the DOM.
- **Status:** the four metrics VERIFIED in the lab against committed real
  captures; UNTESTED in any renderer, by design of this CC-CMD.
