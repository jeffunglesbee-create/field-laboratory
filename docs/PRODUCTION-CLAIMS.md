# Claims about production, and the evidence for each

Every statement this repo makes about `jubilant-bassoon`, with its source and how
strong that source is.

This exists because of a specific failure. `AMNESTY-PROOF.md` once claimed the
drama seal was complete while the arc was still open — a claim that outran its
evidence and that no check could contradict, because it was prose. The same
disease was present in the production comparison: real reading, but no record of
which claims were *verified* and which were *inferred from a spec*. A reader
could not tell them apart, and neither could I after the fact.

## What could not be read, stated first

**Production's card implementation was never read.** `index.html` is 2.6 MB and
`src/legacy/field.js` is the real source of truth (`index.html` is generated from
it by `scripts/sync-source.mjs`). Both exceed GitHub's 1 MB contents-API cap, so
the FIELD MCP's `read_file` and `read_lines` return empty for both — retried
against `field.js` specifically, on the theory that only `index.html` was over
the limit. It is not. The relay's signed archive endpoint is reachable from a CI
runner but blocked from this sandbox (`403 CONNECT tunnel failed`).

So: no function body from production has been read. Everything below is from
`CODE_MAP.json`, `STANDARDS.md`, `ADR-002-CONTEXT.md`, and three CC-CMDs.

## Evidence strength

- **VERIFIED** — checked against `CODE_MAP.json`, which is generated from the
  real `index.html` (stamped `2026-08-09T16:51:35Z`, 45,708 lines, 1,033
  functions). A machine-extracted fact about the actual source.
- **QUOTED** — a direct quotation from a repo document. The document *is* the
  authority for the claim (rules, compliance policy).
- **SPEC** — from a CC-CMD's task description. Describes what was to be built and
  whose DONE CONDITION required literal verification, but the built result was
  not read.

## The claims

| Claim | Strength | Source |
| --- | --- | --- |
| UI primitives `fieldChip`, `fillSlot`, `fieldSection`, `fieldState`, `fieldRow` exist | VERIFIED | all present in CODE_MAP |
| `buildEnrichedGame`, `renderCard`, `updateCard` exist | VERIFIED | all present in CODE_MAP |
| `shouldShowCard`, `scheduleRenderDebounced`, `getCardCircadian`, `isGameOver`, `buildCardTimeDisplay`, `getStatus` exist | VERIFIED | all present in CODE_MAP |
| Five separate sport registries exist | VERIFIED | `SPORT_COLORS`, `SPORT_ICONS`, `SPORT_CHIP_LABELS`, `SPORT_META`, `ESPN_SPORTS` all present |
| Rule 50 SPORT-DISPLAY-A is unbuilt | VERIFIED | `SPORT_DISPLAY_RULES` **absent** from CODE_MAP |
| Rule 51 PERIOD-PREFIX-A is unbuilt | VERIFIED | `SPORT_PERIOD_PREFIXES` **absent** |
| Rule 52 SCHEDULE-BUILDER-A is unbuilt | VERIFIED | `buildSection` **absent** |
| Rule 53 SCORE-UNIFORM-A is unbuilt | VERIFIED | `resolveGameScore` **absent** |
| Rules 50–53 are all marked "Specced, not yet built" | QUOTED | STANDARDS.md |
| Raw composite drama number displayed = bright-line CRITICAL | QUOTED | ADR-002 PROHIBITED #3 + Severity Classification |
| Amnesty zone requires "a dedicated function with no live-state call site" | QUOTED | amnesty CC-CMD |
| Push/pull correction does not touch the display prohibition | QUOTED | ADR-002, verbatim |
| "string-search RUWT audits are not reliable" | QUOTED | ADR-002, Real Violations Found and Fixed |
| Rule 37 semantic colour tokens, no raw hex in components | QUOTED | STANDARDS.md Rule 37 |
| `fillSlot` behaves null→hidden, string→textContent, Element→replaceChildren | **SPEC** | Phase-1 CC-CMD Task 2 |
| `updateCard` only updates slots whose data changed | **SPEC** | Phase-2 CC-CMD Task 3 |
| 10 independent data paths, a card touched 6+ times in 30s | **SPEC** | Phase-2 CC-CMD context |
| Personality taxonomy thriller / nail-biter / blowout | **SPEC** | amnesty CC-CMD |
| NIGHT (<120 min) vs LATE (≥120 min) circadian split | **SPEC** | amnesty CC-CMD |
| Production walked back the raw-number display four times | QUOTED | ADR-002 + STANDARDS Rule 95 |

## Limits of the VERIFIED rows

`CODE_MAP.json` indexes `function` declarations and top-level constants. A
symbol defined as `const f = (...) => ...` may not be captured, so **ABSENT means
"not present as an indexed function or constant", not proof of non-existence.**

That caveat has teeth, and here is a live instance of it: ADR-002 names
`fieldGameTier()` **and** `fieldTierLabel()` as the current tier system. In
CODE_MAP, `fieldGameTier` is present and `fieldTierLabel` is **absent**. Either
the latter is defined in a form the map does not index, or the doc is ahead of
the code. Not resolvable without reading the source, and recorded as an open
discrepancy rather than resolved in whichever direction is convenient.

The four "unbuilt" rows are the strongest inferences here, because they are
corroborated: the symbol is absent from the map *and* STANDARDS.md independently
says "Specced, not yet built" for each. Both could be stale together, but they
are independent sources agreeing.

## Claims deliberately not made

- Nothing about how any production function actually behaves internally. The
  SPEC rows describe intent, not observed behaviour.
- No claim that the five sport registries disagree with each other. Their
  contents were never read — only that five of them exist, which is what Rule 50
  exists to unify.
- No claim about production's current live rendering. The comparison is against
  its source inventory and its rules, not its running output.
