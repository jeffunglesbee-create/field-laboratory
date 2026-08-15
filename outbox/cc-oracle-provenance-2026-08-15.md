# Outbox — closing Phase 1's soft links, and what Phase 2 is actually blocked on

**Date:** 2026-08-15
**Ships:** `docs/ORACLE-PROVENANCE.md`, `--from-disk` in `jq-density-census.mjs`,
`check:census` in `verify`, corrected provenance header in `jq-tokenizer.mjs`

Phase 1 shipped at `8fd151e` with four known-soft spots. Three are closed here.
The fourth turns out to be permanently unclosable, and is stated as a limit
rather than carried as an open item.

## 1. The census script was refactored and never executed

When the tokeniser was extracted into `jq-tokenizer.mjs`, `jq-density-census.mjs`
lost 50 lines and gained an import. Its only evidence was `node --check`, which
is syntax and not execution — the script has never run anywhere but a dispatched
runner, because the relay is 403 CONNECT at the agent proxy.

An unrunnable script is one nobody notices has broken. `--from-disk` reads the
committed corpus instead of the relay, so `--verify-tokenizer --from-disk` now
runs in `verify` on every push and covers everything the network path covers
except `fetchDate`: that the import resolves, that `tokens` and `FIXTURES` are
the names this file expects, and that the fixture block holds against 592 real
briefs.

Teeth measured, not assumed. With `w.length > 1` changed to `> 2` in the shared
tokeniser, `check:census` exits **1** and names the two fixtures that moved; the
mutation reverted, it exits **0**. It also refuses to write the corpus under
`--from-disk` — re-emitting the capture from itself would look like a fresh
capture in the git history while carrying no new evidence.

## 2. Stale comments describing code that had moved

`jq-density-census.mjs` still carried a banner reading *"the tokenizer, verbatim
from scoreProse / Do not clean this up"* above the place the tokeniser used to
be, and claimed `--verify-tokenizer` re-derives *"the twelve hand-checked
briefs"* when `FIXTURES` holds four. Both corrected. A comment that describes
absent code is how a proof doc drifts ahead of its subject, which is the failure
this repo keeps filing against other people's code.

## 3. The oracle was verified through a proxy. Now it is verified directly.

This is the substantive one. `prose-check` measures `src/Prose.fs` against
`jq-tokenizer.mjs`, which *claims* to be the relay's `scoreProse` and was only
ever evidenced by four fixtures. Four briefs agreeing is consistent with the copy
being right and equally consistent with it being wrong in a way those four do not
exercise.

The relay MCP's READ_ALLOWLIST covers `src/`, so the original was read and
compared line by line — `field-relay-nba/src/journalism-quality.js` at sha
`9d8151d44f32890b818dc03b7d8565ac06b8c452`. Full table in
`docs/ORACLE-PROVENANCE.md`. Every line the oracle claims to reproduce, and which
still exists upstream, is **token-for-token the same expression**: relay lines
420-424, 443-450, 451-458, 524, and the weights at 531.

It is **not** byte-identical, and saying so would be the overstatement this repo
exists to catch. The relay terminates statements with semicolons and aligns
`const numbersAll  =` against a neighbour that has since been deleted; this repo
does neither. Nothing there is observable at runtime, but it does mean the copy
can never be checked by hashing — only by reading, which is what the table is.

Two divergences, both deliberate, and one of them changes a Phase 1 claim:

- **`properNouns` no longer exists upstream.** The 2026-08-13 unit fix made it
  dead and it was deleted. The shipped `rawDensity` is therefore *not
  re-derivable from current relay source* — it is the pre-fix formula, retained
  because the 592 stored `quality_score` values were produced by it. What pins
  that history is the four fixtures and nothing else. That does not improve with
  time and is the limit, not an open item.

- **`densityNumsOnly` was written as a proposal. It is now production.** Relay
  line 523 reads `const rawDensity = numbersAll.length / nSent`, identical to
  `numsPerSent`. So `Prose.density` — the F# function carrying
  `float<numeral/sentence>` — computes what production computes today, not what
  this repo thinks it should. `cc-prose-units-2026-08-14.md` understated this.

The comparison is manual and one-shot. Automating it needs `X-FIELD-Relay` as a
GitHub Actions secret; that value is not going into this repo's source, so the
automation is the user's call and is named here rather than worked around.

## 4. What Phase 2 is blocked on — measured, not guessed

Phase 2 is `src/Corpus.fs`: `Brief` and `ScoredBrief` as distinct types, with the
unscored set as a **set difference** rather than a NULL check. Before writing it,
two facts were checked against the live relay instead of assumed.

**`/archive/query`'s projection does not carry the fields the type needs.** The
full set of keys returned is `id, date, brief_type, sport, game_id, brief_text,
model, quality_score, word_count, source, created_at`. There is **no
`context_hash` and no `scoring_version`** — the two fields the two-stage
lifecycle is about. A `ScoredBrief` carrying them would carry fields that are
always absent, which is a type modelling a wish.

**The corpus has an empty difference.** All 592 rows in
`data/jq-mlb-game-corpus.json` are scored. So is every row on 2026-08-14,
including `source: cron` ones — which is itself a change worth noting, since the
`context_hash` finding rested on cron-written rows never being scored. A set
difference proven on a corpus where the difference is empty is the vacuity
failure `prose-check` opens by guarding against.

So Phase 2 cannot start on the strength of Phase 1 being green. It needs, in
order: a relay-side projection change (a CC-CMD), and a capture containing both
states. Neither is a laboratory-side task.

**One thing did become available.** `model` is now populated and discriminating
— `gemini-3.1-flash-lite` and `claude-haiku-4-5-20251001` both appear in the same
slate, primary and fallback distinguishable in stored data for the first time.
That is a real two-state field with real consumers, and it is a better Phase 2
subject than a lifecycle whose evidence does not exist yet.
