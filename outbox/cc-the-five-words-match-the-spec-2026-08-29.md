# The five semantic words match the Drive spec, and now cannot drift

**Date:** 2026-08-29
**Scope:** `scripts/palette-check.mjs`
**Doc:** *FIELD — Semantics × Viewport Bridge*, Drive
`1TQ-PIyLvK4l2zMaeYwWUL7TQrlHzEn_nYPoO4Wcv_7w`, May 24 2026, **DEFINITIVE**.

## The first of five viewport docs that is about THIS repo

The four before it were jubilant-bassoon's — `.game-card`, the ambient panel,
LEFT/CENTRE/RIGHT columns — and most of their content did not transfer. This one
defines the **five-word semantic vocabulary** that `Palette.fs:42` implements
verbatim: MUST, WATCH, DISCOVERY, CAUTION, QUIET.

It fixes a hex per word, and states why that matters more than a style
preference:

> a user on an iPhone SE (P1) and a user on a 4K monitor (U1) should both
> instinctively feel "gold = must" even though the surfaces, sizes, and column
> counts are completely different.

## Checked, and all five match

```
word        laboratory   spec
MUST        #c9a84c      #c9a84c     match
WATCH       #4a9eff      #4a9eff     match
DISCOVERY   #2dd4bf      #2dd4bf     match
CAUTION     #f59e0b      #f59e0b     match
QUIET       #6a6a8a      #6a6a8a     match
```

Five for five. This is the first thing in five documents the laboratory was
already right about, and it was right by nobody checking — the values were
carried across correctly and nothing in this repo could have told you if they
had not been.

## Why an assertion for something that already passes

A drift here does not look like a bug in either product. Each renders a
perfectly reasonable colour; the failure is that **the same word means two
things**, which is the exact thing the shared vocabulary exists to prevent.
There is no user-visible symptom to notice, and no check on either side was
looking.

Added to `palette-check.mjs`, per word, written out as a transcription rather
than derived from the palette it is grading — a check that computes its
expectation from its subject is the vacuity this session has already found four
times.

Plus one guard on the transcription itself:

```
PASS  every semantic word in the registry has a spec value transcribed
```

Without it, adding a sixth word to `Palette.fs` would leave the new word
ungraded while five green rows reported a clean sweep.

## Teeth

The assertion was mutated — `MUST: '#c9a84c'` → `'#d4b45c'`, one plausible
gold to another — against the real palette:

```
FAIL  MUST is the Drive spec's #d4b45c
34/35 checks passed
```

It discriminates. 35/35 unmutated.

## The rest of the doc, and why none of it is actionable here

- **"QUIET — Motion: none (silence is honest)."** Already implemented, and
  independently: `Palette.fs` records `QUIET has NONE: "silence is honest" is a
  real case here, not Some smoke and not a default`.
- **"Playfair Display is ONLY used in the story sheet headline and the CENTRE
  column lead story. Never on game cards."** The laboratory has no Playfair —
  Chakra Petch and DM Sans — and no CENTRE column. Not applicable.
- **"`--motion-ambient` (pulse) is DISABLED at P1."** The laboratory has zero
  `transition:`, `@keyframes` and `animation:` declarations, measured earlier
  today. There is no ambient motion to disable.

## Verify

```
npm run check:palette   # 35/35, including five spec transcriptions
```
