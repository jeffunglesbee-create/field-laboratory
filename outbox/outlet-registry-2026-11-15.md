# Scout's broadcast registry: the 11-14 slate's 42 unknown outlets classified

**Date:** 2026-11-15. **Repo:** field-laboratory. **Files:** `src/Scout.fs`, `src/StatsView.fs`, `scripts/outlet-registry-check.mjs`, `data/streams-2026-11-14.json`, `package.json`, `.github/workflows/verify.yml`.
**Trigger:** owner-pasted proposal 1 of 5, approved 2026-11-15 ("All approved"), with the paste's own classification.

## What was measured

- ARCHIVE_DB, `streams` for 2026-11-14, both tables: 79 rows, 8 with no streams, 51 distinct outlet strings. Against the registry as it stood, 42 were unknown (the paste said 43; the source read gives 42). Committed verbatim as `data/streams-2026-11-14.json`.
- One of the 42 was a spelling miss: the registry held "FOX" and the slate served "Fox" on three CFB games. Matching stays exact; both spellings are listed.
- The paste's claim that this would credit Fox and CBS games in Field's Pick is not so. Field's Pick is ranked by the relay (`scoreCandidatePick`, a regex that already matches FOX and CBS), and CFB is not in its sport set (`PHASE9_SPORTS = nba, nhl, mlb, wnba, wc26`). This registry is Scout's Gate 0 and the stats panel's broadcast row only.

## Classification

- National (owner): Fox, CBS, CW, NBA TV, NHL Net, ESPNU, CBSSN, USA Net. Plus "Disney+", classified here and not by the owner: it appears only beside ESPN or ABC, and as a local outlet it would have made "ESPN, Disney+" qualify.
- Not national (owner): BTN, SEC Network, ACC Network, ESPN+, MW+, the DAZN regional feeds, Prime Video (Local), Altitude 2 Sports, MNMT. The remaining regional networks, local stations and team feeds of that slate go with them.
- The paste's "ESPNews" is not added: it did not appear on the slate, and its served spelling is not known.
- The stats row for the local case now reads "a regional, team or streaming-only outlet is listed", because ESPN+ is none of the old wording's "local or team".

## Proof

| check | result |
|---|---|
| `npm run check:outlet-registry` (new) | 21/21; 51 of 51 distinct outlets known; Gate 0 over the 79 games: NationalOnly 33, LocalAvailable 38, Unrecognised 0, none listed 8 |
| same, with "Fox" removed from the registry | 19/21 (two red), restored to 21/21 |
| `outlet-scan-check` 6/6, `check:pick` 24/24, `check:drama-reading` 9/9, `check:tabs` 61/61, `check` / `check:hard` / `check:render-sports` 19/19 each, `check:script-orphans`, `check:workflows` 71/71 | green |

## Residual

- The ruling makes an ESPN+-only game pass Gate 0. Scout's Pick still needs a gate that QUALIFIES (A to D); on this payload only Gate A (series) can, so most games read "cannot tell" until gates B to D have data. Replacing those gates (proposal 3) is not built here.
