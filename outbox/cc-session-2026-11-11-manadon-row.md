# Session 2026-11-11 — the Manadon Sports Hub hand row (Task 3 of `docs/CC-CMD-2026-11-09-venue-review-remainder.md`)

Session doc (Rule 67). The instruction was "Manadon Sports Hub approved" (owner, Wed 2026-11-11 09:50 ET). It was read as the owner's yes to a hand row, which needs "the owner's yes with the evidence beside it", as the three hand rows of 2026-10-25 had. The evidence was assembled after the instruction and is in `outbox/venue-manadon-*-2026-11-11.*`. Times are UTC unless marked.

## State when this was committed (about 16:30Z; the manifest at the end is edited as it changes)

- **Built and pushed:** the row, the Suite change and four mutation entries, in `7e1a7e5` on main.
- **CI has not confirmed it.** verify run 43048578660 (attempt 1) is red because `Install Chromium` failed on an apt name-resolution outage (the Ubuntu mirror hosts do not resolve on any runner measured since 13:59Z), and the step `The F# suite, on the F# harness` did not run. `deploy` and `live-check` concluded `skipped`, so the row is not on the live page. The rerun is waiting for the outage to end; it is `docs/CC-CMD-2026-11-11-runner-apt-mirror-dns.md` Task 1.
- **So the Done-when of Task 3 is met locally and not yet in CI.** The local artifact is the suite at 370 of 370: on the tree that became `7e1a7e5`, and again on a fresh `npm run build` of HEAD `eabb568c`, finished 16:16:23Z and the suite 16:16:28Z (`src/` and `scripts/` are identical between the two commits: `git diff --stat 7e1a7e5 HEAD -- src scripts` is empty). The CI artifact that will close it is the step `The F# suite, on the F# harness` green on a verify attempt for `7e1a7e5` or a later deployable commit.
- **To finish if this session ends first:** the two commands under Task 1 of that CC-CMD (probe until the three Ubuntu hosts resolve, then `rerun-failed-jobs` on run 43048578660), then read verify, deploy and live-check by REST and record them in the manifest at the end of this file.

## HEAD progression

`214ec5ed` (a bot commit, 14:42:07Z, the tree the work started on) → `7e1a7e5` (the src commit: committed 15:26:54Z, its push runs created 15:27:42Z) → two bot commits (15:42Z) → `eabb568c` (the outage CC-CMD, docs only, committed 16:09Z) → the commit that carries this file.

## What each commit did

- **`7e1a7e5`** (8 files, +667 −11). `src/Venues.fs` +18: `at "Manadon Sports Hub" 50.4091 -4.1453 OpenAir "Europe/London"` outside the generated block, with its evidence in the comment above it. `src/Suite.fs`: the check "the grounds on the 2026-11-09 slate include a table row" lost its `notYetCarried` exemption (its must-fail slate is now `Bell Centre`, a recorded arena, with `Some Unlisted Park`, which is neither a row nor an arena; the slate it replaced was `Manadon Sports Hub` with the same unlisted park), and a new check, "Manadon Sports Hub is an open-air row at Plymouth, in Europe/London", holds the row's roof, zone and point (it compares through `Weather.coordKey`, three decimals, to the OS postcode point of PL5 3FD; its must-fail is Anfield, open air in the same zone, so it fails on place). `scripts/mutation-check.mjs` +39: four entries, `venue-manadon-row-deleted`, `-roof-covered`, `-moved` (longitude 0.001 degrees) and `-zone-changed`, the same four U.S. Bank Stadium has. Five files under `outbox/`: the probe answers, the page quotes, the evidence script, its mutation runner and its printed results.
- **The exemption was removed, not emptied.** That was a choice made here so that nothing on the slate can be exempt again (the live-slate check must never become a quiet pass). If the owner rejects the row after reading the evidence, `git revert 7e1a7e5` undoes it in one commit: tried on 2026-11-11 in a throwaway worktree at HEAD `eabb568c`, it applies with 0 conflicts, puts `notYetCarried` back in `src/Suite.fs`, removes the row and the four mutation entries, and deletes the five evidence files from the tree (they stay in history).
- **`eabb568c`**: `docs/CC-CMD-2026-11-11-runner-apt-mirror-dns.md`, filed, nothing built.

## What the row stands on

| source | what it gives | read how |
|---|---|---|
| Plymouth City Council, premises licence register | "Manadon Sports and Community Hub, 121 St Peters Road, Plymouth, Devon, PL5 3FD", licence PA1061 from 25/10/2019: the hub's postcode | Exa fetch, hand-copied into `venue-manadon-pages-2026-11-11.txt` ("a read, not a capture") |
| OS postcode directory, through postcodes.io (family 1) | PL5 3FD at 50.40913, -4.145326 (E 247660, N 58786, `quality` 1); PL5 3JG at 50.409761, -4.145762 (76.7 m from it) | `probe-url.yml` run 43044457109, answer kept in `venue-manadon-probe-2026-11-11.txt` |
| Sport England Active Places listing of the Manadon Football Development Centre, PL5 3JG (family 2) | OS grid 247664.88, 58727.59: 58.6 m from the PL5 3FD point and 133.8 m from PL5 3JG's centre, so it is neither postcode's centre | the sports-facilities.co.uk directory of that data (Sport England's own page was not read) |
| Plymouth Argyle, "Manadon Heaven", 2018-01-12 | the site is "off St Peters Road, Plymouth, PL5 3JG"; the project would "replace the current sand-dressed Astroturf" | Exa fetch, hand-copied |
| OpenStreetMap through Nominatim and Photon | nothing named at either postcode point or under the licensed name; Photon answered a place in Northern Ireland. Not counted. | the same probe file |
| Zone | geo-tz 8.1.4 gives `Europe/London` at the 4-decimal point and at both postcode points (control: Hoboken NJ gives `America/New_York`); Open-Meteo at the point says `Europe/London` | geo-tz: `outbox/venue-manadon-zone-geotz-2026-11-11.txt`, a re-run of 16:18Z with two controls and one doctoring that went red (the original reading, taken while the row was built, was not committed, and the comment above the row in `src/Venues.fs` points at the evidence files for it; that gap is closed by this file and was open until now); Open-Meteo: probe run 43044457109 |
| Roof | open air: a floodlit 3G pitch, two grass pitches, cricket wickets | the Plymouth Argyle "Official Opening" page and the council's news page, hand-copied |

Both families sit inside the sourcing rule's 0.02 degree box (about 2224 m north-south by 1419 m east-west at that latitude). The evidence script, `outbox/venue-manadon-evidence-2026-11-11.mjs`, reads only the two files above and prints `parsed 17 of 17 URL blocks` and 8 of 8 checks; its `--self-test` passes 14 of 14 (a baseline, ten doctorings of the evidence, two guards on its own harness, and a line that counts the doctorings, 10 of 10), and `outbox/venue-manadon-evidence-mutations-2026-11-11.mjs` breaks the script nine ways and requires each to go red by the named check (9 of 9). Re-run between 16:14Z and 16:16Z, each of the three commands printed exactly the section of `venue-manadon-evidence-2026-11-11.txt` that holds its output (compared with `cmp`, section by section: 30, 16 and 11 lines).

## Local gates, on the tree that became `7e1a7e5` unless dated

- `npm run build`: exit 0, 23 s, 0 warnings. `node build/VerifyMain.js`: **370 of 370** (369 before). The only red line it prints is the suite's own deliberate `FAIL      broken` counting probe, in every run.
- `node scripts/mutation-check.mjs --anchors`: checked 1264 of 1267, 0 stale (1260 of 1263 before the four entries). With the row moved by hand it reports 4 stale, the four Manadon ids by name; restored, 0.
- The four new registry entries, run through the harness (`--ids`, 44 s): 4 of 4 caught, 0 survived, each with a changed compiled digest, `src/Venues.fs` restored byte for byte: `outbox/venue-manadon-mutation-entries-record-2026-11-11.json`.
- Five source mutations on the pushed tree (15:49Z to 15:52Z), baseline 370 of 370 first: 5 of 5 red by exactly the named check(s): `outbox/venue-manadon-source-mutations-2026-11-11.txt`. The script that ran them is not committed (the file says so).
- **A limit of the slate check, measured 16:23Z to 16:24Z on HEAD `eabb568c`** (`outbox/venue-slate-check-clauses-2026-11-11.txt`): deleting either clause of "the grounds on the 2026-11-09 slate include a table row" leaves the suite at 370 of 370 (2 of 2 deletions of that one check; the compiled `build/Suite.js` differed from the baseline's each time, so a different program was built and passed; `src/Suite.fs` restored by sha). The must-fail slate fails on both clauses at once, so neither is held by itself. The slate it replaced had the same shape (read from `git show 7e1a7e5^:src/Suite.fs`, not measured), so this commit did not weaken it; the 2026-10-20 slate check ends with the same line and was not measured. Not changed (Rule 69). A deleted Manadon row is still caught while the clauses are intact: the slate check and the Manadon check both went red in the row-deleted mutation above.
- `npm run check:venue-sourced`: self-test 10 of 10, check 6 of 6 (384 accepted). `python3` over the 13 steps of `guards.yml`: 13 of 13, on the tree before `7e1a7e5` and again before `eabb568c`. The pre-commit hook passed on both commits.
- **Not run:** `verify-full`, the confidence gate. The run measured in `outbox/verify-full-runner-timing-2026-11-06.md` took 46 min 43 s on eight shards (run 42200547950, 2026-11-06; a later run's time was not read), and the step that is failing now, `Install Chromium`, is one it runs too. Its Monday 2026-11-16 06:00Z run is the first to exercise the four new entries in the gate.

## CI

| run | commit | result |
|---|---|---|
| guards 43048578569 | `7e1a7e5` | success |
| verify 43048578660, attempt 1 | `7e1a7e5` | **failure**: 40 steps succeeded, 2 failed (`Install Chromium`, 606 s; `Render check against the LIVE slate`), 63 skipped, including the F# suite. The F# build with 0 warnings, "Every mutation's anchor still exists" and "The sourced venue rows match the sourcing run" ran and passed. |
| deploy 43050963610, live-check 43051002729 | `7e1a7e5` | `skipped`; nothing deployed |
| guards 43055482409 | `eabb568c` | success |
| probe-url 43051338510, 43051864112, 43053297493, 43054757439, 43056254585, 43057737585 | main | each ends red by probe-url's own rule: all three Ubuntu hosts "Could not resolve host" (15:44Z, 15:47Z, 15:56Z, 16:05Z, 16:14Z, 16:23Z); the loop's later probes are in the manifest |

The cause, its onset (between 13:11Z and 13:59Z; the last good install was 13:10:55Z), the same failure in a verify-full of 13:59Z on another head, and three options for the owner are in the CC-CMD above, with the command that tested each premise. My wait script watched only the first job of the run, and for a moment read the small `drama-backfill` job's success as verify's; the run-level conclusion is what counts, and I corrected it in the chat before anything was built on it.

## Premises this session did not establish (Rule 100)

None of these is reported as a finding; each is a limit on the evidence above.

| premise | status |
|---|---|
| postcodes.io `quality` 1 means the Ordnance Survey positional quality of "within the building of the matched address" | not established: postcodes.io's lookup documentation does not define the number; the OS definition is of Code-Point Open's own indicator |
| Active Places' grid reference is independent of the OS postcode directory | inferred only from its not being either postcode's centre (58.6 m and 133.8 m away); both could draw on one OS address dataset |
| the Active Places record is this site | rests on the shared postcode PL5 3JG, the club's 2018 page giving that postcode for the site, and its "replace the current sand-dressed Astroturf"; Sport England's own page was not read |
| OpenStreetMap names nothing there | only for the queries made: Overpass never answered (HTTP 406, then a 30 s timeout), so the answer rests on Nominatim and Photon |
| Nominatim's postcode point (146.7 m from the row) is a different family | not established where Nominatim takes its GB postcodes from, so it is not counted |
| a venue from ESPN | the FIELD ESPN lookup returned no venue for the tie, so ESPN is not among the sources |
| the three probe answers that each reported 1873 bytes | unexplained coincidence; not used |

An inference, not a measurement: a position error of tens of metres is small beside Open-Meteo's grid cell for that point, whose centre (50.408367, -4.135742) is about 0.7 km from the row, so the weather chip should not depend on which source is right. Nothing here measured a forecast at either point.

## Integration state (Rule 65) and the staged item (Rule 74)

- **Relay contract:** none; the lab has no relay endpoint for this.
- **Client consumer:** `Venues.tryFind` and the weather chip in the page the lab builds; the match is an exact name, and the archive spells it "Manadon Sports Hub" (the D1 row below).
- **Integration status: UNTESTED on a rendered card.** The row is compiled into `build/Venues.js` and the suite exercises it; no card at that ground has been rendered.
- **STAGED: a weather chip on a card at "Manadon Sports Hub".** Blocked by two things: `7e1a7e5` is not deployed (the outage above), and the archive holds no fixture there after the 2026-11-09 tie (D1 `field-archive`, read-only, through the connector, 2026-11-11 about 16:20Z, both tables: one row, `FA Cup_2026-11-09_e401931098`, `start_time` 2026-11-09T19:30Z, score 2 to 1, `finalized_at` 2026-11-09 22:15:26). Unblocked when a deploy of `7e1a7e5` or later is green AND a game with that venue is on a slate. Verify: (1) through the D1 connector on `cc49101c-0569-4d41-8e7a-be139cde4f26`, `SELECT id, start_time FROM regular_season_games WHERE venue = 'Manadon Sports Hub' AND start_time >= '<that day>'` returns the fixture; (2) the log of `live-check` on a run whose slate has that card shows `PASS` for both "every card whose venue the table knows carries a live chip" and "the chips all filled within the wait" (their names in `scripts/render-check.mjs`, read-only here).

## Open for the owner

- The three options of `docs/CC-CMD-2026-11-11-runner-apt-mirror-dns.md` (new today).
- Unchanged, not touched: whether a partial roof (Wembley's `Retractable`) is a class of its own; whether to build on the categories; the forecast store schema; the bounded repeat for the plain `npm run build` in `live-check`, `verify` and `deploy`; filing `outbox/fable-crash-upstream-report.md`; the choice under "Options" of `docs/CC-CMD-2026-11-10-live-chip-refused-payload.md` (its Task 1 was approved and run by another session on 2026-11-11, the first run was dry, the wet re-run is Saturday 2026-11-14); Task 4 of the 2026-11-09 CC-CMD (the other review venues: 71 of the 75 review rows have no table row, counted today by matching each review name against `at "<name>"` in `src/Venues.fs`).

## Manifest (Rule 87.5)

- Commits: `7e1a7e5` (src and evidence), `eabb568c` (the outage CC-CMD), and the commit that carries this file.
- Runs: guards 43048578569 and 43055482409 (success); verify 43048578660 attempt 1 (failure, cause above); deploy 43050963610 and live-check 43051002729 (skipped).
- Done-condition probe output: **pending.** The suite at 370 of 370 is local. The CI artifact is not yet produced; this line is edited, not left stale, when it is.
- Genuine residual: the runner outage, which is not this change's. Nothing else is deferred: the rerun is Task 1 of the CC-CMD and the options are the owner's.
