# Session record: a capture's line ends where the scanner's lines end (stream S1, finding scanner-diff 5)

Rule 67 record for one commit. Date 2026-11-05.

## Reproduction

    const NOW = 1<CR>log(new Date())      {captures: 1, reads: 1}   (wanted captures 0)
    const NOW = 1<U+2028>log(new Date())  {captures: 1, reads: 1}
    const NOW = 1<LF>log(new Date())      {captures: 0, reads: 1}   (correct)

The capture pattern's "same line" was `[^\n]`, while the scanner (residuals Task 10 item 13) ends a line at a carriage return, U+2028 and U+2029 too. A bare read on the next line of such a file counted as the capture of the line before it, so a script could read the clock twice and be scored as having captured it once.

## What was built

- The pattern's line is `[^\n\r\u2028\u2029]`.
- Four FORMS items: the carriage return, U+2028 and U+2029 versions of the case above, each `1 read, 0 captures`, and a CR LF pair of constants (`1 read, 1 capture`) as the control.
- Table: `cap-line-ends-at-lf-only` (the old class put back) and one entry per character (`cap-line-ignores-cr`, `cap-line-ignores-u2028`, `cap-line-ignores-u2029`); the three `cap-*` entries that anchored on the old class were re-anchored.

## Red evidence

Each of the four new entries applied to a copy fails the spellings clause with the case it was written for (`const NOW = 1<CR>log(new Date()): {"captures":1,"reads":1}, wanted 1 read(s) and 0 capture(s)`, and the U+2028 and U+2029 forms). With the change the self-test is 25 of 25. All seven capture entries through the harness: 8 of 8 CAUGHT. `clockCounts` of the 170 scripts under scripts/ is unchanged (reads, captures, network).
