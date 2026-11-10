# Session 2026-11-10 — Task 3 of the venue remainder: the 17 grounds the archive gained, 9 of them rows, Manadon Sports Hub in review

**Verdict: Task 3 is met on the second clause of its Done-when and not on the first.** The sourcing rule accepted 9 of the 17 grounds the archive had taken in since 2026-10-22 and put 8 in review, Manadon Sports Hub among them. Manadon stays in `notYetCarried` and goes to the owner with its candidates. The false premise in the Suite comment is corrected. The change is deployed and the deployed page's live slate passes. One verify attempt on the way was red at the live-slate step on a refused weather payload; its cause is not established, and it is filed, not fixed.

Owner order: "Task 3 approved" (Tue 2026-11-10 11:42 ET), `docs/CC-CMD-2026-11-09-venue-review-remainder.md`, Task 3. Nothing from its not-approved list was started: Task 4 Step 1 and the rest of Task 4, the EPL CC-CMD's Phase 2, client fixes, the Serie A `live-check` red, any relay change, `docs/dead-cron-baseline.json`, `scripts/render-check.mjs`, the forecast store, building on the categories, and the compiler-crash repeat's width.

HEAD progression: `f10bef6` → `722e101` (the list, its tools and its evidence) → `b266e5f` (the runner's data commit) → `faa831d` (the table, the Suite comment, the judge's fix, its report) → `40ea2f1` (the live-chip CC-CMD and its evidence, rebased onto `aa0dfe5`, another session's Fable-prefill commits, none of which changes `src/Weather.fs`, `src/WeatherView.fs`, `src/Venues.fs`, `src/Suite.fs`, `scripts/render-check.mjs` or `scripts/weather-live-check.mjs`) → the commit carrying this record (a commit cannot hold its own hash: `git log -1 -- outbox/cc-session-2026-11-10-manadon.md` names it). Bots committed between mine, as they always do.

## The list

`722e101` rebuilds `data/venue-source-candidates.json` as the 442 old entries unchanged plus the 17 grounds the archive gained: 459 entries, no trailing newline, sorted by venue, source line extended once. The rows are the archive's, through the D1 connector on `field-archive` (`cc49101c-0569-4d41-8e7a-be139cde4f26`, the runner token being refused with 7403): `outbox/venue-candidates-gained-2026-11-10.json` holds the 18 rows it returned, SQL and meta beside them. One, Merkur Spiel-Arena, was already a candidate.

| what | measured |
|---|---|
| the 18 rows against the database | joined back by value, 18 of 18 exact. The first join said 17 of 18 because a timestamp in my retyped query was wrong; corrected and rerun, not explained |
| the shortcut query left nothing out | `outbox/venue-candidates-completeness-2026-11-10.sql`, the whole window with 630 names excluded: the remainder is the 17 and the placeholder `TBC` |
| the file is the regeneration | `outbox/venue-candidates-extend-2026-11-10.mjs` refuses a base not in the byte format or not sorted, throws on a duplicate venue or a comma in a home, and compares the written file to its own output byte for byte. Self-test 31 of 31; 20 mutations, each red by the check that names it. The harness is kept in the session's scratch space, not committed; it asserts each anchor is unique and applied before it reports. Re-run after the commits: `node outbox/venue-candidates-extend-2026-11-10.mjs` 10 of 10 (byte for byte), `--self-test` 31 of 31, harness "mutations run 20 of 20 chosen (20 defined); not caught or not applied: 0" |

## The run, and the judgement written before it

`venue-source.yml` mode `source`, run 42861596952 (job 129988885631, 17:07:15Z to 17:12:38Z), data commit `b266e5f`: of 459 candidates, 384 accepted and 75 in review, from 375 and 67.

`outbox/venue-task3-source-diff-2026-11-10.mjs` was written before the run to say what the run must look like. It printed AS PREDICTED (`outbox/venue-task3-source-diff-2026-11-10.txt`): "compared 442 of 442 old rows and 459 new rows, by name; only in old 0, only in new 17", "MOVED ... 0 of 442", "CHANGED ... 0 of 442; same status and roof but a different basis: 0", the 17 new rows exactly the list's, and the 9 accepted rows each inside the box and zone the judge states for their country (its own table, written before the run: a deliberately generous box, a wrong-continent test, not a survey). Self-test 24 of 24; 21 mutations, each red. Re-run after the commits: `--self-test` 24 of 24, harness "mutations run 21 of 21 chosen (21 defined); not caught or not applied: 0".

## The table and the Suite

`faa831d`: `node scripts/venue-sourced-check.mjs --write` wrote the 9 rows (Aggborough Stadium, Brunton Park, Hornchurch Stadium, J. Davidson Stadium, Meadow Park, Nethermoor Park, Silverlake Stadium, The Kassam Stadium, The Raymond McEnhill Stadium; all `OpenAir`, zone `Europe/London`) and the block's header line; 384 generated rows and 112 hand rows. The comment above the check "the grounds on the 2026-11-09 slate include a table row" said Manadon Sports Hub "is not a sourcing candidate: the archive holds no game there until this one is played, and the geocoders are not reachable from this sandbox". The first half was false: the archive took the fixture in on 2026-11-09 before it was played. The second half is true of this sandbox and beside the point, because the runner reaches the geocoders (`faa831d`'s message calls both halves false, which overstates the second; the commit is not rewritten). The comment is rewritten in the same commit (the CC-CMD said not to spend a verify and a deploy on it alone); the check's body is unchanged. Before the commit: `npm run build` exit 0 (35 s, no compiler error, per the commit message written at the time), `node build/VerifyMain.js` 369 of 369, `npm run check:venue-sourced` 6 of 6 and its self-test 10 of 10, `node scripts/mutation-check.mjs --anchors` "checked 1243 of 1246 mutation anchors; 0 stale" (the 3 are world mutations: `staleAnchors` skips any mutation with no `file` or no `find`, "world mutations carry no anchor in a file"), and the 13 guard steps 13 of 13.

## Manadon Sports Hub, for the owner

Done condition, first clause, probed on the main tip after the deploy (`faa831d` is an ancestor of HEAD): `grep -n 'let notYetCarried = \[ "Manadon Sports Hub" \]' src/Suite.fs` prints line 445, and `outbox/venue-source-results-latest.json` (run 42861596952, of 459, accepted 384, review 75) has Manadon in `review`, not in `accepted`, with `why` "no two independent families agree (photon)" and `unanswered` empty. Every source answered and none located it:

| source | answer |
|---|---|
| Wikidata | "no entity" (the search returned no results) |
| Nominatim | "no result" |
| Photon | one answer: "National Stadium", `leisure/stadium`, 1.304491, 103.8743437, which is Singapore: a wrong entity |

The CC-CMD's postcode lead (PL5 3FD, from a directory listing of the Argyle Community Trust's hub) was not probed. The fixture is `FA Cup_2026-11-09_e401931098`, Plymouth v Berkhamsted, created in the archive 2026-11-09 10:00:40. The three review rows of 2026-10-25 became hand rows on the owner's yes with the evidence beside them; Manadon has no position to put beside one.

Review now holds 75: 3 hand rows already (M. M. Roberts Stadium, Ryan Field, St James Park), 72 with no row, of which 64 are the earlier remainder and 8 are this run's: Crabble Athletic Ground, EnviroVent Stadium, Flamingo Park, Manadon Sports Hub, RAW Charging Stadium, Stade de France (an ambiguous name), The Stan Robinson Stadium, The Wyatt Homes Stadium.

## The red on the way

Verify run 42863538303 on `faa831d`, attempt 1, failed at "Render check against the LIVE slate" at 17:23:08Z: the page asked Open-Meteo 16 times (one per known ground), all 16 answered HTTP 200, and the decoder refused two bodies, `rain 0.1 exceeds precipitation 0` for The Kassam Stadium (one of the 9 rows) and `rain 0.6 exceeds precipitation 0.3` for Broadfield Stadium (not one of them). The run before (`722e101`, 15 requests at 17:12:00Z) had filled every chip with Broadfield in the set, and `faa831d` touches neither the decoder nor Broadfield's row. The same 16 requests from a runner (`probe-url` run 42865237075, created 17:28:02Z; its URLs equal the page's `forecastUrl` apart from `&format=csv`, 16 of 16) returned 0 of 16 inconsistent pairs. The raw bodies of the two refused payloads were not captured, so "inconsistent" is the decoder's report.

I did not call it a flake. What was done, in order: read the log; read the rule (`src/Weather.fs`, from 2026-08-11) and the CC-CMDs that touch the live chip (none covers a refused 200); measured the same requests on a runner; counted every failing attempt of every run of the two workflows that render the live slate since the rule was written (the accounting, with the run lists checked against the API's `total_count` and the failing sets compared as sets, is in `outbox/live-chip-rain-refusal-2026-11-10.txt`: the refusal appears in 1 of 44 failing attempts at verify's live-slate step, in 0 of the 8 readable at verify's weather step and in 0 of the 100 readable at live-check's render step; 2 and 9 logs have expired, HTTP 410, and are reported as not readable); then re-ran the failed job (`rerun-failed-jobs`, 17:33:02Z). Attempt 2 passed the step at 17:37:54Z, `deploy` run 42867015300 and `live-check` run 42867186531 followed green, and the deployed page's own render at 17:41:05Z made 16 requests and filled every chip. **The re-run is not a fix.** The cause of the inconsistent pair is not established. It is filed as `docs/CC-CMD-2026-11-10-live-chip-refused-payload.md` (Status FILED; Task 1 is a measurement on a runner, unblocked and not approved; the options wait on its result and on the owner).

## Corrections and things that went wrong, matter of fact

- `faa831d`'s message says the sourcing run took "5 minutes 41 seconds". The API gives the job 17:07:15Z to 17:12:38Z (5 minutes 23 seconds) and the run 17:07:11Z to 17:12:39Z. I could not reproduce the 5:41 from either. The commit is on `main` and is not rewritten; the CC-CMD and this record give the API's times.
- The judge's self-test failed once because state leaked from one case into the next; fixed with a copy. One mutation (`not-comparable-thrown`) made the judge throw instead of failing a check by name; it now fails "A NAME TWICE IN THE NEW RESULTS".
- The judge's report printed `undefined` for a source that answered in words ("no entity", "no result"). Fixed in `faa831d` with a self-test case that asserts the words appear and `undefined` does not.
- The evidence file's first draft said the table "gained 375 rows on 2026-11-09" and built an exposure argument on it. `git show` says 372 → 375 in `3429152`; the generated block has existed since `a4ff365` on 2026-10-22 (301 rows). The argument is removed.
- The same draft printed "API total_count" as the length of my own listing, a check that cannot fail. It now asks the API: verify 425 = 425, live-check 857 + 330 = 1187 = 1187.
- The draft searched one of the two live steps for the refusal. `scripts/weather-live-check.mjs` decodes a real payload with the same rule, and its 10 failing attempts in `verify` had not been searched: now 8 read, 0 refusals, 2 expired. It also inferred that the live-render step "did not run" in attempts that failed elsewhere; that was never checked and is now stated as not searched.
- 9 of live-check's 109 render-step logs (runs created 2026-08-12) are expired. The generator refuses to write the file with an unread log; each of the 9 was confirmed HTTP 410 by the API before it was allowed through.
- The first mutation of the new URL-equality check (in the evidence generator) was applied to a line the generator does not read (the workflow's own echo of its inputs) and the generator stayed green. It was retargeted at request lines; the check then failed on purpose twice, and the violation count went 0 → 1 when one reading was mutated.
- The new CC-CMD said `8fc40c3`'s message "cites no measurement of the payloads"; the message describes `scripts/weather-live-check.mjs`, which decodes a real payload on a runner. Corrected to "no measurement of how `rain` and `precipitation` relate". It also said the page's refetch path was not read; it is now: the page retries only `NeverAnswered`, not `Refused`, and option 5 (retry a refused 200 body once; the owner's call) is added.
- The runner probe was created at 17:28:02Z, not 17:28:03Z, and my earlier message to the owner gave the green run's time as "17:07Z", which was its creation; its live-slate step ran at 17:12:00Z.
- The first history scan of failed `verify` runs looked complete by count (158 of 158) and had skipped one run: the failure list shifted while I paged it, because the re-run above had just turned one failure green. A comparison of id sets, not counts, found it; the pass was redone in one go. A second loose end in the same work: a bare grep for "exceeds precipitation" matched 41 of 42 logs because the F# suite prints a check with that name; the pattern that counts requires the numbers.

## Verified and staged (Rule 61)

VERIFIED end to end: the data (D1 → list → runner → results → table) with the byte-for-byte and by-name checks above; the deployed page serves the 9 rows (`live-check` run 42867186531 on `ef1f33a`: its log reads "newest deployable:  faa831d" and "✓ LANDED — published ef1f33a is a non-deployable commit on top of faa831d; its tree contains every deployable change."; the page's render made 16 requests, where the table of `722e101` made 15 and the only one of the 9 added rows on that slate is The Kassam Stadium, and passed "every card whose venue the table knows carries a live chip" at 17:41:05Z). STAGED: nothing in this task. NOT DONE, and the owner's: Manadon Sports Hub as a row; the 72 other review rows (Task 4); the live-chip CC-CMD's Task 1.

## Integration state (Rule 65)

- **Relay contract:** none produced or changed. The relay is untouched.
- **Consumer:** the page's venue table (`src/Venues.fs`) and the live-slate render check, which derives its expectation from the same build.
- **Status:** VERIFIED on the deployed page. Known mismatches: none between the table and the check. The weather decoder's refusal of a 200 body is a condition the check reports; its cause is not established (filed above).

**Manifest (Rule 87).**

| | |
|---|---|
| Commits on `main` | `722e101` the list, tools and evidence; `b266e5f` the runner's data commit; `faa831d` the table, the Suite comment, the judge fix and its report; `40ea2f1` the live-chip CC-CMD and its evidence (docs and outbox only: no verify, no deploy); the commit carrying this record (same kind) |
| Runner | `venue-source` run 42861596952 (job 129988885631), success, 17:07:15Z to 17:12:38Z |
| Guards | `722e101` 42861579406, `faa831d` 42863538193, `40ea2f1` 42873011889 (18:13:36Z to 18:13:57Z): success. The guards run of the commit carrying this record is not in this record; a record cannot hold the result of the push that carries it |
| Verify | `722e101`: run 42861579266, success. `faa831d`: run 42863538303, attempt 1 failure (step 95, the refusal above), attempt 2 success, so the run's conclusion is success |
| Deploy | `722e101`: run 42862505829, success. `faa831d` (head `ef1f33a`): run 42867015300, success |
| Live-check | run 42867186531 on `ef1f33a`, success |
| Every run on `faa831d` when read | guards 42863538193 success; verify 42863538303 attempt 2 success; deploy 42864669971 skipped; live-check 42864685304 skipped; status 42864669768 cancelled; status 42864685790 success. The deploy and live-check that followed attempt 2 are 42867015300 and 42867186531 (head `ef1f33a`). Each id and conclusion was read back from the API on 2026-11-10 |
| Done condition, the probe output | Clause 2: `git show faa831d^:src/Suite.fs \| grep -c 'is not a sourcing candidate\|holds no game there'` printed 2 (the control: the old comment) and `grep -c 'is not a sourcing candidate\|holds no game there' src/Suite.fs` printed 0. Clause 1: `grep -n 'let notYetCarried = \[ "Manadon Sports Hub" \]' src/Suite.fs` prints `445:`, and the results file (run 42861596952, of 459, accepted 384, review 75) has Manadon in `review` with `unanswered` empty, so the clause is not met, and says why |
| Evidence file | `outbox/live-chip-rain-refusal-2026-11-10.txt`, assembled by a script from saved logs (not committed; GitHub already serves HTTP 410 for 11 of the logs the accounting reached). Every job id, step number and step time in it was read back from the API; the runner's URL check and the violation count were each made to fail on purpose |
| Genuine residual | The owner's, not deferred work: Manadon Sports Hub; Task 4; whether the live-chip CC-CMD's Task 1 is approved; the decisions already open (a partial roof's class, building on the categories, the forecast store's schema, the plain `npm run build`'s repeat, filing the Fable upstream report). The second CC-CMD this task owed (Rule 87.4) is `docs/CC-CMD-2026-11-10-live-chip-refused-payload.md` |
