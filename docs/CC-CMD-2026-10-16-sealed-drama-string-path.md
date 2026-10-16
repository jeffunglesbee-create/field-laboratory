# Claude Code Command — the drama seals print their numbers through `%A`

**Branch:** main — commit directly, do not create a feature branch or PR
**Repo:** field-laboratory
**Filed:** 2026-10-16, by CC, found while building empowerment Task 3 (Second Wind)
**Confidence gate:** `npm run gate` must score >= 95 before any commit
**Status:** FILED, not started.

## Why

`docs/AMNESTY-PROOF.md` says "`formatDramaPeak` is the only path from a drama
score to a string in the program". That is false under Fable 5.13, measured.

`SealedDrama`, `DramaBar` and `SealedArc` in `src/Desk.fs` are single-case
unions with private constructors. Private stops a pattern match outside the
module; it does not change what the value prints. Fable's default union
`toString` prints the case name and its fields, and `sprintf "%A"`, `string`,
`%O` and string interpolation all reach it. None of them needs the
`AmnestyZone` witness, so a live branch can print the peak.

**Measured 2026-10-16.** A throwaway module compiled after `VerifyMain.fs` in a
copy of the tree (`dotnet fable`, Fable 5.13), decoding the committed captures
`data/context-2026-05-15.json` and `data/games-2026-08-09.json` with
`decodePayload`, printing each game's `DramaPeak` and the first sparkline bar
of its `DramaArc`, then run with node:

```
data/context-2026-05-15.json | sprintf %A of the SealedDrama: SealedDrama 53
data/context-2026-05-15.json | string of the SealedDrama: SealedDrama 53
data/context-2026-05-15.json | sprintf %O of the SealedDrama: SealedDrama 53
data/context-2026-05-15.json | interpolated SealedDrama: SealedDrama 53
data/context-2026-05-15.json | sprintf %A of a DramaBar: DramaBar 15
data/context-2026-05-15.json | sprintf %A of the SealedArc: SealedArc ([15; 15; 36; 53])
data/context-2026-05-15.json | sprintf %A of the SealedDrama: SealedDrama 37
data/games-2026-08-09.json | sprintf %A of the SealedDrama: SealedDrama 81
```

No current code takes this path; the compile proofs in `docs/AMNESTY-PROOF.md`
still hold for what they claim (no unsealing pattern match, no formatter call
without the witness). What is false is the sentence that says the formatter is
the only way. `Verify.fs`'s `shown` prints every check input with `%A`, so a
future Suite row whose input is a `Game` would print a live game's peak on the
Verify tab.

## Probe block (run first, against HEAD)

```bash
git log --oneline -5
grep -n "type SealedDrama\|type SealedArc\|type DramaBar\|formatDramaPeak. is the only path" src/Desk.fs docs/AMNESTY-PROOF.md
grep -n "override" src/Desk.fs | head
```

## Task

1. Give `SealedDrama`, `SealedArc` and `DramaBar` a `ToString` override that
   prints the case name and no number, or move each payload behind a closure so
   no default formatter can reach it. Choose by measuring both under Fable and
   under .NET (`dotnet build` plus a throwaway test), and record which hosts
   each one holds on: Fable's `toString` honours an override; whether
   FSharp.Core's `%A` does on .NET is unmeasured here.
2. Add Suite rows, inputs raw (JSON text from the committed captures), that
   decode a payload and assert `sprintf "%A"`, `string` and interpolation of
   the peak, a bar and the arc contain no digit of the value. Break each on
   purpose (Rule 90): delete the override, see the row go red, restore.
3. Correct `docs/AMNESTY-PROOF.md`'s sentence to what then holds, scoped to the
   hosts measured.

## Done condition

The three rows hold and each has a mutation in `scripts/mutation-check.mjs`
that is CAUGHT; the corrected sentence in `docs/AMNESTY-PROOF.md` names its
hosts; `npm run gate` >= 95.
