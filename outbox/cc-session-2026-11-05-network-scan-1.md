# The determinism scan's network half can fire, and the three gate rows that reach the network say how

CC-CMD: `docs/CC-CMD-2026-11-03-gate-hazard-residuals.md`, Task 9 item 2 ("The network half cannot fire"). The owner decided the policy before this was built: a flag-keyed exemption table checked against the
row's own command text, and the verify-full shard wait as the one sanctioned network read of a row. Session 2026-11-05, HEAD at the start `b05dc5a`.

## Premise, and the commands that tried to refute it (Rule 100)

1. The old test cannot fire. The network field of `clockCounts` was a test for `https://` in the text left after strings and comments are removed. Run over every script under `scripts/` with the clone's own scanner:

   ```
   CURRENT network half fires on 0 of 169 scripts: (none)
   ```

2. A call-based detector would fire where the gate really has network use, and on three row scripts only:

   ```
   CALL DETECTOR flags 55 of 169 ; scripts named anywhere in gate-checks.mjs: 21 ; of those flagged: 3
     scripts/drift-check.mjs: fetch x1
     scripts/mutation-await.mjs: fetch x1
     scripts/venue-coverage-check.mjs: fetch x1
   ```

3. The two flag-guarded scripts do not reach the network on the commands the gate rows run. Each command was run with `fetch`, `http(s).request|get`, `net.connect` and `Socket.prototype.connect` replaced by stand-ins
   that end the process with exit 97 and print `NETWORK ATTEMPT`:

   ```
   exit=0 :: scripts/drift-check.mjs --file data/context-2026-05-15.json :: 0 attempt line(s)
   exit=0 :: scripts/drift-check.mjs --file data/games-2026-08-09.json :: 0 attempt line(s)
   exit=0 :: scripts/venue-coverage-check.mjs :: 0 attempt line(s)
   exit=1 :: scripts/drift-check.mjs --file test/malformed-nested.json :: 0 attempt line(s)
   positive control, drift-check.mjs --url https://example.invalid/x:  NETWORK ATTEMPT: fetch   exit=97
   ```

   The shard wait reaches the GitHub API through `fetchImpl = fetch` when `verify-full.yml` sets `GATE_MUTATION_SHARDS` (read from the workflow and from `awaitShards`; not run here, there is no token).

## What was built

- `scripts/row-confidence.mjs`: `NETWORK_USE`, six callee patterns (fetch as a call or a value, a global fetch, new WebSocket/EventSource/XMLHttpRequest, https.request/get, net/tls/http2 connect, sendBeacon),
  and `clockCounts` returns the kinds with their counts, which the objection prints (`reaches the network (fetch x1)`). `NETWORK_EXEMPT` names row, script and either the guarding flag or the one sanctioned
  wait. `networkObjections` exempts a flag entry only while the row's own declaration, read with comments blanked, does not pass that flag to that script (`--flag` or `--flag=value`, in any of the row's commands for
  it); `staleExemptions` makes an entry for a row the gate does not have, or a script its row does not run, an objection of its own; an entry with neither a flag nor a sanction exempts nothing. `declOf` is
  `scriptsOf`'s slicing, extracted so the flag test can read the same text. `scriptsOf` lists a script once however many commands name it (the duplicate listing of `drift-check.mjs` is two identical objection lines
  the moment a row goes red, which reads as two defects).
- Six clauses in `networkClauses` (the self-test goes from 19 to 25): the forms, the exemption cases, the stale cases, the table's own shape, the scan on the real tree, and the listing. Each prints its coverage in its label.
- 36 table entries in `scripts/mutation-check.mjs` (650 entries before, 686 after).

## Red evidence (Rule 90)

- The new clauses against the old detector (a copy with the old test in the new structure): three FAIL, `26 wrong of 46` spellings, `8 wrong of 12` cases, and `0 of 169 scripts under scripts/ reach the network`.
- The detector with an empty exemption table: three rows at 70 (`decoders accept both real captures`, `decoders still REJECT the corrupted fixture`, `breaking each invariant makes a check fail`), 20 of 23 at or above 95.
- A flag added to a row's own command (`--url` on the first drift-check command): that row 70, 22 of 23, one objection line naming the flag.
- The first run of the forms clause failed on two spellings the probe's pattern had wrong: a property with spaces around the dot (`o . fetch(x)`, `globalThis . fetch(u)`) was read as a bare fetch. Fixed with a lookbehind that skips the dot and its whitespace.
- All 36 entries through the harness (`node scripts/mutation-check.mjs --ids ...`): `baseline: ran 2 of 2 distinct expectation(s) from 36 mutation(s), 0 failing`, then `37/37 checks passed`, tree restored.
- Finer mutants applied by hand to a scratch copy (alternations of each pattern, the argument parser, the wiring): 41, of which 33 are caught by the self-test at once. One survives and is equivalent (the text before a
  script's first mention in a declaration always begins `name: `). Seven weaken a clause or a line of the main flow, and each of those is detected one level up: with the weakening in, the table entry that guards it survives
  (15 of 15 pairs).

## Coverage (Rule 91)

The scan reads 169 scripts under `scripts/` and flags 55; 3 of the 21 a gate row names are among them. It cannot see a named import from `node:https`, a child process, `dotnet restore`, a browser's `route.fetch()` or a
navigation to an external address, a computed name, `c ? fetch : g`, a reference to `https.get` or `net.connect` that is not called on the spot, or a module that does the fetching. A flag built at run time is not seen
by the exemption test, which is why the shard wait is a sanction. The other 52 flagged scripts are not run by a gate row by name and were not touched.

## Not verified

- The full gate. The shard wait on a runner (the only place the sanction is exercised).
- Rows that run `npm run ...` (`render checks pass on both captures`, `grouping and date navigation pass`, `build is clean`) name no script in their declaration, so the scorer reads `gate-checks.mjs` for them and never
  `render-check.mjs`, which the scan flags (fetch x2). That blind spot is older than this change and was left alone.
