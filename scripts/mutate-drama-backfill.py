#!/usr/bin/env python3
"""Rule 90 for check-drama-backfill.py: the check must go red when drama-backfill.mjs regresses.

A regression check that has only ever been green proves nothing about the regressions it was written for.
This breaks field-relay-nba's scripts/drama-backfill.mjs one clause at a time, on a COPY in a temporary tree
(src/ is linked, never copied, and the relay checkout is never touched, so an interrupted run leaves nothing
mutated), and runs the named scenarios of scripts/check-drama-backfill.py against the copy. Every mutation
must turn them red.

Each mutation asserts its anchor matches exactly once; "NOT CAUGHT" with nothing mutated would be worse than
no test. The scenarios listed are the ones that are SUPPOSED to catch the mutation.

The second list breaks scripts/reset-drama-refused-read.mjs (the one-shot that resets the 10-31 row through the
relay's /d1/execute) the same way, against the `reset_row` scenario.

Usage (repository root):
  python3 scripts/mutate-drama-backfill.py [--script PATH] [--reset-script PATH] [--jobs N]
"""
import argparse
import concurrent.futures
import pathlib
import subprocess
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
CHECK = HERE / "check-drama-backfill.py"
DEFAULT_SCRIPT = ".relay-src/scripts/drama-backfill.mjs"
DEFAULT_RESET = ".relay-src/scripts/reset-drama-refused-read.mjs"

# (name, anchor, replacement, scenarios that must catch it, what going unnoticed would mean)
MUTATIONS = [
    ("D01 every failed read is stored as 0 again", "if (err instanceof EspnStatusError && ESPN_EVENT_ABSENT.has(err.status)) {", "if (true) {",
     ["refused_read", "next_run_scores_it"], "the 10-31 defect: a refusal becomes a permanent 0 behind the IS NULL guard"),
    ("D02 a 403 counts as the event being absent", "new Set([404, 410])", "new Set([404, 410, 403])",
     ["refused_read", "next_run_scores_it"], "ESPN's edge refusing us is stored as a measurement"),
    ("D03 a 429 counts as the event being absent", "new Set([404, 410])", "new Set([404, 410, 429])",
     ["refused_read"], "a rate limit is stored as a measurement"),
    ("D04 a 5xx counts as the event being absent", "new Set([404, 410])", "new Set([404, 410, 500, 503])",
     ["refused_read"], "an ESPN outage is stored as a measurement"),
    ("D05 a 404 is no longer absent", "new Set([404, 410])", "new Set([410])",
     ["absent_event"], "a game ESPN does not have is retried every two hours forever"),
    ("D06 a 410 is no longer absent", "new Set([404, 410])", "new Set([404])",
     ["absent_event"], "a game ESPN no longer has is retried every two hours forever"),
    ("D07 a deferred game is not remembered", "        } else {\n          deferred.add(game.id);\n", "        } else {\n",
     ["refused_read", "all_deferred"], "the loop refetches a NULL row in every batch"),
    ("D08 the deferred filter is ignored", "const fresh = games.filter(g => !deferred.has(g.id));", "const fresh = games;",
     ["refused_read", "all_deferred"], "a refused game is fetched again in every batch of the run"),
    ("D09 a batch of only deferred games does not stop the loop", "    if (fresh.length === 0) {\n      console.log(`Batch ${batchNum}: ${games.length} games, all deferred", "    if (false) {\n      console.log(`Batch ${batchNum}: ${games.length} games, all deferred",
     ["all_deferred"], "the run spins through all 30 batches on a list that cannot shrink"),
    ("D10 a failure is no longer counted as an error", "        totalErrors++;\n        totalProcessed++;\n      }\n\n      await sleep(DELAY_MS);", "        totalProcessed++;\n      }\n\n      await sleep(DELAY_MS);",
     ["refused_read", "absent_event", "all_deferred", "refused_write"], "a run that could not read a game ends green"),
    ("D11 the soccer reader drops the status", "throw new EspnStatusError(`ESPN soccer ${res.status} for event ${espnEventId} (${leagueSlug})`, res.status);", "throw new Error(`ESPN soccer ${res.status} for event ${espnEventId} (${leagueSlug})`);",
     ["absent_event"], "a soccer event ESPN does not have is never marked"),
    ("D12 the MLB reader drops the status", "throw new EspnStatusError(`ESPN MLB ${res.status} for event ${espnEventId}`, res.status);", "throw new Error(`ESPN MLB ${res.status} for event ${espnEventId}`);",
     ["absent_event"], "an MLB event ESPN does not have is never marked"),
    ("D13 the WNBA reader drops the status", "throw new EspnStatusError(`ESPN WNBA ${res.status} for event ${espnEventId}`, res.status);", "throw new Error(`ESPN WNBA ${res.status} for event ${espnEventId}`);",
     ["absent_event"], "a WNBA event ESPN does not have is never marked"),
    ("D14 a refused 0 write is forgotten", "            deferred.add(game.id);\n            console.error(`  [deferred] ${label}: the 0 was not stored", "            console.error(`  [deferred] ${label}: the 0 was not stored",
     ["refused_write"], "a game whose mark the relay refused is refetched in every batch"),
    ("D15 a failed score write is swallowed", "          await writeGameDrama(game.id, peak, arc);\n          console.log(`  [ok]", "          await writeGameDrama(game.id, peak, arc).catch(() => {});\n          console.log(`  [ok]",
     ["refused_write"], "a score the relay refused is reported as written"),
]

# (name, anchor, replacement, what going unnoticed would mean)
RESET_MUTATIONS = [
    ("R01 the row is reset whatever it holds", "if (row.drama_peak !== 0 || row.drama_arc !== 'null' || row.espn_event_id !== EVENT) {", "if (false) {",
     "a real score on that row is wiped"),
    ("R02 the reset does not need ESPN to have key events", "if (keyEvents === 0) throw new Error(", "if (false) throw new Error(",
     "a reset that the next backfill run cannot score is done anyway"),
    ("R03 the number of rows changed is not checked", "if (changes !== 1) throw new Error(", "if (false) throw new Error(",
     "an update that touched two rows is reported as done"),
    ("R04 the row is not read back", "if (after.length !== 1 || after[0].drama_peak !== null || after[0].drama_arc !== null) {", "if (false) {",
     "a reset the database did not apply is reported as done"),
]


def run_check(script, scenarios, reset=None):
    cmd = [sys.executable, str(CHECK), "--script", str(script), "--only", ",".join(scenarios)]
    if reset is not None:
        cmd += ["--reset-script", str(reset)]
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=400,
                       env={"PATH": __import__("os").environ["PATH"], "PYTHONDONTWRITEBYTECODE": "1"})
    return p.returncode, p.stdout + p.stderr


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--script", default=DEFAULT_SCRIPT)
    ap.add_argument("--reset-script", default=DEFAULT_RESET)
    ap.add_argument("--jobs", type=int, default=3)
    args = ap.parse_args()
    src = pathlib.Path(args.script).resolve()
    if not src.exists():
        print(f"FAIL: no script at {src}")
        return 1
    reset_src = pathlib.Path(args.reset_script).resolve()
    if not reset_src.exists():
        print(f"FAIL: no reset script at {reset_src}")
        return 1
    original = src.read_text()
    reset_original = reset_src.read_text()
    relay_src = src.parent.parent / "src"
    scenarios = sorted({s for m in MUTATIONS for s in m[3]})
    with tempfile.TemporaryDirectory() as td:
        td = pathlib.Path(td)

        def tree(name, text):
            d = td / name
            (d / "scripts").mkdir(parents=True)
            (d / "src").symlink_to(relay_src, target_is_directory=True)
            (d / "scripts" / "drama-backfill.mjs").write_text(text)
            return d / "scripts" / "drama-backfill.mjs"

        base_tree = tree("base", original)
        code, out = run_check(base_tree, scenarios + ["reset_row"], reset_src)
        if code != 0:
            print("FAIL: the check is already red on the clean scripts for the scenarios used here.")
            print(out[-1500:])
            return 1
        print(f"baseline: {len(scenarios) + 1} scenarios green on the clean scripts\n")

        jobs = []
        for i, (name, anchor, repl, scn, why) in enumerate(MUTATIONS):
            hits = original.count(anchor)
            if hits != 1 or original.replace(anchor, repl) == original:
                print(f"FAIL       {name}\n            anchor matched {hits} times, expected 1 -- NOTHING MUTATED.")
                jobs.append((name, why, scn, None))
                continue
            path = tree(f"m{i:02d}", original.replace(anchor, repl))
            jobs.append((name, why, scn, lambda path=path, scn=scn: run_check(path, scn)))

        for i, (name, anchor, repl, why) in enumerate(RESET_MUTATIONS):
            hits = reset_original.count(anchor)
            if hits != 1 or reset_original.replace(anchor, repl) == reset_original:
                print(f"FAIL       {name}\n            anchor matched {hits} times, expected 1 -- NOTHING MUTATED.")
                jobs.append((name, why, ["reset_row"], None))
                continue
            d = td / f"r{i:02d}"
            d.mkdir()
            mutated = d / "reset-drama-refused-read.mjs"
            mutated.write_text(reset_original.replace(anchor, repl))
            jobs.append((name, why, ["reset_row"], lambda mutated=mutated: run_check(base_tree, ["reset_row"], mutated)))

        def one(job):
            if job[3] is None:
                return None
            try:
                return job[3]()[0] != 0
            except subprocess.TimeoutExpired:
                return True  # a check that hangs on a regression is red, if slowly

        with concurrent.futures.ThreadPoolExecutor(max_workers=args.jobs) as ex:
            results = list(ex.map(one, jobs))

    caught = 0
    for (name, why, scn, _), red in zip(jobs, results):
        if red is None:
            continue
        print(f'{"CAUGHT    " if red else "NOT CAUGHT"} {name}\n            ({why}; by {", ".join(scn)})')
        caught += 1 if red else 0
    print(f"\n{caught} of {len(jobs)} mutations caught ({len(MUTATIONS)} of the backfill, {len(RESET_MUTATIONS)} of the reset).")
    print("COVERAGE: which failures are stored and which are retried, the loop's end, the error count, each reader's status,")
    print("and the two writes. It does NOT cover the AFL reader (it fetches ESPN directly), the FIFA-ranking lookup,")
    print("or the recompute posts' headers.")
    return 0 if caught == len(jobs) else 1


if __name__ == "__main__":
    sys.exit(main())
