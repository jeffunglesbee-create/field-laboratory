#!/usr/bin/env python3
"""The verify job's browser steps wait for the Chromium install; every other step does not.

WHY THIS EXISTS, measured 2026-11-11.

`Install Chromium` is one step of the `verify` job. When it failed (the Ubuntu mirrors did not resolve for about
three hours, so apt stalled ten minutes and then failed) every step after it was SKIPPED, GitHub's default after a
failure. 63 steps were skipped, and about 60 of them need no browser at all: the F# suite, the decoders, the
citation check, the registry checks. The commit was reported as unverified for a reason that said nothing about the
commit, and the one suite that could have been green was not run. The file's own header says it: "a failure anywhere
in it skips everything after".

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
      run: ... exit 1                  # the job is still RED, and says why

The last step is what keeps `continue-on-error` from turning a failed install into a green job. It tests `!= 'success'`,
not `== 'failure'`: an install killed by its `timeout-minutes` may conclude as something other than `failure`, and a
final step that missed that case would leave the job green with every browser step skipped.

WHAT THIS CHECKS, on the real `verify` job

  1. the install step has `id: chromium` and `continue-on-error: true`
  2. every step AFTER it that needs a browser carries `steps.chromium.outcome == 'success'` in its `if`
  3. no step that does NOT need one mentions `steps.chromium` (a browser-free step gated on the install is skipped by
     an outage again: the failure this exists to end), except the final step
  4. a final step, after every browser step, with `always()` and `steps.chromium.outcome != 'success'`, whose script
     exits 1
  5. every `steps.<id>` an `if` mentions is the id of an earlier step (a renamed id evaluates to null and skips every
     browser step without a word)
  6. coverage is not vacuous: the number of steps read, and how many need a browser, are printed and bounded below

HOW A STEP IS CLASSIFIED (and why not by a word)

A step needs a browser when some command it runs starts a PROGRAM that launches one: `node <entry> [args]`, directly or
through `npm run X` (resolved in package.json), where the ENTRY script itself imports playwright or calls
chromium.launch, and the arguments do not include `--self-test`. Three decisions, each measured:

  - ENTRY ONLY. A module that imports a browser script does not launch anything: this repo's import-purity check
    ("Importing a module never runs it") requires every module with side effects to sit behind isMain(). A mechanical
    read that followed imports called 8 steps browser steps that two independent readers, who read the sources, called
    browser-free (check-live-probe-keys imports live-score-probe and never launches).
  - `--self-test` NEVER LAUNCHES. Every script that has one handles it before it reaches its launch, and exits.
  - A WORD IS NOT A USE. Comment lines are dropped before looking, and `playwright install` is the install itself.

The classification was checked against two independent readers per step, with a judge for disagreements, over all 90
steps that follow the install: outbox/verify-step-browser-classification-2026-11-12.json.

THIS FILE IS NOT RUN FROM THE `verify` JOB, and must not be: its self-test fixtures embed launch calls as strings, so the text
rule reads it as a browser script (checked in its self-test). It has its own job, `browser-gate`, which is also why an outage of
the install cannot park it.

READ-ONLY. Parses workflow YAML and reads scripts; runs nothing.
"""
import json
import re
import sys
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
# The conditions a step in this job may use. Anything else (`|| true`, `&& false`, a function nobody expects) is not
# recognised, and a gate or a final step the guard cannot read is a gate it cannot vouch for.
CLAUSE = re.compile(r"^(?:always\(\)|success\(\)|failure\(\)|!cancelled\(\)|steps\.\w+\.outcome (?:==|!=) '(?:success|failure|cancelled|skipped)')$")


def clauses(cond):
    """The `&&`-joined clauses of an `if`, normalised, or None if it uses anything but the recognised ones (no `||`)."""
    c = re.sub(r"^\s*\$\{\{\s*|\s*\}\}\s*$", "", cond or "")
    if "||" in c or not c.strip():
        return None
    parts = [re.sub(r"\s+", " ", re.sub(r"\s*(==|!=)\s*", r" \1 ", p.strip())) for p in c.split("&&")]
    return parts if all(CLAUSE.match(p) for p in parts) else None


def gated_if(cond):
    cl = clauses(cond)
    return cl is not None and GATE_CLAUSE in cl


def is_final_if(cond):
    cl = clauses(cond)
    return cl is not None and sorted(cl) == sorted(FINAL_CLAUSES)


# ---------------------------------------------------------------- reading steps and commands
def job_steps(doc, job=JOB):
    return (((doc or {}).get("jobs") or {}).get(job) or {}).get("steps") or []


def run_text(step):
    r = step.get("run")
    return r if isinstance(r, str) else ""


def if_text(step):
    c = step.get("if")
    return "" if c is None else str(c)


def logical_lines(script):
    """A script's command lines: continuations joined, comments dropped."""
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


def segments(line):
    return [s.strip() for s in re.split(r"\s*(?:&&|\|\||;|\|)\s*", line) if s.strip()]


def invocations(script, pkg, depth=0):
    """[(file, args)] for every program a script starts, resolving `npm run X` through package.json."""
    found = []
    for line in logical_lines(script):
        for seg in segments(line):
            seg = re.sub(r"^(?:[A-Za-z_]\w*=\S*\s+)+", "", seg)          # leading VAR=value
            seg = re.sub(r"\s*&\s*$", "", seg)                           # a trailing background &
            m = re.match(r"npm\s+run\s+(?:(?:--silent|-s|--)\s+)*([\w:.\-]+)(.*)$", seg)
            if m:
                body = (pkg.get(m.group(1)) or "")
                if body and depth < 6:
                    found += invocations(body, pkg, depth + 1)
                continue
            m = re.match(r"node\s+(?:--[\w=\-]+\s+)*([\w./\-]+\.(?:mjs|cjs|js))(.*)$", seg)
            if m:
                found.append((m.group(1), m.group(2)))
                continue
            m = re.match(r"python3?\s+([\w./\-]+\.py)(.*)$", seg)
            if m:
                found.append((m.group(1), m.group(2)))
    return found


def strip_comments(src):
    return "\n".join(l for l in src.splitlines() if not re.match(r"\s*(//|\*|/\*|#)", l))


def entry_launches(path, read):
    try:
        src = read(path)
    except (OSError, KeyError):
        return False            # a compiled file that is not built here (build/...) launches nothing at check time
    return bool(LAUNCH.search(strip_comments(src)))


def needs_browser(step, pkg, read):
    script = run_text(step)
    if not script:
        return False
    for file, args in invocations(script, pkg):
        if "--self-test" in args.split():
            continue
        if entry_launches(file, read):
            return True
    # an inline use (`node -e`, a heredoc): a launch in the step's own text, or `npx playwright <not install>`
    own = strip_comments(script)
    if LAUNCH.search(own):
        return True
    for m in re.finditer(r"\bnpx\s+playwright\s+(\w+)", own):
        if m.group(1) != "install":
            return True
    return False


# ---------------------------------------------------------------- the rules
def audit(doc, pkg, read, job=JOB):
    """Returns (violations, coverage). Pure: the workflow, package.json and scripts come in as arguments."""
    steps = job_steps(doc, job)
    bad = []
    installs = [i for i, s in enumerate(steps) if is_install(s)]
    if len(installs) != 1:
        return [f"expected exactly one browser-install step in job `{job}`, found {len(installs)}"], {"steps": len(steps), "browser": 0, "plain": 0}
    at = installs[0]
    inst = steps[at]
    name = lambda s: repr(s.get("name") or run_text(s)[:40])
    if inst.get("id") != INSTALL_ID:
        bad.append(f"the install step {name(inst)} must have `id: {INSTALL_ID}` (it has {inst.get('id')!r})")
    if inst.get("continue-on-error") is not True:
        bad.append(f"the install step {name(inst)} must have `continue-on-error: true`, or its failure skips every step after it")

    ids = {}
    for i, s in enumerate(steps):
        if s.get("id"):
            ids[s["id"]] = i
    for i, s in enumerate(steps):
        for ref in OUTCOME.findall(if_text(s)):
            if ref not in ids or ids[ref] >= i:
                bad.append(f"step {name(s)} reads steps.{ref}.outcome but no earlier step has id `{ref}` (it would evaluate to null)")

    browser, plain = [], []
    for i, s in enumerate(steps):
        if i < at:
            if needs_browser(s, pkg, read):
                bad.append(f"step {name(s)} needs a browser but runs BEFORE the install")
            continue
        if i == at:
            continue
        (browser if needs_browser(s, pkg, read) else plain).append((i, s))

    final = None
    for i, s in reversed(list(enumerate(steps))):
        if i > at and is_final_if(if_text(s)):
            final = (i, s)
            break
    for i, s in browser:
        if not gated_if(if_text(s)):
            bad.append(f"step {name(s)} needs a browser and must carry `steps.{INSTALL_ID}.outcome == 'success'` in its `if`, joined only by `&&` to recognised conditions (it has {if_text(s) or 'no if'!r})")
    for i, s in plain:
        if final is not None and i == final[0]:
            continue
        if f"steps.{INSTALL_ID}" in if_text(s):
            bad.append(f"step {name(s)} needs no browser and must not wait for the install (it has {if_text(s)!r}): an outage would skip it again")
    if final is None:
        bad.append(f"no final step whose `if` is exactly `always() && steps.{INSTALL_ID}.outcome != 'success'`: a failed install would leave the job GREEN with every browser step skipped")
    else:
        fi, fs = final
        if "exit 1" not in run_text(fs):
            bad.append(f"the final step {name(fs)} must `exit 1`")
        last_browser = max((i for i, _ in browser), default=-1)
        if fi < last_browser:
            bad.append(f"the final step {name(fs)} runs before the last browser step {name(steps[last_browser])}")
    return bad, {"steps": len(steps) - at - 1, "browser": len(browser), "plain": len(plain)}


def classification(doc, pkg, read, job=JOB):
    steps = job_steps(doc, job)
    at = next((i for i, s in enumerate(steps) if is_install(s)), -1)
    return [{"name": s.get("name"), "needsChromium": "yes" if needs_browser(s, pkg, read) else "no"} for i, s in enumerate(steps) if i > at and s.get("name")]


def coverage_problems(cov):
    """A classifier that read nothing must not pass: the counts it reports are bounded below."""
    floors = [("steps read", cov["steps"], MIN_STEPS), ("browser steps", cov["browser"], MIN_BROWSER), ("browser-free steps", cov["plain"], MIN_PLAIN)]
    return [f"only {got} {label} read, expected at least {floor}: the classifier read too little to mean anything" for label, got, floor in floors if got < floor]


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
        "scripts/prose.py": '"""Mentions chromium.launch and PW_CHROMIUM and from playwright in prose."""\nPATTERN = r"chromium\\.launch|PW_CHROMIUM"\n',
        "scripts/l-core.mjs": "import { chromium } from 'playwright-core'\n",
    }
    read = lambda p: files[p]
    pkg = {"shot": "node scripts/shot.mjs --self-test && node scripts/shot.mjs", "selfonly": "node scripts/shot.mjs --self-test",
           "pure": "node scripts/pure.mjs", "viaimport": "node scripts/uses-lib.mjs", "nest": "npm run shot", "py": "python3 scripts/probe.py"}

    def wf(steps):
        return {"jobs": {"verify": {"steps": steps}}}

    inst = {"name": "Install Chromium", "id": "chromium", "continue-on-error": True, "run": "npx playwright install chromium"}
    gated = "steps.chromium.outcome == 'success'"
    final = {"name": "Chromium did not install", "if": "always() && steps.chromium.outcome != 'success'", "run": "echo no\nexit 1"}
    good = wf([{"name": "build", "id": "build", "run": "npm run pure"}, inst,
               {"name": "shots", "if": gated, "run": "npm run shot"},
               {"name": "pure", "run": "npm run pure"},
               {"name": "selftest", "run": "npm run selfonly"},
               {"name": "viaimport", "run": "npm run viaimport"}, final])

    def bad_of(w, **kw):
        return audit(w, kw.get("pkg", pkg), kw.get("read", read))[0]

    check("a gated browser step, plain steps, and a final step pass", bad_of(good) == [], bad_of(good))
    check("coverage is counted: 1 browser, 3 plain (the final step is one of them)",
          audit(good, pkg, read)[1] == {"steps": 5, "browser": 1, "plain": 4}, audit(good, pkg, read)[1])

    def mut(fn):
        import copy
        w = copy.deepcopy(good)
        fn(w["jobs"]["verify"]["steps"])
        return bad_of(w)

    check("a browser step with no `if` is refused", any("must carry" in b for b in mut(lambda s: s[2].pop("if"))), mut(lambda s: s[2].pop("if")))
    check("a browser step gated on `always()` alone is refused", any("must carry" in b for b in mut(lambda s: s[2].update({"if": "always()"}))))
    check("a browser step gated on `== 'failure'` is refused", any("must carry" in b for b in mut(lambda s: s[2].update({"if": "steps.chromium.outcome == 'failure'"}))))
    check("a plain step gated on the install is refused (an outage would skip it again)",
          any("must not wait" in b for b in mut(lambda s: s[3].update({"if": gated}))))
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
          entry_launches(__file__, lambda p: Path(p).read_text()) is True)
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
    check("an inline `node -e` that launches a browser is a browser step",
          needs_browser({"run": "node -e \"require('playwright').chromium.launch()\""}, pkg, read) is True)
    check("a command whose script name is on the continuation line is read (the lines are joined)",
          needs_browser({"run": "node \\\n  scripts/shot.mjs"}, pkg, read) is True)
    check("`--self-test` on the continuation line makes the step plain (the lines are joined)",
          needs_browser({"run": "node scripts/shot.mjs \\\n  --self-test"}, pkg, read) is False)
    check("a line that starts with a comment is not read", needs_browser({"run": "# node scripts/shot.mjs\necho hi"}, pkg, read) is False)
    check("the install without `continue-on-error: true` is refused",
          any("continue-on-error" in b for b in mut(lambda s: s[1].pop("continue-on-error"))))
    check("the install with `continue-on-error: false` is refused",
          any("continue-on-error" in b for b in mut(lambda s: s[1].update({"continue-on-error": False}))))
    check("the install without the id is refused", any("must have `id: chromium`" in b for b in mut(lambda s: s[1].pop("id"))))
    check("a renamed id is refused twice over: no id, and every `if` reads a missing one",
          sum(1 for b in mut(lambda s: s[1].update({"id": "browser"})) if "no earlier step has id" in b or "must have `id" in b) >= 2)
    check("no final step: refused, naming the green-with-everything-skipped failure",
          any("GREEN" in b for b in mut(lambda s: s.pop())))
    check("a final step that tests `== 'failure'` is not the final step (a timeout may not conclude as failure)",
          any("GREEN" in b for b in mut(lambda s: s[-1].update({"if": "always() && steps.chromium.outcome == 'failure'"}))))
    check("a final step without `always()` is not the final step",
          any("GREEN" in b for b in mut(lambda s: s[-1].update({"if": "steps.chromium.outcome != 'success'"}))))
    check("a gate OR-ed with `true` is refused (it is no gate)", any("must carry" in b for b in mut(lambda s: s[2].update({"if": "steps.chromium.outcome == 'success' || true"}))))
    check("a gate AND-ed with `false` is refused (the step would never run)", any("must carry" in b for b in mut(lambda s: s[2].update({"if": "steps.chromium.outcome == 'success' && false"}))))
    check("a gate wrapped in ${{ }} and spaced differently is read", bad_of(wf([{"name": "b", "run": "true"}, inst, {"name": "x", "if": "${{ steps.chromium.outcome=='success' }}", "run": "npm run shot"}, final])) == [])
    check("a final step with `&& false` appended is refused (it would never run)",
          any("GREEN" in b for b in mut(lambda s: s[-1].update({"if": "always() && steps.chromium.outcome != 'success' && false"}))))
    check("a final step OR-ed with anything is refused", any("GREEN" in b for b in mut(lambda s: s[-1].update({"if": "always() && steps.chromium.outcome != 'success' || true"}))))
    check("a final step with an extra recognised clause is refused (the form is exact)",
          any("GREEN" in b for b in mut(lambda s: s[-1].update({"if": "always() && steps.chromium.outcome != 'success' && steps.build.outcome == 'success'"}))))
    check("a final step that does not exit 1 is refused", any("must `exit 1`" in b for b in mut(lambda s: s[-1].update({"run": "echo no"}))))
    check("a final step before the last browser step is refused",
          any("before the last browser step" in b for b in mut(lambda s: s.append({"name": "late shots", "if": gated, "run": "npm run shot"}))))
    check("a browser step before the install is refused",
          any("BEFORE the install" in b for b in mut(lambda s: s.insert(0, {"name": "early", "run": "npm run shot"}))))
    check("a comment that mentions `npx playwright install` is not an install step",
          audit(wf([{"name": "c", "run": "# npx playwright install chromium\necho hi"}]), pkg, read)[0][0].endswith("found 0"))
    check("two install steps are refused", any("exactly one" in b for b in mut(lambda s: s.append(dict(inst)))))
    check("no install step is refused", any("exactly one" in b for b in bad_of(wf([{"name": "x", "run": "true"}]))))
    check("a job with no steps is refused, not passed", audit({}, pkg, read)[0] != [])
    tail_if = "!cancelled() && steps.build.outcome == 'success' && steps.chromium.outcome == 'success'"
    tail_wf = wf([{"name": "b", "id": "build", "run": "npm run pure"}, inst, {"name": "tail", "if": tail_if, "run": "npm run shot"}, final])
    check("a tail step whose `if` names the build AND the install outcome passes", bad_of(tail_wf) == [], bad_of(tail_wf))
    check("...and the same tail step without the install outcome is refused",
          any("must carry" in b for b in bad_of(wf([{"name": "b", "id": "build", "run": "npm run pure"}, inst,
              {"name": "tail", "if": "!cancelled() && steps.build.outcome == 'success'", "run": "npm run shot"}, final]))))
    check("classification lists every named step after the install",
          [c["needsChromium"] for c in classification(good, pkg, read)] == ["yes", "no", "no", "no", "no"], classification(good, pkg, read))

    total = ok + fail
    print(f"\n{ok}/{total} checks passed")
    return fail == 0


# ---------------------------------------------------------------- the real tree
def real_tree():
    text = Path(WORKFLOW).read_text()
    doc = yaml.safe_load(text)
    pkg = json.loads(Path("package.json").read_text()).get("scripts", {})
    read = lambda p: Path(p).read_text()
    bad, cov = audit(doc, pkg, read)
    print(f"=== the {JOB} job's browser steps wait for the Chromium install ===")
    print(f"  steps after the install read : {cov['steps']}")
    print(f"  need a browser (gated)       : {cov['browser']}")
    print(f"  need none (not gated)        : {cov['plain']}")
    print("\nCOVERAGE: the `verify` job of .github/workflows/verify.yml only. The `full` job of verify-full.yml and the composite")
    print("mutation-shard action install a browser too and are not covered here.")
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
