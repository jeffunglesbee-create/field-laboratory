# The ceiling numbers are corrected, in all four places

**2026-09-20** · closes the judgement deferred by CC-CMD-2026-09-11 Task 2

`outbox/2026-09-20-ceiling-drift-verdict.md` established that `src/Ceiling.fs`'s
`300`/`245` is **drift, not preserved history** — the numbers moved, and so did
the mechanism they describe. This applies the correction.

## What changed

| | was | now | source |
|---|---|---|---|
| `Ceiling.fs` `nominal` | 300 | **294** | relay `NOMINAL_TOTAL` |
| `Ceiling.fs` `relayReachable` | 245 | **252** | relay `REACHABLE_CEILING` |
| `unreachable` | 55 | **42** | derived, `nominal − reachable` |
| `ceiling.flatBarPctOfReachable` | 97.96 | **95.24** | 240 ÷ 252 |

Prose corrected alongside, because a right number under a wrong mechanism is
still wrong: the header no longer says Dims 7/10 "return N/A" — `ctx`
contributes 0, while `margin` and `finality` **abstain at their midpoints**
(15 of 30, 10 of 20, derived by `SLATE_CAPS` *calling* them). Also `240 is 80%
of 300 / 97.96% of 245` → `81.6% of 294 / 95.2% of 252`; headroom five → twelve;
`atFraction 0.8` on the two scales 240/196 → **235/202**.

**`CEILING-PROOF.md` stops quoting a comment.** It now shows the `SLATE_CAPS` /
`REACHABLE_CEILING` derivation itself. Quoting prose was the original
transmission path.

## The compiled proof cases are untouched, and that is the point

`proof-check.mjs`: **76/76**. The cases assert `FS0001` and `FS1093` — that a
`Threshold<Nominal>` cannot meet a `Score<RelayReachable>`, and that `Scale`'s
private fields cannot be restated. Neither depends on which integers fill them.

**The argument was never stale. Only the numbers and the mechanism were.** That
is why this is a correction and not a rewrite, and it is what Task 2 could not
know without looking.

## A fourth fix nobody asked for, because correcting the other three broke it

`docs-check.mjs` went **red** on `CC-CMD-2026-09-11` — the document that
*specifies this sweep* and quotes seven markers as examples of what had gone
stale. It read those quotations as live claims and failed a document for
accurately recording what used to be true.

`claim-check.mjs` made both exclusions from the start — fenced blocks are
quotations, `CC-CMD-*.md` is excluded — which is why this was one read to
diagnose rather than a suspected bad correction. `docs-check.mjs` now does the
same.

## Verification

| what | result |
|---|---|
| `npm run build` | OK |
| `proof-check.mjs` | **76/76** |
| `docs-check.mjs` | **3/3** — the harness that was green-but-wrong is now green-and-right |
| `claim-check.mjs` sweep | **13 HOLDS, 1 STALE, 0 UNCHECKABLE** (was 9/5/0) |
| TRANSCRIPTIONS | `nominal 294 vs 294 MATCHES`, `relayReachable 252 vs 252 MATCHES` |
| relay root | corrected first, relay `1334b9d`, comment-only |

**The one remaining STALE is unrelated**: `JLAYER-PLAN.md` `sports.modelled = 24`
against a live 27. Three sports were modelled after that plan was written. It is
a different document making a different claim and is left for its own decision.

## The chain, end to end

One stale comment in `journalism-quality.js`, six lines above the derivation
that replaced it → transcribed into `src/Ceiling.fs` → quoted by
`CEILING-PROOF.md` → compared against the transcription by `docs-check.mjs`,
which passed. Four artefacts, one root, and a green check over all of it for
weeks.

All four are now correct, and the sweep that found it reports the transcription
on every run so the next divergence is visible before it is copied.
