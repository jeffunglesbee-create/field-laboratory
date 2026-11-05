# Session record — the network detector's guards are pinned from both sides (review 7, L9)

Date 2026-11-05. Scope: the spelling table in `networkClauses` (`scripts/row-confidence.mjs`), 13 new
entries in `scripts/mutation-check.mjs`. No change to the detector.

## Reproduction, run first
Every single-token deletion inside the `NETWORK_USE` block (each lookbehind or lookahead guard, each
whitespace term, each alternation member; 60 deletions), run against `--self-test` and the 23-row run in
a scratch copy of the tree at the previous commit: 16 survived. They fall in three groups.
- A guard no spelling pinned: the leading word guard of the global-fetch pattern (`itself.fetch(x)`,
  `myglobal.fetch(x)`), its property guard (`o.window.fetch(x)`, and with a space after the dot), its
  trailing guard (`window.fetchSlate(x)`), the leading word guard of the http pattern (`myhttp.get(u)`),
  the property guard of the net pattern (`o.net.connect(1)`, with the space) and the whitespace term of the
  property guard of http.
- Whitespace the patterns allow and only unspaced spellings reached: the three `\s*` of
  `net|tls|http2 . connect (`, the one of `sendBeacon (`, and the one in `function * fetch` (the declaration
  guard added in the previous commit).
- Three in the `new WebSocket|EventSource|XMLHttpRequest` pattern (its leading word guard, its dot guard and
  the whitespace term of that dot guard). These are equivalent: a `new` after an identifier character or a
  dot is a syntax error (`x.new WebSocket(u)`, `renew WebSocket(u)`, `$new WebSocket(u)`,
  `o. new WebSocket(u)` each give `SyntaxError: Unexpected identifier 'WebSocket'` under `node --check`), so
  no program can tell the guard from its absence. Left as they are.

## Built
- 18 spellings added to the table (82 to 100: 43 use, 57 not use): 11 not-use (`window.fetchSlate(x)`,
  `self.fetchPending = 1`, `itself.fetch(x)`, `myglobal.fetch(x)`, `o.window.fetch(x)`,
  `o. window.fetch(x)`, `myhttp.get(u)`, `o. http.get(u)`, `o.net.connect(1)`, `o. net.connect(1)`,
  `function * fetch(u = g(h())) {}`) and 5 use with spaces (`net . connect (80)`, `tls . connect (o)`,
  `http2 . createConnection (u)`, `sendBeacon (u)`, `navigator . sendBeacon (u)`).
- 13 entries, one per surviving guard.

## Red evidence
By hand, the 13 mutants against `--self-test`: 13 of 13 caught, each by the spelling table. The same
60-deletion sweep after the spellings: 3 survive, the three equivalent ones above. Through the harness:
`node scripts/mutation-check.mjs --ids <the 13>` printed `PASS` for each and `14/14 checks passed`.

## Not verified
- The reviewer also listed `?.` on `exempt` and `.every` on one command as survivors. Both were read, not
  rebuilt: `exempt` is always an array, and the two-command case in the exemption clause already separates
  `some` from `every` (the entry `network-flag-needs-every-command`, previous commit, shows it caught).
  The `o.net.connect` chains the reviewer called equivalent are NOT equivalent and are pinned above.
