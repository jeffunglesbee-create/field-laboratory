# Claude Code Command — one page: the non-diagnostic features as one scroll

**Branch:** main — commit directly, no feature branch, no PR
**Repo:** field-laboratory (LAB-FIRST-A: this is new composition work, so it lands here, not in jubilant-bassoon)
**Filed:** 2026-11-26, from the owner's question "what is the optimal combination of non-diagnostic features that can be displayed on a single webpage?" and the census it ordered
**Confidence gate:** `npm run gate` must score >= 95 before any commit
**Status:** IN PROGRESS. 2026-11-27: Task 6a and 6b DONE (`outbox/cc-session-2026-11-26-live-now-line.md`). **OWNER RULING 2026-11-27, answering the question "how should the BSD feeds be read?": extend the one timer.** The 2026-11-11 ruling (poll only sports with a card in its window; stop when no window) is amended: the one timer also asks `/bsd/tennis/matches/live` and `/bsd/events/live` while the tab is visible, so it no longer stops for want of a window. Pull-only and none-on-pinned are unchanged. Task 6c (draw gated by `drawLiveness`) and 6d (staleness census) remain. Tasks 1-4 built 2026-11-26 on a pinned capture: `tab-check` 85/85, six mutations caught (`outbox/single-page-mutations-2026-11-26.txt`). Task 5 (default flip) and the deployed-page manifest remain. Task 0 DONE 2026-11-26 (run 45894400464, `outbox/single-page-probe-2026-11-26.txt`): the relay serves `pick = null` for 2026-11-26 and `preview = "Off night..."`, so the empty Field's Pick panel is correct, not a defect. `/bsd/tennis/tournaments` carries id, name, category, surface and `is_active` but no dates, and `is_active` is true on every one of the first four (alphabetical) rows, so it cannot gate the draw. The draw's own payload (match states) must.

---

## BUILD-ON-A: what this touches, and what it may not undo

Searched by content (`tab`, `single page`, `per-card`, `panel-`), not by title, 2026-11-26.

| existing | what it rules | consequence here |
|---|---|---|
| `CC-CMD-2026-11-11-live-scores-tabs.md` | Pick'em and Stats read the live reading so the tabs agree with the card | the stacked page must keep every section reading the same reading; no section may re-derive a state |
| `CC-CMD-2026-10-17-metrics-tab-render-path.md` | Metrics is a tab with its own render path | Metrics and Verify stay tabs. They are diagnostic and are not stacked |
| `Program.fs` `start` (the `queryParam "data"` gate) | weather loads on an unpinned render and never on a pinned capture. **A comment near `loadWeatherOnce` still says it waits for the tab: that comment is stale; the gate at line ~757 is the behaviour** (read 2026-11-26) | the stacked page adds no weather fetch. A pinned page shows the section collapsed as "not fetched on a pinned capture", not blank |
| `Route.fs` "THE DEFAULT SURFACE IS OMITTED" | `?tab=scoreboard` and no `tab` mean the same | the new surface gets its own slug; flipping the default is a separate, last commit |
| ADR-002 / `PICK-PROOF.md` | the pick score is sealed and never rendered | the stack renders the existing panels unchanged; no new reader of the score |

## Evidence (probed, not remembered)

`outbox/feature-census-latest.json`, run 45865985936, `main` at `351a0da7`, 2026-11-26 ET. **Coverage: 10 of 12 tabs, 7 of 108 routes.**

| tab | today |
|---|---|
| scoreboard, stats, weather, lineups, pickem | content (scoreboard 41 games) |
| draw | content, Roland Garros 2026 (a finished event; its date was not read) |
| field-pick, scout-pick, deep-cuts | empty ("No pick section in this payload" / "No game qualifies" / "No games") |
| briefs | diagnostic content (model-quality audit), not prose |

Census defects, mine: `/v2/games` needs `sport`, `/bsd/tennis/draw` needs parameters. Both rows answered 400 and say nothing about those features. The relay's `/analytics/newspaper/{date}` carries a `pick` key whose value was **not read**, so whether the pick panels are empty because of the day or because of a defect is open (Task 0).

## The design

One new surface, `tonight`: the panels the owner's question keeps, in one scroll, each under a heading, with an anchor row in place of the strip.

1. Scoreboard (cards already carry temperature, lineup button, brief line and `no odds`)
2. Pick strip: Field's Pick, Scout's Pick, Deep Cuts, each collapsed to one line when it has no content, expanded when it does
3. Pick'em
4. Stats
5. Weather (unchanged: loads on an unpinned render; collapsed with its reason on a pinned capture)
6. Draw, only when its own payload has a match not yet final (the tournaments route cannot say: no dates, `is_active` not discriminating)

Left out of the stack: Lineups (the card's lineup button covers it), Briefs, Metrics, Verify.

### Task 6a RESULT (run on `e29d6cec`, `outbox/live-sources-probe-latest.txt`, 2026-11-26 23:32Z; checked 29 of 30 sports)

- `/bsd/tennis/matches/live`: a JSON ARRAY of 3 matches, each with `status:"live"`, `tournament:{id,name,circuit,category,surface}`, `player1_sets`, `player2_sets`, `sets_detail`, `match_date`, `round_name`. **The tournament id is on every live match**, so a draw (whose URL carries a numeric tournament id) can be joined to live play by id, not by name.
- `/bsd/events/live`: `{count, events[]}`, 1 event: Brasileirao Serie A, `status:"inprogress"`, `period:"1st_half"`, `current_minute:30`, `live_websocket:true`.
- `/v2/games` by sport: exactly 1 of 29 sports had a game in state `live` (NFL: 1 live, 1 post, 1 pre). The other sports answered 200 with an empty `games` or only finals. `pga` answered 200 with NO `games` array (golf is not served by this route in this shape).
- **THE GAP, measured:** the Brasileirao game is live on `/bsd/events/live` and its league is **not in `/v2/games`' supported list of 30**. A "Live now" line built only from the cards' existing readings would not show it. Whether the archive slate carries that game as a card at all was not read.
- Not probed: golf liveness (`/v2/golf/*`), and whether the three feeds agree on a game that is on all of them (no soccer game on `/v2/games` was live at the sample time).

Design consequence: `Live now` is the UNION of three feeds, each shown with its source name: the cards' `/v2/games` readings, `/bsd/events/live` (any league), `/bsd/tennis/matches/live`. A live item that has no card is listed as its own line, not dropped. The draw section is LIVE when any live match has `tournament.id` equal to the draw's tournament id.

### Task 6b INPUTS: the two raw fixtures (committed by run on `ad2c2353`, captured 23:38Z)

`outbox/live-capture-bsd-tennis-live-20261126-2338Z.json` (3 matches) and `outbox/live-capture-bsd-events-live-20261126-2338Z.json` (1 event). Facts the decoders are written against:

- **Tennis match, fields a liveness decoder needs:** `id`, `tournament.id`, `tournament.name`, `player1.name`, `player2.name`, `status`, `round_name`, `match_date`, `player1_sets`, `player2_sets`, `current_set`, `is_doubles`, `winner_id` (null while live). The three live matches carry tournament ids `[904, 215, 904]`, two in the same tournament, one in another.
- **Not read, on purpose:** `odds_player1` / `odds_player2` and the ~40 `p1_*` / `p2_*` statistics. They are served on the live route and none of them is liveness. Decoding them would put an odds-bearing record in a decoder whose job is "is it live".
- **`status` words seen:** `live` only (3 of 3). No other tennis status word has been observed, so an unknown word is a NAMED unknown, never "live" and never "not live".
- **Soccer event:** `id`, `league_name`, `home_team`, `away_team`, `status:"inprogress"`, `period:"1st_half"`, `current_minute`, `home_score`, `away_score`, and **`last_updated`** (the staleness basis). The tennis feed has no `last_updated`; its freshness is the relay's 25 s cache only.
- **Between captures** (23:32Z minute 30, 23:38Z minute 37) the soccer minute advanced 7 for 6 minutes of clock, so the feed was current.
- **Soccer `period` words seen:** `1st_half` only. Halftime and extra-time words are unobserved.

### Task 6c SCOPING (read 2026-11-27 from `src/Program.fs` `drawUrl`, `src/DrawView.fs`, `src/Draw.fs`)

- **The draw panel's DEFAULT is a committed capture, not a live draw.** `drawUrl ()` returns `./data/tennis-draw.json`, "a real Roland Garros WTA 2026", unless the URL carries `?draw=<tournament id>`. So on the default page the draw is a finished past event and "tournament finished" (`Draw.isComplete`) is TRUE there; asking whether it is live is a category error.
- **`drawLiveness` therefore applies only to `?draw=<tournament id>`.** The tournament id comes from the URL's `draw` parameter; the `Draw` value carries the tournament's NAME, not its id.
- **What the live feed can add for the default page** is not a gate on the capture but a pointer: the Live now line can NAME the tournaments that have live matches (the captured ids 904 and 215 carry `tournament.name`), and each can link to `?draw=<id>`. Whether to do that is a product choice the code does not settle; the default below is the cheapest that keeps "always know what is live": name them in the line, link them, leave the draw's own default alone.
- **Plan:** (1) the line names live tournaments; (2) for `?draw=<id>`, `DrawView` gets the tennis state and shows LIVE (expanded, with the live match count) / NOT LIVE (collapsed, with the reason) / UNKNOWN (stated, with the feed's reason); (3) the render check mocks `?draw=904` against the captured tennis feed. Each with its mutation.

## Tasks

0. **Probe first.** Artifact: `outbox/single-page-probe-2026-11-26.txt` holding (a) the `pick` value from `/analytics/newspaper/2026-11-26` read on a runner (`gh workflow run` is broken account-wide; use the `outbox/.trigger-*` push pattern) and (b) the draw payload's tournament dates. Stop condition: if the `pick` value is non-empty while the panel says none, that is a defect and gets its own CC-CMD before anything is stacked on it.
1. **Build `tonight`.** Extend `wireTabs` and the panel markup; add the slug to `Route.fs` and `tabIds`. Do not move or rename any existing `panel-*` mount (every renderer addresses them by id).
2. **Collapse rule for the pick strip**, taken from the renderer's own state (the `PickView` outcome), never from matching its prose.
3. **Lazy draw** (a scroll listener and `getBoundingClientRect`, no new binding) calling the existing `loadDrawOnce`. Weather needs nothing.
4. **Check.** Extend `scripts/tab-check.mjs` (do not add a second harness). Mutation first (Rule 90): break each property below, watch the check go red, restore.
5. **Flip the default** to `tonight` in its own commit, after Task 4 is green on the deployed page.
6. **Outbox manifest** last: commit hashes, the run id, the manifest below.

## Done condition (artifacts, not actions)

`outbox/single-page-manifest-*.json`, written by a runner against the deployed page, with booleans and counts:

- `visibleSections` lists the six above in order, each with `textLength > 0` or a collapsed-empty marker
- `metricsVisible: false`, `verifyVisible: false`, `briefsPanelVisible: false`
- `openMeteoRequestsOnPinnedPage: 0` (unchanged behaviour, now asserted); on the deployed page weather has content or a stated reason
- `scoreOrDramaNumberInDom: false` (the check `tab-check.mjs` already makes)
- `pageErrors: []`
- a `checked N of M` line, per Rule 91

`node scripts/tab-check.mjs` exits 0 with the mutation entries for each property above recorded as caught.
