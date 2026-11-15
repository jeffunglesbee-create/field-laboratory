#!/usr/bin/env python3
"""The verify job's browser steps wait for the Chromium install; every other step does not.

Two jobs get that whole shape (TARGETS: `verify` of verify.yml, `live` of live-check.yml). Every OTHER place that installs a
browser is an annotated exemption (rule 9 below), recomputed on every run.

WHY THIS EXISTS, measured 2026-11-11.

`Install Chromium` is one step of the `verify` job. When it failed (the runner could not resolve the Ubuntu mirrors for
about three hours, so apt stalled ten minutes and then failed) every step after it with no `if` was SKIPPED, GitHub's
default after a failure. 63 steps were skipped: 17 needed a browser, 44 needed none (the F# suite, the decoders, the
citation check, the registry checks) and 2 were the setup actions' post-job cleanups. The commit was reported as
unverified for a reason that said nothing about the commit, and the one suite that could have been green was not run.
The file's own header says it: "a failure anywhere in it skips everything after".

THE SHAPE THAT FIXES IT

    - name: Install Chromium
      id: chromium
      continue-on-error: true          # the install failing is not a step failure: later steps still run
      ...
    - name: Render checks ...          # needs a browser
      if: steps.chromium.outcome == 'success'
    - name: The F# suite ...           # does not
      (no condition on the install)
    ...
    - name: Install Chromium did not succeed, so the browser steps were skipped
      if: always() && steps.chromium.outcome != 'success'
      env: { INSTALL_OUTCOME: ${{ steps.chromium.outcome }} }
      run: ... exit 1                  # the job is still RED, and says why

The last step is what keeps `continue-on-error` from turning a failed install into a green job. It tests `!= 'success'`,
not `== 'failure'`: an install killed by its `timeout-minutes` may conclude as something other than `failure`, and a
final step that missed that case would leave the job green with every browser step skipped.

WHAT THIS CHECKS, on each target job (rules 1 to 8) and on every other install (rule 9)

  1. the install step has `id: chromium` and `continue-on-error: true` and is ONE `npx playwright install` command (more
     in it would be swallowed by the `continue-on-error`), and NO other step or the job carries a `continue-on-error` (a
     failure swallowed anywhere else is a green job over a red step); no `env:` of the job, the workflow or a step sets
     NODE_OPTIONS, PATH or another variable that changes what a command runs
  2. every step AFTER it that needs a browser carries `steps.chromium.outcome == 'success'` in its `if`, joined by `&&`
     to nothing but `always()`, `success()`, `!cancelled()` and other `steps.<id>.outcome == 'success'` (a clause that
     can only narrow the gate to nothing, `&& failure()` or `&& steps.x.outcome == 'failure'`, would skip the check on
     every green run and is not recognised)
  3. no step that does NOT need one mentions `steps.chromium` (a browser-free step gated on the install is skipped by
     an outage again: the failure this exists to end), except the final step
  4. the LAST step of the job is the final step: `if` exactly `always() && steps.chromium.outcome != 'success'`, no
     `continue-on-error`, and its script, RUN HERE under `bash -e` (the runner's default shell: its job logs print
     `shell: /usr/bin/bash -e {0}`, NO pipefail) for each outcome the install can have (failure, skipped, cancelled,
     empty), exits non-zero and prints `::error::`. The effect is tested, not the text: a comment that says `exit 1`, an
     echo that mentions it, an `exit 0` before it or an `if false; then exit 1; fi` all contain the characters and none of
     them reddens the job. Because the guard's run and the runner's differ in everything but the script (files, variables
     the runner sets, the shell's options), the script is a CLOSED GRAMMAR: only echo, `exit N` (a literal non-zero
     integer) and `[ ]`/`test` comparisons, in if/elif/else/fi, with no pipe and no redirect, and a comparison reads only a
     variable the step's own `env:` defines (the guard's run sets PATH, LC_ALL and that env, a runner sets many more: `[ "$GITHUB_ACTIONS" != true ]`
     fails here and passes there); anything else is refused, because what it does here would say nothing about what it does there. It is last because a step after it that has no
     `always()` is skipped by the failure it makes.
  5. every `steps.<id>` an `if` mentions is the id of an earlier step (a renamed id evaluates to null and skips every
     browser step without a word)
  6. no step's `if` is a bare `false`
  7. coverage is not vacuous: the number of steps read, and how many need a browser, are printed and bounded below
  8. EVERY step after the install is READ. A command the reader cannot resolve is a problem, never "browser-free":
     see the next section.
  9. EVERY OTHER place that installs a browser (any .github/workflows/*.yml or *.yaml, any action.yml or action.yaml under
     .github, and any other job of a target file) carries `# browser-gate: exempt N -- <reason>`: a YAML comment at the
     install step's own indentation, within EXEMPT_REACH lines above the install and after the previous install of that
     file, so one annotation covers one install. N is the number of steps after the install that are not CERTAIN to run
     when it fails and are not shown to need a browser (step_runs_after_failure: GitHub's rule that an `if` with no status
     function is evaluated as `success() && (...)`, applied three-valued to the expression, an unknown part counting as
     not certain), and the guard recomputes it, so a step added there changes N and the guard goes red until someone says
     what the step is. N also counts what else the failure skips: the jobs that `needs:` the install's job (and, through a
     skipped one, theirs) whose `if` is not certain to run, and for a composite action the steps that follow the action in
     every job that calls it, and the jobs that need those. The install must have no continue-on-error, nor its job (that
     is the shape, and needs all of it: make the file a target). An annotation above no install is stale. The annotation
     is a drift guard and a statement of why the skip is right; it does not make it right. Installs are found by
     INSTALL_CMD, which reads `playwright install`, `playwright-core install`, `playwright/cli.js install` and
     `@playwright/test install`, with a version suffix and quotes; an install the text does not match (a wrapper script, an
     action that installs for you, a composite action called through another composite action) is not seen.

HOW A STEP IS CLASSIFIED (and why not by a word)

A step needs a browser when some command it runs starts a PROGRAM that launches one: `node <entry> [args]`, directly or
through `npm run X` (resolved in package.json, with its `preX`/`postX` hooks), where the ENTRY script itself imports
playwright or calls chromium.launch, and the arguments do not include `--self-test`. Decisions, each measured:

  - ENTRY ONLY. A module that imports a browser script does not launch anything: this repo's import-purity check
    ("Importing a module never runs it") requires every module with side effects to sit behind isMain(). A mechanical
    read that followed imports called 8 steps browser steps that two independent readers, who read the sources, called
    browser-free (check-live-probe-keys imports live-score-probe and never launches). A preload (`node -r`, `--import`)
    DOES run, so it is read too.
  - `--self-test` NEVER LAUNCHES. Every script that has one handles it before it reaches its launch, and exits. Measured
    2026-11-12 by two independent reviewers: every `--self-test` of a browser-free step run with a playwright that throws
    on launch, a positive control launching under the same stub: 0 launches (the second counted 61 distinct self-test
    scripts used by the 76 browser-free steps); and for the five split out of the gated steps,
    outbox/self-tests-no-launch-2026-11-12.txt. NOT enforced by this file: a one-token edit to a script could change it, and
    docs/CC-CMD-2026-11-11-runner-apt-mirror-dns.md carries that item.
  - A SCRIPT THAT SPAWNS ONE IS A BROWSER STEP. An entry script that imports child_process and names, by file name, a script that
    launches a browser (directly, or through another such spawner, to a depth of SPAWN_DEPTH) is read as launching one:
    `scripts/mutation-check.mjs` runs each mutation's `expect:` command (for example `node scripts/spark-check.mjs`) in a child.
    It over-approximates (a name in a table that is never run) and fails closed. The arguments with which a spawner runs none of
    what it names are READONLY_MODES (`--anchors`, `--stranded` of mutation-check, the only ones a workflow uses), and
    scripts/no-launch-check.mjs is TRAPPED (it runs browser scripts only under a trap). The one flag that changes the reading is
    `mutation-check.mjs --no-browser` (NO_BROWSER_FLAGS): it is browser-free only in the audit of a target, and only for a step
    whose `if` is `steps.chromium.outcome != 'success'` (the step then runs after a failed install and never after a good one).
    Those claims, and every `--self-test`, are
    kept true at run time by scripts/no-launch-check.mjs, which reads the commands from `--plain-commands`. Not read: a spawn
    whose script name is built at run time, and a python script that spawns a browser script.
  - A WORD IS NOT A USE. Comment lines and trailing comments are dropped before looking, and `playwright install` is
    the install itself.
  - FAIL CLOSED. The reader tokenizes each command line like a shell and understands `node`, `npm run`/`test`/`ci`,
    `python3`, `npx playwright` and a short list of commands that cannot start a browser (SAFE_HEADS). Anything else, a
    wrapper (`timeout`, `env`, `xvfb-run`, `bash -c`, `time`, `exec`, `xargs`), a command substitution inside quotes, a
    heredoc or process substitution, a script with no extension, an npm pass-through argument, a missing script or a
    cycle, a node flag in the `--opt=value` form that is not understood, NODE_OPTIONS or PATH set in front of a command (or npm's own
    spelling of them, `npm_config_node_options`, `NPM_CONFIG_SCRIPT_SHELL`: DANGEROUS_VARS and NPM_CONFIG_DANGEROUS), is
    UNRESOLVED and refused: the author writes the plain form, or gates the step on the install. Before the 2026-11-12
    review this reader dropped what it did not parse and called the step browser-free; seven forms of that were reproduced,
    and a second review found twelve more (a `#` inside a word, `--import=`, `<( )`, `NODE_OPTIONS=` and others), now fixed. `node -e CODE` is read
    only when CODE is a closed grammar that can start no program (INLINE_ROOTS, INLINE_PROPS); a step that cannot be read and runs `if: always()`
    is kept as opaque only when every command on its unreadable lines is an allowed head (raw_line_hides), never because it is not a known wrapper.
  - ONLY STEPS AFTER THE INSTALL must be fully readable. A step before it that needs a browser fails with or without
    the gate; for those the reader only looks for a definite launch.

The classification was checked against two independent readers per step, with a judge for disagreements, over the 90 steps
with a `run` script among the 95 that follow the install at 3528bb5 (the other five are four `upload-artifact` steps and
the final step): outbox/verify-step-browser-classification-2026-11-12.json.

THIS FILE IS NOT RUN FROM THE `verify` JOB, and must not be: its self-test fixtures embed launch calls as strings, so the text
rule reads it as a browser script (checked in its self-test). It has its own job, `browser-gate`, which is also why an outage of
the install cannot park it.

READ-ONLY on the repository: it parses workflow YAML and reads scripts. The one thing it RUNS is the final step's script
(rule 4), and only after the closed grammar has shown it can do nothing but print and exit: in an empty temporary
directory with a minimal environment.
"""
import itertools
import json
import os
import re
import shlex
import subprocess
import sys
import tempfile
import time
from pathlib import Path

try:
    import yaml
except ImportError:  # pragma: no cover - the runner image has it; a dev box without it must say so, not skip
    sys.exit("check-browser-gate.py needs PyYAML (python3 -m pip install pyyaml)")

WORKFLOW = ".github/workflows/verify.yml"
JOB = "verify"
INSTALL_ID = "chromium"
MIN_STEPS = 60          # coverage floors: a classifier that reads nothing must not pass
MIN_BROWSER = 10
MIN_PLAIN = 30
# The jobs that get the whole shape (install continue-on-error, browser steps gated, a final red step), each with its own floors
# (steps read, browser steps, browser-free steps). Every OTHER place that installs a browser is EXEMPT and says so in an annotation
# above its install: see EXEMPT_NOTE.
TARGETS = [
    {"file": WORKFLOW, "job": JOB, "floors": (MIN_STEPS, MIN_BROWSER, MIN_PLAIN)},
    {"file": ".github/workflows/live-check.yml", "job": "live", "floors": (8, 5, 2)},
    # A composite action has no job: its steps are under `runs`, and `job` is None.
    {"file": ".github/actions/mutation-shard/action.yml", "job": None, "floors": (5, 1, 3), "flagged": ("scripts/mutation-check.mjs",)},
    {"file": ".github/workflows/verify-full.yml", "job": "full", "floors": (7, 2, 4), "flagged": ("scripts/confidence.mjs",)},
]
# A comment line: its indentation, N (ASCII digits, no leading zero) and a reason that begins with a word character (a bare `--` or spaces is none).
EXEMPT_NOTE = re.compile(r"^(\s*)#\s*browser-gate:\s*exempt\s+(0|[1-9][0-9]{0,3})\s+--\s+(\w.*?)\s*$")
EXEMPT_REACH = 40       # the annotation sits within this many lines above the install command
FINAL_OUTCOMES = ("failure", "skipped", "cancelled", "")   # what steps.chromium.outcome can be when the final step runs
# What the outcome of ANY other step can be when the final step reads it (`GATE_OUTCOME: ${{ steps.<id>.outcome }}`): the final step has to fail for each, with each outcome of the install.
ANY_OUTCOMES = ("success", "failure", "skipped", "cancelled", "")
STEP_OUTCOME = re.compile(r"\$\{\{\s*steps\.([\w-]+)\.outcome\s*\}\}")
FINAL_TIMEOUT = 20

# CALLS AND IMPORTS, NOT WORDS. A word match read this very file (its docstring and its regex literals name every token
# below) as a browser script. `chromium.launch(` and `launchPersistentContext(` need the call, `PW_CHROMIUM` needs to be
# READ (process.env or an environ lookup), and the python import needs a line of its own: re.MULTILINE, or `^` would only
# ever match the first line of the file.
LAUNCH = re.compile(
    r"""from\s+['"]playwright(?:-core)?['"]|require\(\s*['"]playwright(?:-core)?['"]\s*\)|"""
    r"""import\(\s*['"]playwright|chromium\.launch\s*\(|launchPersistentContext\s*\(|"""
    r"""process\.env\.PW_CHROMIUM|environ[^\n]{0,24}PW_CHROMIUM|"""
    r"""^\s*(?:import|from)\s+playwright\b""",
    re.MULTILINE,
)
# A SCRIPT THAT SPAWNS A BROWSER SCRIPT launches one without ever importing playwright: it imports child_process and names the script (`scripts/mutation-check.mjs`
# runs each mutation's `expect:` command, for example `node scripts/spark-check.mjs`, in a child). Reading only the entry script called such a step browser-free
# (docs/CC-CMD-2026-11-11-runner-apt-mirror-dns.md, item 2). A script is a SPAWNER when its code imports child_process, and it spawns a browser when it names, by file
# name, a script that launches one directly or through another spawner. That over-approximates (a name in a table that is never run) and fails closed.
CHILD_PROCESS = re.compile(r"""from\s+['"](?:node:)?child_process['"]|require\(\s*['"](?:node:)?child_process['"]\s*\)|import\(\s*['"](?:node:)?child_process['"]""")
# A script name as a spawner writes it: bare (`spark-check.mjs`), under scripts/, path-qualified (`./scripts/x.mjs`, `../scripts/x.mjs`), behind a variable
# (`${ROOT}/scripts/x.mjs`) or inside `new URL('./x.mjs', import.meta.url)`. The old pattern refused any name that a `/` preceded, so every one of those was invisible (review
# 2026-11-15, finding 2). A match is resolved by script_candidates(); one that is no file is no name.
# At most 200 characters of name: an unbounded run of name characters made the search quadratic on a long token (round 2 of the review, finding 6: 20,000 characters took 1.4 s).
SCRIPT_NAME = re.compile(r"""[\w.${}/-]{1,200}\.(?:mjs|cjs|js|py)\b""", re.I)
# What a module imports is not what it runs: `import { x } from './gate-checks.mjs'` names a module and spawns nothing (the ENTRY ONLY decision below). The specifier is blanked before the names are read.
IMPORT_SPEC = re.compile(r"""(?:\bfrom|\bimport\s*\(|\brequire\s*\()\s*['"][^'"]*['"]""")
SPAWN_DEPTH = 6
# The arguments with which a spawner runs none of the scripts it names. Each entry is a claim, kept true at run time by scripts/no-launch-check.mjs (which runs these
# commands under a trap that logs any browser launch, children included) and read from this table by `--plain-commands`.
# `*` is every argument: scripts/import-purity-check.mjs imports each exporting module in a child to prove that importing runs nothing, and names scripts/mutation-check.mjs as
# DATA in its own self-test; importing a browser script must launch nothing, which is the property it checks.
# `scripts/network-exempt-check.mjs` names scripts/run-row.mjs, which runs any gate row, but it runs only the browser-free rows it lists (NETWORK_EXEMPT) under a preload that blocks the network; it is measured under
# the trap like the others (plain_commands lists it), and was an expectation that passed with no browser on disk (outbox/no-browser-expectations-2026-11-15.txt).
READONLY_MODES = {"scripts/mutation-check.mjs": ("--anchors", "--stranded"), "scripts/import-purity-check.mjs": ("*",), "scripts/network-exempt-check.mjs": ("*",)}
# A script that runs browser scripts only under that trap: it never launches a real browser, whatever its arguments. Its own text embeds launch calls (its fixtures), so the text
# rule is skipped for it as well as the spawner rule.
TRAPPED = frozenset({"scripts/no-launch-check.mjs"})
# A script that RUNS THE GATE'S ROWS is a browser step whatever its text says: it imports scripts/gate-checks.mjs (an import is no spawn, above) and calls each row's `run`, and a third of
# the rows drive a browser. Before this table `npm run gate` read as a browser step by coincidence, because a log message in confidence.mjs happened to name mutation-check.mjs (review
# 2026-11-15, finding 2). The claim is kept true by gate_row_problems(), which requires the rows flagged `browser` to be exactly the rows that read as driving one, and at least MIN_BROWSER_ROWS.
RUNS_ROWS = frozenset({"scripts/confidence.mjs", "scripts/run-row.mjs"})
# ...and so is any script that does what they do, by its text: it imports scripts/gate-checks.mjs and calls a row's `run`. A new row runner, or a wrapper that names one, is read as a browser step
# without being added to RUNS_ROWS (round 2 of the review, finding 4).
IMPORTS_ROWS = re.compile(r"""['"][\w./-]*gate-checks\.mjs['"]""")              # a static import, `import(...)`, `require(...)`, from any directory
RUNS_A_ROW = re.compile(r"""\.run\s*\??\.?\s*\(|\[\s*['"]run['"]\s*\]\s*\??\.?\s*\(|\{\s*run\s*\}""")   # r.run(), r.run?.(), r['run'](), for (const { run } of rows)
# The heads that run another command: an unreadable step whose unreadable part is one of THESE may be hiding a browser launch (`timeout 60 node scripts/x.mjs`), and is not the ledger kind of opaque.
WRAPPER_HEADS = frozenset({"timeout", "env", "xvfb-run", "bash", "sh", "exec", "xargs", "time", "nice", "nohup", "setsid", "stdbuf", "sudo", "command", "builtin", "watch", "parallel", "ionice", "doas", "chroot"})
WRAPPER_REASON = re.compile(r"^`([^`]*)`: `([^`]+)` is not a command this guard can read")
# What an unreadable step may be made of and still be kept as opaque (the ledger steps of verify-full are these): text and file tools, which run no other command, a substitution or heredoc that hides a
# whole line (the raw line is scanned, below), a git subcommand that only reads (GIT_READONLY), and inline node whose code is a closed grammar of its own (INLINE_ROOTS: read_node reads it, so it is no
# reason at all). Every OTHER reason (an unknown head, `npx`, `dotnet`, a flag, a variable that changes what runs, `git rebase -x`, `node --run`) makes the step a candidate for a hidden launch: a denylist of
# wrappers refused `timeout` and let `eval`, `flock`, `strace`, `source`, `./x.sh` and `make` through. Review of 48f504e, finding 23: the allowlist used to name EVERY `git X is not a subcommand` and every
# `node with inline code` reason, and `git rebase -x 'node scripts/render-check.mjs'`, `git -c alias.s='!cmd' s`, `node -e "...execSync(...)"` and `node --run <package script>` each run a command; it also
# let any two-word command that looked like `a -b` through as "arithmetic" (`make -s`, `deno -A`). Arithmetic is masked where the line is split (ARITH_EXPANSION), so it is no longer a reason to read.
BENIGN_HEADS = frozenset({"mktemp", "grep", "egrep", "fgrep", "sed", "awk", "read", "cat", "tee", "cut", "tr", "sort", "uniq", "head", "tail", "wc", "date", "basename", "dirname", "mkdir", "rm", "cp", "mv",
                          "ls", "sleep", "jq", "diff", "cmp", "tac", "touch", "stat", "wait"})
OPAQUE_REASON_OK = [re.compile(x) for x in (r": a command substitution inside a word$", r": a process substitution$", r": a heredoc$", r": unbalanced quoting")]
# The git subcommands that only read the repository and run nothing: the ones an unreadable step may use and stay opaque (`git merge-base --is-ancestor` is the ledger's). Not GIT_SUBS: those are read by
# read_git and are no reason at all. `-c`, `-C`, `rebase`, `bisect`, `submodule`, `filter-branch` and the aliases a config defines are not here, because each runs something.
GIT_READONLY = frozenset({"merge-base", "rev-list", "symbolic-ref", "describe", "cat-file", "for-each-ref", "show-ref", "ls-tree"})
GIT_REASON = re.compile(r"^`[^`]*`: git (\S+) is not a subcommand this guard reads")
# A command word on a RAW line (one the splitter could not split) is allowed when it is one of these: the benign tools, the safe heads, and the words that open or close a shell construct and run nothing.
RAW_WORDS = frozenset({"for", "select", "case", "esac", "fi", "done", "in", "}", ":"})
# Where a command starts on a raw line: after the start, `;`, a pipe, `&` (so `&&`), `(` (so `$(`), a backtick, a standalone `{` or `!` (a word of its own: not the `{` of `${x}` or the `!` of `a!b`), and the keywords that precede one.
# Review of 48f504e, finding 22: the head used to be `(\S+)`, which swallowed a `;` or `(` written without a space, so a wrapper after `echo "at $(date)";` was never a head.
COMMAND_SEP_SYMBOLS = (";", "|", "&", "(", "{", "`", "!")
COMMAND_SEP_WORDS = ("then", "do", "else", "if", "elif", "while", "until")
_SEP_SPELLING = {"{": r"\{(?=\s)", "!": r"(?<![\w$!])!(?=\s)"}
COMMAND_HEAD = re.compile(
    r"""(?:^|""" + "|".join([_SEP_SPELLING.get(s, re.escape(s)) for s in COMMAND_SEP_SYMBOLS] + [rf"\b{w}\b" for w in COMMAND_SEP_WORDS]) + r""")\s*"""
    r"""(?:[A-Za-z_]\w*=(?:[^\s;|&()<>`"']|"[^"]*"|'[^']*')*\s+)*["']*"""                          # VAR=value words (quoted values too) and a quote before the head
    r"""(?!(?:""" + "|".join(COMMAND_SEP_WORDS) + r""")\b|[{!](?:\s|$))([^\s;|&()<>`"']+)""")
# An arithmetic expansion, `$((attempt * 3))`: only names, numbers, `$name` and the operators, so it runs nothing and cannot hold a substitution. It is replaced by `0` before a line is split or searched for heads.
ARITH_EXPANSION = re.compile(r"\$\(\([\w\s$+*/%-]*\)\)")
# What a REQUIRED no-browser step (TARGETS[...]["flagged"]) has to do as real work. The rule that a target RUNS its no-browser spawner was met by any step with the right `if` that names the spawner and
# its flag (`mutation-check.mjs --list-ids --no-browser`, `confidence.mjs --quick --browserless`, `... || true`), so it is a closed form now: every line is one `node`/`npm` command (no `||`, `&&`, `;`, pipe
# or substitution) or the bare `if [ -n "$X" ]; then`, `else`, `fi`; nothing but the spawner runs; the arguments a mode that does no work would carry are refused (NOT_WORK), and the arguments real work
# carries (WORK_ARGS) are each present in some command, so deleting one branch of the shard action's if/else is seen. The threat model is a careless edit, not a deliberate one: `if [ -n "$NEVER" ]` passes.
NOT_WORK = {"scripts/mutation-check.mjs": ("--self-test", "--list-ids", "--anchors", "--stranded", "--heal", "--only"), "scripts/confidence.mjs": ("--quick", "--self-test", "--help")}
WORK_ARGS = {"scripts/mutation-check.mjs": ("--ids", "--shard", "--out"), "scripts/confidence.mjs": ()}
FORBIDDEN_IN_LINE = re.compile(r"\|\||&&|[;|&<>`]|\$\(")
# A spawner that can be told it has NO browser. `mutation-check.mjs --no-browser` classes an expectation that cannot launch one (Playwright's missing-browser text) as not applicable
# and runs the rest; without the flag it is a browser step. The flag is read as browser-free ONLY inside the audit of a target, and only for a step whose `if` makes it run solely when
# the install did NOT succeed (no_browser_if), so it never runs with a browser installed. The claim is kept true by scripts/mutation-check.mjs (its self-test runs it end to end against
# a row that cannot launch) and was proved on a runner whose install failed (docs/CC-CMD-2026-11-11-runner-apt-mirror-dns.md, items 7 and 6). `confidence.mjs --browserless` is the same
# kind of claim, and one this file can also check against its source: gate_row_problems() reads scripts/gate-checks.mjs and requires the rows flagged `browser` to be exactly the rows
# whose commands read as driving one.
NO_BROWSER_FLAGS = {"scripts/mutation-check.mjs": "--no-browser", "scripts/confidence.mjs": "--browserless"}
INSTALL_CMD = re.compile(r"(?:\bplaywright(?:-core)?(?:/cli\.js)?|@playwright/test)(?:@[^\s'\"]+)?['\"]?\s+install\b")


def is_install(step):
    """The step whose COMMANDS install the browser (a comment that mentions the command is not one)."""
    return bool(INSTALL_CMD.search("\n".join(logical_lines(run_text(step)))))


OUTCOME = re.compile(r"steps\.([\w-]+)\.outcome")
GATE_CLAUSE = f"steps.{INSTALL_ID}.outcome == 'success'"
FINAL_CLAUSES = ["always()", f"steps.{INSTALL_ID}.outcome != 'success'"]
# The clauses a browser step's `if` may carry besides the gate. Every one can only keep the step running or leave the gate
# to decide. `failure()`, `steps.x.outcome == 'failure'|'cancelled'|'skipped'` and `!=` forms are not here: AND-ed onto the
# gate they make the step run only when something else already failed, which is never on a good commit.
NO_BROWSER_CLAUSE = f"steps.{INSTALL_ID}.outcome != 'success'"
NO_BROWSER_EXTRA = re.compile(r"^(?:always\(\)|success\(\)|!cancelled\(\))$")
GATE_EXTRA = re.compile(r"^(?:always\(\)|success\(\)|!cancelled\(\)|steps\.[\w-]+\.outcome == 'success')$")


def clauses(cond):
    """The `&&`-joined clauses of an `if`, normalised, or None if it has `||` or is empty."""
    c = re.sub(r"^\s*\$\{\{\s*|\s*\}\}\s*$", "", cond or "")
    if "||" in c or not c.strip():
        return None
    return [re.sub(r"\s+", " ", re.sub(r"\s*(==|!=)\s*", r" \1 ", p.strip())) for p in c.split("&&")]


def gated_if(cond):
    cl = clauses(cond)
    return cl is not None and GATE_CLAUSE in cl and all(GATE_EXTRA.match(p) for p in cl)


def is_final_if(cond):
    cl = clauses(cond)
    return cl is not None and sorted(cl) == sorted(FINAL_CLAUSES)


def no_browser_if(cond):
    """The `if` of a step that runs with a spawner's no-browser flag: `steps.chromium.outcome != 'success'`, joined only by `&&` to always(), success() or !cancelled(). It runs after a
    failed install and never after a good one."""
    cl = clauses(cond)
    return cl is not None and NO_BROWSER_CLAUSE in cl and all(p == NO_BROWSER_CLAUSE or NO_BROWSER_EXTRA.match(p) for p in cl)


def always_if(cond):
    """Exactly `always()`: a step with it runs whether or not the install succeeded, so the install cannot skip it."""
    return re.sub(r"^\s*\$\{\{\s*|\s*\}\}\s*$", "", cond or "").strip() == "always()"


def is_false_if(cond):
    """A bare `false` (YAML reads an unquoted one as the boolean False) or `0`."""
    return cond is not None and bool(re.fullmatch(r"(?:\$\{\{\s*)?(?:false|0)(?:\s*\}\})?", str(cond).strip().lower()))


def truthy(v):
    """continue-on-error is on unless it is absent or a literal false. An expression cannot be evaluated here: on."""
    return v not in (None, False, "false", "False")


# ---------------------------------------------------------------- reading steps and commands
def job_steps(doc, job=JOB):
    if job is None:                     # a composite action: its steps are under `runs`
        return ((doc or {}).get("runs") or {}).get("steps") or []
    return (((doc or {}).get("jobs") or {}).get(job) or {}).get("steps") or []


def run_text(step):
    r = step.get("run")
    return r if isinstance(r, str) else ""


def if_text(step):
    """The `if` as text, with bracket notation (`steps['chromium'].outcome`) written as the dotted form it means."""
    c = step.get("if")
    return "" if c is None else re.sub(r"\[\s*['\"]([\w-]+)['\"]\s*\]", r".\1", str(c))


def env_map(step):
    """The `env` of a step as a mapping: a string (`${{ fromJSON(...) }}`) or a list is no mapping, and reads as empty rather than crashing the guard."""
    e = step.get("env")
    return e if isinstance(e, dict) else {}


def logical_lines(script):
    """A script's command lines: continuations joined, whole-line comments dropped."""
    out, cur = [], ""
    for raw in script.splitlines():
        line = raw.rstrip()
        if line.lstrip().startswith("#"):
            continue
        if line.endswith("\\"):
            cur += line[:-1] + " "
            continue
        out.append((cur + line).strip())
        cur = ""
    if cur:
        out.append(cur.strip())
    return [l for l in out if l]


class Unreadable(Exception):
    pass


def strip_comment(line):
    """Bash starts a comment only at a `#` that BEGINS a word, outside quotes: `$#`, `${x##*/}` and `/#top` are not comments
    (shlex's commenters would drop the rest of the line at each of them, and a command after it would go unread)."""
    out, q, i = [], None, 0
    while i < len(line):
        c = line[i]
        if q:
            out.append(c)
            if q == '"' and c == "\\" and i + 1 < len(line):
                i += 1
                out.append(line[i])
            elif c == q:
                q = None
        elif c == "\\" and i + 1 < len(line):
            out.append(c)
            i += 1
            out.append(line[i])
        elif c in "'\"":
            q = c
            out.append(c)
        elif c == "#" and (not out or out[-1].isspace() or out[-1] in ";&|()"):
            break
        else:
            out.append(c)
        i += 1
    return "".join(out)


SEPARATORS = {"&&", "||", "|&", ";;", ";", "|", "&", "(", ")"}
REDIRECTS = {">", ">>", ">&", "<", "<<<"}
OPERATORS = re.compile(r"&&|\|\||\|&|;;|;|\||&|\(|\)|>>|>&|<<<|<<|<|>")
PREFIX_WORDS = {"if", "then", "else", "elif", "do", "while", "until", "!", "{", "}", "fi", "done", "esac"}
# Commands that cannot start a program of this repo's. `cd` is not here on purpose: it would make every later relative path
# mean something else. `curl` fetches; piping it to a shell makes the shell a command of its own, which is unresolved.
SAFE_HEADS = frozenset({"echo", "printf", "exit", "sleep", "curl", "break", "continue", "seq", "true", "false", "test", "[", "[[",
                        "export", "unset", "set", "cat", "mkdir", "tr"})
GIT_SUBS = frozenset({"config", "add", "commit", "push", "pull", "fetch", "rev-parse", "status", "diff", "log", "show", "checkout", "switch",
                      "reset", "merge", "rm", "mv", "ls-files", "ls-remote", "remote", "tag", "branch"})
DOTNET_SUBS = frozenset({"fable", "build", "restore"})
ACTIONS_OK = ("actions/checkout@", "actions/setup-node@", "actions/setup-dotnet@", "actions/setup-python@",
              "actions/upload-artifact@", "actions/download-artifact@", "actions/cache@")
NODE_PRELOAD = {"-r", "--require", "--import", "--loader", "--experimental-loader"}
NODE_PRELOAD_EQ = ("--require=", "--import=", "--loader=", "--experimental-loader=")
NODE_ARG = {"--input-type", "-C", "--conditions", "--env-file", "--title", "--stack-trace-limit"}
NODE_INLINE = {"-e", "--eval", "-p", "--print", "-i", "--interactive", "-", "--run"}
NODE_INLINE_EQ = ("--eval=", "--print=", "--run=")
# Inline code is read, not refused outright, when it is nothing but a closed grammar that can start no program: the words are the three globals INLINE_ROOTS, a property from INLINE_PROPS after a `.`,
# or the one parameter of an arrow function (`d=>`); the punctuation is `( ) , .` and `=>`; the only other tokens are quoted strings (no template literal) and numbers. No `[` (so no `process['x']`), no
# `require`, `import`, `eval`, `Function`, `this`, `globalThis`, `constructor`, `binding`, `mainModule`: none of them is a word of the grammar. The ledger step of verify-full (`Record this measurement`)
# parses the JSON of a push with `node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d.toString()).id))'`, and is the one inline use in the target jobs. `-p`/`-e` and their `=` forms are
# the ones that take code; `-i`, `-` (stdin) and `--run` (a package script) run something else and stay unreadable. Review of 48f504e, finding 23: every inline use used to be an allowed reason.
NODE_EVAL = {"-e", "--eval", "-p", "--print"}
NODE_EVAL_EQ = ("--eval=", "--print=")
INLINE_ROOTS = frozenset({"process", "console", "JSON"})
INLINE_PROPS = frozenset({"stdin", "on", "log", "error", "parse", "stringify", "toString", "id"})
INLINE_TOKEN = re.compile(r"""\s*(?:(?P<str>'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*")|(?P<num>\d+(?:\.\d+)?)|(?P<arrow>=>)|(?P<punct>[(),.])|(?P<id>[A-Za-z_$][\w$]*))""")


def inline_code_is_pure(code):
    """Whether `node -e CODE` runs nothing but the closed grammar above: it cannot start a program, so it is browser-free whatever else the step does."""
    code, pos, toks = code.strip(), 0, []
    while pos < len(code):
        m = INLINE_TOKEN.match(code, pos)
        if m is None or m.end() == pos:
            return False
        toks.append((m.lastgroup, m.group(m.lastgroup)))
        pos = m.end()
    params = {toks[k][1] for k in range(len(toks) - 1) if toks[k][0] == "id" and toks[k + 1][0] == "arrow" and not (k and toks[k - 1] == ("punct", "."))}
    for k, (kind, val) in enumerate(toks):
        if kind == "id" and not (val in INLINE_PROPS if k and toks[k - 1] == ("punct", ".") else val in INLINE_ROOTS or val in params):
            return False
    return bool(toks)
# Variables that change WHAT a command runs without appearing in it: a preload through NODE_OPTIONS, a shadowing PATH.
DANGEROUS_VARS = frozenset({"NODE_OPTIONS", "NODE_PATH", "PATH", "BASH_ENV", "ENV", "LD_PRELOAD", "PYTHONSTARTUP", "PYTHONPATH", "PYTHONHOME"})
# npm has its own spelling of some of those, and reads it from the environment: `npm_config_<key>`, in ANY letter case, with `_` for `-` (@npmcli/config loadEnv, npm 10.9.4:
# `/^npm_config_/i`, then `key.replace(/(?!^)_/g, '-').toLowerCase()`). `npm_config_node_options` is NODE_OPTIONS for every node npm starts (a preload into each script, which the guard
# refused only under its own name), and `NPM_CONFIG_SCRIPT_SHELL` is the shell `npm run` hands the script to (review of 48f504e, finding 29: both read as `npm run <browser-free script>`).
# Read from npm's own config reference (docs/content/using-npm/config.md), the keys that change WHICH command `npm run` executes: `script-shell` and `node-options` (how a script is started),
# `prefix` ("forces non-global commands to run in the specified folder": another package.json), `workspace`, `workspaces` and `include-workspace-root` (the same script of another package) and
# `userconfig`, `globalconfig` (a config file that sets any of the above). NOT `shell`: the docs say it is the shell of `npm explore`, and the guard refuses `npm explore` as a subcommand it does not read.
NPM_CONFIG_DANGEROUS = frozenset({"script-shell", "node-options", "prefix", "userconfig", "globalconfig", "workspace", "workspaces", "include-workspace-root"})


def npm_config_key(name):
    """The npm config key an environment variable name sets, as npm reads it, or None when the name is no `npm_config_` one."""
    m = re.match(r"npm_config_(.*)$", str(name), re.I | re.S)
    return None if m is None else re.sub(r"(?!^)_", "-", m.group(1)).lower()


def dangerous_var(name):
    """Whether setting this variable changes what the commands of a step run: DANGEROUS_VARS, or an `npm_config_` spelling of an npm key that does (NPM_CONFIG_DANGEROUS)."""
    return str(name) in DANGEROUS_VARS or npm_config_key(name) in NPM_CONFIG_DANGEROUS


INSTALL_LINE = re.compile(r"^(?:timeout(?: --kill-after=\d+)? \d+ )?npx playwright install(?: [\w-]+)*$")
FINAL_HEADS = frozenset({"echo", "exit", "[", "test"})
PY_FLAGS = {"-I", "-B", "-u", "-E", "-s", "-S", "-O", "-q"}
NPM_FLAGS = {"-s", "--silent", "-q", "--quiet", "--no-audit", "--no-fund", "--no-update-notifier", "--if-present"}
SCRIPT_FILE = re.compile(r"^[\w./\-]+\.(?:mjs|cjs|js)$")
PY_FILE = re.compile(r"^[\w./\-]+\.py$")
MAX_DEPTH = 16


def split_commands(line):
    """The words of each simple command on one logical line. Raises Unreadable on a shape that is not read."""
    line = ARITH_EXPANSION.sub("0", line)          # `sleep $((attempt * 3))`: arithmetic runs nothing; its words must not read as a command `attempt`
    try:
        lex = shlex.shlex(strip_comment(line), posix=True, punctuation_chars=True)
        lex.whitespace_split = True
        lex.commenters = ""
        toks = list(lex)
    except ValueError as e:
        raise Unreadable(f"unbalanced quoting ({e})")
    flat = []
    for t in toks:
        if "`" in t or "$(" in t:
            raise Unreadable("a command substitution inside a word")
        if t and all(c in "();<>|&" for c in t):
            flat.extend(OPERATORS.findall(t))      # `);` is two operators, `&&` one
        else:
            flat.append(t)
    groups, cur, i = [], [], 0
    while i < len(flat):
        t = flat[i]
        if t in SEPARATORS:
            groups.append(cur)
            cur = []
        elif t == "<<":
            raise Unreadable("a heredoc")
        elif t in REDIRECTS:
            if i + 1 < len(flat) and flat[i + 1] == "(":
                raise Unreadable("a process substitution")
            i += 1                                 # the redirect's target is not a word of the command
            if cur and cur[-1].isdigit():          # nor is the fd in `2>&1`
                cur.pop()
        else:
            cur.append(t)
        i += 1
    groups.append(cur)
    return [g for g in groups if g]


def command_words(group):
    """The command itself: leading keywords (`if`, `then`, `do`, `!`...) and VAR=value assignments removed."""
    w = list(group)
    while w and (w[0] in PREFIX_WORDS or re.match(r"^[A-Za-z_]\w*=", w[0])):
        w.pop(0)
    return w


def read_node(w, out, shown):
    i, preloads, inline = 1, [], False
    while i < len(w):
        a = w[i]
        if a in NODE_EVAL or a.startswith(NODE_EVAL_EQ):
            code = a.split("=", 1)[1] if a not in NODE_EVAL else (w[i + 1] if i + 1 < len(w) else "")
            if not inline_code_is_pure(code):
                out["unresolved"].append(f"`{shown}`: node with inline code (`{a}`) that is not the closed grammar this guard reads runs code it cannot read")
                return
            inline = True
            i += 1 if a not in NODE_EVAL else 2
            continue
        if a in NODE_INLINE or a.startswith(NODE_INLINE_EQ):
            out["unresolved"].append(f"`{shown}`: node with inline code or a package script (`{a}`) runs code this guard cannot read")
            return
        if a in NODE_PRELOAD:
            if i + 1 < len(w):
                preloads.append(w[i + 1])
            i += 2
            continue
        if a.startswith(NODE_PRELOAD_EQ):
            preloads.append(a.split("=", 1)[1])
            i += 1
            continue
        if a.startswith("-r") and not a.startswith("--") and len(a) > 2:      # `-r./pre.cjs`
            preloads.append(a[2:])
            i += 1
            continue
        if a in NODE_ARG:
            i += 2
            continue
        if a == "--":
            i += 1
            break
        if a.startswith("-"):
            i += 1
            continue
        break
    if inline:                                       # pure inline code: the words after it are its arguments, not a script; a preload (`-r x -e ...`) still runs
        out["entries"] += [(p, []) for p in preloads]
        return
    if i >= len(w) or not SCRIPT_FILE.match(w[i]):
        out["unresolved"].append(f"`{shown}`: node's first non-flag word is {w[i] if i < len(w) else 'missing'!r}, not a .mjs/.cjs/.js file (a flag that takes a separate value? write it as --flag=value)")
        return
    if i > 1 and w[i - 1].startswith("--") and "=" not in w[i - 1] and w[i - 1] not in NODE_ARG and any(SCRIPT_FILE.match(x) for x in w[i + 1:]):
        out["unresolved"].append(f"`{shown}`: `{w[i - 1]}` may take {w[i]!r} as its value and run the later script instead (write the flag as --flag=value)")
        return
    for p in preloads:
        out["entries"].append((p, []))               # a preload runs whatever the arguments are: it never carries `--self-test`
    out["entries"].append((w[i], w[i + 1:]))


def read_python(w, out, shown):
    i = 1
    while i < len(w) and w[i] in PY_FLAGS:
        i += 1
    if i >= len(w) or not PY_FILE.match(w[i]):
        out["unresolved"].append(f"`{shown}`: python's first non-flag word is {w[i] if i < len(w) else 'missing'!r}, not a .py file (-m and -c run code this guard cannot read)")
        return
    out["entries"].append((w[i], w[i + 1:]))


def read_git(w, out, shown):
    sub = w[1] if len(w) > 1 else ""
    if sub not in GIT_SUBS:
        out["unresolved"].append(f"`{shown}`: git {sub or '(nothing)'} is not a subcommand this guard reads (a global flag such as -c or -C runs or moves something it cannot see)")


def read_dotnet(w, out, shown):
    sub = w[1] if len(w) > 1 else ""
    if (sub == "tool" and len(w) > 2 and w[2] == "restore") or sub in DOTNET_SUBS:
        return
    out["unresolved"].append(f"`{shown}`: dotnet {sub or '(nothing)'} is not a subcommand this guard reads (it reads tool restore, fable, build and restore)")


def read_npx(w, out, shown):
    i = 1
    while i < len(w) and w[i] in ("-y", "--yes", "--no-install"):
        i += 1
    pkg = w[i] if i < len(w) else ""
    if re.fullmatch(r"(?:@playwright/test|playwright)(?:@[\w.\-]+)?", pkg):
        sub = w[i + 1] if i + 1 < len(w) else ""
        if sub != "install":
            out["direct"] = True
        return
    out["unresolved"].append(f"`{shown}`: npx of {pkg or 'nothing'!r} runs a package this guard cannot read")


def read_npm(w, pkg, read, seen, depth, out, shown):
    i = 1
    while i < len(w) and w[i].startswith("-"):
        if w[i] not in NPM_FLAGS:
            out["unresolved"].append(f"`{shown}`: npm flag {w[i]!r} is not one this guard understands")
            return
        i += 1
    sub = w[i] if i < len(w) else ""
    rest = w[i + 1:]
    if sub in ("run", "run-script", "rum", "urn"):
        while rest and rest[0].startswith("-") and rest[0] != "--":
            if rest[0] not in NPM_FLAGS:
                out["unresolved"].append(f"`{shown}`: npm flag {rest[0]!r} is not one this guard understands")
                return
            rest = rest[1:]
        if not rest or rest[0] == "--":
            out["unresolved"].append(f"`{shown}`: npm run with no script name")
            return
        extra = rest[1:]
        if extra and extra[0] != "--":
            out["unresolved"].append(f"`{shown}`: npm run with arguments that are not after `--`")
            return
        if "--self-test" in extra:
            out["unresolved"].append(f"`{shown}`: a passed-through `--self-test` goes to the script's LAST command only, which this guard does not model")
            return
        names = [f"pre{rest[0]}", rest[0], f"post{rest[0]}"]     # other pass-through arguments change what the script does, not whether it starts a browser
    elif sub in ("test", "t", "tst"):
        names = ["pretest", "test", "posttest"]
    elif sub == "start":
        names = ["prestart", "start", "poststart"]
    elif sub in ("ci", "install", "i", "install-clean"):
        names = ["preinstall", "install", "postinstall", "prepublish", "preprepare", "prepare", "postprepare"]
    else:
        out["unresolved"].append(f"`{shown}`: npm {sub or '(nothing)'} is not a subcommand this guard reads")
        return
    explicit = names[1] if sub in ("run", "run-script", "rum", "urn", "test", "t", "tst", "start") else None
    for n in names:
        if n not in pkg:
            if n == explicit:
                out["unresolved"].append(f"`{shown}`: package.json has no script {n!r}")
            continue
        body = pkg[n]
        if not isinstance(body, str):
            out["unresolved"].append(f"`{shown}`: package.json script {n!r} is not a string")
        elif n in seen:
            out["unresolved"].append(f"`{shown}`: package.json script {n!r} runs itself (a cycle)")
        elif depth >= MAX_DEPTH:
            out["unresolved"].append(f"`{shown}`: package.json scripts nested more than {MAX_DEPTH} deep")
        else:
            read_commands(body, pkg, read, seen | {n}, depth + 1, out)


def read_commands(script, pkg, read, seen=frozenset(), depth=0, out=None):
    """Everything a script starts: {entries: [(file, args)], direct: bool, unresolved: [why]}."""
    if out is None:
        out = {"entries": [], "direct": False, "unresolved": [], "raw": []}
    for line in logical_lines(script):
        try:
            groups = split_commands(line)
        except Unreadable as e:
            out["unresolved"].append(f"`{line[:80]}`: {e}")
            out["raw"].append(line)                     # a line the splitter could not read still names the scripts it runs
            continue
        for g in groups:
            w = command_words(g)
            assigned = [x.split("=", 1)[0] for x in (list(g[:len(g) - len(w)]) + (list(w[1:]) if w and w[0] == "export" else [])) if re.match(r"^[A-Za-z_]\w*=", x)]
            if any(dangerous_var(a) for a in assigned):
                out["unresolved"].append(f"`{' '.join(g)[:80]}`: it sets {', '.join(a for a in assigned if dangerous_var(a))}, which changes what the commands after it run")
            if not w:
                continue
            head, shown = w[0], " ".join(w)[:80]
            if head in ("for", "select"):
                continue                            # a loop header: its words are data, a $(...) in it is its own command
            if head == "node":
                read_node(w, out, shown)
            elif head == "npm":
                read_npm(w, pkg, read, seen, depth, out, shown)
            elif head in ("python3", "python"):
                read_python(w, out, shown)
            elif head == "npx":
                read_npx(w, out, shown)
            elif head == "git":
                read_git(w, out, shown)
            elif head == "dotnet":
                read_dotnet(w, out, shown)
            elif head in SAFE_HEADS:
                continue
            else:
                out["unresolved"].append(f"`{shown}`: `{head}` is not a command this guard can read (a wrapper such as timeout, env, xvfb-run, bash -c or exec hides what it runs; write `node <script>` or gate the step on the install)")
    return out


def strip_comments(src):
    return "\n".join(l for l in src.splitlines() if not re.match(r"\s*(//|\*|/\*|#)", l))


def entry_launches(path, read):
    """(launches, why-unreadable). A compiled file under build/ that is not built here launches nothing at check time."""
    path = os.path.normpath(path)
    try:
        src = read(path)
    except (OSError, KeyError):
        return (False, None) if path.startswith("build/") else (False, f"cannot read {path}")
    return bool(LAUNCH.search(strip_comments(src))), None


def script_candidates(path, token, read):
    """The files a script name found in `path` can mean: as written (from the repository root), relative to the script's own directory, and by file name under scripts/. A leading
    `${VAR}/` or `$VAR/` is dropped. Nothing outside the repository is one. A name that is no file is no problem: the caller reads nothing from it."""
    bare = re.sub(r"^\$\{?\w+\}?/", "", token)
    out = set()
    for cand in (bare, os.path.join(os.path.dirname(path), token), "scripts/" + os.path.basename(token)):
        cand = os.path.normpath(cand)
        if not cand.startswith("..") and not os.path.isabs(cand):
            out.add(cand)
    return out


def runs_gate_rows(path, read):
    """Whether a script runs the gate's rows: declared (RUNS_ROWS), or imports scripts/gate-checks.mjs and calls a row's `run`."""
    path = os.path.normpath(path)
    if path in RUNS_ROWS:
        return True
    try:
        src = strip_comments(read(path))
    except (OSError, KeyError):
        return False
    return bool(IMPORTS_ROWS.search(src) and RUNS_A_ROW.search(src))


def spawned_browser_scripts(path, read, depth=SPAWN_DEPTH, seen=()):
    """The scripts a script RUNS (it imports child_process and names them by file name) that launch a browser, directly or through another spawner."""
    path = os.path.normpath(path)
    if path in seen or depth <= 0:
        return []
    try:
        src = strip_comments(read(path))
    except (OSError, KeyError):
        return []
    if not CHILD_PROCESS.search(src):
        return []
    out = []
    for token in sorted(set(SCRIPT_NAME.findall(IMPORT_SPEC.sub("", src)))):
        for cand in sorted(script_candidates(path, token, read)):
            if entry_launches(cand, read)[0] or runs_gate_rows(cand, read) or spawned_browser_scripts(cand, read, depth - 1, seen + (path,)):
                out.append(cand)
    return sorted(set(out))


def readonly_mode(entry, args):
    modes = READONLY_MODES.get(os.path.normpath(entry), ())
    return "*" in modes or bool(set(args) & set(modes))


def spawns_browser(entry, args, read, no_browser_ok=False):
    """The browser scripts an entry spawns with these arguments: none for the arguments READONLY_MODES declares and (only when the caller audits a target, which checks the step's `if`) for
    the no-browser flag. A TRAPPED script, and `--self-test`, never get this far: read_step skips them first."""
    entry = os.path.normpath(entry)
    if readonly_mode(entry, args) or (no_browser_ok and NO_BROWSER_FLAGS.get(entry) in args):
        return []
    if runs_gate_rows(entry, read):
        return ["scripts/gate-checks.mjs"]
    return spawned_browser_scripts(entry, read)


def command_heads(line):
    """[(head, rest of the line)] for every command on a raw line, wherever it starts (COMMAND_HEAD)."""
    line = ARITH_EXPANSION.sub("0", line)
    return [(m.group(1), line[m.end():]) for m in COMMAND_HEAD.finditer(line)]


def raw_line_hides(line):
    """Whether a RAW line (one the splitter could not split: a quoted command substitution, a heredoc) may hide a launcher. Every command on it must be an allowed head: the benign tools, the safe heads and the
    words of a shell construct (RAW_WORDS), an assignment, a `git` that is read or only reads, or `node`/`python` with a script file on the line (read_step has scanned that file for a launch). Anything else
    (`npm run X`, `npx playwright ...`, `make`, `eval`, `./x.sh`, `deno`, a `$VAR` head) is a command whose arguments this guard cannot read here. Review of 48f504e, finding 21: the raw line was scanned for
    script names and for wrapper heads only, so `echo "at $(date)" && npm run check:peak` stayed opaque while the same command written plainly is refused."""
    for head, rest in command_heads(line):
        words = rest.split()
        if head in BENIGN_HEADS or head in SAFE_HEADS or head in RAW_WORDS or re.match(r"[A-Za-z_]\w*=", head):
            continue
        if head == "git" and words and words[0] in GIT_SUBS | GIT_READONLY:
            continue
        if head in ("node", "python", "python3") and SCRIPT_NAME.search(line):
            continue
        return True
    return False


def hides_a_launcher(reasons, text=""):
    """Whether an unreadable step may be hiding a launch, and so must NOT be kept as opaque: a reason that is not one of the benign shapes (an unknown head, `npx`, a flag, a git subcommand that is not read-only...),
    a known wrapper (`timeout`, `xvfb-run`, `bash -c`, `env`, `exec`...) as the first word of any command on any line of its raw text, or a raw line with a command on it that is not an allowed head."""
    for r in reasons:
        m = WRAPPER_REASON.match(r)
        if m:
            if m.group(2) in BENIGN_HEADS:
                continue
            return True
        g = GIT_REASON.match(r)
        if g:
            if g.group(1) in GIT_READONLY:
                continue
            return True
        if not any(pat.search(r) for pat in OPAQUE_REASON_OK):
            return True
    for line in logical_lines(text):
        if any(os.path.basename(h) in WRAPPER_HEADS for h, _ in command_heads(line)):
            return True
        try:
            split_commands(line)
        except Unreadable:
            if raw_line_hides(line):
                return True
    return False


def flagged_step_ok(s, req, pkg, read):
    """Whether step `s` runs the spawner `req` with its no-browser flag AS REAL WORK, in a step that runs only after a failed install: the closed form described at NOT_WORK."""
    text = run_text(s)
    if not text or not no_browser_if(if_text(s)):
        return False
    depth, has_else, branch_cmds = 0, False, 0
    for line in logical_lines(text):
        line = strip_comment(line).strip()                                  # a trailing comment is not part of the command: found where bash finds it, at a `#` that begins a word OUTSIDE quotes (`echo "note # x" ; exit 0` has none)
        if re.fullmatch(r'if \[\[? -n "\$\{?\w+\}?" \]\]?; then', line):
            depth, has_else, branch_cmds = depth + 1, False, 0
            continue
        if line == "else":
            if depth != 1 or branch_cmds == 0:
                return False
            has_else, branch_cmds = True, 0
            continue
        if line == "fi":
            if depth != 1 or not has_else or branch_cmds == 0:
                return False                                                  # an `if` without its `else`, or an empty branch: a default run (no ids) would run nothing
            depth = 0
            continue
        if re.match(r"echo ", line) and not FORBIDDEN_IN_LINE.search(line):
            continue
        if not re.match(r"(?:node|npm) ", line) or FORBIDDEN_IN_LINE.search(line) or re.search(r"\s--\s", line):
            return False
        # A branch's work is the spawner, not any `node`/`npm` line: a then-branch of only `npm ci` ran nothing for the `--ids` path (review of 48f504e, finding 24). (That the spawner carries its flag is
        # checked below, for every command of the step.)
        if any(os.path.normpath(e) == req for e, a in read_commands(line, pkg, read)["entries"]):
            branch_cmds += 1
    if depth != 0:
        return False
    entries = [(os.path.normpath(e), a) for e, a in read_commands(text, pkg, read)["entries"]]
    mine = [a for e, a in entries if e == req and NO_BROWSER_FLAGS[req] in a]
    if not mine or len(mine) != len(entries):
        return False
    if any(set(a) & set(NOT_WORK.get(req, ())) for a in mine):
        return False
    return all(any(w in a for a in mine) for w in WORK_ARGS.get(req, ()))


def no_browser_flagged(step, pkg, read):
    """Whether a step runs a spawner (NO_BROWSER_FLAGS) with its no-browser flag."""
    if not run_text(step):
        return False
    return any(NO_BROWSER_FLAGS.get(os.path.normpath(e)) in a for e, a in read_commands(run_text(step), pkg, read)["entries"])


def read_step(step, pkg, read, no_browser_ok=False):
    """{browser: bool, unresolved: [why]} for one step. `no_browser_ok`: read the no-browser flag as browser-free (the audit of a target does, and checks the step's `if`)."""
    res = {"browser": False, "unresolved": []}
    uses = step.get("uses")
    if uses:
        if not str(uses).startswith(ACTIONS_OK):
            res["unresolved"].append(f"uses `{uses}`: an action whose steps this guard cannot read (a composite action can install or launch a browser)")
        return res
    if "run" in step and not isinstance(step["run"], str):
        res["unresolved"].append("`run` is not a string")
        return res
    script = run_text(step)
    if not script:
        return res
    if step.get("shell") not in (None, "bash"):
        res["unresolved"].append(f"shell: {step.get('shell')!r}: the script is not bash, which is the only shell this guard reads")
    if step.get("working-directory") not in (None, "."):
        res["unresolved"].append(f"working-directory: {step.get('working-directory')!r}: relative script paths would mean something else")
    for k in env_map(step):
        if dangerous_var(k):
            res["unresolved"].append(f"env: {k} changes what the commands of this step run")
    out = read_commands(script, pkg, read)
    res["unresolved"] += out["unresolved"]
    res["browser"] = out["direct"]
    for entry, args in out["entries"]:
        if "--self-test" in args or os.path.normpath(entry) in TRAPPED:     # a TRAPPED script embeds launch calls as test fixtures, which only ever run under its trap
            continue
        hit, why = entry_launches(entry, read)
        if why:
            res["unresolved"].append(why)
        if not hit and spawns_browser(entry, args, read, no_browser_ok):
            hit = True
        res["browser"] = res["browser"] or hit
    for raw in out["raw"]:                           # `node scripts/x.mjs --out "$(date)"`: the splitter refused the line, and the script it names is a browser script
        for token in SCRIPT_NAME.findall(IMPORT_SPEC.sub("", raw)):
            if any(entry_launches(c, read)[0] or runs_gate_rows(c, read) or spawned_browser_scripts(c, read) for c in script_candidates("", token, read)):
                res["browser"] = True
    if LAUNCH.search(strip_comments(script)):       # an inline use in the step's own text
        res["browser"] = True
    return res


def needs_browser(step, pkg, read):
    return read_step(step, pkg, read)["browser"]


# ---------------------------------------------------------------- the final step, by effect
def other_outcome_keys(step):
    """The env variables of a step whose value is the outcome of a step OTHER than the install."""
    out = []
    for k, v in env_map(step).items():
        m = STEP_OUTCOME.fullmatch(str(v).strip())
        if m and m.group(1) != INSTALL_ID:
            out.append(str(k))
    return sorted(out)


def run_final(step, outcome, timeout=FINAL_TIMEOUT, others=None):
    """Run the final step's script as the runner runs a step with no `shell:` (`/usr/bin/bash -e {0}`: the job logs print it, and
    there is NO pipefail), with the install's outcome in its env, and the outcome of any other step it reads (`others`: variable -> outcome).
    Only called for a script final_script_problems() accepts."""
    env = {"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "LC_ALL": "C"}
    for k, v in env_map(step).items():
        v = str(v)
        m = STEP_OUTCOME.fullmatch(v.strip())
        if m and m.group(1) == INSTALL_ID:
            env[str(k)] = outcome
        elif m:
            env[str(k)] = (others or {}).get(str(k), "")
        elif "${{" in v:
            raise Unreadable(f"env {k} uses an expression other than steps.<id>.outcome, which this guard cannot evaluate")
        else:
            env[str(k)] = v
    with tempfile.TemporaryDirectory() as d:
        return subprocess.run(["bash", "-e", "-c", run_text(step)], cwd=d, env=env,
                              capture_output=True, text=True, timeout=timeout)


# A `$` in a word of a `[ ]` or `test`: `$NAME` or `${NAME}`, and nothing else (`$?`, `$$`, `$0`, `$-`, `$1`, `${X:-y}`, `${!X}` all differ between the guard's run and the runner's, or hide a lookup).
VAR_REF = re.compile(r"\$(?:\{([^}]*)\}|([A-Za-z_]\w*)|(.?))")


def final_script_problems(script, env_names=()):
    """The final step's script may use ONLY echo, `exit N` (N a literal non-zero integer) and `[ ]`/`test` comparisons, in
    if/elif/else/fi. The guard runs it to see that it fails, and can only know that it fails the same way on the runner if it
    touches nothing the two places differ in: a file (the guard's cwd is empty), a variable the runner sets, a pipe (the
    runner has no pipefail), a redirect, a command that is not one of these. A comparison may read only a variable the step's
    own `env:` defines (`env_names`): the guard's run gives the script PATH, LC_ALL and that env, so `[ "$GITHUB_ACTIONS" != true ]`
    fails here and passes on every runner (review of 48f504e, finding 28). Returns [why]."""
    bad = []
    for line in logical_lines(script):
        try:
            lex = shlex.shlex(strip_comment(line), posix=True, punctuation_chars=True)
            lex.whitespace_split = True
            lex.commenters = ""
            toks = list(lex)
        except ValueError as e:
            bad.append(f"`{line[:60]}`: unbalanced quoting ({e}); each line must be complete")
            continue
        flat = []
        for tok in toks:          # a command substitution is refused by read_step() for EVERY step after the install, this one included
            if tok and all(c in "();<>|&" for c in tok):
                flat.extend(OPERATORS.findall(tok))
            else:
                flat.append(tok)
        stray = [o for o in flat if o in SEPARATORS | REDIRECTS | {"<<"} and o != ";"]
        if stray:
            bad.append(f"`{line[:60]}`: {stray[0]!r} (a pipe, a redirect or a list operator is not reproducible here)")
            continue
        group = []
        for tok in flat + [";"]:
            if tok != ";":
                group.append(tok)
                continue
            w = command_words(group)
            group = []
            if not w:
                continue
            head = w[0]
            if head not in FINAL_HEADS:
                bad.append(f"`{' '.join(w)[:60]}`: `{head}` is not echo, exit or a test")
            elif head == "exit" and not (len(w) == 2 and re.fullmatch(r"[1-9][0-9]*", w[1])):
                bad.append(f"`{' '.join(w)[:60]}`: exit must be followed by a literal non-zero integer")
            elif head in ("[", "test") and any(x.startswith("-") for x in w[1:]):
                bad.append(f"`{' '.join(w)[:60]}`: a file or string operator in a test; compare the outcome with = or !=")
            elif head in ("[", "test"):
                refs = {("$" + m.group(3) if m.lastindex == 3 else m.group(m.lastindex)) for x in w[1:] for m in VAR_REF.finditer(x)}
                foreign = sorted(refs - set(env_names))
                if foreign:
                    bad.append(f"`{' '.join(w)[:60]}`: a test reads {', '.join(f if f.startswith('$') else '$' + f for f in foreign)}, which this guard's run does not set (it gives the script PATH, LC_ALL and the step's own `env:`): "
                               f"compare only a variable the step's `env:` defines")
    return bad


def final_step_problems(step, name, timeout=FINAL_TIMEOUT):
    bad = []        # its `continue-on-error` and `shell` are refused by the rules that read EVERY step, in audit() and read_step()
    if "${{" in run_text(step):
        bad.append(f"the final step {name} interpolates an expression into its script: put it in `env:` (`${{{{ steps.{INSTALL_ID}.outcome }}}}` is the one value this guard substitutes)")
        return bad
    if not run_text(step).strip():
        bad.append(f"the final step {name} has no script to fail with")
        return bad
    grammar = final_script_problems(run_text(step), {str(k) for k in env_map(step)})
    if grammar:
        bad.append(f"the final step {name} must use only echo, `exit N` and `[ ]` comparisons in if/elif/else/fi, so that running it here shows what the runner does: " + "; ".join(grammar[:3]))
        return bad
    failed = []
    keys = other_outcome_keys(step)
    if len(keys) > 3:
        bad.append(f"the final step {name} reads the outcome of {len(keys)} steps besides the install: it is run for every pair of outcomes (4 x 5^{len(keys)} runs), so at most 3 are allowed")
        return bad
    combos = [dict(zip(keys, vals)) for vals in itertools.product(ANY_OUTCOMES, repeat=len(keys))]
    for outcome, combo in itertools.product(FINAL_OUTCOMES, combos):
        label = repr(outcome) + (f" with {', '.join(f'{k}={v!r}' for k, v in combo.items())}" if combo else "")
        try:
            r = run_final(step, outcome, timeout, combo)
        except Unreadable as e:
            bad.append(f"the final step {name}: {e}")
            return bad
        except subprocess.TimeoutExpired:
            failed.append(f"{label}: did not finish in {timeout}s (the same script is not run again for the other outcomes)")
            break
        except FileNotFoundError:
            bad.append("bash was not found, so the final step's script could not be run")
            return bad
        if r.returncode == 0:
            failed.append(f"{label}: exit 0, so the job would be GREEN")
        elif "::error::" not in r.stdout + r.stderr:
            failed.append(f"{label}: exit {r.returncode} but no `::error::` line says why")
    if failed:
        bad.append(f"the final step {name} must exit non-zero and print `::error::` whatever the install's outcome; run under bash it did not for: " + "; ".join(failed))
    return bad


# ---------------------------------------------------------------- the rules
def audit(doc, pkg, read, job=JOB, final_timeout=FINAL_TIMEOUT, flagged=()):
    """Returns (violations, coverage). The workflow, package.json and scripts come in as arguments. `flagged`: the spawners (NO_BROWSER_FLAGS) that must be run with their no-browser flag in a step
    that runs only after a failed install: the rule that a failed install still leaves the browser-free part of their work done is a step that does it, and nothing else required the step to be there."""
    steps = job_steps(doc, job)
    jobdoc = ((doc or {}).get("jobs") or {}).get(job) or {}
    owner = "the composite action" if job is None else f"job `{job}`"
    bad = []
    installs = [i for i, s in enumerate(steps) if is_install(s)]
    if len(installs) != 1:
        return [f"expected exactly one browser-install step in {owner}, found {len(installs)}"], {"steps": len(steps), "browser": 0, "plain": 0, "unreadable": 0, "opaque": 0, "final_ok": 0}
    at = installs[0]
    inst = steps[at]
    name = lambda s: repr(s.get("name") or run_text(s)[:40])
    if inst.get("id") != INSTALL_ID:
        bad.append(f"the install step {name(inst)} must have `id: {INSTALL_ID}` (it has {inst.get('id')!r})")
    if inst.get("continue-on-error") is not True:
        bad.append(f"the install step {name(inst)} must have `continue-on-error: true`, or its failure skips every step after it")
    if truthy(jobdoc.get("continue-on-error")):
        bad.append(f"{owner} has `continue-on-error`: a failed step would leave the job green")
    lines = logical_lines(run_text(inst))
    if len(lines) != 1 or not INSTALL_LINE.match(lines[0]):
        bad.append(f"the install step {name(inst)} must be ONE `npx playwright install ...` command (optionally behind `timeout N`): it has `continue-on-error`, so anything else in it that fails is swallowed and the job is green over it")
    for scope, env in (("job", jobdoc.get("env")), ("workflow", (doc or {}).get("env"))):
        for k in (env or {}):
            if dangerous_var(k):
                bad.append(f"the {scope}'s env sets {k}, which changes what every command in it runs")
    for i, s in enumerate(steps):
        if i != at and truthy(s.get("continue-on-error")):
            bad.append(f"step {name(s)} has `continue-on-error`: its failure is swallowed, so the job can be green over a red step (only the install may have it)")
        if is_false_if(s.get("if")):
            bad.append(f"step {name(s)} has `if: {s.get('if')}`: it never runs")

    ids = {}
    for i, s in enumerate(steps):
        if s.get("id"):
            ids[s["id"]] = i
    for i, s in enumerate(steps):
        for ref in OUTCOME.findall(if_text(s) + " " + " ".join(str(v) for v in env_map(s).values())):
            if ref not in ids or ids[ref] >= i:
                bad.append(f"step {name(s)} reads steps.{ref}.outcome but no earlier step has id `{ref}` (it would evaluate to null)")

    last = len(steps) - 1
    final_at = last if last > at and is_final_if(if_text(steps[last])) else None
    browser, plain, unreadable, opaque = [], [], 0, []
    for i, s in enumerate(steps):
        if i < at:
            if needs_browser(s, pkg, read):
                bad.append(f"step {name(s)} needs a browser but runs BEFORE the install")
            continue
        if i == at:
            continue
        r = read_step(s, pkg, read, no_browser_ok=True)
        if r["unresolved"]:
            if always_if(if_text(s)) and i != last and not r["browser"] and not s.get("uses") and not hides_a_launcher(r["unresolved"], run_text(s)):
                # NOT READ, AND NOT THE INSTALL'S TO SKIP: `if: always()` runs it whatever the install did. The ledger steps of verify-full are these (command substitutions and `node -e`, which
                # the reader refuses); counted and printed, never silently accepted. NOT a step the reader has already seen launch a browser: with no browser it fails, and a step that fails
                # without `continue-on-error` skips every later step that has no status function, which is the outage failure this guard exists to end (review 2026-11-15, finding 1). Nor a `uses:`
                # step: an action the guard cannot read (a local composite action can hold a browser step) is as unread as a command it cannot parse, and is not the ledger kind.
                opaque.append((i, s))
                continue
            unreadable += 1
            for why in r["unresolved"][:3]:
                bad.append(f"step {name(s)} cannot be read, so it cannot be called browser-free: {why}")
        (browser if r["browser"] else plain).append((i, s))

    for i, s in browser:
        if not gated_if(if_text(s)):
            bad.append(f"step {name(s)} needs a browser and must carry `steps.{INSTALL_ID}.outcome == 'success'` in its `if`, joined only by `&&` to always(), success(), !cancelled() or another `steps.<id>.outcome == 'success'` (it has {if_text(s) or 'no if'!r})")
    for i, s in plain:
        if no_browser_flagged(s, pkg, read):
            others = sorted({os.path.normpath(e) for e, a in read_commands(run_text(s), pkg, read)["entries"] if NO_BROWSER_FLAGS.get(os.path.normpath(e)) not in a})
            if others:
                bad.append(f"step {name(s)} carries a no-browser flag and also runs {', '.join(others)}: the step is skipped whenever the install succeeded, so anything else in it is a check that never runs "
                           f"on a good commit (put it in a step of its own)")
            if not no_browser_if(if_text(s)):
                bad.append(f"step {name(s)} runs with a no-browser flag and must carry `steps.{INSTALL_ID}.outcome != 'success'` in its `if`, joined only by `&&` to always(), success() or !cancelled(): "
                           f"without it the flag would run with a browser installed, or the step would be skipped when the install failed (it has {if_text(s) or 'no `if`'!r})")
            continue
        if is_final_if(if_text(s)):         # the final step, wherever it is: if it is not LAST, that is its own message below
            continue
        if f"steps.{INSTALL_ID}" in if_text(s):
            bad.append(f"step {name(s)} needs no browser and must not wait for the install (it has {if_text(s)!r}): an outage would skip it again")
    for req in flagged:
        have = any(flagged_step_ok(s, req, pkg, read) for i, s in plain)
        if not have:
            bad.append(f"{owner} must run `{req} {NO_BROWSER_FLAGS[req]}` as real work in a step whose `if` makes it run only when the install did not succeed (`steps.{INSTALL_ID}.outcome != 'success'`), "
                       f"in the closed form (one `node`/`npm` command per line, no `||` `&&` `;` or pipe, only that spawner, with {', '.join(WORK_ARGS.get(req, ())) or 'its flag'} and none of {', '.join(NOT_WORK.get(req, ())) or 'a mode that does no work'}): "
                       f"without it a failed install leaves the browser-free part of what {req} measures unrun, and nothing else here would notice")
    final_ok = 0
    if final_at is None:
        bad.append(f"the LAST step of {owner} must be the final step, whose `if` is exactly `always() && steps.{INSTALL_ID}.outcome != 'success'`: without one a failed install would leave the job GREEN with every browser step skipped, and any step after it that has no `always()` is skipped by the failure it makes")
    elif not read_step(steps[final_at], pkg, read)["unresolved"]:       # refused above, with its reason: a script the reader cannot read is not run
        fp = final_step_problems(steps[final_at], name(steps[final_at]), final_timeout)
        bad += fp
        final_ok = 0 if fp else len(FINAL_OUTCOMES)
    return bad, {"steps": len(steps) - at - 1, "browser": len(browser), "plain": len(plain), "unreadable": unreadable, "opaque": len(opaque), "final_ok": final_ok}


ROW_START = re.compile(r"^[ \t]*\{[ \t]*name:[ \t]*(['\"])(.+?)\1,[ \t]*weight:[ \t]*(\d+)", re.M)
# A call is a word NOT preceded by `.` or a word character (`res.ok`, `/a/.exec(x)` and `arr.all(...)` are property accesses, not calls of these).
ROW_CALL = re.compile(r"(?<![.\w$])(ok|fails|all|execSync|execFileSync|spawnSync|spawn|exec)\b")
ROW_ARG = re.compile(r"""\(\s*(?:'([^'\\\n]*)'|"([^"\\\n]*)")\s*(?=[,)])""")
ROW_ALL = re.compile(r"""\(\s*((?:'[^'\\\n]*'|"[^"\\\n]*")(?:\s*,\s*(?:'[^'\\\n]*'|"[^"\\\n]*"))*)\s*,?\s*\)""")
ROW_SHARDED = re.compile(r"(?<![.\w$])shardedSuite\s*\(")
# The helpers a row may name instead of an arrow function: they hold no command of a browser script (outboxToday and outboxAccompaniesSource read the outbox and git).
ROW_HELPERS = ("outboxToday", "outboxAccompaniesSource")
# A string that names a command: a script path or a shell command. Every one in a row has to be the argument of a call this reader understands, or it is a command it cannot attribute.
SCRIPTISH = re.compile(r"^\s*(?:[A-Za-z_]\w*=\S*\s+)*(?:node|npm|npx|python3?|bash|sh|xvfb-run|timeout|env)\b|\s(?:\./)?scripts/[\w./-]+\.(?:mjs|cjs|js|py)\b")   # a bare path (`'scripts/x.mjs'`) is a file, not a command
# Strings, template literals, REGULAR EXPRESSION LITERALS (a quote or `//` inside one is no string or comment: `/it's/`, `/^https?:\/\//`) and comments, in the order a JavaScript tokenizer meets them.
# A `/` starts a regular expression only after a token that cannot end an expression (`(`, `,`, `=`, `:`, `[`, `!`, `&`, `|`, `?`, `{`, `}`, `;`, `=>`, `return`): after a name, a number or `)` it is a
# division, spaced or not (`(Date.now() - 0) / 1000 > 0 && ok(...)` had the first `/` read as the start of a regular expression up to the next one, hiding the call between them).
JS_TOKEN = re.compile(r"""('(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`|(?:(?<=[(,=:\[!&|?{};])|(?<==>)|(?<=\breturn))[ \t]*/(?![/*])(?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^/\\\n\[])+/[a-z]*)|//[^\n]*|/\*.*?\*/""", re.S)
# A call this reader does not know could run a command from a helper defined above the rows array (`const sparkRow = () => ok('node scripts/spark-check.mjs')`, `run: () => sparkRow()`).
ROW_ANY_CALL = re.compile(r"(?<![.\w$])([A-Za-z_]\w*)\s*\(")
ROW_KNOWN_CALLS = frozenset({"ok", "fails", "all", "execSync", "execFileSync", "spawnSync", "spawn", "exec", "shardedSuite", "Number", "String", "Boolean", "parseInt", "readFileSync", "existsSync", "readdirSync", "statSync", "if", "for", "while", "switch", "catch", "return", "function"})
MIN_ROWS, MIN_BROWSER_ROWS = 20, 6


def _blank_comments(src):
    """JavaScript comments become spaces (offsets kept); a string or a regular expression, which may hold `//` (a URL), is kept whole."""
    return JS_TOKEN.sub(lambda m: m.group(0) if m.group(1) else re.sub(r"[^\n]", " ", m.group(0)), src)


def _blank_strings(src):
    """The contents of every string and regular expression become NUL (offsets kept), so a word inside a command is not a use of that word."""
    return JS_TOKEN.sub(lambda m: m.group(0)[0] + "\0" * (len(m.group(0)) - 2) + m.group(0)[-1] if m.group(1) else m.group(0), src)


def _matching_paren(shape, lp):
    """The index of the `)` that closes the `(` at shape[lp] (strings are blanked, so their parentheses do not count), or -1."""
    depth = 0
    for k in range(lp, len(shape)):
        if shape[k] == "(":
            depth += 1
        elif shape[k] == ")":
            depth -= 1
            if depth == 0:
                return k
    return -1


def _matching_brace(shape, lb):
    """The index of the `}` that closes the `{` at shape[lb] (strings and regular expressions are blanked, so their braces do not count), or -1."""
    depth = 0
    for k in range(lb, len(shape)):
        if shape[k] == "{":
            depth += 1
        elif shape[k] == "}":
            depth -= 1
            if depth == 0:
                return k
    return -1


def gate_rows(root="."):
    """([(name, weight, flagged, commands)], [problem]) for the rows of scripts/gate-checks.mjs, read by a CLOSED GRAMMAR: a row is `{ name: '...', weight: N,` at the start of a line; its `run:` is an arrow
    function or one of ROW_HELPERS; `flagged` is whether it carries `browser: true` or `browser: (...) =>` before its `run:`; `commands` are the string literals of its `ok(`, `fails(`, `all(`,
    `execSync(` and `shardedSuite(` calls. Whatever the grammar does not cover is a PROBLEM, never "this row runs no browser": a row that does not start as above (the count of `weight:` keys is
    compared with the rows read), a template literal, a call whose argument is not a plain string, a use of `ok`/`fails`/`all` that is not a call (`.every(ok)`), an unrecognised `browser:` value, a
    `run:` that is neither an arrow function nor a helper, and a string that NAMES a command (a script path, `node ...`) that no call this reader understands takes (`check('node scripts/x.mjs')`,
    `spawnSync('node', ['scripts/x.mjs'])`) (review 2026-11-15, finding 3 and round 2, finding 2)."""
    text = Path(root, "scripts", "gate-checks.mjs").read_text()
    at = text.index("const rows = [")
    end = text.find("\nexport {", at)
    end = len(text) if end < 0 else end
    body = _blank_comments(text[at:end])
    shape = _blank_strings(body)
    starts = list(ROW_START.finditer(body))
    problems, out = [], []
    n_weight = len(re.findall(r"\bweight\s*:", shape))
    if n_weight != len(starts):
        problems.append(f"{n_weight} `weight:` keys in the rows array of scripts/gate-checks.mjs but {len(starts)} rows read: a row not written `{{ name: '...', weight: N` at the start of a line is not read, and a row not read is not compared")
    # THE ARRAY IS READ WHOLE, AND ONLY THERE. The rows are what scripts/confidence.mjs iterates, so every element of the exported array has to be a row this reader read: nothing between `[` and the
    # first row, nothing but a comma between one row's `}` and the next row (a spread `...more`, a variable, a call, a row written with quoted keys or two on a line is none of the rows read), nothing but
    # `]` after the last; and the name `rows` is used nowhere else but its declaration and its `export { ... }` (`rows.push(...)`, `rows.splice`, `rows.unshift`, `rows = ...`, `rows[...] = ...`, `...rows`
    # change the array after it is read here). Review of 48f504e, finding 27: a row outside the literal, or with quoted keys, was not read, not counted and not compared.
    whole = _blank_strings(_blank_comments(text))
    spans = [(x.start(), x.end()) for x in re.finditer(r"\bexport\s*\{[^}]*\}", whole)]
    stray = [x for x in re.finditer(r"(?<![\w$])(?:(?<=\.\.\.)|(?<!\.))rows\b(?!\s*:)", whole) if x.start() != at + len("const ") and not any(s <= x.start() < e for s, e in spans)]
    if stray:
        problems.append(f"`rows` is used {len(stray)} time(s) in scripts/gate-checks.mjs besides `const rows = [` and its `export {{ ... }}` (`rows.push(...)`, `rows.splice`, `rows = ...`, `rows[...]`, a spread): a row changed there is not one this reader read")
    if starts and shape[shape.index("[") + 1:starts[0].start()].strip():
        problems.append("the rows array of scripts/gate-checks.mjs has something before its first row (a spread, a call, a row written with quoted keys): an element that is not `{ name: '...', weight: N, ...}` at the start of a line is not read")
    for k, m in enumerate(starts):
        lo, hi = m.start(), (starts[k + 1].start() if k + 1 < len(starts) else len(body))
        chunk, cshape, name = body[lo:hi], shape[lo:hi], m.group(2)
        close = _matching_brace(cshape, cshape.index("{"))
        tail = cshape[close + 1:] if close >= 0 else None
        if tail is None or not re.fullmatch(r"\s*,?\s*\]\s*" if k + 1 == len(starts) else r"\s*,\s*", tail):
            problems.append(f"gate row {name!r} is not followed by a comma and the next row (or by `]`) in scripts/gate-checks.mjs: something else sits between the rows (a spread, a variable, a call, a row with quoted keys), and is not read")
        run = re.search(r"\brun\s*:", cshape)
        if run is None:
            problems.append(f"gate row {name!r} has no `run:` this reader can find")
            out.append((name, int(m.group(3)), False, []))
            continue
        flag = re.search(r"\bbrowser\s*:\s*([^\s,][^,\n]*)", cshape[:run.start()])
        value = flag.group(1).strip() if flag else "false"
        flagged = value.startswith("true") or value.startswith("(")
        if not (flagged or value.startswith("false")):
            problems.append(f"gate row {name!r}: `browser: {value[:30]}` is not `true`, `false` or a function: this reader cannot tell whether the row is flagged")
        rest, rshape = chunk[run.end():], cshape[run.end():]
        if not (re.match(r"\s*\(\s*\)\s*=>", rshape) or re.match(r"\s*(?:" + "|".join(ROW_HELPERS) + r")\b", rshape)):
            problems.append(f"gate row {name!r}: its `run:` is neither an arrow function (`() => ...`) nor one of {', '.join(ROW_HELPERS)}: this reader cannot see what it runs")
        if "`" in rshape:
            problems.append(f"gate row {name!r} contains a template literal: the command it runs is not a plain string this reader can read")
        cmds = []
        for c in ROW_CALL.finditer(rshape):
            word, lp = c.group(1), c.end() + len(rshape[c.end():]) - len(rshape[c.end():].lstrip())
            if rshape[lp:lp + 1] == ":":
                continue                                    # an object key (`{ ok: true }`), not a use of the helper
            if not rshape[lp:lp + 1] == "(":
                problems.append(f"gate row {name!r} uses `{word}` other than as a call (`.every({word})`, a reference): this reader cannot see what it runs")
                continue
            if word == "all":
                a = ROW_ALL.match(rest, lp)
                if a is None:
                    problems.append(f"gate row {name!r} calls `all(...)` with something other than plain string literals")
                    continue
                cmds += [x or y for x, y in re.findall(r"""(?:'([^']*)'|"([^"]*)")""", a.group(1))]
            else:
                a = ROW_ARG.match(rest, lp)
                if a is None:
                    problems.append(f"gate row {name!r} calls `{word}(...)` with a first argument that is not a plain string literal (a constant, a concatenation): this reader cannot see the command")
                    continue
                cmds.append(a.group(1) if a.group(1) is not None else a.group(2))
        for sc in ROW_SHARDED.finditer(rshape):
            lp = sc.end() - 1
            close = _matching_paren(rshape, lp)
            if close < 0:
                problems.append(f"gate row {name!r}: the parentheses of `shardedSuite(` do not close")
                continue
            cmds += [x or y for x, y in re.findall(r"""(?:'([^']*)'|"([^"]*)")""", rest[lp:close]) if SCRIPTISH.search(x or y)]
        for ac in ROW_ANY_CALL.finditer(rshape):
            if ac.group(1) not in ROW_KNOWN_CALLS and ac.group(1) not in ROW_HELPERS:
                problems.append(f"gate row {name!r} calls `{ac.group(1)}(...)`, which this reader does not know: a helper defined above the rows array could run a command from there, unread")
        have = set(cmds)
        for tok in JS_TOKEN.finditer(rest):
            lit = tok.group(1)
            if lit and lit[0] in "'\"" and SCRIPTISH.search(lit[1:-1]) and lit[1:-1] not in have:
                problems.append(f"gate row {name!r} names a command ({lit[1:-1][:50]!r}) that no `ok(`, `fails(`, `all(`, `execSync(` or `shardedSuite(` call takes: this reader cannot attribute it")
        out.append((name, int(m.group(3)), flagged, cmds))
    return out, problems


def gate_row_problems(root, pkg, read):
    """The rows `confidence.mjs --browserless` does not apply (the ones flagged `browser`) against the rows whose commands READ as driving a browser: they must be the same rows.
    A row that drives one and is not flagged would run with no browser and fail for that; one that is flagged and does not would be left out for nothing. A command this guard cannot read (a wrapper such as
    `timeout`) is a problem too. Returns [problem]."""
    try:
        rows, bad = gate_rows(root)
    except (OSError, ValueError) as e:
        return [f"scripts/gate-checks.mjs could not be read for its rows ({type(e).__name__}): {e}"]
    bad = list(bad)
    if len(rows) < MIN_ROWS:
        bad.append(f"only {len(rows)} gate rows read from scripts/gate-checks.mjs, expected at least {MIN_ROWS}: the row reader read too little to mean anything")
    flagged = 0
    for name, weight, flag, cmds in rows:
        reads = False
        for c in cmds:
            r = read_step({"run": c}, pkg, read)
            reads = reads or r["browser"]
            if r["unresolved"]:
                bad.append(f"gate row {name!r}: the command `{c[:70]}` cannot be read ({r['unresolved'][0][:90]}): a row this guard cannot read cannot be called browser-free")
        flagged += 1 if flag else 0
        if reads and not flag:
            bad.append(f"gate row {name!r} drives a browser (by its commands) and is not flagged `browser`: `confidence.mjs --browserless` would run it with no browser")
        if flag and not reads:
            bad.append(f"gate row {name!r} is flagged `browser` and its commands read as driving none: `confidence.mjs --browserless` would leave it out for nothing")
    if flagged < MIN_BROWSER_ROWS:
        bad.append(f"only {flagged} gate rows are flagged `browser`, expected at least {MIN_BROWSER_ROWS}")
    return bad


def classification(doc, pkg, read, job=JOB):
    steps = job_steps(doc, job)
    at = next((i for i, s in enumerate(steps) if is_install(s)), -1)
    return [{"name": s.get("name"), "needsChromium": "yes" if needs_browser(s, pkg, read) else "no"} for i, s in enumerate(steps) if i > at and s.get("name")]


def coverage_problems(cov, bounds=(MIN_STEPS, MIN_BROWSER, MIN_PLAIN)):
    """A classifier that read nothing must not pass: the counts it reports are bounded below."""
    floors = [("steps read", cov["steps"], bounds[0]), ("browser steps", cov["browser"], bounds[1]), ("browser-free steps", cov["plain"], bounds[2])]
    return [f"only {got} {label} read, expected at least {floor}: the classifier read too little to mean anything" for label, got, floor in floors if got < floor]


# ---------------------------------------------------------------- the other install sites: exempt, by annotation, with a pinned count
# ---------------------------------------------------------------- when does a step run after the install FAILED?
# GitHub: an `if` with no status function (success, always, cancelled, failure) is evaluated as `success() && (<if>)`; one with a status function is
# evaluated as written (docs, "A default status check of success() is applied unless you include one of these functions"; the runner's converter walks the
# expression tree for them and compares names case-insensitively). At an exempt site the install has no continue-on-error, so the job has FAILED at it:
# success() is false, failure() true, cancelled() false, always() true. Everything else (a context, a comparison on one, any other function) is UNKNOWN,
# and the evaluation is three-valued, so `!cancelled() && steps.x.outcome == 'success'` is UNKNOWN: it may run, and the guard cannot show that it does.
RUNS, SKIPPED, UNKNOWN = "runs", "skipped", "unknown"
STATUS_FUNCS = {"success": False, "failure": True, "cancelled": False, "always": True}
# A value is ("lit", v) with v None, bool, float or str; UNK (nothing known); UNK_T / UNK_F (the value is unknown but its truthiness is known: `x || 'default'` is
# truthy whatever x is, and comparing it to something decides nothing, which a literal True would have wrongly decided).
UNK = ("unk", None)
UNK_T = ("unkT", None)
UNK_F = ("unkF", None)
_BRACKET = re.compile(r"^\s*(?:'[^']*'|[0-9]+|\*)\s*$")
_EXPR_TOKEN = re.compile(
    r"\s*(?:(?P<str>'(?:[^']|'')*')|(?P<num>[0-9]+(?:\.[0-9]+)?)|(?P<op>&&|\|\||==|!=|<=|>=|<|>|!|\(|\)|,)"
    r"|(?P<id>[A-Za-z_][\w-]*(?:\.[\w*-]+|\[[^\]]*\])*))"
)
_NUMSTR = re.compile(r"^\s*[+-]?[0-9]+(?:\.[0-9]+)?\s*$")


class _Unreadable(Exception):
    pass


def _tokens(s):
    out, pos, s = [], 0, s.rstrip()
    while pos < len(s):
        m = _EXPR_TOKEN.match(s, pos)
        if not m or m.end() == pos:
            raise _Unreadable(f"cannot tokenize at {s[pos:pos + 12]!r}")
        kind, val = m.lastgroup, m.group(m.lastgroup)
        if kind == "id":
            # an index is read only when it is a plain string, number or `*`: anything else (a call, an operator) would hide a status function from this reader
            for inner in re.findall(r"\[([^\]]*)\]", val):
                if not _BRACKET.match(inner):
                    raise _Unreadable("an index that is an expression")
            val = re.sub(r"\[\s*'([\w-]+)'\s*\]", r".\1", val)
        out.append((kind, val))
        pos = m.end()
    return out


def _known(v):
    """The truthiness of a value, or None when it is not known (GitHub: false, 0, '', null are falsy; everything else, 'false' included, is truthy)."""
    if v is UNK_T:
        return True
    if v is UNK_F:
        return False
    if v[0] != "lit":
        return None
    x = v[1]
    if x is None:
        return False
    if isinstance(x, bool):
        return x
    if isinstance(x, float):
        return x != 0
    return x != ""


def _not(a):
    k = _known(a)
    return UNK if k is None else ("lit", not k)


def _and(a, b):
    ka = _known(a)
    if ka is None:
        return UNK_F if _known(b) is False else UNK
    return b if ka else a


def _or(a, b):
    ka = _known(a)
    if ka is None:
        return UNK_T if _known(b) is True else UNK
    return a if ka else b


def _kind(x):
    return "n" if x is None else "b" if isinstance(x, bool) else "f" if isinstance(x, float) else "s"


def _tonum(x):
    """GitHub's number coercion: null 0, true 1, false 0, '' 0, a decimal string its value; None for a string this reader does not model (NaN, hex, exponent)."""
    if x is None:
        return 0.0
    if isinstance(x, bool):
        return 1.0 if x else 0.0
    if isinstance(x, float):
        return x
    if x.strip() == "":
        return 0.0
    return float(x) if _NUMSTR.match(x) else None


def _cmp(op, a, b):
    """A comparison as GitHub does it: the same kind compares directly (strings without regard to case), different kinds are both coerced to numbers."""
    if a[0] != "lit" or b[0] != "lit":
        return UNK
    x, y = a[1], b[1]
    kx, ky = _kind(x), _kind(y)
    if kx != ky:
        x, y = _tonum(x), _tonum(y)
        if x is None or y is None:
            return UNK
        kx = "f"
    elif kx == "s":
        if not (x.isascii() and y.isascii()):
            return UNK                         # OrdinalIgnoreCase upper-cases per character; only ASCII is modelled
        x, y = x.upper(), y.upper()
    elif kx == "n":
        x = y = 0.0
    if op in ("==", "!="):
        return ("lit", (x == y) == (op == "=="))
    return ("lit", {"<": x < y, "<=": x <= y, ">": x > y, ">=": x >= y}[op])


class _Eval:
    def __init__(self, toks, known=None):
        self.t, self.i, self.status, self.known = toks, 0, False, known or {}

    def peek(self):
        return self.t[self.i] if self.i < len(self.t) else (None, None)

    def take(self):
        tok = self.peek()
        self.i += 1
        return tok

    def eat(self, op):
        if self.peek() == ("op", op):
            self.i += 1
            return True
        return False

    def expr(self):
        v = self.and_()
        while self.eat("||"):
            v = _or(v, self.and_())
        return v

    def and_(self):
        v = self.eq()
        while self.eat("&&"):
            v = _and(v, self.eq())
        return v

    def eq(self):
        v = self.rel()
        while self.peek() in (("op", "=="), ("op", "!=")):
            op = self.take()[1]
            v = _cmp(op, v, self.rel())
        return v

    def rel(self):
        v = self.unary()
        while self.peek()[0] == "op" and self.peek()[1] in ("<", "<=", ">", ">="):
            op = self.take()[1]
            v = _cmp(op, v, self.unary())
        return v

    def unary(self):
        if self.eat("!"):
            return _not(self.unary())
        return self.primary()

    def primary(self):
        kind, val = self.take()
        if kind == "op" and val == "(":
            v = self.expr()
            if not self.eat(")"):
                raise _Unreadable("an unclosed (")
            return v
        if kind == "str":
            return ("lit", val[1:-1].replace("''", "'"))
        if kind == "num":
            return ("lit", float(val))
        if kind == "id":
            if self.peek() == ("op", "("):
                self.take()
                if not self.eat(")"):
                    while True:
                        self.expr()
                        if self.eat(")"):
                            break
                        if not self.eat(","):
                            raise _Unreadable("a call that does not close")
                if val.lower() in STATUS_FUNCS:
                    self.status = True
                    return ("lit", STATUS_FUNCS[val.lower()])
                return UNK
            if val.lower() in self.known:
                return ("lit", self.known[val.lower()])
            return {"true": ("lit", True), "false": ("lit", False), "null": ("lit", None)}.get(val, UNK)   # the keywords are case-sensitive
        raise _Unreadable(f"unexpected {val!r}")


def step_runs_after_failure(step, install_id=None):
    """RUNS, SKIPPED or UNKNOWN for a step after an install that failed with no continue-on-error: GitHub's rule, three-valued. The install's own outcome is
    known (`failure`) when it has an id, so a step can test it."""
    c = step.get("if")
    if isinstance(c, bool):
        c = "true" if c else "false"          # YAML `if: true` reaches GitHub as the text true
    if c is None or str(c).strip() == "":
        return SKIPPED                       # no `if`: success() is implied, and it is false
    text = str(c).strip()
    m = re.fullmatch(r"\$\{\{(.*)\}\}", text, re.S)
    if m:
        text = m.group(1)
    known = {}
    if isinstance(install_id, str) and install_id:
        known = {f"steps.{install_id.lower()}.outcome": "failure", f"steps.{install_id.lower()}.conclusion": "failure"}
    try:
        ev = _Eval(_tokens(text), known)
        v = ev.expr()
        if ev.i != len(ev.t):
            raise _Unreadable("text after the expression")
    except (_Unreadable, RecursionError):
        return UNKNOWN
    if not ev.status:
        return SKIPPED                       # `success() && (...)`
    k = _known(v)
    return UNKNOWN if k is None else RUNS if k else SKIPPED


def exempt_count(steps, at, pkg, read, install_id=...):
    """The steps after the install that are not CERTAIN to run when it fails (step_runs_after_failure is not RUNS) and are not shown to need a browser.
    A step the reader cannot read counts: it may be browser-free."""
    if install_id is ...:
        install_id = steps[at].get("id")
    return sum(1 for s in steps[at + 1:] if step_runs_after_failure(s, install_id) != RUNS and not read_step(s, pkg, read)["browser"])


def _doc(f):
    try:
        d = yaml.safe_load(f.read_text(errors="replace")) or {}
    except yaml.YAMLError:
        return {}
    return d if isinstance(d, dict) else {}


def _step_lists(doc):
    """[(job name or None, job document, steps)] of a workflow document or a composite action document."""
    if isinstance(doc.get("jobs"), dict):
        return [(name, j or {}, (j or {}).get("steps") or []) for name, j in doc["jobs"].items() if isinstance(j or {}, dict)]
    return [(None, {}, ((doc.get("runs") or {}).get("steps")) or [])]


def _local_uses(doc):
    out = []
    for name, job, steps in _step_lists(doc):
        out += [job.get("uses")] + [s.get("uses") for s in steps if isinstance(s, dict)]
    return [u.rstrip("/") for u in out if isinstance(u, str) and u.startswith("./") and not u.endswith((".yml", ".yaml"))]


def workflow_files(root="."):
    """Every file that can hold a step: the workflows (.yml and .yaml), every composite action under .github (action.yml, action.yaml, at any depth), and every
    local action they use (`uses: ./path`, wherever it lives), followed through composite actions that use others."""
    base = Path(root).resolve()
    found = set()
    for pat in (".github/workflows/*.yml", ".github/workflows/*.yaml"):
        found.update(Path(root).glob(pat))
    if (Path(root) / ".github").is_dir():
        for name in ("action.yml", "action.yaml"):
            found.update((Path(root) / ".github").rglob(name))
    queue = sorted(found)
    while queue:
        f = queue.pop()
        for u in _local_uses(_doc(f)):
            d = (base / u[2:]).resolve()
            if base not in d.parents:
                continue
            for name in ("action.yml", "action.yaml"):
                cand = Path(root) / d.relative_to(base) / name
                if cand.is_file() and cand not in found:
                    found.add(cand)
                    queue.append(cand)
    return sorted(found)


def install_sites(root="."):
    """([(rel, line, steps, at, job, jobdoc)], [problem]) for every install that is not the install of a TARGET job: the text line of its command (comment
    lines dropped) paired in order with the parsed install step, which gives the steps that follow it in its job or composite action. The number of text
    lines and of parsed install steps must agree in every file (an install on a continuation line or in a folded scalar has no line of its own: refused)."""
    base, out, bad = Path(root), [], []
    targets = {x["file"]: x["job"] for x in TARGETS}
    for f in workflow_files(root):
        rel = f.relative_to(base).as_posix()
        text = f.read_text(errors="replace")
        lines = [n for n, line in enumerate(text.splitlines(), 1) if INSTALL_CMD.search(line) and not line.lstrip().startswith("#")]
        try:
            doc = yaml.safe_load(text) or {}
        except yaml.YAMLError as e:
            if lines:
                bad.append(f"{rel}: runs the install command on {len(lines)} line(s) and is not valid YAML ({type(e).__name__}): this guard cannot read it")
            continue
        if not isinstance(doc, dict):
            doc = {}
        found = [(name, steps, i, jobdoc) for name, jobdoc, steps in _step_lists(doc) for i, s in enumerate(steps) if isinstance(s, dict) and is_install(s)]
        if len(found) != len(lines):
            names = [str(steps[at].get("name") or steps[at].get("id") or "(unnamed)") for _, steps, at, _ in found]
            bad.append(f"{rel}: the install command is on line(s) {lines or 'none the text can match'}, and the step(s) that parse as an install are {names}: this guard cannot pair them")
            continue
        for (name, steps, at, jobdoc), n in zip(found, lines):
            if rel in targets and targets[rel] == name:
                continue                       # the install of a target job: audited whole, not annotated
            out.append((rel, n, steps, at, name, jobdoc))
    return out, bad


def step_indent(text, line):
    """The column of the `- ` that opens the step whose command is on `line` (1-based), -1 if there is none."""
    cur = text[line - 1]
    own = len(cur) - len(cur.lstrip())
    if cur.lstrip().startswith("- "):
        return own
    for i in range(line - 2, -1, -1):
        l = text[i]
        if l.lstrip().startswith("- ") and len(l) - len(l.lstrip()) < own:
            return len(l) - len(l.lstrip())
    return -1


def _needs(job):
    n = (job or {}).get("needs")
    return [n] if isinstance(n, str) else [x for x in (n or []) if isinstance(x, str)]


def dependents_not_certain(doc, job_name):
    """The jobs of one workflow that need `job_name` (directly, or through a job that is itself skipped) and whose `if` is not certain to run after its failure.
    A dependent that is certain to run (`if: always()`) does not pass the failure on."""
    jobs = doc.get("jobs") or {}
    out, queue, seen = [], [job_name], {job_name}
    while queue:
        cur = queue.pop(0)
        for name, j in jobs.items():
            if name in seen or cur not in _needs(j):
                continue
            seen.add(name)
            if step_runs_after_failure({"if": (j or {}).get("if")}) != RUNS:
                out.append(name)
                queue.append(name)
    return out


def exempt_extra(root, rel, job, pkg, read, docs):
    """What else a failed install skips beyond the steps after it in its own job or action: the jobs that need its job; for a composite action, the steps that
    follow the action in every job that calls it, and the jobs that need those jobs."""
    if job is not None:
        return len(dependents_not_certain(docs.get(rel, {}), job))
    target = "./" + Path(rel).parent.as_posix()
    extra = 0
    for doc in docs.values():
        for name, jobdoc, steps in _step_lists(doc):
            for k, s in enumerate(steps):
                if isinstance(s, dict) and str(s.get("uses", "")).rstrip("/") == target:
                    extra += exempt_count(steps, k, pkg, read, install_id=None) + len(dependents_not_certain(doc, name))
    return extra


def caller_problems(rel, docs):
    """The jobs that call the composite action at `rel` (a TARGET, whose last step goes red on a failed install by design). What it skips is the callers' to bear, and as an exempt site
    that was pinned by N; as a target nothing looked, so each caller is audited here: the `uses:` step and its job carry no `continue-on-error` (it would turn the red end into a green
    job), every step after it has a status function in its `if` (it is otherwise skipped by the red end), and every job that needs its job is certain to run."""
    target = "./" + Path(rel).parent.as_posix()
    bad = []
    for crel, doc in docs.items():
        for name, jobdoc, steps in _step_lists(doc):
            for k, s in enumerate(steps):
                if not (isinstance(s, dict) and str(s.get("uses", "")).rstrip("/") == target):
                    continue
                where = f"{crel}, job `{name}`"
                if truthy(s.get("continue-on-error")):
                    bad.append(f"{where}: the step that uses {target} has `continue-on-error`: the action ends red on a failed install, and this would leave the job green over it")
                if truthy(jobdoc.get("continue-on-error")):
                    bad.append(f"{where}: the job has `continue-on-error`: a failed install would leave it green")
                for j, after in enumerate(steps[k + 1:], k + 2):
                    if not isinstance(after, dict):
                        continue
                    res = step_runs_after_failure({"if": after.get("if")})
                    if res == SKIPPED or (res == UNKNOWN and "always()" not in if_text(after)):
                        bad.append(f"{where}: step {j} ({after.get('name') or run_text(after)[:40]!r}) follows {target} and is skipped when the action ends red (its `if` has no status function)")
                for dep in dependents_not_certain(doc, name):
                    bad.append(f"{where}: job `{dep}` needs it and is skipped when the action ends red (give it `if: always()`)")
    return bad


def exempt_sites(root, pkg, read):
    """(problems, table) for the installs outside the TARGET jobs. Each needs ONE `# browser-gate: exempt N -- reason` comment at its step's indentation within
    EXEMPT_REACH lines above its install command and after the previous install of the file, N being exempt_count(). A step added after an exempt install
    changes N: that is the signal to give the job the shape or say why not. An annotation that pairs with no install is stale."""
    sites, bad = install_sites(root)
    docs = {f.relative_to(Path(root)).as_posix(): _doc(f) for f in workflow_files(root)}
    table, used, prev = [], set(), {}
    for rel, line, steps, at, job, jobdoc in sorted(sites, key=lambda s: (s[0], s[1])):
        text = Path(root, rel).read_text().splitlines()
        indent = step_indent(text, line)
        # an annotation belongs to the FIRST install below it: the window opens after the previous install in the same file, so one annotation cannot cover two
        lo = max(0, line - 1 - EXEMPT_REACH, prev.get(rel, 0))
        prev[rel] = line
        notes = [(n, m) for n, l in enumerate(text[lo:line - 1], lo + 1) for m in [EXEMPT_NOTE.match(l)] if m and len(m.group(1)) == indent]
        if len(notes) != 1:
            bad.append(f"{rel}:{line} installs a browser and is neither a target of this guard nor annotated exactly once with a comment `# browser-gate: exempt <N> -- <reason>` at the step's indentation within {EXEMPT_REACH} lines above the install ({len(notes)} found): a failed install there skips every later step that has no status function, so say why that is right, or give the job the verify shape")
            continue
        at_line, m = notes[0]
        used.add((rel, at_line))
        if truthy(steps[at].get("continue-on-error")) or truthy((jobdoc or {}).get("continue-on-error")):
            bad.append(f"{rel}:{line}: the install (or its job) has continue-on-error, so a failed install does not fail the job there. That is the verify shape and needs all of it: make this file a target of this guard, do not annotate it")
            continue
        n, said = exempt_count(steps, at, pkg, read) + exempt_extra(root, rel, job, pkg, read, docs), int(m.group(2))
        if n != said:
            bad.append(f"{rel}:{line}: {n} step(s) after the install are not certain to run when it fails and are not shown to need a browser, but the annotation says {said}. A step added there may be lost when the install fails: if it matters, give the job the verify shape; if not, change the annotation and keep its reason true")
        table.append((rel, line, n, m.group(3)))
    for f in workflow_files(root):
        rel = f.relative_to(Path(root)).as_posix()
        for n, l in enumerate(f.read_text().splitlines(), 1):
            if EXEMPT_NOTE.match(l) and (rel, n) not in used:
                bad.append(f"{rel}:{n}: a `browser-gate: exempt` annotation that sits above no install of this guard's other sites (at the install step's indentation, within {EXEMPT_REACH} lines, after the previous install; a target job carries the shape and needs none): it is stale")
    return bad, table


# ---------------------------------------------------------------- self-test
def self_test():
    ok = fail = 0

    def check(name, cond, detail=""):
        nonlocal ok, fail
        print(("PASS  " if cond else "FAIL  ") + name)
        if cond:
            ok += 1
        else:
            fail += 1
            print(f"      -> {detail}")

    files = {
        "scripts/shot.mjs": "import { chromium } from 'playwright'\nif (process.argv.includes('--self-test')) process.exit(0)\nconst b = await chromium.launch()\n",
        "scripts/pure.mjs": "import { readFileSync } from 'node:fs'\n// await chromium.launch() is only mentioned here\n",
        "scripts/lib.mjs": "import { chromium } from 'playwright'\nexport const x = 1\n",
        "scripts/uses-lib.mjs": "import { x } from './lib.mjs'\n",
        "scripts/probe.py": "from playwright.sync_api import sync_playwright\n",
        "scripts/probe2.py": "import playwright\n",
        "scripts/l-require.mjs": "const { chromium } = require('playwright')\n",
        "scripts/l-dynamic.mjs": "const pw = await import('playwright')\n",
        "scripts/l-launch.mjs": "const b = await chromium.launch()\n",
        "scripts/l-persist.mjs": "const c = await type.launchPersistentContext(dir)\n",
        "scripts/l-env.mjs": "const exe = process.env.PW_CHROMIUM\n",
        "scripts/l-env.py": "import os\nexe = os.environ.get('PW_CHROMIUM')\n",
        "scripts/late.py": "# header\n\nimport os\nfrom playwright.sync_api import sync_playwright\n",
        "scripts/spawner.mjs": "import { execSync } from 'node:child_process'\nexecSync('node scripts/shot.mjs')\n",
        "scripts/spawn2.mjs": "import { spawnSync } from 'child_process'\nspawnSync('node', ['scripts/spawner.mjs'])\n",
        "scripts/spawn3.mjs": "const { execFileSync } = require('node:child_process')\nexecFileSync('node', ['scripts/spawn2.mjs'])\n",
        "scripts/spawn-bare.mjs": "import { execSync } from 'node:child_process'\nexecSync('node shot.mjs')\n",
        "scripts/spawn-dyn.mjs": "import('node:child_process').then(c => c.execSync('node scripts/shot.mjs'))\n",
        "scripts/spawn-url.mjs": "import { spawnSync } from 'node:child_process'\nimport { fileURLToPath } from 'node:url'\nspawnSync(process.execPath, [fileURLToPath(new URL('./shot.mjs', import.meta.url))])\n",
        "scripts/spawn-dot.mjs": "import { execSync } from 'node:child_process'\nexecSync('node ./scripts/shot.mjs')\n",
        "scripts/spawn-up.mjs": "import { execSync } from 'node:child_process'\nexecSync('node ../scripts/shot.mjs')\n",
        "scripts/spawn-var.mjs": "import { execSync } from 'node:child_process'\nexecSync(`node ${ROOT}/scripts/shot.mjs`)\n",
        "scripts/imports-spawner.mjs": "import { execSync } from 'node:child_process'\nimport { run } from './spawner.mjs'\nexecSync('node scripts/pure.mjs')\n",
        "scripts/sub/launch.mjs": "const b = await chromium.launch()\n",
        "scripts/spawn-sub.mjs": "import { execSync } from 'node:child_process'\nexecSync('node scripts/sub/launch.mjs')\n",
        "scripts/sub/spawn-rel.mjs": "import { execSync } from 'node:child_process'\nexecSync('node ./launch.mjs')\n",
        "scripts/sub/spawn-bare2.mjs": "import { execSync } from 'node:child_process'\nexecSync('node shot.mjs')\n",
        "scripts/spawn-out.mjs": "import { execSync } from 'node:child_process'\nexecSync('node ../../outside.mjs')\n",
        "../outside.mjs": "const b = await chromium.launch()\n",
        "scripts/new-runner.mjs": "import { rows } from './gate-checks.mjs'\nfor (const r of rows) r.run()\n",
        "scripts/wrap-row.mjs": "import { execSync } from 'node:child_process'\nexecSync('node scripts/run-row.mjs \"x\"')\n",
        "scripts/imports-rows.mjs": "import { rows } from './gate-checks.mjs'\nconsole.log(rows.length)\n",
        "scripts/spawn-var2.mjs": "import { execSync } from 'node:child_process'\nexecSync(`node ${ROOT}/scripts/sub/launch.mjs`)\n",
        "scripts/spawn-abs.mjs": "import { execSync } from 'node:child_process'\nexecSync('node /abs/launch.mjs')\n",
        "/abs/launch.mjs": "const b = await chromium.launch()\n",
        "scripts/dyn-runner.mjs": "const { rows } = await import('./gate-checks.mjs')\nfor (const r of rows) r.run()\n",
        "scripts/opt-runner.mjs": "import { rows } from './gate-checks.mjs'\nfor (const r of rows) r.run?.()\n",
        "scripts/bracket-runner.mjs": "import { rows } from './gate-checks.mjs'\nfor (const r of rows) r['run']()\n",
        "scripts/destr-runner.mjs": "import { rows } from './gate-checks.mjs'\nfor (const { run } of rows) run()\n",
        "scripts/req-runner.mjs": "const { rows } = require('./gate-checks.mjs')\nfor (const r of rows) r.run()\n",
        "scripts/up-runner.mjs": "import { rows } from '../scripts/gate-checks.mjs'\nfor (const r of rows) r.run()\n",
        "scripts/mentions.mjs": "// no child process: shot.mjs is only a name here\nconst name = 'scripts/shot.mjs'\n",
        "scripts/spawn-pure.mjs": "import { execSync } from 'node:child_process'\nexecSync('node scripts/pure.mjs')\n",
        "scripts/spawn-comment.mjs": "import { execSync } from 'node:child_process'\n// this once ran scripts/shot.mjs\nexecSync('node scripts/pure.mjs')\n",
        "scripts/cyc-a.mjs": "import { execSync } from 'node:child_process'\nexecSync('node scripts/cyc-b.mjs')\n",
        "scripts/cyc-b.mjs": "import { execSync } from 'node:child_process'\nexecSync('node scripts/cyc-a.mjs')\n",
        "scripts/mutation-check.mjs": "import { execSync } from 'node:child_process'\nconst rows = [\"node scripts/shot.mjs\"]\nif (process.argv.includes('--anchors')) {} else rows.forEach(r => execSync(r))\n",
        "scripts/import-purity-check.mjs": "import { execFileSync } from 'node:child_process'\nconst imported = ['scripts/shot.mjs']\n",
        "scripts/no-launch-check.mjs": "import { spawnSync } from 'node:child_process'\nspawnSync('node', ['scripts/shot.mjs'])\nconst fixture = \"await chromium.launch()\"\n",
        "scripts/confidence.mjs": "import { execSync } from 'node:child_process'\nconst rows = ['node scripts/shot.mjs']\nif (process.argv.includes('--browserless')) {} else rows.forEach(r => execSync(r))\n",
        "scripts/prose.py": '"""Mentions chromium.launch and PW_CHROMIUM and from playwright in prose."""\nPATTERN = r"chromium\\.launch|PW_CHROMIUM"\n',
        "scripts/l-core.mjs": "import { chromium } from 'playwright-core'\n",
        "pre.cjs": "console.log('a preload')\n",
        "scripts/noext": "console.log('exists, but has no extension')\n",
        "scripts/l-trailing.mjs": "const b = await chromium.launch() // headless\n",
        "scripts/l-require-core.mjs": "const { chromium } = require('playwright-core')\n",
        "scripts/l-spaced.mjs": "const b = await chromium.launch ()\n",
        "pre-launch.cjs": "require('playwright').chromium.launch()\n",
    }
    read = lambda p: files[p]
    pkg = {"shot": "node scripts/shot.mjs --self-test && node scripts/shot.mjs", "selfonly": "node scripts/shot.mjs --self-test",
           "pure": "node scripts/pure.mjs", "viaimport": "node scripts/uses-lib.mjs", "nest": "npm run shot", "py": "python3 scripts/probe.py",
           "hookfires": "node scripts/pure.mjs", "prehookfires": "node scripts/shot.mjs", "cyc-a": "npm run cyc-b", "cyc-b": "npm run cyc-a", "num": 5,
           "env-url": "URL='http://x/?a=1' node scripts/shot.mjs", "pretest": "node scripts/shot.mjs", "test": "node scripts/pure.mjs",
           "prestart": "node scripts/shot.mjs", "start": "node scripts/pure.mjs", "prepare": "node scripts/shot.mjs", "loop": "for i in $(seq 1 3); do curl -sf http://x/ && break; sleep 1; done"}
    for k in range(20):
        pkg[f"hop{k}"] = f"npm run hop{k + 1}" if k < 19 else "node scripts/shot.mjs"

    def wf(steps):
        return {"jobs": {"verify": {"steps": steps}}}

    inst = {"name": "Install Chromium", "id": "chromium", "continue-on-error": True, "run": "npx playwright install chromium"}
    gated = "steps.chromium.outcome == 'success'"
    final = {"name": "Chromium did not install", "if": "always() && steps.chromium.outcome != 'success'", "env": {"INSTALL_OUTCOME": "${{ steps.chromium.outcome }}"},
             "run": "if [ \"$INSTALL_OUTCOME\" = skipped ]; then\n  echo \"::error::skipped: an earlier step failed\"\nelse\n  echo \"::error::outcome $INSTALL_OUTCOME\"\nfi\nexit 1"}
    good = wf([{"name": "build", "id": "build", "run": "npm run pure"}, inst,
               {"name": "shots", "if": gated, "run": "npm run shot"},
               {"name": "pure", "run": "npm run pure"},
               {"name": "selftest", "run": "npm run selfonly"},
               {"name": "viaimport", "run": "npm run viaimport"}, final])

    def bad_of(w, **kw):
        return audit(w, kw.get("pkg", pkg), kw.get("read", read), final_timeout=kw.get("final_timeout", 5))[0]

    check("a gated browser step, plain steps, and a final step pass", bad_of(good) == [], bad_of(good))
    check("coverage is counted: 1 browser, 4 plain (the final step is one of them), 0 unreadable, the final step exits non-zero for all 4 outcomes",
          audit(good, pkg, read)[1] == {"steps": 5, "browser": 1, "plain": 4, "unreadable": 0, "opaque": 0, "final_ok": 4}, audit(good, pkg, read)[1])

    def mut(fn):
        import copy
        w = copy.deepcopy(good)
        fn(w["jobs"]["verify"]["steps"])
        return bad_of(w)

    def any_of(frag, bads):
        return any(frag in b for b in bads)

    check("a browser step with no `if` is refused", any_of("must carry", mut(lambda s: s[2].pop("if"))), mut(lambda s: s[2].pop("if")))
    check("a browser step gated on `always()` alone is refused", any_of("must carry", mut(lambda s: s[2].update({"if": "always()"}))))
    check("a browser step gated on `== 'failure'` is refused", any_of("must carry", mut(lambda s: s[2].update({"if": "steps.chromium.outcome == 'failure'"}))))
    check("a plain step gated on the install is refused (an outage would skip it again)",
          any_of("must not wait", mut(lambda s: s[3].update({"if": gated}))))
    check("a step that runs only `--self-test` of a browser script is plain", bad_of(good) == [] and audit(good, pkg, read)[1]["browser"] == 1)
    check("a step that merely IMPORTS a browser module is plain (importing never runs it)", needs_browser({"run": "npm run viaimport"}, pkg, read) is False)
    check("a comment that says chromium.launch is not a use", needs_browser({"run": "npm run pure"}, pkg, read) is False)
    check("`npm run` is followed through a nested script and `&&`", needs_browser({"run": "npm run nest"}, pkg, read) is True)
    check("a python script that imports playwright is a browser step", needs_browser({"run": "python3 scripts/probe.py"}, pkg, read) is True)
    check("...in either python import form", needs_browser({"run": "python3 scripts/probe2.py"}, pkg, read) is True)
    check("a python import on a LATER line is a browser step (the pattern is multiline)", needs_browser({"run": "python3 scripts/late.py"}, pkg, read) is True)
    check("PW_CHROMIUM read through os.environ is a browser step", needs_browser({"run": "python3 scripts/l-env.py"}, pkg, read) is True)
    check("a script that only NAMES the tokens (a docstring, a regex literal) is not a browser step",
          needs_browser({"run": "python3 scripts/prose.py"}, pkg, read) is False)
    check("a script that only NAMES the tokens in a comment is not a browser step, and this guard's own source (whose fixtures embed launch calls as strings) is read as one, which is why it never runs from the verify job",
          needs_browser({"run": "python3 scripts/prose.py"}, pkg, read) is False and
          entry_launches(__file__, lambda p: Path(p).read_text())[0] is True)
    for f, how in [("l-require.mjs", "require('playwright')"), ("l-dynamic.mjs", "import('playwright')"), ("l-launch.mjs", "chromium.launch alone"),
                   ("l-persist.mjs", "launchPersistentContext alone"), ("l-env.mjs", "PW_CHROMIUM alone"), ("l-core.mjs", "playwright-core")]:
        check(f"a script that uses {how} is a browser step", needs_browser({"run": f"node scripts/{f}"}, pkg, read) is True, f)
    # The floor VALUES are pinned here on purpose, not read from the constants: a test that reads MIN_* cannot see them change.
    check("the floors are 60 steps, 10 browser steps and 30 browser-free steps: one short of each is a problem, at each is not",
          len(coverage_problems({"steps": 59, "browser": 9, "plain": 29})) == 3 and
          len(coverage_problems({"steps": 59, "browser": 10, "plain": 30})) == 1 and
          len(coverage_problems({"steps": 60, "browser": 9, "plain": 30})) == 1 and
          len(coverage_problems({"steps": 60, "browser": 10, "plain": 29})) == 1 and
          coverage_problems({"steps": 60, "browser": 10, "plain": 30}) == [])
    check("`npx playwright test` is a browser step, `npx playwright install` is not",
          needs_browser({"run": "npx playwright test"}, pkg, read) and not needs_browser({"run": "npx playwright install chromium"}, pkg, read))
    check("a backslash-continued command and a background `&` are read",
          needs_browser({"run": "node scripts/shot.mjs \\\n  --flag &\nsleep 1"}, pkg, read) is True)
    check("an inline `node -e` is not read unless it is the closed grammar: it is UNRESOLVED (and the step that launches inline is a browser step by its own text)",
          read_step({"run": "node -e \"require('playwright').chromium.launch()\""}, pkg, read)["browser"] is True and
          read_step({"run": "node -e \"require('fs')\""}, pkg, read)["unresolved"] != [])
    check("a command whose script name is on the continuation line is read (the lines are joined)",
          needs_browser({"run": "node \\\n  scripts/shot.mjs"}, pkg, read) is True)
    check("`--self-test` on the continuation line makes the step plain (the lines are joined)",
          needs_browser({"run": "node scripts/shot.mjs \\\n  --self-test"}, pkg, read) is False)
    check("a line that starts with a comment is not read", needs_browser({"run": "# node scripts/shot.mjs\necho hi"}, pkg, read) is False)
    check("the install without `continue-on-error: true` is refused",
          any_of("continue-on-error", mut(lambda s: s[1].pop("continue-on-error"))))
    check("the install with `continue-on-error: false` is refused",
          any_of("continue-on-error", mut(lambda s: s[1].update({"continue-on-error": False}))))
    check("the install without the id is refused", any_of("must have `id: chromium`", mut(lambda s: s[1].pop("id"))))
    check("a renamed id is refused twice over: no id, and every `if` reads a missing one",
          sum(1 for b in mut(lambda s: s[1].update({"id": "browser"})) if "no earlier step has id" in b or "must have `id" in b) >= 2)
    check("no final step: refused, naming the green-with-everything-skipped failure",
          any_of("GREEN", mut(lambda s: s.pop())))
    check("a final step that tests `== 'failure'` is not the final step (a timeout may not conclude as failure)",
          any_of("GREEN", mut(lambda s: s[-1].update({"if": "always() && steps.chromium.outcome == 'failure'"}))))
    check("a final step without `always()` is not the final step",
          any_of("GREEN", mut(lambda s: s[-1].update({"if": "steps.chromium.outcome != 'success'"}))))
    check("a gate OR-ed with `true` is refused (it is no gate)", any_of("must carry", mut(lambda s: s[2].update({"if": "steps.chromium.outcome == 'success' || true"}))))
    check("a gate AND-ed with `false` is refused (the step would never run)", any_of("must carry", mut(lambda s: s[2].update({"if": "steps.chromium.outcome == 'success' && false"}))))
    check("a gate wrapped in ${{ }} and spaced differently is read", bad_of(wf([{"name": "b", "run": "true"}, inst, {"name": "x", "if": "${{ steps.chromium.outcome=='success' }}", "run": "npm run shot"}, final])) == [])
    check("a final step with `&& false` appended is refused (it would never run)",
          any_of("GREEN", mut(lambda s: s[-1].update({"if": "always() && steps.chromium.outcome != 'success' && false"}))))
    check("a final step OR-ed with anything is refused", any_of("GREEN", mut(lambda s: s[-1].update({"if": "always() && steps.chromium.outcome != 'success' || true"}))))
    check("a final step with an extra recognised clause is refused (the form is exact)",
          any_of("GREEN", mut(lambda s: s[-1].update({"if": "always() && steps.chromium.outcome != 'success' && steps.build.outcome == 'success'"}))))
    check("a browser step before the install is refused",
          any_of("BEFORE the install", mut(lambda s: s.insert(0, {"name": "early", "run": "npm run shot"}))))
    check("a comment that mentions `npx playwright install` is not an install step",
          audit(wf([{"name": "c", "run": "# npx playwright install chromium\necho hi"}]), pkg, read)[0][0].endswith("found 0"))
    check("two install steps are refused", any_of("exactly one", mut(lambda s: s.append(dict(inst)))))
    check("no install step is refused", any_of("exactly one", bad_of(wf([{"name": "x", "run": "true"}]))))
    check("a job with no steps is refused, not passed", audit({}, pkg, read)[0] != [])
    tail_if = "!cancelled() && steps.build.outcome == 'success' && steps.chromium.outcome == 'success'"
    tail_wf = wf([{"name": "b", "id": "build", "run": "npm run pure"}, inst, {"name": "tail", "if": tail_if, "run": "npm run shot"}, final])
    check("a tail step whose `if` names the build AND the install outcome passes", bad_of(tail_wf) == [], bad_of(tail_wf))
    check("...and the same tail step without the install outcome is refused",
          any_of("must carry", bad_of(wf([{"name": "b", "id": "build", "run": "npm run pure"}, inst,
              {"name": "tail", "if": "!cancelled() && steps.build.outcome == 'success'", "run": "npm run shot"}, final]))))
    check("classification lists every named step after the install",
          [c["needsChromium"] for c in classification(good, pkg, read)] == ["yes", "no", "no", "no", "no"], classification(good, pkg, read))

    # ---- RULE 4, BY EFFECT. Every form below contains the characters `exit 1` or looks like a failing step; none reddens the job.
    def final_run(run, **extra):
        return lambda s: s[-1].update({"run": run, **extra})
    ERR = 'echo "::error::x"\n'
    check("the final step with `# exit 1` and then `true` is refused (`true` is not echo, exit or a test)", any_of("is not echo, exit or a test", mut(final_run(ERR + "# exit 1\ntrue"))))
    check("the final step that only ECHOES `exit 1` is refused", any_of("GREEN", mut(final_run('echo "::error::would exit 1 but does not"'))))
    check("the final step with `exit 0` before `exit 1` is refused (exit takes a literal non-zero integer)", any_of("literal non-zero integer", mut(final_run(ERR + "exit 0\nexit 1"))))
    check("the final step with `if false; then exit 1; fi` is refused (`false` is not a test)", any_of("is not echo, exit or a test", mut(final_run(ERR + "if false; then exit 1; fi"))))
    check("a final step whose `if` tests the outcome with `test` instead of `[ ]` is accepted",
          mut(final_run('if test "$INSTALL_OUTCOME" = skipped; then echo "::error::s"; else echo "::error::o"; fi\nexit 1')) == [])
    check("the final step with `exit 1` commented out and nothing else is refused", any_of("GREEN", mut(final_run(ERR + "# exit 1"))))
    check("the final step with `exit 10` is accepted (any non-zero reddens the job)", mut(final_run(ERR + "exit 10")) == [], mut(final_run(ERR + "exit 10")))
    check("the final step with `continue-on-error: true` is refused (its failure becomes success)",
          any_of("continue-on-error", mut(lambda s: s[-1].update({"continue-on-error": True}))))
    check("the final step with `continue-on-error: ${{ expr }}` is refused (an expression cannot be shown off)",
          any_of("continue-on-error", mut(lambda s: s[-1].update({"continue-on-error": "${{ always() }}"}))))
    check("the final step with `continue-on-error: false` is accepted", mut(lambda s: s[-1].update({"continue-on-error": False})) == [])
    check("the final step that exits non-zero but prints no `::error::` is refused (the red must say why)", any_of("GREEN", mut(final_run("exit 1"))) or any_of("::error::", mut(final_run("exit 1"))))
    check("a command that fails (`false`) is refused: it is not echo, exit or a test, and what it does is the runner's business, not this run's",
          any_of("is not echo, exit or a test", mut(final_run(ERR + "false\nexit 0"))))
    check("a pipe in the final step is refused (the runner's default shell has no pipefail, so `false | true` exits 0 there)",
          any_of("a pipe, a redirect", mut(final_run(ERR + "false | true\nexit 0"))))
    check("a write to a runner file (`>> \"$GITHUB_STEP_SUMMARY\"`, unset here, set there) is refused",
          any_of("a pipe, a redirect", mut(final_run(ERR + 'echo x >> "$GITHUB_STEP_SUMMARY"\nexit 1'))))
    check("a command that reads the checkout (`cat outbox/INDEX.md`, absent from this run's empty directory) is refused",
          any_of("is not echo, exit or a test", mut(final_run(ERR + "cat outbox/INDEX.md\nexit 1"))))
    check("a command substitution in the final step is refused (by the reader, which reads every step, and the script is not run)", any_of("a command substitution", mut(final_run(ERR + 'echo "$(touch x)"\nexit 1'))))
    check("`exit $X` is refused (the value is not a literal)", any_of("literal non-zero integer", mut(final_run(ERR + "exit $X"))))
    check("a file test (`[ -f x ]`) is refused", any_of("file or string operator", mut(final_run(ERR + "if [ -f x ]; then echo y; fi\nexit 1"))))
    check("the final step's script is run with `bash -e` and no pipefail, as the runner's default shell does",
          subprocess.run(["bash", "-e", "-c", "false | true; echo reached"], capture_output=True, text=True).stdout == "reached\n")
    check("the final step that interpolates an expression into its script is refused", any_of("interpolates", mut(final_run(ERR + "echo ${{ steps.chromium.outcome }}\nexit 1"))))
    check("the final step with an env value that is any other expression is refused", any_of("cannot evaluate", mut(lambda s: s[-1].update({"env": {"INSTALL_OUTCOME": "${{ steps.chromium.outcome }}", "X": "${{ github.sha }}"}}))))
    check("the final step with `shell: pwsh` is refused", any_of("shell", mut(lambda s: s[-1].update({"shell": "pwsh"}))))
    check("a step after the final step is refused (the failure it makes would skip it)",
          any_of("LAST step", mut(lambda s: s.append({"name": "appended", "run": "npm run pure"}))))
    check("...and so is a browser step after it", any_of("LAST step", mut(lambda s: s.append({"name": "late shots", "if": gated, "run": "npm run shot"}))))
    check("a final step that is not last is refused for THAT, and not also told it \"must not wait for the install\" (a runner run showed the inverted advice)",
          not any_of("must not wait", mut(lambda s: s.append({"name": "appended", "run": "npm run pure"}))) and
          sum(1 for b in mut(lambda s: s.append({"name": "appended", "run": "npm run pure"})) if "LAST step" in b) == 1)
    check("the final step is run for all four outcomes, not one: a script that fails only for `failure` is refused for the other three",
          any_of("did not for: 'skipped': exit 0, so the job would be GREEN; 'cancelled': exit 0, so the job would be GREEN; '': exit 0",
                 mut(final_run('if [ "$INSTALL_OUTCOME" = failure ]; then echo "::error::f"; exit 1; fi'))))

    # ---- A STRAY continue-on-error ELSEWHERE swallows a red step
    check("`continue-on-error` on a plain step is refused", any_of("only the install may", mut(lambda s: s[3].update({"continue-on-error": True}))))
    check("`continue-on-error` on a browser step is refused", any_of("only the install may", mut(lambda s: s[2].update({"continue-on-error": True}))))
    check("`continue-on-error` on the build step (before the install) is refused", any_of("only the install may", mut(lambda s: s[0].update({"continue-on-error": True}))))
    check("`continue-on-error` on the JOB is refused", any_of("job `verify` has", audit({"jobs": {"verify": {"continue-on-error": True, "steps": good["jobs"]["verify"]["steps"]}}}, pkg, read, final_timeout=5)[0]))
    check("a plain step with `if: false` is refused (it never runs), as the string and as YAML's boolean",
          any_of("never runs", mut(lambda s: s[3].update({"if": "false"}))) and any_of("never runs", mut(lambda s: s[3].update({"if": False}))))
    check("...also written ${{ false }}", any_of("never runs", mut(lambda s: s[3].update({"if": "${{ false }}"}))))

    # ---- THE GATE'S EXTRA CLAUSES may only keep the step running
    check("a gate AND-ed with `failure()` is refused (the step would run only after something else failed)", any_of("must carry", mut(lambda s: s[2].update({"if": gated + " && failure()"}))))
    check("a gate AND-ed with another step's `== 'failure'` is refused", any_of("must carry", mut(lambda s: s[2].update({"if": gated + " && steps.build.outcome == 'failure'"}))))
    check("a gate AND-ed with the self-contradiction `!= 'success'` is refused", any_of("must carry", mut(lambda s: s[2].update({"if": gated + " && steps.chromium.outcome != 'success'"}))))
    check("a gate AND-ed with `== 'skipped'` is refused", any_of("must carry", mut(lambda s: s[2].update({"if": gated + " && steps.build.outcome == 'skipped'"}))))
    check("a gate AND-ed with `success()` or `always()` is accepted", gated_if(gated + " && success()") and gated_if("always() && " + gated))

    # ---- THE READER FAILS CLOSED. Each form below launches a browser (or hides what it launches) and was read as browser-free.
    def unresolved(run, **extra):
        return read_step({"run": run, **extra}, pkg, read)["unresolved"]

    def browser(run):
        return read_step({"run": run}, pkg, read)["browser"]
    for run in ["timeout 60 node scripts/pure.mjs", "env CI=1 node scripts/pure.mjs", "bash -c 'node scripts/pure.mjs'", "xvfb-run node scripts/pure.mjs",
                "time node scripts/pure.mjs", "exec node scripts/pure.mjs", "ls | xargs -n1 node scripts/pure.mjs", "pnpm run pure", "yarn pure", "sh scripts/x.sh",
                "./scripts/x.sh", "source ./x.sh", "eval node scripts/pure.mjs", "npm exec -- node scripts/pure.mjs", "npx -y cowsay hi"]:
        check(f"UNRESOLVED, not browser-free: `{run}`", unresolved(run) != [], run)
    check("a heredoc is unresolved (its body is lines of code)", unresolved("node - <<EOF\nconsole.log(1)\nEOF") != [])
    check("a command substitution INSIDE quotes is unresolved", unresolved('echo "$(node scripts/shot.mjs)"') != [] and unresolved("echo `node scripts/shot.mjs`") != [])
    check("unbalanced quoting is unresolved", unresolved("echo 'a") != [])
    # ---- A SCRIPT THAT SPAWNS A BROWSER SCRIPT (docs/CC-CMD-2026-11-11-runner-apt-mirror-dns.md, item 2)
    for name in ("spawner", "spawn2", "spawn3", "spawn-bare", "spawn-dyn"):
        check(f"`node scripts/{name}.mjs` imports child_process and names a browser script (one hop, two, three, a bare name, a dynamic import): a browser step", browser(f"node scripts/{name}.mjs") is True, name)
    check("...unless it is run with --self-test, which never launches", browser("node scripts/spawner.mjs --self-test") is False)
    check("a script that names a browser script but spawns nothing is not a spawner (the name is data)", browser("node scripts/mentions.mjs") is False)
    check("a spawner of scripts that launch nothing is browser-free", browser("node scripts/spawn-pure.mjs") is False)
    check("a browser script named only in a comment is not named", browser("node scripts/spawn-comment.mjs") is False)
    check("two scripts that spawn each other terminate, and are browser-free", browser("node scripts/cyc-a.mjs") is False)
    check("a DECLARED read-only mode of a spawner is browser-free: mutation-check --anchors and --stranded", browser("node scripts/mutation-check.mjs --anchors") is False and browser("node scripts/mutation-check.mjs --stranded") is False)
    check("...and its other modes are browser steps (no arguments, --only, a shard)", all(browser(f"node scripts/mutation-check.mjs{a}") is True for a in ("", " --only x", " --shard 1/8")))
    check("...and a declared mode written with the flag after another is still declared", browser("node scripts/mutation-check.mjs --build watch --anchors") is False)
    check("a spawner declared for EVERY argument (import-purity-check) is browser-free with none, and with any", browser("node scripts/import-purity-check.mjs") is False and browser("node scripts/import-purity-check.mjs --x") is False)
    check("a script that runs browser scripts only under the launch trap (no-launch-check) is browser-free whatever its arguments", browser("node scripts/no-launch-check.mjs") is False and browser("node scripts/no-launch-check.mjs --whatever") is False)
    check("an npm script that reaches a spawner is a browser step too", read_step({"run": "npm run spawn"}, {**pkg, "spawn": "node scripts/spawner.mjs"}, read)["browser"] is True)
    check("node with a separate-value flag (`--max-old-space-size 4096`) is unresolved, not read as the entry",
          unresolved("node --max-old-space-size 4096 scripts/shot.mjs") != [])
    check("...and with the `=` form it is read", browser("node --max-old-space-size=4096 scripts/shot.mjs") is True and unresolved("node --max-old-space-size=4096 scripts/shot.mjs") == [])
    check("a node entry with no extension is unresolved", unresolved("node scripts/shot") != [])
    check("an entry that is not in the tree is unresolved (a typo is not browser-free)", unresolved("node scripts/nope.mjs") != [])
    check("an entry under build/ that is not built here is not (it is compiled F#)", unresolved("node build/Main.js") == [] and browser("node build/Main.js") is False)
    check("`cd` is unresolved (every later relative path would mean something else)", unresolved("cd scripts") != [])
    check("python with -m or -c is unresolved", unresolved("python3 -m http.server") != [] and unresolved("python3 -c 'print(1)'") != [])
    check("`npm run x -- --self-test` is unresolved (which command gets it is not modelled)", unresolved("npm run shot -- --self-test") != [])
    check("`npm run x -- --flag` is read like the script (a pass-through flag does not change whether a browser starts)",
          browser("npm run shot -- --tolerate-unreachable") is True and unresolved("npm run shot -- --tolerate-unreachable") == [] and
          browser("npm run pure -- --tolerate-unreachable") is False)
    check("`npm run x y` (an argument without `--`) is unresolved", unresolved("npm run shot y") != [])
    check("a missing npm script is unresolved", unresolved("npm run nothere") != [])
    check("a package.json script that is not a string is unresolved", unresolved("npm run num") != [])
    check("a cycle of npm scripts is unresolved, not read as browser-free", unresolved("npm run cyc-a") != [])
    check("a chain 20 npm scripts deep is unresolved (the cap is stated, not a silent truncation)", unresolved("npm run hop0") != [])
    check("an npm flag it does not know is unresolved (`--prefix=sub` would run another package's scripts)", unresolved("npm --prefix=sub run pure") != [])
    check("`npm test` with no test script is unresolved",
          read_step({"run": "npm test"}, {k: v for k, v in pkg.items() if k != "test"}, read)["unresolved"] != [])
    check("a composite action is unresolved; the standard ones are not", read_step({"uses": "./.github/actions/x"}, pkg, read)["unresolved"] != [] and
          read_step({"uses": "actions/upload-artifact@v4"}, pkg, read)["unresolved"] == [])
    check("a script under `shell: pwsh` or another working-directory is unresolved", unresolved("echo hi", shell="pwsh") != [] and unresolved("echo hi", **{"working-directory": "sub"}) != [])
    # and the forms that DO resolve, each of which the old reader dropped silently
    check("a one-line `if ...; then node ...; fi` is read", browser("if true; then node scripts/shot.mjs; fi") is True)
    check("a one-line `for ... do node ...; done` is read", browser("for f in a b; do node scripts/shot.mjs; done") is True)
    check("...also with a `$(...)` in the header, whose `);` is two operators (the command after `do` is not swallowed)",
          browser("for i in $(seq 1 3); do node scripts/shot.mjs; done") is True)
    check("a command substitution `out=$(node ...)` is read", browser("out=$(node scripts/shot.mjs)") is True)
    check("a negated `if ! node ...` is read", browser("if ! node scripts/shot.mjs; then echo no; fi") is True)
    check("a brace group `{ node ...; }` is read", browser("{ node scripts/shot.mjs; }") is True)
    check("`node -r ./pre.cjs scripts/shot.mjs` is read, and the preload is read too",
          browser("node -r ./pre.cjs scripts/shot.mjs") is True and browser("node -r ./pre-launch.cjs scripts/pure.mjs") is True and browser("node --import ./pre.cjs scripts/pure.mjs") is False)
    check("a preload runs even for `--self-test`", browser("node -r ./pre-launch.cjs scripts/shot.mjs --self-test") is True)
    check("a second command after a single `&` is read (it is not an argument of the first)", browser("node scripts/pure.mjs --self-test & node scripts/shot.mjs") is True)
    check("`--self-test` in a trailing comment is a comment, not an argument", browser("node scripts/shot.mjs # --self-test") is True)
    check("a `;`-joined `--self-test` run does not excuse the next command", browser("node scripts/shot.mjs --self-test; node scripts/shot.mjs") is True)
    check("`npm --silent run` and `npm run-script` are read", browser("npm --silent run shot") is True and browser("npm run-script shot") is True)
    check("a `preX` hook is read", browser("npm run hookfires") is True and unresolved("npm run hookfires") == [], (browser("npm run hookfires"), unresolved("npm run hookfires")))
    check("`npx playwright@1.50.0 test` and `npx -y playwright test` are browser steps", browser("npx playwright@1.50.0 test") is True and browser("npx -y playwright test") is True)
    check("a VAR='quoted value' prefix is read", browser("npm run env-url") is True and unresolved("npm run env-url") == [])
    check("the repo's own wait loop (`for i in $(seq ...); do curl ... && break; sleep 1; done`) is read and browser-free",
          browser("npm run loop") is False and unresolved("npm run loop") == [])
    check("output redirection does not hide or invent a command", browser("node scripts/shot.mjs > /dev/null 2>&1") is True and unresolved("echo hi > /dev/null 2>&1") == [])
    check("audit refuses a step it cannot read, and names why",
          any_of("cannot be read", bad_of(wf([{"name": "b", "id": "build", "run": "npm run pure"}, inst, {"name": "wrapped", "run": "mktemp -d"}, final]))))
    wrapped = {"name": "wrapped", "run": "mktemp -d"}
    op = lambda step: audit(wf([{"name": "b", "id": "build", "run": "npm run pure"}, inst, step, final]), pkg, read, final_timeout=5)
    check("A STEP THE READER CANNOT READ BUT THAT CARRIES EXACTLY `always()` IS NOT THE INSTALL'S TO SKIP: accepted, and counted as `opaque`, not as read",
          op({**wrapped, "if": "always()"})[0] == [] and op({**wrapped, "if": "always()"})[1]["opaque"] == 1 and op({**wrapped, "if": "always()"})[1]["unreadable"] == 0,
          op({**wrapped, "if": "always()"}))
    check("...but not one with `!cancelled()`, with `always() && ...`, with the install gate, or with no `if` at all (each can be skipped, so each has to be readable)",
          all(any_of("cannot be read", op({**wrapped, "if": c})[0]) for c in ("!cancelled()", "always() && github.event_name == 'push'", gated)) and any_of("cannot be read", op(wrapped)[0]))
    check("...and the last step is the final step even when it reads `always()` and cannot be read: it is not waved through as opaque",
          any_of("must be the final step", audit(wf([{"name": "b", "id": "build", "run": "npm run pure"}, inst, {**wrapped, "if": "always()"}]), pkg, read, final_timeout=5)[0]))
    check("a step BEFORE the install need not be readable (only a definite launch matters there)",
          bad_of(wf([{"name": "setup", "run": "dotnet restore"}, inst, {"name": "x", "if": gated, "run": "npm run shot"}, final])) == [])


    # ---- FROM THE SECOND REVIEW (6ea67d9): each is an input the first fixtures lacked
    check("a `#` INSIDE a word is not a comment: `echo $#; node ...` still reads the node command", browser("echo $#; node scripts/shot.mjs") is True)
    check("...nor is `/#top` in a URL, or `${x##*/}`", browser("curl -sf http://x/#top && node scripts/shot.mjs") is True and browser("f=${X##*/}; node scripts/shot.mjs") is True)
    check("...a `#` that begins a word still is one, and a quoted one is not", browser("node scripts/pure.mjs # node scripts/shot.mjs") is False and browser('echo "a # b"; node scripts/shot.mjs') is True)
    check("a process substitution is unresolved, behind a safe head too (`cat <(node ...)`)", unresolved("diff <(echo a) <(node scripts/shot.mjs)") != [] and unresolved("cat <(node scripts/shot.mjs)") != [])
    for flag in ["--import=./pre-launch.cjs", "--require=./pre-launch.cjs", "--loader=./pre-launch.cjs", "--experimental-loader=./pre-launch.cjs", "-r./pre-launch.cjs",
                 "--require ./pre-launch.cjs", "--loader ./pre-launch.cjs", "--experimental-loader ./pre-launch.cjs", "--import ./pre-launch.cjs"]:
        check(f"a preload in the form `{flag}` is read (it launches, the entry does not)", browser(f"node {flag} scripts/pure.mjs") is True, flag)
    check("a preload that launches runs even with `--self-test`", browser("node --require ./pre-launch.cjs scripts/shot.mjs --self-test") is True)
    for run in ["node --eval=x scripts/pure.mjs", "node --print=x scripts/pure.mjs", "node --run=check scripts/pure.mjs", "node --run check scripts/pure.mjs", "node -e scripts/pure.mjs",
                "curl -s http://x/code.js | node - scripts/pure.mjs"]:
        check(f"inline code or a package script is unresolved: `{run}`", unresolved(run) != [], run)
    check("a flag with a separate value before the entry, and a second script after it, is ambiguous and unresolved",
          unresolved("node --redirect-warnings scripts/pure.mjs scripts/shot.mjs") != [] and unresolved("node --no-warnings scripts/pure.mjs") == [])
    check("a node entry with no extension is unresolved even when the file exists, and so is a glob", unresolved("node scripts/noext") != [] and unresolved("node build/*.js") != [])
    check("a python entry that is a glob is unresolved", unresolved("python3 build/*.py") != [])
    check("a redirect target is not the script's first argument: `node > out.log scripts/pure.mjs` and `npm run pure > out.log` resolve, and a target of `--self-test` does not excuse the launch",
          unresolved("node > out.log scripts/pure.mjs") == [] and unresolved("npm run pure > out.log") == [] and browser("node scripts/shot.mjs > --self-test") is True)
    check("`||` and `|` separate commands too: the one after a safe head is read", browser("echo hi || node scripts/shot.mjs") is True and browser("echo hi | node scripts/shot.mjs") is True)
    check("a last line ending in a backslash is still a line", browser("node scripts/shot.mjs \\") is True)
    check("a JS script with a trailing `//` comment after the launch is a browser step", needs_browser({"run": "node scripts/l-trailing.mjs"}, pkg, read) is True)
    check("require('playwright-core') and `chromium.launch (` with a space are launches",
          needs_browser({"run": "node scripts/l-require-core.mjs"}, pkg, read) is True and needs_browser({"run": "node scripts/l-spaced.mjs"}, pkg, read) is True)
    check("NODE_OPTIONS or PATH set in front of a command, by `export`, or in a step's env: is unresolved",
          unresolved("NODE_OPTIONS='-r ./pre-launch.cjs' node scripts/pure.mjs") != [] and unresolved("export NODE_OPTIONS=-r") != [] and unresolved("PATH=/tmp:$PATH node scripts/pure.mjs") != []
          and unresolved("node scripts/pure.mjs", env={"NODE_OPTIONS": "x"}) != [] and unresolved("export FOO=1; node scripts/pure.mjs") == [])
    check("a job or workflow env that sets NODE_OPTIONS is refused",
          any_of("env sets NODE_OPTIONS", audit({"jobs": {"verify": {"env": {"NODE_OPTIONS": "x"}, "steps": good["jobs"]["verify"]["steps"]}}}, pkg, read, final_timeout=5)[0]) and
          any_of("env sets PATH", audit({"env": {"PATH": "x"}, "jobs": {"verify": {"steps": good["jobs"]["verify"]["steps"]}}}, pkg, read, final_timeout=5)[0]))
    check("npm flags AFTER `run` are read: `npm run --silent x` and `npm run -s x`", browser("npm run --silent shot") is True and browser("npm run -s shot") is True and unresolved("npm run -s shot") == [])
    check("an npm flag after `run` that is not known is unresolved", unresolved("npm run --prefix=sub shot") != [])
    pkg2 = {**pkg}
    check("the lifecycle hooks of `npm test`, `npm start` and `npm ci` are read (a launching pretest, prestart, prepare)",
          read_step({"run": "npm test"}, pkg2, read)["browser"] is True and read_step({"run": "npm start"}, pkg2, read)["browser"] is True and read_step({"run": "npm ci"}, pkg2, read)["browser"] is True)
    # ---- the gate, the install and the references
    check("a gate with a trailing comparison (`&& always() == false`) is not a gate", not gated_if(gated + " && always() == false"))
    check("`if: 0` is refused like `if: false`", any_of("never runs", mut(lambda s: s[3].update({"if": 0}))))
    check("a step gated through bracket notation, `steps['chromium'].outcome`, is gated; a plain one gated that way is refused",
          bad_of(wf([{"name": "b", "run": "true"}, inst, {"name": "x", "if": "steps['chromium'].outcome == 'success'", "run": "npm run shot"}, final])) == [] and
          any_of("must not wait", mut(lambda s: s[3].update({"if": "steps['chromium'].outcome == 'success'"}))))
    check("a `steps.<id>.outcome` that names a renamed `build` id is refused (the existence rule is not only about `chromium`)",
          any_of("no earlier step has id", bad_of(wf([{"name": "b", "id": "bld", "run": "npm run pure"}, inst, {"name": "tail", "if": tail_if, "run": "npm run shot"}, final]))))
    check("the install with `continue-on-error: ${{ expr }}` is refused", any_of("continue-on-error", mut(lambda s: s[1].update({"continue-on-error": "${{ false }}"}))))
    check("the install step is ONE install command: more in it is swallowed by continue-on-error, so it is refused",
          any_of("must be ONE", mut(lambda s: s[1].update({"run": "npx playwright install chromium\nnpm run pure"}))) and
          any_of("must be ONE", mut(lambda s: s[1].update({"run": "npx playwright install chromium && npm run pure"}))))
    check("...and `timeout --kill-after=10 180 npx playwright install chromium` is one install command", mut(lambda s: s[1].update({"run": "timeout --kill-after=10 180 npx playwright install chromium"})) == [])

    # ---- THE COMPOSITE ACTION TARGET AND THE NO-BROWSER FLAG
    nb_gate = "steps.chromium.outcome != 'success'"
    sh = lambda d: {**d, "shell": "bash"}
    action_steps = [sh(dict(inst)), sh({"name": "serve", "run": "npm run pure"}),
                    sh({"name": "run", "if": gated, "run": "node scripts/mutation-check.mjs --shard 1/8"}),
                    sh({"name": "run without a browser", "if": nb_gate, "run": 'if [ -n "$IDS" ]; then\n  node scripts/mutation-check.mjs --ids "$IDS" --no-browser --out x.json\nelse\n  node scripts/mutation-check.mjs --shard 1/8 --no-browser --out x.json\nfi'}),
                    {"name": "upload", "if": "always()", "uses": "actions/upload-artifact@v4"}, sh(dict(final))]
    action_doc = {"runs": {"using": "composite", "steps": action_steps}}

    def act(fn=None, steps=None):
        import copy
        d = {"runs": {"using": "composite", "steps": copy.deepcopy(steps or action_steps)}}
        if fn:
            fn(d["runs"]["steps"])
        return audit(d, pkg, read, job=None, final_timeout=5)

    check("A COMPOSITE ACTION IS A TARGET (job None, its steps under `runs`): install, a gated browser run, a no-browser run, an upload and a final step pass, and are counted",
          act()[0] == [] and act()[1] == {"steps": 5, "browser": 1, "plain": 4, "unreadable": 0, "opaque": 0, "final_ok": 4}, act())
    check("...the no-browser run is read as browser-free in a target's audit, and as a BROWSER step anywhere else (the flag alone is not enough: it needs the audit of its `if`)",
          read_step(action_steps[3], pkg, read, no_browser_ok=True)["browser"] is False and needs_browser(action_steps[3], pkg, read) is True and needs_browser(action_steps[2], pkg, read) is True)
    check("...the flag of a spawner that does not declare one changes nothing (`scripts/spawner.mjs --no-browser` is a browser step even in an audit)",
          read_step({"run": "node scripts/spawner.mjs --no-browser"}, pkg, read, no_browser_ok=True)["browser"] is True)
    nb_bad = lambda cond: any_of("runs with a no-browser flag", act(lambda s: s[3].update({"if": cond}) if cond is not None else s[3].pop("if"))[0])
    check("a no-browser run with no `if` is refused (it would run with a browser installed)", nb_bad(None))
    check("...with `always()` alone is refused", nb_bad("always()"))
    check("...gated on the install SUCCEEDING is refused (that is the browser run's gate)", nb_bad(gated))
    check("...with a clause besides the three that cannot make it run after a good install is refused", nb_bad(nb_gate + " && github.event_name == 'push'"))
    check("...with `failure()` (the job is not failed while the install is only marked so) or another step's success (it would wait for what need not have run) is refused",
          nb_bad(nb_gate + " && failure()") and nb_bad(nb_gate + " && steps.serve.outcome == 'success'"))
    check("...but `always() && ...`, `... && success()` and `... && !cancelled()` are the one it takes",
          all(act(lambda s, c=c: s[3].update({"if": c}))[0] == [] for c in ("always() && " + nb_gate, nb_gate + " && success()", "!cancelled() && " + nb_gate)))
    check("a browser run in the action with no gate is refused, as in a job", any_of("must carry", act(lambda s: s[2].pop("if"))[0]))
    check("an action with no final step is refused, naming the action", any_of("the LAST step of the composite action must be the final step", act(steps=action_steps[:-1])[0]))
    check("an action with two installs is refused, naming the action", any_of("in the composite action, found 2", act(steps=action_steps[:1] + action_steps)[0]))
    check("a composite action document read as a JOB finds no install: the two shapes are not confused",
          any_of("in job `verify`, found 0", audit(action_doc, pkg, read, final_timeout=5)[0]) and job_steps(good, None) == [] and job_steps(action_doc, None) == action_steps)

    # ---- THE REAL-TREE PATH AND THE CLI EXIT: run the guard itself, as the browser-gate job does, in a temporary root holding a verify.yml
    # big enough to pass the coverage floors, a live-check.yml of the second target, and the other install sites each with its annotation
    live_final = {"name": "Chromium did not install", "if": "always() && steps.chromium.outcome != 'success'", "env": {"INSTALL_OUTCOME": "${{ steps.chromium.outcome }}"},
                  "run": "echo \"::error::outcome $INSTALL_OUTCOME\"\nexit 1"}
    live_good = [{"name": "setup", "run": "npm run pure"}, inst] + \
                [{"name": f"deployed {i}", "if": "!cancelled() && " + gated, "run": "npm run shot"} for i in range(6)] + \
                [{"name": f"stamp {i}", "run": "npm run pure"} for i in range(3)] + [live_final]
    live_wf = {"jobs": {"live": {"steps": live_good}}}
    probe_text = "jobs:\n  probe:\n    steps:\n      - run: npm run pure\n" + \
                 "      # browser-gate: exempt 1 -- the probe's own verdict is the only step after it and needs the browser's result\n" + \
                 "      - name: Install Chromium\n        run: npx playwright install chromium\n      - name: verdict\n        run: npm run pure\n      - name: Commit\n        if: always()\n        run: npm run pure\n"

    # the fourth target: verify-full's `full` job. Its ledger steps run something the reader refuses (a wrapper such as `timeout`); they carry exactly `always()`, so they are kept and counted.
    ledger = {"name": "Record this measurement", "if": "always()", "run": "mktemp -d"}
    full_steps = [{"name": "setup", "run": "npm run pure"}, inst, {"name": "serve", "run": "npm run pure"}, {"name": "proof self-test", "if": "!cancelled()", "run": "npm run pure"},
                  {"name": "peak", "if": gated, "run": "npm run shot"}, {"name": "gate", "if": gated, "run": "node scripts/confidence.mjs"},
                  {"name": "gate without a browser", "if": nb_gate, "run": "node scripts/confidence.mjs --browserless"}, {**ledger, "name": "Keep baseline"}, ledger, final]
    full_doc = {"jobs": {"full": {"steps": full_steps}}}

    def gate_text(flagged, plain, extra=""):
        rows = "".join(f"  {{ name: 'browser row {i}', weight: 30, skipQuick: true, browser: true,\n    run: () => ok('node scripts/shot.mjs') }},\n" for i in range(flagged))
        rows += "".join(f"  {{ name: 'plain row {i}', weight: 10,\n    run: () => ok('node scripts/pure.mjs') }},\n" for i in range(plain))
        return "const rows = [\n" + rows + extra + "]\n"

    gate_good = gate_text(6, 16)

    def cli(steps, with_probe=probe_text, live=live_wf, extra=None, action=action_doc, full=full_doc, rows=gate_good):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / ".github" / "workflows").mkdir(parents=True)
            if action is not None:
                (root / ".github" / "actions" / "mutation-shard").mkdir(parents=True)
                (root / ".github" / "actions" / "mutation-shard" / "action.yml").write_text(yaml.safe_dump(action))
            (root / ".github" / "workflows" / "verify.yml").write_text(yaml.safe_dump(wf(steps)))
            if live is not None:
                (root / ".github" / "workflows" / "live-check.yml").write_text(yaml.safe_dump(live))
            if with_probe is not None:
                (root / ".github" / "workflows" / "probe.yml").write_text(with_probe)
            if full is not None:
                (root / ".github" / "workflows" / "verify-full.yml").write_text(yaml.safe_dump(full))
            for name, text in (extra or {}).items():
                (root / ".github" / "workflows" / name).write_text(text)
            (root / "package.json").write_text(json.dumps({"scripts": pkg}))
            for f, src in files.items():
                if "/" in f and not f.startswith(("..", "/")):
                    (root / f).parent.mkdir(parents=True, exist_ok=True)
                    (root / f).write_text(src)
            if rows is not None:
                (root / "scripts" / "gate-checks.mjs").write_text(rows)
            r = subprocess.run([sys.executable, __file__], cwd=d, capture_output=True, text=True, timeout=60)
            return r.returncode, r.stdout + r.stderr

    big = [{"name": "build", "id": "build", "run": "npm run pure"}, inst] + \
          [{"name": f"shot {i}", "if": gated, "run": "npm run shot"} for i in range(12)] + \
          [{"name": f"plain {i}", "run": "npm run pure"} for i in range(50)] + [final]
    rc, out = cli(big)
    check("THE CLI on a good tree exits 0 and says `verdict: gated`", rc == 0 and "verdict: gated" in out, (rc, out[-400:]))
    check("...it reads ALL FOUR targets and says so", "workflows/verify.yml, job `verify`" in out and "workflows/live-check.yml, job `live`" in out
          and "actions/mutation-shard/action.yml, composite action" in out and "workflows/verify-full.yml, job `full`" in out and "4 job(s) get the whole shape" in out, out[-500:])
    check("...it reports the steps it kept without reading (`always()`) and the gate rows it compared with their flags",
          "not read, `always()` (kept)  : 2" in out and "GATE ROWS: 22 read" in out and "6 flagged `browser`" in out, out[-1500:])
    check("...and lists the exempt site with its pinned N and its reason (Rule 91)", "probe.yml:" in out and "N=1" in out and "the probe's own verdict" in out, out[-400:])
    broken = [dict(s) for s in big]
    del broken[1]["id"]
    rc, out = cli(broken)
    check("THE CLI on a tree whose install has lost its id exits 1, prints FAIL and names the problem",
          rc == 1 and "FAIL: " in out and "must have `id: chromium`" in out and "verdict: gated" not in out, (rc, out[-300:]))
    rc, out = cli([{"name": "build", "id": "build", "run": "npm run pure"}, inst, {"name": "shots", "if": gated, "run": "npm run shot"}, final])
    check("THE CLI applies the coverage floors to the first target: a tree that reads too little exits 1", rc == 1 and "expected at least" in out, (rc, out[-300:]))
    rc, out = cli(big, live=None)
    check("THE CLI with a target file missing exits 1 and says which", rc == 1 and "live-check.yml does not exist" in out, (rc, out[-300:]))
    rc, out = cli(big, full=None)
    check("THE CLI with verify-full.yml missing exits 1 and says which", rc == 1 and "verify-full.yml does not exist" in out, (rc, out[-300:]))
    rc, out = cli(big, full={"jobs": {"full": {"steps": full_steps[:-1]}}})
    check("THE CLI on a verify-full `full` job that lost its final step exits 1, naming that file", rc == 1 and "verify-full.yml: the LAST step" in out, (rc, out[-300:]))
    rc, out = cli(big, rows=gate_text(6, 16, "  { name: 'a new browser row', weight: 30, skipQuick: true,\n    run: () => ok('node scripts/shot.mjs') },\n"))
    check("THE CLI on a gate row that drives a browser and is not flagged exits 1, naming the row (`--browserless` would run it with no browser)",
          rc == 1 and "'a new browser row' drives a browser" in out and "not flagged `browser`" in out, (rc, out[-400:]))
    rc, out = cli(big, rows=gate_text(6, 16, "  { name: 'a flagged plain row', weight: 30, skipQuick: true, browser: true,\n    run: () => ok('node scripts/pure.mjs') },\n"))
    check("THE CLI on a gate row that is flagged and drives no browser exits 1, naming the row (it would be left out for nothing)",
          rc == 1 and "'a flagged plain row' is flagged `browser`" in out, (rc, out[-400:]))
    rc, out = cli(big, rows=gate_text(6, 5))
    check("THE CLI on a gate-checks file that reads too few rows exits 1 (a reader that reads nothing must not pass)", rc == 1 and "only 11 gate rows read" in out, (rc, out[-400:]))
    rc, out = cli(big, rows=gate_text(3, 19))
    check("THE CLI on a gate with too few flagged rows exits 1", rc == 1 and "only 3 gate rows are flagged `browser`" in out, (rc, out[-400:]))
    rc, out = cli(big, rows=None)
    check("THE CLI with no scripts/gate-checks.mjs exits 1 and says it could not be read", rc == 1 and "scripts/gate-checks.mjs could not be read" in out, (rc, out[-400:]))
    rc, out = cli(big, full={"jobs": {"full": {"steps": [s if s.get("name") != "gate without a browser" else {"name": "zone", "if": nb_gate, "run": "node scripts/pure.mjs"} for s in full_steps]}}})
    check("THE CLI on a `full` job whose browserless gate was replaced by an unrelated browser-free step exits 1, saying it must run `scripts/confidence.mjs --browserless` (the wiring of TARGETS' `flagged`)",
          rc == 1 and "must run `scripts/confidence.mjs --browserless`" in out, (rc, out[-500:]))
    rc, out = cli(big, action={"runs": {"using": "composite", "steps": [s for k, s in enumerate(action_steps) if k != 3]}})
    check("...and an action that lost its no-browser run exits 1, saying it must run `scripts/mutation-check.mjs --no-browser`", rc == 1 and "must run `scripts/mutation-check.mjs --no-browser`" in out, (rc, out[-500:]))
    rc, out = cli(big, extra={"caller.yml": "jobs:\n  j:\n    steps:\n      - uses: ./.github/actions/mutation-shard\n      - name: after\n        run: echo after\n"})
    check("THE CLI on a workflow with a step after the shard action and no status function exits 1, naming it (the wiring of the callers audit)", rc == 1 and "follows ./.github/actions/mutation-shard" in out, (rc, out[-500:]))
    rc, out = cli(big, action=None)
    check("THE CLI with the composite action missing exits 1 and says which", rc == 1 and "action.yml does not exist" in out, (rc, out[-300:]))
    rc, out = cli(big, action={"runs": {"using": "composite", "steps": [sh(dict(inst)), sh(dict(final))]}})
    check("THE CLI applies the coverage floors to the composite action: an action that reads too little exits 1, naming it", rc == 1 and "action.yml: only" in out and "expected at least" in out, (rc, out[-300:]))
    rc, out = cli(big, action={"runs": {"using": "composite", "steps": action_steps[:3] + action_steps[4:]}})
    check("THE CLI on an action that lost its no-browser run falls under the floor of 5 steps and exits 1: the floor is what keeps the run from being deleted without a word", rc == 1 and "action.yml: only 4 steps read" in out, (rc, out[-300:]))
    rc, out = cli(big, live={"jobs": {"live": {"steps": live_good[:-1]}}})
    check("THE CLI on a second target that lost its final step exits 1, naming that file", rc == 1 and "live-check.yml: the LAST step" in out, (rc, out[-300:]))
    rc, out = cli(big, live={"jobs": {"live": {"steps": [dict(live_good[0]), dict(live_good[1])] + live_good[2:4]}}})
    check("THE CLI applies the SECOND target's floors (8 steps, 5 browser, 2 browser-free): a live job that reads too little exits 1", rc == 1 and "live-check.yml: only" in out, (rc, out[-300:]))
    rc, out = cli(big, with_probe=probe_text.replace("      # browser-gate: exempt 1 -- the probe's own verdict is the only step after it and needs the browser's result\n", ""))
    check("THE CLI on an install site with no annotation exits 1", rc == 1 and "neither a target of this guard nor annotated" in out, (rc, out[-300:]))
    rc, out = cli(big, with_probe=probe_text.replace("exempt 1 --", "exempt 5 --"))
    check("THE CLI on an annotation with a wrong N exits 1 and says what N is", rc == 1 and "the annotation says 5" in out, (rc, out[-300:]))
    rc, out = cli(big, extra={"stale.yml": "# browser-gate: exempt 0 -- nothing installs here\njobs:\n  a:\n    steps:\n      - run: echo hi\n"})
    check("THE CLI on an annotation above no install exits 1, calling it stale", rc == 1 and "is stale" in out, (rc, out[-300:]))

    # ---- THE EXEMPT SITES, directly: the pinned count, the annotation's shape and its reach, the pairing, a composite action
    def sites(files_by_name, actions=None):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / ".github" / "workflows").mkdir(parents=True)
            for n, text in files_by_name.items():
                (root / ".github" / "workflows" / n).write_text(text)
            for n, text in (actions or {}).items():
                (root / ".github" / "actions" / n).mkdir(parents=True)
                (root / ".github" / "actions" / n / "action.yml").write_text(text)
            return exempt_sites(str(root), pkg, read)
    NOTE = "      # browser-gate: exempt {n} -- {why}\n"

    def site(n, why="the verdict needs the browser", steps_after="      - name: verdict\n        run: npm run pure\n"):
        return "jobs:\n  probe:\n    steps:\n" + NOTE.format(n=n, why=why) + "      - name: Install Chromium\n        run: npx playwright install chromium\n" + steps_after
    bad1, tab1 = sites({"a.yml": site(1)})
    check("an exempt site with the right N is accepted and listed with its reason", bad1 == [] and len(tab1) == 1 and tab1[0][2] == 1 and tab1[0][3] == "the verdict needs the browser", (bad1, tab1))
    bad2, _ = sites({"a.yml": site(2)})
    check("...with a wrong N it is refused, and the message says what N is", any_of("the annotation says 2", bad2) and any_of("1 step(s) after the install", bad2), bad2)
    bad3, _ = sites({"a.yml": site(0, steps_after="      - name: verdict\n        run: npm run shot\n")})
    check("a step that NEEDS a browser is not counted (it is skipped, and should be)", bad3 == [], bad3)
    bad4, _ = sites({"a.yml": site(0, steps_after="      - name: after\n        if: always()\n        run: npm run pure\n")})
    check("a step with `always()` is not counted (it runs when the install fails)", bad4 == [], bad4)
    bad4b, _ = sites({"a.yml": site(0, steps_after="      - name: after\n        if: ${{ !cancelled() }}\n        run: npm run pure\n")})
    check("a step whose `if` is `!cancelled()` is not counted either", bad4b == [], bad4b)
    bad4b2, _ = sites({"a.yml": site(1, steps_after="      - name: after\n        if: ${{ !cancelled() && steps.x.outcome == 'success' }}\n        run: npm run pure\n")})
    check("...but `!cancelled() && steps.x.outcome == 'success'` IS counted: a status function makes the step evaluated, and the second clause may skip it", bad4b2 == [], bad4b2)
    bad4d, _ = sites({"a.yml": site(0, steps_after="      - name: after\n        if: failure()\n        run: npm run pure\n")})
    check("a step with `failure()` is not counted (it runs when the install fails)", bad4d == [], bad4d)
    bad4e, _ = sites({"a.yml": site(1, steps_after="      - name: after\n        if: success()\n        run: npm run pure\n")})
    check("an explicit `success()` IS counted (a failure turns it off, as it does the default)", bad4e == [], bad4e)
    bad4f, _ = sites({"a.yml": site(1, steps_after="      - name: after\n        if: cancelled()\n        run: npm run pure\n")})
    check("a bare `cancelled()` IS counted (it runs only when the run was cancelled)", bad4f == [], bad4f)
    bad4g, _ = sites({"a.yml": site(1, steps_after="      - name: after\n        if: ${{ always() && success() }}\n        run: npm run pure\n")})
    check("`always() && success()` IS counted (the second clause turns it off after a failure)", bad4g == [], bad4g)
    bad4c, _ = sites({"a.yml": site(1, steps_after="      - name: after\n        if: steps.x.outcome == 'success'\n        run: npm run pure\n")})
    check("...but a step gated only on another step's outcome IS counted (the implicit success() skips it)", bad4c == [], bad4c)
    bad5, _ = sites({"a.yml": site(1, steps_after="      - name: u\n        run: timeout 5 node scripts/pure.mjs\n")})
    check("an UNREADABLE step is counted (it may be browser-free)", bad5 == [], bad5)
    bad6, _ = sites({"a.yml": site(1).replace("-- the verdict needs the browser", "--")})
    check("an annotation with no reason is not an annotation", any_of("0 found", bad6), bad6)
    bad6b, _ = sites({"a.yml": site(1) .replace("      # browser-gate", "      # browser-gate: exempt 1 -- twice\n      # browser-gate", 1)})
    check("two annotations above one install are refused", any_of("2 found", bad6b), bad6b)
    bad7, _ = sites({"a.yml": site(1).replace(NOTE.format(n=1, why="the verdict needs the browser"), NOTE.format(n=1, why="far") + "      # x\n" * 45)})
    check("an annotation more than 40 lines above the install is out of reach", any_of("0 found", bad7), bad7)
    bad8, _ = sites({"b.yml": "# browser-gate: exempt 0 -- nothing here\njobs:\n  a:\n    steps:\n      - run: echo hi\n"})
    check("an annotation in a file that installs nothing is stale", any_of("is stale", bad8), bad8)
    bad9, _ = sites({"c.yml": site(2) + "      - name: Install Chromium again\n        run: npx playwright install chromium\n"})
    check("two installs and one annotation: the second is refused, and ONLY the second (one annotation does not cover two installs)",
          len(bad9) == 1 and "c.yml:10" in bad9[0] and "neither a target" in bad9[0], bad9)
    bad10, tab10 = sites({}, actions={"shard": "runs:\n  using: composite\n  steps:\n    - run: npm run pure\n      shell: bash\n" + NOTE.format(n=1, why="the shard needs it").replace("      #", "    #") + "    - name: Install Chromium\n      shell: bash\n      run: timeout 180 npx playwright install chromium\n    - name: Run\n      shell: bash\n      run: npm run pure\n"})
    check("a composite action's install is read the same way", bad10 == [] and len(tab10) == 1, (bad10, tab10))
    bad11, _ = sites({"d.yml": "jobs:\n  a:\n    steps:\n      - name: Install\n        run: |\n          npx playwright install chromium\n          npx playwright install firefox\n"})
    check("two install commands in ONE step cannot be paired and are refused", any_of("cannot pair", bad11), bad11)
    bad12, tab12 = sites({"e.yml": "# npx playwright install chromium (a comment that names the command)\n" + site(1)})
    check("a comment that names the install command is not an install site", bad12 == [] and len(tab12) == 1, (bad12, tab12))
    bad13, _ = sites({}, actions={"x": "runs:\n  using: composite\n  steps:\n    # browser-gate: exempt 0 -- nothing installs here\n    - run: echo hi\n      shell: bash\n"})
    check("a stale annotation inside a composite action is found too", any_of("is stale", bad13), bad13)
    bad14, tab14 = sites({"verify.yml": "jobs:\n  verify:\n    steps:\n      - name: Install\n        run: npx playwright install chromium\n"})
    check("an install in a file the guard covers as a target is not an exempt site (it carries the whole shape, audited elsewhere)", bad14 == [] and tab14 == [], (bad14, tab14))

    # ---- WHEN A STEP RUNS AFTER A FAILED INSTALL: GitHub's rule on the expression, three-valued (the install failed, so success() is false)
    def st(cond, install_id=None):
        try:
            return step_runs_after_failure({"if": cond} if cond is not None else {}, install_id)
        except Exception as e:                  # a crash is a failed check, not a traceback
            return f"CRASH {type(e).__name__}"
    cases = [
        (None, SKIPPED), ("", SKIPPED), ("always()", RUNS), ("failure()", RUNS), ("!cancelled()", RUNS), ("cancelled()", SKIPPED), ("success()", SKIPPED),
        ("!failure()", SKIPPED), ("success() || failure()", RUNS), ("Always()", RUNS), ("ALWAYS()", RUNS), ("Failure()", RUNS), ("!Cancelled()", RUNS),
        ("contains('always()', 'x')", SKIPPED), ("steps.x.outcome == 'always()'", SKIPPED), ("steps.x.outcome == 'success'", SKIPPED), ("false", SKIPPED), (True, SKIPPED),
        ("always() && steps.chromium.outcome == 'success'", UNKNOWN), ("!cancelled() && steps.x.outcome == 'success'", UNKNOWN), ("always() && success()", SKIPPED),
        ("${{ always() }}", RUNS), ("${{ !cancelled() && !failure() }}", SKIPPED), ("!(failure())", SKIPPED), ("failure() && !cancelled()", RUNS), ("always() || github.y", RUNS),
        ("cancelled() || failure()", RUNS), ("always() && false", SKIPPED), ("(always())", RUNS), ("always() &&", UNKNOWN), ("always( && x", UNKNOWN),
        ("always() && contains(github.ref, 'x')", UNKNOWN), ("failure() && steps.x.outcome == 'failure'", UNKNOWN), ("always() || contains(github.x, 'y')", RUNS),
        ("${{ always() }} && github.x", UNKNOWN), ("always() && 0", SKIPPED), ("always() && 1", RUNS), ("always() && 'A' == 'a'", RUNS), ("always() && steps['x'].outcome == 'y'", UNKNOWN),
        ("!always()", SKIPPED), ("always() && !failure()", SKIPPED), ("failure() || cancelled()", RUNS),
        ("always() && steps.x.outcome == 'success' && false", SKIPPED), ("always() && (steps.x.outcome == 'a' || always())", RUNS), ("always() && 'a' != 'b'", RUNS),
        ("always() && 'a' != 'a'", SKIPPED), ("always() )", UNKNOWN), ("always() && 2 > 1", RUNS), ("always() && 1 >= 2", SKIPPED),
        # falsy on the left of && / truthy on the left of ||
        ("cancelled() && always()", SKIPPED), ("false && always()", SKIPPED), ("success() && failure()", SKIPPED), ("cancelled() || always()", RUNS),
        # loose equality across kinds (GitHub coerces both sides to numbers: null 0, true 1, false 0, '' 0, a decimal string its value)
        ("always() && false == ''", RUNS), ("always() && '1' == 1", RUNS), ("always() && null == 0", RUNS), ("always() && 0 != ''", SKIPPED), ("always() && null != ''", SKIPPED),
        ("always() && !(null == '')", SKIPPED), ("always() && true == '1'", RUNS), ("always() && ' 1 ' == 1", RUNS), ("always() && 'abc' == 0", UNKNOWN),
        ("success() != '0'", SKIPPED), ("success() == ''", RUNS), ("always() == '1'", RUNS), ("cancelled() != '0'", SKIPPED), ("always() && null == null", RUNS),
        ("always() && null >= null", RUNS), ("always() && null > null", SKIPPED), ("always() && true > false", RUNS),
        # strings compare without regard to case, upper-cased as .NET OrdinalIgnoreCase does (the characters between Z and a order differently from lower-casing)
        ("always() && '_' < 'a'", SKIPPED), ("always() && '_' > 'a'", RUNS), ("always() && 'é' == 'É'", UNKNOWN),
        # a value that is unknown but whose truthiness is known decides nothing when it is compared
        ("always() && (github.mode || 'full') != 'skip'", UNKNOWN), ("failure() && (github.a || true) == true", UNKNOWN), ("always() && (github.x && '') == ''", UNKNOWN),
        ("always() && (github.x || 'a')", RUNS), ("always() && !(github.x || 'a')", SKIPPED), ("always() && (github.x && false)", SKIPPED),
        # an index is read only when it is a plain string, number or *; anything else could hide a status function
        ("always() && steps[always()].outcome", UNKNOWN), ("steps[always()].outcome", UNKNOWN), ("steps['x' || always()].outcome == 'y'", UNKNOWN), ("always() && steps['x'].outcome == 'y'", UNKNOWN), ("always() && steps.*.outcome", UNKNOWN),
        # the keywords true, false and null are case-sensitive in GitHub; a YAML boolean arrives as its lower-case text
        ("always() && True", UNKNOWN), ("always() && true", RUNS), (False, SKIPPED), ("always() && 'false'", RUNS), ("always() && !'false'", SKIPPED), ("always() && ''", SKIPPED), ("always() && null", SKIPPED),
        ("(" * 400 + "always()" + ")" * 400, UNKNOWN),
    ]
    wrong = [(c, want, st(c)) for c, want in cases if st(c) != want]
    check(f"the `if` evaluator: {len(cases)} expressions; a decided result is GitHub's (a status function is read as written, none means success() && ..., loose equality, strings without regard to case), an undecidable or unmodelled one is UNKNOWN", wrong == [], wrong)
    own = [("!cancelled() && steps.install.outcome != 'skipped'", "install", RUNS), ("!cancelled() && steps.Install.outcome != 'skipped'", "install", RUNS),
           ("!cancelled() && steps.install.outcome == 'success'", "install", SKIPPED), ("!cancelled() && steps.install.outcome != 'skipped'", None, UNKNOWN),
           ("always() && steps.install.conclusion == 'failure'", "install", RUNS), ("always() && steps.other.outcome != 'skipped'", "install", UNKNOWN),
           ("always() && steps['install'].outcome == 'failure'", "install", RUNS), ("always()", 5, RUNS), ("always() && steps.install.outcome == 'failure'", 5, UNKNOWN)]
    wrong2 = [(c, i, want, st(c, i)) for c, i, want in own if st(c, i) != want]
    check("the install's own outcome is known to be `failure` when it has an id (and only then)", wrong2 == [], wrong2)

    # ---- THE REVIEW'S GAPS (2026-11-14): a second job, an install on a continuation line, installs the text did not match, continue-on-error at an exempt site
    PROBE = "jobs:\n  probe:\n    steps:\n"
    NAME = "      - name: Install Chromium\n        run: npx playwright install chromium\n"
    AFTER = "      - name: verdict\n        run: npm run pure\n"
    two_jobs = "jobs:\n  verify:\n    steps:\n" + NAME + "  other:\n    steps:\n{note}" + NAME + AFTER
    bad_a, _ = sites({"verify.yml": two_jobs.format(note="")})
    check("a SECOND job of a target file that installs a browser is an exempt site and is refused without an annotation (the target job's own install is not)",
          len(bad_a) == 1 and "verify.yml:9" in bad_a[0] and "neither a target" in bad_a[0], bad_a)
    bad_b, tab_b = sites({"verify.yml": two_jobs.format(note=NOTE.format(n=1, why="the second job's verdict needs the browser"))})
    check("...and is accepted with one, which pairs with the second job's install and not the first", bad_b == [] and len(tab_b) == 1 and tab_b[0][1] == 10, (bad_b, tab_b))
    bad_c, _ = sites({"c.yml": PROBE + "      - name: Install\n        run: |\n          npx playwright \\\n            install chromium\n" + AFTER})
    check("an install on a continuation line has no line of its own and is refused, not skipped", any_of("cannot pair", bad_c), bad_c)
    bad_d, _ = sites({"d.yml": PROBE + "      - name: Install\n        run: >-\n          npx playwright\n          install chromium\n" + AFTER})
    check("an install in a folded scalar is refused too", any_of("cannot pair", bad_d), bad_d)
    for form in ("npx playwright@1.49.1 install chromium", "npx playwright-core install", "npx -y @playwright/test install", "npx -y playwright@latest install chromium",
                 "npx @playwright/test@1.49.1 install chromium"):
        bad_e, _ = sites({"e.yml": PROBE + f"      - name: Install\n        run: {form}\n" + AFTER})
        check(f"`{form}` is seen as an install and refused without an annotation", any_of("neither a target", bad_e), bad_e)
    bad_f, _ = sites({"f.yaml": PROBE + NAME + AFTER})
    check("a workflow named .yaml is read too", any_of("neither a target", bad_f), bad_f)
    bad_g, _ = sites({}, actions={"a/b": "runs:\n  using: composite\n  steps:\n    - name: Install Chromium\n      shell: bash\n      run: npx playwright install chromium\n"})
    check("a composite action nested below .github/actions/<name>/ is read", any_of("neither a target", bad_g), bad_g)
    with tempfile.TemporaryDirectory() as d:
        (Path(d) / ".github" / "x").mkdir(parents=True)
        (Path(d) / ".github" / "x" / "action.yaml").write_text("runs:\n  using: composite\n  steps:\n    - run: npx playwright install chromium\n      shell: bash\n")
        bad_h, _ = exempt_sites(d, pkg, read)
    check("an action.yaml anywhere under .github is read", any_of("neither a target", bad_h), bad_h)
    bad_i, _ = sites({"i.yml": "      # browser-gate: exempt 0 -- the install lets the job go on\n" + PROBE + "      - name: Install Chromium\n        continue-on-error: true\n        run: npx playwright install chromium\n" + AFTER})
    bad_i2, _ = sites({"i.yml": PROBE.replace("    steps:", "    continue-on-error: true\n    steps:") + NOTE.format(n=1, why="the job is red") + NAME + AFTER})
    bad_i3, _ = sites({"i.yml": PROBE + NOTE.format(n=1, why="x") + "      - name: Install Chromium\n        continue-on-error: ${{ false }}\n        run: npx playwright install chromium\n" + AFTER})
    check("an exempt site whose install has continue-on-error (the verify shape, half applied) is refused and told to become a target",
          any_of("continue-on-error", bad_i) and any_of("continue-on-error", bad_i2) and any_of("continue-on-error", bad_i3), (bad_i, bad_i2, bad_i3))
    bad_j, _ = sites({"j.yml": "jobs: [\n  npx playwright install chromium\n"})
    bad_j2, _ = sites({"j2.yml": "jobs: [\n"})
    check("a file that is not valid YAML and runs the install is refused with a message; one that does not run it is left alone", any_of("not valid YAML", bad_j) and bad_j2 == [], (bad_j, bad_j2))

    # ---- THE ANNOTATION: what counts as one, how far it reaches, which N it may carry
    def at_distance(k, indent="      "):
        return PROBE + indent + "# browser-gate: exempt 1 -- the verdict needs the browser\n" + "      # filler\n" * k + NAME + AFTER
    bad_k, _ = sites({"k.yml": at_distance(38)})
    bad_k2, _ = sites({"k.yml": at_distance(39)})
    check("an annotation exactly EXEMPT_REACH (40) lines above the install command is accepted, 41 is out of reach", bad_k == [] and any_of("0 found", bad_k2), (bad_k, bad_k2))
    bad_l, _ = sites({"l.yml": at_distance(0, indent="    ")})
    check("an annotation at another indentation than the step's is not an annotation (and is stale)", any_of("0 found", bad_l) and any_of("is stale", bad_l), bad_l)
    bad_m, _ = sites({"m.yml": PROBE + "      - name: before\n        run: |\n          # browser-gate: exempt 1 -- written inside a script\n          echo hi\n" + NAME + AFTER})
    check("a line inside a previous step's run script is not an annotation", any_of("0 found", bad_m) and any_of("is stale", bad_m), bad_m)
    for label, line in (("a reason of only spaces", "# browser-gate: exempt 1 --   "), ("a reason that is a bare --", "# browser-gate: exempt 1 -- --"),
                        ("an N with a leading zero", "# browser-gate: exempt 01 -- why"), ("an N written in Arabic-indic digits", "# browser-gate: exempt ١ -- why"),
                        ("a negative N", "# browser-gate: exempt -1 -- why")):
        bad_n, _ = sites({"n.yml": PROBE + "      " + line + "\n" + NAME + AFTER})
        check(f"{label} is not an annotation", any_of("0 found", bad_n), bad_n)
    many = "".join(f"      - name: s{i}\n        run: npm run pure\n" for i in range(10))
    bad_o, tab_o = sites({"o.yml": PROBE + NOTE.format(n=10, why="ten plain steps") + NAME + many})
    check("an N of 10 or more is read whole (one digit is not enough)", bad_o == [] and tab_o and tab_o[0][2] == 10, (bad_o, tab_o))
    bad_p, _ = sites({"p.yml": site(0)})
    check("an annotation LOWER than the true N is refused too (a step was added after the annotation was written)", any_of("the annotation says 0", bad_p) and any_of("1 step(s)", bad_p), bad_p)
    bad_r, tab_r = sites({"r.yml": PROBE + NOTE.format(n=1, why="the verdict needs the browser") + "      - run: npx playwright install chromium\n" + AFTER})
    check("an install written as `- run: ...` (the dash line is the command line) is paired with its annotation", bad_r == [] and len(tab_r) == 1, (bad_r, tab_r))
    bad_s, tab_s = sites({"s.yml": PROBE + NOTE.format(n=0, why="the evidence step runs after a failed install") + "      - name: Install Chromium\n        id: install\n        run: npx playwright install chromium\n"
                          + "      - name: evidence\n        if: \"!cancelled() && steps.install.outcome != 'skipped'\"\n        run: npm run pure\n"})
    check("exempt_count knows the install's own id: a step that tests it is certain to run, so N is 0", bad_s == [] and tab_s and tab_s[0][2] == 0, (bad_s, tab_s))
    # ---- WHAT ELSE A FAILED INSTALL SKIPS: the jobs that need its job, and the steps after a composite action in its callers
    dep_text = lambda n, tail: PROBE + NOTE.format(n=n, why="the verdict needs the browser") + NAME + AFTER + tail
    bad_t, tab_t = sites({"t.yml": dep_text(2, "  b:\n    needs: a\n    steps:\n      - run: npm run pure\n").replace("  probe:", "  a:")})
    bad_t2, _ = sites({"t.yml": dep_text(1, "  b:\n    needs: a\n    steps:\n      - run: npm run pure\n").replace("  probe:", "  a:")})
    bad_t3, tab_t3 = sites({"t.yml": dep_text(1, "  b:\n    needs: a\n    if: always()\n    steps:\n      - run: npm run pure\n").replace("  probe:", "  a:")})
    bad_t4, tab_t4 = sites({"t.yml": dep_text(3, "  b:\n    needs: [a]\n    steps:\n      - run: npm run pure\n  c:\n    needs: b\n    steps:\n      - run: npm run pure\n").replace("  probe:", "  a:")})
    check("a job that needs the install's job and is not certain to run after its failure is counted in N (through a skipped job too); one with `if: always()` is not",
          bad_t == [] and tab_t and tab_t[0][2] == 2 and any_of("the annotation says 1", bad_t2) and bad_t3 == [] and tab_t3[0][2] == 1 and bad_t4 == [] and tab_t4[0][2] == 3,
          (bad_t, bad_t2, bad_t3, bad_t4))
    comp = "runs:\n  using: composite\n  steps:\n" + NOTE.format(n=0, why="the shard needs the browser").replace("      #", "    #") + "    - name: Install Chromium\n      shell: bash\n      run: npx playwright install chromium\n"
    bad_u, tab_u = sites({"w.yml": "jobs:\n  j:\n    steps:\n      - uses: ./.github/actions/shard\n      - run: npm run pure\n"}, actions={"shard": comp})
    check("the steps that follow a composite action in a job that calls it are counted in the action's N", any_of("the annotation says 0", bad_u) and any_of("1 step(s)", bad_u), (bad_u, tab_u))
    bad_u2, tab_u2 = sites({"w.yml": "jobs:\n  j:\n    steps:\n      - uses: ./.github/actions/shard\n      - if: always()\n        run: npm run pure\n"}, actions={"shard": comp})
    check("...and one that is certain to run is not", bad_u2 == [] and tab_u2 and tab_u2[0][2] == 0, (bad_u2, tab_u2))
    bad_u3, tab_u3 = sites({"w.yml": "jobs:\n  j:\n    steps:\n      - uses: ./.github/actions/shard\n  k:\n    needs: j\n    steps:\n      - run: npm run pure\n"}, actions={"shard": comp})
    check("...and so is a job that needs the calling job", any_of("the annotation says 0", bad_u3), (bad_u3, tab_u3))
    with tempfile.TemporaryDirectory() as d:
        (Path(d) / ".github" / "workflows").mkdir(parents=True)
        (Path(d) / "tools" / "x").mkdir(parents=True)
        (Path(d) / ".github" / "workflows" / "w.yml").write_text("jobs:\n  j:\n    steps:\n      - uses: ./tools/x\n")
        (Path(d) / "tools" / "x" / "action.yaml").write_text("runs:\n  using: composite\n  steps:\n    - run: npx playwright install chromium\n      shell: bash\n")
        bad_v, _ = exempt_sites(d, pkg, read)
    check("a local composite action OUTSIDE .github, named by a `uses: ./path`, is found", any_of("neither a target", bad_v), bad_v)
    for form in ('npx "playwright@^1.49" install chromium', "npx playwright@~1.49.1 install", "node node_modules/playwright-core/cli.js install chromium",
                 "npx 'playwright-core@1.49.1' install"):
        bad_w, _ = sites({"w.yml": PROBE + f"      - name: Install\n        run: {form}\n" + AFTER})
        check(f"`{form}` is seen as an install", any_of("neither a target", bad_w), bad_w)
    with tempfile.TemporaryDirectory() as d:
        (Path(d) / ".github" / "workflows").mkdir(parents=True)
        (Path(d) / ".github" / "workflows" / "verify.yml").write_text("jobs: [\n")
        (Path(d) / "package.json").write_text('{"scripts": {}}')
        r = subprocess.run([sys.executable, __file__], cwd=d, capture_output=True, text=True, timeout=60)
    check("a target that is not valid YAML is refused with a message and no traceback", r.returncode == 1 and "not valid YAML" in r.stdout and "Traceback" not in r.stdout + r.stderr, (r.returncode, r.stdout[-300:], r.stderr[-300:]))
    with tempfile.TemporaryDirectory() as d:
        (Path(d) / ".github" / "workflows").mkdir(parents=True)
        (Path(d) / ".github" / "workflows" / "w.yml").write_text("jobs:\n  j:\n    steps:\n      - uses: ./../outside\n")
        try:
            bad_y, _ = exempt_sites(d, pkg, read)
        except Exception as e:
            bad_y = [f"CRASH {type(e).__name__}"]
    check("a `uses: ./../x` that leaves the repository is not followed and does not crash", bad_y == [], bad_y)
    bad_x, _ = sites({"x.yml": PROBE + "      # browser-gate: exempt 12345 -- why\n" + NAME + AFTER})
    check("an N of five digits is not an annotation (and cannot crash the guard)", any_of("0 found", bad_x), bad_x)
    bad_c2, _ = sites({"c.yml": PROBE + "      - name: Install\n        run: |\n          npx playwright \\\n            install chromium\n" + AFTER})
    check("the refusal of an install it cannot pair names the lines and the steps", any_of("line(s) none the text can match", bad_c2) and any_of("['Install']", bad_c2), bad_c2)
    # ---- THE COMMANDS WHOSE BROWSER-FREE-NESS IS A CLAIM, for scripts/no-launch-check.mjs
    with tempfile.TemporaryDirectory() as d:
        root = Path(d)
        (root / ".github" / "workflows").mkdir(parents=True)
        (root / "package.json").write_text(json.dumps({"scripts": pkg}))
        for f, src in files.items():
            if "/" in f and not f.startswith(("..", "/")):      # `../outside.mjs` and `/abs/x.mjs` are fixtures for a name that leaves the repository: they are never written
                (root / f).parent.mkdir(parents=True, exist_ok=True)
                (root / f).write_text(src)
        (root / ".github" / "workflows" / "verify.yml").write_text(yaml.safe_dump(wf([
            {"name": "before", "run": "node scripts/pure.mjs --self-test"}, inst,
            {"name": "st", "run": "node scripts/pure.mjs --self-test"}, {"name": "st2", "run": "node scripts/pure.mjs --self-test"},
            {"name": "ro", "run": "node scripts/mutation-check.mjs --anchors"}, {"name": "br", "run": "node scripts/shot.mjs"},
            {"name": "brself", "run": "node scripts/shot.mjs --self-test"}, {"name": "plain", "run": "node scripts/pure.mjs"},
            {"name": "mixed", "run": "node scripts/l-launch.mjs --self-test\nnode scripts/l-launch.mjs"}, {"name": "py", "run": "python3 scripts/prose.py --self-test"}, final])))
        (root / ".github" / "workflows" / "live-check.yml").write_text(yaml.safe_dump({"jobs": {"live": {"steps": [inst, {"name": "lst", "run": "node scripts/imports-spawner.mjs --self-test"}, final]}}}))
        (root / ".github" / "workflows" / "probe.yml").write_text(PROBE + NOTE.format(n=1, why="x") + "      - name: Install Chromium\n        run: |\n          node scripts/mentions.mjs --self-test\n          npx playwright install chromium\n"
                                                                + "      - name: s\n        run: node scripts/uses-lib.mjs --self-test\n")
        cmds = plain_commands(str(root))
    got = [(c["cmd"][1:], c["why"]) for c in cmds]
    check("plain_commands lists each self-test and read-only mode of a browser-free step after an install, once, from every target job and from an exempt site, and nothing else: not a step that "
          "also launches a browser, not a python script, not a step that is the install itself",
          got == [(["scripts/imports-spawner.mjs", "--self-test"], "self-test"), (["scripts/mutation-check.mjs", "--anchors"], "read-only mode"), (["scripts/pure.mjs", "--self-test"], "self-test"),
                  (["scripts/shot.mjs", "--self-test"], "self-test"), (["scripts/uses-lib.mjs", "--self-test"], "self-test")], got)
    bad_q, tab_q = sites({"q.yml": site(2, steps_after="      - name: one\n        run: npm run pure\n      - name: two\n        run: npm run pure\n")})
    check("two skipped steps are BOTH counted", bad_q == [] and tab_q and tab_q[0][2] == 2, (bad_q, tab_q))
    check("the second target's floors are 8 steps, 5 browser steps and 2 browser-free steps (pinned, not read from TARGETS)",
          len(coverage_problems({"steps": 7, "browser": 4, "plain": 1}, (8, 5, 2))) == 3 and coverage_problems({"steps": 8, "browser": 5, "plain": 2}, (8, 5, 2)) == [] and
          TARGETS[1]["floors"] == (8, 5, 2) and TARGETS[1]["job"] == "live" and TARGETS[1]["file"] == ".github/workflows/live-check.yml" and TARGETS[0]["floors"] == (60, 10, 30))
    nec_files = {**files, "scripts/network-exempt-check.mjs": "import { spawnSync } from 'node:child_process'\nspawnSync('node', ['scripts/run-row.mjs', 'x'])\n",
                 "scripts/other-row-spawner.mjs": "import { spawnSync } from 'node:child_process'\nspawnSync('node', ['scripts/run-row.mjs', 'x'])\n"}
    check("`network-exempt-check.mjs` names scripts/run-row.mjs but runs only browser-free rows (declared read-only): it is not a browser step; another script that names run-row.mjs is",
          needs_browser({"run": "node scripts/network-exempt-check.mjs"}, pkg, lambda q: nec_files[q]) is False and needs_browser({"run": "node scripts/other-row-spawner.mjs"}, pkg, lambda q: nec_files[q]) is True)
    check("the shard action's floors are 5 steps, 1 browser step and 3 browser-free steps and verify-full's `full` job's are 7, 2 and 4 (pinned, not read from TARGETS); each must run its no-browser spawner",
          TARGETS[2]["floors"] == (5, 1, 3) and TARGETS[2]["job"] is None and TARGETS[2]["flagged"] == ("scripts/mutation-check.mjs",) and
          TARGETS[3]["floors"] == (7, 2, 4) and TARGETS[3]["job"] == "full" and TARGETS[3]["flagged"] == ("scripts/confidence.mjs",))
    # ---- THE READER KNOWS WHAT live-check.yml RUNS
    check("`git config`, `add`, `commit`, `push`, `pull`, `rev-parse` are read", unresolved('git config user.name x; git add f; git commit -m m; git pull --rebase origin main; git push origin HEAD:main') == [] and unresolved("x=$(git rev-parse HEAD)") == [])
    check("a git global flag or a subcommand that runs something is unresolved (`-c`, `-C`, `bisect run`, `difftool`)",
          unresolved("git -c core.hooksPath=x commit -m m") != [] and unresolved("git -C sub status") != [] and unresolved("git bisect run node scripts/shot.mjs") != [] and unresolved("git difftool") != [])
    check("`dotnet tool restore`, `dotnet fable ...` and `dotnet build` are read; `dotnet run`, `test` and `tool run` are not",
          unresolved("dotnet tool restore") == [] and unresolved("dotnet fable src/L.fsproj --outDir build") == [] and unresolved("dotnet build") == [] and
          unresolved("dotnet run") != [] and unresolved("dotnet test") != [] and unresolved("dotnet tool run x") != [])
    check("`tr` is a safe head and a pipe into it is read (`DEPLOYED=$(curl -sSf url | tr -d '[:space:]')`)", unresolved("DEPLOYED=$(curl -sSf --max-time 30 \"$SITE/v.txt\" | tr -d '[:space:]')") == [] and browser("echo x | tr a b | node scripts/shot.mjs") is True)

    # ---- THE 2026-11-15 REVIEW (outbox/cc-session-2026-11-15-gate-items-2-7.md): each of these failed on the guard as it was
    for f, how in [("spawn-url.mjs", "`new URL('./x.mjs', import.meta.url)`"), ("spawn-dot.mjs", "`./scripts/x.mjs`"), ("spawn-up.mjs", "`../scripts/x.mjs`"), ("spawn-var.mjs", "`${ROOT}/scripts/x.mjs`")]:
        check(f"a script that spawns a browser script by {how} is a browser step (a name a `/` precedes was invisible)", needs_browser({"run": f"node scripts/{f}"}, pkg, read) is True, f)
    check("a script that only IMPORTS a spawner (`from './spawner.mjs'`) and spawns a plain script is not a browser step", needs_browser({"run": "node scripts/imports-spawner.mjs"}, pkg, read) is False)
    check("a spawned script is found as written from the repository root (`scripts/sub/x.mjs`), relative to the spawner's own directory (`./x.mjs` from scripts/sub/) and by file name under scripts/ (a bare name from scripts/sub/)",
          needs_browser({"run": "node scripts/spawn-sub.mjs"}, pkg, read) is True and needs_browser({"run": "node scripts/sub/spawn-rel.mjs"}, pkg, read) is True and
          needs_browser({"run": "node scripts/sub/spawn-bare2.mjs"}, pkg, read) is True)
    check("a name that leaves the repository (`../../outside.mjs`) is no spawn, whatever a reader would find there", needs_browser({"run": "node scripts/spawn-out.mjs"}, pkg, read) is False)
    read_rows = lambda q: ("import { rows } from './gate-checks.mjs'\nfor (const r of rows) r.run()\n" if q in ("scripts/confidence.mjs", "scripts/run-row.mjs") else files[q])
    check("a script that RUNS THE GATE'S ROWS (confidence.mjs, run-row.mjs) is a browser step whatever its text names; `--browserless` makes confidence.mjs browser-free only in a target's audit",
          needs_browser({"run": "node scripts/confidence.mjs"}, pkg, read_rows) is True and needs_browser({"run": "node scripts/run-row.mjs x"}, pkg, read_rows) is True and
          read_step({"run": "node scripts/confidence.mjs --browserless"}, pkg, read_rows)["browser"] is True and
          read_step({"run": "node scripts/confidence.mjs --browserless"}, pkg, read_rows, no_browser_ok=True)["browser"] is False)
    # The declaration alone: a runner of the rows whose text names neither gate-checks.mjs nor a row's `run` (a text rule cannot see it) is a browser step by RUNS_ROWS, and by nothing else.
    # LITERAL lists below, each checked equal to the constant: a loop over the constant itself loses a fixture with every member a mutation deletes (found by the third review's evidence pass:
    # 15 of the 20 wrapper heads, 8 of 9 not-work flags and the RUNS_ROWS entries could be deleted with the self-test green).
    PINNED_RUNNERS = ("scripts/confidence.mjs", "scripts/run-row.mjs")
    read_decl = lambda q: "console.log(1)\n" if q in PINNED_RUNNERS else files[q]            # the LITERAL list: RUNS_ROWS here would lose the fixture with the entry a change deletes
    check("every runner of the rows that RUNS_ROWS declares is pinned by a fixture of its own (the list below is literal)", set(PINNED_RUNNERS) == set(RUNS_ROWS), sorted(RUNS_ROWS))
    for runner in PINNED_RUNNERS:
        check(f"{runner} is a browser step by DECLARATION even when its text shows no row being run (the content rule cannot see it)", needs_browser({"run": f"node {runner} x"}, pkg, read_decl) is True, runner)
    check("...and a script that is not declared and shows no row being run is not", needs_browser({"run": "node scripts/pure.mjs"}, pkg, read_decl) is False)
    op_step = {"name": "ledger", "if": "always()", "run": "echo \"$(date)\""}
    op_browser = {"name": "ledger", "if": "always()", "run": "node scripts/shot.mjs\necho \"$(date)\""}
    w_op = wf([{"name": "build", "run": "npm run pure"}, inst, op_step, {"name": "pure", "run": "npm run pure"}, final])
    w_ob = wf([{"name": "build", "run": "npm run pure"}, inst, op_browser, {"name": "pure", "run": "npm run pure"}, final])
    check("an unreadable step with `if: always()` is OPAQUE and counted, not refused, when nothing in it is seen to launch a browser", bad_of(w_op) == [] and audit(w_op, pkg, read)[1]["opaque"] == 1, (bad_of(w_op), audit(w_op, pkg, read)[1]))
    check("...but one the reader has SEEN launch a browser is not: it is refused as unreadable and as an ungated browser step (it fails in an outage and skips the steps behind it)",
          any_of("cannot be read", bad_of(w_ob)) and any_of("needs a browser", bad_of(w_ob)) and audit(w_ob, pkg, read)[1]["opaque"] == 0, bad_of(w_ob))
    w_last = wf([{"name": "build", "run": "npm run pure"}, inst, {"name": "z", "if": "always()", "run": "echo \"$(date)\""}])
    check("the LAST step is never kept as opaque: an unreadable last step is refused as unreadable", any_of("cannot be read", bad_of(w_last)), bad_of(w_last))
    w_use = wf([{"name": "build", "run": "npm run pure"}, inst, {"name": "local", "if": "always()", "uses": "./.github/actions/x"}, {"name": "pure", "run": "npm run pure"}, final])
    check("an action the guard cannot read with `if: always()` is refused, not kept: a local composite action may hold a browser step, and with none it fails and skips the steps behind it",
          any_of("cannot be read", bad_of(w_use)) and audit(w_use, pkg, read)[1]["opaque"] == 0, bad_of(w_use))
    final2 = {"name": "Chromium did not install", "if": "always() && steps.chromium.outcome != 'success'", "env": {"INSTALL_OUTCOME": "${{ steps.chromium.outcome }}", "GATE_OUTCOME": "${{ steps.browserless-gate.outcome }}"},
              "run": "if [ \"$INSTALL_OUTCOME\" = skipped ]; then\n  echo \"::error::skipped\"\nelif [ \"$GATE_OUTCOME\" = success ]; then\n  echo \"::error::the gate ran\"\nelse\n  echo \"::error::the gate did not finish\"\nfi\nexit 1"}
    w_f2 = lambda f: wf([{"name": "build", "run": "npm run pure"}, inst, {"name": "gate", "id": "browserless-gate", "if": "steps.chromium.outcome != 'success'", "run": "node scripts/mutation-check.mjs --no-browser"}, f])
    final3 = {**final2, "run": "if [ \"$GATE_OUTCOME\" = success ]; then\n  echo \"::error::the gate ran\"\n  exit 1\nfi"}
    final5 = {**final2, "run": "if [ \"$GATE_OUTCOME\" = \"\" ]; then\n  echo \"no outcome\"\nelse\n  echo \"::error::x\"\n  exit 1\nfi"}
    final4 = {**final2, "env": {**final2["env"], "GATE_OUTCOME": "${{ steps.nothing.outcome }}"}}
    check("a final step may read another step's outcome (`GATE_OUTCOME: ${{ steps.gate.outcome }}`): it is run for each outcome of the install and of that step, and passes when it fails for all 20",
          bad_of(w_f2(final2)) == [], bad_of(w_f2(final2)))
    check("...one that fails for some outcome of the other step only (no `else`, so a skipped gate exits 0) is refused, naming the outcome pair",
          any_of("GATE_OUTCOME='skipped'", bad_of(w_f2(final3))) and any_of("exit 0", bad_of(w_f2(final3))), bad_of(w_f2(final3)))
    check("...each outcome of the other step is the value the script gets: one that exits 0 only for an EMPTY outcome is refused for that one alone",
          any_of("GATE_OUTCOME=''", bad_of(w_f2(final5))) and not any_of("GATE_OUTCOME='success'", bad_of(w_f2(final5))) and not any_of("GATE_OUTCOME='failure'", bad_of(w_f2(final5))), bad_of(w_f2(final5)))
    check("...and one that reads the outcome of a step that does not exist is refused like an `if` that does (it would evaluate to null)", any_of("no earlier step has id `nothing`", bad_of(w_f2(final4))), bad_of(w_f2(final4)))
    nb_if = "always() && steps.chromium.outcome != 'success'"
    w_nb = lambda step: wf([{"name": "build", "run": "npm run pure"}, inst, step, {"name": "pure", "run": "npm run pure"}, final])
    nb_ok = {"name": "no browser", "if": nb_if, "run": "node scripts/mutation-check.mjs --no-browser"}
    nb_extra = {"name": "no browser", "if": nb_if, "run": "node scripts/pure.mjs\nnode scripts/mutation-check.mjs --no-browser"}
    check("a step with the no-browser flag may run only what carries it: another command in it is skipped on every good commit, and is refused", bad_of(w_nb(nb_ok)) == [] and any_of("also runs scripts/pure.mjs", bad_of(w_nb(nb_extra))),
          (bad_of(w_nb(nb_ok)), bad_of(w_nb(nb_extra))))
    req = ("scripts/mutation-check.mjs",)
    run_req = lambda w: audit(w, pkg, read, final_timeout=5, flagged=req)[0]
    check("a target that must run a spawner with its no-browser flag is refused when no step does, when the step has no `if`, and when a step with the right `if` runs something else; it passes with the step",
          run_req(w_nb({"name": "no browser", "if": nb_if, "run": 'if [ -n "$IDS" ]; then\n  node scripts/mutation-check.mjs --ids "$IDS" --no-browser --out x.json\nelse\n  node scripts/mutation-check.mjs --shard 1/8 --no-browser --out x.json\nfi'})) == [] and any_of("must run `scripts/mutation-check.mjs --no-browser`", run_req(good)) and
          any_of("must run `scripts/mutation-check.mjs --no-browser`", run_req(w_nb({"name": "nb", "run": "node scripts/mutation-check.mjs --no-browser"}))) and
          any_of("must run `scripts/mutation-check.mjs --no-browser`", run_req(w_nb({"name": "nb", "if": nb_if, "run": "node scripts/pure.mjs"}))), (run_req(w_nb(nb_ok)), run_req(good)))
    callee, use = "a/action.yml", {"uses": "./a"}

    def cp(steps, job_extra=None, more=None):
        jobs = {"j": {"steps": steps, **(job_extra or {})}, **(more or {})}
        return caller_problems(callee, {"w.yml": {"jobs": jobs}})
    check("the callers of a composite action that is a target are audited: a step after it with no status function, `continue-on-error` on its `uses:` step or on its job, and a job that needs its job without `if: always()` are refused; `always()` (with another clause too) is accepted",
          cp([use, {"run": "x"}]) != [] and cp([{**use, "continue-on-error": True}]) != [] and cp([use], {"continue-on-error": True}) != [] and cp([use, {"if": "success()", "run": "x"}]) != [] and
          cp([use, {"if": "always()", "run": "x"}]) == [] and cp([use, {"if": "always() && steps.ids.outputs.ids != ''", "run": "x"}]) == [] and cp([use]) == [] and
          cp([use], more={"k": {"needs": "j", "steps": [{"run": "x"}]}}) != [] and cp([use], more={"k": {"needs": "j", "if": "always()", "steps": [{"run": "x"}]}}) == [], (cp([use, {"run": "x"}]), cp([use])))

    def grow(i, browser, cmd):
        return f"  {{ name: 'p{i}', weight: 10,{' browser: true,' if browser else ''}\n    run: () => ok('{cmd}') }},\n"
    base_rows = "".join(grow(i, i < 6, "node scripts/shot.mjs" if i < 6 else "node scripts/pure.mjs") for i in range(20))

    def row_problems(extra=""):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "scripts").mkdir()
            (Path(d) / "scripts" / "gate-checks.mjs").write_text("// rows\nconst rows = [\n" + base_rows + extra + "]\n\nexport { rows }\n")
            return gate_row_problems(d, pkg, read)
    check("gate rows: the fixture rows (6 flagged rows that drive a browser, 14 that do not) read clean", row_problems() == [], row_problems())
    for label, extra, frag in [
        ("a browser row written with a template literal", "  { name: 'x', weight: 10, skipQuick: true,\n    run: () => ok(`node scripts/shot.mjs`) },\n", "template literal"),
        ("a browser row whose command is a constant", "  { name: 'x', weight: 10,\n    run: () => ok(SHOT) },\n", "not a plain string literal"),
        ("a browser row that passes `ok` by reference", "  { name: 'x', weight: 10,\n    run: () => ['node scripts/shot.mjs'].every(ok) },\n", "other than as a call"),
        ("a browser row run through execSync with a concatenation", "  { name: 'x', weight: 10,\n    run: () => execSync('node scripts/' + 'shot.mjs') },\n", "not a plain string literal"),
        ("a browser row that says `browser: true` only in a comment", "  { name: 'x', weight: 10,\n    // browser: true\n    run: () => ok('node scripts/shot.mjs') },\n", "gate row 'x' drives a browser"),
        ("a browser row flagged `browser: false`", "  { name: 'x', weight: 10, browser: false,\n    run: () => ok('node scripts/shot.mjs') },\n", "is not flagged"),
        ("a browser row indented four spaces (it is still read, and named)", "    { name: 'x', weight: 10,\n      run: () => ok('node scripts/shot.mjs') },\n", "gate row 'x' drives a browser"),
        ("a row with `weight` first (it is not read, and the count of weight keys says so)", "  { weight: 10, name: 'x',\n    run: () => ok('node scripts/shot.mjs') },\n", "`weight:` keys"),
        ("a row flagged `browser` that runs none", "  { name: 'x', weight: 10, browser: true,\n    run: () => ok('node scripts/pure.mjs') },\n", "would leave it out"),
        ("an unrecognised `browser:` value", "  { name: 'x', weight: 10, browser: maybe,\n    run: () => ok('node scripts/pure.mjs') },\n", "is not `true`, `false` or a function"),
    ]:
        got = row_problems(extra)
        check(f"gate rows: {label} is a problem", any_of(frag, got), got)
    url_row = "  { name: 'x', weight: 10, browser: true,\n    run: () => ok(\"URL='http://localhost:8080/?d=1' node scripts/shot.mjs\") },\n"
    fn_row = "  { name: 'x', weight: 10, browser: () => process.env.A === undefined,\n    run: () => all('node scripts/pure.mjs', 'node scripts/shot.mjs') },\n"
    words_row = "  { name: 'x', weight: 10,\n    run: () => ok('node scripts/pure.mjs --all --ok --fails') },\n"
    name_row = "  { name: 'x browser: true', weight: 10,\n    run: () => ok('node scripts/shot.mjs') },\n"
    check("gate rows: the words ok, fails and all inside a command string are not calls, and a row whose NAME says `browser: true` is not flagged by it",
          row_problems(words_row) == [] and any_of("is not flagged", row_problems(name_row)), (row_problems(words_row), row_problems(name_row)))
    check("gate rows: a `//` inside a command string is not a comment, a `browser: () =>` flag is a flag, and `all('...', '...')` reads both commands", row_problems(url_row) == [] and row_problems(fn_row) == [], (row_problems(url_row), row_problems(fn_row)))

    # ---- ROUND 2 OF THE REVIEW (the fixes of 2026-11-15, re-read by a second independent review): each of these failed on the guard as it stood
    wrap_if = lambda cmd: audit(wf([{"name": "build", "run": "npm run pure"}, inst, {"name": "w", "if": "always()", "run": cmd}, {"name": "pure", "run": "npm run pure"}, final]), pkg, read, final_timeout=5)
    for cmd in ("timeout 60 node scripts/shot.mjs", "xvfb-run -a node scripts/shot.mjs", "bash -c 'node scripts/shot.mjs'", "env CI=1 node scripts/shot.mjs", "exec node scripts/shot.mjs"):
        res = wrap_if(cmd)
        check(f"an unreadable always() step whose unreadable part is a WRAPPER (`{cmd}`) may hide a launch: it is refused as unreadable, not kept as opaque", any_of("cannot be read", res[0]) and res[1]["opaque"] == 0, res)
    res = wrap_if("mktemp -d")
    check("...while one whose unreadable part is an ordinary command (`mktemp -d`) is the ledger kind, and stays opaque", res[0] == [] and res[1]["opaque"] == 1, res)
    hy = wf([{"name": "b", "id": "build-site", "run": "npm run pure"}, inst, {"name": "x", "if": "steps.chromium.outcome == 'success' && steps.build-site.outcome == 'success'", "run": "npm run shot"}, final])
    hy2 = wf([{"name": "b", "id": "build-site", "run": "npm run pure"}, inst, {"name": "x", "if": "steps.chromium.outcome == 'success' && steps['no-such'].outcome == 'success'", "run": "npm run shot"}, final])
    check("a browser step gated on the install AND on another step with a HYPHENATED id is accepted (as the refusal text promises)", bad_of(hy) == [], bad_of(hy))
    check("...and an `if` that reads a hyphenated id no earlier step has is refused like any other (it would evaluate to null)", any_of("no earlier step has id `no-such`", bad_of(hy2)), bad_of(hy2))
    try:
        env_res = [bad_of(wf([{"name": "build", "run": "npm run pure"}, inst, {"name": "e", "env": e, "run": "npm run pure"}, final])) for e in ("${{ fromJSON(needs.x.outputs.env) }}", ["A=1"])]
        env_ok = all(isinstance(r, list) for r in env_res)
    except Exception as e:                                  # a crash is a failed check, not a traceback
        env_ok, env_res = False, f"CRASH {type(e).__name__}: {e}"
    check("a step whose `env` is a string (an expression) or a list does not crash the guard", env_ok, env_res)
    for f, how, want in [("new-runner.mjs", "imports scripts/gate-checks.mjs and calls a row's `run`", True), ("wrap-row.mjs", "names scripts/run-row.mjs", True), ("imports-rows.mjs", "only imports gate-checks.mjs", False)]:
        check(f"a script that {how} is {'' if want else 'not '}a browser step (a row runner is read by its text, not only by its name)", needs_browser({"run": f"node scripts/{f}"}, pkg, read) is want, f)
    check("a spawner's name `${ROOT}/scripts/sub/x.mjs` is read through the variable (the file name alone, found under scripts/, would not find it)", needs_browser({"run": "node scripts/spawn-var2.mjs"}, pkg, read) is True)
    check("a name that is an ABSOLUTE path is nothing in this repository, whatever a reader would find there", needs_browser({"run": "node scripts/spawn-abs.mjs"}, pkg, read) is False)
    t0 = time.time()
    SCRIPT_NAME.findall("a" * 20000 + " " + "a." * 10000)
    check("the search for a script name is linear: 20,000 characters of name and 10,000 of `a.` take well under a second (the unbounded pattern took 1.4 s and 17.8 s)", time.time() - t0 < 1.0, f"{time.time() - t0:.2f} s")
    many = {**final2, "env": {"INSTALL_OUTCOME": "${{ steps.chromium.outcome }}", **{f"O{n}": f"${{{{ steps.s{n}.outcome }}}}" for n in range(4)}}, "run": 'echo "::error::x $INSTALL_OUTCOME"\nexit 1'}
    res = audit(wf([{"name": "build", "run": "npm run pure"}] + [{"name": f"s{n}", "id": f"s{n}", "run": "npm run pure"} for n in range(4)] + [inst, many]), pkg, read, final_timeout=5)[0]
    check("a final step that reads the outcome of more than three other steps is refused (it is run for every combination, 4 x 5^k times)", any_of("besides the install", res), res)

    # the required no-browser step, in the closed form (review round 2, finding 1)
    nbv = lambda text: {"name": "nb", "if": nb_if, "run": text}
    ids_line, shard_line = 'node scripts/mutation-check.mjs --ids "$IDS" --no-browser --out x.json', 'node scripts/mutation-check.mjs --shard 1/8 --no-browser --out x.json'
    full_form = f'if [ -n "$IDS" ]; then\n  {ids_line}\nelse\n  {shard_line}\nfi'
    check("the required no-browser step is the real work, in the closed form: the if/else with --ids and --shard and --out passes", run_req(w_nb(nbv(full_form))) == [], run_req(w_nb(nbv(full_form))))
    for label, text in [("a bare `--no-browser`", "node scripts/mutation-check.mjs --no-browser"), ("`--list-ids --no-browser` (reads, runs nothing)", "node scripts/mutation-check.mjs --list-ids --no-browser"),
                        ("`--anchors --no-browser`", "node scripts/mutation-check.mjs --anchors --no-browser"), ("`--self-test --no-browser`", f"{ids_line} --self-test"),
                        ("`--only x --no-browser`", f"{shard_line} --only x"), ("the work followed by `|| true`", f"{ids_line} || true\n{shard_line} || true"),
                        ("the work behind `false &&`", f"false && {ids_line}\n{shard_line}"), ("the work in a pipe", f"{ids_line} | cat\n{shard_line}"),
                        ("only the --ids branch (no --shard)", f'if [ -n "$IDS" ]; then\n  {ids_line}\nfi'), ("only the --shard branch (no --ids)", shard_line),
                        ("the work without --out", full_form.replace(" --out x.json", "")), ("the work and another script", f"node scripts/pure.mjs\n{full_form}"),
                        ("the work with a command substitution", f'{ids_line} "$(date)"\n{shard_line}')]:
        res = run_req(w_nb(nbv(text)))
        check(f"...{label} is not the real work and is refused", any_of("must run `scripts/mutation-check.mjs --no-browser`", res), res)
    check("...and `confidence.mjs --quick --browserless` (a usage error: nothing runs) is refused for the gate, `confidence.mjs --browserless` is the work",
          any_of("must run `scripts/confidence.mjs --browserless`", audit(w_nb(nbv("node scripts/confidence.mjs --quick --browserless")), pkg, read, final_timeout=5, flagged=("scripts/confidence.mjs",))[0])
          and audit(w_nb(nbv("node scripts/confidence.mjs --browserless")), pkg, read, final_timeout=5, flagged=("scripts/confidence.mjs",))[0] == [])

    check("the required no-browser step runs only after a failed install: the closed form with no `if` is refused as not the required step (the `if` is part of what is required)",
          any_of("must run `scripts/mutation-check.mjs --no-browser`", run_req(w_nb({"name": "nb", "run": full_form}))), run_req(w_nb({"name": "nb", "run": full_form})))
    # the sweep's survivors of the first fix round
    check("a required no-browser step that runs the read-only mode of the spawner (`--anchors`, no flag) is refused as not the work (the flag is part of what is required)",
          any_of("must run `scripts/mutation-check.mjs --no-browser`", run_req(w_nb({"name": "nb", "if": nb_if, "run": "node scripts/mutation-check.mjs --anchors"}))))
    check("a step after the shard action that runs only on a failure and a condition is not certain to run after the action goes red (no `always()`): refused",
          cp([use, {"if": "failure() && github.event_name == 'push'", "run": "x"}]) != [])

    # the gate rows (review round 2, findings 2, 5 and 6)
    for label, extra, frag in [
        ("an unflagged row whose command is behind `timeout`", "  { name: 'x', weight: 10,\n    run: () => ok('timeout 60 node scripts/shot.mjs') },\n", "cannot be read"),
        ("...`xvfb-run`", "  { name: 'x', weight: 10,\n    run: () => ok('xvfb-run node scripts/shot.mjs') },\n", "cannot be read"),
        ("...a call this reader does not know (`check(...)`)", "  { name: 'x', weight: 10,\n    run: () => check('node scripts/shot.mjs') },\n", "names a command"),
        ("...`sh(...)`", "  { name: 'x', weight: 10,\n    run: () => sh('node scripts/shot.mjs') },\n", "names a command"),
        ("...`spawnSync` with an argument array", "  { name: 'x', weight: 10,\n    run: () => spawnSync('node', ['scripts/shot.mjs']) },\n", "cannot be read"),
        ("...`execFileSync` with an argument array", "  { name: 'x', weight: 10,\n    run: () => execFileSync('node', ['scripts/shot.mjs']) },\n", "cannot be read"),
        ("...`shardedSuite(...)`", "  { name: 'x', weight: 10,\n    run: () => shardedSuite(env, 'node scripts/shot.mjs', 3) },\n", "drives a browser"),
        ("a `run:` that is a function value, not an arrow", "  { name: 'x', weight: 10,\n    run: someRowFn },\n", "neither an arrow function"),
        ("a regular expression with an odd quote before the call", "  { name: 'x', weight: 10,\n    run: () => /it's/.test(s) && ok('node scripts/shot.mjs') },\n", "drives a browser"),
        ("a regular expression with an escaped slash before the call (`//` would start a comment)", "  { name: 'x', weight: 10,\n    run: () => /^https?:\\/\\//.test(s) && ok('node scripts/shot.mjs') },\n", "drives a browser"),
    ]:
        got = row_problems(extra)
        check(f"gate rows: {label} is a problem", any_of(frag, got), got)
    check("gate rows: property accesses (`res.ok`, `/a/.exec(x)`), a trailing comma in `all(...)` and a `shardedSuite(...)` row are read, not refused",
          row_problems("  { name: 'x', weight: 10,\n    run: () => res.ok && /a/.exec(out) && all('node scripts/pure.mjs', 'node scripts/pure.mjs',) },\n") == []
          and row_problems("  { name: 'x', weight: 10,\n    run: () => shardedSuite(process.env.A, 'node scripts/pure.mjs', 'node scripts/pure.mjs') },\n") == [], (row_problems("  { name: 'x', weight: 10,\n    run: () => res.ok && /a/.exec(out) && all('node scripts/pure.mjs', 'node scripts/pure.mjs',) },\n")))

    # ---- ROUND 3 OF THE REVIEW: each of these failed on the guard as it stood, or was a mutant the self-test let through
    unread = lambda cmd: audit(wf([{"name": "build", "run": "npm run pure"}, inst, {"name": "w", "if": "always()", "run": cmd}, {"name": "pure", "run": "npm run pure"}, final]), pkg, read, final_timeout=5)
    for cmd in ('timeout 120 node scripts/shot.mjs --out "$(date +%s).json"', 'node scripts/shot.mjs --out "$(date)"', "timeout 120 node scripts/shot.mjs --out `date`", 'timeout 5 node scripts/shot.mjs "x',
                'timeout 5 node scripts/shot.mjs <<EOF\nx\nEOF', 'xvfb-run -a node scripts/pure.mjs --out "$(date)"'):
        res = unread(cmd)
        check(f"a wrapper or a browser script on a line the splitter cannot read (`{cmd.splitlines()[0][:60]}`) is not kept as opaque: the raw line is scanned", any_of("cannot be read", res[0]) and res[1]["opaque"] == 0, res)
    for cmd in ("eval 'node scripts/shot.mjs'", "flock /tmp/x node scripts/shot.mjs", "taskset -c 0 node scripts/shot.mjs", "strace -f node scripts/shot.mjs", "source ./x.sh", "./scripts/x.sh", "make shot",
                "npx tsx scripts/shot.mjs", "/usr/bin/timeout 60 node scripts/shot.mjs", "su -c 'node scripts/shot.mjs'"):
        res = unread(cmd)
        check(f"an unknown head (`{cmd[:40]}`) is not on the allowlist of what may stay unread: refused, not kept as opaque", any_of("cannot be read", res[0]) and res[1]["opaque"] == 0, res)
    # A `uses:` step is never the ledger kind. Its reason is built from the action's own name, so a name that ends in the words of a benign reason would be kept as opaque by the reason test alone.
    res = audit(wf([{"name": "build", "run": "npm run pure"}, inst, {"name": "w", "if": "always()", "uses": "./local/action: git x is not a subcommand this guard reads"}, {"name": "pure", "run": "npm run pure"}, final]), pkg, read, final_timeout=5)
    check("an unreadable `uses:` step under always() is refused, not kept as opaque, even when the action's name ends in the words of a benign reason", any_of("cannot be read", res[0]) and res[1]["opaque"] == 0, res)
    res = unread('D=$(mktemp -d); grep -c x "$D/f" | sed s/a/b/; read -r A B < <(date); sleep $((attempt * 3)); node -e "console.log(1)"')
    check("...while a step made of text and file tools, substitutions, arithmetic and inline node (the ledger kind) stays opaque", res[0] == [] and res[1]["opaque"] == 1, res)
    PINNED_WRAPPERS = ("timeout", "env", "xvfb-run", "bash", "sh", "exec", "xargs", "time", "nice", "nohup", "setsid", "stdbuf", "sudo", "command", "builtin", "watch", "parallel", "ionice", "doas", "chroot")
    check("every wrapper head the guard knows is pinned by a fixture of its own (the list is literal: a loop over WRAPPER_HEADS would lose a fixture with the head a change deleted)", set(PINNED_WRAPPERS) == set(WRAPPER_HEADS), sorted(WRAPPER_HEADS))
    for h in PINNED_WRAPPERS:
        res = unread(f'{h} node scripts/pure.mjs --out "$(date)"')
        check(f"the wrapper `{h}` in front of a command the splitter cannot read is refused (the text of the line is scanned for it)", any_of("cannot be read", res[0]) and res[1]["opaque"] == 0, res)
    check("a division after a name or a `)` is not the start of a regular expression: `(Date.now() - 0) / 1000 > 0 && ok('node scripts/shot.mjs')` drives a browser and is not flagged",
          any_of("gate row 'x' drives a browser", row_problems("  { name: 'x', weight: 10,\n    run: () => (Date.now() - 0) / 1000 > 0 && ok('node scripts/shot.mjs') },\n")))
    check("...and a regular expression after `&&`, `(`, `=>` or `return` still is one (`x && /it's/.test(s) && ok(...)`)",
          any_of("gate row 'x' drives a browser", row_problems("  { name: 'x', weight: 10,\n    run: () => s && /it's/.test(s) && ok('node scripts/shot.mjs') },\n")) and
          any_of("gate row 'x' drives a browser", row_problems("  { name: 'x', weight: 10,\n    run: () => { return /it's/.test(s) && ok('node scripts/shot.mjs') } },\n")))
    check("...a division on both sides of a call is no false red (`8 / 2 && ok('node scripts/pure.mjs') && 4 / 2`)", row_problems("  { name: 'x', weight: 10,\n    run: () => 8 / 2 && ok('node scripts/pure.mjs') && 4 / 2 },\n") == [])
    for f in ("dyn-runner.mjs", "opt-runner.mjs", "bracket-runner.mjs", "destr-runner.mjs", "req-runner.mjs", "up-runner.mjs"):
        check(f"a script that runs the gate's rows by `{files['scripts/' + f].splitlines()[0][:50]}...` is a browser step", needs_browser({"run": f"node scripts/{f}"}, pkg, read) is True, f)
    check("a script that imports a row's helper for something else (`.runner(`, no `run` call) is not a row runner", needs_browser({"run": "node scripts/imports-rows.mjs"}, pkg, read) is False)
    check("gate rows: a call to a helper this reader does not know (`run: () => sparkRow()`, the helper defined above the rows array) is a problem, not browser-free",
          any_of("calls `sparkRow(...)`", row_problems("  { name: 'x', weight: 10,\n    run: () => sparkRow() },\n")))
    check("gate rows: an object key named ok/all and a path that is only read (`.includes('scripts/')`, a file under scripts/) are not commands",
          row_problems("  { name: 'x', weight: 10,\n    run: () => { const res = { ok: true, all: 1 }; return res.ok && ok('node scripts/pure.mjs') } },\n") == []
          and row_problems("  { name: 'x', weight: 10,\n    run: () => ok('node scripts/pure.mjs') && readFileSync('scripts/gate-checks.mjs', 'utf8').includes('scripts/') },\n") == [])

    # the closed form of the required step: tolerant of layout, strict about what runs
    comment_form = full_form.replace(ids_line, ids_line + "   # the ids, & a note; see x").replace(shard_line, shard_line + "  # the shard -> merge")
    for label, text in [("a trailing comment on each command", comment_form), ("`${IDS}` in the test", full_form.replace('"$IDS"', '"${IDS}"', 1)), ("`[[ ]]` in the test", full_form.replace("[ -n", "[[ -n", 1).replace('" ]; then', '" ]]; then', 1)),
                        ("an echo line first", "echo \"::group::no browser\"\n" + full_form)]:
        res = run_req(w_nb(nbv(text)))
        check(f"the required step is accepted with {label}", res == [], res)
    for label, text in [("no `else` (both commands in the then branch)", f'if [ -n "$IDS" ]; then\n  {ids_line}\n  {shard_line}\nfi'), ("the else removed but the fi kept after one command", f'if [ -n "$IDS" ]; then\n  {ids_line}\nfi\n{shard_line}'),
                        ("an `rm` line", f"rm -rf x\n{full_form}"), ("`set -x` first", f"set -x\n{full_form}"), ("an empty else branch", f'if [ -n "$IDS" ]; then\n  {ids_line}\n  {shard_line}\nelse\nfi')]:
        res = run_req(w_nb(nbv(text)))
        check(f"...and refused with {label}", any_of("must run `scripts/mutation-check.mjs --no-browser`", res), res)
    PINNED_MC_MODES, PINNED_CONF_MODES = ("--self-test", "--list-ids", "--anchors", "--stranded", "--heal", "--only"), ("--quick", "--self-test", "--help")
    check("every mode that does no work (NOT_WORK) is pinned by a fixture of its own (the lists are literal)", set(PINNED_MC_MODES) == set(NOT_WORK["scripts/mutation-check.mjs"]) and set(PINNED_CONF_MODES) == set(NOT_WORK["scripts/confidence.mjs"]), NOT_WORK)
    for flag in PINNED_MC_MODES:
        res = run_req(w_nb(nbv(full_form.replace(ids_line, ids_line + " " + flag).replace(shard_line, shard_line + " " + flag))))
        check(f"...the mode flag {flag} on both commands is a step that does not do the work: refused", any_of("must run `scripts/mutation-check.mjs --no-browser`", res), res)
    for label, tail in [("`;`", "; true"), ("`||`", " || true"), ("`&&`", " && true"), ("a pipe", " | tee x.log"), ("a background `&`", " &"), ("a redirect `>`", " > out.txt"), ("a redirect `<`", " < in.txt"),
                        ("a backtick", " `date`"), ("`$(`", ' "$(date)"'), ("a bare `$(` word", " $(date)"), ("a `$(` glued to the argument", "$(date)")]:
        res = run_req(w_nb(nbv(full_form.replace(ids_line, ids_line + tail, 1))))
        check(f"...a command line that ends in {label} (the step could swallow the spawner's failure) is refused", any_of("must run `scripts/mutation-check.mjs --no-browser`", res), res)
    for lead in ("echo `date`", 'echo "`date`"', "echo $(date)", 'echo "$(date)"'):
        res = run_req(w_nb(nbv(f"{lead}\n{full_form}")))
        check(f"...an echo line that runs a command (`{lead}`) is refused: it is work the step does, not text it prints", any_of("must run `scripts/mutation-check.mjs --no-browser`", res), res)
    res = run_req(w_nb(nbv(f'if [ -n "$IDS" ]; then\n  {ids_line}\nelse\n  {ids_line}\nfi')))
    check("...a step whose default branch (no ids) is `--ids` again, so it never runs `--shard`, is not the work: refused", any_of("must run `scripts/mutation-check.mjs --no-browser`", res), res)
    for lead in ("true", "cd .", "export A=1", "mkdir -p x", "sleep 1", "exit 0"):
        res = run_req(w_nb(nbv(f"{lead}\n{full_form}")))
        check(f"...a line that is not `node`, `npm` or an echo (`{lead}`) before the commands is refused", any_of("must run `scripts/mutation-check.mjs --no-browser`", res), res)
    pkg3 = {**pkg, "gate:bl": "node scripts/confidence.mjs --browserless"}
    conf = lambda text: audit(w_nb(nbv(text)), pkg3, read, final_timeout=5, flagged=("scripts/confidence.mjs",))[0]
    for flag in PINNED_CONF_MODES:
        check(f"...`scripts/confidence.mjs --browserless {flag}` is a run that does not do the gate's work: refused", any_of("must run `scripts/confidence.mjs --browserless`", conf(f"node scripts/confidence.mjs --browserless {flag}")), conf(f"node scripts/confidence.mjs --browserless {flag}"))
    check("...and `scripts/confidence.mjs --browserless` alone is the gate's work: accepted", conf("node scripts/confidence.mjs --browserless") == [], conf("node scripts/confidence.mjs --browserless"))
    check("`npm run gate:bl` is the gate's work; `npm run gate:bl -- --quick` (the pass-through argument the reader drops) is not", conf("npm run gate:bl") == [] and any_of("must run `scripts/confidence.mjs --browserless`", conf("npm run gate:bl -- --quick")), conf("npm run gate:bl -- --quick"))

    # the mutants the second review's reviewer found surviving, one fixture each
    check("a row that runs a browser command BEFORE a browser-free one reads as driving a browser (any, not the last)", any_of("gate row 'x' drives a browser", row_problems("  { name: 'x', weight: 10,\n    run: () => all('node scripts/shot.mjs', 'node scripts/pure.mjs') },\n")))
    check("a row with no `run:` is a problem", any_of("has no `run:`", row_problems("  { name: 'x', weight: 10 },\n")))
    check("an `all(...)` with a variable among its arguments is a problem", any_of("something other than plain string literals", row_problems("  { name: 'x', weight: 10,\n    run: () => all('node scripts/pure.mjs', someVar) },\n")))
    check("a `shardedSuite(` whose parentheses never close is a problem", any_of("do not close", row_problems("  { name: 'x', weight: 10,\n    run: () => shardedSuite(env, 'node scripts/pure.mjs'\n")))
    for word, lit in [("npx", "npx tsx scripts/a.mjs"), ("python", "python3 scripts/a.py"), ("bash", "bash -c true"), ("sh", "sh x.sh"), ("timeout", "timeout 5 x"), ("env", "env A=1 x")]:
        check(f"gate rows: a string that starts with `{word}` and no call takes is a command this reader cannot attribute", any_of("names a command", row_problems(f"  {{ name: 'x', weight: 10,\n    run: () => check('{lit}') }},\n")), lit)
    check("gate rows: a `shardedSuite(...)` whose other arguments are not commands (a number, a label) is read, not refused",
          row_problems("  { name: 'x', weight: 10,\n    run: () => shardedSuite(env, 'node scripts/pure.mjs', 'node scripts/pure.mjs', 3, 'a label') },\n") == [])
    three = {**final2, "env": {"INSTALL_OUTCOME": "${{ steps.chromium.outcome }}", **{f"O{n}": f"${{{{ steps.s{n}.outcome }}}}" for n in range(3)}}, "run": 'echo "::error::x $INSTALL_OUTCOME $O0 $O1 $O2"\nexit 1'}
    res = audit(wf([{"name": "build", "run": "npm run pure"}] + [{"name": f"s{n}", "id": f"s{n}", "run": "npm run pure"} for n in range(3)] + [inst, three]), pkg, read, final_timeout=5)[0]
    check("a final step that reads three other outcomes is run for every combination and accepted (the cap is above three)", res == [], res)

    # ---- ROUND 4: ONE FIXTURE FOR EVERY MEMBER OF THE GUARD'S VOCABULARY (outbox/guard-constants-probe-2026-11-15.py deleted each of the 247 string members in turn: 127 left the self-test green,
    # 114 of them green on the real tree as well). Each family below is a LITERAL list, checked equal to the constant (a loop over the constant itself loses a fixture with every member a change
    # deletes), and each member is then made to do its job on an input where its absence changes the verdict.
    vp = {}
    vfiles = {"scripts/shot.mjs": "import { chromium } from 'playwright'\nawait chromium.launch()\n", "scripts/shot.py": "from playwright.sync_api import sync_playwright\nsync_playwright().start().chromium.launch()\n"}
    vread = lambda q: vfiles.get(q, "console.log(1)\n")
    unresolved = lambda cmd: read_step({"run": cmd}, vp, vread)["unresolved"]
    def vocab(family, const, literal, job):
        check(f"{family}: the members the guard knows are exactly the {len(literal)} pinned (a literal list, so a loop cannot lose a fixture with the member a change deletes)", set(literal) == set(const), sorted(const))
        broken = [m for m in literal if not job(m)]
        check(f"{family}: every member does its job on an input where its absence changes the verdict", not broken, broken)
    vocab("BENIGN_HEADS", BENIGN_HEADS, ("mktemp", "grep", "egrep", "fgrep", "sed", "awk", "read", "cat", "tee", "cut", "tr", "sort", "uniq", "head", "tail", "wc", "date", "basename", "dirname", "mkdir", "rm", "cp", "mv",
                                         "ls", "sleep", "jq", "diff", "cmp", "tac", "touch", "stat", "wait"), lambda h: not hides_a_launcher(unresolved(f"{h} x y"), f"{h} x y"))
    vocab("SAFE_HEADS", SAFE_HEADS, ("echo", "printf", "exit", "sleep", "curl", "break", "continue", "seq", "true", "false", "test", "[", "[[", "export", "unset", "set", "cat", "mkdir", "tr"), lambda h: unresolved(f"{h} x") == [])
    vocab("GIT_SUBS", GIT_SUBS, ("config", "add", "commit", "push", "pull", "fetch", "rev-parse", "status", "diff", "log", "show", "checkout", "switch", "reset", "merge", "rm", "mv", "ls-files", "ls-remote", "remote", "tag", "branch"),
          lambda s: unresolved(f"git {s} x") == [])
    vocab("DOTNET_SUBS", DOTNET_SUBS, ("fable", "build", "restore"), lambda s: unresolved(f"dotnet {s} x") == [])
    vocab("ACTIONS_OK", ACTIONS_OK, ("actions/checkout@", "actions/setup-node@", "actions/setup-dotnet@", "actions/setup-python@", "actions/upload-artifact@", "actions/download-artifact@", "actions/cache@"),
          lambda a: read_step({"uses": a + "v4"}, vp, vread)["unresolved"] == [] and read_step({"uses": "x/" + a + "v4"}, vp, vread)["unresolved"] != [])
    vocab("NODE_ARG", NODE_ARG, ("--input-type", "-C", "--conditions", "--env-file", "--title", "--stack-trace-limit"), lambda a: needs_browser({"run": f"node {a} val scripts/shot.mjs"}, vp, vread) is True)
    vocab("NODE_INLINE", NODE_INLINE, ("-e", "--eval", "-p", "--print", "-i", "--interactive", "-", "--run"), lambda a: any_of("inline code", unresolved(f"node {a} x")))
    vocab("PY_FLAGS", PY_FLAGS, ("-I", "-B", "-u", "-E", "-s", "-S", "-O", "-q"), lambda a: needs_browser({"run": f"python3 {a} scripts/shot.py"}, vp, vread) is True)
    vocab("NPM_FLAGS", NPM_FLAGS, ("-s", "--silent", "-q", "--quiet", "--no-audit", "--no-fund", "--no-update-notifier", "--if-present"), lambda a: not any_of("npm flag", unresolved(f"npm {a} run pure")))
    vocab("SEPARATORS", SEPARATORS, ("&&", "||", "|&", ";;", ";", "|", "&", "(", ")"), lambda s: split_commands(f"a {s} b") == [["a"], ["b"]])
    vocab("REDIRECTS", REDIRECTS, (">", ">>", ">&", "<", "<<<"), lambda r: split_commands(f"echo a {r} b c") == [["echo", "a", "c"]])
    vocab("PREFIX_WORDS", PREFIX_WORDS, ("if", "then", "else", "elif", "do", "while", "until", "!", "{", "}", "fi", "done", "esac"), lambda w: command_words([w, "x"]) == ["x"])
    vocab("DANGEROUS_VARS", DANGEROUS_VARS, ("NODE_OPTIONS", "NODE_PATH", "PATH", "BASH_ENV", "ENV", "LD_PRELOAD", "PYTHONSTARTUP", "PYTHONPATH", "PYTHONHOME"),
          lambda k: any_of(f"env: {k} changes what the commands of this step run", read_step({"run": "node scripts/pure.mjs", "env": {k: "x"}}, vp, vread)["unresolved"]))
    # an opaque reason (one that leaves an unreadable always() step opaque) is one of these; each input below yields that reason and no other
    vocab("OPAQUE_REASON_OK", [p.pattern for p in OPAQUE_REASON_OK], (": a command substitution inside a word$", ": a process substitution$", ": a heredoc$", ": unbalanced quoting"),
          lambda pat: not hides_a_launcher(unresolved({": a command substitution inside a word$": "echo `date`", ": a process substitution$": "cat <(date)", ": a heredoc$": "cat <<true\necho hi\ntrue", ": unbalanced quoting": 'echo "x'}[pat]), "x"))
    vocab("ROW_HELPERS", ROW_HELPERS, ("outboxToday", "outboxAccompaniesSource"), lambda h: row_problems(f"  {{ name: 'x', weight: 10,\n    run: {h} }},\n") == [])
    row_calls = ("ok", "fails", "all", "execSync", "execFileSync", "spawnSync", "spawn", "exec", "shardedSuite", "Number", "String", "Boolean", "parseInt", "readFileSync", "existsSync", "readdirSync", "statSync",
                 "if", "for", "while", "switch", "catch", "return", "function")
    vocab("ROW_KNOWN_CALLS", ROW_KNOWN_CALLS, row_calls, lambda c: row_problems(f"  {{ name: 'x', weight: 10,\n    run: () => ok('node scripts/pure.mjs') && {c}('node scripts/pure.mjs') }},\n") == [] if c in ("ok", "fails", "all", "execSync", "execFileSync", "spawnSync", "spawn", "exec", "shardedSuite") else
          row_problems(f"  {{ name: 'x', weight: 10,\n    run: () => ok('node scripts/pure.mjs') && {c}(1) }},\n") == [])
    # the outcomes another step can have when the final step reads it: the final step must fail for EACH (a script that exits 0 for exactly one value, and fails for the rest, is a green job the day that step has it)
    PINNED_OUTCOMES = ("success", "failure", "skipped", "cancelled", "")
    check("ANY_OUTCOMES: the values the guard runs the final step with are exactly the five pinned (a literal list)", set(PINNED_OUTCOMES) == set(ANY_OUTCOMES), sorted(ANY_OUTCOMES))
    broken = []
    for v in PINNED_OUTCOMES:
        one_green = {**final2, "env": {"INSTALL_OUTCOME": "${{ steps.chromium.outcome }}", "O0": "${{ steps.s0.outcome }}"}, "run": f'if [ "$O0" = "{v}" ]; then\n  echo ok\nelse\n  echo "::error::x $INSTALL_OUTCOME"\n  exit 1\nfi'}
        res = audit(wf([{"name": "build", "run": "npm run pure"}, {"name": "s0", "id": "s0", "run": "npm run pure"}, inst, one_green]), pkg, read, final_timeout=5)[0]
        if not any_of("GREEN", res):
            broken.append(v)
    check("ANY_OUTCOMES: a final step that exits 0 for exactly one outcome of another step is refused, for each of the five outcomes", not broken, broken)

    # ---- ROUND 5: THE THIRD REVIEW'S FINDINGS (21 to 30 of the review of 48f504e). Each fixture below failed on the guard as it stood, or is the pin of an alternative that no fixture reached. Every family is a LITERAL
    # list checked equal to its constant, and each member has an input of its own on which its absence changes the verdict; the inputs are chosen so that no OTHER alternative also matches them.
    kept = lambda cmd: (lambda res: res[0] == [] and res[1]["opaque"] == 1)(unread(cmd))
    refused = lambda cmd: (lambda res: any_of("cannot be read", res[0]) and res[1]["opaque"] == 0)(unread(cmd))
    row_pr = lambda body, head="", close="]", after="": (lambda d: (Path(d, "scripts").mkdir(), Path(d, "scripts", "gate-checks.mjs").write_text("// rows\nconst rows = [\n" + head + base_rows + body + close + "\n\nexport { rows }\n" + after), gate_row_problems(d, pkg, read))[2])(tempfile.mkdtemp())
    one_row = lambda run, name="x": f"  {{ name: '{name}', weight: 10,\n    run: {run} }},\n"

    # FINDING 21. The raw line of an unreadable always() step: a command on it that is not an allowed head hides a launcher, whether or not the reader could tell what it launches.
    for cmd in ("npm run pure", "npm test", "npx playwright screenshot http://localhost:8080 /tmp/a.png", "make shot", "eval 'node scripts/shot.mjs'", "./x.sh", "deno run x.ts", "$RUNNER scripts/x"):
        check(f"finding 21: `echo \"at $(date)\" && {cmd}` (a command on a line the splitter cannot read) is refused as unreadable, not kept as opaque", refused(f'echo "at $(date)" && {cmd}') and refused(f'echo "at $(date)"; {cmd}'), cmd)
    check("finding 21: ...while the ledger kind (text tools, a git that only reads, a node with a script file the scan has seen, an assignment of a substitution, arithmetic) stays opaque",
          all(kept(c) for c in ('echo "at $(date)" && git merge-base --is-ancestor HEAD x', 'echo "at $(date)" && node scripts/pure.mjs', 'D=$(mktemp -d); echo "$D/$(basename x)"', 'echo "n $(date)"; sleep $((attempt * 3))',
                                'git diff -- x | grep y > "$(basename z)"', 'echo "${SAVED}/$(basename x)"')))
    PINNED_RAW_WORDS = ("for", "select", "case", "esac", "fi", "done", "in", "}", ":")
    vocab("RAW_WORDS", RAW_WORDS, PINNED_RAW_WORDS, lambda w: not raw_line_hides(f'{w} x "$(date)"'))

    # FINDING 22. Where a command starts on a raw line: each separator, glued to the word before it and spaced, in front of a wrapper.
    PINNED_SEP_SYMBOLS = {";": 'echo "$(date)";timeout 5 x', "|": 'echo "$(date)"|timeout 5 x', "&": 'echo "$(date)"&timeout 5 x', "(": '(timeout 5 x)', "{": '{ timeout 5 x; }', "`": 'echo `timeout 5 x`', "!": '! timeout 5 x'}
    PINNED_SEP_WORDS = {"then": "true; then timeout 5 x", "do": "true; do timeout 5 x", "else": "true; else timeout 5 x", "if": "if timeout 5 x; then true; fi", "elif": "true; elif timeout 5 x; then true", "while": "while timeout 5 x; do true", "until": "until timeout 5 x; do true"}
    check("COMMAND_SEP_SYMBOLS and COMMAND_SEP_WORDS: the members the guard knows are exactly the pinned (literal tables)", set(PINNED_SEP_SYMBOLS) == set(COMMAND_SEP_SYMBOLS) and set(PINNED_SEP_WORDS) == set(COMMAND_SEP_WORDS), (COMMAND_SEP_SYMBOLS, COMMAND_SEP_WORDS))
    for sep, text in {**PINNED_SEP_SYMBOLS, **PINNED_SEP_WORDS}.items():
        check(f"finding 22: a wrapper after `{sep}` is found (`{text}`)", hides_a_launcher([], text) is True and any(h == "timeout" for h, _ in command_heads(text)), command_heads(text))
    for text in ('echo "at $(date)" && timeout 5 x', 'echo x || timeout 5 x', 'A=1 timeout 5 x', 'A="x y" timeout 5 x', "A='x y' timeout 5 x", 'x=$(timeout 5 y)', '"timeout" 5 x', "'timeout' 5 x", "true; then timeout 5 x", "true;timeout 5 x"):
        check(f"finding 22: a wrapper behind `&&`, `||`, an assignment (quoted value too), `$(` or a quote is found (`{text}`)", hides_a_launcher([], text) is True, text)
    check("finding 22: ...and a word that is no command start is not (`${timeout}`, `echo timeout`, `a;b`, a `$((n * 2))` and a keyword's own word)",
          not any(hides_a_launcher([], t) for t in ('echo "${timeout}" x', "echo timeout 5", "a;b", 'sleep $((n * 2))', "if true; then echo x; fi", "echo hi!timeout 5", '[ "$X" != timeout ]')))
    for cmd in ('echo "at $(date)"; xvfb-run -a ./run-checks.sh', 'true; xvfb-run -a ./run-checks.sh "$(date)"', '(xvfb-run -a ./run-checks.sh "$(date)")', 'if true; then timeout 60 ./run-checks.sh "$(date)"; fi',
                '{ timeout 60 ./run-checks.sh "$(date)"; }', 'if timeout 60 ./run-checks.sh "$(date)"; then echo ok; fi'):
        check(f"finding 22: an unreadable always() step with `{cmd[:50]}` is refused, not kept", refused(cmd), cmd)

    # FINDING 23. What a benign reason may be: a git subcommand that only reads, and nothing that runs a command.
    PINNED_GIT_READONLY = ("merge-base", "rev-list", "symbolic-ref", "describe", "cat-file", "for-each-ref", "show-ref", "ls-tree")
    vocab("GIT_READONLY", GIT_READONLY, PINNED_GIT_READONLY, lambda s: kept(f"git {s} x y"))
    for cmd in ("git rebase -x 'node scripts/shot.mjs' HEAD~1", "git -c alias.s='!node scripts/shot.mjs' s", "git bisect run node scripts/shot.mjs", "git submodule foreach 'node scripts/shot.mjs'", "git filter-branch --tree-filter x", "git"):
        check(f"finding 23: `{cmd[:50]}` (git runs a command) is refused under always(), not kept", refused(cmd), cmd)
    for cmd in ("node -e \"require('child_process').execSync('node scripts/shot.mjs')\"", "node -p \"process.mainModule\"", "node --eval \"import('x')\"", "node --run check:peak", "node -i", "node -", "node -e \"process['x']\"", "node -e \"d=>d.constructor\"",
                "node -e \"globalThis\"", "node -e 'eval(1)'", "node -e \"console.log(`x`)\"", "node -e \"console.log(1);console.log(2)\"", "node -e \"process.stdin.on('data', d=>d.x)\"", "node --run=check:peak", "node --eval=\"require('fs')\""):
        check(f"finding 23: `{cmd[:50]}` (node runs code or a package script this guard cannot read) is refused under always(), not kept", refused(cmd), cmd)
    check("finding 23: inline node that is the closed grammar is READ, not refused: the ledger's `process.stdin.on(\"data\", d=>console.log(JSON.parse(d.toString()).id))` and `console.log(1)`",
          all(read_step({"run": c}, pkg, read) == {"browser": False, "unresolved": []} for c in ("node -e 'process.stdin.on(\"data\",d=>console.log(JSON.parse(d.toString()).id))'", "node -e \"console.log(1)\"", "node -p \"JSON.stringify(1)\"", "node --print=\"console.error('x')\"", "node --eval='console.log(2)' a b")))
    check("finding 23: ...a preload before or after inline code still runs (`node -r ./pre-launch.cjs -e ...` and `node -e ... -r ./pre-launch.cjs` are browser steps)",
          needs_browser({"run": "node -r ./pre-launch.cjs -e \"console.log(1)\""}, pkg, read) is True and needs_browser({"run": "node -e \"console.log(1)\" -r ./pre-launch.cjs"}, pkg, read) is True)
    PINNED_NODE_EVAL = ("-e", "--eval", "-p", "--print")
    check("NODE_EVAL: the flags that take inline code are exactly the four pinned (a literal list)", set(PINNED_NODE_EVAL) == set(NODE_EVAL), sorted(NODE_EVAL))
    for fl in PINNED_NODE_EVAL:
        check(f"finding 23: node {fl} with the closed grammar reads clean, and with another code is unresolved", unresolved(f'node {fl} "console.log(1)"') == [] and unresolved(f'node {fl} "require(1)"') != [], fl)
    check("NODE_EVAL_EQ: the `=` forms are exactly the two pinned", set(("--eval=", "--print=")) == set(NODE_EVAL_EQ), NODE_EVAL_EQ)
    for fl in ("--eval=", "--print="):
        check(f"finding 23: node {fl}CODE with the closed grammar reads clean, and with another code is unresolved", unresolved(f"node {fl}'console.log(1)'") == [] and unresolved(f"node {fl}'require(1)'") != [], fl)
    PINNED_INLINE_ROOTS, PINNED_INLINE_PROPS = ("process", "console", "JSON"), ("stdin", "on", "log", "error", "parse", "stringify", "toString", "id")
    vocab("INLINE_ROOTS", INLINE_ROOTS, PINNED_INLINE_ROOTS, lambda r: inline_code_is_pure(f"{r}.on(1)") is True and inline_code_is_pure(f"x{r}.on(1)") is False)
    vocab("INLINE_PROPS", INLINE_PROPS, PINNED_INLINE_PROPS, lambda q: inline_code_is_pure(f"console.{q}(1)") is True and inline_code_is_pure(f"console.{q}x(1)") is False)
    check("finding 23: the closed grammar has no `[`, template literal, `=`, `;`, `{` or a word of its own (each is refused) and a parameter is the one name before `=>`",
          not any(inline_code_is_pure(c) for c in ("console['log'](1)", "console.log(`x`)", "x=1", "console.log(1);", "{}", "console.log(this)", "console.log(d=>d.x(e))", "d=>x", "")) and inline_code_is_pure("process.on('x', d=>console.log(d))"))
    for cmd in ("make -s", "deno -A", "foo * 3", "bun -x", "xargs -r"):
        check(f"finding 23: `{cmd}` is no arithmetic (it is a command and a flag): refused under always(), not kept", refused(cmd), cmd)
    check("finding 23: ...arithmetic is masked where the line is split: `sleep $((attempt * 3))` is `sleep 0`, and one that holds a substitution is still unreadable",
          split_commands("sleep $((attempt * 3))") == [["sleep", "0"]] and split_commands('echo "$((a+1))" b') == [["echo", "0", "b"]] and unresolved("sleep $(( $(date) + 1 ))") != [])

    # FINDING 24. The closed form of the required no-browser step: a trailing comment is cut where bash cuts it, and a branch's work is the spawner.
    both_line = 'node scripts/mutation-check.mjs --ids "$IDS" --shard 1/8 --no-browser --out x.json'
    pkg_np = {k: v for k, v in pkg.items() if k != "prepare"}                      # `npm ci` of a package.json with no install hook runs nothing, as the real one does
    run_req_np = lambda w: audit(w, pkg_np, read, final_timeout=5, flagged=req)[0]
    for label, text in [("an echo with a `#` inside quotes and then `exit 0`", f'echo "note # x" ; exit 0\n{full_form}'), ("the same with single quotes", f"echo 'note # x' ; exit 0\n{full_form}"),
                        ("`|| true` after a `#` inside quotes", f'{ids_line} --note " # x" || true\n{shard_line} --note " # x" || true'), ("a `;` after a `#` inside quotes", f'{ids_line} --note "a # b" ; exit 0\n{shard_line}'),
                        ("a then-branch that is only `npm ci` (the else-branch carries every argument)", f'if [ -n "$IDS" ]; then\n  npm ci\nelse\n  {both_line}\nfi'),
                        ("an else-branch that is only `npm ci`", f'if [ -n "$IDS" ]; then\n  {both_line}\nelse\n  npm ci\nfi'),
                        ("a then-branch of the spawner without its flag and `npm ci`", f'if [ -n "$IDS" ]; then\n  node scripts/mutation-check.mjs --ids "$IDS" --out x.json\nelse\n  {shard_line}\nfi')]:
        res = run_req_np(w_nb(nbv(text)))
        check(f"finding 24: {label} is not the real work and is refused", any_of("must run `scripts/mutation-check.mjs --no-browser`", res), res)
    res = run_req(w_nb(nbv(full_form.replace(ids_line, ids_line + ' # the "ids" # again').replace(shard_line, shard_line + ' --out "x#y.json" # note'))))
    check("finding 24: ...while a real trailing comment (one that begins a word outside quotes), after a quoted `#`, is still cut", res == [], res)

    # FINDING 27. The rows array is read whole, and the name `rows` is used nowhere else.
    row_x = "{ name: 'late', weight: 10, run: () => ok('node scripts/shot.mjs') }"
    check("finding 27: the file the fixtures use reads clean (nothing is wrong with the wrapper, only with what is put in it)", row_pr("") == [], row_pr(""))
    for label, after in [("`rows.push(...)` after the export", f"rows.push({row_x})\n"), ("`rows.splice(0, 1)`", "rows.splice(0, 1)\n"), ("`rows.unshift(...)`", f"rows.unshift({row_x})\n"), ("`rows = []`", "rows = []\n"),
                         ("`rows[0] = ...`", "rows[0] = {}\n"), ("`rows.length = 0`", "rows.length = 0\n"), ("`...rows` in another array", "const all = [...rows]\n"), ("`rows.pop()`", "rows.pop()\n")]:
        check(f"finding 27: {label} is refused: the array is changed after it is read", any_of("`rows` is used", row_pr("", after=after)), row_pr("", after=after))
    check("finding 27: ...also in a statement between the array and the export",
          any_of("`rows` is used", row_pr("", close="]\nrows.push(1)")) and any_of("is not followed by a comma", row_pr("", close="]\nrows.push(1)")))
    check("finding 27: ...while `rows` as an object key, a property (`x.rows`) and one more name in the export are not a use", row_pr("", after="const a = { rows: 1 }\nconst b = x.rows.length\n") == [])
    check("finding 27: a spread, a variable or a call in front of the first row is refused", all(any_of("something before its first row", row_pr("", head=h)) for h in ("  ...more,\n", "  someRow,\n", "  makeRow(),\n", "  { 'name': 'q', 'weight': 1, run: () => ok('node scripts/pure.mjs') },\n")))
    check("finding 27: ...and between two rows or after the last (`...more,`, a variable, a row with quoted keys, two rows on one line, `].concat(more)`)",
          all(any_of("is not followed by a comma", row_pr(b)) for b in ("  ...more,\n", "  someRow,\n", "  { 'name': 'q', 'weight': 1, run: () => ok('node scripts/shot.mjs') },\n",
                                                                        "  { name: 'q', weight: 1, run: () => ok('node scripts/pure.mjs') }, { name: 'r', weight: 1, run: () => ok('node scripts/pure.mjs') },\n"))
          and any_of("is not followed by a comma", row_pr("", close="].concat(more)")))
    check("finding 27: a row with no comma after it (not the last: JavaScript allows that one) is refused, and the real file's shape (`},` then `]`, and a last row with no comma) is clean",
          any_of("is not followed by a comma", row_pr("", head=one_row("() => ok('node scripts/pure.mjs')").replace("},\n", "}\n"))) and row_pr(one_row("() => ok('node scripts/pure.mjs')").replace("},\n", "}\n")) == [])

    # FINDING 28. The final step's tests read only what the step's own `env:` defines.
    for label, test in [("`$GITHUB_ACTIONS` (set on every runner, unset in the guard's run)", '[ "$GITHUB_ACTIONS" != true ]'), ("`$PATH`", '[ "$PATH" != x ]'), ("`$?`", '[ "$?" != 0 ]'), ("`$$`", '[ "$$" != 0 ]'), ("`$0`", '[ "$0" != bash ]'),
                        ("`$1`", '[ "$1" != x ]'), ("`$-`", '[ "$-" != x ]'), ("`${X:-y}`", '[ "${X:-y}" != x ]'), ("`${!X}`", '[ "${!X}" != x ]'), ("`${INSTALL_OUTCOME:-x}` (an expansion with an operator)", '[ "${INSTALL_OUTCOME:-x}" != x ]'),
                        ("`${}`", '[ "${}" != x ]'), ("a variable of the second operand", '[ "$INSTALL_OUTCOME" != "$GITHUB_REF" ]'), ("a variable inside `test`", 'test "$GITHUB_ACTIONS" != true')]:
        res = mut(final_run(f'if {test}; then\n  echo "::error::x"\n  exit 1\nfi\nexit 1'))
        check(f"finding 28: a test that reads {label} is refused (the guard's run does not set it)", any_of("which this guard's run does not set", res), res)
    check("finding 28: ...a test that reads only the step's own env is accepted: `$INSTALL_OUTCOME`, `${INSTALL_OUTCOME}`, a literal env value of its own, and a variable-free comparison",
          all(mut(lambda s, t=t: s[-1].update({"env": {"INSTALL_OUTCOME": "${{ steps.chromium.outcome }}", "MODE": "strict"}, "run": f'echo "::error::x $INSTALL_OUTCOME"\nif {t}; then\n  echo y\nfi\nexit 1'})) == []
              for t in ('[ "$INSTALL_OUTCOME" = skipped ]', '[ "${INSTALL_OUTCOME}" = skipped ]', '[ "$MODE" = strict ]', '[ a = b ]', 'test "$MODE" != "$INSTALL_OUTCOME"')))
    check("finding 28: ...and the variable of a test in the grammar's `echo` is not a test (`echo \"$GITHUB_ACTIONS\"` prints, it decides nothing)", mut(final_run('echo "::error::x $GITHUB_ACTIONS $INSTALL_OUTCOME"\nexit 1')) == [])

    # FINDING 29. npm's own spelling of the variables that change what a script runs.
    unresolved_env = lambda k: read_step({"run": "npm run pure", "env": {k: "x"}}, pkg, read)["unresolved"]
    PINNED_NPM_CONFIG = ("script-shell", "node-options", "prefix", "userconfig", "globalconfig", "workspace", "workspaces", "include-workspace-root")
    vocab("NPM_CONFIG_DANGEROUS", NPM_CONFIG_DANGEROUS, PINNED_NPM_CONFIG, lambda k: any_of("changes what the commands of this step run", unresolved_env("npm_config_" + k.replace("-", "_"))) and
          any_of("changes what the commands of this step run", unresolved_env("NPM_CONFIG_" + k.replace("-", "_").upper())) and any_of("changes what the commands of this step run", unresolved_env("npm_config_" + k)) and
          any_of("changes what the commands after it run", unresolved(f"npm_config_{k.replace('-', '_')}=x npm run pure")))
    check("finding 29: the spelling is npm's: any case of the prefix and the key, `_` or `-`, and the job's and the workflow's env too; an npm key that changes no command (`loglevel`, `shell`, `cache`) and a name that is no npm_config_ one are not refused",
          all(any_of("changes what the commands", unresolved_env(k)) for k in ("Npm_Config_Node_Options", "NPM_CONFIG_node_options", "npm_config_Script_Shell")) and
          not any(any_of("changes what the commands", unresolved_env(k)) for k in ("npm_config_loglevel", "NPM_CONFIG_SHELL", "npm_config_cache", "my_npm_config_node_options", "npm_config_", "npm_configscript_shell")) and
          any_of("the job's env sets", audit({"jobs": {"verify": {"env": {"NPM_CONFIG_SCRIPT_SHELL": "x"}, "steps": good["jobs"]["verify"]["steps"]}}}, pkg, read, final_timeout=5)[0]) and
          any_of("the workflow's env sets", audit({"env": {"npm_config_node_options": "x"}, "jobs": {"verify": {"steps": good["jobs"]["verify"]["steps"]}}}, pkg, read, final_timeout=5)[0]))
    check("finding 29: npm_config_key reads the name as npm does (`_` to `-` except at the start of the key, lower case, no prefix is None)",
          npm_config_key("NPM_CONFIG_Script_Shell") == "script-shell" and npm_config_key("npm_config__x_y") == "_x-y" and npm_config_key("npm_config_") == "" and npm_config_key("X_npm_config_a") is None and npm_config_key("PATH") is None)

    total = ok + fail
    print(f"\n{ok}/{total} checks passed")
    return fail == 0


# ---------------------------------------------------------------- the real tree
def plain_commands(root="."):
    """The commands of the browser-free steps whose browser-free-ness rests on a CLAIM this guard cannot check by reading: every `--self-test` (it never launches) and every
    READONLY_MODES entry (it spawns none of what it names). Read from the target jobs and from every exempt site's steps after its install. scripts/no-launch-check.mjs
    runs them under a trap that logs any browser launch."""
    pkg = json.loads(Path(root, "package.json").read_text()).get("scripts", {})
    read = lambda p: Path(root, p).read_text()
    lists = []
    for tg in TARGETS:
        path = Path(root, tg["file"])
        if path.exists():
            doc = yaml.safe_load(path.read_text(errors="replace"))
            steps = job_steps(doc, tg["job"])
            at = next((i for i, s in enumerate(steps) if is_install(s)), -1)
            lists.append(steps[at + 1:])
    sites, _ = install_sites(root)
    lists += [steps[at + 1:] for _, _, steps, at, _, _ in sites]
    seen, out = set(), []
    for steps in lists:
        for s in steps:
            if not isinstance(s, dict) or not run_text(s):
                continue
            r = read_step(s, pkg, read)
            if r["browser"] or r["unresolved"]:
                continue
            for entry, args in read_commands(run_text(s), pkg, read)["entries"]:
                entry = os.path.normpath(entry)
                if not entry.endswith((".mjs", ".cjs", ".js")):
                    continue
                why = "self-test" if "--self-test" in args else "read-only mode" if readonly_mode(entry, args) else None
                if why and (entry, tuple(args)) not in seen:
                    seen.add((entry, tuple(args)))
                    out.append({"cmd": ["node", entry, *args], "why": why})
    return sorted(out, key=lambda c: c["cmd"])


def real_tree(root="."):
    pkg = json.loads(Path(root, "package.json").read_text()).get("scripts", {})
    read = lambda p: Path(root, p).read_text()
    bad = []
    for tg in TARGETS:
        path = Path(root, tg["file"])
        if not path.exists():
            bad.append(f"the target {tg['file']} does not exist")
            continue
        try:
            doc = yaml.safe_load(path.read_text(errors="replace"))
        except yaml.YAMLError as e:
            bad.append(f"the target {tg['file']} is not valid YAML ({type(e).__name__}): this guard cannot read it")
            continue
        problems, cov = audit(doc, pkg, read, job=tg["job"], flagged=tg.get("flagged", ()))
        if tg["job"] is None:
            problems = problems + caller_problems(tg["file"], {f.relative_to(Path(root)).as_posix(): _doc(f) for f in workflow_files(root)})
        print(f"=== {tg['file']}, {'composite action' if tg['job'] is None else 'job `' + tg['job'] + '`'}: the browser steps wait for the Chromium install ===")
        print(f"  steps after the install read : {cov['steps']}")
        print(f"  need a browser (gated)       : {cov['browser']}")
        print(f"  need none (not gated)        : {cov['plain']}")
        print(f"  could not be read (refused)  : {cov['unreadable']}")
        print(f"  not read, `always()` (kept)  : {cov['opaque']}")
        print(f"  final step run for {len(FINAL_OUTCOMES)} outcomes   : exits non-zero with ::error:: for {cov['final_ok']} of {len(FINAL_OUTCOMES)} ({', '.join(repr(o) for o in FINAL_OUTCOMES)})")
        print()
        bad += [f"{tg['file']}: {b}" for b in problems] + [f"{tg['file']}: {b}" for b in coverage_problems(cov, tg["floors"])]
        if "--json" in sys.argv and tg is TARGETS[0]:
            print(json.dumps(classification(doc, pkg, read, tg["job"]), indent=1))
    row_problems = gate_row_problems(root, pkg, read)
    bad += [f"scripts/gate-checks.mjs: {b}" for b in row_problems]
    try:
        read_rows = gate_rows(root)[0]
    except (OSError, ValueError):
        read_rows = None               # already a problem above
    if read_rows is not None:
        print(f"GATE ROWS: {len(read_rows)} read from scripts/gate-checks.mjs, {sum(1 for r in read_rows if r[2])} flagged `browser` (the ones `--browserless` does not apply): "
              f"{'they are the rows whose commands read as driving a browser' if not row_problems else 'THEY DISAGREE, below'}")
        print()
    exempt_problems, table = exempt_sites(root, pkg, read)
    bad += exempt_problems
    print(f"COVERAGE: {len(TARGETS)} job(s) get the whole shape ({', '.join(t['file'] + (':' + t['job'] if t['job'] else '') for t in TARGETS)}).")
    print(f"  The other {len(table)} install site(s) are EXEMPT by the annotation above each install; N is the number of steps after it that are not certain to run when")
    print("  it fails and are not shown to need a browser, pinned so a step added there is noticed. A site with no annotation, or a wrong N, is a problem below:")
    for rel, line, n, reason in table:
        print(f"  {rel}:{line}  N={n}  {reason}")
    if bad:
        print(f"\nFAIL: {len(bad)} problem(s):")
        for b in bad:
            print(f"  - {b}")
        return False
    print("\nverdict: gated")
    return True


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        sys.exit(0 if self_test() else 1)
    if "--plain-commands" in sys.argv:
        print(json.dumps(plain_commands(), indent=1))
        sys.exit(0)
    sys.exit(0 if real_tree() else 1)
