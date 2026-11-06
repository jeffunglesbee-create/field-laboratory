# Session record: clock reads the scan hid (stream S1, finding scanner-diff 4, second half)

Rule 67 record for one commit. Date 2026-11-05. The first half (reads the scan invented) is the commit before.

## Reproduction

`clockCounts` at the commit before this one, as reads over captures:

    new globalThis.Date()                      0/0
    const D = globalThis.Date; new D()         0/0
    window.Date    self.Date    global.Date    0/0
    const f = Date['now']; f()                 0/0   (a computed member taken as a value)
    Date[k]()    Date['UTC'](1)                0/0   (the second is counted now because the key cannot be read)
    new Date(...[])                            0/0   (a spread may be empty)

The comment above the pattern said "any computed member called with nothing is counted"; it was true only for a string key called with nothing.

## What was built

- The `Date['…']()` alternative is gone. The bare-`Date` alternative no longer excludes a following `[`, so any computed member of `Date` is a read, called or not, with any key (`Date['now']`, `Date[k]()`, and `Date['UTC'](1)`, which cannot be told from `now` once the string is `''`). A property still is not (`o.Date['x']`, `MyDate['now']()` read nothing).
- The global reached through an object is a read: `globalThis`, `self`, `window` or `global`, then `.Date`. However it is then used counts (`new globalThis.Date(5)` is a read too: the pattern cannot tell what follows).
- `new Date(...x)` is a read in the read pattern and in the capture pattern, because a spread can be empty.
- The comment above the pattern lists what counts and what does not, and the spellings clause's label says so.
- Twenty-two FORMS items; `Date['UTC'](1)` changed from 0 to 1 read.
- Table: ten new entries (the alternative, each of the four object names, its left boundary, word boundary and white space, the spread in the read pattern and in the capture pattern); `read-computed-now-dropped` and `read-alias-counts-computed` now mutate the bare alternative's lookahead; `read-computed-no-left-boundary` and `read-computed-now-whitespace` were removed, because the pattern they mutated no longer exists (the left boundary of the bare alternative is pinned by `read-alias-counts-word-names` and its neighbours; whitespace does not matter to an alternative that only looks ahead); seventeen others were re-anchored.

## Red evidence

Each new entry applied to a copy fails the spellings clause with its own case: `new globalThis.Date(): reads 0, wanted 1`, `self.Date`, `window.Date`, `global.Date` (one per name), `xglobalThis.Date: reads 1, wanted 0`, `globalThis.Dates`, `globalThis . Date: reads 0, wanted 1`, `new Date(...[]): reads 0, wanted 1`, `const NOW = new Date(...[]): captures 0, wanted 1`, and for the two retargeted computed entries `Date['now'](): reads 0, wanted 1`. All 103 table entries on row-confidence.mjs through the harness: 104 of 104 CAUGHT. Self-test 25 of 25 with 116 spellings. `clockCounts` of the 170 scripts under scripts/ is unchanged (reads, captures, network).

## Not covered (stated in the comment and the label)

A `Date` reached through a computed or concatenated name (`globalThis['Da' + 'te']`), `performance.now()`, `process.hrtime()`, `process.uptime()`, `Intl` and `Atomics` timers. `Date['UTC'](1)` and `new globalThis.Date(5)` count as reads although they read no clock; the failure is in the safe direction.
