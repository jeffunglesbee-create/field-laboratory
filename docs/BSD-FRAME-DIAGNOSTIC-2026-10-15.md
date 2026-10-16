# BSD coordinate frame diagnostic — 2026-10-15

Answers the question left open by Task 0: **does `/bsd/contract` revision
`2026-10-10-1`, verified against an October event, describe the June `wc26`
captures?**

**Partly. One of its three pitch-frame declarations is wrong.**

Sample: 8 matches (`8341`–`8348`), **189 shots**, **11 goals with sequences**,
both teams reported separately. Not one match, not one side.

---

## Result

| field | contract declares | measured | verdict |
|---|---|---|---|
| `shotmap[].pos` | target-goal-relative, perTeam | home med **14.9**, away med **14.1** | **HOLDS** |
| `shotmap[].gm.x` | always 0, not a pitch axis | 189/189 zero | **HOLDS** |
| `incidents[].sequence[].pos` | target-goal-relative, perTeam | home med **87.8**, away med **4.6** | **WRONG** |

`shotmap[].pos` puts both teams low, which is what per-team
target-goal-relative means: distance from the goal you attack, normalized per
side. Home ranges 1.4–54.8 and away 3.4–29.7; the contract's quoted 2.3–30.8
band was one match's range, not a law, and the 54.8 is a halfway-line shot.

`incidents[].sequence[].pos` puts the two teams at **opposite ends**. That is
not per-team normalization — it is **one shared absolute pitch frame**, home
attacking toward x=100 and away toward x=0. Declaring it `perTeam: true` and
`target-goal-relative` is false.

Keeper positions corroborate, taken from the `goal` event that carries them:

```
home goals: shot.x 78.3–96.6 (med 87.8)   gk.x 97.1–99.0 (med 98.8)
away goals: shot.x  4.4–10.9 (med  4.6)   gk.x  0.5– 3.1 (med  1.2)*
```

\* excluding the own goal below.

## Why this matters more than a documentation typo

`shotmap[].pos` and `incidents[].sequence[].pos` are **different frames that
share a key name and a shape**. Mixing them silently mirrors the away team's
geometry — no error, no exception, a plausible wrong answer. Any `float32`
holding "a BSD x coordinate" is ambiguous between them.

This is the hazard the frame-in-the-type requirement was written for, and it is
**already live in the only data available**, not hypothetical.

## The one row that broke the pattern — and what it actually is

`8344` minute 3, away, shot.x 4.6, gk.x **98.9**, against a buildup running
36 → 31.7 → 17.8 → 15.7 → 9.1 → 4.6, i.e. attacking toward x=0.

It is the **only `goal_type: "ownGoal"` in the sample**, and it is the only row
that breaks. 10 of 11 goals are internally consistent.

```
8344 min=  3 is_home=False goal_type=ownGoal  player=E. Skhiri  score=0-1
```

The buildup is five Netherlands players; the credited scorer is Tunisian. So
`is_home` marks the team **credited**, the sequence records the **attacking**
move, and on an own goal those belong to opposite teams — and the `gk`
coordinate lands in the other side's frame.

**An own goal is a frame discontinuity, not noise.** It needs a type-level case.
A decoder that treats `goal_type` as a label and the coordinates as uniform will
mirror exactly these events and nothing will complain.

## Method note — one false result on the way here

The first run reported `MIXED — no single origin explains these captures`. That
was the script's fault: it took `gks[0]`, the first keeper in the sequence, on
the theory that a move starting from the back would record the attacking team's
own keeper. **That theory was wrong** — every sequence carries exactly one `gk`
and it hangs off the `goal` event, so first and last are identical in all 11
rows. Recorded because the fix changed nothing and the real answer came from
`goal_type` instead; a plausible correction that happens to be inert is worth
knowing about.

## The script

Belongs at `scripts/bsd-frame-check.mjs` alongside
`scripts/bsd-coordinate-check.mjs` — chat cannot write `scripts/`, so it is
reproduced here for CC to lift. Inputs are `/bsd/r2/read?key=bsd/wc26/{id}/
{stats,incidents}.json`.

```python
# for each stats.json: collect shotmap[].pos.x and shotmap[].gm.x, split by sh["home"]
# for each incidents.json: for incidents with sequence[], take the last pos.x
#   (the shot) and the gk.x hanging off the goal event, split by i["is_home"]
# report min / median / max per side for each field
#
# target-goal-relative perTeam  => BOTH sides cluster low
# shared absolute frame         => sides are mirror images (~88 vs ~5)
# always exclude or flag goal_type == "ownGoal"
```

---

# 223324 verified — the contract was wrong all along

The October event's own capture survives in the relay repo at
`scripts/fixtures/bsd-223324-coordinates.json` (52,255 bytes), named by the
contract's own `verifier` field. Same diagnostic:

| field | 223324 (October) | wc26 (June) | agree? |
|---|---|---|---|
| `shotmap[].pos.x` home | med **16.5** (7.4–30.8) | med 14.9 | yes |
| `shotmap[].pos.x` away | med **12.0** (2.3–22.8) | med 14.1 | yes |
| `shotmap[].gm.x` | 32/32 zero | 189/189 zero | yes |
| `sequence[]` **away** goal | shot **7.3**, gk **5.4** | shot ~4.6, gk ~1.2 | yes |
| `sequence[]` **home** goal | **none in the capture** | shot ~87.8, gk ~98.8 | — |

**223324 contains exactly one goal with a sequence, and it is an away goal.**

## Why that single goal could never have established the claim

For the **away** side the two candidate frames are **numerically identical**:

- *Shared absolute frame*: away attacks toward x=0, so the shooter reads low and
  the goal being attacked — with its keeper — also sits at x≈0.
- *Per-team target-goal-relative*: x=0 **is** the goal you attack, so the shooter
  reads low and the keeper reads low.

Both predict `shot 7.3, gk 5.4`. The observation cannot discriminate them.

Only a **home** goal separates the two — shared absolute predicts ~88/~99,
per-team predicts ~12/~2 — and 223324 has none.

**So the contract did not describe a different October frame. It generalized a
`perTeam: true` claim from a sample structurally incapable of testing it.** The
wc26 home goals are the first data that could, and they say shared absolute.

This is Rule 91 (SAMPLE-COVERAGE-A), and it is the same shape as this repo's own
`check:nav` note — *both committed captures are single-sport, so grouping "works"
on them in exactly the shape a broken grouping would also produce.*

## Correcting this document's own recommendation

An earlier revision of this file said *"one October capture in R2 would settle
it, and there is none."* **That was wrong.** The October capture exists, it is
now read, and it settles nothing by itself — because the discriminating case is
a **home goal sequence**, not a date.

The requirement is therefore: **capture any match containing a home goal with a
sequence, and re-run this diagnostic.** Date and competition are irrelevant.
Recorded rather than silently amended, because the wrong version of this
requirement would have sent the capture-path work after the wrong thing.

## Required before any type is written

1. **`/bsd/contract`'s `frames` block is wrong for
   `incidents[].sequence[].pos`** — not stale, not October-specific, wrong since
   it was written. Correct the relay contract, or have the decoder carry the
   measured frame and say why.
2. The discriminating evidence is **home goal sequences**. Any new capture used
   to re-verify must contain one, or it proves nothing — the same way 223324
   proved nothing.
3. `ownGoal` gets its own case before any coordinate from a goal sequence is
   consumed.

## One tool limitation found while checking

`/bsd/r2/list` **ignores a `limit` parameter**, returns 100 keys, and exposes no
cursor. It does report `truncated: true`, which is the honest half.

So "R2 holds `wc26` only" is **supported but not proven**: R2 list is lexical and
all 100 first keys are `bsd/wc26/`, which rules out anything sorting earlier
(`bsd/epl/`, `bsd/mls/`). It cannot rule out keys sorting after `bsd/wc26/8...`.
State it that way.
