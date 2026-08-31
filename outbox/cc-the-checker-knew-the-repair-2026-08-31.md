# The checker knew the repair and would not make it

**Date:** 2026-08-31
**Scope:** `scripts/check-doc-citations.mjs`, `package.json`

`check:citations` has printed a block like this on every commit for days:

```
ANCHORED BUT THE NUMBER MOVED — the anchor gives the repair:
  cc-the-registry-checked-its-own-vintage-2026-08-29.md: docs-check.mjs:67 → now :71
  cc-two-clients-two-briefs-2026-08-29.md:               Desk.fs:792 → now :819
```

The check computes the correct line number, prints it, passes, and stops. It has
had the answer the whole time.

That is the failure this repo fixed one level up yesterday, in field-playground's
`followups.mjs` — a warning nothing acts on becomes a warning nobody reads. Here
it is milder and identical in shape: I scrolled past that block on roughly a
dozen commits this session and never once acted on it, which is exactly the
behaviour a standing warning trains.

## `--fix`

`applyRepair(docText, path, oldLine, newLine)`, plus `npm run fix:citations`.
The report block is unchanged; the new flag applies what it already knew.

## Two ways it could corrupt committed prose, both closed and mutation-proven

**A prefix match.** A citation ending `Desk.fs:79` is a prefix of one ending
`Desk.fs:792`. A plain string replace of the shorter would rewrite the middle of
the longer and invent a line number that never existed. The trailing `\b` cannot
match between `9` and `2`.

```
boundaries removed  →  FAIL  ...and repairing the SHORT one leaves the long one alone
```

**A path read as a pattern.** A path containing a `.` matches any character
unescaped, so a file named `DeskXfs` would be rewritten by a repair aimed at
`Desk.fs`.

```
escaping removed    →  FAIL  THE PATH IS ESCAPED, NOT USED AS A PATTERN
```

It only ever applies repairs `lineOf` produced, and that function returns `null`
for an anchor appearing more than once — so an ambiguous anchor yields no repair
to apply. That guard already existed, with its own fixture, written after an
earlier version produced a confident `analytics-engine.js:1197 → now :8`.

## Opt-in, never in CI

Rewriting committed prose because a build step decided to is a worse habit than
leaving a line number stale. `npm run fix:citations`, then read the diff.

## Applied

Two documents, two insertions, two deletions. The diff is two line numbers and
nothing else. Both verified against their anchors rather than trusted:

- `scripts/docs-check.mjs:71` now reads
  `JSON.parse(readFileSync('data/brief-recency-corpus.json', 'utf8'))`
- `src/Desk.fs:819` now reads
  `` `updated_at` picks the after-brief 0 times of 199 ``

Citation drift is zero — the `ANCHORED BUT` block no longer prints.

## The ratchet caught this entry

The first draft of this file failed the pre-commit gate: **7 bare citations
against a budget of 1.** Writing about the mechanism meant writing paths like
`Desk.fs:79` as illustrations, and the checker cannot tell an illustration from
a reference — it sees a path and a line number with nothing quoted beside them.

Correct behaviour, and the fix is to write illustrations so they are not
citations. They lost their directory prefix, which is what the pattern keys on,
and the two real references above gained inline anchors.

## Verified

```
node scripts/check-doc-citations.mjs --self-test   13 PASS, 0 FAIL
  mutation: word boundaries removed                FAIL on the prefix fixture
  mutation: path escaping removed                  FAIL on the pattern fixture
```
