# The registry check compared production against a copy of itself

**Date:** 2026-08-29
**Scope:** `src/Journalism.fs`, `scripts/journalism-check.mjs`,
`scripts/docs-check.mjs`, `docs/JLAYER-PLAN.md`

## A correction first

I claimed the laboratory does not model live briefs, and inferred it from the
raw `GAME_LIVE` label in the screenshot. That inference was wrong, and the
screenshot the reader sent back is the disproof — GAME_LIVE cards render
everywhere on the 2026-08-29 scoreboard, with prose, scoreline verdicts and
provenance lines.

Two different types share a name. `Desk.Brief.BriefType` is `string option`,
decoded straight from the payload's `brief_type` column
(`src/Desk.fs:971`), and `Scoreboard.fs:398` renders `t.Trim()` verbatim into
`desk-card__brief-kind`. Every type renders that way — `GAME_RECAP` would too.
The raw uppercase label is the design, not a symptom.

`Journalism.BriefType` is a separate discriminated union, and nothing in the
render path touches it. Its only consumers are two checks.

## The actual defect, which is in those two checks

`scripts/journalism-check.mjs` carried, until this commit removed it (no line
number: the lines cited no longer exist, and a number pointing at replaced code
is the thing the citation check exists to stop):

```js
const SEEN = ['game_recap', 'pre_game', 'game_brief', 'slate', 'night_owl',
  'mlb_game', 'epl_match', 'narrative_context', 'compound']
```

asserted as:

```js
check('every brief_type observed in /quality/report is modelled', ...)
```

`SEEN` is not what was observed. It is a transcription of what `/quality/report`
served on **2026-08-15**, frozen into an array literal — and the registry was
written from the same observation on the same day. So the check compared the
registry against a copy of the registry's own vintage. It cannot fail on a new
type, by construction. `scripts/docs-check.mjs:67` had the identical literal
feeding a `briefTypes.modelled = 9` claim at tolerance 0.

Production has since written two types neither list contains:

```
frozen list: 9 | corpus-derived: 11
types the frozen list could never have surfaced: [ 'bracket_delta', 'game_live' ]
```

Measured on `data/brief-recency-corpus.json`, 2026-08-23..29:

```
game_recap  192      night_owl        22      slate             8
game_live    59  ←   mlb_game         33      game_brief        9
epl_match     5      narrative_context 4      pre_game          3
bracket_delta 1  ←
```

59 rows of `game_live` in seven days, and the check reported 9/9 the whole time.

## Fix

`GameLive` and `BracketDelta` added to the DU, to `briefTypeName` and to
`briefTypeOfString`. F# recompiled — `npm run build` in full, both halves, not
`build-site.mjs` alone.

The lists are now **read**, not transcribed: both checks derive the observed set
from the capture, unioned with the transcribed nine. Union rather than
replacement, because `/archive/query` clamps `limit` to 50
(`field-relay-nba/src/index.js:11990`), so the capture is a floor — a type
present in it is proven, a type absent is not proven absent. The capture can
add a type; it can never silently retire one.

`docs/JLAYER-PLAN.md`'s claim moves 9 → 11.

## Verify

```
npm run check:journalism   # 31/31 — "every brief_type production actually writes is modelled (11 seen)"
npm run check:docs         # 4/4 then 3/3 — briefTypes.modelled = 11 holds
node --input-type=module -e "import {isModelled,briefTypeOfString,briefTypeName} from './build/Journalism.js';
  console.log(isModelled(briefTypeOfString('game_live')), briefTypeName(briefTypeOfString('wc_match')))"
# true wc_match  — the new types are modelled, an unknown one still reports unmodelled and keeps its raw string
```

## Residual, stated rather than deferred

The capture is capped at 50 briefs/day, so every count above is a floor. Six of
the seven captured dates returned exactly 50, which means all six are truncated.
`/archive/query` takes no offset parameter, so paging past the cap needs a relay
change and is not this commit's scope.

The earlier finding in `cc-two-clients-two-briefs-2026-08-29.md` — that
`Desk.fs:786`'s `List.tryFind` picked the live-state brief on 10 of 10 final
games — was measured on the Aug 1–16 corpus and could not be reproduced on
Aug 23–29: only 2 of 43 multi-brief games separate cleanly under that
document's regex classifier, and all three candidate ordering keys agree on
both. That ask stays open and unmeasured; the classifier is the bottleneck, not
the ordering key.
