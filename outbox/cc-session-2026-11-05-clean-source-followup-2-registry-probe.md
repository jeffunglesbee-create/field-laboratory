# Session record — clean-source-check sees a stranded registry probe (clean-source follow-up 2 of 2)

Date 2026-11-05. Scope: `scripts/clean-source-check.mjs` (scan, remedy, `--self-test`) and its table entries in
`scripts/mutation-check.mjs`. Follows `outbox/cc-session-2026-11-05-clean-source-followup-1-proof-check-refusal.md`.

## Premise commands, run first (Rule 100)
- A second `    | NHL` written directly above `    | Unrecognised of raw: string` in `src/Desk.fs` exactly as
  `probeRegistry` writes it (uncommitted), then `npm run check:clean-source`: the self-test read `11/11 checks passed`,
  the scan read `4/4 checks passed`, exit 0. On the same tree `node scripts/proof-check.mjs` refused:
  `proof-check: src/Desk.fs contains injected proof code (the probe case) and no run state exists.` So the premise holds:
  a stranded probe was invisible to the check that exists to see a stranded injection.
- Could an all-files scan flag a clean tree? A script over the 49 `src/*.fs` files for proof-check's probe site
  (`    | NHL\n    | Unrecognised of raw: string`) found 0 files. After the change the real scan reads `5/5 checks passed`.
- Constants as proof-check writes them: `REGISTRY_ANCHOR`, `REGISTRY_PROBE`, `REGISTRY_PROBE_SITE` read from its source.

## Built
- The scan looks for the probe site in every source file, as it does for the marker, and not only in `src/Desk.fs`:
  proof-check owns which file is the registry, and a scan that named it would go blind if it moved.
- A fifth check pins the three constants against proof-check's source, like the marker and the run state.
- The no-state remedy lists one instruction per kind present, each with a grep naming only its own files: the block as
  before; the probe as `the line "    | NHL" directly above "    | Unrecognised of raw: string"`, shown by `grep -n -B1`.
  Block-only output is byte-identical to before; the 11 existing clauses pass unchanged except the clean-tree one (4 to 5 checks).
- Run by hand over the real tree with a block and a probe injected: `4/5 checks passed`, both instructions printed, and the
  two greps as printed showed `146:let private __proof0 ...` and `345-    | NHL` / `346:    | Unrecognised ...`.

Self-test 11 to 16 clauses. Red first: against the unchanged scan 10/16, six FAIL (the clean-tree count, the probe is
not caught, its remedy, the both-kinds remedy, the clean-union control, the three drifted constants). With the change 16/16.
The clean-union clause (a union with `| NHL` in the middle is clean) cannot fail on the old scan for its own reason; it
is held by two entries instead (site is any `| NHL`, site is any last case), each shown red.

Table: 13 new entries and 2 re-anchored (`clean-source-scan-blind`, `clean-source-grep-hint-is-git-diff`, whose finds named
text this change moved). Each applied to a copy with its find asserted unique, then all 15 through
`node scripts/mutation-check.mjs --ids ...`: baseline 0 failing, 15 of 15 caught.

## Not verified, not changed
- A run state combined with a probe was run by hand (remedy is proof-check's heal, no checkout) but has no clause: the
  remedy does not branch on the kind, so no mutation exists that only such a clause would catch.
- The checkout sentence says "the file" in the singular when two files are named. That wording predates this change and
  is left as it was.
- Not run on a GitHub runner; greps run with GNU grep only.
