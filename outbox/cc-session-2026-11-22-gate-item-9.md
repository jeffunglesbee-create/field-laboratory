# CC session 2026-11-22: item 9, a mention of .npmrc, $GITHUB_PATH or $GITHUB_ENV is not a write

Scope: `docs/CC-CMD-2026-11-16-gate-guard-contrived-residual.md`, item 9 (owner: "item 9 approved"). Repo field-laboratory, work branch `item9` from `main` 72232307.

## HEAD progression

| step | sha | state |
|---|---|---|
| start | `72232307` | `main` |
| built | `b5563f24` | `without_mentions`, 42 checks, 13 mutation entries (4 repointed), the fuzz |
| landed | `__LANDED__` | scored `verify-full` run `__RUN__`: `__STATE__` |

## Probe first

Before any edit, through the guard on `main`: `echo "using the repo .npmrc"`, `if [ -f .npmrc ]; then echo found; fi`, `echo "appends to $GITHUB_PATH in the next step"` and `printf '%s\n' 'see .npmrc'` were refused, and so were four real writes (`>> .npmrc`, `> "$HOME/.npmrc"`, `{ echo "NODE_OPTIONS=..."; } >> "$GITHUB_ENV"`, `| tee -a "$GITHUB_PATH"`).

## What was built, and what the fuzz changed

`scripts/check-browser-gate.py`: `MESSAGE_COMMAND`, `READONLY_TEST`, `without_mentions`; `later_step_effects(text, seen)` reads the references in `seen` (without the mention-only commands) and the names in `text`; `read_commands` looks for the line to quote in the cut text first.

The fuzz (`outbox/guard-mention-fuzz-2026-11-22.py`) changed the design three times:
1. The first false-green measure read only the three reasons of this item. A `$(` in a message was then invisible as a problem, because a plain step is refused for the substitution anyway. The measure is now whole-step acceptance (plain, or an always() step): the control that allows `$(` in a message shows 99 false greens in 6000 scripts.
2. A quoted `"$GITHUB_PATH"` operand of a test was a false red (240 of 3000 scripts): a variable without `$(` or `${` is allowed in a test operand now.
3. Two lookaheads (what may follow the command) and a flags clause were removed: no script of 6000 needed the lookaheads (the redirect and its target stay in the text anyway), and the flags clause was covered by the bare-word argument (an equivalent mutant).

## Verified

- `python3 scripts/check-browser-gate.py --self-test`: 1467/1467; real tree `verdict: gated`; `node scripts/mutation-check.mjs --anchors`: `checked 2215 of 2218 mutation anchors; 0 stale`.
- Mutants: the item-9 entries and the later-step entries (30 at the first run, 29 caught, 1 equivalent removed): all caught by the isolated-copy runner.
- Real tree: `checked 411 of 411 run steps`, 0 differ.
- Fuzz: see `outbox/guard-mention-fuzz-2026-11-22.txt`: 50000 scripts, 0 false greens, false reds 15852 to 0; controls 709, 99, 1970.

## Not verified

- No independent review of this change was run (four reviews of the heredoc item found 25, 48, 28 and 22 findings). The closed forms are small, and the fuzz and mutants check them, not a fresh read.
- The fuzz draws 20 write forms and 9 mention forms; the forms it does not draw are listed in the artifact and in the CC-CMD.
- The scored `verify-full` and the landing are in the last row of the table.
