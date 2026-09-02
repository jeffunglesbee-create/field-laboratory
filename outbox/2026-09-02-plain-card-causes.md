# The thirteen that stay plain — measuring the cause before proposing a fix

65 of 78 cards tint. The thirteen that do not were reported as three facts, and
only one of the three was ever measured.

## The two claims that need checking

**"ESPN does not serve the club" (7 cards).** The alternate-colour probe reported
CFB at **exactly 50 teams**. That is not a fact about college football — it is
ESPN's default page size, and no call in this repo passes `limit`. If that is the
cause, six of the thirteen are one query parameter away and none of them is a
coverage limit at all.

**"No combination of published colours works" (5 cards).** Stated as though the
source were beyond question. This session already established it is not: ESPN's
`color` for European football is the **kit**, not the club — Bundesliga came back
with nine colours across thirty-four entries. "Angers and Auxerre carry the same
two colours" and "ESPN happens to describe both by the same kit" are different
claims with opposite remedies, and nothing has separated them.

The third fact — `Los Angeles Football Club` shares no token with ESPN's `LAFC` —
is measured and settled.

## What the probe measures

1. **`?limit=900` against the bare call, per league.** `pageVerdict` refuses to
   read a count on its own: a default page size and a league that genuinely has
   fifty teams are identical in a count, and only asking for more separates them.
2. **The failing condition per card**, which is the split that decides the
   remedy:

   | cause | what it means | remedy |
   |---|---|---|
   | `no-colours` | a side resolved to nothing | coverage |
   | `one-unreadable` / `both-unreadable` | every colour a side has derives a tint that does not read as a colour on this page | a fact about the **source** |
   | `too-close` | both sides have a usable colour and they still collide | a fact about the **fixture**; the rule is working |

   A side whose every colour is unusable fails no matter who it plays. Two sides
   that each have a usable colour but cannot be told apart is a different thing
   entirely, and only the second is the rule doing its job.
3. **Whether ESPN serves any colour for CFL**, which the alternates table hinted
   at — 9 teams, 0 with a distinct alternate — without saying whether that is one
   colour each or none.

## Teeth

14 self-tests. Five mutations, each dropping the count:

| mutation | result |
|---|---|
| pagination never detected | 13/14 |
| `one-unreadable` collapsed | 13/14 |
| readability ignored when judging a collision | 11/14 |
| `no-colours` collapsed | 13/14 |
| `both-unreadable` collapsed | 13/14 |

The first pass at this table was worthless and said so only because the harness
printed a Python error: three of the four `sed`-style replacements never applied,
and the unmutated file honestly reported 14/14 three times. The runner now
asserts that the mutation actually landed before believing the count — the same
defect this session keeps finding, an instrument reporting on something other
than what it names.

## Not proposed here

No fix is committed with this. The point of the probe is that three of the four
remedies differ depending on what it finds, and choosing between them first is
how the wrong one ships.
