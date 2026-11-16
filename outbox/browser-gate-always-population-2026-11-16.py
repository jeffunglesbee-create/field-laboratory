#!/usr/bin/env python3
"""Population of run steps with `if: always()` and an unresolved reason, classified by two copies of the guard.
usage: python3 -B outbox/browser-gate-always-population-2026-11-16.py OLD_GUARD.py NEW_GUARD.py   (run from the root of the tree whose .github is read; each guard is loaded as a module and nothing is run)
Prints one line per step (file, job, step name, old verdict, new verdict) and the counts. Denominator = the steps of that population."""
import importlib.util, json, sys
from pathlib import Path


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    sys.modules[name] = m
    spec.loader.exec_module(m)
    return m


old, new = load(sys.argv[1], "gold"), load(sys.argv[2], "gnew")
root = "."
pkg = json.loads(Path(root, "package.json").read_text()).get("scripts", {})
read = lambda p: Path(root, p).read_text()
rows = []
for f in old.workflow_files(root):
    doc = old._doc(f)
    for jname, job, steps in old._step_lists(doc):
        for i, s in enumerate(steps):
            if not isinstance(s, dict) or not old.run_text(s):
                continue
            if not old.always_if(old.if_text(s)):
                continue
            ro, rn = old.read_step(s, pkg, read), new.read_step(s, pkg, read)
            if not (ro["unresolved"] or rn["unresolved"]):
                continue
            ho = old.hides_a_launcher(ro["unresolved"], old.run_text(s))
            hn = new.hides_a_launcher(rn["unresolved"], new.run_text(s))
            rows.append((f.relative_to(root).as_posix(), jname, i, s.get("name"), ho, hn, ro["browser"]))
flip = [r for r in rows if r[4] != r[5]]
TARGETS = {(t["file"], t["job"]) for t in old.TARGETS}
aud = [r for r in rows if (r[0], r[1]) in TARGETS or (r[0] in {t[0] for t in TARGETS if t[1] is None} and r[1] is None)]
for r in rows:
    tag = "" if r[4] == r[5] else ("  <-- KEPT->REFUSED" if (not r[4] and r[5]) else "  <-- REFUSED->KEPT")
    print(f"{r[0]} job={r[1]} step#{r[2]} {r[3]!r}: old hides={r[4]} new hides={r[5]}{tag}")
print(f"population: {len(rows)} always() run steps with an unresolved reason (checked {len(rows)} of {len(rows)}); "
      f"old kept={sum(1 for r in rows if not r[4])} refused={sum(1 for r in rows if r[4])}; "
      f"new kept={sum(1 for r in rows if not r[5])} refused={sum(1 for r in rows if r[5])}; flipped={len(flip)}")
print(f"audited jobs (the {len(TARGETS)} targets): {len(aud)} of those {len(rows)} steps; old kept={sum(1 for r in aud if not r[4])} new kept={sum(1 for r in aud if not r[5])}; flipped={sum(1 for r in aud if r[4] != r[5])}: "
      + ", ".join(f"{r[0].split('/')[-1]} {r[3]!r}" for r in aud if r[4] != r[5]))
