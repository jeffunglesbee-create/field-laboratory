# note, tags, crew, local_note: the fourth double-encoded field

Four editorial columns, `null` in every game of every capture. Decoding them
found that one of them is a **fourth** double-encoded field — a hazard this
repo's own documentation had recorded as affecting exactly three.

## What they are

Not guessed. From FIELD's own docs on Drive:

| field | meaning | source |
| --- | --- | --- |
| `crew` | broadcast crew — commentators | *Archive-Consuming Client Features Phase 2* |
| `note` | editorial note on the game | *Archive D1 + Relay Endpoints*, ADR-002 status |
| `local_note` | the local/regional variant of the same | same |
| `tags` | a JSON array, **stored as a string** | `/archive/tagged/:tag` route SQL |

`crew` has a documented render in production — two of them. A full `.crew-line`
in the card body and a compact `.crew-chip` beside the broadcast pills, both
conditional on the value being truthy. The same log records that crew is
populated on *postseason* objects (NBA Finals, Stanley Cup Final, with named
commentary teams per network), which is why neither capture here carries one:
both are regular-season slates.

## The finding

`src/Desk.fs` has carried this comment since the first session:

> A field that the relay serves as a *string containing JSON* rather than as
> JSON. **Three real fields do this:** drama_arc, opening_odds, closing_odds.

It is four. The evidence is the relay's own archive route:

```javascript
// /archive/tagged/:tag — uses SQLite json_each for JSON LIKE
const tagged = await env.ARCHIVE_DB.prepare(
  `SELECT * FROM regular_season_games WHERE tags LIKE ?`
).bind(`%"${tag}"%`).all();
```

Binding `%"tag"%` — with the quote characters *inside* the pattern — only
matches if the column holds a JSON array serialised as text. A native array
column would never be queried that way.

So `tags` carries the same hazard as `drama_arc`: a `string` type annotation
describes it with complete accuracy and tells you nothing about whether the
contents parse. That is the exact failure this laboratory was built to study,
sitting in a field nobody had decoded.

## Modelled for both encodings, because the evidence is indirect

`tags` is `Nested<string list>`, the same type as `drama_arc`. But the evidence
is a SQL binding pattern, not an observed value — the field is `null` in
every game of both captures, so the encoding has never been seen directly.

`nestedJson` therefore gained a final branch that accepts the value *directly*
as well as string-wrapped:

```fsharp
let nestedJson (inner: Decoder<'T>) : Decoder<Nested<'T>> =
    Decode.oneOf [
        Decode.nil NotPresent
        Decode.string |> Decode.map (fun raw -> ...)
        inner |> Decode.map Decoded          // <- added
    ]
```

Ordered last, deliberately, so it can never shadow the string branch: a string
is still unwrapped, and a string with broken contents still surfaces as
`Malformed`. Verified both ways —

```
tags='["rivalry","playoff-race"]'  ->  Decoded ["rivalry"; "playoff-race"]
tags=["direct","array"]            ->  Decoded ["direct"; "array"]
```

— and the corrupted fixture is still rejected, which is the check that matters
most here, since a more permissive decoder is exactly how a guard loses its
teeth.

## Sentinel

Fill rates ride along on every run:

```
desk: note=0 local_note=0 crew=0 tags=0 of 2 games
```

`tags` gets the same alarm as the other three double-encoded fields — a
malformed inner payload fails the run rather than being noted. The other three
are counted, not alarmed: a null editorial note is a normal Tuesday, not a
fault.

## ADR-002

CLEAN, and stated by FIELD rather than assumed here. The archive spec's own
status reads: *"All data crossing the wire is factual game results, scores,
teams, dates, editorial notes. No drama scores, no composite interest levels, no
recommendations."* The client-features log says the same of the crew chip:
*"broadcast metadata already present in the source object."*

## What this does not claim

- Not that `tags` is string-encoded on the wire. The SQL says the *column* is;
  whether `/context/date` re-serialises it is unobserved. Both encodings decode,
  which is the honest response to not knowing.
- Not that these fields are always empty. Zero of four populated across two
  captures and the runs in `outbox/drift-log.md`, all from one relay.
- Nothing is rendered for them on the committed data, because there is nothing
  to render. The slot is built so that the first time production sends a crew or
  a note, it appears — rather than being discovered missing then.
