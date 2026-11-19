#!/usr/bin/env python3
"""What the heredoc and multi-line-string reading of scripts/check-browser-gate.py changes on the REAL tree (docs/CC-CMD-2026-11-16-gate-guard-contrived-residual.md, item 1).

Every `run:` step of every workflow and composite action in .github/ is read twice: by the guard as it was before the change (a path given as the first argument: `git show 39459bd2:scripts/check-browser-gate.py`)
and by the guard as it is now (scripts/check-browser-gate.py). For each step it compares the command lines (logical_lines) and the reasons the step is unresolved (read_step), and prints the steps where either
differs. The denominator is printed with the result (Rule 91): `checked N of N run steps`.

    python3 outbox/guard-heredoc-probe-2026-11-19.py /path/to/old-guard.py
"""
import glob, importlib.util, json, re, sys
from pathlib import Path

import yaml


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    saved, sys.argv = sys.argv, ["x"]
    try:
        spec.loader.exec_module(mod)
    finally:
        sys.argv = saved
    return mod


old, new = load(sys.argv[1], "old"), load("scripts/check-browser-gate.py", "new")
pkg = json.loads(Path("package.json").read_text())["scripts"]


def read(p):
    return Path(p).read_text()


files = sorted(glob.glob(".github/workflows/*.yml") + glob.glob(".github/actions/*/action.yml"))
steps, differ, heredoc_ops, multiline, blanks_only = 0, [], 0, 0, 0
blanks = lambda lines: [re.sub(r"[ \t]+", " ", l) for l in lines]
# a reason quotes the start of its line, cut at a fixed length: two readings that differ in a blank cut it at different places, so a reason is compared by its first 40 characters with blanks collapsed and by what it says after the quoted line
reasons = lambda rs: [(re.sub(r"[ \t]+", " ", r)[:40], r.rsplit("`: ", 1)[-1]) for r in rs]
for f in files:
    doc = yaml.safe_load(Path(f).read_text())
    jobs = (doc or {}).get("jobs") or {}
    allsteps = [(jn, s) for jn, j in jobs.items() for s in (j.get("steps") or [])] or [("(action)", s) for s in (((doc or {}).get("runs") or {}).get("steps") or [])]
    for jn, s in allsteps:
        run = s.get("run")
        if not isinstance(run, str):
            continue
        steps += 1
        lo, ln = old.logical_lines(run), new.logical_lines(run)
        ro, rn = old.read_step(s, pkg, read)["unresolved"], new.read_step(s, pkg, read)["unresolved"]
        if new.heredoc_operators(run) not in ([], None) or any(new.heredoc_operators(l) not in ([], None) for l in new.logical_lines(run)):
            heredoc_ops += 1
        if any("\n" in l for l in ln):
            multiline += 1
        if blanks(lo) != blanks(ln) or reasons(ro) != reasons(rn):
            differ.append((f, jn, s.get("name"), len(lo), len(ln), len(ro), len(rn)))
        elif lo != ln or ro != rn:
            blanks_only += 1
print(f"checked {steps} of {steps} run steps in {len(files)} files, each read by the old guard and the new one")
print(f"steps with a heredoc operator: {heredoc_ops}; steps with a command line that holds a newline (a string that spans lines): {multiline}")
print(f"steps whose command lines or reasons differ only in the blanks where a backslash joined two lines (the old reader put a space there, bash puts none): {blanks_only}")
print(f"steps whose command lines or unresolved reasons differ (blanks apart): {len(differ)}")
for d in differ:
    print("  DIFF", d)
