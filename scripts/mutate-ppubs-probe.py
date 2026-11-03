#!/usr/bin/env python3
"""Rule 90 for probe-ppubs-query.py: its self-test must go red when the verdict logic is damaged.

The probe exists to say "this query form reads the week" or "it does not", and a probe
whose verdict cannot be made to fail is worse than none. This breaks the checks added
for the response counters (search_contract, the date-total and page-size phases, the
sweep that decides `ok`) one at a time and runs `--self-test` on each broken copy.

It works on COPIES in a temporary directory, never on the tracked file, so an
interrupted run cannot leave the probe mutated. Each mutation asserts its anchor
matches exactly once; "NOT CAUGHT" with nothing mutated would be worse than no test.

Run from the repository root:  python3 scripts/mutate-ppubs-probe.py
"""
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile

SCRIPTS = pathlib.Path(__file__).resolve().parent
PROBE = SCRIPTS / "probe-ppubs-query.py"
STAND_IN = SCRIPTS / "ppubs_stand_in.py"

CONTRACT_HEAD = '    sc = (e.get("search") or {}).get("scalars")\n    if not sc or "numFound" not in sc:\n        return None\n    n, start'
R3_PASS = 'e["pass"] = isinstance(n, int) and n >= MIN_TOTAL and search_contract(e) == []'
R6_PASS = 'e["pass"] = e["n_docs"] >= min(100, MIN_TOTAL) and search_contract(e) == []'

# (name, anchor, replacement, what going unnoticed would mean)
MUTATIONS = [
    ("C1 search_contract never reports a violation", CONTRACT_HEAD,
     CONTRACT_HEAD.replace("    n, start", "    return []\n    n, start"),
     "every counter relation is unchecked and a host that lies about its counts passes"),
    ("C2 the numFound relation is dropped", '    if sc.get("numFound") != want:', "    if False:",
     "a silent cap on the page, and a wrong family total, both pass"),
    ("C3 the totalResults relation is dropped", '    if sc.get("totalResults") != e.get("n_docs"):', "    if False:",
     "reading totalResults as a total, the mistake the first version made, passes"),
    ("C4 the documents >= numFound relation is dropped", '    if e.get("n_docs", 0) < (sc.get("numFound") or 0):', "    if False:",
     "a page that lost documents passes"),
    ("C5 the counts-vs-families relation is dropped", "    if isinstance(cn, int) and fam > cn:", "    if False:",
     "a counts call that reports fewer documents than the search has families passes"),
    ("C6 the date-total floor is removed", R3_PASS, "e[\"pass\"] = isinstance(n, int) and search_contract(e) == []",
     "a day with a handful of documents reads as a whole day, so a query that did not read it passes"),
    ("C7 an unparsed response counts as a clean contract", R3_PASS,
     'e["pass"] = isinstance(n, int) and n >= MIN_TOTAL and not search_contract(e)',
     "a host that answers only the patents list passes the date totals"),
    ("C8 the page-size verdict is forced true", 'report["meta"]["page_size_pass"] = bool(p6) and size_ok',
     'report["meta"]["page_size_pass"] = True', "a host that caps the page passes"),
    ("C9 the page-size floor is removed", R6_PASS, 'e["pass"] = search_contract(e) == []',
     "an empty day-sized page is consistent with itself and passes"),
    ("C10 violations found by the sweep do not decide ok",
     'and report["meta"]["page_size_pass"] and not violations', 'and report["meta"]["page_size_pass"]',
     "counters that break only on some queries pass"),
    ("C11 a missing numberOfFamilies is tolerated",
     '        return ["numberOfFamilies is missing or not an integer"]', "        return []",
     "the watcher's completeness test has nothing to stand on and nobody is told"),
    ("C12 the page-size phase ignores the contract", R6_PASS, 'e["pass"] = e["n_docs"] >= min(100, MIN_TOTAL)',
     "a cap above the floor passes the page-size call"),
    ("C13 the date-total phase ignores the contract", R3_PASS, 'e["pass"] = isinstance(n, int) and n >= MIN_TOTAL',
     "wrong counters on the day totals pass"),
    ("C14 the weekly families column reads documents",
     '"docs": e["n_docs"], "families": e["families"]}', '"docs": e["n_docs"], "families": e["n_docs"]}',
     "the report shows a family with two members as two families"),
]


def self_test(directory):
    env = dict(os.environ, PYTHONDONTWRITEBYTECODE="1")
    return subprocess.run([sys.executable, str(pathlib.Path(directory) / PROBE.name), "--self-test"],
                          capture_output=True, text=True, env=env, timeout=300)


def main():
    probe = PROBE.read_text()
    with tempfile.TemporaryDirectory() as td:
        shutil.copy(STAND_IN, td)
        shutil.copy(PROBE, td)
        base = self_test(td)
        if base.returncode != 0:
            print(f"FAIL — {PROBE.name} --self-test is already red on clean source.")
            return 1
        print(f"baseline: {PROBE.name} --self-test passes on clean source\n")
        caught = 0
        for name, anchor, repl, why in MUTATIONS:
            hits = probe.count(anchor)
            if hits != 1:
                print(f"FAIL       {name}\n            anchor matched {hits} times, expected 1 — NOTHING MUTATED.")
                continue
            mutated = probe.replace(anchor, repl)
            if mutated == probe:
                print(f"FAIL       {name}\n            file unchanged — NOTHING MUTATED.")
                continue
            (pathlib.Path(td) / PROBE.name).write_text(mutated)
            red = self_test(td).returncode != 0
            print(f'{"CAUGHT    " if red else "NOT CAUGHT"} {name}\n            ({why})')
            caught += 1 if red else 0
        (pathlib.Path(td) / PROBE.name).write_text(probe)
    print(f"\n{caught} of {len(MUTATIONS)} mutations caught.")
    print("COVERAGE: the counter contract, the date-total and page-size phases and the sweep that decides ok.")
    print("It does NOT mutate the query forms, the 429 backoff or the OR-versus-union comparison; those were")
    print("mutation-tested inline when written and that harness was not committed.")
    return 0 if caught == len(MUTATIONS) else 1


if __name__ == "__main__":
    sys.exit(main())
