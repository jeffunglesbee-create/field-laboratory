# The CC-CMD status audit, and the grep that got its own question wrong

**2026-08-27** · field-laboratory · `scripts/cc-cmd-status-check.mjs`,
`.github/workflows/guards.yml`, five `docs/CC-CMD-*.md` status lines

## The ask

"Audit the 10 CC-CMDs marked open." I had produced that number myself, one turn
earlier, and offered it as one of three next steps.

## The number was wrong, and the way it was wrong is the finding

The command behind it was:

```
grep -qiE '^#+ *(CLOSED|RESOLVED|DONE)' "$f"
```

It looks for a closing **heading**. Fifteen of eighteen CC-CMDs record their
state on a `**Status:**` **line** near the top — `**Status:** CLOSED. Asks 1, 2,
3, 4a…`, `**Status:** RESOLVED by the relay session`, `**Status:** BUILT
2026-08-24 as relay scoring era 5`. Every one of those read as unfinished.

Ten open. Three had no status at all. One was a stale marker I had written
twenty minutes before.

**Reading a stale "open" is not a cosmetic error in this project.** The
field-relay-nba HANDOFF counts five CC-CMDs in one week that described work
already done, and the 2026-08-23 FPL case is the expensive one: the duplicate
was not merely redundant, it reintroduced two defects the original had been
corrected for a day earlier — reading events from `element.explain[]`, which
carries only identifiers that scored points, and gating on `fixture.finished`,
which FPL flips hours after full time.

## The same grep failed in the opposite direction

`CC-CMD-2026-08-27-relay-per-play-epa` was closed at 22:43 with a `## CLOSED`
section enumerating three met done conditions against named artifacts. Its
status line still read:

```
**Status:** FILED, not started.
```

The heading-grep called it closed. A line-grep would have called it not started.
Both were reading the same file. A reader who trusted either half was wrong
about the other, and the document sat in that state for twenty minutes without
anything able to notice.

One cause behind both failures: **the marker had no agreed form, so no
mechanical reader could be trusted about it in either direction.** The audit's
own instrument was the first casualty.

## Four findings, each verified against repo state rather than the document's prose

Rule 72. A CC-CMD's account of itself is a claim, not evidence — which is the
whole reason the audit exists.

### 1. `relay-per-play-epa` — FILED above its own closing section

Mine, from today. Corrected to `CLOSED 2026-08-27`, pointing at the section that
already carried the evidence.

### 2. `archive-seed-coverage` — a per-ask status standing in for the document's

It opened:

```
**Status:** ASK 3 WITHDRAWN — EPL was already in the seed table and already
seeded; there was no gap. Asks 1–2 (declared manifest + check) survive…
```

True of ask 3. False of the document. A reader scanning status lines saw a
withdrawal and moved on, while two unbuilt asks sat underneath it in the same
sentence.

Verified against field-relay-nba HEAD before changing anything:

```
$ ls scripts/ | grep -i seed
probe-epl-seed-premise.mjs
repair-cfl-seed-duplicates.mjs
run-cfl-seed-backfill.mjs
$ grep -rn "seed manifest\|SEED_MANIFEST\|seed-manifest" -i --include=*.mjs --include=*.js --include=*.yml .
(nothing)
```

No declared seed manifest and no seed-coverage check exist. Asks 1 and 2 are
genuinely open. Status is now `PARTIAL`, leading with the document's state and
carrying the per-ask detail after it.

**This is the one substantive piece of work the audit surfaced.** It is also the
only remaining open ask in the repository.

### 3–4. The three 2026-08-09 asks carried no status line at all

All three are BUILT. Evidence, not inference:

| ask | evidence |
|---|---|
| `fix-cloud-setup-and-scaffold-fable` | `src/Laboratory.fsproj` + 20 `src/*.fs`; `npm run check:proof` compiles under the real F# compiler; `verify` green |
| `dotnet-sdk-and-desk-scoreboard` | the desk/scoreboard shipped as `src/Scoreboard.fs`; SDK path proven by the same compile |
| `drift-sentinel-and-reactive-staleness` | `.github/workflows/drift-sentinel.yml`, 57 rows in `outbox/drift-log.md`, latest `ok` 2026-08-27 (55 games, 0 malformed); staleness fixed as that document's own Option 1 — `stateNode` at `src/Scoreboard.fs:270` wraps every state-derived node in `Solid.createEffect`, with `staticNode` beside it carrying the comment for nodes safe to set once |

**Their shared residual is real and is named in each status line rather than
left to imply the ask is open.** The cloud environment's setup-script field is
still unpasted; every cold session pays ~30 seconds installing the .NET SDK
through the fallback `SessionStart` hook. It was explicitly out of scope when
filed — no session has tool access to that dialog — and it is the same field
whose failure paused `trig_01F5beAeTgNKG9v9a4s6Sxus` (the field-playground
refresh routine) earlier today. A human editing it at claude.ai/code is the
only fix.

A residual assigned to a human does not make an ask non-terminal, or these three
stay open forever waiting on a settings dialog.

## The guard

`scripts/cc-cmd-status-check.mjs`. It checks three mechanical properties and
**judges no ask's completeness** — that is a human and a measurement, never a
linter:

1. Exactly one `**Status:**` line per document, so a grep for it cannot silently
   find nothing, and a second line cannot override the first (the `tail -1`
   bypass that `confidence-record-check.mjs` documents).
2. That line opens with a word from a closed vocabulary — `CLOSED RESOLVED BUILT
   DONE LANDED SHIPPED WITHDRAWN SUPERSEDED` as terminal, `FILED OPEN "IN
   PROGRESS" BLOCKED STAGED PARTIAL` as not. A grep for the terminal words is
   exhaustive only if this holds; without it, a grep is a guess about phrasing.
3. No document is non-terminal at the top and closed further down.

**11 self-tests, and the EPA contradiction is one of them as a fixture**, so a
detector that stops matching fails in the self-test rather than passing silently
on the real run. Two of the self-tests are negative — a terminal status above a
closing section is fine, and the phrase "the relay just closed this" in a
paragraph is not a closing section — because a contradiction detector that fires
on prose would be worse than none.

Non-vacuity: the run refuses an empty `docs/`, so "every status is well-formed"
cannot pass by having nothing to check.

### Cost

Zero additional CI. `guards.yml` already fires on `docs/**` — that trigger was
added precisely because `verify.yml` excludes docs to protect the Actions budget
(90% consumed), which left six ratchets under `docs/` unread by any workflow.
CC-CMDs live there too, so a status edit already pays for a guards run.

## State after

```
18 CC-CMD(s): 17 terminal, 1 open
  OPEN  CC-CMD-2026-08-21-archive-seed-coverage.md — PARTIAL
```

## What I would flag to the next session

The audit changed no ask's actual state. It changed what a reader can learn in
one command, and it found one open ask that four weeks of status lines had
hidden behind a withdrawal.
