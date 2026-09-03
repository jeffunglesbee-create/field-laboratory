# The 51 MLS pairs: is `indistinguishable` the data, or the instrument?

`classifyPair` returns `duplicate` only on evidence — two rows sharing an
`espn_event_id`, or two rows sharing a `start_time`. The 51 MLS clusters carry
neither, so `indistinguishable` is the honest verdict **from the four fields the
identity probe reads**. It is not a statement that no discriminator exists.

`scripts/probe-mls-pair-discriminators.mjs` asks two further questions, cheapest
first:

1. **Does any other column separate the two rows?** The table has more than four.
   A pair whose venues differ is two games; a pair agreeing on a populated score
   is one row written twice.
2. **What does the source say?** Two MLS clubs playing each other twice on one
   date is not something the league schedules — but asserting that from knowledge
   is exactly the move this repo keeps deleting. The relay serves the slate. Ask
   it how many fixtures it lists between those clubs on that date.

## Merging is deliberately not in scope

This probe writes nothing to D1. A merge deletes a row, and *do not delete
archive rows without explicit human approval* is standing. What it produces is
the evidence a merge would need.

## The two predicates, and why each has four states rather than two

`compareField` returns `agree` | `differ` | `one-null` | `both-null`. The middle
two are the point: a column absent from both rows discriminates nothing, and
counting `both-null` as agreement would let twenty empty columns "prove" a
duplicate. A column present on one side only is the stub pattern the whole defect
is made of.

`slateVerdict` returns `one-fixture` | `doubleheader` | `absent-from-slate` |
`not-observable`. A slate that failed to load is not "no duplicate found".

13/13 self-tests, including the four that assert the non-obvious states.

## Recon first

The sweep is written **after** `--recon` reports: the real column list from
`PRAGMA table_info`, one full MLS pair with every column, whether
`/v2/games?sport=mls` answers at all and in which date format, and what
`/context/date` serves. Writing the comparison against remembered column names
is the defect this repo's probe-first rule exists for.

## Recon result — the discriminator exists



Twenty-four columns. The identity probe reads four of them.



**The dash rows carry  and **, which nothing had looked at.
They also share one  —  on all four sampled —
which is the single-import signature, not a per-game one.



**Yes, with ESPN event ids.** Both  and  are accepted.
 returns 404 — wrong parameter shape, and not needed.

So the authoritative discriminator exists and is one fetch away: how many
fixtures the league actually played between those clubs on that date.

## The sweep, written against those shapes

 puts the slate ahead of the fields, deliberately. Two rows of one
fixture can disagree about a venue string without being two games — one writer
says , another  — so a field difference is
weak evidence in the direction that matters least. How many fixtures the league
played is not a formatting question.

 and  are excluded from the comparison.  records
the write, not the fixture, and the whole defect is that the two rows were
written at different times.  is null on every dash row measured, so it
could only ever return .

### One limit, asserted rather than hidden

 is a token-subset match, so  does **not** match
 —  is not a token of it. An abbreviated slate
entry against a spelled-out archive row would yield zero and read as
, which is indistinguishable from a fixture never played. The
measured data does not hit this (both sides spell names out), the self-test
asserts the limit so it fails loudly if  ever grows an alias table, and
the sweep prints every  pair so the failure mode is a number
rather than a silence.

22/22 self-tests. A mutation making the slate never win drops it to 21/22.

## Result

Pending the resolve run.
