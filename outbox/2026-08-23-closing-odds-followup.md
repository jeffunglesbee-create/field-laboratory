# The staged item that had already passed — 2026-08-23

Covers the `cc-cmd-followup.mjs` registration of
`CC-CMD-2026-08-21-closing-odds-capture`'s surviving ask.

## What was actually wrong

The ask read *"staged, blocked by a soccer slate running after `bb04fc8`"*. That
was true on 08-21. It was false by 08-22, and on 08-23 the relay's own probe had
measured the answer at 06:36:

```
EPL       5 played, 4 with opening =  80.0%   baseline 23.1%
La Liga   3 played, 2 with opening =  66.7%   baseline 11.8%
soccer_opening_coverage: PASS — improved for EPL
```

Nobody read it. **A Rule 74 staged item whose unblock condition is a future event
goes stale silently** — nothing re-evaluates whether the event happened, so the
only correction path is a human noticing. That is the defect, not the odds.

## The instrument I nearly built, and why it was wrong

The first plan was to split the drift sentinel's `both/notseq/moved/unmoved`
aggregate by sport, so a soccer entry could be read directly.

The sentinel reads **one day's slate**. Coverage is a rate over a population —
a table question. `check:sport-vocabulary` shipped *the same morning* for exactly
this reason: the drift sentinel could only discover an unmodelled competition on
the day it played, and the fix was to ask the games table instead. Proposing
slate-based measurement again, one item later, is the same error with a different
subject.

Worse, the measurement already existed and is better than the split would have
been. `verify-staged-items.mjs` check 2 is past-dates-only, per-sport, compared
against the measured pre-fix baseline, with a `min_games_for_rate: 4` floor that
flags `La Liga (2/3)` rather than reporting 66.7% as settled. A laboratory copy
would have had none of that and would have been free to disagree with it.

## What shipped

Registration in `scripts/cc-cmd-followup.mjs` — the mechanism this repo already
has for exactly this, which re-evaluates every sentinel run and prints
landed / not-yet per CC-CMD.

Three states, because two would misreport:

| state | meaning |
|---|---|
| `true` | a soccer game carries an opening line — the ask holds |
| `false` | soccer served, none carries one — the pre-fix condition returning |
| `null` | no soccer in the payload — an off-day proves nothing |

The third is load-bearing. Without it every Monday would report the fix as
regressed, and a probe that cries wolf weekly is one people stop reading — the
same reasoning `staged-verification.yml` uses for PENDING.

**Six self-tests**, none of which the existing 17 covered: the landed case, the
pre-fix case, the off-day, the empty payload, unparseable `opening_odds` not
counting as coverage, and partial coverage counting as landed (EPL measured 4 of
5, not 5 of 5 — a predicate demanding totality would read a real success as
failure). 23/23.

## Division of authority

The relay's probe stays authoritative for the **rate** and its baseline
comparison. This answers the narrower daily question — is the relay still
capturing soccer opening lines — and turns `false` the day it stops. Two probes,
one question each, neither duplicating the other.

## Open

`La Liga (2/3)` is below the relay probe's own min-games floor. It is not
evidence of a problem; it is the probe correctly declining to certify a rate on
three fixtures. It settles itself as La Liga plays more matchdays.
