# The soccer draw price landed, and nobody had to go and look

**2026-08-26.** `CC-CMD-2026-08-23-soccer-three-way-odds` closed on its own
artifact.

## What happened without a human in the loop

```
drift-sentinel run 32923712900, 2026-08-26T02:42:51Z
probing /context/date/2026-08-25

  ##[notice]LANDED CC-CMD-2026-08-23-soccer-three-way-odds:
           project the draw price into opening_odds.moneyline for soccer markets
```

The relay adapter shipped 2026-08-24 (`5a2bacc`, deploy 874). The follow-up
reported it two days later, on the first slate that could possibly show it, with
no session watching.

## Why the timing was not a delay

`opening_odds` freeze at capture — roughly 10:01Z on the game date — so a row
written before the deploy can never gain a draw. The sentinel probes
`/context/date/${yesterdayUTC()}`, which means:

| run | probes | verdict | why |
|---|---|---|---|
| #46, 2026-08-24 13:02Z | 08-23 | not observable | captured pre-deploy |
| #47, 2026-08-24 23:21Z | 08-23 | not observable | captured pre-deploy |
| #51, 2026-08-26 02:42Z | **08-25** | **LANDED** | first post-deploy capture |

Neither earlier run was a failure. They were the ask not yet being observable,
and the predicate reported exactly that rather than "false" — the three-state
discipline earning its keep on a real timeline.

The 08-25 slate carried EFL Cup 17, UEFA Champions League Qualifying 3, EFL
Trophy 2, La Liga 1, MLS 1. Plenty of soccer, all of it post-deploy.

## Promoted, which changes what a false reading means

Moved from `ASKS` to `LANDED` in `scripts/cc-cmd-followup.mjs`. That is not
bookkeeping — the two lists have opposite failure semantics, and the file says so
in its own words:

> AN OPEN ASK THAT HAS NOT LANDED IS NOT FATAL. It is someone else's backlog, and
> turning it into a red build here is the pressure that gets a check deleted.
>
> A LANDED ASK THAT STOPS HOLDING IS FATAL. It is a regression against a fact
> this repository was told it could rely on.

`winProbability` renders a three-way market. A soccer moneyline that stops
carrying a draw sends it back to `ThreeWayDrawMissing` and the card to "no draw
price served" — so it is now fatal, and `null` is preserved for a slate with no
soccer moneyline at all. An off-day is not a regression.

## A defect the promotion exposed

The self-test looked the ask up with `ASKS.find(...)`. Promoting it to `LANDED`
made that return `undefined`, and the three draw assertions crashed —
`Cannot read properties of undefined (reading 'landed')`.

Worse than the crash is what it implies: had the lookup been written to fail
soft, promotion would have **silently stopped exercising the entry** at the exact
moment its failure became fatal. The predicate is `landed` in one list and
`holds` in the other; the question they answer is identical.

Now looked up across both lists. The three assertions still run, and they run
against whichever list the entry lives in.

## What is still open

`CC-CMD-2026-08-21-closing-odds-capture (surviving ask)` also read LANDED on this
run, and the sentinel printed the same "move it to LANDED" notice for it. It was
**not** promoted, deliberately: its own note describes it as a daily coverage
reading — "reads LANDED while any soccer game still carries an opening line, and
turns false if that stops" — not a one-time landing. Promoting a liveness check
to fatal on a single observation is how a build goes red for a reason nobody can
act on. It needs a second consecutive observation first.

## Unblock criteria (Rule 74)

- **Closed:** the soccer three-way ask. Artifact above, promoted, self-test
  follows it across lists.
- **Open, blocked on one more run:** promote `closing-odds-capture` once the
  next sentinel run also reads LANDED. Verify: two consecutive runs in the
  drift-sentinel log, both showing `LANDED CC-CMD-2026-08-21-closing-odds-capture`.
- **Not this ask's problem:** run 51 exited 1 on `favourite-mismatch` — two MLB
  rows, `-117/109 H 1.5/-1.5` and `-124/103 H 1.5/-1.5`. That is the pattern the
  spread-price capture was built to adjudicate, and it stays unadjudicable until
  a post-deploy spread carries prices.
