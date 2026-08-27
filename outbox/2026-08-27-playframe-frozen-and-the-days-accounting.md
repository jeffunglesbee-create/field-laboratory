# PlayFrame frozen, and what today actually cost

## The freeze

`src/PlayFrame.fs` is **frozen at `6f23c76`**. No further commits to it until
something writes or reads a frame outside its own suite.

What is in it, all green and all unused:

- 24-byte big-endian reader; the endianness pass does not exist because
  `DataView` takes the byte order per read
- `Wire.encode` producer, round-tripped field by field
- absence as NaN, propagating, with two mirrored checks
- a versioned layout that refuses an unknown version or a used reserved byte,
  checked on every record

**What unfreezes it:** a producer or a consumer. Concretely, any one of —

1. the relay serves per-play EPA on a route and the laboratory reads it (one EP
   model, one owner; needs a relay CC-CMD);
2. a decision to narrow the layout, dropping `LeverageIndex`, which nothing in
   any FIELD repository computes;
3. anything at all that emits a 24-byte frame.

Until one of those, more work on it makes an unused thing more correct. That is
the drift this note exists to stop.

**Deliberately not recorded in the module header.** A one-line comment in
`PlayFrame.fs` would be the durable place for a freeze, and writing it would cost
a verify run — the exact spend the freeze exists to stop. The tension is real and
this is the cheaper side of it: `outbox/**` is in `verify.yml`'s `paths-ignore`,
so this file costs nothing.

## The accounting

Eighteen commits today, roughly thirteen verify runs plus deploys, guards,
live-checks and one dispatch.

| thread | commits | how it started |
|---|---|---|
| the five approved items | 4 | approved |
| weather red | 10 | my commit's verify went red |
| PlayFrame | 4 | a pasted architecture spec |

The four approved commits were the first four of the day. Fourteen of eighteen
went to threads that began as side effects.

Worth keeping from the weather ten: the retry (measured — four lost, four
recovered in 158–325ms), the build stamp on every render run, and `fetchUnsafe`
making an unreachable branch reachable. Worth not repeating: preconnect, shipped
on a hypothesis and removed when refuted — two commits, two verify runs, net
change nil. The refutation was worth having; shipping before measuring was not.

## The batching rule, from here

`outbox/**`, `docs/**` and `**/*.md` are in `verify.yml`'s `paths-ignore` and
cost nothing. Source changes cost a verify run each and today they landed one at
a time. From here they batch: several related edits, one push, one run.

`[skip ci]` is **not** the way to make an outbox commit cheap here — it also
suppresses `status.yml`, which regenerates `outbox/INDEX.md`, so the index goes
stale until the next unskipped commit. Two of today's outbox commits carried it
(`f6e8d3a`, `2a58138`) and should not have.

## What is actually open

Nothing of mine. The open items are all human-only:

- the `env_01Vs994fYs6XDBw5fQfVJauH` setup script, which fails at init and breaks
  the field-playground routine daily
- revoking the Drive PAT in `1GRvHk70ScS8AGmm1EfcZgROCPUmOBBK0`
- rotating `RELAY_SHARED_SECRET`
- rotating the Odds API key at the provider

Next scheduled event: `trig_01WNrxtCgheYmsJdEyX4y7CV`, 2026-08-28T13:15Z, the
spread-price second probe date.
