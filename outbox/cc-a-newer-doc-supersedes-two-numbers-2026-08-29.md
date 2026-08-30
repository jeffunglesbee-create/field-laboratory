# A June doc supersedes the May ones, and fixes a second borrowed number

**Date:** 2026-08-29
**Scope:** `index.html`, `scripts/computed-chrome-check.mjs`
**Doc:** *FIELD — Viewport Artifact v4 Build Brief*, Drive
`1OZItVH-7beD7wEpizwSie3mb80UtiepHIInGEZh3ALU`, **June 12 2026**.

## It carries its own precedence rule

Under CONSTRAINTS:

> Past dates never take precedence over more recent dates

This is three weeks newer than the five May documents read before it, and it
uses that precedence explicitly.

## 1. The Barlow question is settled, and I was right for the wrong reason

> Chakra Petch is THE identity font (Jun 12 decision supersedes all prior
> Barlow/Playfair references)

The *Viewport Style Guide v1.0* (May 22) specifies section identifiers in Barlow
at `.88rem` / `.85rem` / `.80rem` / `.75rem` by viewport. I declined to copy
those values, reasoning that "copying `.88rem` into a Chakra Petch / DM Sans
desk would be taking a number instead of deriving one."

That judgement was correct and the reason was incomplete. **The entire Barlow
typography section is superseded**, by name, by a newer decision — so those
figures were not merely ill-fitting, they were retired. Reading five documents
and stopping would have left me declining a spec on taste rather than on
precedence.

The same brief mandates what this repo already has:

> Typography: Chakra Petch (identity) + DM Sans (body). NO others.

Already asserted, and no change needed: `typography-check.mjs` carries *"there
are exactly two faces"*, four roles in Chakra Petch, two in DM Sans. 11/11.

## 2. The press transform — a second borrowed number

> INTERACTION ARCHITECTURE … **Touch feedback: `scale(0.98)` on `:active`**

The `:active` rules added earlier today used `translateY(1px)`, taken from
`taste.md`'s *"press feedback: `scale(0.97)` or `translateY(1px)`"*.

Identical shape to the 65ch reading lock found two documents ago: **a
third-party rule of thumb offered a range, and this project had already picked a
point inside it.** Both times I reached for the skill's number without asking
whether FIELD had its own.

Now `scale(0.98)`, cited.

## The check now grades the value, not the presence

`computed-chrome-check.mjs` asserted *"every pressable control acknowledges a
press"* by counting `:active` rules. That is the right question and only half of
it — a rule can exist and press by the wrong amount.

Teeth, by reverting the value only and rebuilding:

```
PASS  every pressable control acknowledges a press      <- still passes
FAIL  the press transform is the spec's scale(0.98)
15/16 checks passed
```

**The presence assertion passed on the wrong value.** That is the whole argument
for the second check: counting that a thing exists and checking that it is right
are different questions, and this repo had only been asking the first.

16/16 restored.

## Not applicable: the nine named states

The brief lists VIBE-A's nine — CRUNCH TIME, ELIMINATION, BLOOD GAME, ALONE ON
SCREEN, VOLATILE, MISSION, GRINDING, MUTED, AMNESTY. These are jubilant-bassoon's
drama-state vocabulary, and they are downstream of `dramaScoreLive()`.

The laboratory implements the **five-word** semantic vocabulary instead, and
that is not an omission: ADR-002 / Rule 47 is why. A named state derived from a
composite drama score is precisely the class of value this side does not
compute. Recorded so a later reader does not file it as a gap.

## Verify

```
npm run check:computed-chrome   # 16/16, including the spec'd press value
npm run check:typography        # 11/11, two faces, unchanged
```
