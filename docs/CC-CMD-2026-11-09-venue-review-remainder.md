# Claude Code Command — the sourcing run's review remainder: a slate whose only grounds are review venues turns verify and live-check red

**Branch:** main — commit directly, do not create a feature branch or PR
**Repo:** field-laboratory
**Filed:** 2026-11-09 by CC, found when the verify run for table-v2's commits failed on "Render check against the LIVE slate"
**Confidence gate:** `npm run gate` >= 95 before any commit
**Status:** PARTIAL 2026-11-09 — Task 1 is done (verify run 42631741258 on `a18e26a`, the live-slate step green, artifact under it) and so is Step 0 of Task 4 (`outbox/venue-red-days-2026-11-09.md`: 0 of 60 days red); Task 3 is unblocked (the archive holds the Manadon Sports Hub fixture); Task 2 was approved ("Task 2 approved", 10:43 ET), run, MEASURED AND STOPPED (`outbox/venue-lead-whole-2026-11-09.md`): reading the whole paragraph changed 4 of 442 rows and 2 of the 4 are not safe (Center Parc Stadium open to dome on "replacing the Georgia Dome" in a paragraph that says "an outdoor stadium"; Joan C. Edwards Stadium open to dome on "indoor suites"), so per this CC-CMD's own stop rule nothing reached the table; the scripts, results and cache are restored byte for byte (`a6f99c2`, verify run 42658229991 green) and the owner then chose option 3 ("Option 3", 12:16 ET): a second structured roof source, the infobox Roof field, built first as a read-only runner probe (`scripts/venue-infobox.mjs`, `venue-source.yml` mode `infobox`) that writes none of the results, cache or table, with its go/no-go criteria written under Task 2 before any data exists; the rest of Task 4 waits for the owner's decision on each venue. Builds on `docs/CC-CMD-2026-10-20-live-slate-venue-coverage.md` and `docs/CC-CMD-2026-10-20-outdoor-venue-sourcing.md` (both DONE) and undoes nothing in them.

---

## What was measured

On 2026-11-09 verify's step "Render check against the LIVE slate" failed, and so did `live-check` against the page already deployed. All
four FAIL lines are the venue-table ones the 2026-10-20 CC-CMD recorded:

```
FAIL  the venue table covers at least one venue on this slate
      → Manadon Sports Hub, U.S. Bank Stadium — none of them in the 484-entry table (11 recorded indoor arena(s) not counted)
```

The slate was 8 NBA and 3 NHL games (11 recorded indoor arenas, nothing to observe), the FA Cup tie Plymouth v Berkhamsted, Bills @ Vikings and one
golf round. The two grounds that were neither arenas nor table rows were Manadon Sports Hub and U.S. Bank Stadium. The full record, with the run
logs quoted from the logs, is `outbox/venue-us-bank-stadium-2026-11-09.md`.

This is not the check being wrong. It is the check doing what the owner's ruling of 2026-10-20 designed it to do (below), on a day the 70-venue review
list from the sourcing run was the only thing outdoors on the slate.

## Premises, and the one command that tested each (Rule 100)

| premise | the command | what it said |
|---|---|---|
| The red is the slate, not table-v2 | `gh run view 42613880170 --log-failed`, live-check on the page deployed from `41a5cf2`, 12:03Z, before `46398f2` and `17d28eb` were pushed | the same four FAIL lines and the same two venue names; `git diff 9ba4c9f..17d28eb --stat -- src/Venues.fs` is empty |
| U.S. Bank Stadium was sourced, not missed | `node -e` over `outbox/venue-source-results-latest.json` | in `review`, not `accepted`: position agreed by four witnesses, `roof: null`, `lead: "U.S."` |
| The live slate's venue string is the candidate's string | the code points of both, side by side | identical, 17 code points |
| The roof went unknown because the lead was cut | `sed -n 609p scripts/venue-source.mjs`, then `decideRoof` run on the stub and on the real sentence | line 609 splits the summary at the first full stop followed by a space; the stub reproduces the committed review entry, the real sentence returns `dome` |
| It is not only this venue | the recorded leads in the results file | 9 of 442 are 14 characters or fewer, all cut at an initial or abbreviation; 8 of them were accepted as roof `open` on "inferred: the lead names no roof". Reproduced 2026-11-09 by `node outbox/venue-lead-whole-probe-2026-11-09.mjs 268140d`, which also tested the boundary: at any length 19 leads carry no is/are/was/were (18 accepted as open, 17 of those cut), and 14 more end like a name |
| A paragraph is still "the lead" in the script's sense (the body "describes proposals and other stadiums") | the runner re-run of `source` with the summary read whole (run 42651498788), then `node outbox/venue-lead-whole-diff-2026-11-09.mjs 0d3875c 76d6b45` | **Refuted for 2 of the 4 rows it changes.** 442 of 442 rows compared, only the lead changed; U.S. Bank Stadium (indoor) and Parken Stadium (retractable) are right, Center Parc Stadium ("an outdoor stadium ... replacing the Georgia Dome") and Joan C. Edwards Stadium ("indoor suites") are not |
| The infobox template is `Infobox stadium` (my recollection, before option 3 was built) | the Action API's parse tree for U.S. Bank Stadium, fetched through the Exa tool on 2026-11-09 (`action=parse&page=U.S._Bank_Stadium&prop=parsetree&section=0&format=jsonfm`) | **Refuted.** `<template lineStart="1"><title>Infobox venue\n</title>`. No template name is assumed: every top-level template whose title starts with Infobox is read and counted |
| The infobox has a Roof field and it carries the roof | the same tree, and the `Template:Infobox venue` documentation, same tool, same day | `<part><name> roof </name><equals>=</equals><value> [[Skylight]]\n</value></part>`. The documentation: "roof: Enter the roof type of the venue if indoors/covered (e.g. retractable, domed, translucent)". Free text, filled by convention only for a roofed venue. "Skylight" is not a roof class by itself, so what a value means is what the probe measures |
| MediaWiki escapes the XML it returns, so a real parser reads it | the tool shows the tags but decodes entities itself (a literal `<close></ref></close>` would be a mismatched tag to any parser), so the escape state is inferred and not seen | **Not tested from here.** The runner's probe parses every tree and commits the whole trees of five controls; a tree that does not parse is recorded as a failure with its head and tail, never as "no infobox" |
| An error page cannot pass as "no infobox" | `@xmldom/xmldom` 0.9.12 on `<html><body>Too Many Requests</body></html>` | it parses with no error and root `html`; the root check stops it (a self-test check, and the mutation `venue-infobox-root-not-checked`) |
| Wikipedia categories are a second structured source | `action=query&prop=categories` for five articles, same tool, same day | U.S. Bank Stadium: "Skylit stadiums in the United States"; Parken Stadium: "Retractable-roof stadiums in Europe"; NRG Stadium (redirects to Reliant Stadium): "Retractable-roof stadiums in the United States"; Center Parc Stadium and Joan C. Edwards Stadium: no roof category. Five articles only; the probe reads all of them |
| Manadon Sports Hub is not a sourcing candidate | `data/venue-source-candidates.json`, the results and the cache | no entry: the file was built 2026-10-22 and this fixture is newer than it (next row) |
| The archive holds no game at Manadon Sports Hub until the tie is played (this document's first draft said so) | Task 3's unblock query below, run through the D1 connector on 2026-11-09 | **Refuted.** It returns `regular, FA Cup, 1`. The row `FA Cup_2026-11-09_e401931098` (Plymouth v Berkhamsted, `start_time` 2026-11-09T19:30Z, `home_score` null, `finalized_at` null) has `created_at` 2026-11-09 10:00:40: the archive holds a fixture before it is played. The first draft stated this without running the query |
| The geocoders cannot be reached from the session | fetches of postcodes.io and Nominatim | `URL_NOT_ON_ALLOWLIST` for both |

## Rulings this builds on, and does not undo

- `live-slate-venue-coverage`: the owner chose option 1 (extend the table) and arenas recorded as indoor. Its closing line stands: whichever is chosen
  "must not turn 'the table covers nothing on this slate' into a quiet pass". `scripts/render-check.mjs` is not touched by any task here.
- `outdoor-venue-sourcing`: "The rest are in its review list, deliberately not here." Task 1 takes one of them out of review by hand, with its evidence
  beside it in `src/Venues.fs`, as the owner did for three on 2026-10-25. The row says it was accepted by the session and not by the owner; the owner
  confirms it or reverts it (`a18e26a`, then `32b2d1d`: see Task 1). Condition 2, as the owner amended it on 2026-10-25, is untouched.

## Task 1 — U.S. Bank Stadium

Built 2026-11-09: a hand-accepted `Dome` row (44.9739, -93.2581, `America/Chicago`) with its evidence; two Suite checks (the grounds on the
2026-11-09 slate include a table row; the row is a fixed-roof row at Minneapolis in `America/Chicago`); four registered mutations, one per claim the row
makes, which all SURVIVED before the checks and are all caught with them (`outbox/venue-us-bank-stadium-mutation-2026-11-09.txt`).

**Done when:** a verify run on main has the step "Render check against the LIVE slate" at `success`, with `PASS  the venue table covers at least one
venue on this slate` in its log, on a slate whose only covered ground is this row (2026-11-09's). Run id: **42631741258** (verify, the push of `a18e26a`).
Command: `gh run view <id> --json jobs`, the step named above, `conclusion` must equal `success`.

**Done 2026-11-09.** Artifact, read from GitHub after the push by REST:
`gh api "repos/<owner>/<repo>/actions/runs/42631741258/jobs?per_page=100" --jq '.jobs[].steps[] | select(.name=="Render check against the LIVE slate") | .conclusion'`
printed `success`; the step is #95 of job `verify` (129209492878), 14:13:18Z to 14:13:20Z. Its log holds `PASS  the venue table covers at least one venue on this slate`
once, no FAIL line, and `24/24 checks passed`, on the 14-card slate for 2026-11-09. Between the red commit (`17d28eb`, run 42621717589) and this one the only change in `src/` and `scripts/` is
three files: the row and its comment in `src/Venues.fs` (26 lines), its two Suite checks (36) and its four mutation entries (37); `scripts/render-check.mjs` differs by 0 lines. The log
excerpt, the diff and the job list are quoted by script in `outbox/venue-us-bank-stadium-2026-11-09.md` (section 5), and the assertions that stop that document saying VERIFIED for a red
or wrong run are shown failing on eleven doctored inputs in `outbox/venue-us-bank-stadium-evidence-controls-2026-11-09.txt`.

**Not established by that run:** which card the two chip checks examined (a passing step prints PASS lines, not the venues behind them; that it was Bills @ Vikings is an inference from the row diff), and
the strict zone check of the row against Open-Meteo (verify runs the tolerant form). **Still open and not part of this done condition:** the row says it was accepted by the session, and the owner confirms it
or reverts it. A revert is `a18e26a` first and then `32b2d1d`: the four mutation entries in the first anchor on the row's text in the second, so reverting only `32b2d1d` leaves them stale.

## Task 2 — the lead extraction, `scripts/venue-source.mjs` line 609

`(r.value.extract || '').split(/(?<=\.)\s/)[0]` keeps the text up to the first full stop followed by a space. For a name with an initial or an
abbreviation that is a stub: "U.S.", "St.", "Amon G.". The roof rule then reads a lead that says nothing.

Two ways to fix it, and one of them is not available:

- Read the summary's `extract` whole. The REST summary is already the lead paragraph, bounded by the API, so this is a structural unit and not a parse.
  It widens what the roof check reads from one sentence to the paragraph, and the script's own comment gives the reason for reading the lead
  and not the body (the body "describes proposals and other stadiums"). Whether a paragraph is still "the lead" in that sense is the owner's call.
- An abbreviation-aware sentence splitter. That is a parse built to get out of a corner, which the owner's standing instruction rules out.

**Recommended:** the first, after the owner says yes, because it changes the evidence behind rows already in the table.

Steps, in order: (1) probe: `node scripts/venue-source.mjs --self-test` count before. (2) Change line 609. (3) Self-test cases: the real U.S. Bank sentence classifies
`dome`; a lead of "Amon G. Carter Stadium is ..." is read whole; each with a must-fail input. (4) A registered mutation that restores the split. (5) Retire the
cache kind `wp-lead` (the 9 stubs are cached under it; "retired key kinds dropped on load" is the mechanism the 2026-10-22 session used) and re-run
`venue-source.yml` mode `source` on `data/venue-source-candidates.json` on a runner. (6) `node scripts/venue-sourced-check.mjs --write`. (7) `venue-source.yml`
mode `calibrate`: still 0 accepted-and-wrong over the hand-reviewed rows.

**Done when:** the diff between the old and new `outbox/venue-source-results-latest.json` is committed and lists EVERY row whose status or roof changed (the 8 stub-lead
rows must each be named, with their roof before and after), U.S. Bank Stadium is accepted by the rule and its hand row in `src/Venues.fs` is deleted in the same
commit with the four `venue-us-bank-stadium-*` mutations re-anchored to the generated row, and `npm run check:venue-sourced` passes.

**Result 2026-11-09 (owner's go "Task 2 approved", 10:43 ET): measured, stopped, nothing in the table.** The change was made (`0d3875c`: `summaryAnswer` reads the extract whole,
cache kind `wp-summary`, self-test 57 to 62, two registered mutations both caught; verify run 42650313057 green) and run on a runner (run 42651498788, 35 minutes, commit `76d6b45`).
Compared row by row with the results at `0d3875c`: 442 of 442 rows, only the lead changed, **4 rows changed status or roof**, and the 2 that are not safe are
Center Parc Stadium (open to dome, contradicted by its own paragraph) and Joan C. Edwards Stadium (open to dome on "indoor suites", which the full article uses only of its suites).
The stop rule above applied, so no `--write`, no hand-row deletion, no re-anchoring and no `calibrate` (which reads coordinates only and could not have tested this change). Main had gone red
on `check:venue-sourced` when the runner committed; `a6f99c2` restored `scripts/venue-source.mjs` and `scripts/mutation-check.mjs` to `268140d` and the results and cache to `0d3875c`, byte for byte,
and kept the probe, the diff tool (15 controls), the diff and the whole extracts of 383 rows. The "Done when" above is NOT met, and is not attempted by another route.
The owner's options, with what each costs: (1) leave the first-sentence read as it was and record the blind spot (17 accepted cut-lead rows read "open" with the paragraph naming no roof for 14
of them; nothing built); (2) allow one exception to "never parse", an abbreviation-aware sentence reader, whose effect on all 383 rows can be computed offline from the committed extracts before anything is built;
(3) a second, structured roof source (the infobox Roof field), unmeasured, needing a runner probe first. Nothing here undoes or works around a ruling: Task 1's hand row and its confirm-or-revert decision are untouched.

**Owner's ruling 2026-11-09 12:16 ET: "Option 3".** A second, structured source for the roof. Options 1 and 2 are not taken; what they would have cost stays recorded above.

### Option 3 — the infobox Roof field

**What it reads.** MediaWiki's own preprocessor has already cut a page's wikitext into templates and parameters, and `action=parse&prop=parsetree&section=0` returns that tree as XML. Reading a
parameter named `roof` from that tree is not reading prose and not parsing wikitext, but it is a new source with failure modes of its own (template names, free-text values), which is why it is measured
before anything is built on it.

**Step A, a read-only probe (built; not yet run).** `scripts/venue-infobox.mjs`, run by `venue-source.yml` mode `infobox`. For each article the roof rule reads (the title derived as `roofOf` derives it, and compared
with the cache's `wp-lead|` keys) one parse request at one a second, then the categories in batches of 50. It records every `Infobox` template, every parameter name, every parameter whose name contains "roof"
(flat text and raw XML), the revision id, the visible categories, and the whole tree of five controls (U.S. Bank, Parken, Center Parc, Joan C. Edwards, NRG). It writes only `outbox/venue-infobox-probe.json` and
`.txt`: the results, the cache and the table are not touched, so a run cannot leave `check:venue-sourced` red. The XML is read with `@xmldom/xmldom` 0.9.12, a new exact-pinned devDependency (package.json +1 line,
lockfile +11, nothing else moved). 36 self-test checks; 15 registered mutations (`venue-infobox-*`), each red by the check meant to catch it.

**Decision criteria, written before any data exists (Rule 100).**

1. **Read.** Every title is fetched and parsed, or each failure is explained from its recorded reason. A probe that read fewer than all is not a measurement of all; the run's exit code is the check.
2. **Meaning from the words, not from the venue.** A value counts as a closed roof only through the patterns `classifyRoof` already trusts, exactly: `retractable[- ]roof|roof that retracts` (retractable) and
   `\bdomed\b|\bdome\b|fixed roof|enclosed stadium|\bindoor\b` (dome). The bare words "Retractable", "Fixed" and "Enclosed" are therefore not witnesses (measured 2026-11-09, before the probe ran:
   `classifyRoof("Retractable")` is "open"; this criterion first named "retractable" as a keyword, which was looser than the code, and the template's own documentation uses that bare word as its example).
   Anything else is "no witness" and the row is unchanged, "Skylight" included, and "open" is never taken from the field. A term joins that list only if the probe shows it on at least two rows whose roof the
   lead or Wikidata P5624 already decides as that class and on none where they decide otherwise, or if the owner says so; the match is the whole value, lower-cased, and the effect tool prints the test for every
   value (`--join term=class` applies one).
3. **Agreement.** On the rows whose roof the lead or Wikidata decides, the field's class equals it. Each disagreement is read against its article and named; one where the field is right and the table wrong is
   reported to the owner as a finding of its own.
4. **Effect, before any build.** With the real `decideRoof` extended by the witness and computed offline from the probe JSON and the cache (`outbox/venue-infobox-effect-2026-11-09.mjs`; its self-test, and
   its mutations each red by a named check, `outbox/venue-infobox-effect-mutation-2026-11-09.txt`): every row whose status or roof would change, by name, before and after, each read against its article. A closed
   witness is one more positive source: two naming different classes make the row review, one class makes it that class. The control: with no witness the same computation reproduces the committed roof, basis
   and status of every row that has a roof stage. That is 384 of the 442 rows, not 442 as this criterion first said (measured 2026-11-09 against the committed cache: 384 of 384 reproduce; the other 58 are refused
   at the point stage, so no roof source reaches them and none can change). A wrong roof for any row stops it, as Task 2's stop rule says, unchanged. Zero rows changed means nothing is built (Rule 63).
5. **The motivating row is a consequence, not a target.** U.S. Bank Stadium is accepted by the rule only if 1 to 4 let its value through. If "Skylight" is no witness it stays in review and its hand row stays,
   and that is the report.

**The categories are measured beside it, not built on.** The ruling names the infobox. The same run reads each article's categories (about eight more requests) because the five-article sample in the premise table
showed a closed vocabulary ("Retractable-roof stadiums in ...", "Skylit stadiums in ...") that the free text may lack. Building on them is not covered by the ruling: the measurement goes to the owner beside the
infobox's. The effect tool runs the same computation with the roof-named categories as the witness (`--source categories`) and prints what the rule would do if it read them, so the owner has that number and not
only the infobox's; nothing reads them in the rule.

**Done when (Step A):** the runner's commit of `outbox/venue-infobox-probe.json` has `complete` true and every article `fetch.ok` and `parse.ok` (the workflow step's conclusion is `success`, the verdict being
its exit code); the `.txt`'s second line reads `COVERAGE: checked N of 442 rows`; the raw tree of U.S. Bank Stadium in `controlTrees` contains `<close>&lt;/ref&gt;</close>` (the escape premise above) or the run's own
record says why it does not; and each of the five controls is reported with a roof parameter, or with `no infobox` or `no roof parameter` as the case is. Command: `node outbox/venue-infobox-stepa-assert-2026-11-09.mjs`, which prints each of these as PASS or FAIL with the value that decided it and the
denominator ("checked N assertions"); its own self-test fails each assertion on a doctored probe, and `node scripts/venue-infobox.mjs --report outbox/venue-infobox-probe.json` prints the text report again.

**Step B, only if criteria 1 to 5 say go:** the witness as a fourth argument of `decideRoof`, read from a new cache kind (`wp-infobox`); self-test cases each with a must-fail input; registered mutations; then
the original Task 2 steps (a runner `source` run, the old and new results compared row by row with `outbox/venue-lead-whole-diff-2026-11-09.mjs`, `--write`, and the hand row's deletion with the four mutations'
re-anchoring only if the rule accepts U.S. Bank). Its "Done when" is the one under Task 2 above. If the criteria say stop, the report is verbatim and Task 2 closes with option 3 recorded as measured and not built.

## Task 3 — Manadon Sports Hub

Not a candidate yet: `data/venue-source-candidates.json` was built 2026-10-22 and has no entry for it. A hand row from a postcode (PL5 3FD, from a directory listing of the
Argyle Community Trust's hub) would be one source, and the sourcing rule asks for two independent families. The geocoder hosts are unreachable from the session
(`URL_NOT_ON_ALLOWLIST`); `venue-source.yml` runs on a runner, and whether the runner reaches them is for this task to find out.

**Unblocked 2026-11-09.** Unblock condition: the archive holds a game there. Command, through the D1 connector (the runner token is refused, error 7403), on `field-archive`
`cc49101c-0569-4d41-8e7a-be139cde4f26`: `SELECT 'regular' t, sport, COUNT(*) FROM regular_season_games WHERE venue = 'Manadon Sports Hub' GROUP BY 2 UNION ALL SELECT 'post', sport, COUNT(*) FROM postseason_games WHERE venue = 'Manadon Sports Hub' GROUP BY 2`
returns a row. Run through the connector on 2026-11-09 it returned `{"t":"regular","sport":"FA Cup","COUNT(*)":1}`, and `SELECT * FROM regular_season_games WHERE venue = 'Manadon Sports Hub'`
returned one row: id `FA Cup_2026-11-09_e401931098`, Plymouth v Berkhamsted, `start_time` 2026-11-09T19:30Z, `home_score` null, `finalized_at` null, `created_at` 2026-11-09 10:00:40. The archive
holds the fixture before it is played. This document's first draft said it would hold no game there until the tie was played; that was written without running the query (Rule 100), and
it is corrected in the premise table above, in `outbox/venue-us-bank-stadium-2026-11-09.md` (section 6) and in the session doc.

Then: rebuild `data/venue-source-candidates.json` by the procedure in `outbox/cc-session-2026-10-22-outdoor-venue-sourcing.md` and `outbox/cc-session-2026-10-21-outdoor-venue-sourcing-task0.md`, run
`venue-source.yml` mode `source`, `node scripts/venue-sourced-check.mjs --write`. If the rule accepts it, it is a generated row; if it lands in review, it goes to the
owner with the candidates listed, as the three of 2026-10-25 did. A rebuild reads the archive again, so it lists every ground the archive has gained since 2026-10-22 as well as this
one; how many that is has not been measured. The comment above the Suite check named below (`src/Suite.fs`: "Manadon Sports Hub is not a sourcing candidate: the archive holds no game there until
this one is played") states the premise this task found false, and is rewritten in the first commit that touches that block; it is not worth a verify and a deploy on its own.

**Done when:** `"Manadon Sports Hub"` is removed from `notYetCarried` in the Suite check "the grounds on the 2026-11-09 slate include a table row" and the suite passes
without it (the check then requires it to be a row), and the comment above that check no longer says the archive holds no game there.

## Task 4 — the other review venues

The review list held 70 of 442 candidates. The results file still lists all 70, because it is the record of that run. Three have since been hand-accepted by the owner
(M. M. Roberts Stadium, Ryan Field, St James Park, 2026-10-25) and Task 1 takes U.S. Bank Stadium, so 66 are uncovered (counted 2026-11-09 by matching each review name against
`at "<name>"` in `src/Venues.fs`). By the reason the run recorded: 46 where no two independent families agreed on a point, 10 where the article body mentions a retractable roof
and the lead said nothing, 7 ambiguous names, 2 where no source answered, 1 with no lead and no Wikidata roof.

By sport: UEFA qualifying, Europa and Conference 14, EFL Cup 10, CFB 7, EFL Trophy 7, MLS 6, Serie A 4, golf 4, UEFA Champions League 3, EPL 2, MLB 2, La Liga 2, Ligue 1 2,
FIFA World Cup 1, NFL 1 (Highmark Stadium), Bundesliga 1. The grounds most likely to be the only ground on a slate again are the repeat ones: Highmark Stadium (every Bills home game)
and the six MLS grounds.

**Step 0, measured before anything is added:** from the archive, for each of the last 60 days, whether every non-arena venue on that day's slate is one the table does not carry (a
day verify would have gone red). That prices the remainder against the red days it would remove, as Task 0.3 of the 2026-10-20 CC-CMD did.

**Step 0 done 2026-11-09:** `outbox/venue-red-days-2026-11-09.md`, from `outbox/venue-red-days-rows-2026-11-09.json` (D1 `field-archive`, window 2026-09-11..2026-11-09, 60 of 60 days present, 2775 games).
Under today's 485-row table and 79 recorded arenas **0 of 60 days would have gone red**; without the U.S. Bank Stadium row, 1 of 60 would (2026-11-09, the day verify did go red). Two days rest on one
table row: 2026-09-28 (Soldier Field; the other observable venue was Medinah CC (No. 3), which is in the review list) and 2026-11-09 (U.S. Bank Stadium; the other was Manadon Sports Hub, which is not).
So adding any or all of the 66 would have removed 0 red days from this window; the row that removed one is the one added today. The window is partly circular (the table's sourced rows came from this
archive), so it prices the past and is not a forecast. The generator checks its own rows (the partition, the column sums against the database's own `all` row, the list checksums recomputed
inside the database, the statement hash, and the quotes it cites from `outbox/venue-us-bank-stadium-2026-11-09.md`), and `outbox/venue-red-days-selftest-2026-11-09.txt` shows 31 doctored inputs
each refused for the right cause (its first run reported three of its own edits hitting an earlier check; they were fixed before the file was kept).

**Step 1, unblocked and not run:** how often each of the 66 appears on a slate. Step 0 counts days, not venues, so it cannot say that. By the same embed-and-checksum method as
`outbox/venue-red-days-2026-11-09.mjs`, over the candidates file's window (games since 2026-07-01): games and distinct days per review name, so the owner decides each venue from a number.

**Done when:** Step 0's count is in `outbox/` (done), and each of the 66 is either a table row with its evidence or a one-line reason it stays out, decided by the owner from Step 1's counts.

## Not in scope

- `scripts/render-check.mjs` and the live-slate check. The owner's ruling is that the check must not become a quiet pass.
- Adding any other review venue by hand without the owner's yes.
- The relay.
