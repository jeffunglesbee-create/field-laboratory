# A finished CFB game as the relay serves it, read 2026-11-22

**Method (Rule 73).** `probe_relay_route` (the session's relay self-fetch tool) on `/v2/games?sport=cfb&date=2026-11-21`, read on 2026-11-22 (a second read later the same day returned the same first game): status 200, `content-type` application/json, `bodyBytes` 28016. The tool returns the first 12 KB of the body, which holds the first games of the day; every game in that part reads `"state":"post"`. The first game, verbatim as returned:

```json
{"id":"espn:401856753","espnEventId":"401856753","sport":"cfb","league":"NCAAF","state":"post","start":"2026-11-22T00:30Z","home":{"name":"South Carolina Gamecocks","abbr":"SC","score":6,"curatedRank":21},"away":{"name":"Georgia Bulldogs","abbr":"UGA","score":34,"curatedRank":1},"periodNum":4,"periodLabel":"F","clock":"0:00","venue":"Williams-Brice Stadium","round":12,"broadcasts":["ABC"],"streams":[{"label":"ABC","market":"National","type":"TV"}],"situation":null}
```

**Conditions.** Games of 2026-11-21 (the ET day), read after they finished; the body's other games, past the first 12 KB, were not read. The game's archive row, `data/context-2026-11-21.json` row `CFB_2026-11-21_e401856753`, carries the same ESPN event id.

**What it shows.** A finished CFB game reads `state` `post` (not `final`), `periodLabel` `F`, `clock` `0:00`, integer scores, and an `espnEventId`. **What it does not show:** a CFB game in play.

Used by: the Suite row "a real CFB game that is over says `post`..." in `src/Suite.fs`, and the comment in `src/LiveFeed.fs`.
