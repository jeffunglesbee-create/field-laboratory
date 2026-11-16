# Round 6, guard fixes from the verification round (2026-11-16)

Base: `4b5395e6` (head of `gate-items-2-7` after the round-5 merge and its three verification fixes). Source: workflow `wf_f9f5e556-127`, 66 agents (five verifiers and hunters, and two skeptics per new finding). Each fix below is one commit with fixtures that were seen to fail on purpose (Rule 90: the mutation-table entry named in each section, each `PASS [id]` under `node scripts/mutation-check.mjs --only <id>`). A finding both skeptics REFUTED, or both called CONTRIVED or COSMETIC, is not fixed here; it is listed with its exact passing input in `docs/CC-CMD-2026-11-16-gate-guard-contrived-residual.md`.

The premise of each fix was re-run at `4b5395e6` before any edit (Rule 100): the three reproductions below were taken with a scratch copy of the tree (`.github`, `scripts`, `package.json`) and one inserted step.

## G-pop-1 (REACHABLE, false red; both skeptics UPHELD): `tee`, `cp`, `mv`, `rm`, `uniq` in an always() step of an audited job

| input, one step added before the final step of `.github/workflows/verify-full.yml` | at `4b5395e6` | after |
|---|---|---|
| `echo x > scripts/render-check.mjs` (a redirect that replaces a script) | rc 0 `verdict: gated` | rc 0 `verdict: gated` |
| `node scripts/check-script-orphans.mjs \| tee outbox/x.txt` | rc 1, `tee` is not a command this guard can read | rc 0 `verdict: gated` |
| `cp outbox/a.txt outbox/b.txt` | rc 1 | rc 0 |
| `rm -f outbox/x.txt` | rc 1 | rc 0 |
| `node scripts/check-script-orphans.mjs \| sort \| uniq -c` | rc 1 (2 problems) | rc 1 (the `sort` refusal stays) |
| `sed -i 's/a/b/' outbox/x.txt` | rc 1 | rc 1 (the `sed` refusal stays) |

The round-4 fix (A23) removed eight tools from `BENIGN_HEADS`. Three run another command from their arguments (`awk` `system()`, `sed` `e` and `s///e`, `sort --compress-program`); they stay removed. Five only write a file (`tee`, `cp`, `mv`, `rm`, `uniq`); the ground for removing them was that they can replace a script the guard has already read. The first row above is the premise that fails: `echo x > scripts/render-check.mjs` is read clean, so a write to a script path was never refused, and the refusal of the tool bought nothing a redirect did not give back while refusing `| tee outbox/x.txt`, the repo's commonest pipeline sink. The five are restored; none runs another command. A step that writes a script and then runs it is no careless edit (the guard's stated threat model); it is one residual with the redirect, filed in the second CC-CMD with the option that closes both (classify the target of every write).

Fixtures: `BENIGN_HEADS` pinned to the 29 names (`PINNED_BENIGN`, five added); the three that run a command stay a literal list that is not in the set and each is refused; each of the five is kept as opaque on a plain, a piped and an unreadable line; five ordinary shapes are not refused; `tee x; npm run shot` still reads as a browser step. Table: `browser-gate-benign-tee`, `-cp`, `-mv`, `-rm`, `-uniq` now REMOVE the tool from the set (each `PASS`, each fails the vocab check on purpose); `-sed`, `-awk`, `-sort`, `-find` are unchanged.

## hunt-guard-5 (REACHABLE, false red; both skeptics UPHELD): an echo message with `;` `|` `&` `<` `>` in the required no-browser step

| input | at `4b5395e6` | after |
|---|---|---|
| the no-browser step `run:` of `verify-full.yml` becomes `echo "no browser; running the browser-free rows"` then `npm run gate:browserless` | rc 1, `must run scripts/confidence.mjs --browserless as real work ... in the closed form` | rc 0 `verdict: gated` |
| the same with `echo x; npm run shot` | rc 1 | rc 1 (2 problems) |

`flagged_step_ok` tested FORBIDDEN_IN_LINE on the raw echo line, quotes and all, so a notice with an arrow or a semicolon refused the whole step. It now tests the line with its quoted strings blanked (`blank_quoted` keeps a `$( )` and a backtick pair inside double quotes, which run). The refusal says an `echo` line is allowed and where its characters may sit. Fixtures: six messages are the work; fourteen shapes that run something or put one of the characters outside quotes are still refused. Table: `browser-gate-nb-echo-quoted-text`, `browser-gate-nb-echo-quoted-code` (a naive blanking that also erases `$( )` inside double quotes: caught by `echo "$(npm run shot)"`), `browser-gate-nb-echo-message`; each `PASS`.
