# Outbox — the stub Generator Phase 3 was supposed to have

**Date:** 2026-08-17
**Ships:** `stubGenerator` and `ProxyResponse` in `src/Journalism.fs`, five
generator-driven assertions in `journalism-check.mjs`, one mutation

## The claim that was false

I wrote twice — in the Phase 4 plan correction and in chat — that *"Phase 3
already ships a stub Generator."* It did not. `Generator` was a type
abbreviation with **no implementation and no consumer**, and
`journalism-check.mjs` tested `answeredFrom` directly, around the type rather
than through it.

It passed `unused-check` only because that guard inspects exported *values*, and
a type abbreviation is not one.

The claim also load-bore something: the Phase 4 correction argued that dropping
`src/Proxy.fs` cost nothing because "the type still has two implementations,
both offline." It had zero. The conclusion survives — laboratory should not call
the proxy — but that particular support for it was wrong.

## What shipped

`stubGenerator` answers from a **recorded** `ProxyResponse` — body, `X-FIELD-Model`,
`X-FIELD-Gemini-Error`. No network, no credential, no model call. It is the shape
a Phase 4 capture will have, which is why the record exists now.

The three acceptance claims now run **through** the type:

| claim | assertion |
|---|---|
| returns a Draft when the fallback answers | `Ok`, body intact |
| carries the fallback's provenance, not the primary's | `By haiku`, `fallbackRan = true` |
| does not silently succeed when both paths fail | `Error (BothPathsFailed …)`, never an empty Draft |

Two more fell out. An empty body with no upstream error is `EmptyBody`, a
*distinct* failure from both-paths-failed — collapsing them would lose the only
signal that the primary errored. And the production case, driven end to end:
text arrives, provenance does not, so the Draft is `Ok` but `ProxySilent`. The
type refuses to invent who wrote it.

Teeth: replacing the both-paths-failed branch with `Ok(draft p answered "")` —
the exact silent success the criterion forbids — fails the check. Registered as
`both-paths-failed-becomes-a-draft`.

## Two things the compiler made me decide honestly

**`Async.StartAsPromise` does not exist in real .NET F#.** This project is built
by `dotnet build` as well as Fable, so an F# helper converting `Generator` to a
promise for the benefit of a test would compile half the time. The alternative
was to simplify `Generator` to a synchronous function, which would have made the
test easier and the type a worse description of generation. Kept async; the
check drives it through Fable's own `startAsPromise`, the same approach already
used for `ofArray` in `weather-burst-check.mjs`.

**Fable uncurries `stubGenerator` to `(fallback, response, prompt)`.** The
intermediate `Generator` value is invisible from JS even though the F# type is
still `Prompt -> Async<...>`. Calling it curried is the obvious first attempt and
fails with an unhelpful cancellation-token error from inside `AsyncBuilder.js`.
Noted at the call site so the next person loses seconds rather than minutes.

## Where this leaves the question

Laboratory generates no prose. It now has one `Generator`, and that generator
reads a recorded response. The distinction the Phase 4 correction turns on —
observer, not producer — is unchanged, and is now demonstrated by a type with an
implementation rather than asserted about a type with none.
