# Two clients, two briefs, and an ordering key that does not order

**Date:** 2026-08-29
**Scope:** diagnosis. `scripts/brief-join-capture.mjs`,
`.github/workflows/brief-join-capture.yml` — capture plumbing only, no fix yet.

## The report

Two screenshots of the same match — Eintracht Frankfurt v 1. FC Union Berlin,
Bundesliga, 3–3 — showing different prose.

jubilant-bassoon, Night Owl:

> Eintracht Frankfurt and 1. FC Union Berlin finished 3–3 tonight … 1. FC Union
> Berlin maintained a 48% possession rate … Eintracht Frankfurt generated 1.8 xG
> through **14 shots** …

field-laboratory, Bundesliga section, labelled `GAME_LIVE`:

> Frankfurt and Union Berlin traded goals in a 3–3 draw tonight at Stadion An
> der Alten Försterei … Frankfurt recorded **3 shots** tonight …

## Cause 1: they read different artefacts, by construction

| | reads |
|---|---|
| jubilant-bassoon Night Owl | its own generation — enqueues a journalism job at game-final, polls `field.js:40778` `${JOURNALISM_RESULT_RELAY}/${_owlJobId}`, and falls back to `fetchNightOwlFromClaude(topGame)` with a full live-context prompt |
| field-laboratory | `src/Program.fs:23` `/context/date/<date>` → the relay's `briefs` D1 table, served as `SELECT *` |

`renderNightOwlRecap` and the 485 lines it spans contain no read of
`/archive/query` or `/context/date`. The client never sees the archived brief
rows the laboratory renders, and the laboratory never sees the client's
generation. Two prompts, two moments, two models' worth of output.

So "14 shots" and "3 shots" are not a contradiction between two sources. They
are the same source at two times — 3 shots when the live brief was written,
14 by full time. The defect is not that the numbers differ. It is that the
laboratory is showing a mid-match brief on a finished match.

## Cause 2: the laboratory picks the live brief on a final game, 10 of 10

> **SUPERSEDED 2026-08-29** by `cc-the-recap-on-a-finished-game-2026-08-29.md`.
> The 10-of-10 below was measured on a capture truncated at 50 briefs/day. On the
> untruncated 667-brief window the real figure is **188 of 199** — payload order
> was already right 94.5% of the time. `updated_at`, which this document proposed
> as the fix, picks the after-brief **0 of 199**. Both numbers below stand as
> what was measured; neither is what is true.

`src/Desk.fs:792`:

```fsharp
usable
|> List.tryFind (briefKeyMatches g)
```

First brief in payload order, no preference for type, state or recency.
Measured against `data/brief-join-corpus.json` (542 briefs, 469 games,
2026-08-01 .. 08-16):

```
games with a joining brief                          259
games carrying MORE THAN ONE                         78   (30%)

FINAL games carrying both a live-state and a finished-state brief:  10
                                              (plus 67 not cleanly separable)

  payload order (tryFind) picks the FINISHED brief :  0
  payload order (tryFind) picks the LIVE brief     : 10
```

Zero for ten is not a tendency. It reproduces the screenshot exactly.

## The obvious fix is refuted before being written

"Take the newest" is the fix everyone writes first. Measured on the same ten:

```
  newest created_at picks the FINISHED brief :  4
  newest created_at picks the LIVE brief     :  6
```

Worse than a coin. The relay's own schema comment says why —
`field-relay-nba/src/index.js:5445`:

> Three of the ten INSERT sites are ON CONFLICT(id) DO UPDATE … so a brief can
> be rewritten in place any number of times while created_at keeps its original
> value forever. Measured directly: `game_recap_epl_401879321` carried a
> fabricated "37 goals this season" at 19:09, and was clean at 21:14 with a
> different length — genuinely regenerated … and completely invisible to any
> freshness question, because its created_at still said 18:30:53.

`updated_at` was added on 2026-08-22 with a trigger (`index.js:5498`) for
exactly this, and `/archive/query` has served it since 2026-08-23
(`index.js:12000`, "additive so no consumer moves").

**The corpus was captured 2026-08-01 .. 08-16 — before the column existed.**
So the one key that could order these rows cannot be tested against the data
this repo holds. That is the whole reason this document stops at diagnosis:
the fix is not unknown, it is unmeasured, and writing it now would be the
assumption this session has already caught seven times.

## What this commit changes, and what it does not

Capture plumbing only.

- `brief-join-capture.mjs` projects `updated_at`.
- Its output path is now `process.env.OUT`. `data/brief-join-corpus.json` is
  pinned at `briefs.length === 542 && games.length === 469`
  (`game-id-check.mjs:117`) and at 97 games with no `espn_event_id` (`:167`), so
  re-capturing over it turns a data refresh into three failing assertions. The
  script's own header already gave this reasoning for refusing to re-capture
  `jq-mlb-game-corpus.json`; it simply had one hardcoded destination and could
  obey it only once.
- The workflow takes `out` as a dispatch input and commits that path.

No change to `Desk.fs`. No ordering key chosen.

## Unblock criteria (Rule 74)

**Staged:** an ordering key for `briefsByGame` when a game carries several
briefs.
**Blocked by:** no captured corpus carries `updated_at`.
**Unblocked when:** `brief-join-capture` is dispatched with
`from: 2026-08-23`, `out: data/brief-recency-corpus.json`.
**Verify:**

```
node -e "const c=require('./data/brief-recency-corpus.json');
  console.log(c.briefs.filter(b=>b.updated_at).length, 'of', c.briefs.length, 'carry updated_at')"
```

The key is decided by re-running the ten-game measurement above against
`updated_at` instead of `created_at`. If it does not beat 10/10, it is not the
key either, and the next candidate is matching the brief's described state to
the game row's own `finalized_at` — which is a claim about prose and would need
its own corpus.
