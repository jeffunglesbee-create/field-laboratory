# Session record: a command the harness ends for printing past its output limit is a failed command

**Date:** 2026-11-05. **Scope:** fix stream F2, review 6, finding harness-lifecycle 1. Commit 1 of 8. New file, because `check:staged-outbox` wants an `outbox/` path beside a staged `scripts/` path and existing outbox files are not edited.

## Reproduction (Rule 100), on this clone at d4bcd69

A scratch git repository holding this clone's `mutation-check.mjs`, `checks.mjs`, `mutation-lib.mjs`, `run-marker.mjs`, with the `known-survivor` entry's expectation replaced by `yes xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx | head -c 400000000 | cat; exit 0`:

```
node scripts/mutation-check.mjs --only known-survivor      (exit 1, 3.1 s)
::error::[known-survivor] its expectation was ended by SIGTERM: a command that is killed has not failed, so the mutation is neither caught nor a survivor, and the run stops. ...
```

No SIGTERM came from outside. The probe that explains it (Node 22, `execSync` with a 64 KiB `maxBuffer`): a flooding command reports `code ENOBUFS, signal SIGTERM, status null`; `exit 130` reports `code undefined, signal null, status 130`. The signal field cannot tell the harness's own limit from a kill, so the code is what is read.

## What was built

- `run()` reads `e.code === 'ENOBUFS'` as an ordinary failure (`lastSignal` stays null), so a flooding expectation is a caught mutation again, as it was before the signal rule.
- `MUTATION_OUTPUT_LIMIT`, the one environment override, read only for `OUTPUT_LIMIT` (default 256 MiB), so the self-test can flood past it with kilobytes. It is added to the `clean` set the self-test hands its children.
- The fault `expect-floods` in `expectOf`: the expectation prints 2 MiB.
- One self-test clause, directly after the E24 group: `known-survivor` under `expect-floods` and a 64 KiB limit is `PASS` (caught), exit 0, no "ended by", file and state put back. The control is the survivor's own run (`FAIL [known-survivor]`, exit 1).
- Table: new entry `flooded-expectation-reads-as-killed`; the find strings of `run-forgets-the-signal` and `killed-child-status-is-a-verdict` follow the new line.

## Red evidence (Rule 90)

Clause against `run()` without the ENOBUFS test (the new entry's mutation, applied to a copy of the tree): `165/166 checks passed`, one FAIL, `E24: ...but a command the harness itself ends for printing past its output limit ...`. With the fix: `166/166`.

Through the harness, `node scripts/mutation-check.mjs --ids flooded-expectation-reads-as-killed,run-forgets-the-signal,killed-child-status-is-a-verdict`: `PASS [run-forgets-the-signal]`, `PASS [killed-child-status-is-a-verdict]`, `PASS [flooded-expectation-reads-as-killed]` (each CAUGHT), `4/4 checks passed`.

## Not verified

A flood past the real 256 MiB limit was not run through the self-test (the clause uses 64 KiB); the reproduction above did run the real limit once, on the unfixed code. `MUTATION_OUTPUT_LIMIT` is not yet announced at start-up: commit 2 adds the line for every test hook.
