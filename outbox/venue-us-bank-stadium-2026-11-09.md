# U.S. Bank Stadium: why the table lacked it, and the row that answers 2026-11-09's red

Session 2026-11-09, field-laboratory. Governing record: `docs/CC-CMD-2026-11-09-venue-review-remainder.md`.
Every quotation below from a run log, the sourcing record or the source file was read from that file by
the script that wrote this one (kept beside it as the command in the last section), not retyped. The
two Wikipedia statements in section 4 were read through the session's fetch tool, which has a small
model extract the quotation: they are a read, not a byte-for-byte capture, and are labelled so.

## 1. What was red, and that it was not table-v2

| run | build | when (UTC) | step that failed |
|---|---|---|---|
| live-check 42611575822 | deployed `41a5cf2` | 2026-11-09 11:45 | #10 Render the deployed page and assert on it |
| live-check 42613880170 | deployed `41a5cf2` | 2026-11-09 12:03 | #10 Render the deployed page and assert on it |
| verify 42621717589 | `17d28eb` (push) | 2026-11-09 13:00 | #95 Render check against the LIVE slate |

The two live-check runs are against the page deployed from `41a5cf2`, which is BEFORE table-v2: they ran before
`46398f2` and `17d28eb` were pushed (verify's run was created at 13:00Z). Their FAIL lines are the same four verify's step printed:

```
FAIL  the venue table covers at least one venue on this slate
      → Manadon Sports Hub, U.S. Bank Stadium — none of them in the 484-entry table (11 recorded indoor arena(s) not counted)
FAIL  every card whose venue the table knows carries a live chip
      → 0 known venue(s) on this slate, 0 chip(s) filled. Attribution from the page's own window: … (cut here; full text in the run log)
FAIL  every live chip reads as a temperature and nothing else
      → []
FAIL  every live chip carries a real roof caveat
      → []
```

and verify's own, from run 42621717589:

```
FAIL  the venue table covers at least one venue on this slate
      → Manadon Sports Hub, U.S. Bank Stadium — none of them in the 484-entry table (11 recorded indoor arena(s) not counted)
FAIL  every card whose venue the table knows carries a live chip
      → 0 known venue(s) on this slate, 0 chip(s) filled. Attribution from the page's own window: … (cut here; full text in the run log)
FAIL  every live chip reads as a temperature and nothing else
      → []
FAIL  every live chip carries a real roof caveat
      → []
```

`git diff 9ba4c9f..17d28eb --stat -- src/Venues.fs` is empty: table-v2's commits did not touch the table.
The last verify run that went green, 42507928169 (`d9554f3`, 2026-11-08 18:02Z), passed this step on that day's slate.

The slate was 14 cards: NBA x8, NHL x3, FA Cup x1 (Plymouth v Berkhamsted on the card, 19:30Z), NFL x1 (Bills @ Vikings,
2026-11-10 01:15Z), one golf round. The check counted 13 real venues: 11 recorded indoor arenas (the NBA and NHL
games) and the two it names, Manadon Sports Hub and U.S. Bank Stadium, neither of them a table row. By the
arithmetic the 14th card, the golf round, contributed no real venue.

## 2. U.S. Bank Stadium was sourced, not missed

`outbox/venue-source-results-latest.json` (run 40141634179, 2026-10-24T23:10:39.159Z) carries it in the review list, not the accepted one:

```json
{
 "name": "U.S. Bank Stadium",
 "sports": "NFL",
 "home": "Vikings",
 "lat": 44.9739,
 "lon": -93.2581,
 "agreeing": [
  "osm-reverse",
  "osm-reverse",
  "wikidata",
  "wp-article"
 ],
 "qid": "Q7929512",
 "via": "wider net (osm-reverse + osm-reverse + wikidata + wp-article)",
 "roof": null,
 "roofBasis": "the lead names no roof, but the article mentions \"retractable roof\"",
 "lead": "U.S.",
 "zone": "America/Chicago",
 "why": "roof: the lead names no roof, but the article mentions \"retractable roof\""
}
```

and `data/venue-source-candidates.json` carries it as a candidate:

```json
{"venue":"U.S. Bank Stadium","sports":"NFL","home":"Vikings","games":3,"last":"2026-10-04"}
```

The venue string on the live slate and the candidate's are the same code points:

```
live slate : "U.S. Bank Stadium"  55 2e 53 2e 20 42 61 6e 6b 20 53 74 61 64 69 75 6d
candidate  : "U.S. Bank Stadium"  55 2e 53 2e 20 42 61 6e 6b 20 53 74 61 64 69 75 6d
identical  : true
```

## 3. Why its roof came back unknown: the lead was cut at the abbreviation

`scripts/venue-source.mjs` line 609:

```js
return r.ok ? { ok: true, value: (r.value.extract || '').split(/(?<=\.)\s/)[0] } : r
```

The Wikipedia summary's extract is split after every full stop that is followed by a space and the first piece
is kept. For "U.S. Bank Stadium is an indoor stadium in Minneapolis, Minnesota, U.S." the first piece is "U.S.".
The roof rule then reads a lead that names no roof, and the article body, checked separately, mentions a
retractable roof: `decideRoof` returns no roof and the venue goes to review. The result file holds 9 of 442 entries whose
recorded lead is 14 characters or fewer, and every one is an initial or an abbreviation cut off:

| venue | status | recorded lead | roof | basis |
|---|---|---|---|---|
| Amon G. Carter Stadium | accepted | `Amon G.` | open | inferred: the lead names no roof |
| Doak Campbell Stadium | accepted | `Doak S.` | open | inferred: the lead names no roof |
| Doyt L. Perry Stadium | accepted | `Doyt L.` | open | inferred: the lead names no roof |
| Elliott T. Bowers Stadium | accepted | `Elliott T.` | open | inferred: the lead names no roof |
| Gerald J. Ford Stadium | accepted | `Gerald J.` | open | inferred: the lead names no roof |
| Joan C. Edwards Stadium | accepted | `Joan C.` | open | inferred: the lead names no roof |
| St. James' Park | accepted | `St.` | open | inferred: the lead names no roof |
| Williams Stadium (VA) | accepted | `Arthur L.` | open | inferred: the lead names no roof |
| U.S. Bank Stadium | review | `U.S.` | null | the lead names no roof, but the article mentions "retractable roof" |

Eight were ACCEPTED as roof "open" on "inferred: the lead names no roof" from a lead that was a stub. Nothing in the
record says any of them is wrong, and the body check did not object to them. But the inference was drawn from a
lead that said nothing, and `docs/CC-CMD-2026-11-09-venue-review-remainder.md` Task 2 re-reads them.

## 4. The evidence for the row

- Position. The sourcing run had it at 44.9739, -93.2581 from four witnesses (osm-reverse, osm-reverse, wikidata, wp-article; Wikidata Q7929512) and zone America/Chicago (geo-tz, which is independent of Open-Meteo).
  Wikipedia's infobox, read through the fetch tool on 2026-11-09, gives 44°58′26″N 93°15′29″W. As decimals that is 44.97389, -93.25806, which rounds to 44.9739, -93.2581: the run's point to four decimals.
- Roof. Wikipedia's first sentence, read through the fetch tool on 2026-11-09: "U.S. Bank Stadium is an indoor stadium in Minneapolis, Minnesota, U.S." Its infobox Roof field: "Skylight". The article's roof is described as ETFE;
  every "retractable" in the article is about the retractable roof the budget debate priced and compared with other stadiums.
  That is why the body check fired: it matched a roof the stadium does not have. `Dome`, as Ford Field, SoFi Stadium and Allegiant Stadium are in this table.
- The rule applied to what Wikipedia says. `decideRoof(null, lead, body)` from `scripts/venue-source.mjs`, run by the script that wrote this file, with the body match the run recorded ("retractable roof"):

  ```
  lead as recorded  "U.S."   -> {"roof":null,"basis":"the lead names no roof, but the article mentions \"retractable roof\""}
  lead as stated    "U.S. Bank Stadium is an indoor stadium in Minneapolis, Minnesota, U.S." -> {"roof":"dome","basis":"wikipedia lead"}
  ```

  The first line reproduces the committed review entry; the second is what the same rule returns for the sentence the splitter cut short: `dome`, from the lead. Had the lead been whole the rule would have accepted the row.
- Zone. `America/Chicago`, from the run. `scripts/weather-live-check.mjs` asks Open-Meteo what zone the point lands in and compares; verify runs it on every push with `--tolerate-unreachable`.

The row is in the hand-accepted section of `src/Venues.fs`, outside the generated block, with this evidence beside it.
It is labelled as accepted by this session and not by the owner or the sourcing rule, because it is neither, and
the owner's earlier hand-accepted rows say "accepted by the owner". The owner confirms it or reverts the commit.

## 5. Verified here, and what is not

Verified on this tree, 2026-11-09:

- F# suite `node build/VerifyMain.js`: 369 of 369 (367 before; two checks added).
- `npm run check:venue-sourced`: 6 of 6. The row is outside the generated block and the block still equals the run.
- `node scripts/mutation-check.mjs --anchors`: 0 stale.
- Four deliberate breaks of the row (deleted, roof OpenAir, latitude +0.01, zone America/Denver), run twice and kept in
  `outbox/venue-us-bank-stadium-mutation-2026-11-09.txt`: all four SURVIVED without the two new Suite checks ("Nothing defends
  this claim") and all four were CAUGHT with them, with the unmutated control passing both times.

NOT verified here, and why:

- That verify's step "Render check against the LIVE slate" passes with the row on today's slate, and that the Bills @ Vikings card
  fills a weather chip with a roof caveat. The live relay and Open-Meteo are not reachable from this sandbox; the step runs on a runner.
  Artifact that settles it: the verify run id on the pushed head, with that step `success` and `PASS  the venue table covers at least one venue on this slate` in its log.
- The strict zone check of the new row against Open-Meteo (`venue-source.yml` mode `weather`, about 380 calls, no tolerance flag). verify runs the
  tolerant form; a runner cannot be asked for the strict form without spending those calls.

Status: STAGED until the verify run above exists. Unblocked by: the push of the commit carrying this file. Verify with:

```
gh run view <run-id> --json jobs | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const t=JSON.parse(s).jobs.flatMap(j=>j.steps).find(t=>t.name==="Render check against the LIVE slate");console.assert(t&&t.conclusion==="success",t);console.log(t.name,t.conclusion)})'
```

## 6. Not done here

- Manadon Sports Hub (the FA Cup tie, "Plymouth v Berkhamsted" on the card; a web search lists it as Plymouth Parkway v Berkhamsted). It is not a sourcing candidate: the archive holds no game there until this one is played, and
  the geocoder hosts are refused by the session's fetch tool (URL_NOT_ON_ALLOWLIST for postcodes.io and Nominatim). A hand row from a postcode alone would be one source.
  Carried, with its unblock command, as Task 3 of the CC-CMD.
- The line-609 defect. A re-read of 442 candidates changes the evidence behind rows already in the table and is not a hitchhiker on a data fix (TOUCH-ONLY). Task 2 of the CC-CMD.
- The other 69 venues in the review list. Task 4.

Command, to regenerate this file: `node outbox/venue-us-bank-stadium-evidence-2026-11-09.mjs <repo> <scratch> > outbox/venue-us-bank-stadium-2026-11-09.md`,
where `<scratch>` holds `verify-failed.log` (`gh run view 42621717589 --log-failed`) and `livecheck-42613880170.log` (`gh run view 42613880170 --log-failed`).
The other inputs are `outbox/venue-source-results-latest.json`, `data/venue-source-candidates.json` and `scripts/venue-source.mjs`, as committed.
