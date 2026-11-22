slate 2026-11-21 — 113 game(s), 462 brief(s), 113 card(s)

final games carrying BOTH a during-play and an after-play brief: 71

PASS  every final game with both phases shows its after-play brief (71 testable)

rows carrying `cards, duplicated upstream`: none (0 of 71 printed rows)

checked 71 testable of 113 games

# The brief phase on the first Saturday evening after the landing, read 2026-11-21 20:32 ET

Source: scheduled task `trig_01QL6mcB9jqiJPWyBPEXh9Sn` (set 2026-11-15 for Saturday 2026-11-21 20:30 ET, fired 2026-11-22 01:30:10Z), `docs/CC-CMD-2026-11-15-brief-phase-card-identity.md`, Task 7. The step under test is "A finished game shows the brief written after it finished" (`scripts/brief-phase-live-check.mjs`), which joins a game to its cards by the id the page writes on every card, since the landing `4b66f5d7` (2026-11-15 08:59 ET). Before it, per the CC-CMD, the step matched by team-name substring and was red in 6 of 6 renders from 2026-11-14 23:06Z (not re-read here).

## Answer

PASS. 71 testable of 113 games, 0 red rows, 0 rows carrying `cards, duplicated upstream`. The premise held: on this slate the step is PASS with N testable at 1 or more, and no row fails on another game's card.

The run: `live-check` 44971852400, event `workflow_dispatch` on `main` at `642d9799`, dispatched 2026-11-22 01:31:24Z (20:31:24 ET), created 01:31:25Z, completed `success` at 01:32:58Z, Azure centralus, job 137053167709, step 14 `success`, with no `brief_date` (the page showed the current ET day). It is the only dispatch of this workflow since the follow-up fired. The slate line prints 2026-11-21 and `TZ=America/New_York date +%F` read 2026-11-21 at 20:30:51 ET. `4b66f5d7` is an ancestor of `642d9799` (`git merge-base --is-ancestor`, exit 0). The slate line was printed at 01:32:32Z.

## Coverage

- Rows: 71 printed, 71 parsed; every one reads expected `game_recap`, shown `game_recap`. Red rows (shown differs from expected, `NO CARD CARRIES THIS GAME'S ID`, or `duplicated upstream`): 0. `NOT OBSERVABLE` lines: 0. The row count, the both-phases count (71) and the testable count (71) agree.
- The step's self-test passed in the same step, 34 of 34, including the checks that it can fail: `THE DEFINED FAILURE STILL FAILS THROUGH THE JOIN`, `a game whose id is on no card has none, whatever team names its names are inside`, `an id is compared whole: G1 does not take the card of G10`, and the 2026-11-14 slate replay (`the substring predicate takes 2, 3 and 3 cards for the three red games`; `the id join takes ONE card for each of the three red games, its own`).
- The step prints only the 71 testable rows. The other 42 games (113 minus 71) are not named and carry no status in this log. The slate's sections, from the `live-grouping-check` step of the same job: CFB(58) NHL(16) EPL(7) Bundesliga(6) MLS(6) NBA(6) Ligue 1(5) La Liga(4) Serie A(4) golf(1).

## Name collisions read from the printed games list

Read from the 142 distinct team names in the 71 printed rows with a plain, case-insensitive substring test (shorter name of 4 or more characters). It finds 10 pairs. Each pair has both of its games among the printed rows, and every one of those games reads `game_recap`.

| shorter name | inside | game with the shorter name | game with the longer name |
|---|---|---|---|
| Alabama | South Alabama | Chattanooga @ Alabama (game_recap) | South Alabama @ Southern Miss (game_recap) |
| Florida | Florida St | Vanderbilt @ Florida (game_recap) | NC State @ Florida St (game_recap) |
| Houston | Sam Houston | Houston @ West Virginia (game_recap) | MTSU @ Sam Houston (game_recap) |
| Illinois | N Illinois | Iowa @ Illinois (game_recap) | N Illinois @ N Dakota St (game_recap) |
| Kansas | Arkansas | BYU @ Kansas (game_recap) | Arkansas @ Texas (game_recap) |
| Tennessee | Tennessee Tech | LSU @ Tennessee (game_recap) | Tennessee Tech @ Mississippi St (game_recap) |
| Texas | North Texas | Arkansas @ Texas (game_recap) | North Texas @ Tulane (game_recap) |
| Texas | Texas A&M | Arkansas @ Texas (game_recap) | Texas A&M @ Oklahoma (game_recap) |
| Texas | Texas Tech | Arkansas @ Texas (game_recap) | Texas Tech @ Baylor (game_recap) |
| Virginia | West Virginia | North Carolina @ Virginia (game_recap) | Houston @ West Virginia (game_recap) |

Of the three collisions behind the 2026-11-14 reds, Alabama and South Alabama are both printed (`Chattanooga @ Alabama`, `South Alabama @ Southern Miss`), Virginia and West Virginia are both printed (`North Carolina @ Virginia`, `Houston @ West Virginia`), and Michigan is printed (`UCLA @ Michigan`) while Michigan St is not among the printed rows. `Kansas` inside `Arkansas` matches as a substring and shares no word.

## The red rows

None. There is no table.

## The step's lines, verbatim

Log lines 871 to 998 of job 137053167709, from `Run node scripts/brief-phase-live-check.mjs --self-test` to the line before the next `##[group]Run`. The Actions timestamps and the ANSI colour codes on the two command lines are removed; nothing else is changed.

```
##[group]Run node scripts/brief-phase-live-check.mjs --self-test
node scripts/brief-phase-live-check.mjs --self-test
URL="https://field-laboratory.jeffunglesbee.workers.dev/${BRIEF_DATE:+?date=$BRIEF_DATE}" node scripts/brief-phase-live-check.mjs
shell: /usr/bin/bash -e {0}
env:
  DOTNET_ROOT: /usr/share/dotnet
  BRIEF_DATE: 
##[endgroup]
PASS  a final game with both phases expects the after-play kind
PASS  the espn: prefix resolves to the same game
PASS  an UNFINISHED game expects nothing, whatever it carries
PASS  a final game with only ONE phase expects nothing — no preference to test
PASS  an empty brief is not a brief to prefer
PASS  one Final card carrying the recap passes
PASS  TWO cards both carrying the recap still passes
PASS  ...and says so, so the duplication is not invisible
PASS  a Final card plus an unplayed STUB passes on the Final one
PASS  THE DEFINED FAILURE STILL FAILS: a during-play kind on a final game
PASS  ...and it fails even when a correct card sits beside it
PASS  no card carrying the recap at all is a failure
PASS  no matching cards is left for the caller to describe
PASS  diacritics normalise so a name is comparable
PASS  punctuation normalises — St. Louis and St Louis are one name
PASS  SHORT WORDS ARE NOT TOKENS, or FC would match every club
PASS  overlap finds a short name inside a long one
PASS  overlap is 0 for an unrelated card
PASS  THE BUG IS DETECTED: a during-play kind on a final game is not the expectation
PASS  2026-11-14 SLATE: the substring predicate takes 2, 3 and 3 cards for the three red games
PASS  ...each of those games has its OWN card among them, and it reads Final / game_recap
PASS  ...and the unchanged verdict fails all three, on a card of ANOTHER game
PASS  the evidence has one line per card the verdict looked at, not the first
PASS  ...each line carries the card's id, team line, status and kind
PASS  ...a card with no kind says null rather than leaving a gap
PASS  ...and no cards means no lines
PASS  2026-11-14 SLATE: the id join takes ONE card for each of the three red games, its own
PASS  ...and the unchanged verdict passes all three on it
PASS  ...saying nothing of duplication about a game that has one card
PASS  THE DEFINED FAILURE STILL FAILS THROUGH THE JOIN: the game's own card reading game_live
PASS  a card carrying no id belongs to no game, not even to a game with no id
PASS  a game whose id is on no card has none, whatever team names its names are inside
PASS  an id is compared whole: G1 does not take the card of G10
PASS  two cards carrying one id are both returned: a filter, never a find

34/34 checks passed

  slate 2026-11-21 — 113 game(s), 462 brief(s), 113 card(s)
  final games carrying BOTH a during-play and an after-play brief: 71

  game                                    expected      shown
  Bucks @ 76ers                           game_recap    game_recap
  Oilers @ Hurricanes                     game_recap    game_recap
  Blackhawks @ Flames                     game_recap    game_recap
  Fulham @ Man City                       game_recap    game_recap
  Nottm Forest @ Bournemouth              game_recap    game_recap
  Sunderland @ Aston Villa                game_recap    game_recap
  Leeds @ Chelsea                         game_recap    game_recap
  C Palace @ Coventry                     game_recap    game_recap
  Ipswich @ Spurs                         game_recap    game_recap
  Arsenal @ Newcastle                     game_recap    game_recap
  Philadelphia @ New England              game_recap    game_recap
  Portland @ Dallas                       game_recap    game_recap
  Columbus @ Miami                        game_recap    game_recap
  Deportivo @ Alavés                      game_recap    game_recap
  Valencia @ Rayo                         game_recap    game_recap
  Betis @ Sevilla                         game_recap    game_recap
  Celta Vigo @ Real Madrid                game_recap    game_recap
  Cagliari @ Como                         game_recap    game_recap
  Lecce @ Lazio                           game_recap    game_recap
  AS Roma @ Parma                         game_recap    game_recap
  Torino @ Napoli                         game_recap    game_recap
  RB Leipzig @ Union Berlin               game_recap    game_recap
  Paderborn @ Leverkusen                  game_recap    game_recap
  Dortmund @ Gladbach                     game_recap    game_recap
  Hoffenheim @ Frankfurt                  game_recap    game_recap
  Freiburg @ Elversberg                   game_recap    game_recap
  Stuttgart @ Schalke                     game_recap    game_recap
  PSG @ Nice                              game_recap    game_recap
  Auxerre @ Monaco                        game_recap    game_recap
  Toulouse @ Lens                         game_recap    game_recap
  Lyon @ Lille                            game_recap    game_recap
  Brest @ Strasbourg                      game_recap    game_recap
  BYU @ Kansas                            game_recap    game_recap
  Wake Forest @ Georgia Tech              game_recap    game_recap
  Ohio State @ Nebraska                   game_recap    game_recap
  Vanderbilt @ Florida                    game_recap    game_recap
  Wofford @ Ole Miss                      game_recap    game_recap
  Colorado @ Cincinnati                   game_recap    game_recap
  Syracuse @ Boston College               game_recap    game_recap
  Northwestern @ Minnesota                game_recap    game_recap
  Wisconsin @ Purdue                      game_recap    game_recap
  East Carolina @ Army                    game_recap    game_recap
  Memphis @ Navy                          game_recap    game_recap
  North Texas @ Tulane                    game_recap    game_recap
  North Carolina @ Virginia               game_recap    game_recap
  Houston @ West Virginia                 game_recap    game_recap
  Tennessee Tech @ Mississippi St         game_recap    game_recap
  Western KY @ Liberty                    game_recap    game_recap
  Chattanooga @ Alabama                   game_recap    game_recap
  Charlotte @ Tulsa                       game_recap    game_recap
  Missouri St @ Jax State                 game_recap    game_recap
  MTSU @ Sam Houston                      game_recap    game_recap
  Iowa @ Illinois                         game_recap    game_recap
  UL Monroe @ App State                   game_recap    game_recap
  Coastal @ Louisiana                     game_recap    game_recap
  Delaware @ New Mexico St                game_recap    game_recap
  FIU @ Kennesaw St                       game_recap    game_recap
  UCLA @ Michigan                         game_recap    game_recap
  Arkansas @ Texas                        game_recap    game_recap
  Indiana @ Washington                    game_recap    game_recap
  LSU @ Tennessee                         game_recap    game_recap
  Texas Tech @ Baylor                     game_recap    game_recap
  Samford @ Auburn                        game_recap    game_recap
  NC State @ Florida St                   game_recap    game_recap
  Rutgers @ Penn State                    game_recap    game_recap
  Old Dominion @ UConn                    game_recap    game_recap
  Texas A&M @ Oklahoma                    game_recap    game_recap
  N Illinois @ N Dakota St                game_recap    game_recap
  GA Southern @ Troy                      game_recap    game_recap
  Georgia St @ Marshall                   game_recap    game_recap
  South Alabama @ Southern Miss           game_recap    game_recap

PASS  the page reports a real viewed date, not a pinned capture
PASS  the deployed page rendered cards at all
PASS  the page logged no errors while rendering
PASS  the relay served /context/date/2026-11-21
PASS  every final game with both phases shows its after-play brief (71 testable)

5/5 checks passed
```

## What this does not establish

1. One run on one evening. It reads the id join on the 2026-11-21 slate as rendered at 20:32 ET and says nothing about other slates, other sports mixes, or the daily schedule beat (whose own fix is filed as `docs/CC-CMD-2026-11-15-live-check-daily-beat-late.md`).
2. Whether games were in play beside the finals. The log has no per-status count and the step does not print the 42 games it did not test, so "several finals beside games still in play", the CC-CMD's reason for choosing a Saturday evening, is not something this log shows.
3. Whether this slate separates the id join from the old substring predicate. Every collision visible among the printed rows pairs two games that both read `game_recap`, and the step's own self-test says two recap cards still pass (`TWO cards both carrying the recap still passes`), so, by that rule, those pairs would not have turned the old predicate red either. The old reds needed a colliding card of another game that was not a recap. Whether any printed game collided with one of the 42 unprinted games is not visible here.

## Observed, not investigated

The render step in this run was invoked as `node scripts/render-check.mjs --recorded-weather test/open-meteo-recorded.json` (log line 371). Commit `684e55e5` (2026-11-18 20:38Z, "feat: split the live weather check, recorded bodies gate the chips, live availability is reported") added the flag. The first weather red read in `outbox/tls-first-red-2026-11-16.md` predates it. This run concluded `success`. Whether that commit retires the weather reds is not read here.

## Reproduce

```
gh run view 44971852400 --json status,conclusion,jobs
gh api repos/jeffunglesbee-create/field-laboratory/actions/jobs/137053167709/logs | grep -aE 'slate 2026-11-21 |final games carrying BOTH|every final game with both phases shows'
```

Expected: `success`, and three lines: the slate line, the both-phases line and the `PASS` line quoted at the top of this file.
