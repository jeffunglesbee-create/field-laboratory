# CC-CMD-2026-08-23-prompt-numeral-mining

**Filed from:** field-relay-nba session 2026-08-23, as the named residual of
`CC-CMD-2026-08-22-brief-sport-contamination`.
**Ask to:** field-relay-nba (`src/journalism-quality.js`)
**Status:** CLOSED 2026-08-24, and this document pointed at the wrong file. The
universal voice-register segments it targets carried **no mineable figure at
HEAD** -- an earlier session had already converted them to `##`. Measured, 11 of
17 tracked literals reached a gated EPL prompt and **10 of the 11 came from
`proseStyleFor`**, whose blocks the model is told to *emulate* rather than avoid.

The measured leak was the instruction quoting itself: *"Spurs' 3 shots this match
trail Brentford's 37 goals this season"* is verbatim the counter-example inside
ONE WINDOW PER COMPARISON, the rule shipped to stop cross-window comparisons.
Fixed by making every forbidden example non-instantiable, then -- separately
authorised, beyond this ask's scope boundary -- by extending the gating to the
STYLE lines. EPL now carries **0** foreign figures; golf, which had carried all
six because `detectSportClass` had no branch for it, also 0.
Relay `9b6faa2`, `fed8a06`, `15f1d69`, `65f3b7f`, `198577b`.
Docs: `outbox/cc-session-2026-08-24-negative-examples.md`, `-style-gating.md`,
`-cite-golf-analytics.md`, `-voice-exemplars.md`.

One-liner:
```
The voice register's anti-exemplar and its six numbers-in-prose patterns carry
real-looking figures -- "Pavel Dorofeyev enters with 37 goals this season", four
ERAs, "80 points", "90 points", "24.8 PPG". They are universal by design: every
brief in every sport sees them. The model mines them for numerals and presents
them as fact. The measured case is an EPL brief reading "Spurs' 3 shots this
match trail Brentford's 37 goals this season" -- an NHL number, from the block
labelled AVOID THIS, rendered as an English football statistic.
```

## What 2026-08-23 already shipped, so this ask does not redo it

Three commits landed on relay `main`:

- `2ed34c7` — `proseStyleFor(sport)`. The CITE NBA ANALYTICS example ("107.7
  DRTG, best in the NBA") no longer reaches a soccer prompt at all.
- `9bf12b0` — `voiceRegisterFor(sport)`. A soccer brief sees exemplars D and E,
  not the five basketball and hockey ones.
- `812bb5c` — layer 2g, cross-window comparisons.

`promptExampleLeaks` (layer 2f) tracks all 16 known-mineable literals and
retries on them, and both commits kept it working under gating — 15 of the 16
survive into a gated EPL prompt and all 15 are still reported. **So the leak is
caught.** This ask is the generation side: the prompt should not carry the
numerals in the first place.

## Probe block — run first, from HEAD (Rule 87)

```bash
cd field-relay-nba && git log --oneline -5

# Which tracked literals still reach a soccer prompt, and from which segment?
node --input-type=module -e '
import {voiceRegisterFor,proseStyleFor,PROMPT_EXAMPLE_LITERALS as L,VOICE_REGISTER_SEGMENTS as S}
  from "./src/journalism-quality.js";
const reg=voiceRegisterFor("EPL"), sty=proseStyleFor("EPL");
for (const lit of L) {
  const where = reg.includes(lit) ? "voice-register" : sty.includes(lit) ? "style" : "-";
  if (where!=="-") console.log(where.padEnd(15), lit);
}'

# Every numeral in the universal segments, tracked or not -- the tracked list is
# 16 entries and was written from observed leaks, so it is a floor, not a census.
node --input-type=module -e '
import {VOICE_REGISTER_SEGMENTS as S} from "./src/journalism-quality.js";
const universal=S.filter(s=>s.sport===null).flatMap(s=>s.lines).join("\n");
console.log([...new Set(universal.match(/\b\d+(?:\.\d+)?\b/g)||[])].join(" "));'
```

## The ask

Remove the mineable figures from the universal segments of
`FIELD_VOICE_REGISTER` — the anti-exemplar and PATTERNS 1-6 — without losing
what they teach.

Both blocks teach FORM. The anti-exemplar shows the texture of wire copy; the
patterns show a number subordinated into a claim rather than standing as the
predicate. Neither lesson depends on the figure being 4.67 rather than a
placeholder. The FORBIDDEN section immediately below already states the
construction abstractly (`SUBJECT + [has/holds/carries/...] + NUMBER +
[this season/...]`), which is evidence the abstract form is teachable — the
prose version exists for texture, not for its digits.

**Constraint that decides the design:** whatever placeholder is chosen must
itself be catchable if the model copies it. Add the placeholder token to
`PROMPT_EXAMPLE_LITERALS` — it lives in the instructions, instructions are
subtracted before the context search, so 2f reports it automatically. Do NOT
use square brackets: `[DRAMA TREND]`, `[CHAMPION]` and `[FEATURED STAT]` are
live bracket tags the prompt instructs the model to read, and a placeholder in
that shape would collide with them.

## Done condition

A probe, not a judgement:

1. `node --input-type=module -e '...'` over `VOICE_REGISTER_SEGMENTS` universal
   segments returns **zero** numerals that also appear in
   `PROMPT_EXAMPLE_LITERALS`.
2. `node scripts/voice-register-scope-check.mjs` still passes 34/34 — the
   segments must stay lossless and the gating unchanged.
3. A new negative test: a draft containing the chosen placeholder token is
   reported by `promptExampleLeaks`, proving a copied placeholder is caught.
4. The anti-exemplar still contains the five "Why this fails" bullets and the
   patterns still contain all six `Wire copy:` / `FIELD:` pairs — a diff showing
   only numerals changed, no lines removed.

## Scope boundary

- Do NOT touch `proseStyleFor` or `voiceRegisterFor` gating — shipped and locked
  by two check scripts.
- Do NOT remove entries from `PROMPT_EXAMPLE_LITERALS`. A literal absent from
  every prompt is still a figure a model can fabricate, and the context check
  already protects the case where it is real.
- Do NOT author new sport-specific exemplars. That is content invention and a
  separate decision.

## Why this is filed rather than done

The relay session that found it had authorization for the three commits above.
Choosing a placeholder format is a prompt-design decision with a real failure
mode of its own — a model that copies "N goals this season" verbatim produces a
brief that is visibly broken rather than plausibly wrong, which is better, but
still a regression against today's behavior where the figure at least reads as
prose. That trade deserves its own commit and its own negative tests, not a
fourth change appended to a session that already shipped three.
