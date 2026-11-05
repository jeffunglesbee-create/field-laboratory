# Session record — the scorer reads the scripts a row runs from its code, not its comments (review 7, C5)

Date 2026-11-05. Scope: `scripts/row-confidence.mjs` (`scriptsOf`, now `scriptsIn`), two table
entries in `scripts/mutation-check.mjs`.

## Reproduction, run first
A comment `// the live counterpart is scripts/window-check.mjs, which this row does not run`
put into the declaration of the row "the sparkline shows the value, not a silhouette" in a
scratch copy of the tree, then `node scripts/row-confidence.mjs`:

    70/100  (weight 30)  the sparkline shows the value, not a silhouette
    FAIL  every gate row is at or above 95 -> the sparkline shows the value, not a silhouette = 70
    exit=1

The row runs only `spark-check.mjs`. `commandsOf` blanks comments; `scriptsOf` did not, so the two
disagreed about what the row runs. The skeptic's severity (low) holds: the clock half had the same
defect before the network half existed, and no row of the 23 names a script only in a comment.

## Built
- `scriptsIn(decl)`: the scripts a declaration runs, read with comments blanked. `scriptsOf` is the
  row-name wrapper around it. The split is the seam the self-test needs to feed a synthetic
  declaration.
- The `declOf` doc comment no longer says its text is "the text its commands are read from".
- One clause: 5 declarations (line comment, block comment, comment after the command, comment
  alone, a `//` inside a URL string that must not hide the next command) plus the stale-exemption
  case for a script only named in a comment.
- Two table entries: `row-scan-script-read-from-comments`, `row-scan-script-comment-cut-by-line`.

## Red evidence
Clause against the old reading (`decl.matchAll`): `FAIL ... 4 wrong of 5; 0 stale of 1 exemption
for the commented script`. Both entries through the harness: `node scripts/mutation-check.mjs --ids
row-scan-script-read-from-comments,row-scan-script-comment-cut-by-line` printed `PASS` for each and
`3/3 checks passed`.

## Not verified
- `mutationsFor` takes the same script list, so a comment naming a script that has mutations used
  to credit a toothless row with teeth. Derived by reading, not demonstrated.
