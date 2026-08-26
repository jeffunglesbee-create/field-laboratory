# "Two consecutive runs" was not two observations

**2026-08-26 13:33Z.** Check-in fired to promote
`CC-CMD-2026-08-21-closing-odds-capture (surviving ask)` if it had read LANDED
twice. It had. **Not promoted.**

## What the criterion said and what it measured

I set the bar last night: promote on **two consecutive drift-sentinel runs**
reading LANDED, because the ask's own note describes a daily coverage reading
rather than a one-time landing, and promoting a liveness check to fatal on one
sample is how a build goes red for a reason nobody can act on.

Both runs read LANDED:

```
run 51   2026-08-26 02:42Z   LANDED   probe: /context/date/2026-08-25
run 52   2026-08-26 13:04Z   LANDED   probe: /context/date/2026-08-25
```

**The same slate, twice.** `cc-cmd-followup.mjs` probes
`/context/date/${yesterdayUTC()}`, the sentinel runs at ~02:30Z and ~12:50Z, and
both of those resolve to the same yesterday:

```
2026-08-26T02:42Z  ->  probes 2026-08-25
2026-08-26T13:04Z  ->  probes 2026-08-25
2026-08-27T02:35Z  ->  probes 2026-08-26   <- the next independent sample
```

`opening_odds` freeze at capture. A second read of a frozen snapshot cannot
disagree with the first unless the archive was rewritten between them. So two
runs is **one observation**, and the criterion is satisfied by evidence it was
never meant to accept.

Same defect class as everything else this session: **a criterion whose name and
whose measurement disagree.** "Two consecutive runs" sounds like two samples and
counts two reads.

## The criterion, corrected

Promotion needs **two distinct probe dates**, not two runs. The next
independent sample is the 2026-08-27 ~02:30Z run, probing 2026-08-25 → 2026-08-26.

Recorded here rather than fixed in code: the criterion lives in a scheduled
check-in, not in a script, so there is nothing to gate. The check-in has been
rescheduled with the corrected wording.

## An apparent contradiction that is not one

Run 51 reported `both=9` games carrying open and close prices; run 52 reported
`both=0`. Two different answers about odds coverage in eleven hours.

They are answers to different days. The sentinel's own drift probe reads
**today's** slate — run 51 logged `2026-08-25`, run 52 logged `2026-08-26` — while
`cc-cmd-followup` reads **yesterday's**, which stayed at `2026-08-25` for both.
One workflow, two date resolutions, both correct for the question they ask. The
sport counts differ for the same reason (42 games vs 30).

Worth writing down because it reads as a contradiction on a first pass, and the
next session to look will pass over it the same way.

## Unblock criteria (Rule 74)

- **Blocked until 2026-08-27 ~02:30Z**, on nothing but the clock. Verify: the
  drift-sentinel run at that time probes `/context/date/2026-08-26` — a date
  neither run 51 nor 52 saw — and prints its own verdict for the ask.
- **Promote only if that run also reads LANDED.** Anything else: record the
  reading, leave it open. That is the check earning its keep.
