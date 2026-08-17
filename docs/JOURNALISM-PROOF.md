# JOURNALISM-PROOF — provenance, time, and what a draft may be judged against

`src/Journalism.fs` claims three things cannot be written in F#: reporting a
configured model as the one that answered, holding a number without saying when
it was true, and judging a draft against a context that did not generate it.
This document is those claims compiled.

Every case below is injected into a real source file and built by
`scripts/proof-check.mjs`. A case passes only if the build **fails** with the
stated error code.

<!-- claim: journalism.statSentences = 627 -->
<!-- claim: journalism.unanchoredSentences = 285 -->
<!-- claim: journalism.unanchoredPct = 45.5 -->

## The defects, stated once

**Provenance.** The relay posts to `field-claude-proxy` with an Anthropic
Messages body. Gemini 3.1 Flash-Lite is the primary and is chosen by the proxy;
the body's `model` field names the **fallback**. Which model actually answered
comes back in `X-FIELD-Model` — and `field-relay-nba/src/index.js` never reads
it. The stored `model` column partitions perfectly by writer path and never
varies within one, which per-request fallback would.

**Time.** `FIELD_PROSE_STYLE` forbids bare numbers. Measured here for the first
time over the 592-brief corpus: **285 of 627 stat sentences (45.5%) carry no
time window**, across 253 of 592 briefs.

### A configured model name cannot become an answering one

`AnsweringModel`'s only constructor reads the provenance header. The case itself
is private, so the stored `model` column cannot be wrapped directly.

<!-- proof: FS1093 -->

```fsharp
    ignore g
    let m = Journalism.AnsweringModel "claude-haiku-4-5-20251001"
    ignore m
    ""
```

### The two model types are not interchangeable

The whole defect in one line: a `FallbackModel` is what we asked for and an
`AnsweringModel` is what replied. F# has no conversion.

<!-- proof: FS0001 -->

```fsharp
    ignore g
    let answering: Journalism.AnsweringModel = Journalism.fallbackModel "claude-haiku-4-5-20251001"
    ignore answering
    ""
```

### A fact cannot be built without a time window

`Fact` is a private record with a mandatory `Window`. A number with no `when` is
not representable, so "23.2 points" cannot be smuggled in by omitting a field.

<!-- proof: FS1093 -->

```fsharp
    ignore g
    let f = { Journalism.Claim = "23.2 points"; Journalism.Window = Journalism.Tonight }
    ignore f
    ""
```

### A draft cannot be judged against a prompt

`judge` takes the `BriefContext` a draft was generated from. Passing the prompt —
the nearest wrong thing, and the one a hurried call site would reach for — does
not type-check.

<!-- proof: FS0001 -->

```fsharp
    ignore g
    let ctx = Journalism.briefContext Journalism.MlbGame "Orioles at Rays"
    let p = Journalism.prompt ctx "write it"
    let d = Journalism.draft p Journalism.ProxySilent "text"
    ignore (Journalism.judge p d)
    ""
```

### "We cannot tell" is a case that must be handled

`Answered` has four cases and `ProxySilent` is one of them — the state every
archived brief is actually in. A match that handles only the models does not
compile, so provenance-absent cannot be silently treated as provenance-present.

<!-- proof: FS0025 -->

```fsharp
    ignore g
    let a = Journalism.answeredFrom (Journalism.fallbackModel "x") None None
    let s =
        match a with
        | Journalism.By m -> Journalism.answeringName m
        | Journalism.Unexpected (_, m) -> Journalism.answeringName m
    ignore s
    ""
```

## What this does not prove

**That the fallback works in production.** It proves the *selection logic* is
correct against a stub. The Haiku branch has still never run for real — six of
six sampled calls answered from Gemini with `X-FIELD-Gemini-Error` empty — and
nothing in this repository can change that. Phase 4's record/replay is what would.

**That 45.5% is bad.** It is a measurement, not a verdict. Whether a stat
sentence always needs an explicit window is an editorial judgement, and
`FIELD_PROSE_STYLE` asserting it does not make the number a defect count. The
finding is that nobody knew the figure.

**That the prose is any good.** That is the voice judge. No type reaches it.
