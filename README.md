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

**The first result that was not written to be found:** the ADR-002 amnesty gate
(`docs/AMNESTY-PROOF.md`). FIELD classifies displaying a raw composite drama
number outside the post-game amnesty zone as a bright-line CRITICAL violation,
and this repo was doing it — `dramaText` took a whole `Game` and ran for every
card at every state. The committed captures are all Final, so the output
happened to be compliant by accident of the data rather than by construction.

The gate makes it structural: the drama score is sealed at the decode boundary,
and the one function that can render it demands a witness only a `Final` game
produces. Three deliberate violations, including forging the witness, are
rejected by the compiler with real errors.

That is a legal boundary rather than a correctness one, which is what makes it
the strongest evidence here. Production holds it with a design doc, a manual
`call-graph.js` run, and an outbox note asking the next session to re-check —
and its own audit record states that "string-search RUWT audits are not
reliable." A data flow cannot be grepped. It can be typed.

## Layout

| Path | What it is |
| --- | --- |
| `src/Units.fs` | Units of measure for the 0–1 / 0–100 scales that already caused a production bug |
| `src/Desk.fs` | Thoth.Json decoders for the real `/context/date` payload, plus the ADR-002 amnesty gate (`SealedDrama` / `AmnestyZone`) |
| `src/Scoreboard.fs` | The cards and the slate. `stateNode` wires its own effect; `staticNode` cannot go stale |
| `src/Program.fs` | Entry point: fetch, decode, render, and the date navigation |
| `data/` | Verbatim live captures — see `data/PROVENANCE.md`. Nothing here is fabricated |
| `test/` | Deliberately corrupted fixtures, kept apart from `data/` on purpose |
| `outbox/drift-log.md` | One row per sentinel run |

## Working on it

```bash
npm install && dotnet tool restore
npm run build      # F# -> JS, then assemble public/
npm run serve      # serves public/ — the same artifact that deploys
npm run check      # 11 checks in real Chromium, including two state transitions
npm run check:nav  # 18 checks: sport grouping and date navigation
npm run check:proof # compiles every rejection AMNESTY-PROOF.md claims
npm run gate       # the confidence gate — every row is a real command
```

`npm run gate` is the CC-CMD ceremony's "do not commit unless confidence >= 95",
mechanised. It exists because a session shipped five commits without scoring any
of them, and an overstated claim reached `main` as a direct result. The point is
not the number: a self-reported score is free, so every row runs a real command
and takes its score from the exit code. The total cannot be asserted, only
earned. Mutation-tested in both directions — hiding the session outbox or
loosening the decoder each drop it to 90/100 and exit non-zero.

`check:nav` is separate rather than more assertions in `check`, because `check`
structurally cannot reach either feature: both committed captures are
single-sport, so grouping "works" on them in exactly the shape a broken
grouping would also produce, and both load `?data=`, which pins the page to one
committed day and disables the date controls by design. `check:nav` intercepts
the relay with Playwright routing instead — no egress needed, and no synthetic
payload is committed or shipped, since the game records are read out of the two
real captures and recombined.

It was mutation-tested, not assumed: deleting the two teardown lines from
`Program.fs` takes it from 18/18 to 11/18, with cards accumulating
4 → 6 → 12 → 16 → 18 under a status line still reading "decoded 2". The check
that stays green throughout is "no page or console errors" — nothing throws
when a slate fails to tear down, which is why this needed a counting assertion
rather than error monitoring.

## Automation

| Workflow | When | What |
| --- | --- | --- |
| `verify` | push, PR | build, zero-warning gate, decoders accept real captures **and still reject the corrupted one**, both render checks, grouping and date navigation, proof-doc claims, confidence gate |
| `drift-sentinel` | daily | real decoders against a live payload, appends to the drift log |
| `deploy` | after `verify` passes | builds and publishes the page |
| `live-check` | after `deploy`, daily | renders the **deployed** page and asserts on it |
| `probe-url` | manual | reach a URL from a runner — the sandbox blocks `*.workers.dev` |

Deployment needs a `CLOUDFLARE_API_TOKEN` secret that only a human can add —
see `docs/DEPLOY.md`.
