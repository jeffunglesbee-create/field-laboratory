# Session record — the network detector's NOT COVERED list says what it misses, and is pinned (review 7, L8)

Date 2026-11-05. Scope: the spelling clause and the `NETWORK_USE` doc comment in
`scripts/row-confidence.mjs`, 3 entries in `scripts/mutation-check.mjs`. No change to the detector.

## Reproduction, run first
The reviewer's misses, each fed to the detector as stripped code on this tree: 19 spellings the label
did not list (19 of them), every one gave no network use. Optional chaining through a global or a module
(`globalThis?.fetch(u)`, `self?.fetch(u)`, `http?.get(u)`, `http?.request(o)`), a constructor through a global
or in parentheses (`new globalThis.WebSocket(u)`, `new window.WebSocket(u)`, `new (WebSocket)(u)`),
`require('https').get(u)`, `require('node:https').request(o)`, `import('node:https').then(...)`,
`(await import('node:net')).connect(80)`, a default import or a require under another name,
`const { fetch: f } = globalThis; f(u)`, `new net.Socket().connect(80)`, `dgram`, `dns`, and a spread of
fetch (`[...fetch]`, `f(...fetch)`: the dot of the spread reads as a property). The label claimed to see
"fetch through a global" and did not say optional chaining was missed. No script under `scripts/` uses any
of the forms: grepped on this tree, and the only two that import `node:http` (`mutation-await.mjs`,
`serve.mjs`) import `createServer`.

## Built
- The `NOT COVERED` text of the clause label and the "WHAT IT CANNOT SEE" doc comment list the misses.
- Those spellings (27, including the previously listed ones that were not pinned: named import, `spawn`,
  a computed name, `c ? fetch : g`) are an array of their own, `NOT_SEEN`, each required to give no network
  use. The label can no longer drift from the scan in one direction: if the scan learns a spelling, the
  clause fails until the list says so. The three pins that sat in the use table moved there; the clause
  now counts 97 spellings (43 use, 54 not use) and 27 not seen.
- Each comparison carries a control (a call of fetch pinned as not use, and as not seen, is reported), so
  a comparison that stopped comparing is caught.
- 3 entries: the scan learns optional chaining on a global (the list is pinned), the use-table comparison
  made blind, the not-seen comparison made blind.

## Red evidence
By hand, 4 mutants: 3 caught; the fourth (the not-seen comparison handed an empty list) survived by
construction and was not built as an entry. Through the harness: `node scripts/mutation-check.mjs --ids
row-scan-not-covered-list-drifts,row-scan-spelling-check-blind,row-scan-not-covered-check-blind` printed
`PASS` for each and `4/4 checks passed`.

## Not verified
- The label's prose and the `NOT_SEEN` array are two lists. A spelling removed from the array while the
  label still names it is not caught (the label prints the array's count, not its items).
