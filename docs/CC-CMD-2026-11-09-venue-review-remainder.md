# Claude Code Command — the sourcing run's review remainder: a slate whose only grounds are review venues turns verify and live-check red

**Branch:** main — commit directly, do not create a feature branch or PR
**Repo:** field-laboratory
**Filed:** 2026-11-09 by CC, found when the verify run for table-v2's commits failed on "Render check against the LIVE slate"
**Confidence gate:** `npm run gate` >= 95 before any commit
**Status:** PARTIAL 2026-11-12 — Task 1 is done (verify run 42631741258 on `a18e26a`, the live-slate step green, artifact under it) and so is Step 0 of Task 4 (`outbox/venue-red-days-2026-11-09.md`: 0 of 60 days red); Task 3 was approved ("Task 3 approved", 2026-11-10 11:42 ET) and run: the sourcing rule accepted 9 of the 17 grounds the archive had gained since 2026-10-22 (generated rows, `faa831d`, verify run 42863538303, deploy run 42867015300) and put Manadon Sports Hub in review, no two sources agreeing, and the owner then approved a hand row for it ("Manadon Sports Hub approved", 2026-11-11 09:50 ET), built in `7e1a7e5` with its evidence under `outbox/venue-manadon-*-2026-11-11.*`: the exemption is gone and the suite is 370 of 370 locally, so Task 3's Done-when is met locally and in CI (verify run 43048578660 failed at `Install Chromium` on an apt name-resolution outage, `docs/CC-CMD-2026-11-11-runner-apt-mirror-dns.md`; its rerun, attempt 2 on the same head, passed the F# suite at 370 of 370 and deploy and live-check then went green: second Result under Task 3), and the owner, asked to read the evidence and say keep or revert, answered "Keep" (12:24 ET), so the row stays; Task 2 was approved ("Task 2 approved", 10:43 ET), run, MEASURED AND STOPPED (`outbox/venue-lead-whole-2026-11-09.md`): reading the whole paragraph changed 4 of 442 rows and 2 of the 4 are not safe (Center Parc Stadium open to dome on "replacing the Georgia Dome" in a paragraph that says "an outdoor stadium"; Joan C. Edwards Stadium open to dome on "indoor suites"), so per this CC-CMD's own stop rule nothing reached the table; the scripts, results and cache are restored byte for byte (`a6f99c2`, verify run 42658229991 green) and the owner then chose option 3 ("Option 3", 12:16 ET): a second structured roof source, the infobox Roof field, built first as a read-only runner probe (`scripts/venue-infobox.mjs`, `venue-source.yml` mode `infobox`) that writes none of the results, cache or table, with its go/no-go criteria written under Task 2 before any data exists; the probe ran (run 42668700914: 381 of 381 articles fetched and parsed, its done condition 15 of 15) and criteria 1 to 5 say go (recorded under Task 2), so Step B was built (`968ee51`, `0827a1f`), run on a runner (run 42682560865: 375 of 442 accepted, exactly the three predicted rows changed, the rule's infobox reads equal to the probe's on 381 of 381 articles) and written to the table (`3429152`, verify run 42689207143 success, deploy run 42690116309 success): Task 2's Done-when is met, U.S. Bank Stadium is accepted by the rule with its hand row deleted, and Task 1's confirm-or-revert is closed by that; Step 1 of Task 4 was approved ("Task 4 approved", 2026-11-12 07:36 ET) and run (`outbox/venue-review-counts-2026-11-12.md`: the 71 review names with no row carry 283 games on 261 venue-days in the archive's games of 2026-07-01..2026-11-11), and the rest of Task 4 waits for the owner's decision on each venue. Builds on `docs/CC-CMD-2026-10-20-live-slate-venue-coverage.md` and `docs/CC-CMD-2026-10-20-outdoor-venue-sourcing.md` (both DONE) and undoes nothing in them.

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
or reverts it. A revert is `a18e26a` first and then `32b2d1d`: the four mutation entries in the first anchor on the row's text in the second, so reverting only `32b2d1d` leaves them stale. **Closed 2026-11-09 by Task 2's Step B (`3429152`):** the sourcing rule now accepts the row (a dome, through its infobox's `[[Skylight]]`), the hand row is deleted and the generated row is byte-identical to it, so the four mutation entries still anchor on it and nothing is left for the owner to confirm; the revert described here would now remove a row the rule sources.

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

**Step A, a read-only probe (built; run 2026-11-09, result below).** `scripts/venue-infobox.mjs`, run by `venue-source.yml` mode `infobox`. For each article the roof rule reads (the title derived as `roofOf` derives it, and compared
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

**Step A result (run 42668700914, 2026-11-09 17:51Z to 18:31Z; the runner's commit is `86bd5f0`).** `complete` true; 381 of 381 articles fetched, 381 of 381 parsed, 0 parser errors, categories answered for 381 of 381;
an Infobox template in every article (346 `Infobox venue`, 13 `Infobox stadium`, and seven other spellings); `COVERAGE: checked 383 of 442 rows` (the other 59: no qid 58, Wikidata names no English article 1; the 383 rows share 381
articles). `node outbox/venue-infobox-stepa-assert-2026-11-09.mjs`: 15 PASS, 0 FAIL, artifact `outbox/venue-infobox-stepa-2026-11-09.txt`; the escape premise held on the runner's raw tree (U.S. Bank's carries
`<close>&lt;/ref&gt;</close>`, no parser error). 17 articles (18 rows) carry a parameter named `roof`, with five values: `[[Retractable roof|Retractable]]` on 11 rows, `[[Skylight]]` on 3, `[[Dome]]` on 2, `Dome` on 1,
`[[Retractable roof|Partially retractable]]` on 1. None of the 355 rows the rule reads "open, inferred" has a roof parameter, so the field contradicts none of them. The run took 39.5 minutes against about 7 predicted:
the recorded request times (194 s) and the one-second gaps (about 442 s) leave 28.6 minutes unaccounted, and 37 articles needed exactly one retry (about 47 s each); that fits `retryWait` waiting a Retry-After, but the
probe kept each article's attempt count and not the statuses, so the cause is inferred and not measured.

| # | criterion | measured | verdict |
|---|---|---|---|
| 1 | Read | 381 of 381 fetched and parsed, 0 parser errors; the 59 rows with no article are named by reason | met |
| 2 | Meaning from the words | strict witness (`classifyRoof`'s patterns on the flat value): closed on 15 rows, 13 of them already decided by the lead or Wikidata; `[[Skylight]]` is on 3 rows, 2 of them decided dome by the lead (Allegiant Stadium and SoFi Stadium, "a multi-purpose indoor stadium") and none decided otherwise: it meets the joining test for dome, and no other value is a candidate | met; one term joins |
| 3 | Agreement | 13 agree, 4 silent, 0 disagree (strict); 15 agree, 2 silent, 0 disagree with the joined term. No case of the field right and the table wrong | met |
| 4 | Effect | control 384 of 384; 2 rows change (3 with the joined term): Johan Cruijff Arena review to retractable, Wembley Stadium review to retractable, U.S. Bank Stadium review to dome (`outbox/venue-infobox-effect-2026-11-09.txt`, `-joined.txt`); each read against its article at the revision the probe parsed (below) | met; Wembley is the one judgement call |
| 5 | The motivating row | U.S. Bank Stadium is accepted only through the joined term, which the test passes on Allegiant and SoFi and not on U.S. Bank itself; its own lead says "an indoor stadium" | met |

**The three rows read against their articles.** Read through the Action API at the revision ids the probe recorded (1383882110, 1384136752, 1384547710: equal, checked and not assumed).
Johan Cruijff Arena: the lead's fourth paragraph says "The stadium has a retractable roof and a grass surface."; the first-sentence read never saw it; retractable is right.
U.S. Bank Stadium: the lead says "an indoor stadium"; the Design section says the roof and walls are translucent ETFE, and its "retractable roof" is the design the funding bodies would not pay for ("Eventually,
this design was deemed too expensive"), which is why the body check sent it to review; dome is right. Wembley Stadium: "Two partially retractable roof structures over the east and west ends of the stadium can
be opened to allow sunlight and aid pitch growth", 13,722 of 40,000 m² of the roof movable, the infobox says "Partially retractable". The article does not say the pitch can be covered. `Retractable` is the table's
"roof state unknown" class (`Weather.roofState`: `Retractable` is `UnknownRoofState`, shown as "retractable — not known whether the roof was closed", and not a rankable reading), which claims nothing the article does not
support, where `OpenAir` would claim "played in the open", which it does not support either. A partial-roof class would be a type decision for the owner and not a sourcing one.

**The categories, measured beside it and not built (the ruling names the infobox).** As the witness alone they would move 3 rows (Johan Cruijff Arena, Parken Stadium, Wembley Stadium: agree 13, silent 4, disagree 0,
`outbox/venue-infobox-effect-2026-11-09-categories.txt`); with the two category terms that pass the same joining test (`Covered stadiums in the United States` and `Skylit stadiums in the United States`, both dome)
4 rows, agreeing on 17 of 17 and disagreeing on none (`-categories-joined.txt`). Parken is the row only they reach: its lead's second sentence says "The stadium, which features a retractable roof", and its infobox has
no roof parameter. Building on them needs the owner's word.

**Decision 2026-11-09: go.** Criteria 1 to 5 are met. Step B builds the infobox as a fourth source, with `[[Skylight]]` as the one joined term, and not the categories.

**Step B.** (1) `scripts/venue-infobox-read.mjs`, the pure reader (`parseUrl`, `flatOf`, `readTree` and the answer-to-tree step), moved out of the probe: the probe imports `retryWait` from the rule, and the rule
importing the probe would be an import cycle; the probe's 36 self-test checks and 15 mutations are unchanged (the entries that cut moved code point at the new file). (2) The witness as a fourth argument of `decideRoof`
(default `[]`, which is the rule as it was, so every existing caller and the outbox tools are unchanged; `null` is "the infobox did not answer" and blocks an `open` inference as the lead's and the body's silence
do; two roof parameters naming different closed classes are review, never a pick), `ROOF_FIELD_TERMS` holding the one joined term with its evidence, cache kind `wp-infobox` in `CACHE_KINDS` (a kind not listed there
is dropped on load, and every run would read Wikipedia again), and `roofOf` exported so that a self-test can drive it from a cache with no network; self-test cases each with a must-fail input and registered mutations,
each red by a named check. (3) Then the original Task 2 steps: a runner `source` run (the cold fill, about 39 minutes), the old and new results compared row by row with
`outbox/venue-lead-whole-diff-2026-11-09.mjs`, which must show the 3 rows above and no other, each rule-read infobox value compared with the probe's, `--write`, and the hand row's deletion with the four
mutations' re-anchoring, since the rule accepts U.S. Bank. Its "Done when" is the one under Task 2 above.

**Step B result (2026-11-09): done; Task 2's Done-when is met.** Commit 1 (`968ee51`) moved the reader out of the probe. Commit 2 (`0827a1f`) made the infobox Roof field the rule's fourth source: self-test 57 to 80, 24 registered mutations each red by a named check, `decideRoof` identical on 144 of 144 inputs when the field is left out or `[]`, verify run 42682452654 green. The runner's `source` fill (run 42682560865, 19:21Z to 19:59Z, 37.6 minutes, its commit `ef499a2`) sourced the 442 candidates: **375 accepted (372 before), 67 in review (70 before).**

**The diff** (`outbox/venue-infobox-source-diff-2026-11-09.txt`; its tool, `outbox/venue-infobox-source-diff-2026-11-09.mjs`, was written before the results existed, with 22 self-test checks and 17 mutations each red by a named check): 442 of 442 rows compared by name; exactly three changed, the three the offline replay predicted (`outbox/venue-infobox-rule-replay-2026-11-09.txt`), each from review to accepted: Johan Cruijff Arena (retractable, from `infobox roof "[[Retractable roof|Retractable]]"`), U.S. Bank Stadium (dome, `"[[Skylight]]"`) and Wembley Stadium (retractable, `"[[Retractable roof|Partially retractable]]"`). 0 other rows changed, 0 moved, 0 with the same status and roof but a different basis. The 8 stub-lead rows are named in it with their roof before and after (Amon G. Carter Stadium, Doak Campbell Stadium, Doyt L. Perry Stadium, Elliott T. Bowers Stadium, Gerald J. Ford Stadium, Joan C. Edwards Stadium, St. James' Park, Williams Stadium (VA)): each `open` and `accepted` both times. A stub is a lead of 14 characters or fewer, the definition in `outbox/venue-lead-whole-2026-11-09.md`; the 9th such row is U.S. Bank Stadium.

**The infobox values** the rule read equal the probe's on 381 of 381 articles, 0 unanswered, 0 different (`outbox/venue-infobox-rule-cache-compare-2026-11-09.txt`).

**The table.** `3429152` writes the 375 rows with `node scripts/venue-sourced-check.mjs --write` and deletes the U.S. Bank hand row with its comment (26 lines; 4 added, 27 deleted in `src/Venues.fs`). The generated row is byte-identical to the hand row, so the four `venue-us-bank-stadium-*` mutations keep their anchors and need no re-anchoring: `--anchors` checked 1243 of 1246, 0 stale; the four ids each red by name in the real tree; the row is at line 648, inside the generated block (markers at lines 300 and 679), and occurs once (`outbox/venue-us-bank-generated-row-2026-11-09.txt`). `npm run check:venue-sourced` 6 of 6 locally, and verify run 42689207143 on `3429152`: success; deploy run 42690116309: success. The post-deploy `live-check` (run 42690276129): attempt 1 failed at its Build step (step 7) with the F# compiler crash that `docs/CC-CMD-2026-11-03-fable-compiler-crash.md` documents (the internal error, code 193, first printed at Thoth.Json `Types.fs(33,1)`) and two diagnostics that record does not list (code 1129 and `Cannot find user entity Thoth.Json.ExtraCoders`; items 26 and 27 of the session doc), and its checks of the deployed page were skipped; attempt 2 on the same commit passed every step, so the run is green.

**Not run, and why.** `calibrate` (step 7 of the list under Task 2): it scores each decision by `near(d, v)`, coordinates only (`scripts/venue-source.mjs` lines 807 to 847), and 0 of 442 positions moved, so it could not test this change (the Result paragraph above says the same). **The stop rule** ("a wrong roof for any row") bears on the rows the change moved, which are the three above, each read against its article at the revision the probe parsed (Step A); Wembley is the judgement call recorded there. **Still the owner's:** whether a partial roof is a class of its own (`Retractable` is the table's roof-state-unknown class today), and the categories (Parken Stadium is the row only they reach). Nothing here undoes or works around a ruling.

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

**Result 2026-11-10** ("Task 3 approved", 11:42 ET). Met on the second clause of the Done-when and not on the first: the rule put Manadon Sports Hub in review, so it is not a row and it stays in `notYetCarried`. The owner decides it.

- **The list.** `722e101` rebuilds `data/venue-source-candidates.json` as the 442 old entries unchanged plus the 17 grounds the archive has taken in since 2026-10-22: 459 entries, byte for byte what `outbox/venue-candidates-extend-2026-11-10.mjs` regenerates (31 self-test checks; 20 mutations, each red by a named check). The 17 are the archive's, read through the D1 connector: `outbox/venue-candidates-gained-2026-11-10.json` holds the 18 rows it returned (Merkur Spiel-Arena was already a candidate), joined back to the database exactly, 18 of 18; `outbox/venue-candidates-completeness-2026-11-10.sql` is the whole-window query (630 excluded names) and its remainder is the 17 and the placeholder `TBC`, so the shortcut query left nothing out.
- **The run.** `venue-source.yml` mode `source`, run 42861596952 (the runner reaches the geocoders; the session does not; job 129988885631, 17:07:15Z to 17:12:38Z), commit `b266e5f`: of 459 candidates 384 accepted and 75 in review, from 375 and 67. `outbox/venue-task3-source-diff-2026-11-10.mjs`, written before the run (24 self-test checks; 21 mutations, each red), printed AS PREDICTED (`outbox/venue-task3-source-diff-2026-11-10.txt`): 442 of 442 old rows compared, none moved, changed, or changed its basis; of the 17 new, 9 accepted (each inside England and Wales, zone `Europe/London`) and 8 in review.
- **The table.** `faa831d` writes the 9 rows with `node scripts/venue-sourced-check.mjs --write`: Aggborough Stadium, Brunton Park, Hornchurch Stadium, J. Davidson Stadium, Meadow Park, Nethermoor Park, Silverlake Stadium, The Kassam Stadium, The Raymond McEnhill Stadium. The Suite comment is rewritten in the same commit and no code in that block changed; the suite is 369 of 369.
- **Manadon Sports Hub, for the owner.** The run recorded, in `outbox/venue-source-results-latest.json`: `why` "no two independent families agree (photon)", `unanswered` empty, Wikidata "no entity", Nominatim "no result", Photon one answer, "National Stadium" (`leisure/stadium`) at 1.304491, 103.8743437, which is Singapore: a wrong entity. Every source answered and none located it. The postcode lead above (PL5 3FD) was not probed. A hand row needs the owner's yes with the evidence beside it, as the three of 2026-10-25 had; for Manadon there is no candidate position to put beside it.
- **The other 7 review rows of this run:** Crabble Athletic Ground, EnviroVent Stadium, Flamingo Park, RAW Charging Stadium, Stade de France (ambiguous name), The Stan Robinson Stadium, The Wyatt Homes Stadium. Review now holds 75: 3 are hand rows already (M. M. Roberts Stadium, Ryan Field, St James Park), 72 have no row, and of those 64 are the earlier remainder and 8 are the grounds gained (counted 2026-11-10 by matching each review name against `at "<name>"` in `src/Venues.fs`). Task 4 below was written when that count was 66 and is not rewritten.
- **Verify.** Run 42863538303 on `faa831d`: attempt 1 failed at "Render check against the LIVE slate" because the weather decoder refused two Open-Meteo payloads (HTTP 200, `rain` above `precipitation`), one of them for a ground this task did not touch; attempt 2 passed it and the run is green; `deploy` run 42867015300 and `live-check` run 42867186531 are green, with the deployed page's 16 weather requests all filled. The refusal is filed as `docs/CC-CMD-2026-11-10-live-chip-refused-payload.md`, with its evidence in `outbox/live-chip-rain-refusal-2026-11-10.txt`. The re-run is not a fix.

The session record is `outbox/cc-session-2026-11-10-manadon.md`.

**Result 2026-11-11** ("Manadon Sports Hub approved", Wednesday 09:50 ET). Met locally on both clauses of the Done-when, and in CI (the CI bullet below). The instruction was read as the owner's yes to the hand row that Result 2026-11-10 asked for. That result had no evidence to put beside it ("the postcode lead above (PL5 3FD) was not probed"), and the owner's yes came first, so the evidence was assembled after it: the lead was probed on three runner runs (43043341528, 43043700916 and 43044457109), and the first two ended red by `probe-url.yml`'s own rule (an Overpass 406 and a 30 s timeout), recorded as they were.

- **The row.** `7e1a7e5` adds `at "Manadon Sports Hub" 50.4091 -4.1453 OpenAir "Europe/London"` to `src/Venues.fs`, outside the generated block, with its evidence in the comment above it. Two sources that look independent agree inside the rule's 0.02 degree box: the Ordnance Survey postcode directory through postcodes.io (PL5 3FD, the postcode the council's premises licence register gives for "Manadon Sports and Community Hub": 50.40913, -4.145326) and Sport England's Active Places grid reference for the Manadon Football Development Centre (PL5 3JG, 58.6 m from that point and neither postcode's centre). The zone is `Europe/London` by geo-tz 8.1.4 (`outbox/venue-manadon-zone-geotz-2026-11-11.txt`, a re-run at 16:18Z with two controls, because the first reading was not committed) and by Open-Meteo; the roof is open air (a floodlit 3G pitch, grass pitches and cricket wickets, from the club's and the council's pages). OpenStreetMap is not counted: Nominatim and Photon name nothing there and Overpass never answered. What the evidence does not establish is listed as seven premises in `outbox/cc-session-2026-11-11-manadon-row.md`, among them that the two families are independent (inferred, not shown). `outbox/venue-manadon-evidence-2026-11-11.mjs` re-derives the verdict from the two committed capture files: 8 of 8 checks, `--self-test` 14 of 14, and a separate runner that breaks the script nine ways, each red by the named check (9 of 9).
- **The suite.** The check "the grounds on the 2026-11-09 slate include a table row" has no `notYetCarried`; its must-fail inputs are now `Bell Centre` and `Some Unlisted Park`, and the comment above it says nothing on the slate is exempt. A new check, "Manadon Sports Hub is an open-air row at Plymouth, in Europe/London", holds the row's roof, zone and point. `npm run build` 0 warnings; `node build/VerifyMain.js` 370 of 370 (369 before). Four registry entries in `scripts/mutation-check.mjs` (`venue-manadon-row-deleted`, `-roof-covered`, `-moved`, `-zone-changed`) went 4 of 4 caught through the harness (`outbox/venue-manadon-mutation-entries-record-2026-11-11.json`); five mutations of the source on the pushed tree went 5 of 5 red by the named check (`outbox/venue-manadon-source-mutations-2026-11-11.txt`); `--anchors` checked 1264 of 1267, 0 stale. A limit found while checking this: deleting either clause of the slate check leaves the suite green (`outbox/venue-slate-check-clauses-2026-11-11.txt`, 2 of 2 deletions measured; the compiled program differed each time); the must-fail slate it replaced had the same shape, so this commit did not weaken it, and it is not changed here. `verify-full`, the gate that runs the registry on eight shards, was not dispatched here, and this paragraph first said its Monday 2026-11-16 06:00Z run would be the first to exercise the four entries there. That is no longer so: another session dispatched it on its own branch (run 43105482710, 21:43Z to 22:25Z on 2026-11-11, `success`, head `ecbdb2ab`, which contains `7e1a7e5`), and shards 1 to 4 each printed `PASS` for one of the four entries, with 0 `SURVIVED` lines on all eight (`outbox/venue-manadon-mutation-in-verify-full-2026-11-11.txt`, which says what that read does not show).
- **CI.** guards run 43048578569 on `7e1a7e5` is green. verify run 43048578660 failed at `Install Chromium` (606 s: apt could not resolve the three Ubuntu mirror hosts) and then at "Render check against the LIVE slate" for want of a browser; 63 steps were skipped, "The F# suite, on the F# harness" among them, so `deploy` (run 43050963610) and `live-check` (run 43051002729) concluded `skipped` and for a while the row was not on the live page. The cause is a name-resolution outage that began between 13:11Z and 13:59Z and was still present on a fresh runner at 16:49Z (it is not this commit's: a `verify-full` dispatch of 13:59Z on another head failed the same way); it is filed as `docs/CC-CMD-2026-11-11-runner-apt-mirror-dns.md`. **Then, read 2026-11-11 17:00Z to 17:12Z by REST and the job logs:** a probe run (43063505553, 16:58Z) showed all three hosts resolving and the failed job was rerun (attempt 2 of 43048578660, head `7e1a7e5`, `success` at 17:04:23Z): `Install Chromium` 20 s, "The F# suite, on the F# harness" `370/370 checks held` at 17:01:57Z (**the Done-when in CI**: that step green on a verify attempt for `7e1a7e5`), "Render check against the LIVE slate" 24 of 24. `deploy` run 43064540575 (`success`, 17:05:15Z) built main HEAD `e5acdec` (`7e1a7e5` plus six docs-only commits) and the live `version.txt` now reads `e5acdec11aea…` (it read `4210c884…` before). `live-check` run 43064687662 (`success`, 17:06:58Z) found the deployed stamp equal to main, the newest deployable commit (`7e1a7e5`) landed, and the render check at 24 of 24 including "every card whose venue the table knows carries a live chip". The live `build/Venues.js` (curl, 17:07Z) holds the row once and is byte-identical to the session's local build (sha256 `fff9e212d61eb0da…`). The probe record is `outbox/runner-apt-mirror-probes-2026-11-11.md`.
- **The count.** Review holds 75, as before (the results file is the record of its run). 4 of the 75 now have a row (M. M. Roberts Stadium, Ryan Field and St James Park of 2026-10-25, and Manadon Sports Hub); 71 have none, of which 64 are the earlier remainder and 7 are the grounds gained, counted 2026-11-11 by matching each review name against `at "<name>"` in `src/Venues.fs`. Result 2026-11-10 counted 72 without a row, which is this count before this row. Task 4 below was written when the count was 66 and is not rewritten.
- **Not yet true.** No card at that ground has been rendered with a weather chip. The archive holds no fixture there after the 2026-11-09 tie (D1 `field-archive`, read-only, 2026-11-11 about 15:55Z: one row), and the relay's slate for 2026-11-11 (`/context/date/2026-11-11`, read 17:12Z, HTTP 200, 21 games, 21 venue strings) has no "Manadon" in it. The row is deployed, so the first slate with a game there tests it. The session record carries what would have to be true for that to be checked and the commands that check it.
- **The owner's ruling.** "Keep" (Wednesday 12:24 ET), the answer to "read `outbox/venue-manadon-evidence-2026-11-11.txt` and tell me keep or revert". The row stays and `git revert 7e1a7e5` is not used. The yes of 09:50 ET came before the evidence existed; this one came after the evidence was put beside the row.

The session record is `outbox/cc-session-2026-11-11-manadon-row.md`.

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

**Step 1, run 2026-11-12 (Result 2026-11-12, below):** how often each of the 66 appears on a slate. Step 0 counts days, not venues, so it cannot say that. By the same embed-and-checksum method as
`outbox/venue-red-days-2026-11-09.mjs`, over the candidates file's window (games since 2026-07-01): games and distinct days per review name, so the owner decides each venue from a number.

**Done when:** Step 0's count is in `outbox/` (done), and each of the 66 is either a table row with its evidence or a one-line reason it stays out, decided by the owner from Step 1's counts.

**Result 2026-11-12** ("Task 4 approved", Thursday 07:36 ET). Step 1 is run and the record is `outbox/venue-review-counts-2026-11-12.md`. It adds no row. The Done-when's second clause is the owner's decision on each venue, and no venue has been decided, so Task 4 stays PARTIAL.

- **The count.** 75 review names, 71 with no table row. That is the 66 above, less 2 that the 2026-11-09 source fill took into the table (Johan Cruijff Arena and Wembley Stadium), plus 7 grounds the archive gained, as Result 2026-11-11 under Task 3 counted it; `outbox/venue-review-population-2026-11-12.txt` re-reads it from git at three commits (67 with no row at this CC-CMD's first commit, 64 after `3429152d`, 71 at `0e17a3db`). In the archive's games of 2026-07-01..2026-11-11 (4906 games on 134 days) the 71 carry **283 games on 261 venue-days**, 5.8% of the window's games. By days in the window: 1 day, 17 names (17 games); 2 to 4 days, 30 names (84 games); 5 to 9 days, 22 (139); 10 to 19 days, 1 (Olimpico, 13); 20 or more, 1 (Nu Stadium, 30). The 24 names on 5 or more days carry 182 of the 283 games.
- **By the sourcing rule's reason.** No two independent families agree on the position: 52 names, 220 games. Roof not settled, position agreed: 9 names, 29 games. Ambiguous name: 8 names, 25 games. No source answered with a point: 2 names, 9 games. The record lists all 71 with games, days, first and last date and the rule's reason.
- **How it was checked.** The rows are the result of one read-only statement against `field-archive` (3573 bytes; an earlier six-term version was refused by D1 with `too many terms in compound SELECT` before it ran), saved by hand from the connector's output. The names are embedded with checksums the database recomputes, and `outbox/venue-review-counts-2026-11-12.mjs` refuses the rows unless each is internally consistent and the sums equal the database's own. Three records that did not come from the statement agree with it: the candidates file's counts bracket all 75 names; Step 0's two thin days name Medinah CC (No. 3) and Manadon Sports Hub, and both are present; Manadon is exactly 1 game on 2026-11-09, as the 2026-11-11 session read it. The script's self-test refuses 51 of 51 doctored inputs, each for the right cause (`outbox/venue-review-counts-selftest-2026-11-12.txt`). A second script that does not import it recomputes 339 figures from the statement, the rows, the table source and the results file, and all equal the record (`outbox/venue-review-counts-recompute-2026-11-12.txt`). The refusals of that script and of the population recount were each made to fire on doctored inputs, 17 of 17 (`outbox/venue-review-counts-mutations-2026-11-12.txt`), and that run found one fault, a refusal message that printed its two values swapped, fixed before the file was kept.
- **Not yet true.** No row has been added, and none will be without the owner's yes to that venue (Not in scope, below). These are past counts: a qualifying round, a tournament week or a cup tie does not recur on a schedule, and a window that includes the summer does not say how often a ground is on the slate in January. The archive's venue strings are taken to be the page's `data-venue` strings (Step 0's premise 1; the controls hold names against three records and none renders the page), and whether a card at any of these grounds showed a weather chip was not read from a rendered page. The record's own Not established section lists the rest.
- **What the owner decides.** Which of the 71 get a row: a list of names, or a rule such as every name on 5 or more days (24 names, 182 of the 283 games). Each is then built the way Manadon Sports Hub's was in Task 3: the owner's yes, the evidence assembled and put beside the row, then the owner's keep or revert. A name left out stays out with the sourcing rule's reason, the last column of the record's table, as its one-line reason, which completes the Done-when for that name.

## Not in scope

- `scripts/render-check.mjs` and the live-slate check. The owner's ruling is that the check must not become a quiet pass.
- Adding any other review venue by hand without the owner's yes.
- The relay.
