# Session record — the network exemptions are run, not only read (review 7, C3)

Date 2026-11-05. Scope: three new scripts (`scripts/network-exempt.mjs`, `scripts/no-network-preload.mjs`,
`scripts/network-exempt-check.mjs`), `NETWORK_EXEMPT` moved out of `scripts/row-confidence.mjs`,
`check:network-exempt` in `package.json`, one step in `verify.yml`, 39 new entries and four re-pointed ones
in `scripts/mutation-check.mjs`. The workflow half of the sanction was the previous record.

## Reproduction, run first
In a scratch copy, each edit followed by `node scripts/row-confidence.mjs`, which stayed at 23/23 rows
at or above 95, exit 0, and `--self-test` green, for all three:
(a) an unconditional `await fetch(...)` in `drift-check.mjs`; (b) the same in `venue-coverage-check.mjs`;
(c) a second fetch to another host in `mutation-await.mjs` (the sanction exempts the whole script).
The skeptic's corrections hold: (d), a table flag typo, is NOT silent (three `network-flag-added-*`
entries go red and `--anchors` reports a stale one, in the 70-minute mutation row and the pre-commit
hook), so no extra work for it beyond the literal check below; (e) is the previous record; and the
severity is medium, not high, because the old scan fired on 0 of 169 scripts, so these three were never
scanned and nothing regressed. Also confirmed: the reviewer's count pin ("fetch x1") would not catch the
likelier edit (`if (url)` made `if (true)`), so it was not built.

## Built (the skeptic's better fix)
- `scripts/no-network-preload.mjs`, loaded with `NODE_OPTIONS=--import`: closes `fetch`, `WebSocket`,
  `http|https.request|get`, `http2.connect`, `net.connect|createConnection`, `tls.connect` and their named
  imports, for the process and every node child. `exit` mode: the first attempt writes a line to the mark
  file and ends the process with code 97. `record` mode: written down and refused, the run goes on.
- `scripts/network-exempt-check.mjs`. For each flag entry: the script reads the table's flag as a quoted
  literal; its CONTROL (the flag, plus `--url` for the venue script) is stopped on an attempt (positive
  control: exit 97 and a mark); and the row's own commands, run as the gate runs them
  (`scripts/run-row.mjs <row>`), pass and leave no mark. The mark decides, not the exit status: the
  REJECT row passes when its script FAILS, so a script ended by the preload would pass it. For the
  sanction: the shard wait is run in record mode and every attempt must be under the GitHub API path of its
  run (`within`), and there must be one. A missing `build/` is a named failure that stops the audit; it is
  not a skip. Nine self-test clauses on stand-in trees, 13 preload calls, 7 broken-tree scenarios.
- The table is a module (`scripts/network-exempt.mjs`) because `row-confidence.mjs` runs at import. Each
  entry gained a `control`. The sanction text now says what is checked and where.
- Wired like `check:mutate-copy`: `npm run check:network-exempt` (self-test, then audit) and a verify.yml
  step gated on the build, next to `check:rows`. A clause pins both.
- `check-script-orphans` flagged the preload as unreachable (a `new URL` of a sibling is no edge); it is
  now spelled as a path.

## Measured cost
`node scripts/network-exempt-check.mjs`: 0.91, 0.92, 0.99 s. `--self-test`: 2.96, 2.93 s. Together
(`npm run check:network-exempt`) about 3.9 s, on a 4-core machine at load average 3.3 to 4.3. Not an idle
figure.

## Red evidence
Through the harness, `node scripts/mutation-check.mjs --ids <ids>`, in three batches of 12 (each `13/13
checks passed`, every entry `PASS` = caught): on the real scripts the reviewer's (a), (b) and (c) and the
`if (true)` edit (7 entries, including a shard wait that asks another path or asks nothing); 5 table
entries (typo in the flag, typo in flag and control, a control without its flag, the sanction's address
changed or removed); 13 mutants of the check (each branch of the audit); 3 of the wiring (script removed,
step runs something else, step not gated on the build); 8 of the preload. A by-hand sweep of 14 more
mutants of the preload found three survivors (a URL object as the target, a builtin that returns instead
of throwing, a fetch that throws at the call instead of rejecting); they got clause assertions and their
own entries (3 more entries, `4/4 checks passed`), and the sweep then showed 14 of 14 caught. With
`build/` moved away the real check printed 5 FAIL of 5: the first names `build/Desk.js` and
`build/Scouting.js`, the other four say nothing was run.

## Not verified
- The sanctioned wait is run once with a single attempt, so only its first request (the artifact list) is
  checked against `within`. Its job list is under the same path; its artifact download is under
  `/repos/<repo>/actions/artifacts/`, a different path, and is not reached. Stated in the module and the check.
- A request on a path the row's commands do not take (the row does not make it either), and one through a
  child process (`curl`, `dns`): not seen, stated in the module and in the check.
- The exempt rows were run on this machine, not on a runner: CI is the first run of the new step there.
- During this work the shared disk filled twice (0 MB free); two harness runs and one commit hook failed
  with "No space left on device" and were rerun after space was freed (this clone's gitignored `public/`
  output, 135 MB, was removed to make room).
