#!/usr/bin/env python3
"""Rule 90 over every string member of the guard's module-level collections: delete ONE member at a time, in a COPY of the guard, and ask whether `--self-test` goes red.

The third review's evidence pass found the guard's fixtures looping over the constant they tested, so that deleting a member deleted its fixture (15 of 20 wrapper heads, 8 of 9
not-work flags). The same class would live in any collection nobody had mutated, so this tries them all. Rule 91: the printed result carries its denominator.

    python3 outbox/guard-constants-probe-2026-11-15.py [WORKERS]         (from the repository root; runs on a copy under /dev/shm, never touches the tree)

CAUGHT   the copy exits non-zero AND prints a FAIL line.   SURVIVED  it exits 0 (or non-zero with no FAIL line: not a catch).   CRASH  the mutated source does not parse.
A SURVIVOR is then run on the REAL TREE path too (`python3 scripts/check-browser-gate.py`, what the `verify` job runs): REAL-TREE-RED when that goes red (a member the real workflows use: a
deletion that made the guard stricter than the tree is caught there), and OPEN when it stays green too (nothing catches it: unused vocabulary, or a member whose deletion makes the guard looser).
With a second argument (a file of labels, one per line, as printed) only those deletions are run, and the printed result says how many of the enumerated members that left NOT run.
WHAT IS ENUMERATED (and the printed result says what is not): a module-level assignment whose value holds a set, tuple or list made ENTIRELY of string constants. A dict (its keys), a list with
an f-string or a non-string member, and a collection assigned from a call are listed by name as `outside the enumeration`, so the denominator is not read as every collection (review 2026-11-15,
round 4, finding 36).
Each deletion is asserted to change the source and to leave a source that compiles. A survivor is triaged by hand: a fixture, or a reason it is equivalent (Rule 90's corollary).
"""
import ast, os, shutil, subprocess, sys, tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

GUARD = Path("scripts/check-browser-gate.py")
SRC = GUARD.read_bytes()
if os.environ.get("PROBE_NO_EQUALITY"):
    # The literal lists in the self-test are checked EQUAL to their constants, which catches any deletion by itself. With this set, those equalities are replaced by True in the copy (the
    # baseline must still pass), so a deletion is caught only if a member's own job check fails for it.
    for eq in (b"set(PINNED_RUNNERS) == set(RUNS_ROWS)", b"set(PINNED_WRAPPERS) == set(WRAPPER_HEADS)",
               b'set(PINNED_MC_MODES) == set(NOT_WORK["scripts/mutation-check.mjs"]) and set(PINNED_CONF_MODES) == set(NOT_WORK["scripts/confidence.mjs"])',
               b"set(literal) == set(const)", b"set(PINNED_OUTCOMES) == set(ANY_OUTCOMES)"):
        assert SRC.count(eq) == 1, f"the equality check {eq!r} occurs {SRC.count(eq)} times, not once"
        SRC = SRC.replace(eq, b"True")
text = SRC.decode()
tree = ast.parse(text)
line_off = [0]
for ln in text.splitlines(keepends=True):
    line_off.append(line_off[-1] + len(ln.encode()))

def span(node):
    return line_off[node.lineno - 1] + node.col_offset, line_off[node.end_lineno - 1] + node.end_col_offset

mutants = []
for top in tree.body:
    if isinstance(top, ast.Assign) and len(top.targets) == 1 and isinstance(top.targets[0], ast.Name):
        name = top.targets[0].id
        for sub in ast.walk(top.value):
            if isinstance(sub, (ast.Set, ast.Tuple, ast.List)) and sub.elts and all(isinstance(e, ast.Constant) and isinstance(e.value, str) for e in sub.elts):
                for k, e in enumerate(sub.elts):
                    a, b = span(e)
                    nxt = SRC[b:b + 2]
                    if nxt == b", ":
                        b += 2
                    elif SRC[b:b + 1] == b",":                          # a one-member tuple `(x,)`: take its comma too
                        b += 1
                    elif k > 0:
                        a = span(sub.elts[k - 1])[1]            # the last member: take the separator before it
                    mutants.append((f"{name}[{e.value!r}]", e.lineno, a, b))

enumerated = len(mutants)
named = {m[0].split("[", 1)[0] for m in mutants}
outside = []
for top in tree.body:
    if isinstance(top, ast.Assign) and len(top.targets) == 1 and isinstance(top.targets[0], ast.Name) and top.targets[0].id not in named:
        v = top.value
        kind = {ast.Dict: "dict", ast.Set: "set", ast.List: "list", ast.Tuple: "tuple"}.get(type(v))
        if kind is None and isinstance(v, ast.Call) and isinstance(v.func, ast.Name) and v.func.id in ("frozenset", "set", "dict", "tuple", "list"):
            kind = f"{v.func.id}(...)"
        if kind and (not isinstance(v, (ast.Set, ast.List, ast.Tuple)) or v.elts):
            outside.append(f"{top.targets[0].id} ({kind})")
workers = int(sys.argv[1]) if len(sys.argv) > 1 else 3
if len(sys.argv) > 2:
    wanted = {l.strip() for l in Path(sys.argv[2]).read_text().splitlines() if l.strip()}
    mutants = [m for m in mutants if m[0] in wanted]
    assert len(mutants) == len(wanted), f"{len(wanted) - len(mutants)} labels name no member"
base = Path(tempfile.mkdtemp(prefix="gcp-", dir="/dev/shm"))
def make(i):
    d = base / f"w{i}"
    shutil.copytree(".github", d / ".github")
    shutil.copy("package.json", d / "package.json")
    shutil.copytree("scripts", d / "scripts", ignore=shutil.ignore_patterns("__pycache__"))
    return d
dirs = [make(i) for i in range(workers)]
free = list(dirs)
import threading
lock = threading.Lock()

def run(d, data, args=("--self-test",)):
    (d / "scripts" / "check-browser-gate.py").write_bytes(data)
    r = subprocess.run([sys.executable, "-B", "scripts/check-browser-gate.py", *args], cwd=d, capture_output=True, text=True, timeout=900)
    return r.returncode, "FAIL" in r.stdout, (r.stdout.strip().splitlines() or [""])[-1]

def one(m):
    label, line, a, b = m
    data = SRC[:a] + SRC[b:]
    assert data != SRC
    try:
        compile(data.decode(), "mutant", "exec")
    except SyntaxError as e:
        return label, line, "CRASH", f"does not compile: {e.msg}"
    with lock:
        d = free.pop()
    try:
        rc, f, last = run(d, data)
        if not (rc != 0 and f):                                                   # a survivor: does the real tree path catch it?
            rc2, f2, last2 = run(d, data, ())
            if rc2 != 0:
                return label, line, "REAL-TREE-RED", f"self-test exit {rc}; real tree exit {rc2}: {last2}"
    finally:
        with lock:
            free.append(d)
    return label, line, ("CAUGHT" if rc != 0 and f else "SURVIVED"), f"exit {rc}; {last}"

rc, f, last = run(dirs[0], SRC)
print(f"baseline: exit {rc}; {last}\n{enumerated} string members enumerated in {len(named)} module-level collections (a set, tuple or list of string constants); this run: {len(mutants)} of them"
      + (f", {enumerated - len(mutants)} NOT RUN (a label file was given)" if len(mutants) != enumerated else "")
      + f"\noutside the enumeration, not run: {', '.join(outside) or 'none'}")
assert rc == 0, "the unmutated copy must be green"
tally = {"CAUGHT": 0, "REAL-TREE-RED": 0, "SURVIVED": 0, "CRASH": 0}
with ThreadPoolExecutor(workers) as ex:
    for label, line, verdict, why in ex.map(one, mutants):
        tally[verdict] += 1
        print(f"{verdict:8} line {line:<5} {label}" + ("" if verdict == "CAUGHT" else f"   ({why})"), flush=True)
print(f"\nran {sum(tally.values())} of {enumerated} enumerated deletions ({enumerated - len(mutants)} not run by the label file; {len(outside)} collections outside the enumeration); caught by the self-test {tally['CAUGHT']}; survived the self-test but red on the real tree {tally['REAL-TREE-RED']}; OPEN (green on both) {tally['SURVIVED']}; did not compile {tally['CRASH']}")
shutil.rmtree(base, ignore_errors=True)
sys.exit(0 if tally["SURVIVED"] == 0 and tally["CRASH"] == 0 and len(mutants) == enumerated else 1)
