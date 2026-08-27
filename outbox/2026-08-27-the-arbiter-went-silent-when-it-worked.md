# The arbiter went silent exactly when it worked

Run [33076464112](https://github.com/jeffunglesbee-create/field-laboratory/actions/runs/33076464112) passed 22/22 on `f7c0248`. The preconnect fix works.

I could not prove it from the thing I built to prove it.

## What happened

The previous commit added per-request Open-Meteo timings to `render-check.mjs`
and said, in its own message, "so the NEXT run settles this rather than my
reasoning settling it." The timings went into the **failure detail string** of
the chip assertion. `createChecks` prints a detail only when a check fails.

So the fix worked, the check passed, and the measurement printed nothing.

What was left to reason from was the step DURATION: 13:24:12 → 13:24:14, two
seconds, against 23 seconds on the failing run and against a wave-1 cost of at
least 8 seconds before the change. That is strong — the whole slate now finishes
faster than one wave used to — but it is an inference from a clock, not the
per-request measurement that was supposed to arbitrate.

## Why this one is worth writing down

This is the silent-success shape, committed inside the instrument built to catch
it. The session had already corrected it three times:

1. `EveryFetchFailed` carried a count and discarded the reasons.
2. `openMeteoDown` collapsed 429, 503 and a connection error into one bit.
3. The zero-allocation check measured V8 warm-up and called it allocation.

Each was a value whose name and its measurement disagreed. This one is narrower
and worse: the measurement was correct, and it was wired to a code path that
only executes when the measurement would say something bad. An instrument that
reports only failures cannot confirm a fix — it can only ever tell you the fix
did not work.

The collection was already unconditional. Only the printing was gated. One line.

## The change

```js
console.log(`open-meteo (start+duration): ${wxTiming || 'no request recorded'}\n`)
```

Printed on every live run, beside the URL and decode-status diagnostics. The next
live run states, in numbers, whether the requests are uniformly fast or still
split at the wave boundary — whether it passes or fails.

## What this does NOT change

The preconnect fix stands and is not re-litigated. `requestCapMs`,
`slateDeadlineMs` and `maxInFlight` are untouched, as in the previous commit,
so the numbers the next run prints describe the same configuration that just
went green.

## Local

`check` 17/17, `check:hard` 17/17, workflows, clean-source, docs. The pinned
render checks do not exercise this line — `?data=` sets `pinned`, and the whole
weather block is skipped — so its first real output will be CI's.
