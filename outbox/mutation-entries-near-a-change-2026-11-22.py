#!/usr/bin/env python3
"""The mutation entries of scripts/mutation-check.mjs for scripts/check-browser-gate.py whose anchor lies in a line that a change touches.

`node scripts/mutation-check.mjs --anchors` says an anchor is still there and unique; it does not say the mutant still changes anything. Item 9 of the residual CC-CMD rewrote the line that
`browser-gate-heredoc-bodies-shown` mutates, the anchor stayed unique, the mutant became equivalent, the entry survived on the runner (verify-full run 45058424770, shard 8) and passed
on this machine only because the entry had not been run. Run this after a change and run every entry it prints.

    python3 outbox/mutation-entries-near-a-change-2026-11-22.py OLD_GUARD_PATH     (the guard before the change, e.g. `git show origin/main:scripts/check-browser-gate.py > /tmp/old.py`)
prints: `N entries; M whose anchor lies in a changed line` and their ids (without the `browser-gate-` prefix).
"""
import difflib, re, sys
def entries(path="scripts/mutation-check.mjs"):
    import json
    out, cur = [], {}
    for line in open(path).read().split("\n"):
        m = re.match(r'^    (id|file|claim|find|replace|expect): (".*"),$', line)
        if m:
            try: cur[m.group(1)] = json.loads(m.group(2))
            except Exception: cur[m.group(1)] = None
        elif line.startswith("  },"):
            if cur.get("file") == "scripts/check-browser-gate.py" and cur.get("find") is not None: out.append((cur["id"], cur["find"]))
            cur = {}
    return out
old = open(sys.argv[1]).read(); new = open("scripts/check-browser-gate.py").read()
sm = difflib.SequenceMatcher(None, old.split("\n"), new.split("\n"), autojunk=False)
oldch, newch = set(), set()
for tag, i1, i2, j1, j2 in sm.get_opcodes():
    if tag != "equal": oldch.update(range(i1, i2)); newch.update(range(j1, j2))
def span(text, find):
    i = text.find(find)
    return None if i < 0 else range(text.count("\n", 0, i), text.count("\n", 0, i) + find.count("\n") + 1)
E_ = entries(); hits = []
for id_, find in E_:
    so, sn = span(old, find), span(new, find)
    if (so and any(k in oldch for k in so)) or (sn and any(k in newch for k in sn)): hits.append(id_.replace("browser-gate-", ""))
print(f"{len(E_)} entries; {len(hits)} whose anchor lies in a changed line"); print(" ".join(hits))
