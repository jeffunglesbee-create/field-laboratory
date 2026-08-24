# The vocabulary check ran, and threw its measurement away

## The end-to-end result first

`RELAY_SHARED_SECRET` reached this repo over the Courier, and
`check:sport-vocabulary` authenticated with it. Run 32676245049, step 10,
**green**.

That step is BLOCKING — no `continue-on-error`, per its own comment since
44d8e5d — and `scripts/sport-vocabulary-check.mjs` exits 1 on any of:

- `RELAY_SHARED_SECRET` unset (the throw added yesterday)
- an HTTP failure or a relay error, via `out.error`
- any label that is neither modelled nor a declared `Omission`

Exit 0 therefore means it reached `POST /d1/execute`, was authenticated, read
the games tables, and found the registry covered every label. Before today it
could not have got past the first of those.

The chain, all automated, no paste and no UI step:

```
src/index.js gate literal
 → bootstrap-relay-secret.yml   OIDC → Courier → field-relay-nba secret
 → deploy.yml step 57           OIDC → Courier → field-laboratory secret
 → check:sport-vocabulary       process.env.RELAY_SHARED_SECRET
```

## The defect found while verifying it

`sport-vocabulary-check.mjs` writes `outbox/sport-vocabulary-{ts}.json` — the
relay's full label list, the modelled/declared/missing split, and three real
rows per missing label. The drift-sentinel's commit step stages one pathspec:

```bash
git add outbox/drift-log.md
```

So the file was written on the runner and discarded with it. Every run of this
check has computed the vocabulary and thrown it away. `ls outbox/` finds no
`sport-vocabulary-*.json` at all.

**Third time today.** The relay's `/health/sources` readout wrote
`outbox/health-sources-{run_id}.json` past a `git add outbox/live-verify-*.md`
and died with its runner. The sentinel's own `entries` count was computed at
`stale-data-sentinel.js:39` and read by nothing. Same shape each time: the
measurement happens, and nothing can read it afterwards.

Fixed with a second, guarded `git add`. Separate line on purpose — `git add` is
atomic across pathspecs under `bash -e`, so folding an unmatched glob into the
existing line would abort the step before the drift-log commit ran. That is the
defect class already recorded in the relay's own commit step comment, from
`soccer-league-mislabel-scope-probe.yml` on 2026-08-06.

## What the run did report

From the slate sentinel (a different source — `/tmp/result.txt`, today's games,
not the games table):

```
Every observed sport is in the registry:
  MLB:15 MLS:11 WNBA:5 Serie A:4 EPL:3 La Liga:3 Ligue 1:3 CFL:1 golf~:1 NFL:1
```

Ten competitions on the slate, all covered. The vocabulary check asks the wider
question — every label the relay has ever archived — and its answer is the file
that was being discarded. The next run commits it.

Also this run, unprompted: the closing-odds issue **closed itself**.

```
games with both prices: 8, not sequenced: 0
8 of 8 games showed a real open/close sequence.
```

`closing_odds` is now a real closing line on every priced game. The 2026-08-10
finding — one snapshot written to two columns, the "closing" capture 22 seconds
*before* the "opening" one — no longer holds, and the self-closing issue said so
without anyone asking.

## Files

- `.github/workflows/drift-sentinel.yml` — stage the vocabulary artifact
