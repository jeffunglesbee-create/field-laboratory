# Doc citations are anchored now, not just numbered

**2026-08-25.** Ported from field-relay-nba, where it was written after five of
six citations published that morning were wrong by the afternoon — the same
session had edited the file it cited, and an insertion above a line moves every
line below it.

## Why this repo needs it

The wrong figure that came from HERE was `docs/CC-CMD-2026-08-25-golf-sport-label.md`
saying **"21 of 22 entries"** against a real 21 — written from an estimate in a
document whose own step 1 reads *"Probe first. Do not write from this
document."* Quoting a fragment beside a citation cannot be done from memory;
it requires opening the file. That is the point of the convention, not the
line-number hygiene.

## First run

```
151 document(s) scanned
  anchored   200
  bare         1
  no file     98
  path only  100
```

Budget set to the measured 1.

**98 missing files is expected and is not a failure.** This repo cites relay
paths constantly and the relay is not checked out beside it. The check reports
them and never fails on them, for exactly that reason.

## What fails and what only ratchets

- **FATAL** — an anchored citation whose quoted fragment is not in the file. A
  specific, checkable claim that is false.
- **RATCHET** — bare `path:line` with nothing to verify it against. Counted,
  budgeted, may not grow. Historical CC-CMDs describing what a line held in July
  are records, not defects, and are grandfathered rather than rewritten.

## Verify

```
npm run check:citations
```

Wired into `verify.yml` beside `check:sports`.

## Still open

jubilant-bassoon (915+ docs) and field-playground have no citation check. Filed
as `field-relay-nba docs/CC-CMD-2026-08-25-port-citation-check.md`, whose step 3
says set the budget to the MEASURED count rather than copying this repo's — the
same lesson the secret scanner taught six hours earlier.
