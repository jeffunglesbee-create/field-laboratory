# Comerica Park is in Detroit — 2026-08-11

Jeff asked me to confirm CI was green on `6874f89`. It was not.

Run 31543404607: **failure**.

```
PASS  Open-Meteo answers 200
PASS  the transcribed decoder reads the REAL response
PASS  temperature is in a possible Fahrenheit range
PASS  an out-of-range latitude is NOT answered 200
PASS  ...and the good and bad requests differ
FAIL  every venue resolves to the IANA zone it declares
      → Comerica Park: declared America/New_York, resolved America/Detroit
PASS  a sign-flipped coordinate does NOT resolve to the declared zone
10/11
```

## What that actually is

The planet check ran against Open-Meteo for the first time and **found a real
error on its first execution.**

The coordinates are correct. Comerica Park is in Detroit, and `America/Detroit`
is a distinct IANA zone from `America/New_York` — same UTC offset, different DST
history, because Michigan has its own. My *declaration* was wrong.

So the transcription error landed in the field I had just added to catch
transcription errors. I hand-wrote 35 zone strings and got one wrong, which is
the exact failure mode the field exists for, arriving in the field itself.

And it caught it in the **subtlest form the check can detect**. A swapped lat/lon
or a sign flip moves a venue oceans away; this one is two zones that agree on the
clock every second of the year and differ only in name and history. Nothing about
the rendered weather would have looked wrong. No user would ever have seen it.

That is worth more than the ten passes above it. A guard that only catches the
loud errors is a guard nobody needed.

## Both directions, on the real service

The same run recorded the other half working:

- `an out-of-range latitude is NOT answered 200` — Open-Meteo's real refusal, not
  a fixture agreeing with my reading of the docs.
- `a sign-flipped coordinate does NOT resolve to the declared zone` — the
  deliberately wrong Fenway, proving the zone comparison can fail.

The second one matters most: without it, `every venue resolves to the zone it
declares` passing would have meant only that the loop ran.

## What this says about the previous entry

`cc-checked-against-the-planet` was docked four with:

> the planet check has not itself run against Open-Meteo … the run that
> exercises it is the one this commit triggers.

That docking was correct and the run cashed it. The check works, the automation
works, and the first thing it did was disagree with its author.

CONFIDENCE: 97.

Artifacts: run 31543404607's log, quoted above in full for the weather step;
`node build/VerifyMain.js` 32/32 after the fix; the gate.

Docked three: the fix itself — `America/Detroit` — has not met the service. It is
the same one-line class of change the check exists to verify, and the run that
verifies it is the one this commit triggers. The difference from every previous
version of this sentence is that the check has now been shown to catch a wrong
value in this exact field, so the docking is small rather than open-ended.
