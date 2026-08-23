# Ligue 1 and Serie A modelled — 2026-08-23

**Branch:** main · **Alarm:** `drift-sentinel` `unmodelled-sport`, failing every
run since the sports appeared

## What was red, and why it was not what I first said

`drift-sentinel` has been failing on schedule for days. My first reading of it
was wrong: I saw `games with both prices: 41, not sequenced: 41` in the log tail
and attributed the failure to the odds sequencing — the same 41 rows the relay
traced to a third `closing_odds` writer on 2026-08-22.

That step does not fail the run. It files a self-closing issue (#2) and exits 0,
by design: "Closes itself on the first run where any game shows a real sequence."

The failure comes from `Fail if the sentinel failed`, gated on
`steps.sentinel.outputs.code != '0'`, and `drift-check.mjs` exits 1 on
`unmodelled.length`. `outbox/drift-log.md` names it directly:

```
2026-08-23 02:41 | 2026-08-22 | 75 | unmodelled-sport | 0 | unmodelled: Ligue 1, Serie A
```

The relay began serving Ligue 1 on 2026-08-21 and Serie A on 2026-08-22. The
laboratory's `Sport` registry modelled neither, so both rendered under
"UNMODELLED SPORT" and the sentinel did exactly what it is built to do.

`Unrecognised` is not a fallback here — `src/Desk.fs` says so in its own words:
"a real state, rendered visibly and reported by the drift sentinel, so an
unmodelled sport shows up as an alarm within a day rather than being quietly
absorbed. The fix when it fires is to add the case." Model-on-observation is the
established pattern; La Liga and EPL were both added this way after the sentinel
saw them.

## The convention, and why it is not a guess

`Matchup = HomeVersusAway`, matching MLS, EFL Cup, La Liga and EPL — every
soccer entry in the registry. Applying the SOCCER convention to a soccer
competition is not the AFL mistake; that was applying an AMERICAN convention to
a non-American sport.

What did need evidence is whether the relay's own `home`/`away` is correct for
these two, since a transposed side is what the AFL incident actually produced.
Read off live briefs, 2026-08-22, `/archive/query`:

- **Ligue 1** — "Lyon secured a 2-0 win at Stadium Municipal de Toulouse", with
  "Toulouse … +145 home underdogs" and "Lyon … +185 away odds". Home is the
  ground's owner and the odds agree.
- **Serie A** — "Cagliari opened their season … at Ennio Tardini, holding
  Parma", Cagliari named "the visitors", Ennio Tardini being Parma's ground. And
  "Napoli … 2-0 win against Genoa at Stadio Luigi Ferraris", Ferraris being
  Genoa's. Home is the ground's owner in both.

Two independent fixtures per competition, both agreeing. The sides are not
transposed, so the desk can name them.

## Labels matched verbatim, no case fold

`"Ligue 1"` and `"Serie A"` with the space, matched exactly, for the same reason
`"EFL Cup"` and `"La Liga"` are. EPL carries `| "EPL" | "epl"` because both
spellings have been observed reaching the archive; no lowercase slug for these
two has been. Accepting a spelling that has never been served is how a
normaliser quietly merges two sports.

## Verification

Not run here. `check:sports` needs `build/Desk.js`, which needs Fable, which
needs dotnet — absent in this sandbox. CLAUDE.md is explicit that a runner is
the answer rather than a skipped check, so `verify` builds and runs it on this
push.

What was checked locally: the three edit sites are the only ones. `Sport.EPL`
appears in exactly `src/Desk.fs` — the union, the `sportMeta` registry, and
`sportOfString` — and no script or proof doc enumerates the union, so nothing
else has to learn about a new case. The compiler enforces the rest: a case added
without a registry row is FS0025 at build time, which is the property the type
exists for.

## Expected result

`unmodelled: Ligue 1, Serie A` clears and `drift-sentinel` returns to green.

Issue #2 (`closing_odds is not a closing line`) stays open and should. It is the
relay's 41 historical rows from the pre-fix writer, it is not what fails this
workflow, and it closes itself on the first run where any game shows a real
sequence.
