#!/usr/bin/env python3
"""The verify job's browser steps wait for the Chromium install; every other step does not.

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

WHAT THIS CHECKS, on the real `verify` job

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
     integer) and `[ ]`/`test` comparisons, in if/elif/else/fi, with no pipe and no redirect; anything else is refused,
     because what it does here would say nothing about what it does there. It is last because a step after it that has no
     `always()` is skipped by the failure it makes.
  5. every `steps.<id>` an `if` mentions is the id of an earlier step (a renamed id evaluates to null and skips every
     browser step without a word)
  6. no step's `if` is a bare `false`
  7. coverage is not vacuous: the number of steps read, and how many need a browser, are printed and bounded below
  8. EVERY step after the install is READ. A command the reader cannot resolve is a problem, never "browser-free":
     see the next section.
  9. the other places that install a browser, which this guard does NOT read, are listed in its output (Rule 91).

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
  - A SCRIPT THAT SPAWNS ONE IS NOT SEEN. Only the entry script is read, so `scripts/mutation-check.mjs`, which runs each
    mutation's `expect:` command (for example `node scripts/spark-check.mjs`) in a child, reads as browser-free. No step in
    the real workflow runs it today. NOT enforced by this file; the CC-CMD carries that item too.
  - A WORD IS NOT A USE. Comment lines and trailing comments are dropped before looking, and `playwright install` is
    the install itself.
  - FAIL CLOSED. The reader tokenizes each command line like a shell and understands `node`, `npm run`/`test`/`ci`,
    `python3`, `npx playwright` and a short list of commands that cannot start a browser (SAFE_HEADS). Anything else, a
    wrapper (`timeout`, `env`, `xvfb-run`, `bash -c`, `time`, `exec`, `xargs`), a command substitution inside quotes, a
    heredoc or process substitution, a script with no extension, an npm pass-through argument, a missing script or a
    cycle, a node flag in the `--opt=value` form that is not understood, NODE_OPTIONS or PATH set in front of a command, is
    UNRESOLVED and refused: the author writes the plain form, or gates the step on the install. Before the 2026-11-12
    review this reader dropped what it did not parse and called the step browser-free; seven forms of that were reproduced,
    and a second review found twelve more (a `#` inside a word, `--import=`, `<( )`, `NODE_OPTIONS=` and others), now fixed.
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
import json
import os
import re
import shlex
import subprocess
import sys
import tempfile
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
FINAL_OUTCOMES = ("failure", "skipped", "cancelled", "")   # what steps.chromium.outcome can be when the final step runs
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
INSTALL_CMD = re.compile(r"\bplaywright\s+install\b")


def is_install(step):
    """The step whose COMMANDS install the browser (a comment that mentions the command is not one)."""
    return bool(INSTALL_CMD.search("\n".join(logical_lines(run_text(step)))))


OUTCOME = re.compile(r"steps\.(\w+)\.outcome")
GATE_CLAUSE = f"steps.{INSTALL_ID}.outcome == 'success'"
FINAL_CLAUSES = ["always()", f"steps.{INSTALL_ID}.outcome != 'success'"]
# The clauses a browser step's `if` may carry besides the gate. Every one can only keep the step running or leave the gate
# to decide. `failure()`, `steps.x.outcome == 'failure'|'cancelled'|'skipped'` and `!=` forms are not here: AND-ed onto the
# gate they make the step run only when something else already failed, which is never on a good commit.
GATE_EXTRA = re.compile(r"^(?:always\(\)|success\(\)|!cancelled\(\)|steps\.\w+\.outcome == 'success')$")


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


def is_false_if(cond):
    """A bare `false` (YAML reads an unquoted one as the boolean False) or `0`."""
    return cond is not None and bool(re.fullmatch(r"(?:\$\{\{\s*)?(?:false|0)(?:\s*\}\})?", str(cond).strip().lower()))


def truthy(v):
    """continue-on-error is on unless it is absent or a literal false. An expression cannot be evaluated here: on."""
    return v not in (None, False, "false", "False")


# ---------------------------------------------------------------- reading steps and commands
def job_steps(doc, job=JOB):
    return (((doc or {}).get("jobs") or {}).get(job) or {}).get("steps") or []


def run_text(step):
    r = step.get("run")
    return r if isinstance(r, str) else ""


def if_text(step):
    """The `if` as text, with bracket notation (`steps['chromium'].outcome`) written as the dotted form it means."""
    c = step.get("if")
    return "" if c is None else re.sub(r"\[\s*['\"](\w+)['\"]\s*\]", r".\1", str(c))


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
                        "export", "unset", "set", "cat", "mkdir"})
ACTIONS_OK = ("actions/checkout@", "actions/setup-node@", "actions/setup-dotnet@", "actions/setup-python@",
              "actions/upload-artifact@", "actions/download-artifact@", "actions/cache@")
NODE_PRELOAD = {"-r", "--require", "--import", "--loader", "--experimental-loader"}
NODE_PRELOAD_EQ = ("--require=", "--import=", "--loader=", "--experimental-loader=")
NODE_ARG = {"--input-type", "-C", "--conditions", "--env-file", "--title", "--stack-trace-limit"}
NODE_INLINE = {"-e", "--eval", "-p", "--print", "-i", "--interactive", "-", "--run"}
NODE_INLINE_EQ = ("--eval=", "--print=", "--run=")
# Variables that change WHAT a command runs without appearing in it: a preload through NODE_OPTIONS, a shadowing PATH.
DANGEROUS_VARS = frozenset({"NODE_OPTIONS", "NODE_PATH", "PATH", "BASH_ENV", "ENV", "LD_PRELOAD", "PYTHONSTARTUP", "PYTHONPATH", "PYTHONHOME"})
INSTALL_LINE = re.compile(r"^(?:timeout(?: --kill-after=\d+)? \d+ )?npx playwright install(?: [\w-]+)*$")
FINAL_HEADS = frozenset({"echo", "exit", "[", "test"})
PY_FLAGS = {"-I", "-B", "-u", "-E", "-s", "-S", "-O", "-q"}
NPM_FLAGS = {"-s", "--silent", "-q", "--quiet", "--no-audit", "--no-fund", "--no-update-notifier", "--if-present"}
SCRIPT_FILE = re.compile(r"^[\w./\-]+\.(?:mjs|cjs|js)$")
PY_FILE = re.compile(r"^[\w./\-]+\.py$")
MAX_DEPTH = 16


def split_commands(line):
    """The words of each simple command on one logical line. Raises Unreadable on a shape that is not read."""
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
    i, preloads = 1, []
    while i < len(w):
        a = w[i]
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
        out = {"entries": [], "direct": False, "unresolved": []}
    for line in logical_lines(script):
        try:
            groups = split_commands(line)
        except Unreadable as e:
            out["unresolved"].append(f"`{line[:80]}`: {e}")
            continue
        for g in groups:
            w = command_words(g)
            assigned = [x.split("=", 1)[0] for x in (list(g[:len(g) - len(w)]) + (list(w[1:]) if w and w[0] == "export" else [])) if re.match(r"^[A-Za-z_]\w*=", x)]
            if any(a in DANGEROUS_VARS for a in assigned):
                out["unresolved"].append(f"`{' '.join(g)[:80]}`: it sets {', '.join(a for a in assigned if a in DANGEROUS_VARS)}, which changes what the commands after it run")
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


def read_step(step, pkg, read):
    """{browser: bool, unresolved: [why]} for one step."""
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
    for k in (step.get("env") or {}):
        if str(k) in DANGEROUS_VARS:
            res["unresolved"].append(f"env: {k} changes what the commands of this step run")
    out = read_commands(script, pkg, read)
    res["unresolved"] += out["unresolved"]
    res["browser"] = out["direct"]
    for entry, args in out["entries"]:
        if "--self-test" in args:
            continue
        hit, why = entry_launches(entry, read)
        if why:
            res["unresolved"].append(why)
        res["browser"] = res["browser"] or hit
    if LAUNCH.search(strip_comments(script)):       # an inline use in the step's own text
        res["browser"] = True
    return res


def needs_browser(step, pkg, read):
    return read_step(step, pkg, read)["browser"]


# ---------------------------------------------------------------- the final step, by effect
def run_final(step, outcome, timeout=FINAL_TIMEOUT):
    """Run the final step's script as the runner runs a step with no `shell:` (`/usr/bin/bash -e {0}`: the job logs print it, and
    there is NO pipefail), with the install's outcome in its env. Only called for a script final_script_problems() accepts."""
    env = {"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "LC_ALL": "C"}
    for k, v in (step.get("env") or {}).items():
        v = str(v)
        if re.fullmatch(r"\$\{\{\s*steps\.chromium\.outcome\s*\}\}", v.strip()):
            env[str(k)] = outcome
        elif "${{" in v:
            raise Unreadable(f"env {k} uses an expression other than steps.chromium.outcome, which this guard cannot evaluate")
        else:
            env[str(k)] = v
    with tempfile.TemporaryDirectory() as d:
        return subprocess.run(["bash", "-e", "-c", run_text(step)], cwd=d, env=env,
                              capture_output=True, text=True, timeout=timeout)


def final_script_problems(script):
    """The final step's script may use ONLY echo, `exit N` (N a literal non-zero integer) and `[ ]`/`test` comparisons, in
    if/elif/else/fi. The guard runs it to see that it fails, and can only know that it fails the same way on the runner if it
    touches nothing the two places differ in: a file (the guard's cwd is empty), a variable the runner sets, a pipe (the
    runner has no pipefail), a redirect, a command that is not one of these. Returns [why]."""
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
    return bad


def final_step_problems(step, name, timeout=FINAL_TIMEOUT):
    bad = []        # its `continue-on-error` and `shell` are refused by the rules that read EVERY step, in audit() and read_step()
    if "${{" in run_text(step):
        bad.append(f"the final step {name} interpolates an expression into its script: put it in `env:` (`${{{{ steps.{INSTALL_ID}.outcome }}}}` is the one value this guard substitutes)")
        return bad
    if not run_text(step).strip():
        bad.append(f"the final step {name} has no script to fail with")
        return bad
    grammar = final_script_problems(run_text(step))
    if grammar:
        bad.append(f"the final step {name} must use only echo, `exit N` and `[ ]` comparisons in if/elif/else/fi, so that running it here shows what the runner does: " + "; ".join(grammar[:3]))
        return bad
    failed = []
    for outcome in FINAL_OUTCOMES:
        label = repr(outcome)
        try:
            r = run_final(step, outcome, timeout)
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
def audit(doc, pkg, read, job=JOB, final_timeout=FINAL_TIMEOUT):
    """Returns (violations, coverage). The workflow, package.json and scripts come in as arguments."""
    steps = job_steps(doc, job)
    jobdoc = ((doc or {}).get("jobs") or {}).get(job) or {}
    bad = []
    installs = [i for i, s in enumerate(steps) if is_install(s)]
    if len(installs) != 1:
        return [f"expected exactly one browser-install step in job `{job}`, found {len(installs)}"], {"steps": len(steps), "browser": 0, "plain": 0, "unreadable": 0, "final_ok": 0}
    at = installs[0]
    inst = steps[at]
    name = lambda s: repr(s.get("name") or run_text(s)[:40])
    if inst.get("id") != INSTALL_ID:
        bad.append(f"the install step {name(inst)} must have `id: {INSTALL_ID}` (it has {inst.get('id')!r})")
    if inst.get("continue-on-error") is not True:
        bad.append(f"the install step {name(inst)} must have `continue-on-error: true`, or its failure skips every step after it")
    if truthy(jobdoc.get("continue-on-error")):
        bad.append(f"job `{job}` has `continue-on-error`: a failed step would leave the job green")
    lines = logical_lines(run_text(inst))
    if len(lines) != 1 or not INSTALL_LINE.match(lines[0]):
        bad.append(f"the install step {name(inst)} must be ONE `npx playwright install ...` command (optionally behind `timeout N`): it has `continue-on-error`, so anything else in it that fails is swallowed and the job is green over it")
    for scope, env in (("job", jobdoc.get("env")), ("workflow", (doc or {}).get("env"))):
        for k in (env or {}):
            if str(k) in DANGEROUS_VARS:
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
        for ref in OUTCOME.findall(if_text(s)):
            if ref not in ids or ids[ref] >= i:
                bad.append(f"step {name(s)} reads steps.{ref}.outcome but no earlier step has id `{ref}` (it would evaluate to null)")

    last = len(steps) - 1
    final_at = last if last > at and is_final_if(if_text(steps[last])) else None
    browser, plain, unreadable = [], [], 0
    for i, s in enumerate(steps):
        if i < at:
            if needs_browser(s, pkg, read):
                bad.append(f"step {name(s)} needs a browser but runs BEFORE the install")
            continue
        if i == at:
            continue
        r = read_step(s, pkg, read)
        if r["unresolved"]:
            unreadable += 1
            for why in r["unresolved"][:3]:
                bad.append(f"step {name(s)} cannot be read, so it cannot be called browser-free: {why}")
        (browser if r["browser"] else plain).append((i, s))

    for i, s in browser:
        if not gated_if(if_text(s)):
            bad.append(f"step {name(s)} needs a browser and must carry `steps.{INSTALL_ID}.outcome == 'success'` in its `if`, joined only by `&&` to always(), success(), !cancelled() or another `steps.<id>.outcome == 'success'` (it has {if_text(s) or 'no if'!r})")
    for i, s in plain:
        if is_final_if(if_text(s)):         # the final step, wherever it is: if it is not LAST, that is its own message below
            continue
        if f"steps.{INSTALL_ID}" in if_text(s):
            bad.append(f"step {name(s)} needs no browser and must not wait for the install (it has {if_text(s)!r}): an outage would skip it again")
    final_ok = 0
    if final_at is None:
        bad.append(f"the LAST step of job `{job}` must be the final step, whose `if` is exactly `always() && steps.{INSTALL_ID}.outcome != 'success'`: without one a failed install would leave the job GREEN with every browser step skipped, and any step after it that has no `always()` is skipped by the failure it makes")
    elif not read_step(steps[final_at], pkg, read)["unresolved"]:       # refused above, with its reason: a script the reader cannot read is not run
        fp = final_step_problems(steps[final_at], name(steps[final_at]), final_timeout)
        bad += fp
        final_ok = 0 if fp else len(FINAL_OUTCOMES)
    return bad, {"steps": len(steps) - at - 1, "browser": len(browser), "plain": len(plain), "unreadable": unreadable, "final_ok": final_ok}


def other_install_sites(root="."):
    """`file:line` of every OTHER place that installs a browser: this guard reads only the `verify` job."""
    sites = []
    base = Path(root)
    for pat in (".github/workflows/*.yml", ".github/actions/*/action.yml"):
        for f in sorted(base.glob(pat)):
            rel = f.relative_to(base).as_posix()
            if rel == WORKFLOW:
                continue
            for n, line in enumerate(f.read_text().splitlines(), 1):
                if INSTALL_CMD.search(line) and not line.lstrip().startswith("#"):
                    sites.append(f"{rel}:{n}")
    return sites


def classification(doc, pkg, read, job=JOB):
    steps = job_steps(doc, job)
    at = next((i for i, s in enumerate(steps) if is_install(s)), -1)
    return [{"name": s.get("name"), "needsChromium": "yes" if needs_browser(s, pkg, read) else "no"} for i, s in enumerate(steps) if i > at and s.get("name")]


def coverage_problems(cov):
    """A classifier that read nothing must not pass: the counts it reports are bounded below."""
    floors = [("steps read", cov["steps"], MIN_STEPS), ("browser steps", cov["browser"], MIN_BROWSER), ("browser-free steps", cov["plain"], MIN_PLAIN)]
    return [f"only {got} {label} read, expected at least {floor}: the classifier read too little to mean anything" for label, got, floor in floors if got < floor]


# ---------------------------------------------------------------- self-test
def _sites_fixture_ok():
    with tempfile.TemporaryDirectory() as d:
        wf = Path(d, ".github", "workflows")
        act = Path(d, ".github", "actions", "shard")
        wf.mkdir(parents=True)
        act.mkdir(parents=True)
        (wf / "verify.yml").write_text("run: npx playwright install chromium\n")
        (wf / "a.yml").write_text("# npx playwright install chromium (a comment)\n      run: npx playwright install chromium\n")
        (act / "action.yml").write_text("run: timeout 180 npx playwright install chromium\n")
        return other_install_sites(d) == [".github/workflows/a.yml:2", ".github/actions/shard/action.yml:1"]


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
          audit(good, pkg, read)[1] == {"steps": 5, "browser": 1, "plain": 4, "unreadable": 0, "final_ok": 4}, audit(good, pkg, read)[1])

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
    check("an inline `node -e` is not read: it is UNRESOLVED (and the step that launches inline is a browser step by its own text)",
          read_step({"run": "node -e \"require('playwright').chromium.launch()\""}, pkg, read)["browser"] is True and
          read_step({"run": "node -e \"console.log(1)\""}, pkg, read)["unresolved"] != [])
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
    check("the final step with an env value that is any other expression is refused", any_of("cannot evaluate", mut(lambda s: s[-1].update({"env": {"X": "${{ github.sha }}"}}))))
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
          any_of("cannot be read", bad_of(wf([{"name": "b", "id": "build", "run": "npm run pure"}, inst, {"name": "wrapped", "run": "timeout 60 node scripts/pure.mjs"}, final]))))
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
    check("the other install sites are listed with their lines, a comment that names the command is not one, and verify.yml is not one of them",
          _sites_fixture_ok())

    # ---- THE REAL-TREE PATH AND THE CLI EXIT, which no mutant reached before the second review: run the guard itself, as the
    # browser-gate job does, in a temporary root holding a workflow big enough to pass the coverage floors
    def cli(steps, with_other_site=False):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / ".github" / "workflows").mkdir(parents=True)
            (root / ".github" / "workflows" / "verify.yml").write_text(yaml.safe_dump(wf(steps)))
            (root / "package.json").write_text(json.dumps({"scripts": pkg}))
            for f, src in files.items():
                if "/" in f:
                    (root / f).parent.mkdir(parents=True, exist_ok=True)
                    (root / f).write_text(src)
            if with_other_site:
                (root / ".github" / "workflows" / "probe.yml").write_text("run: npx playwright install chromium\n")
            r = subprocess.run([sys.executable, __file__], cwd=d, capture_output=True, text=True, timeout=60)
            return r.returncode, r.stdout + r.stderr

    big = [{"name": "build", "id": "build", "run": "npm run pure"}, inst] + \
          [{"name": f"shot {i}", "if": gated, "run": "npm run shot"} for i in range(12)] + \
          [{"name": f"plain {i}", "run": "npm run pure"} for i in range(50)] + [final]
    rc, out = cli(big, with_other_site=True)
    check("THE CLI on a good tree exits 0 and says `verdict: gated`", rc == 0 and "verdict: gated" in out, (rc, out[-300:]))
    check("...and lists the other install sites it does not read (Rule 91)", "NOT COVERED, 1 other place(s)" in out and "probe.yml:1" in out, out[-300:])
    broken = [dict(s) for s in big]
    del broken[1]["id"]
    rc, out = cli(broken)
    check("THE CLI on a tree whose install has lost its id exits 1, prints FAIL and names the problem",
          rc == 1 and "FAIL: " in out and "must have `id: chromium`" in out and "verdict: gated" not in out, (rc, out[-300:]))
    rc, out = cli([{"name": "build", "id": "build", "run": "npm run pure"}, inst, {"name": "shots", "if": gated, "run": "npm run shot"}, final])
    check("THE CLI applies the coverage floors to the real tree: a tree that reads too little exits 1", rc == 1 and "expected at least" in out, (rc, out[-300:]))

    total = ok + fail
    print(f"\n{ok}/{total} checks passed")
    return fail == 0


# ---------------------------------------------------------------- the real tree
def real_tree(root="."):
    text = Path(root, WORKFLOW).read_text()
    doc = yaml.safe_load(text)
    pkg = json.loads(Path(root, "package.json").read_text()).get("scripts", {})
    read = lambda p: Path(root, p).read_text()
    bad, cov = audit(doc, pkg, read)
    print(f"=== the {JOB} job's browser steps wait for the Chromium install ===")
    print(f"  steps after the install read : {cov['steps']}")
    print(f"  need a browser (gated)       : {cov['browser']}")
    print(f"  need none (not gated)        : {cov['plain']}")
    print(f"  could not be read (refused)  : {cov['unreadable']}")
    print(f"  final step run for {len(FINAL_OUTCOMES)} outcomes   : exits non-zero with ::error:: for {cov['final_ok']} of {len(FINAL_OUTCOMES)} ({', '.join(repr(o) for o in FINAL_OUTCOMES)})")
    others = other_install_sites(root)
    print(f"\nCOVERAGE: the `verify` job of {WORKFLOW} only. NOT COVERED, {len(others)} other place(s) that install a browser:")
    print("  " + (", ".join(others) if others else "none"))
    bad += coverage_problems(cov)
    if "--json" in sys.argv:
        print(json.dumps(classification(doc, pkg, read), indent=1))
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
    sys.exit(0 if real_tree() else 1)
