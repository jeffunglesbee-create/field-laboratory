# Claude Code Command — a soccer card's lineup, on the live relay path, on the deployed page

**Branch:** main — commit directly, do not create a feature branch or PR
**Repo:** field-laboratory
**Filed:** 2026-11-03, a follow-up named in `outbox/cc-session-2026-10-28-lineups-on-game-cards.md` ("What this does not prove").
**Confidence gate:** `npm run gate` >= 95 before any commit that changes source; this changes scripts, a workflow and docs, so
`verify` green on the commit and a gate on the landing tree.
**Status:** **FILED.** Resolved against HEAD `14e48ad`; Task 0 re-probes every line.

```bash
git remote get-url origin | grep -q field-laboratory || { echo "WRONG REPO"; exit 1; }
git pull; git log --oneline -5
```

## Why this exists, measured

`docs/CC-CMD-2026-10-27-lineups-on-game-cards.md` is DONE and its probe (`lineups-card-probe`, run 40648089423) judged the card on a
PINNED page: `?data=context-2026-10-10`, where the only lineup file a card can reach is a committed capture. Event 5327 has one.
Every other joined card on that page draws "No request was made", by design. So no check anywhere makes the request the product makes:
an unpinned page, a card whose event has no committed capture, opened, calling the relay's `/bsd/events/<id>/lineups`. The session doc says it
in so many words ("its live behaviour (a request to the relay's route) is not run by any check here"). The 53 cards of 2026-10-10 prove the
affordance; none proves the path.

Searched before filing (BUILD-ON-A): `grep -ln "unpinned\|live relay\|/bsd/events/" docs/CC-CMD-*.md` finds three documents
(`brief-data-quality`, `proof-claim-staleness-sweep`, `bsd-ws-frame-shape`), none about a card. No open CC-CMD covers this.

## Rulings and prior work this must not undo (BUILD-ON-A)

- `docs/CC-CMD-2026-10-27-lineups-on-game-cards.md`: the card's DOM contract (`data-lineup`, `data-lineup-event`, `data-answer`), fetch once on
  first open, click does not turn a flippable card, an id that is not ASCII digits never goes into a URL. This probe READS that contract; it does
  not change it, and it adds no F# source.
- Relay owns the data contract (Rule 60). The probe judges the page against the relay as it is served; it normalises nothing and carries no
  field mapping.
- Lineups is pull-only (`check-lineups-pull-only.mjs`): the probe opens cards one at a time, once, and sets no timer.
- `scripts/lineups-card-probe.mjs` and its workflow stay as they are: that is the pinned-page proof.

## Premises, each with the one command that would refute it (Rule 100)

| premise | refuting command |
|---|---|
| an unpinned page loads its slate from `RELAY_DATE + viewedDate()`, and `?date=` picks the day | `grep -n "RELAY_DATE\|queryParam \"date\"" src/Program.fs` |
| a joined card's lineup request is `https://field-relay-nba.jeffunglesbee.workers.dev/bsd/events/<digits>/lineups` | `grep -n "RELAY_EVENTS\|sourceForEvent" src/LineupsView.fs` |
| the card reports what it drew in `data-answer`, one of nine values | `grep -n "answerSlug" -A12 src/LineupsView.fs` plus `renderRefusal` (`not-requested`) |
| some day in the last three days or the next one has joined soccer cards on the live relay | Task 1's first run prints the count per date; a zero is a finding, not a pass |
| the relay answers a joined row's route with something the page can draw | Task 1's manifest lists the answer per card |

## Scope

**Touch:** `scripts/lineups-live-lib.mjs` (new, pure), `scripts/lineups-live-probe.mjs` (new), `.github/workflows/lineups-live-probe.yml` (new),
`package.json` (one script), `.github/workflows/verify.yml` (one step), `outbox/`, `docs/`.
**Do NOT touch:** anything under `src/`, `scripts/lineups-card-probe.mjs`, `scripts/lineups-card-lib.mjs`, `index.html`, any relay file.

## TASK 0 — Probe block (run first; write nothing until it prints)

```bash
git log --oneline -5
grep -n "RELAY_DATE\|queryParam \"date\"" src/Program.fs | head
grep -n "RELAY_EVENTS\|sourceForEvent" src/LineupsView.fs | head
grep -n "| Sheet\|| ServedEmpty\|| NotInPayload\|| ExplicitlyNull\|| UpstreamFailed\|not-requested" src/LineupsView.fs | head -12
```

Print, in the manifest: the nine `data-answer` values the page can draw.

## TASK 1 — The probe, pure verdicts first

`scripts/lineups-live-lib.mjs`: `candidateDates` (the ET day, the three before it, the one after), `pickDate` (most joined soccer cards,
newest on a tie), `cardVerdict` (one request, to the card's own event id, answer drawn, a sheet has two sides and every row marked), `aggregate`
(PASS only when every sampled card is wired AND at least one drew a sheet; `WIRED-NO-SHEET`, `FAIL`, `NOTHING-TO-JUDGE` otherwise). Self-test with a
must-fail input for every clause (Rule 90): a second request, a request to another event's URL, a request on a pinned-style `not-requested`, no
answer drawn, a one-sided sheet, an unmarked row, zero joined cards, all-`upstream-failed`.

`scripts/lineups-live-probe.mjs`: on the deployed page, unpinned, opens `?date=D` for each candidate date, chooses one, opens up to five of its
joined cards one at a time, reads `data-answer`, counts the requests, closes and reopens the first (no second request), and photographs the first
card that drew a sheet at 1000 and 390 px. `--routed` runs the same code against a local build with the relay routed to fixtures, for development
only: its output is never the done-condition artifact.

## TASK 2 — The workflow, and the run

`.github/workflows/lineups-live-probe.yml`: a push of `outbox/.trigger-lineups-live-probe` or a dispatch; no schedule (a recurring probe is
recurring Actions cost, CLAUDE.md "Actions budget"). It commits the manifest and screenshots to the ref that started it and fails the job unless the
verdict is PASS. Run it on the deployed page after this lands.

## DONE CONDITION — every line an artifact (Rule 89)

1. `node scripts/lineups-live-lib.mjs --self-test` and `node scripts/lineups-live-probe.mjs --self-test` print their denominators and pass, each
   clause with its must-fail input, and run in `verify`.
2. `--routed` against a local build: a PASS on a mix of answers, and a FAIL when a card is made to request twice (the mutation).
3. A runner run on the deployed page writes `outbox/lineups-live-manifest-*.json`: the five dates with their joined counts, the date chosen,
   the cards sampled with event id, request URL, HTTP status and `data-answer`, the answers by kind, `verdict`, and screenshots of a card that drew
   a sheet at 1000 and 390 px, read by eye.
4. If the verdict is not PASS, the cause is written in the outbox as found and this CC-CMD stays PARTIAL; a probe that cannot judge is not a pass.
5. `verify` green on the landing commit (run id printed).

**What this does not prove, stated where it is read:** one day's slate, up to five cards; the relay's data on that day. It proves the page makes the
right request and draws what it is given, not that the relay has a lineup for every game. A day with no joined soccer card is NOTHING-TO-JUDGE,
never a pass.

## TASK 3 — Outbox manifest (last)

`outbox/cc-session-<date>-lineup-card-live-path.md`: commit hashes, the run ids, the manifest, the screenshots read, what was found. Mark this
CC-CMD DONE with the run ids.
