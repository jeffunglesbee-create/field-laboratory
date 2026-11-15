#!/usr/bin/env python3
"""Runs the expectation commands of the mutation table with NO browser on disk, and records what each did. Read by outbox/no-browser-classify-2026-11-15.mjs.

  unshare -m bash -c 'mount -t tmpfs tmpfs /opt/pw-browsers && python3 outbox/no-browser-probe-2026-11-15.py outbox/no-browser-results-2026-11-15.json'

The private mount hides /opt/pw-browsers (the sandbox's Chromium, which several scripts fall back to when it exists) from the commands and from nothing else on the machine; PW_CHROMIUM is unset and
PLAYWRIGHT_BROWSERS_PATH points at nothing. Where /opt/pw-browsers does not exist (a runner) the mount is not needed.

PREREQUISITES, which the result depends on and the probe does not create: a full clone of the repository with `git config core.hooksPath .githooks` (a row reads it), `npm ci`, the build (`npm run build`),
and `dotnet restore src/Laboratory.fsproj` (the F# rows and `proof-check.mjs --only` need src/obj/project.assets.json). Without them, 8 of the commands fail for reasons that are not the browser
(measured 2026-11-15 on a bare `git archive`: five `proof-check.mjs --only *-PROOF`, three `run-row.mjs` rows); with them none does.

WHAT IT COVERS, said where the result is read (Rule 91): every DISTINCT expectation of the table, quoted or written as a template literal, is accounted for in one of four classes, printed in `accounted`:
  trap       a `--self-test` that scripts/no-launch-check.mjs measures (the commands of `check-browser-gate.py --plain-commands`): not run here
  probed     run here with no browser, once
  self-test  a `--self-test` the trap does not measure: run here with no browser, once (so every self-test is measured by one instrument or the other)
  harness    an expectation that runs the mutation harness itself (`mutation-check.mjs --only ...`), which mutates the tree: not run
"""
import concurrent.futures as cf
import json
import os
import re
import subprocess
import sys
from pathlib import Path

out_path = Path(sys.argv[1] if len(sys.argv) > 1 else "no-browser-results.json")
src = Path("scripts/mutation-check.mjs").read_text()
expects = {}
for m in re.finditer(r'\bexpect:\s*(?:"((?:[^"\\]|\\.)*)"|\'((?:[^\'\\]|\\.)*)\'|`((?:[^`\\]|\\.)*)`)', src):
    c = next(x for x in m.groups() if x is not None).encode().decode("unicode_escape")
    expects[c] = expects.get(c, 0) + 1
distinct = sorted(expects)
trap = {" ".join(x["cmd"][1:]) for x in json.loads(subprocess.run([sys.executable, "-B", "scripts/check-browser-gate.py", "--plain-commands"], capture_output=True, text=True, check=True).stdout)}
is_self = lambda c: " --self-test" in c or c.endswith("--self-test")
cls = {}
for c in distinct:
    if "mutation-check.mjs --only" in c:
        cls[c] = "harness"
    elif is_self(c):
        cls[c] = "trap" if c.removeprefix("node ") in trap else "self-test"
    else:
        cls[c] = "probed"
accounted = {k: sum(1 for v in cls.values() if v == k) for k in ("trap", "probed", "self-test", "harness")}
print(f"distinct expectation commands: {len(distinct)}; accounted: {accounted}", flush=True)

env = {k: v for k, v in os.environ.items() if k != "PW_CHROMIUM"}
env["PLAYWRIGHT_BROWSERS_PATH"] = "/nonexistent-browsers"


def run(c):
    try:
        r = subprocess.run(["bash", "-c", c], capture_output=True, text=True, timeout=300, env=env)
        return {"cmd": c, "status": r.returncode, "text": ((r.stdout or "") + (r.stderr or ""))[-3000:]}
    except subprocess.TimeoutExpired:
        return {"cmd": c, "status": None, "text": "TIMEOUT 300s"}


todo = [c for c in distinct if cls[c] in ("probed", "self-test")]
serial = [c for c in todo if "proof-check" in c or "doc claims are compiler" in c or "build is clean" in c or "F# harness" in c]
par = [c for c in todo if c not in serial]
with cf.ThreadPoolExecutor(4) as ex:
    res = list(ex.map(run, par))
res += [run(c) for c in serial]
seen = sorted(os.listdir("/opt/pw-browsers")) if os.path.isdir("/opt/pw-browsers") else "(no such directory)"
out_path.write_text(json.dumps({"distinct": len(distinct), "accounted": accounted, "classes": cls, "browserDirSeen": seen, "results": res}, indent=1))
print(f"probed {len(res)}; the browser directory seen by the commands: {seen}; wrote {out_path}", flush=True)
