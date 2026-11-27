# AFLW card source line, 2026-11-27

Source: relay `docs/CC-CMD-2026-11-22-aflw-live-source.md` Task 6c and `outbox/ADR-004-aflapi-afl-com-au-source-acceptance-2026-11-27.md`
(the owner's reply on 2026-11-27: "Confirm. Optional choice approved", read as approving the four optional items, one of which is an attribution line).

## What changed
- `src/Desk.fs`: `aflwSourceLine = "Data: AFL"` and `sourceLineFor`, `Some` for `Sport.AFLW` and `None` for every other sport.
- `src/Scoreboard.fs`: a card has a `desk-card__source` node (`data-testid="source"`) only when `sourceLineFor` gives it a line, the way only an EPL card has the forecast node. Every other card keeps its structure.
- `index.html`: one CSS rule for the node (small, muted).
- The wording is one constant and is the owner's to change. It names a source and claims nothing more: no licence, endorsement or partnership (Rule 45.1). No legal assessment is made here.

## Verified (2026-11-27, this sandbox)
- Suite: 564 of 564 (561 before; three new rows: the wording byte for byte, no other sport has a line including the unrecognised ones, none of the words that would claim more). Each row has its own must-fail case (`Verify.check` seals it).
- `scripts/live-score-render-check.mjs`: 90 of 90 against the locally served build (Chromium at `/opt/pw-browsers/chromium` through `PW_CHROMIUM`). The new scenario puts one AFLW card beside an NBA and an NHL card of the committed capture of 2026-11-21: the AFLW card has exactly one `[data-testid="source"]` node, class `desk-card__source`, text `Data: AFL`; the other two have none.
- Mutations (lab Rule 90): six new entries in `scripts/mutation-check.mjs` (`aflw-source-line-on-every-card`, `-on-no-card`, `-testid-moved`, `-on-every-sport`, `-on-the-mens-afl`, `-claims-more`), anchors unique (`--anchors`: 0 stale), run with `PW_CHROMIUM=/opt/pw-browsers/chromium node scripts/mutation-check.mjs --ids <the six>` after `npm run build`: baseline 2 of 2 expectations pass, 6 records, 0 survived. A first attempt refused to start ("the watched initial compile is not the build that was there"): `build/` was a debug compile from `dotnet fable` run by hand; the reference `npm run build` fixed it, and nothing was left applied (`--stranded`: 0 markers).
- The AFLW row in that scenario is DERIVED (the committed NHL row with sport, league, club names, venue, `espn_event_id` `aflapi:9079` and start time changed), not a body the relay sent. The real AFLW feed bodies are held by the Suite, not by this scenario.

## Not verified
- The deployed page. The change is not deployed when this is written; `live-score-probe.yml` against an AFLW card (CC-CMD done condition D3) can only run on a day an AFLW card exists in the archive window, 2026-11-27 for the Grand Final.
- How the line looks on the page (size, contrast): a CSS rule was written, nobody has looked at a screenshot.
