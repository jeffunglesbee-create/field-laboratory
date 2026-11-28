# Session 2026-11-28: three suite gaps found by field-tonight's mutation run, closed here

**Source of the finding:** field-tonight ported this repo's shippable suite groups whole (429 rows there) and ran a 205-entry mutation table against them (`outbox/mutation-latest.json` there, run 46082982975, 205 of 205 CAUGHT after the gaps below were closed). Three mutations SURVIVED the ported rows. The rows are identical in this repo, so the same breaks pass here.

**The three gaps (each is a mutation that left the whole F# suite green):**
1. `Lineups.markFor`: swapping which standing gets which mark (Predicted <-> Confirmed). The rows compared the two marks with each other and with `markWord`/`markSemantic`, never with a direction.
2. `Stats.marginOf`: `leader - trailer` flipped to `trailer - leader`. The only margin read through `comebackText` was zero, which a sign flip leaves unchanged.
3. `TeamColours.tryColours`: `[hex; alt]` flipped to `[alt; hex]`. The table says "PRIMARY FIRST", `Palette.choosePair` reads the list in order, and no row pinned the order.

**A fourth candidate that is NOT a gap here:** `Desk.amnestyZoneAfterKickoff` (`flow-kickoff-needs-two-days`). It survived in field-tonight only because Flow is not shipped there; this repo's Flow rows catch it, and its mutation entry is already in the table. Probed by the anchor text (`fieldDayShift -1`: 1 hit in `scripts/mutation-check.mjs`). I had first reported four laboratory gaps; that was wrong, it is three.

**What was added:** 6 rows in `src/Suite.fs` (1 direction row in the Lineups group; 2 in the Stats group; a new "Team colour order" group of 3) and 3 entries in `scripts/mutation-check.mjs` (`lineups-mark-direction`, `stats-comeback-margin-sign`, `team-colours-alternate-first`, all expecting `node build/VerifyMain.js`).

**Verified (commands run, this repo):**
- `npm run build` compiles; `node build/VerifyMain.js`: 577/577 (was 571).
- `node scripts/mutation-check.mjs --anchors`: 2276 of 2279 anchors checked, 0 stale (the 3 unchecked are world mutations with no file anchor, pre-existing; the three new entries have file anchors and were among those checked).
- Each of the three mutations applied by hand (unique anchor asserted), `npm run build`, suite run: exit 1 and a named red row each (`a predicted sheet is marked Unannounced and a confirmed one Announced...`; `the comeback line reads the size of the gap...` and one more; `a club's colours come PRIMARY FIRST...`). Restored and rebuilt: 577/577, tree clean apart from the two edited files.

**Not verified:** the mutation harness's own run of the three new entries (`node scripts/mutation-check.mjs --only <id>`): not run here, the verify workflow's sharded mutation job covers it. The full confidence gate: not run in this session (it takes hours locally); the commit rides on the checks above plus `verify`.
