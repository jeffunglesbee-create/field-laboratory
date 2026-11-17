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

## The 37 classified by name, verified (owner: "Verify the 37", 2026-11-17)

Method: ARCHIVE_DB first (2026-10-18 to 2026-11-17, which teams' games carried each outlet), then web sources. Every classification stands; none moved.

**Confirmed by a source (31):**
- National: Paramount+ (US Champions League and all 380 Serie A matches), beIN Sports (Ligue 1), ESPN Deportes (La Liga, Spanish), Universo (Telemundo's channel for the Premier League in Spanish), FOX Deportes (Spanish simulcast of FOX's MLS package), CNBC, E! and SYFY (national cable networks of Versant, which holds the WNBA's cable rights and the Bundesliga's), Hulu (national NHL games stream on "ESPN+, Disney+, Hulu", e.g. the Ducks' national schedule).
- Local, each tied to its team by the archive and confirmed by a source: KJZZ-TV and Jazz+ (Jazz), KSBI and the Thunder app (Thunder+; Thunder), ClipperVision and KTLA (Clippers), Spectrum Sports Net and Spectrum Sports Net + (Lakers, 15th season), KING 5 and KHN (Kraken Hockey Network; Kraken), KDFW 4 and KDFI (FOX 4 and FOX 4+; Stars), KTTV and Fox 11 Plus (Ducks), KSTP (Wild over-the-air), WWHO (CW Columbus; Blue Jackets), Altitude Sports, KUSA-TV (9NEWS) and ALT2/KTVD (Nuggets and Avalanche, Altitude with TEGNA), MSG2 (MSG Networks' overflow feed for the Devils and Islanders; the source is a community wiki, the weakest here), Bucks App (Bucks+, the team's stream).
- League-wide: NBA League Pass blacks out local-team and national games in the US (NBA's blackout guide), so it is the out-of-market product, as MLB.TV.

**Not confirmed, classification kept (6):** NFL Net (no result returned), "Tele" (read as Telemundo; the string itself not confirmed), "MyMi" (the Bucks' station found is MY24; the name MyMi was not found), NBC Sports Phil + (the regional network is confirmed, the "+" service is not), CHSN+ (nothing returned), Arizona's Family CBS5 (the Suns' partner is Gray's Arizona's Family; CBS5 specifically was not covered).

**Found, not changed: ESPN+ on national NHL games.** The archive's "Disney+, ESPN+, Hulu" (11 appearances, e.g. 2026-11-03, 11-05, 11-10, 11-12) is ESPN's national NHL package. ESPN+ is on the local side by the owner's 2026-11-15 ruling, so Gate 0 reads those national-exclusive games as "local available" and does not veto them. The ruling is the owner's to revisit; nothing here changes it.

## ESPN's national package (owner's ruling, 2026-11-17: "ESPN+ national when only with Disney+ and Hulu")

Built in `Scout.broadcastOf`: when every listed outlet is ESPN+, Disney+ or Hulu, and ESPN+ is there with at least one of the other two, the game is national-only (on "ESPN+"). ESPN+ alone, or beside any team or regional outlet, stays local per the 2026-11-15 ruling. Measured before building: from 2026-08-01 to 2026-11-17 the archive's only shape with ESPN+ beside Disney+ or Hulu is "Disney+, ESPN+, Hulu", 15 NHL games. `check:outlet-registry` 35/35 (5 new cases, both directions); the rule removed: 33/35; the "with at least one other" condition removed (ESPN+ alone becomes national): 33/35. `check:deep-cuts` 28/28, `check:scout-coinflip` 27/27, `check:pick` 24/24, `check:tabs` 66/66, render checks 19/19.
