# One document, four copies, nothing comparing them

**2026-08-26.** `scripts/skill-drift-check.mjs` + `.github/workflows/skill-drift.yml`.

## The gap

`unslop-ui` was installed in jubilant-bassoon, moved here, then put in **both**
on request. `i-have-adhd` already sat in four repos. Nothing compared the
copies. Edit one and the others keep the old text silently.

That is the same shape as a second implementation of one rule — the reason
`drawPriceFrom` lives in field-relay-nba's `src/odds-shape.js` instead of being
copied into `index.js`, stated in that file's own header.

## What it checks, and what it deliberately does not

This repo's checked-out copy is the reference. Every sibling that **serves** the
file must be byte-identical.

It does **not** compare against the upstream author's repo. `sync-adhd-skill.mjs`
already tracks upstream, and folding that in would let a stranger's edit to
their own `main` turn this red — which is not drift between our copies, and a
check a stranger can redden is a check that gets disabled.

Four states, and the distinctions are the substance:

```
MATCHES        200, bytes identical
DRIFTED        200, bytes differ          <- the only fatal state
UNREADABLE     404 or any non-200 — absent, private, or unreachable.
               Indistinguishable from outside, so reported as one state
               and NOT fatal.
NOT INSTALLED  no local copy, so no reference exists; the skill is skipped
```

A trailing-newline difference counts as drift. Normalising whitespace would
hide a diff the next sync would write.

## Why it runs here, with no credential

**field-laboratory is private** — verified 2026-08-26: anonymous
`raw.githubusercontent` returns 404 for `CLAUDE.md`, `HANDOFF.md` and
`STATUS.md`, all committed on `main`. The three siblings are public.

So this is the only repo that can read all four copies: its own from the
checkout, theirs from raw with **no token at all**. A sibling could not run the
same check, because it could not read this one.

## Why not a verify.yml step

`verify.yml` carries `paths-ignore: '**/*.md'`. Every skill **is** a `.md` file,
so a skill edit is precisely the push `verify` never sees. Wiring it there
produces a guard that cannot fire on the change it guards against — the shape
`verify.yml`'s own header names ("a regression guard nobody executes is
documentation"), and the same gap that let a credential reach field-relay-nba's
`scripts/` behind a deploy filter that did not cover it.

## Proof it works

Self-test, 9/9, covering all three verdicts including the two a live run on a
good day never reaches — a 500, and a 200 with no body (which must not read as
an empty-file match).

Mutation test against the real thing: 28 bytes appended to the local
`unslop-ui` copy.

```
unslop-ui  (8350 bytes here)
  UNREADABLE  field-relay-nba    HTTP 404 (absent, private, or unreachable — not a finding)
  DRIFTED     jubilant-bassoon   8322 bytes there vs 8350 here
  UNREADABLE  field-playground   HTTP 404
1 drifted        exit=1
```

Restored, and the clean run:

```
i-have-adhd  (6813 bytes here)   MATCHES x3
unslop-ui    (8322 bytes here)   MATCHES jubilant-bassoon, UNREADABLE x2
4 copies compared, 0 drifted     exit=0
```

## Scope boundary

This answers **"do the copies agree"**, not **"does every repo have one"**. A
skill deleted from a sibling reads UNREADABLE, the same as never installed.
Coverage needs a declared roster of which repo should carry which skill, and a
roster goes stale; drift needs no roster at all. If coverage is wanted later it
is a separate check with a separate failure mode, not a widening of this one.

## Unblock criteria (Rule 74)

- **Closed:** the copies are unverified. Four compared, zero drifted, weekly.
- **Open, blocked on nothing:** if a sibling goes private, its copy becomes
  UNREADABLE and drops out silently. Nothing currently distinguishes "went
  private" from "never had it". Verify by watching the compared count fall:
  `node scripts/skill-drift-check.mjs` reports it on the last line.
