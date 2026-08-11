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

**The honest negative, now partly retired:** the units of measure caught nothing
real for most of this repo's life — they rejected a bug written deliberately to
be rejected (`docs/UNITS-PROOF.md`) and otherwise carried a demo constant. The
Odds Story gave them their first real consumer. A moneyline's implied
probability is not a win probability: `-142 / +132` implies 0.587 and 0.431,
which sum to 1.018, and the 1.8% is the book's margin. `[<Measure>] type
implied` makes confusing the two a compile error. Still true, though, that the
boundary where a raw `float` gets its unit is a judgement call.

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

**The second result found by the type system, not written to be found:** `Sport`
was a `string`, so the card rendered every fixture as `Away @ Home` — the
American convention — including AFL. A Sydney home game against Collingwood
rendered as **"Collingwood @ Sydney"**, which reads as a Collingwood home game.
Both captures went through it, every check stayed green, and it was on the live
page.

Home/away order is the *first* field FIELD's Rule 50 lists, and this is why. A
`string` carries no convention with it. `Sport` is now a union with one registry
(`docs/SPORT-PROOF.md`), and adding a case without updating the registry is a
compile error that names the missing sport — Rule 50's requirement enforced
rather than requested, while the rule itself has been "Specced, not yet built" in
production for months.

Fixing the names then transposed the scoreline against them, which is the same
lesson twice: Rule 50 lists score format in the *same* registry entry as
home/away order because they are one decision.

**The first finding about the data rather than a type:** `closing_odds` is not a
closing line. In every sampled game its `captured_at` is ~22 seconds *before*
`opening_odds.captured_at`, from the same adapter, with identical moneyline,
spread and total. One snapshot written to two columns.

A narrative layer built without checking would have rendered "line unchanged" on
every card — a true-sounding statement about a market never observed twice.
`OddsStory.NotASequence` is the case the committed data actually takes, and the
card says so. See `docs/ODDS-PROOF.md`; the sentinel measures it daily and files
its own issue.

Decoding `spread` and `total` found a second one: `total = {over: 8.5, under:
8.5}` in every game. The field reads as two prices and carries one line,
duplicated. Neither the spread nor the total is priced at all — the moneyline is
the only priced market in the payload.

**The finding that needed the relay's source to see:** `briefs`, `series` and
`standings` are empty in every capture, and the wire format cannot say why.
`/context/date` assembles them with `Promise.allSettled` and collapses a
rejected D1 query to `[]` — which is also what a quiet date returns. Modelled as
`Absent | EmptyOrFailed | Present`, where the awkward middle name is the honest
one. See `docs/SECTIONS-PROOF.md`.

**A fourth double-encoded field, found in this repo's own documentation being
wrong:** `src/Desk.fs` said *"Three real fields do this: drama_arc,
opening_odds, closing_odds"* since the first session. `tags` is the fourth — the
relay's `/archive/tagged/:tag` binds `%"${tag}"%`, quotes inside the pattern,
which only matches a JSON array stored as text. Same hazard as `drama_arc`,
sitting in a field nobody had decoded. See `docs/DESK-PROOF.md`.

**The bug that was live every night in US prime time:** the laboratory keyed
every date off `todayUtc()`; FIELD keys off Eastern. Between 00:00 and 04:00
UTC — 20:00 to midnight ET — the page requested tomorrow's slate, and
`datePassed` went true for tonight's fixtures, so `gameState` rendered **live
games as Final**.

`FieldDay` makes the zone a type. The first cut was not enough: with
`Game.Date` still a `string`, `g.Date < fieldDayIso (fieldToday ())` compiled
cleanly — the original defect straight past a type that only guarded the unwrap.
Lifting the date at the decode boundary is what made the claim true. See
`docs/ZONE-PROOF.md`.

## The other half of the answer: where it does nothing

Everything above is a data-shape or display-rule failure, and the type system
prevented all of them. That is one half of FIELD's failure modes. The other half
has dominated this repo's own history, and no type in any language would have
caught a single instance of it.

| Failure | Shape |
| --- | --- |
| The gate was an **average**, so each row added made the next failure cheaper — 10 of 17 rows could fail alone and still clear 95 | a check that passes in one direction |
| `GATE_DAY` was read per-row, and a run that crossed midnight ET asked about a different day than it started in — CI run 31456294086 | a check that changes as the world moves under it |
| A mutation's unquoted glob **created** the outbox file it then counted | a check that changes the world it measures |
| A verdict check **clobbered `STATUS.md`** by importing the script that writes it | the same, one day later |
| Four distinct API failures — no token, rejected token, refused scope, no network — rendered one identical sentence | a check that passes in one direction |
| `live-check` fired after a *skipped* deploy and blamed the commit that fixed it | a check that answers about the wrong world |
| `tab-check`'s bare `[role="tab"]` matched Pick'em's sport chips | a check that agrees for the wrong reason |
| `spark-check`'s every-Nth sampling proved nothing on the one real arc | a check with no teeth |
| I reported CI run 31456294086 **green when it was red**, and nothing in the repo could contradict me | a claim that outran its evidence |
| `/actions/runs` reported a run `in_progress` for ninety minutes after it finished green; I called it stuck from one endpoint without asking the other | a claim confirmed by exactly one lookup |

Two shapes account for all of it: **a check that passes in one direction**, and
**a claim that outruns its evidence**.

So the assertion this repo was built to test needs sharpening rather than
defending:

> F# structurally prevents FIELD's **data-shape and display-rule** failures. It
> has no opinion whatsoever on FIELD's **verification** failures.

That distinction is not academic for FIELD. Its gate has been overridden at least
twice — 92/100 citing a 63/100 precedent — and a gate override is a verification
failure, not a data one. The strongest work in this repo aimed at that half is
written in JavaScript: mutation testing, a gate that is a conjunction rather than
an average, `fetch-depth: 0`, and a status file that can contradict its author.

**And that is a choice, not a limit.** `src/` is 2,757 lines of F#; `scripts/`
is 4,871 lines of untyped JavaScript, and every failure in the table above
happened in the untyped half. Nothing prevented the check harness being written
in F#. It was written in JavaScript because that was faster — so the claim went
unapplied precisely where it was most testable, by the hand of the person making
it.

The first draft of this paragraph said the experiment "has not tested its own
claim on that territory," which is the reading to resist. It converts a negative
result into a to-do and exempts the assertion from ground it lost. The same move
appears twice more in this repo's history under different names — "cannot be
tested" and "NOT claimed" — and it was corrected both times.

So it stands as a result rather than a plan: **on verification, this repo's F#
has no record, because its author reached for JavaScript every time verification
was the problem.** What would change that is building the harness in F# and
seeing whether the failures above become unwritable — not asserting in advance
that they would.

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
npm run check      # 13 checks in real Chromium, including two state transitions
npm run check:nav  # 18 checks: sport grouping and date navigation
npm run check:proof # compiles every rejection docs/*-PROOF.md claims
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
