#!/usr/bin/env python3
"""Rule 90 for check-push-lands.py.

P3 is the one to keep: it makes the guard count when it appears ANYWHERE in the
step rather than AFTER the loop. A guard before the loop verifies the previous
push, and every file in this repo would pass with the loops still silent.

Each mutation asserts its anchor is unique and applied before reporting a
verdict; NOT CAUGHT with nothing mutated is worse than no test.

The mutation is made on a COPY in a temporary directory and the tracked file is only
read, as mutate-ppubs-probe.py, mutate-patent-watch.py and mutate-drama-backfill.py do.
It used to be written in place with the original held in memory, so a run killed
between the two writes left scripts/check-push-lands.py mutated and the next run
refused to start ("has unstaged changes"). A run killed now leaves a temporary
directory and a clean tree. scripts/mutate-copy-check.mjs holds it to that.
"""
import subprocess, pathlib, sys, tempfile

CHECK = pathlib.Path('scripts/check-push-lands.py')

if subprocess.run([sys.executable, str(CHECK), '--self-test'], capture_output=True).returncode != 0:
    print(f'FAIL — {CHECK} --self-test is already red on clean source.'); sys.exit(1)
print(f'baseline: {CHECK} --self-test passes on clean source\n')

MUTATIONS = [
    ('P1 a loop is never unguarded',
     "    return bool(LANDED.search(run[end:]))",
     "    return True",
     'every loop reads as guarded and the check can never fail'),
    ('P2 only the one exact shape is a loop',
     r"LOOP = re.compile(r'for\s+\w+\s+in\s+[^\n;]*;\s*do(?P<body>.*?)\bdone\b', re.S)",
     r"LOOP = re.compile(r'for i in 1 2 3; do\n(?P<body>.*?)\ndone', re.S)",
     'the one-liner and push-then-pull variants stop being seen — the exact failure the sweep hit five times'),
    ('P3 a guard ANYWHERE in the step counts',
     "    return bool(LANDED.search(run[end:]))",
     "    return bool(LANDED.search(run))",
     'a guard BEFORE the loop verifies the previous push; every file passes with the loops still silent'),
    ('P4 zero loops reads as clean',
     "    if guarded + unguarded == 0:\n        return 'no-loops-found'",
     "    if guarded + unguarded == 0:\n        return 'all-guarded'",
     'a broken matcher reports a clean tree (an empty result is a failure, not a pass)'),
    ('P5 unguarded loops stop failing',
     "    if unguarded:\n        return 'unguarded'",
     "    if False:\n        return 'unguarded'",
     'the count is printed and the run still goes green'),
    ('P6 a push loop needs no break',
     "        if 'git push' in body and 'break' in body:",
     "        if 'git push' in body:",
     'ordinary loops containing a push are counted as retry loops and the numbers stop meaning anything'),
]

original = CHECK.read_text()
caught = 0
with tempfile.TemporaryDirectory(prefix='mutate-push-lands-') as td:
    COPY = pathlib.Path(td) / CHECK.name
    SELF = [sys.executable, str(COPY), '--self-test']
    COPY.write_text(original)
    # POSITIVE CONTROL: the unmutated copy must pass, or "caught" below could mean only that the copy cannot run.
    if subprocess.run(SELF, capture_output=True).returncode != 0:
        print('FAIL — the UNMUTATED copy is red, so no verdict below would be about the mutation.'); sys.exit(1)
    print('positive control: the unmutated copy passes\n')
    for name, anchor, repl, why in MUTATIONS:
        hits = original.count(anchor)
        if hits != 1:
            print(f'FAIL       {name}\n            anchor matched {hits} times, expected 1 — NOTHING MUTATED.')
            continue
        COPY.write_text(original.replace(anchor, repl))
        if COPY.read_text() == original:
            print(f'FAIL       {name}\n            file unchanged — NOTHING MUTATED.')
            continue
        red = subprocess.run(SELF, capture_output=True).returncode != 0
        print(f'{"CAUGHT    " if red else "NOT CAUGHT"} {name}\n            ({why})')
        caught += 1 if red else 0

print(f'\n{caught} of {len(MUTATIONS)} mutations caught.')
print('COVERAGE: the three pure predicates via --self-test. It does NOT re-run the')
print('live repo scan, the YAML parse, or the unreadable-workflow path.')
sys.exit(0 if caught == len(MUTATIONS) else 1)
