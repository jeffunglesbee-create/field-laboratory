# Session record: clock reads the scan invented (stream S1, finding scanner-diff 4, first half)

Rule 67 record for one commit. Date 2026-11-05. The second half of the finding (reads the scan hid) is the next commit.

## Reproduction

`clockCounts` at the previous commit, as reads over captures:

    MyDate.now()  LocalDate.now()  $Date.now()          1/0  each
    xfieldDay()   xfieldToday()                         1/0  each
    const NOW = xfieldDay()                             1/1  (a capture with no read behind it: it would offset a real bare read elsewhere)
    o. Date   o.<lf>Date   this.#Date                   1/0  each
    f(...Date)                                          0/0  (a hidden read: a spread was taken for a dot)

Three causes. The `Date.now`, computed-member, `fieldDay` and `fieldToday` alternatives had no left boundary, so any name that ends in one matched. The bare-`Date` lookbehind checked one character, so a dot followed by white space (`o. Date`), a private name and a spread were all misjudged. The capture pattern took the same unbounded helper names.

## What was built

- Every alternative of the read pattern that names a global or a helper has the left boundary `(?<![\w$#])`, and so do the two helpers in the capture pattern (a capture is always also a read).
- The bare-`Date` lookbehind skips white space after a dot and treats a spread as no dot: `(?<![\w$#])(?<!(?<!\.\.)\.\s*)`.
- Twenty-two FORMS items: the names above (0 reads), `z.fieldDay()` and `z.fieldToday()` (1 read: a namespace import's call is a call of the helper, which is why `o.fieldDay()` stays a read, against the reviewer's list), `f(...Date)` (1 read), `o?.Date` and the rest of the properties (0).
- The comment above the pattern says what is and is not a read, including the boundary.
- Table: fourteen new entries (the boundary of each alternative, of each character class in it, the two capture helpers, the dot-and-space, the spread, `#`, `$` and word characters of the bare lookbehind); nineteen existing `row-scan-*`, `read-*` and `cap-*` entries re-anchored on the new pattern text.

## Red evidence

Each of the fourteen new entries applied to a copy fails the spellings clause with the case it was written for (`MyDate.now(): captures 0, reads 1, wanted 0 read(s)`; `const NOW = xfieldDay(): captures 1, reads 0, wanted 0 capture(s)`; `f(...Date): reads 0, wanted 1`; and so on). All 95 table entries on row-confidence.mjs through the harness: 96 of 96 CAUGHT. With the change the self-test is 25 of 25 and the real run scores 23 of 23 rows at or above 95. `clockCounts` of the 170 scripts under scripts/ is unchanged (reads, captures, network).

## Not changed

`Date['UTC']()` still counts (the key is an empty string by the time the pattern sees it); the next commit counts every computed member of Date and says so.
