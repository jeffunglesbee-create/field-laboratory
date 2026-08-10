# Outbox split, and three defects a Claude chat review found — 2026-08-10

**First document under the new convention: one outbox entry per piece of work,
never appended to.** What follows explains why, and fixes three real defects
found by a Claude chat session reviewing this repository from the outside.

## The convention that changed

Until this document, a session wrote one file and appended to it all day.
`cc-session-2026-08-10-grouping-datenav-and-amnesty-gate.md` reached 1,289 lines
and 60 KB across five commits. That file stays as it is — rewriting it now would
falsify the history it records — but nothing more will be appended to it.

Two failures came directly from that shape, and neither was hypothetical.

**A reader cannot tell which commit wrote which passage.** The reviewer tried to
verify a claim of the form "commit `814388a` is documented by the section at line
1046" and could not, saying so precisely:

> none of the three commit hashes appear anywhere in the document's text … I
> don't have real git-log access through my own tools — they read file contents
> via GitHub's API, not commit history

They were right, and their distinction was sharper than my table: *"the commit
that added this outbox text"* and *"the commit this text is about"* are different
claims, and a monolithic file makes the first one unanswerable from text alone.

**A filename comparison misses unbounded content.** Their staleness check
compared filenames, so it reported no new outbox activity while that file grew
by roughly 400 lines — same name, a third more content. Their words:

> a file can grow substantially without ever showing up in a filename-based
> comparison

One document per piece of work makes new work a new filename, which is the thing
a filename comparison can actually see.

### The mapping, generated rather than typed

New filenames fix the diff. They do not, on their own, give a reader without
`git log` the commit pairing. So `scripts/outbox-index.mjs` generates
`outbox/INDEX.md` — every outbox entry against the commit that wrote it, read
out of git history on every run.

Hand-written hashes would have been the obvious alternative and the wrong one:
the SHA is not known until after the commit exists, so it would always be either
absent or asserted. A derived index cannot claim a pairing git does not have.

It runs in `status.yml`, which already commits back, because the index describes
a commit and must therefore be written after it. `--check` reports drift without
failing for that reason; `--strict` is available for callers who want the hard
version.

Its first output is the diagnosis in one glance: five separate commits, all
pointing at the same file.

## Defect 1 — the inventory guard was checking fixtures, not files

`gate-inventory.mjs` was added earlier today to stop the gate's denominator from
being edited by the thing it grades. The reviewer tested it properly: ran it
standalone, **deleted a real row from the real `docs/gate-rows.txt`**, re-ran,
and got the same six passes.

Their diagnosis was exactly right — standalone, every assertion was synthetic.
The live comparison happened only inside `confidence.mjs`, which they could not
run, having no .NET.

That is worse than a missing check. Whoever runs a guard on its own is usually
the person asking whether it works, and this one answered a question they had
not asked.

**Fixed.** The rows moved to `scripts/gate-checks.mjs`, importable without
running the gate, and `gate-inventory.mjs` standalone now compares the real
inventory against the real rows **first**, before any fixture. Replaying their
exact test:

```
=== delete a real row from the real file ===
FAIL  the live gate matches docs/gate-rows.txt
      → UNDECLARED row "FIELD-zone day is correct at fixed instants" (10 pts)
        — in the gate, not in docs/gate-rows.txt
exit=1
```

It needs no .NET, no browser and no build. That is the requirement, not a
convenience: the reviewer had none of the three.

## Defect 2 — the gate checked its own paperwork on the wrong clock

Found while splitting the outbox, not reported. `outboxToday` computed the date
as:

```js
const today = new Date().toISOString().slice(0, 10)   // UTC
```

In a repository that spent the day making the viewer's calendar day a type, and
built four guards to keep it that way, the gate verifying its own outbox was
still on UTC. Between 20:00 ET and midnight it would look for tomorrow's file
and fail a session that had written today's.

**Fixed.** It uses `fieldDay()` — the same `America/New_York` conversion as
everywhere else, now shared from `checks.mjs` rather than copied a third time.
It was already duplicated in `zone-check.mjs` and `nav-check.mjs`.

The JS and F# implementations stay deliberately separate: `zone-check` compares
them at fixed instants against hardcoded expected days, so if either is wrong
that is a failure rather than an agreement.

## Defect 3 — the check assumed the convention it is now dropping

`outboxToday` matched only the `cc-session-<date>-` prefix. Under the new
convention that would silently stop matching. It now accepts today's FIELD-zone
date anywhere in the filename, which covers both the old files and this one.

## What the review could not reach, and what that implies

The reviewer stated their own limits plainly and correctly: they could confirm
the sections exist and read as real, could confirm `confidence.mjs` genuinely
imports the comparison logic, and could not run the full gate because it needs a
build they had no `dotnet` for. They also corrected their own earlier "no new
activity" claim without being asked.

The standing lesson is not about them. **A guard that can only be exercised by a
full toolchain is a guard most reviewers will take on trust.** Every check added
after this should be runnable with node and a checkout alone, or say plainly
that it is not.

## Verification

| | |
| --- | --- |
| `gate-inventory.mjs` standalone | 7/7, including the live comparison |
| the reviewer's mutation replayed | correctly fails, exit 1 |
| `workflow-check.mjs` | 6/6 |
| `history-check.mjs` | boundary intact, 0 governed violations |
| confidence gate | see the commit; rows unchanged at 11 |

The row inventory is untouched by this work — no row added, removed, or
reweighted — so the gate's own tamper check passes without a `docs/gate-rows.txt`
edit, which is the correct signal for a change that does not alter what is
measured.
