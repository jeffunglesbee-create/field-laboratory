# The first wave pays the connection, and every later wave rides it free

**Runs:** [33034815620](https://github.com/jeffunglesbee-create/field-laboratory/actions/runs/33034815620) (02:58Z) and [33076011728](https://github.com/jeffunglesbee-create/field-laboratory/actions/runs/33076011728) (13:19Z). Same two checks red, ten hours and two different slates apart.

```
02:58Z  13 known venue(s), 9 chip(s) filled.  4 timed out at 4000ms
13:19Z   6 known venue(s), 2 chip(s) filled.  4 timed out at 8000ms
```

## The number that names it

`maxInFlight = 4`, and the waves run in sequence.

| run | venues | waves | lost |
|---|---|---|---|
| 33034815620 | 13 | 4 / 4 / 4 / 1 | **4** |
| 33076011728 | 6 | 4 / 2 | **4** |

Exactly one wave's worth, both times, at two different slate sizes. And it is
the FIRST wave: in the six-venue run the later wave of two both answered, inside
a remaining budget of about six seconds, after four requests had just failed at
eight.

Raising the per-request cap from 4s to 8s moved the failures from `4001ms` to
`8000ms` and fixed none of them. A service that is slow does not answer wave 2 in
milliseconds after refusing wave 1 for eight seconds. A **cold connection** does
exactly that: the first requests to a host pay DNS, TCP and TLS, and everything
after them reuses the socket.

This is the third round on this symptom, and STANDARDS Rule 42 is explicit that
the third round is where you stop changing the number and look at what the system
is showing. What it was showing, in both runs, was a wave boundary.

## The change

**`index.html`** — one line in the head:

```html
<link rel="preconnect" href="https://api.open-meteo.com" crossorigin>
```

The browser establishes DNS + TCP + TLS during page load, before any weather
fetch is issued. `crossorigin` is required: the fetches are CORS requests in
anonymous mode, and a preconnected socket opened without it would not be reused
by them.

**`scripts/render-check.mjs`** — the arbiter, so the next run settles this rather
than my reasoning settling it:

```
Request timings (start+duration): 1841+8003ms 1842+8001ms 1843+8000ms 1844+8000ms 9903+118ms 9904+121ms
```

Per-request `startTime` and `duration` for every Open-Meteo resource entry. Start
time separates the waves; duration is what each cost.

`startTime` and `duration` only, deliberately. The connection phases
(`domainLookupStart`, `connectEnd`, `secureConnectionStart`) read **zero** for a
cross-origin resource unless the server sends `Timing-Allow-Origin`, and
Open-Meteo does not. Reporting them would be reporting zeroes as measurements —
the precise failure this session has now corrected three times.

## What the next run will say

- **preconnect worked** → every request short, no wave boundary in the durations,
  22/22.
- **preconnect did not work** → the first four still long and the rest short. The
  cost is real but preconnect is not reaching it, and the next move is to warm
  the connection with a single priming request before the fan-out rather than to
  touch the timeout again.
- **something else entirely** → the durations will not split at the wave
  boundary, and the connection-setup reading was wrong.

The timing line distinguishes all three. Whichever it is, the number is not the
thing to change.

## What was NOT changed

`requestCapMs` stays at 8000 and `slateDeadlineMs` at 14000. Neither has been
shown wrong, and changing them in the same commit as the real fix would make the
next green run unattributable.

`maxInFlight` stays at 4. The bound is not the defect — the defect is that the
first four requests pay for the whole slate, and a smaller bound would make that
worse, not better, by adding waves.

## Local

`check:verify` 80/80 held, `check` 17/17, `check:hard` 17/17, design-tokens
21/21, computed-chrome 13/13, palette 25/25, typography 11/11, clean-source,
unused, docs, workflows.
