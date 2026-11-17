# Scout's broadcast registry: every outlet of the last 30 days, by the owner's "Full scope"

**Date:** 2026-11-17. **Repo:** field-laboratory. **Files:** `src/Scout.fs`, `scripts/outlet-registry-check.mjs`, `data/outlets-2026-10-18-to-11-17.json` (new).
**Trigger:** the owner's screenshots of Deep Cuts on 2026-11-16 ("Verify new outlets"), then "Full scope".

## What was measured

- ARCHIVE_DB, 2026-10-18 to 2026-11-17, `streams` split per outlet: **102 distinct outlets, 1,691 appearances; 47 unknown to the registry, 645 appearances.** Committed as `data/outlets-2026-10-18-to-11-17.json`.
- Verified by web sources, 2026-11-17: **NBCSN** is NBCUniversal's national cable channel, relaunched 17 November 2025, carrying Monday NBA games (NBC Sports press release; Hoopswire); **DAZN CLE / IND / SAS** are DAZN's exclusive local broadcasts of the Cavaliers, Pacers and Spurs (Sportcal; SVG); **KUNP 16** and **BlazerVision** are the Trail Blazers' local station and team stream (NBA.com; Awful Announcing); **Suns Live** and **Arizona's Family** (KTVK 3TV, CBS5) are the Suns' team stream and local partner (azfamily; NBA.com); **Fandango** is the free national stream of the Bundesliga under Versant's USA Sports deal (Business Wire; bundesliga.com); **"Apple TV"** is the 2025 rename of Apple TV+, where MLS moved (AppleInsider).
- On 2026-11-16 the Celtics v Magic row carried `NBCSN` alone, so Gate 0 read it "cannot tell"; it is national-only. It could not have qualified (-380). The Deep Cuts pick that night, Rockets @ Heat, carries no outlet at all; its US channel was not found.

## What changed

National: NBCSN, Apple TV, Fandango (verified); Paramount+, ESPN Deportes, beIn Sports, Universo, Tele, CNBC, E!, SYFY, FOX Deportes, NFL Net, Hulu (by name and precedent). Local: DAZN CLE, DAZN IND, DAZN SAS, KUNP 16, BlazerVision, Suns Live, Arizona's Family 3TV and CBS5 (verified); NBA League Pass (league-wide out-of-market, as MLB.TV); 24 team feeds, regional networks and local stations (by name). 14 national + 33 local = the 47.

## Proof

| check | result |
|---|---|
| `check:outlet-registry` | 30/30 (9 new): 102 of 102 census outlets known; the verified ones by table |
| "NBCSN" removed | 28/30 |
| `check:deep-cuts` 28/28, `check:scout-coinflip` 27/27, `check:pick` 24/24, `check:tabs` 66/66, `check` / `check:hard` / `check:render-sports` 19/19, `outlet-scan-check` 6/6, `check:script-orphans`; mutation anchors on changed files 4, 0 broken | green |

## Not changed

A game whose Gate 0 answers "cannot tell" (no outlet listed) can still be Scout's or Deep Cuts' choice. That is the open question put to the owner on 2026-11-16, not decided here.

## NBA TV, verified after the fact (owner asked, 2026-11-17)

NBA TV entered the registry as national on 2026-11-15 from the owner's pasted list, without a source. Verified now: for 2026-27 the NBA announces NBA TV's 60-game regular-season slate as the piece that "completes the national television schedule" (pr.nba.com, "NBA TV unveils game schedule for 2026-27 regular season"), and it also "will continue to televise select games ... simulcast from regional broadcasters". The classification stands: national. A simulcast is served with the regional outlet beside it ("NBA TV, DAZN IND" on 2026-11-07, "NBA TV, GCSEN, Pelicans.com" on 2026-11-09), which Gate 0 already reads as local available; "NBA TV" alone (e.g. Heat v Pistons, 2026-11-14) is national-only.
