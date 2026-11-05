# Session record: applyMutation applies the replacement as written (stream S1, finding table-entries 0)

Rule 67 record for one commit. Date 2026-11-05, on the merged tree d4bcd69.

## Reproduction

Every anchored entry of the table was applied twice to its file, once the way the harness does (`.replace(find, replace)`) and once with a function replacer, and the two texts compared.

    entries 775
    compared: 772, differ: [ 'lineups-two-prefix-characters-unread 16106' ]

One of 772 differs, by 16,106 characters. Its replace holds `'$'`, and `$'` in a replacement string is the text after the match. `node --check` on the text the harness wrote prints `SyntaxError: Invalid or unexpected token`. Applied as written (same length as the find), the file parses, and `node scripts/check-lineups-pull-only.mjs --self-test` fails the clause that names the construct:

    FAIL  A TIMER IS STILL SEEN AFTER EACH CONSTRUCT THAT LOST THE OLD SCAN ITS PLACE (12 fixtures)
          -> 1 of 12 hidden: ["a verbatim interpolated string"]

So the entry was CAUGHT because the file stopped parsing, not because the fixture for `$@"..."` failed.

## What was built

- `applyMutation` passes a function as the replacement.
- One harness self-test clause applies eight replacement texts (`$'`, `$&`, `$$`, a backtick one, `$1`, `$<x>`, `'$'`, a mix) through a scratch file and compares the bytes with the replace written before the rest of the source.
- One table entry, `harness-applies-a-replacement-as-a-pattern`, puts the string replacement back.

## Red evidence

The clause against the unfixed function: `FAIL A REPLACEMENT IS APPLIED AS WRITTEN ... 6 of 8 applied as something else` (the harness's two nested self-test clauses went red with it, because they start a child self-test). With the fix: 166 of 166. The new entry and the lineups entry through the harness: both CAUGHT.

## Not verified

The other 68 entries whose replace holds a dollar sign (no `$'`, `$&`, `$$` or backtick-dollar in any of them) apply byte for byte as before; their harness verdicts were re-run in a separate copy and are in the report of the stream, not here.
