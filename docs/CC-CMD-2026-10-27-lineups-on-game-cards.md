# Claude Code Command — attach each soccer game's lineup to its own card

**Branch:** main — commit directly, do not create a feature branch or PR
**Repo:** field-laboratory
**Filed:** 2026-10-27, the second CC-CMD of a pair (Rule 70, Rule 87.4). The first is
field-relay-nba `docs/CC-CMD-2026-10-27-bsd-event-id-on-game-rows.md`, which puts the BSD event id on
archived game rows. This one consumes it.
**Confidence gate:** `npm run gate` >= 95 before any commit
**Status:** **FILED, UNBLOCKED 2026-10-28**, not started. The relay CC-CMD is DONE (field-relay-nba
`docs/CC-CMD-2026-10-27-bsd-event-id-on-game-rows.md`; deploy run 40607238843, live proof run 40608452953).
Measured on the deployed relay by a runner: 43 of 43 and 41 of 41 soccer rows carry a `bsd_event_id` (dates
2026-08-29 and 2026-09-05), the 9 oracle rows present in the archive are all correct, and no non-soccer row
carries one. Artifact: field-relay-nba `outbox/bsd-game-join-live-latest.json`, first run kept at
`outbox/bsd-game-join-live-2026-10-28T0023Z-first-run.json`. Widened the same day (relay CC-CMD
`2026-10-28-bsd-join-aliases-beyond-the-fixture-dates`, DONE; deploy run 40624401500, live run 40625311405, read back
from D1 too): 292 of 294 soccer rows over seven further dates (2026-10-10, 09-12, 09-19, 10-17, 10-18, 10-24, 10-25) carry
an id, 53 of 53 on 2026-10-10, the day the committed lineup captures belong to. The 2 left are MLS games BSD has no event for,
so their cards say "No lineup source for this game". Seven dates, not a season. The gate this CC-CMD set itself was this command
printing a non-null id on a soccer row:

```bash
curl -s https://field-relay-nba.jeffunglesbee.workers.dev/context/date/2026-09-05 \
 | node -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8"));const s=d.games.regular.filter(g=>["MLS","EPL","La Liga","Serie A","Bundesliga","Ligue 1"].includes(g.sport));console.log("soccer rows",s.length,"with bsd_event_id",s.filter(g=>g.bsd_event_id).length);console.assert(s.some(g=>g.bsd_event_id))'
```

(Runs on a runner: this sandbox's egress proxy does not reach the relay.)

What the consumer inherits from the relay's stated limits (relay session doc,
`outbox/cc-session-2026-10-27-bsd-event-id-on-game-rows.md`, "What this does not prove"):

- 13 of the 84 joined rows have no `start_time`, so their kickoff was not judged.
- The relay's once-per-day pass joins a rolling window of the cron's date key minus 1 to plus 3 (one date per
  `*/15` tick), and was seen writing on its own on 2026-10-28 (10-26 to 10-29, 29 rows, no admin call). A game on a
  date outside that window and not backfilled by hand (for example 2026-10-25, 30 soccer rows, no id) is
  `not-joined`, and that is a real state the card shows as such, never a guess (Task 2). Rows dated 2026-08-29 and
  2026-09-05 are joined.
- The relay's `CONTRACTS.md` section "`bsd_event_id` on `/context/date` game rows" is the contract; the field is
  optional in the decode (Task 1).

---

## Why

The laboratory has a Lineups tab (`src/Lineups.fs`, `src/LineupsView.fs`): one request, seven possible
answers, a per-row predicted mark, pull-only. Owner, 2026-10-25: the lineups were meant to attach to the
individual games, not to sit in one tab. The blocker was that a game row carries no BSD event id, and what
joins them is measured in `outbox/cc-session-2026-10-26-bsd-join-probe.md`: 79 of 93 games by a name and the
kickoff, with 12 more read by eye, resolved by the relay's own `resolveTeamKey` rather than by a second
alias table in F#.

## Rulings and prior work this must not undo (BUILD-ON-A)

- **Pull only.** field-relay-nba `docs/CC-CMD-2026-10-11-predicted-xi-render-decision.md` and
  `scripts/check-lineups-pull-only.mjs`: no timer, interval, event source or schedule in the lineups path.
  A card fetches ONCE, on first expand, the way the Metrics sections do.
- **The predicted mark is a property of each row, not a badge in a corner** (that CC-CMD's Task 2), and the
  non-answers are different things drawn differently (Task 3). This reuses `LineupsView.load`, which owns
  both. **Do not write a second sheet renderer.**
- **`LaboratorySurfaceNew.fs` and `FieldLaboratorySurface.fs` (branches `jeffunglesbee-create-patch-1`, `-3`)
  are not built on.** They do not compile here (Feliz, `StructLayout`, `System.Buffers.Binary`); measured in
  `outbox/cc-session-2026-10-25-metrics-play-frames.md`. Their 7-state lineup status has no source on the
  vendor payload; `Lineups.Standing` (Confirmed, Predicted) stays.
- LAB-FIRST-A: this is lab work by the standing order. The relay CC-CMD is the only part that cannot be.
- **Not in this CC-CMD, and not a dependency:** the HUD colour scheme the owner wants lab-wide (the palette
  lives in `src/Palette.fs` and is generated into the page; it needs a dry run against `palette-check.mjs`
  first). Filed as an open owner item, not deferred work of this task.

## Scope (Rule 75)

**Touch:** `src/Desk.fs` (the game row's decoder, one optional field), `src/Scoreboard.fs` (the card, one
`<details>`), `src/LineupsView.fs` (an entry that takes an event id, NOT a new renderer), `src/Suite.fs`,
`scripts/lineups-render-check.mjs`, `scripts/check-lineups-pull-only.mjs` (extend, do not loosen),
`scripts/mutation-check.mjs`, `docs/`, `outbox/`.
**Do NOT touch:** `Lineups.fs`'s answer union or its decoder, `src/Palette.fs`, the Lineups tab's own
behaviour, the relay.

## TASK 0 — Probe block

```bash
git log --oneline -5
grep -n "EspnEventId" src/Desk.fs                      # the optional-field decode to copy
grep -n "^let load\|^let render\|^let renderRefusal" src/LineupsView.fs
grep -n "lineupsSource\|xi=predicted\|lineups-predicted" src/Program.fs src/LineupsView.fs src/Lineups.fs
grep -n "details\|summary" src/Scoreboard.fs | head     # how a card could carry an expandable
cat scripts/check-lineups-pull-only.mjs | head -60      # what it forbids, so the extension cannot loosen it
cat data/PROVENANCE.md | grep -n -i lineup
```

Print in the manifest: how `lineupsSource()` maps a pinned page to `data/lineups-predicted.json` /
`data/lineups-confirmed.json` (event 220230 and 5327), because a card whose `bsd_event_id` is one of those
two must resolve to the same capture in pinned mode, not to the network.

## TASK 1 — Decode the field

`BsdEventId: string option` on the game record, decoded `get.Optional.Field "bsd_event_id" Decode.string`
beside `EspnEventId`. Suite checks, each with a must-fail input: a row with the field decodes to `Some`;
a row without it, and a row carrying `null`, decode to `None` (a `null` is "not joined", never an empty id);
a non-string is refused by name.

## TASK 2 — The card affordance, and its states

On a **soccer** card (the Sport union already says which), a `<details>` whose `summary` names the action in
plain words. Four states, each its own `data-lineup` value and none an empty grid:
`joined` (has an id; fetches on first expand through `LineupsView.load`), `not-joined` (no id: says "no
lineup source for this game", and never fetches), `not-soccer` (no affordance at all), and whatever
`LineupsView` already returns for the vendor's own non-answers. **A game that does not join shows no lineup,
never a guess**; the ruling the relay CC-CMD cites applies here as presentation.

## TASK 3 — Pinned mode and the fixtures

Under `?data=`, a card whose id is 220230 or 5327 renders from the committed capture, exactly as the Lineups
tab does, so the render check is not network-dependent. Recapture one context with ids through the existing
capture workflow once the relay is deployed, so a committed capture carries real `bsd_event_id` values.

## TASK 4 — Checks (Rule 90: break each one on purpose first)

Extend `scripts/lineups-render-check.mjs` with predicates over a snapshot, each with its own mutation:
- every soccer card on the slate carries `data-lineup`; no non-soccer card does;
- nothing is fetched before a card is expanded, and a second expand does not fetch again;
- a `not-joined` card shows its own text and fetches nothing;
- a `joined` card in pinned mode shows both sides' rows with the per-row mark on every row (the existing
  Task 2 predicate, asserted on a card, not only on the tab).
Extend `check-lineups-pull-only.mjs` to the new `Scoreboard.fs` code path; its own mutation (a timer added)
must still fail it. Register mutations in `scripts/mutation-check.mjs` for the decode (`null` read as an
id) and the not-joined guard (a fetch on `not-joined`); run `--only` and read the baseline line.

## DONE CONDITION — artifacts (Rule 89)

1. On the pinned page (`?data=` a capture holding the two lineup events), a committed screenshot at 1000 px
   and 390 px of one `joined` card expanded and one `not-joined` card, by a CI-as-proxy workflow writing
   `outbox/lineups-card-manifest-*.json` with booleans (`soccerCardsWithAffordance`, `nonSoccerWithAffordance`
   0, `fetchesBeforeExpand` 0, `fetchesAfterSecondExpand` equal to after the first).
2. `node scripts/lineups-render-check.mjs` and `--self-test` pass, with the new predicates named in the output.
3. The Suite checks for the decode: counts before and after printed.
4. `npm run gate` >= 95, run id and score recorded; `verify` green on main, run id recorded.
5. `computed-chrome-check` run locally BEFORE landing (it is a `verify` step and not a gate row; this
   repo's last landing went red on exactly that).

## TASK 5 — Outbox manifest (last)

`outbox/cc-session-<date>-lineups-on-game-cards.md` (>= 1500 characters): commits, the gate run, the
`verify` run, the screenshots, the manifest, and any genuine residual. Mark this CC-CMD DONE with the run ids.
