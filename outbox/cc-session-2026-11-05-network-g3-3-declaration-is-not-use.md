# Session record — the network scan does not count a declaration of `fetch` or an assignment to it as use (review 7, C6)

Date 2026-11-05. Scope: `NETWORK_USE` in `scripts/row-confidence.mjs` (the `fetch` and global-fetch
patterns, their comment, 31 spellings in the self-test table), 11 new and 4 re-anchored entries in
`scripts/mutation-check.mjs`.

## Reproduction, run first
The detector (`NETWORK_USE` text copied out of the file, run on stripped snippets):
`function fetch(u){}`, `class A { fetch(u){} }`, `const o = { fetch(u){} }`, `const fetch = realFetch`
each gave `fetch x1`; `globalThis.fetch = (url) => ({})` gave `global fetch x1`; `let fetch; fetch = stub`
gave `fetch x2`. On the tree, `weather-burst-check.mjs` installs a fake `globalThis.fetch` (twice), makes no
request, and was flagged `global fetch x2`. In a scratch copy, `&& ok('node scripts/weather-burst-check.mjs')`
on the sparkline row gave `70/100`, `reaches the network (global fetch x2)`, exit 1.
The skeptic's correction holds and is not rebuilt: it is NOT unclearable without editing the pinned clause
(an invented flag in the table clears it, and the table does not check that the script reads that flag; that
is the check built for C3). It is fail-closed and no gate row names the script (it is one of the scripts
outside the scorer's reach), so low.

## Built (the skeptic's direction)
- `fetch` is not use when it follows `function`/`function*`/`const`/`let`/`var`, when a single `=` follows it
  (assignment, class field, destructuring default), or when a parameter list and a `{` follow it on its line
  (a method or a function). The parameter list may hold one level of nested parentheses.
- `globalThis|window|self|global .fetch` is not use when a single `=` follows it.
- Still use, pinned: `fetch === undefined`, `fetch == g`, `typeof fetch`, `globalThis.fetch === undefined`,
  `const f = globalThis.fetch`, `window.fetch = window.fetch.bind(window)` (the right side reads it),
  `globalThis.fetch ??= stub`, a call with a callback body, a call followed by a block on the NEXT line.
  One spelling errs in the safe direction and is pinned as such: a method whose brace is on the next line
  reads as a call.
- The self-test table grew from 51 to 82 spellings (38 use, 44 not use); the label says what it now excludes.
- Over all 170 scripts the detection before and after differs in exactly one: `weather-burst-check.mjs`
  went from `global fetch x2` to none (flagged scripts 55 to 54).

## Red evidence
13 hand mutants of the new guards against `--self-test`: 11 caught, 2 survived (dropping the generator star
and dropping `const`, each redundant for the simple spelling), and two spellings were added for them
(`function* fetch(u = g(h())) {}`, `for (const fetch of list) {}`); then 13 of 13 caught. Through the harness:
the 11 new entries and the 6 existing `fetch` entries (4 re-anchored because the pattern text moved, 2 whose
text is unchanged) printed `PASS` for each and `18/18 checks passed`.

## Not verified
- A declaration spelled with a destructuring pattern other than a `for` header (`const { fetch } = globalThis`)
  still counts as use: it reads the global, and that is intended.
- `import { fetch } from 'undici'` counts the import specifier as use (fail-closed).
