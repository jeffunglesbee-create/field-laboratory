# Claude Code Command — the sourcing run's review remainder: a slate whose only grounds are review venues turns verify and live-check red

**Branch:** main — commit directly, do not create a feature branch or PR
**Repo:** field-laboratory
**Filed:** 2026-11-09 by CC, found when the verify run for table-v2's commits failed on "Render check against the LIVE slate"
**Confidence gate:** `npm run gate` >= 95 before any commit
**Status:** PARTIAL 2026-11-09 — Task 1 is built and waits for its verify run (the artifact is named under it); Tasks 2, 3 and 4 are open, each with its unblock condition. Builds on `docs/CC-CMD-2026-10-20-live-slate-venue-coverage.md` and `docs/CC-CMD-2026-10-20-outdoor-venue-sourcing.md` (both DONE) and undoes nothing in them.

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
| It is not only this venue | the recorded leads in the results file | 9 of 442 are 14 characters or fewer, all cut at an initial or abbreviation; 8 of them were accepted as roof `open` on "inferred: the lead names no roof" |
| Manadon Sports Hub is not a sourcing candidate | `data/venue-source-candidates.json`, the results and the cache | no entry; the file is built from the archive, which holds no game there until the tie is played |
| The geocoders cannot be reached from the session | fetches of postcodes.io and Nominatim | `URL_NOT_ON_ALLOWLIST` for both |

## Rulings this builds on, and does not undo

- `live-slate-venue-coverage`: the owner chose option 1 (extend the table) and arenas recorded as indoor. Its closing line stands: whichever is chosen
  "must not turn 'the table covers nothing on this slate' into a quiet pass". `scripts/render-check.mjs` is not touched by any task here.
- `outdoor-venue-sourcing`: "The rest are in its review list, deliberately not here." Task 1 takes one of them out of review by hand, with its evidence
  beside it in `src/Venues.fs`, as the owner did for three on 2026-10-25. The row says it was accepted by the session and not by the owner; the owner
  confirms it or reverts the commit. Condition 2, as the owner amended it on 2026-10-25, is untouched.

## Task 1 — U.S. Bank Stadium

Built 2026-11-09: a hand-accepted `Dome` row (44.9739, -93.2581, `America/Chicago`) with its evidence; two Suite checks (the grounds on the
2026-11-09 slate include a table row; the row is a fixed-roof row at Minneapolis in `America/Chicago`); four registered mutations, one per claim the row
makes, which all SURVIVED before the checks and are all caught with them (`outbox/venue-us-bank-stadium-mutation-2026-11-09.txt`).

**Done when:** a verify run on main has the step "Render check against the LIVE slate" at `success`, with `PASS  the venue table covers at least one
venue on this slate` in its log, on a slate whose only covered ground is this row (2026-11-09's). Run id: (to be written here when it exists).
Command: `gh run view <id> --json jobs`, the step named above, `conclusion` must equal `success`.

If the run is red, the cause is read from its log and written here before anything else is changed.

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

## Task 3 — Manadon Sports Hub

Not a candidate, and cannot be made one from here: the candidates file is built from the archive, the archive has no game at this venue until the tie is
played, and the geocoder hosts are unreachable from the session. A hand row from a postcode (PL5 3FD, from a directory listing of the Argyle Community Trust's hub)
would be one source, and the sourcing rule asks for two independent families.

**Unblocked when:** the archive holds a game there. Command, through the D1 connector (the runner token is refused, error 7403), on `field-archive`
`cc49101c-0569-4d41-8e7a-be139cde4f26`: `SELECT 'regular' t, sport, COUNT(*) FROM regular_season_games WHERE venue = 'Manadon Sports Hub' GROUP BY 2 UNION ALL SELECT 'post', sport, COUNT(*) FROM postseason_games WHERE venue = 'Manadon Sports Hub' GROUP BY 2`
returns a row.

Then: rebuild `data/venue-source-candidates.json` by the procedure in `outbox/cc-session-2026-10-22-outdoor-venue-sourcing.md` and `outbox/cc-session-2026-10-21-outdoor-venue-sourcing-task0.md`, run
`venue-source.yml` mode `source`, `node scripts/venue-sourced-check.mjs --write`. If the rule accepts it, it is a generated row; if it lands in review, it goes to the
owner with the candidates listed, as the three of 2026-10-25 did.

**Done when:** `"Manadon Sports Hub"` is removed from `notYetCarried` in the Suite check "the grounds on the 2026-11-09 slate include a table row" and the suite passes
without it (the check then requires it to be a row).

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

**Done when:** that count is in `outbox/`, and each of the 66 is either a table row with its evidence or a one-line reason it stays out, decided by the owner from that list.

## Not in scope

- `scripts/render-check.mjs` and the live-slate check. The owner's ruling is that the check must not become a quiet pass.
- Adding any other review venue by hand without the owner's yes.
- The relay.
