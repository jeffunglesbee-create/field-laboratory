# J-Layer / JQ → laboratory: the five-phase plan

This plan lived in a chat log for two days while its own closing line said that
was the entire complaint. It is here now, and it carries status rather than
intent — a plan that does not record what happened to it is a wish.

**The question the whole thing answers:** does a real type system earn its keep
against FIELD's actual failure modes? Not "would types be nice" — would they
have *caught the specific defects this project has shipped*.

<!-- claim: sports.modelled = 7 -->
<!-- claim: briefTypes.modelled = 11 -->

## Status at a glance

| phase | artefact | state |
|---|---|---|
| 1 | `src/Prose.fs`, `PROSE-PROOF.md`, `prose-check.mjs` | **done**, `verify` green |
| 2 | `src/Corpus.fs`, `CORPUS-PROOF.md`, `corpus-check.mjs` | **done** — different set difference than planned |
| 3 | `src/Journalism.fs`, `JOURNALISM-PROOF.md`, `journalism-check.mjs` | **done** `3760c7e` |
| 4 | `src/Replay.fs` | **not started** — needs captures produced relay-side; scope corrected 2026-08-16 |
| 5 | `scripts/docs-check.mjs` | **done** — a `verify` step, not a gate row (decided, see Order) |

Unplanned work that came out of the same line of investigation and is not a
numbered phase: `src/Ceiling.fs` + `CEILING-PROOF.md` + `ceiling-check.mjs`, and
`docs/ORACLE-PROVENANCE.md`.

### Asks filed against the relay, and where they stand

Probed by `scripts/cc-cmd-followup.mjs` on a runner, because `*.workers.dev` is
403 at the agent proxy. Last measured 2026-08-18, run `32094556326`.

| ask | state |
|---|---|
| `quality-bar-scale` — name the scale wherever the flat 240 bar is reported | **landed** 2026-08-18 |
| `quality-coverage-route` — expose `jq-scoring-coverage` on a GET route | 403 **from the runner too**, so not the proxy: the route is not there |
| `scoring_version` in the `/archive/query` projection | **not yet** — a real negative from a reachable route |
| LLM captures with prompts, produced relay-side | not asked for yet; Phase 4's remaining half |

The bar-scale ask landing is why `/quality/report` now carries a denominator.
It is tracked as a **landed** ask rather than deleted, so that a field this
repository now depends on disappearing is a regression rather than a silence —
`Ceiling.relayReachable` is 245, and the whole finding was that the flat 240 bar
is 80% of the nominal 300 but 97.96% of what the relay can actually reach.

`scoring_version` remains the highest-leverage of the three. It is the one that
makes `Corpus.asEra2` and `asEra3` constructible: today 0 of 592 committed rows
carry a rubric, and a fresh 542-row capture on 2026-08-17 confirmed the same.

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

## Phase 4 — replay. Laboratory generates nothing.

**Corrected 2026-08-16.** As first written this phase said: *"`Proxy` posting to
`field-claude-proxy`, secret from a repo secret, dispatch-only, never on push."*
That contradicted this document's own constraints two sections down, and the
contradiction was caught by the user rather than by me. The correction and its
reasoning are recorded below the design, because a plan that quietly rewrites
itself is worth less than one that shows where it was wrong.

### What it builds

| | |
|---|---|
| `src/Replay.fs` | `Generator` over committed captures — the only implementation laboratory ships |
| `data/llm-captures/*.json` | produced **once, where the credential already lives**, committed as data |
| `scripts/replay-check.mjs` | replay determinism, and the fabricated-stat check |

Laboratory holds no secret, makes no model call, spends no tokens, and generates
no text. It reads a committed corpus, exactly as it already does with the 592
briefs.

### The capture format

```jsonc
{
  "capturedAt": "…", "briefType": "mlb_game",
  "promptHash": "sha256:…",            // the Replay key
  "request":  { "model": "…", "maxTokens": 300, "messages": [ … ] },
  "response": { "status": 200, "body": "…" },
  "provenance": { "xFieldModel": "…", "xFieldLatencyMs": "…", "xFieldGeminiError": null }
}
```

`promptHash` is load-bearing. `Replay` must fail loudly on a prompt it holds no
capture for — a replay that quietly returns *something* for an unknown prompt is
this repository's recurring failure shape in its most dangerous form.

### Why it is the highest-value phase left

Phase 3 established that **every archived brief is `ProxySilent`**: nothing reads
`X-FIELD-Model`, so `AnsweringModel` is unconstructible from stored data and the
`By` case is unreachable. A capture records the provenance headers at generation
time, which makes `By` constructible for the first time.

The larger payoff is the **input half**. The 592-brief corpus has outputs and no
prompts, so one question cannot currently be asked at all:

> Does every number in the brief appear in the data the model was given?

Numerals in the draft, numerals in the prompt's context, and anything in the
output that is not in the input is either derived or **fabricated**. That check
is impossible today and straightforward with captures. It needs the prompt, not
a live connection — which is the whole reason this phase does not require
laboratory to call anything.

### The fallback branch, and why it stays blocked

`X-FIELD-Test-Model` forces a specific model, so the Haiku fallback looks
exercisable for real rather than only against Phase 3's stub. It is not: the
relay's own round-3 probe records that forcing `gemini-3.5-flash` returns
**HTTP 500, 3/3, against 3/3 unforced controls at 200**, gated by
`CC-CMD-2026-08-14-gemini-35-flash-route-500`, cause in the proxy worker.

Capture the 500 anyway. A captured failure is evidence, and the test becomes
available with no further work here once that CC-CMD is executed.

### Acceptance

1. Replay is deterministic and **honest about gaps** — same prompt, byte-identical
   draft; an unknown prompt is a named failure, never a plausible answer.
2. Captured provenance constructs a real `AnsweringModel` — the `By` case, reached
   for the first time.
3. The fabricated-stat check runs over every capture: one run, two findings —
   production's rate, and the extractor's correctness.

### What changed, and why

Three things were wrong with the original:

- **It had laboratory calling the proxy.** Whatever the credential is called,
  that makes laboratory a producer of model output rather than an observer of it,
  which is the line "What laboratory will not do" exists to hold.
- **The credential is write-capable.** The `X-FIELD-Relay` header value gates
  `POST /d1/execute` as well as the proxy — a write path to the production briefs
  table. "Secret from a repo secret" understated that to the point of being
  misleading.

  The value itself was written out here in full on 2026-08-16, in this very
  paragraph, by the commit that argued laboratory must never hold it. Redacted
  2026-08-18; see `docs/exposed-secrets.sha256`, which now fails the build if it
  reappears. It remains in this repository's history at `41f0b33` and rotation
  is the only thing that ends that.
- **`src/Proxy.fs` had no consumer.** Under the corrected design laboratory never
  executes it, and a public value nothing reads is what `unused-check` exists to
  reject. It is dropped rather than shipped unused.

What is lost: the "two interchangeable implementations" demonstration. Nothing,
in practice — Phase 3 already ships a stub `Generator`, so the type still has two
implementations and both are offline. Interchangeability was never an argument
about one of them being live.

Out of scope, unchanged: the direct-to-Anthropic Sonnet call at
`src/index.js:4846`. No reason for an `ANTHROPIC_API_KEY` in a third repo.

**Needs from outside laboratory:** the captures, produced once on the relay side.
Not a decision about token spend — that framing is also withdrawn, since
laboratory now spends none.

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

Judge whether prose is good — that is the voice judge, and no type gets you
there. Fix the write path, the id schemes, or the archive gaps.

**Generate text. Any text, by any route.** This was originally written as
"generate production briefs" and "hold an Anthropic key", and both were narrower
than intended — narrow enough that Phase 4 was drafted with laboratory posting to
`field-claude-proxy` and read as compliant, because the credential is not an
Anthropic key and a capture is not a production brief. It took a challenge to
notice. The line is now the plain one:

> Laboratory holds no credential that can spend model tokens, makes no model
> call, and produces no model output. It reads committed corpora.

A stub generator in a test is not a model call and stays permitted — Phase 3
depends on one to reach the fallback branch at all.

**The deliverable is evidence that the types earn their keep**, not a replacement
J-layer. FIELD's journalism works. What it could not do was tell you which
formula produced a score, whether a number in the prose came from the data, or
whether the judge actually judged.

## Order, and why

Phase 1 first — fully falsifiable against 592 committed briefs today, no network,
no new capture. Phase 2 next because it is the finding I would have got wrong.
Phase 3 because the fallback test is the one thing production genuinely cannot
do. 4 and 5 after, since both need a decision.

Two corrections since:

- **Phase 2 slipped behind Phase 3.** The relay's own data reordered it — its
  acceptance criterion turned out to be unreachable.
- **Phase 4 no longer needs a decision.** It needed one only because it was
  scoped around laboratory holding a credential. Corrected, it needs an artefact
  — the captures — and artefacts are asked for, not decided.

That judgement was made and this document did not record it. **Phase 5 shipped
as a `verify` step, not a gate row**, and the reason is in `docs-check.mjs`:
gate rows moved to `verify-full` and run weekly, so a stale claim caught seven
days late is most of the way to not catching it. The status table above said
"done" while this section still called it open — the contradiction stood from
2026-08-17 until it was noticed on 2026-08-18.

No phase is now gated on a judgement call. Phase 4 is gated on an artefact.
