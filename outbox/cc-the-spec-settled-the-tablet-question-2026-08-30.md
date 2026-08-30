# The spec settled the tablet question, and caught two violations on the way

**Date:** 2026-08-30
**Scope:** `scripts/viewport-overflow-check.mjs`

I ended the last entry asking a taste question — does one card per row at 834
read worse than the 36.7ch it replaced? — and it was the wrong question to ask a
human. The specification answers it.

## The matrix pins the card grid

"FIELD — Viewport Consistency Specification"
(Drive `1jvQw0uS3TR_pblNh7TCUxjsH22MN8IJt_o_yPvbuJ30`, May 24 2026, DEFINITIVE),
Feature Visibility Matrix:

```
Game cards    P1   P2   P3   L1   L2   T1   T2   D1..U1
              1col 1col 1col 1col 2col 1col 1col LEFT
```

**P1, P2, P3, L1 and L2 transfer.** Each is a statement about how much width a
card needs. L1's own section: *"No special grid — phone is too narrow for
2-column at this width."* L2's: two columns are *"the key landscape upgrade."*
Neither depends on a selector this repo lacks.

**T1 and T2 do not.** iPad is one column in FIELD because the right half of the
screen is the ambient panel — *"left pane ~430px + Ambient panel ~390px"*. This
repo has no ambient panel, so a single column there would buy nothing and cost
half the slate. **The tablet question therefore has no spec answer, and the
laboratory's 1 column at 820 is not a violation.**

`D1..U1` read `LEFT`, naming FIELD's three-column desktop product. Not a column
count.

## The old floor was violating two of them

The check left L1 and L2 as `cols: null`. Pinning them and reverting the grid
floor to 260px:

```
L1  phone-landscape       667×375   2 column(s), spec says 1
L2  phone-landscape-wide  932×430   3 column(s), spec says 2
```

So `minmax(260px, 1fr)` had been breaking **both** landscape contracts, for an
unknown length of time, with every render check passing throughout.
`min(400px, 100%)` fixed both — as a side effect of a change made for reading
measure, by someone who had not looked at this row.

That is the kind of accidental correctness that goes back out again unnoticed,
so it is pinned now rather than enjoyed. Teeth proven by the mutation above:
restoring the old floor fails the check 1/2.

## The 44.3ch at 1440 is accepted, not chased

Both wide viewports land just under taste.md's 45ch floor — 44.3 at 1440, 44.8
at 1920 — because `auto-fill` spends extra width on another column rather than
on measure.

Not being fixed, for three reasons:

1. FIELD's own number is a **maximum**: *"P4 lock: CENTRE reading width max
   65ch"* (Complete Feature × Viewport Audit, DEFINITIVE). 44.3 respects it. The
   45 floor is a third-party rule of thumb, and this project's own numbers have
   already beaten taste.md's twice this session.
2. The gap is **0.7ch and 0.2ch** — under 2%.
3. Closing it means capping the grid's width, which cuts a 1440px monitor to two
   columns. That trades a measurable 2% against seeing the slate, which is what
   the grid is for.

## Verified

```
node scripts/viewport-overflow-check.mjs --self-test    6/6
npm run check:viewport-overflow                         2/2  (10 states, 0 overflow)
  mutation: grid floor back to 260px                    1/2  (L1 and L2 both fail)
```
