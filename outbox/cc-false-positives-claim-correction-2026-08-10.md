# "Standing false positives" was the wrong name for them — 2026-08-10

The header of `scripts/history-check.mjs` described the four entries on FIELD's
`docs/confidence-gate-acknowledged.txt` as *"a standing false positive that a
human had to read, judge, and write a paragraph about."* That claim is not
supported by the Drive record, and it has been corrected.

## Why it was wrong

The two production documents describe **the same items** in incompatible terms:

| Doc | On the 70/100 and 85/100 entries |
| --- | --- |
| `Confidence-Gate Violation Detection — 2026-07-07` | *"Two pre-existing violations found … Both are **real violations** the check correctly surfaces."* |
| `Confidence-Gate Acknowledgment List — 2026-07-08` | *"the same three **already-reviewed, non-actionable** outbox entries"* |

Calling them false positives adopted the second framing and discarded the first.
It was not a neutral summary — it picked the reading that made this repo's fix
look better, and dropped the one that complicated it.

The score half of the production test was in fact working. Those entries really
did report sub-95 scores. Nothing was invented.

## What is actually true, and survives both documents

The check had no relationship between an outbox entry and the commits that wrote
it — only proximity in a 20-commit window. So it could not tell a **settled**
finding from an **unsettled** one. It re-raised reviewed entries on every deploy,
indefinitely, and the only exit was suppression.

**The defect is not that innocent entries were invented. It is that nothing
could ever be closed.**

That is a smaller claim and a more useful one, because it names what a per-commit
answer actually buys: *a commit either paired source with an outbox entry or it
did not, and no later commit changes that.* The finding is settled at the moment
it is made. Nothing can be re-raised, so nothing needs suppressing — which is why
this repo has no acknowledgment list, and it is now recorded for the right
reason.

## Also corrected

Two other places carried the same framing:

- **The dropped sentence.** *"So an outbox got flagged because SOMEBODY ELSE'S
  commit in the same window touched src/."* The 07-08 doc describes the
  mechanism that makes this possible; it does not establish that this is what
  happened to those particular entries. Removed rather than softened — the
  mechanism quote directly above it already says everything that can be
  supported.
- **The self-test comment.** It said the window approach "flags the innocent
  one." It now says the window cannot tell which commit it is talking about,
  which is the property the test actually demonstrates. The assertion itself is
  unchanged and still passes — only the description of what it proves was wider
  than the code.

## The previous outbox entry was edited, deliberately

`cc-history-boundary-claim-correction-2026-08-10.md` said this claim was "left
as-is for now." That sentence became false the moment this fix landed, so a
superseded note was edited into it pointing here.

Editing a shipped document is normally the failure these corrections exist to
prevent. The distinction: the edit is marked, says what it supersedes, names the
document that replaces it, and the original wording is in git. A stale "left
as-is" would have been a claim nobody checks — the exact thing being corrected.

## Why this keeps happening in one specific place

Three overstated claims in one day, all in the same category: **prose about what
a guard guarantees.** The guards themselves have been fine — every one was
mutation-tested in both directions before shipping, and none has failed.

The repo has `proof-check.mjs`, which compiles every compiler rejection claimed
in the proof docs, precisely because a prose claim about a guard shipped
overstated once before. It works, and it has no reach here: a claim about
tamper-visibility, or about somebody else's incident, is not a compiler claim
and cannot be compiled.

No new mechanism is proposed for this. Inventing one would be the third guard
today written for a problem that was found by a person reading carefully, and
the honest summary is that careful reading is what caught all three. What is
recorded instead is the pattern: **in this repo, the code has been right and the
sentences about the code have been generous.** When those disagree, the sentence
is wrong.

## Verification

| | |
| --- | --- |
| `history-check.mjs --self-test` | 7/7, assertions unchanged |
| audit against real history | boundary intact, 0 governed violations |
| confidence gate | 140/140, rows unchanged at 11 |

No behaviour changed in this commit. Every edit is to a comment or a document.
That is the point: the code was already doing the narrower, correct thing — only
the description of it was too wide.
