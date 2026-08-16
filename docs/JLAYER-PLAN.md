# J-Layer / JQ → laboratory: the five-phase plan

This plan lived in a chat log for two days while its own closing line said that
was the entire complaint. It is here now, and it carries status rather than
intent — a plan that does not record what happened to it is a wish.

**The question the whole thing answers:** does a real type system earn its keep
against FIELD's actual failure modes? Not "would types be nice" — would they
have *caught the specific defects this project has shipped*.

## Status at a glance

| phase | artefact | state |
|---|---|---|
| 1 | `src/Prose.fs`, `PROSE-PROOF.md`, `prose-check.mjs` | **done**, `verify` green |
| 2 | `src/Corpus.fs` | **not started** — acceptance criterion since found unreachable |
| 3 | `src/Journalism.fs` | **in progress** |
| 4 | `Proxy` / `Replay` | **not started** — needs a decision on token spend |
| 5 | `scripts/docs-check.mjs` | **not started** — needs a decision on gate-row status |

Unplanned work that came out of the same line of investigation and is not a
numbered phase: `src/Ceiling.fs` + `CEILING-PROOF.md` + `ceiling-check.mjs`, and
`docs/ORACLE-PROVENANCE.md`.

---

## Phase 1 — `src/Prose.fs`: the unit error, refused by the compiler

**Shipped `8fd151e`.** Dim 1 (Specificity, w=30) and Dim 4 (Density, w=16) both
computed `(properNouns + numbers)/nSent` while citing a rule that governs
**numbers only**. `name` and `numeral` are separate measures; their sum does not
type-check.

Evidence: exact agreement with the relay's real tokeniser over all 592 briefs in
`data/jq-mlb-game-corpus.json` — worst float delta **0** — plus four compiler
rejections in `PROSE-PROOF.md`.

Since shipping, `ORACLE-PROVENANCE.md` closed the one soft link: the oracle was
compared token-for-token against the original at relay sha `9d8151d`, rather than
being trusted through four fixtures.

## Phase 2 — `src/Corpus.fs`: two writers, two types

```fsharp
type Brief       = private { Id: BriefId; Text: string; Context: … }
type ScoredBrief = private { Brief: Brief; Score: Score; Rubric: … }
```

Unscored stops being a nullable column and becomes a **set difference** — the
census falls out of the types instead of being a query someone remembers to run.

**The acceptance criterion as written is unreachable, and that is recorded rather
than quietly dropped.** It was *"reproduce production's `unscored_count` exactly
over the committed corpus"*. Since established:

- `/archive/query` projects no `scoring_version` and no `context_hash`
- `/quality/report` reports `unscored_count: 0` — the difference is **empty**
  relay-wide, not just in the corpus

A set difference proven on an empty difference is the vacuity failure this repo
keeps finding. What survives unchanged: `BriefId` from `(gameId, briefType,
cycle)` making the six-way id collision unrepresentable, and "an unstamped
`ScoredBrief` is unconstructible". Neither needs a relay change.

`CC-CMD-2026-08-16-quality-coverage-route` asks for the missing projection.

## Phase 3 — `src/Journalism.fs`: the J-layer types

```fsharp
type FallbackModel  = private FallbackModel  of string   // what the request body names
type AnsweringModel = private AnsweringModel of string   // ONLY from X-FIELD-Model

type Answered =
    | By of AnsweringModel
    | ProxySilent
    | Unexpected of FallbackModel * AnsweringModel
    | Unusable of AnsweringModel * detail: string

type Verdict    = Held | Failed of reason: string | Unreadable
type Generator  = Prompt -> Async<Result<Draft, GenerationFailure>>
```

Plus `BriefType` as a DU, `Fact` with a **mandatory** `TimeWindow`, and `Prompt`
private carrying its `BriefContext` — so a draft cannot be judged against a
context that did not generate it.

**This phase got stronger after it was written.** The plan treated
`AnsweringModel` as a discipline. It is now a finding: `field-relay-nba/src/index.js`
**never reads `X-FIELD-Model`**, so `AnsweringModel` is unconstructible from
stored data — meaning `ProxySilent` is not a defensive case but the actual state
of every archived row. The type predicted the defect before the defect was found.

Two acceptance tests, both offline:

1. **The Haiku fallback branch, which production has never exercised.** 6/6
   Gemini, `X-FIELD-Gemini-Error` empty every time. A stub generator returning a
   Gemini error proves three things nothing has ever proven: it selects the model
   named in `FallbackModel`, it surfaces the fallback rather than reporting the
   primary, and it does not silently succeed when both paths fail.
2. **The time-anchoring extractor over all 592 briefs.** `FIELD_PROSE_STYLE`
   forbids bare numbers; nobody has ever counted the violations. One run, two
   findings — production's compliance, and the extractor's correctness.

## Phase 4 — the live generator and record/replay

`Proxy` posting to `field-claude-proxy`, secret from a repo secret,
**dispatch-only, never on push**. `Replay` reads committed captures; `verify`
uses it exclusively.

The same split laboratory already has — `verify` offline, `live-check` against
the deployed page. The LLM is to `verify` what the live relay is to `live-check`;
no new idea needed.

**Why it is worth the tokens:** every capture records **prompt + response**, the
input half the corpus lacks. That is what makes hallucination and fabricated-stat
checks possible, and it is the defect that forced the degenerate
`Score this sports brief for journalism quality:` fallback in the first place.

Out of scope deliberately: the direct-to-Anthropic Sonnet call. No reason for an
`ANTHROPIC_API_KEY` in a third repo.

**Blocked on a decision:** token spend against the live proxy.

## Phase 5 — `scripts/docs-check.mjs`: executable claims

Generalise `proof-check.mjs` from compiler claims to **production** claims. Every
doc claim carries the command that re-derives it; the build fails when a document
stops being true.

Acceptance: a deliberately stale claim must fail the build — teeth measured on
the **exit code**, not the printed count.

**Blocked on a decision:** whether `docs-check` becomes a gate row.

---

## Discipline that applies to every phase

Earned the hard way, and every line is a real incident:

- **Exit code is the contract, not the printed count.** A check once printed
  `9/9 passed` and exited 1. Twice since, a loop took `$?` from `tail` and
  reported green for a check that was failing.
- **Every new check gets mutation-tested.** Making a decoder tolerant silently
  removed teeth from `drift-check`; the harness caught it, I did not.
- **The counterexample must exercise the path.** A teeth measurement once crashed
  in `int32ToString` before any assertion ran — exit 1 for the wrong reason.
- **Non-vacuity first.** "For all X" is free on an empty set. Eight drift-check
  assertions once passed over a zero-game payload; the outlet-exclusion fix first
  went 15/15 against a capture containing zero of the elements it excluded.
- **Source and outbox in the same commit.** `history-check` is per-commit; no
  later commit can repair it.
- **A claim ships with its discriminator.** The best result in the relay batch
  came from a CC-CMD that *required* a falsifying query before acting — 105 of
  116 rows killed its own leading hypothesis.
- **A harness that edits source in place is not safe to interrupt.** A timeout
  once stranded `let private __proof23` in `Scoreboard.fs` and it reached main.

## What laboratory will not do

Generate production briefs. Judge whether prose is good — that is the voice
judge, and no type gets you there. Hold an Anthropic key. Fix the write path, the
id schemes, or the archive gaps.

**The deliverable is evidence that the types earn their keep**, not a replacement
J-layer. FIELD's journalism works. What it could not do was tell you which
formula produced a score, whether a number in the prose came from the data, or
whether the judge actually judged.

## Order, and why

Phase 1 first — fully falsifiable against 592 committed briefs today, no network,
no new capture. Phase 2 next because it is the finding I would have got wrong.
Phase 3 because the fallback test is the one thing production genuinely cannot
do. 4 and 5 after, since both need a decision.

That order held except for Phase 2, which the relay's own data reordered: its
acceptance criterion turned out to be unreachable, so Phase 3 moved ahead of it.
