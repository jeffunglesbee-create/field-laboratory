#!/usr/bin/env python3
"""Rule 90 for check-patent-watch.py: the check must go red when the WATCHER regresses.

A regression check that has only ever been green proves nothing about the regressions it
was written for. This breaks jubilant-bassoon's .github/scripts/patent_watch.py one clause
at a time, on a COPY in a temporary directory (the client checkout is never touched, so an
interrupted run leaves nothing mutated), and runs the named scenarios of
scripts/check-patent-watch.py against the copy. Every mutation must turn them red.

The second list breaks scripts/patent-watch-rehearsal.py, the tool that runs the watcher on
the real host, the same way: a copy of the check and its stand-in beside a mutated copy of the
tool, and the `rehearsal` scenario against it.

Each mutation asserts its anchor matches exactly once; "NOT CAUGHT" with nothing mutated
would be worse than no test. The scenarios listed are the ones that are SUPPOSED to catch
the mutation: a mutation caught only by an unrelated scenario would not be evidence about
the clause it breaks.

Usage (repository root):
  python3 scripts/mutate-patent-watch.py [--watcher PATH] [--jobs N]
"""
import argparse
import concurrent.futures
import pathlib
import shutil
import subprocess
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
CHECK = HERE / "check-patent-watch.py"
DEFAULT_WATCHER = ".client-src/.github/scripts/patent_watch.py"

# (name, anchor, replacement, scenarios that must catch it, what going unnoticed would mean)
MUTATIONS = [
    ("W01 the publication Thursday is Tuesday + 2 again", "    return tuesday - timedelta(days=5)", "    return tuesday + timedelta(days=2)",
     ["happy", "pure_functions"], "the Wednesday run asks for a Thursday that has not happened"),
    ("W02 a missing watchlist reads as empty", '        raise Unread(f"no watchlist at {WATCHLIST_PATH}")', "        return []",
     ["watchlist"], "a deleted watchlist is a clean week"),
    ("W03 an empty watchlist is tolerated", "    if not terms:\n", "    if False:\n",
     ["watchlist"], "a watchlist of comments reads nothing and reports it"),
    ("W04 a double quote in a term is allowed", "        if '\"' in t or any(ord(c) < 32 for c in t):", "        if False:",
     ["watchlist"], "a term can rewrite the query"),
    ("W05 duplicate terms are queried twice", "        if t.lower() not in seen:\n            seen.add(t.lower())\n            terms.append(t)", "        terms.append(t)",
     ["watchlist"], "the same query is paid for repeatedly"),
    ("W06 a 429 is not retried", "            attempt += 1\n            if attempt > RETRIES:", "            attempt += 1\n            if True:",
     ["host_recovers"], "one rate limit turns the whole week red"),
    ("W07 a 500 is not retried", "if r.status_code in (429, 500, 502, 503, 504):", "if r.status_code in (429, 502, 503, 504):",
     ["host_recovers"], "one transient 500 turns the whole week red"),
    ("W08 the numFound relation is dropped", "    if nf != want:", "    if False:",
     ["host_fam_off", "host_page_cap_1"], "a silent cap on the page, or a counter that changed meaning, becomes a short list"),
    ("W09 the totalResults relation is dropped", '    if res.get("totalResults") != len(docs):', "    if False:",
     ["host_total_is_total"], "reading totalResults as a total goes unnoticed"),
    ("W10 the documents >= families relation is dropped", "    if len(docs) < nf:", "    if False:",
     ["host_docs_short"], "a page that lost documents passes"),
    ("W11 a document without a guid is accepted", '        if not isinstance(d, dict) or not isinstance(d.get("guid"), str) or not d["guid"]:', "        if False:",
     ["host_no_guid"], "hits are collapsed under a None key"),
    ("W12 the host's own error field is ignored", '    if res.get("error"):', "    if False:",
     ["host_error_field"], "an answer the host calls an error is read as a result"),
    ("W13 an answer that is not an object is accepted", "    if not isinstance(res, dict):", "    if False:",
     ["host_json_list"], "a list answer crashes with a traceback instead of a reason"),
    ("W14 missing counters are accepted", '        if not isinstance(v, int) or isinstance(v, bool):', "        if False:",
     ["host_bare_patents", "host_no_families"], "a completeness test with nothing to stand on is skipped"),
    ("W15 an answer larger than MAX_FAMILIES is read anyway", "            if fam > MAX_FAMILIES:", "            if False:",
     ["too_many"], "a term that matches a whole day is read page after page"),
    ("W16 only the first page is read", "        start += PAGE\n        if start >= fam:\n            break", "        break",
     ["paginates"], "the 101st family of a term is never seen"),
    ("W17 a document dated another day is accepted", '            if str(d.get("datePublished") or "")[:10] != day_iso:', "            if False:",
     ["date_loose"], "a date form that returns other days fills the week with strays"),
    ("W18 the known-answer controls do not check the answer", "        if guid not in got:", "        if False:",
     ["controls_missing", "syntax_changed"], "a form that answers zero documents reads as a quiet week"),
    ("W19 a control may return documents of another day", "        if day_iso and any(", "        if False and any(",
     ["date_loose"], "a date form that adds days passes the control"),
    ("W20 the day-population floor is dropped", "    if fam < MIN_DAY_FAMILIES:", "    if False:",
     ["day_not_indexed"], "a day that is not published or indexed yet reads as a week with no hits"),
    ("W21 the text answer need not contain the assignee answer", "        if missing:", "        if False:",
     ["host_phrase_lossy"], "one of the two readings can be wrong and nobody is told"),
    ("W22 every hit is tagged assignee", '        by_assignee = "assignee" in h["channels"] or any(t.lower() in actors.lower() for t in h["terms"])', "        by_assignee = True",
     ["happy"], "a patent that only mentions a term is reported as the term's patent"),
    ("W23 the applicant is not part of a document's actors", '    for key in ("assigneeName", "applicantName"):', '    for key in ("assigneeName",):',
     ["happy"], "a publication whose applicant is the term is tagged as a mere mention"),
    ("W24 any grant is chained, design patents included", '    return re.fullmatch(r"US-\\d+-B\\d", guid) is not None', "    return True",
     ["happy", "pure_functions"], "patent-fulltext.yml is handed numbers it cannot fetch"),
    ("W25 the chain cap is gone", "    GRANT_HITS_LIMIT = 20", "    GRANT_HITS_LIMIT = 100000",
     ["paginates"], "one busy week starts a hundred follow-up runs"),
    ("W26 a failed issue is ignored", "    if not r.ok:\n", "    if False:\n",
     ["issues"], "the owner never hears of the hits and the manifest says the week is done"),
    ("W27 hits with no token are fine under Actions", "        if in_actions:\n", "        if False:\n",
     ["issues"], "the same, when the secret is missing"),
    ("W28 'scanned' reports no families", '"families_on_day": fam_day', '"families_on_day": 0',
     ["happy", "no_hits"], "the manifest no longer says what was read"),
    ("W29 'scanned' counts one query per term", '"queries": 2 * len(watchlist)', '"queries": len(watchlist)',
     ["happy"], "the manifest misstates how much was asked"),
    ("W30 a WEEK_OVERRIDE that is not a Tuesday is accepted", "        if tue.weekday() != 1:", "        if False:",
     ["override_not_tuesday"], "a Thursday is read as a grant day and found empty"),
    ("W31 the time budget is not enforced", "        if time.monotonic() - self.t0 > DEADLINE_S:", "        if False:",
     ["deadline"], "a stuck run is stopped only by the job timeout"),
    ("W32 Unread ends the run green", "        report_failure(str(e))\n        return 1", "        report_failure(str(e))\n        return 0",
     ["host_http500", "host_html", "watchlist", "day_not_indexed"], "THE original defect: a week not read is a green run"),
    ("W33 a week with no hits files an empty issue", "    if not matches:\n        return\n", "    if False:\n        return\n",
     ["no_hits"], "every quiet week sends a phone notification"),
    ("W34 the issue is not labelled", '                "labels": ["patent-watch"],', '                "labels": [],',
     ["happy"], "the issue filter the owner uses misses it"),
    ("W35 the issue is not assigned to the owner", '                "assignees": [repo.split("/")[0]],', '                "assignees": [],',
     ["happy"], "no mobile push"),
    ("W36 a term found by both queries is listed twice", '                if term not in h["terms"]:', "                if True:",
     ["happy"], "the manifest repeats itself"),
    ("W37 the failure summary is not written", '            with open(summary, "a") as f:\n                f.write(f"## Patent watch: NOT READ', '            with open(os.devnull, "a") as f:\n                f.write(f"## Patent watch: NOT READ',
     ["host_http500"], "the red run's page says nothing"),
    ("W38 the failure is not announced in the log", '    print(f"\\nNOT READ: {msg}")', '    print(f"\\nnote: {msg}")',
     ["host_http500"], "the red run's log says nothing in the words the dead-cron reading looks for"),
]


REHEARSAL = HERE / "patent-watch-rehearsal.py"
# (name, anchor, replacement, what going unnoticed would mean)
REHEARSAL_MUTATIONS = [
    ("R01 a manifest left from an older run is not deleted first", "    manifest_path.unlink(missing_ok=True)\n", "",
     "an old reading, such as the false 2026-10-27 manifest, is reported as this run's"),
    ("R02 the Actions environment reaches the watcher",
     'REMOVED = ("GITHUB_ACTIONS", "GH_TOKEN", "GH_REPO", "GITHUB_OUTPUT", "GITHUB_API_URL", "WEEK_OVERRIDE")', 'REMOVED = ("WEEK_OVERRIDE",)',
     "a rehearsal files issues, assigns the owner and chains patent-fulltext"),
    ("R03 the upcoming week decides the exit", '    return 0 if results[0][1]["code"] == 0 else 1', '    return 0 if all(r["code"] == 0 for _, r in results) else 1',
     "a Tuesday that is not indexed yet turns the rehearsal red"),
    ("R04 the exit ignores the settled week", '    return 0 if results[0][1]["code"] == 0 else 1', "    return 0",
     "a watcher that cannot read a settled week passes its rehearsal"),
    ("R05 a missing watcher is not reported", "    if not (client / WATCHER).exists():", "    if False:",
     "a wrong --client path reads as a watcher that failed"),
    ("R06 the evidence file holds no logs or manifests", "    path.write_text(render(results, client, stamp))", '    path.write_text("# empty\\n")',
     "the run leaves nothing to read afterwards"),
]


def run_check(check_args, watcher, script=CHECK):
    p = subprocess.run([sys.executable, str(script), "--watcher", str(watcher)] + check_args,
                       capture_output=True, text=True, timeout=1500)
    return p.returncode, p.stdout


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--watcher", default=DEFAULT_WATCHER)
    ap.add_argument("--jobs", type=int, default=2)
    args = ap.parse_args()
    src = pathlib.Path(args.watcher).resolve()
    if not src.exists():
        print(f"FAIL: no watcher at {src}")
        return 1
    original = src.read_text()
    rehearsal_src = REHEARSAL.read_text()
    scenarios = sorted({s for m in MUTATIONS for s in m[3]} | {"rehearsal"})
    with tempfile.TemporaryDirectory() as td:
        td = pathlib.Path(td)
        base = td / "base.py"
        shutil.copy(src, base)
        code, out = run_check(["--only", ",".join(scenarios)], base)
        if code != 0:
            print("FAIL: the check is already red on the clean watcher for the scenarios used here.")
            print(out[-1500:])
            return 1
        print(f"baseline: {len(scenarios)} scenarios green on the clean watcher\n")

        # Each job: (name, why, scenarios, runner). A runner is None when its anchor did not match.
        jobs = []
        for i, (name, anchor, repl, scn, why) in enumerate(MUTATIONS):
            hits = original.count(anchor)
            if hits != 1 or original.replace(anchor, repl) == original:
                print(f"FAIL       {name}\n            anchor matched {hits} times, expected 1 -- NOTHING MUTATED.")
                jobs.append((name, why, scn, None))
                continue
            path = td / f"m{i:02d}.py"
            path.write_text(original.replace(anchor, repl))
            jobs.append((name, why, scn, lambda path=path, scn=scn: run_check(["--only", ",".join(scn)], path)))
        for i, (name, anchor, repl, why) in enumerate(REHEARSAL_MUTATIONS):
            hits = rehearsal_src.count(anchor)
            if hits != 1 or rehearsal_src.replace(anchor, repl) == rehearsal_src:
                print(f"FAIL       {name}\n            anchor matched {hits} times, expected 1 -- NOTHING MUTATED.")
                jobs.append((name, why, ["rehearsal"], None))
                continue
            d = td / f"r{i:02d}"
            d.mkdir()
            shutil.copy(CHECK, d)
            shutil.copy(HERE / "ppubs_stand_in.py", d)
            (d / REHEARSAL.name).write_text(rehearsal_src.replace(anchor, repl))
            jobs.append((name, why, ["rehearsal"], lambda d=d: run_check(["--only", "rehearsal"], base, d / CHECK.name)))

        def one(job):
            run = job[3]
            if run is None:
                return None
            try:
                return run()[0] != 0
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
    print(f"\n{caught} of {len(jobs)} mutations caught ({len(MUTATIONS)} of the watcher, {len(REHEARSAL_MUTATIONS)} of the rehearsal tool).")
    print("COVERAGE: the failure paths, the counter contract, the controls, pagination, tagging, the chain and the issue;")
    print("for the rehearsal tool, the stale-manifest guard, the stripped environment, the exit rule and the evidence file.")
    print("It does NOT cover the 3 s pacing between calls (a real-host property: 169 calls, 0 rate-limit events), the")
    print("Retry-After parsing (the test uses 0), the 401/403 session renewal, or the prime request.")
    return 0 if caught == len(jobs) else 1


if __name__ == "__main__":
    sys.exit(main())
