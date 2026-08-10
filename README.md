# field-laboratory

FIELD's F# laboratory. One question, answered with evidence rather than opinion:
**does a real type system earn its keep against FIELD's actual failure modes?**

F# compiled to JavaScript with [Fable](https://fable.io) 5.13, runtime decoding
with Thoth.Json, rendered as a single desk scoreboard card. Deliberately one
contained thing — the point is a clean answer, not a large surface.

## The answer so far

**Yes, on day one.** The drift sentinel's first live run against 36 real games
found a shape nothing had modelled:

```
EFL Cup_2026-08-09_mansfield_sheffieldutd.drama_arc:
  Error at: `$` Expecting a list but instead got: null
```

`drama_arc` is served as a *string containing JSON*, and it has three real
forms: JSON `null`, `"[15,15,36,53]"`, and `"null"` — a string whose content is
the literal null. A TypeScript `drama_arc: string` annotation describes all
three with complete accuracy, and `JSON.parse(arc).length` throws on the third.

**With one caveat that matters:** that is evidence the payload carries variation
a `string` type cannot express. It is *not* evidence of drift over time — the
committed captures are AFL and MLB, the live day spanned many more
competitions, so the sentinel found a coverage gap. Only the accumulating log
can answer the drift question. See `outbox/drift-log.md`.

**And one honest negative:** the units of measure have caught nothing real. They
reject a bug written deliberately to be rejected (`docs/UNITS-PROOF.md`). The
compiler protects the interior; the boundary where a raw `float` gets its unit
is still a judgement call.

## Layout

| Path | What it is |
| --- | --- |
| `src/Units.fs` | Units of measure for the 0–1 / 0–100 scales that already caused a production bug |
| `src/Desk.fs` | Thoth.Json decoders for the real `/context/date` payload |
| `src/Scoreboard.fs` | One card. `stateNode` wires its own effect; `staticNode` cannot go stale |
| `data/` | Verbatim live captures — see `data/PROVENANCE.md`. Nothing here is fabricated |
| `test/` | Deliberately corrupted fixtures, kept apart from `data/` on purpose |
| `outbox/drift-log.md` | One row per sentinel run |

## Working on it

```bash
npm install && dotnet tool restore
npm run build      # F# -> JS, then assemble public/
npm run serve      # serves public/ — the same artifact that deploys
npm run check      # 9 checks in real Chromium, including a state transition
```

## Automation

| Workflow | When | What |
| --- | --- | --- |
| `verify` | push, PR | build, zero-warning gate, decoders accept real captures **and still reject the corrupted one**, both render checks |
| `drift-sentinel` | daily | real decoders against a live payload, appends to the drift log |
| `deploy` | after `verify` passes | builds and publishes the page |
| `probe-url` | manual | reach a URL from a runner — the sandbox blocks `*.workers.dev` |

Deployment needs a `CLOUDFLARE_API_TOKEN` secret that only a human can add —
see `docs/DEPLOY.md`.
