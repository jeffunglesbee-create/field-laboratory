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

## Required before any type is written

1. **Do not trust `/bsd/contract`'s `frames` block for
   `incidents[].sequence[].pos`.** It is measurably wrong on these captures.
   Either the relay contract is corrected, or the decoder carries the measured
   frame and says why.
2. The contract was verified against **event 223324 (October)**; these are
   **June** captures. It is still unestablished whether the October event uses a
   *different* frame or whether the contract was simply wrong about this field
   all along. **Two different facts.** One October capture in R2 would settle it,
   and there is none.
3. `ownGoal` gets its own case before any coordinate from a goal sequence is
   consumed.
