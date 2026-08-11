# The gate failed a commit because the day rolled over mid-run — 2026-08-11

Asked to perform the checks I had listed as pending, and they surfaced a real
failure I had reported as green.

## The claim I made without checking

I said "`main` at `73ffdd0`, gate 420/420" several times. That was my LOCAL run.
**CI run `31456294086` on that commit failed**, and I never looked.

```
410/420 points = 98/100
1 FAILING ROW(S). Do not commit.
  - this session wrote its outbox (10 pts)
```

Exactly the shape the gate's subtraction exists for: a claim of done with no
artifact behind it. The local run was an artifact for my desk, not for main.

## Why it failed, which is not what it looks like

```
run started      2026-08-11T03:44:11Z  =  2026-08-10 23:44 ET
row evaluated    2026-08-11T04:01:43Z  =  2026-08-11 00:01 ET
```

**The day rolled over during the run.** `outboxToday` called `fieldDay()` at
row-evaluation time, seventeen minutes after the run began, and asked about the
11th. Every outbox file was dated the 10th — correct for the day the run started.

The row was right about its rule and wrong about which day it was asking about.
A gate that answers differently depending on how long its earlier rows took is
not deciding about the work.

**Fixed** with the discipline this repo has now applied three times —
`gameStateAt`, `zone-check`'s `NOW`, and now `GATE_DAY`: capture the instant
once, then be pure.

## The detector that should have caught it, and didn't

`row-confidence` flags scripts that read the clock. It scored the outbox row 100
anyway, for two independent reasons:

1. **It never scanned `gate-checks.mjs`.** It looks at the scripts a row shells
   out to; the outbox and history rows have no script — their logic is a local
   function. Those rows were scanned against an EMPTY file list and scored full
   marks for determinism without anything being read.

2. **It only saw literal `new Date()`.** `fieldDay()` is an indirection, so even
   with the file in scope the call was invisible.

Both fixed, and the fix is verified by reverting: with `const today = fieldDay()`
restored, six rows drop and the scan names `gate-checks.mjs: reads the clock 2x`.
Mutation `gate-day-per-row` makes that permanent.

The rule is now about shape rather than vocabulary — *a clock read must be
captured into a top-level constant* — which let `zone-check` keep the one call
it genuinely needs. `fieldToday()` takes no argument, so any test of it reads the
clock; that is inherent to the thing under test. What was avoidable was calling
it twice with the comparison read separately, so both are captured once, adjacent.

## What the runner confirmed

Run `31501321990` on `771cf8e`, **all 30 steps success**, including every step I
had explicitly declined to claim:

| step | |
| --- | --- |
| 13 Drama sparkline | success |
| 25 No value is written without being read back | success |
| 26 Every gate row has teeth | success |
| 30 Pick shape — transcription vs the real relay | success |

Step 30 is the one that had been pending longest. The hand-transcribed
`data/pick-2026-07-07.json` was compared field-by-field against the live relay:

```
PASS  TRANSCRIPTION: the leader matches the live response
PASS  TRANSCRIPTION: the ranked list is the same length
PASS  TRANSCRIPTION: every ranked game id matches, in order
PASS  TRANSCRIPTION: the leader's reasons match exactly
PASS  TRANSCRIPTION: the three-way tie is real, not a transcription artefact
PASS  TRANSCRIPTION: the brief is on the board in both
```

**The three-way tie is real.** `Leadership`, and the panel line "level with 2
others on the same signals", rest on a property of the live data rather than on
a copying error — which is what that assertion was written to find out.
