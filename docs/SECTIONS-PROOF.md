# briefs, series, standings: an empty array that means two things

The three top-level Context Graph sections are empty in every capture. Decoding
them found that **the wire format cannot distinguish "no data" from "the query
failed"** — and that the client is structurally unable to tell.

## Where the shape comes from

Not guessed. The relay's own source, `field-relay-nba`,
`docs/CC-CMD-context-graph.md`, `/context/date/{iso}`:

```javascript
const [regular, postseason, briefs, enrichment, standings] =
  await Promise.allSettled([ /* five D1 queries */ ]);

return Response.json({
  ok: true, date,
  games: { ... },
  briefs:    briefs.status     === 'fulfilled' ? briefs.value.results     : [],
  series:    enrichment.status === 'fulfilled' ? enrichment.value.results : [],
  standings: standings.status  === 'fulfilled' ? standings.value.results  : []
});
```

`Promise.allSettled` is a deliberate, documented choice, and a good one — the
CC-CMD's own rule says *"partial results are better than total failure. If one
query fails, the others still return."* The slate still renders when the briefs
table is unreachable.

But the rejection is collapsed to `[]`, and `[]` is also what a genuinely quiet
date returns. Those are not the same thing: one is a fact about the slate, the
other is an outage. **After the collapse, no consumer can recover which
happened.**

## The model

```fsharp
type Section<'T> =
    | Absent          // the key is missing from the payload entirely
    | EmptyOrFailed   // present and empty — indistinguishable from a failed query
    | Present of 'T list
```

`EmptyOrFailed` is deliberately awkward to read. The ambiguity is real, and
naming the case `Empty` would invent a certainty the payload does not carry —
which is the same mistake that would have rendered "line unchanged" over
`closing_odds` (`docs/ODDS-PROOF.md`).

Handling only the states that look meaningful does not compile:

<!-- proof: FS0025 -->
```fsharp
match g.Briefs with
| Absent -> "absent"
| Present rows -> sprintf "%d" (List.length rows)
```
```
error FS0025: Incomplete pattern matches on this expression. For example, the
value 'EmptyOrFailed' may indicate a case not covered by the pattern(s).
```

## Brief is modelled from the relay's SQL, not invented

The `briefs` columns come from the relay's own queries — `findBriefs` selects
`id, brief_type, brief_text, quality_score, source, model, word_count`, and the
date-level handler uses `SELECT * FROM briefs` with `game_id` and `date` in the
WHERE clause. Every field is optional, because `SELECT *` means the full column
set is not enumerable from the source and a column never observed is decoded as
absent rather than assumed away.

`series` and `standings` are decoded as key sets rather than typed rows. Their
SQL is `SELECT * FROM postseason_series` and a brief-table projection, and
neither has ever arrived non-empty, so there is no observed shape to model. The
keys are recorded so that the day they arrive they can be modelled from
evidence.

## Why this is not alarmed on

Unlike an unmodelled sport or an unbalanced spread, `empty-or-failed` does **not**
fail the sentinel. Firing on it would alarm on every quiet slate, and the state
is ambiguous by construction — an alarm that cannot distinguish a normal night
from an outage is noise.

It is recorded in the drift log on every run instead:

```
sections: briefs=empty-or-failed series=empty-or-failed standings=empty-or-failed
```

Whether these sections are ever populated is a question only the accumulating
log can answer, which is the same standing as the drift question itself.

## ADR-002 note on quality_score

`quality_score` is FIELD's JQ score for the **prose**, not for the game. It
rates writing quality, not how interesting a match is, so it carries none of the
RUWT weight that `SealedDrama` does and is deliberately not gated. Stated here
because a bare "score" field next to game data is exactly the thing worth
checking rather than assuming either way.

## Cost note

Reading these sections costs nothing beyond the `/context/date` fetch the page
already makes — they ride along in a response the laboratory was fetching
anyway.

That matters because FIELD's journalism is deliberately O(1): prose is generated
once per sport section per cron cycle, stored in KV, and served flat, which is
what makes it $19/month at 1 user and $19/month at 10,000. The architecture's
stated invariant is *"Client makes ZERO AI calls. Ever."*

This laboratory holds to that. It reads `/context/date` and nothing else. It
does not call `/journalism/generate`, which is the per-brief AI path, and it
must not start — a per-render call from a client is precisely the O(n) pattern
the newspaper architecture was built to delete.

## What this does not claim

- Not that the relay is broken. `Promise.allSettled` is the right call for
  availability; the loss is that the client cannot distinguish the two outcomes
  afterwards, which is a property of the wire format, not a bug in the handler.
- Not that these sections are always empty. Two captures and the runs in
  `outbox/drift-log.md` are the whole evidence base, all of them from a single
  relay.
- `Present` has never been observed. It is modelled and compiles, but has no
  real-data coverage — the same standing as `Moved`, `Unbalanced`, `TwoNumbers`
  and `Disagrees`.
