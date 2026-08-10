# The "frozen" boundary claim was overstated — 2026-08-10

A Claude chat session reviewed `scripts/history-check.mjs` and read its design
back accurately. Checking its reading against the code found one claim that does
not hold — **mine, not theirs.** They repeated what the header comment said.

## What the review got right, verified

| Claim | Verified |
| --- | --- |
| `git log --no-merges` has no depth limit, unlike production's 20-commit window | yes — walks to the root, 113 commits |
| The July 8 doc records suppressions "aged out of the window as more commits landed" | yes, quoted verbatim in that doc |
| `isViolation` is `files.some(source) && !files.some(outbox)` — the commit is the coupling unit | yes |
| NUL-split parsing so an adversarial commit subject cannot desync the walk | yes, and deliberate |
| The self-test replays the production bug: source-only commit + unrelated outbox commit, only the first flagged | yes |
| The header verbatim-quotes the real July 8 Drive doc, not a reconstruction | yes |

Their independent confirmation of that last point is worth more than my saying
so: they found the Drive document themselves and matched it to the quote.

## The claim that does not hold

They wrote:

> the count of pre-rule violations (17) is hardcoded and checked on every run:
> if someone moved that boundary later to quietly swallow a new violation, the
> count would change and the check would fail

The first half is true. The second half is true only of moving the boundary
**alone**. `RULE_EFFECTIVE` and `PRE_RULE_VIOLATIONS` were four lines apart in
the same file, so moving both was one edit in one file — and the check would
pass.

The header comment said the count was *"frozen … so moving the boundary forward
to absorb a new violation changes that count and fails this check"* without that
caveat. They read the claim as written. **The error is the claim, and it is
mine.**

Worth naming precisely because this repo already has a guard built for exactly
this — `proof-check.mjs` compiles every rejection `AMNESTY-PROOF.md` claims,
because a prose claim about a guard shipped overstated once before. That guard
covers compiler claims. It does not cover a comment about tamper-visibility, and
this one went out unchecked.

Note also the asymmetry: `docs/gate-rows.txt`, written hours earlier the same
day, states plainly that it "is not tamper-proof and does not claim to be."
`history-check.mjs` made the stronger claim about the same kind of mechanism. Two
guards, same property, two different honesty standards.

## Fixed

The boundary and count moved to `docs/history-boundary.txt`, read at startup.
This does not make it tamper-proof — nothing self-hosted is — it makes the edit
cross a directory boundary, exactly as `docs/gate-rows.txt` does, so a moved
boundary lands as a `docs/` change beside a `scripts/` change, and the outbox
rules already force a written reason for the latter.

**The claim, restated exactly:** moving the boundary *without* also editing the
count fails the check. Moving both is permitted and visible. Visibility, not
prevention.

Mutation-tested — boundary moved to `543a64d`, count left at 17:

```
predating the rule: 2 (declared 17 in docs/history-boundary.txt)
FAIL  the pre-rule violation count moved: 2, declared 17
FAIL  15 commit(s) changed source without an outbox entry: [each named]
```

The word "frozen" is also gone from the output, which said `(frozen at 17)` and
now says `(declared 17 in docs/history-boundary.txt)` — pointing at the file
rather than asserting a property.

## One place the review's framing outran the record

They described the July 8 acknowledgment entries as "three real false positives
in production." The Drive record does not settle that, and the two documents
disagree with each other:

- **07-07** on the same items: *"Two pre-existing violations found: 85/100 from
  July 7 … and 70/100 from July 6 … **Both are real violations** the check
  correctly surfaces."*
- **07-08** on those same items: *"the same three **already-reviewed,
  non-actionable** outbox entries."*

So the entries were genuinely sub-95 outboxes — the score half of the test was
correct. What the broken correlation did was keep **re-flagging them after
review**, on every deploy, with no way to settle them except suppression.

That is a smaller claim than "false positives" and it survives both documents.
It does not weaken the case for fixing the correlation; it sharpens what the
correlation was doing wrong.

> **Superseded.** When this was written, the header comment in
> `history-check.mjs` still called them "standing false positives," and this
> paragraph said it was left as-is. It was corrected immediately after, in the
> commit following this one — see
> `cc-false-positives-claim-correction-2026-08-10.md`. This note is edited in
> rather than left to rot, because a document saying "left as-is" about
> something since fixed is exactly the stale claim these corrections exist to
> prevent. The original wording is in git.

## The PAT is still live, and has now surfaced in a second session

That review's transcript shows it encountering the plaintext GitHub token in the
Drive doc and correctly setting it aside. It has now appeared in the working
context of at least two sessions. It is `repo` + `workflow` scoped and valid to
May 2027. Revoking it is the user's call; the case for doing so is stronger than
it was this morning.

## Verification

| | |
| --- | --- |
| `history-check.mjs --self-test` | 7/7 |
| audit against real history | boundary intact, 0 governed violations, 113 commits |
| boundary moved, count unchanged | correctly fails, both failure lines |
| `gate-inventory.mjs` | 7/7 including the live comparison |
| `workflow-check.mjs` | 6/6 |
