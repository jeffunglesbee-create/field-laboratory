# Claude Code Command — one page: the non-diagnostic features as one scroll

**Branch:** main — commit directly, no feature branch, no PR
**Repo:** field-laboratory (LAB-FIRST-A: this is new composition work, so it lands here, not in jubilant-bassoon)
**Filed:** 2026-11-26, from the owner's question "what is the optimal combination of non-diagnostic features that can be displayed on a single webpage?" and the census it ordered
**Confidence gate:** `npm run gate` must score >= 95 before any commit
**Status:** IN PROGRESS. Tasks 1-4 built 2026-11-26 on a pinned capture: `tab-check` 85/85, six mutations caught (`outbox/single-page-mutations-2026-11-26.txt`). Task 5 (default flip) and the deployed-page manifest remain. Task 0 DONE 2026-11-26 (run 45894400464, `outbox/single-page-probe-2026-11-26.txt`): the relay serves `pick = null` for 2026-11-26 and `preview = "Off night..."`, so the empty Field's Pick panel is correct, not a defect. `/bsd/tennis/tournaments` carries id, name, category, surface and `is_active` but no dates, and `is_active` is true on every one of the first four (alphabetical) rows, so it cannot gate the draw. The draw's own payload (match states) must.

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
