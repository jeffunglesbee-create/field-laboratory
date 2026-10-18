# Claude Code Command — a direct order: do not build in client over laboratory

**Branch:** main — commit directly, do not create a feature branch or PR
**Repo:** field-laboratory (and jubilant-bassoon, cross-repo via a runner)
**Confidence gate:** >= 95 before any commit
**Filed:** 2026-10-18 by chat
**Status:** FILED, not dispatched.
**Type:** governance — rule text only, no behaviour change.

---

## The order, verbatim

> Consider this a direct order to not build in client over laboratory

Owner, 2026-10-18. It is not a preference and it is not scoped to one feature.

## What it means operationally

Where new work could land in either repo, it lands in **field-laboratory**.

This overrides the standing routing convention, which reads *"client-scoped to
jubilant-bassoon, relay-scoped to field-relay-nba"* — that default still governs
work which can only live in one place, and is now subordinate to this order
wherever a choice exists.

**The client keeps only what must be there:** the served page itself, and
captures that produce data the laboratory consumes. Everything else that is a
choice is the laboratory's.

**It is not retroactive.** Do not move existing client code, and do not
dismantle the producer/consumer split already working — `4793504` is the right
shape: the client captures, the laboratory computes and proves.

## Why the order exists, from the record

The BDB scout work ran the other way round. Per
`outbox/…bdb-vintage-task0` (jubilant-bassoon, 2026-10-17), all six BDB files'
consumers live in the client's `src/legacy/field.js`, and that document reports
the owner's vintage rulings applied there in `4172d95f` and `b615d5b8`. The
laboratory then had to **mirror the same rows** — `4793504`, which brought a
workflow, a proof doc, a census script and a session doc with it.

One feature, built client-first, then rebuilt laboratory-side to be provable.
That is the sequence this order ends.

*(Those two client shas are quoted from that document. This session has
read-only access to jubilant-bassoon and a shallow checkout, and did not verify
them directly — verify before citing them further.)*

---

## TASK 1 — the rule text, in both CLAUDE.md files

### `field-laboratory/CLAUDE.md`, under `## Standing instructions`

Add one bullet alongside the existing six. Keep their voice.

> - Build in the laboratory, not the client. Where new work could land in
>   either repo it lands here; the client keeps the served page and the
>   captures that feed this repo. Direct owner order, 2026-10-18.

### `jubilant-bassoon/CLAUDE.md`, under `## Rules (non-negotiable)`

The same rule, written for a session working in the client — which is where it
actually has to be read to have any effect.

> **LAB-FIRST-A.** Do not build here what could be built in field-laboratory.
> This repo holds the served page and the captures that feed the laboratory.
> New computation, new proofs and new metrics go to field-laboratory. Direct
> owner order, 2026-10-18.

### Do NOT give it a number

Tag it `LAB-FIRST-A` and leave it unnumbered. `STANDARDS.md` says why, and this
session already fixed three committed documents that tripped on it:

> Three rule registries are in play and they diverge above 88: this file's Rule
> 91 is SCOPE-LEGIBLE-A, `jubilant-bassoon/CLAUDE.md` Rule 91 does not exist
> (that file ends at Rule 90, VERIFY-ARTIFACT-A), and SAMPLE-COVERAGE-A is Rule
> 91 in `field-relay-nba/CLAUDE.md` only.

The client's registry ends at 90. Numbering this 91 there would collide with
two different meanings of 91 elsewhere. A tag has none of that problem.

---

## TASK 2 — how the client edit lands

Cross-repo, by runner, no PR. `field-laboratory/CLAUDE.md`'s own standing
instruction governs: *"Applies to cross-repo asks too: automate the commit, do
not open a PR."*

Chat could not do this half: this session holds **read-only** access to
jubilant-bassoon. That is why it is a task rather than an edit.

---

## FORBIDDEN

- **Do not number the rule.** See TASK 1.
- **Do not move existing client code** into the laboratory as part of this.
  This is rule text; a migration is a different CC-CMD with its own
  measurements.
- **Do not weaken it to a preference.** "Prefer the laboratory" is not what was
  said.
- **Do not delete the `client-scoped to jubilant-bassoon` convention.** It still
  decides work that can only live in one repo. Record that this order
  outranks it where a choice exists.
- No PR. Commit to `main` in both repos.

## Done condition

1. The bullet is in `field-laboratory/CLAUDE.md` under `## Standing
   instructions`, and the laboratory's guards pass.
2. `LAB-FIRST-A` is in `jubilant-bassoon/CLAUDE.md` under `## Rules
   (non-negotiable)`, landed by a runner commit, and the client's smoke gate
   passes.
3. Neither occurrence carries a rule number.
4. One line in the session doc naming the next piece of work this order
   redirects, so the rule is shown biting once rather than only being written
   down.
