#!/usr/bin/env python3
"""Run jubilant-bassoon's patent watcher against the REAL PPUBS host, file nothing, keep what it printed.

WHY. scripts/check-patent-watch.py runs the watcher against a stand-in whose answers were copied from
the real host. It cannot say the host still answers that way today, and the first scheduled run
(Wednesday 16:00Z) would be the first time the watcher's own flow meets the host: five known-answer
controls, 2 x 15 x 2 queries at 3 s between calls, and a Tuesday that may not be indexed yet. A red run
is the right outcome for a week that was not read; it is a wasted one if a rehearsal could have said so
days earlier.

WHAT. For each Tuesday given it runs <client>/.github/scripts/patent_watch.py the way the workflow does
(WEEK_OVERRIDE set, working directory = the client checkout) with GITHUB_ACTIONS, GH_TOKEN, GH_REPO,
GITHUB_OUTPUT and GITHUB_API_URL REMOVED from its environment: no issue can be filed and nothing is chained
(the watcher's own developer-machine branch: hits are printed, issue creation skipped). Then it writes
<out>/patent-watch-rehearsal-<UTC>.md with each week's log and manifest.

EXIT. 0 when the --settled week was read completely. --upcoming (the Tuesday the next scheduled run reads)
is reported and does not decide: whether a day is indexed yet is a fact about the host at that hour, and
the watcher is right to refuse it. Both weeks always run.

A manifest that existed before a run is deleted first. The client's outbox can hold a manifest from an
older run (it held a false one for 2026-10-27), and reporting that as this run's reading would be the
original defect again.

Usage (repository root; stdlib only, the watcher needs `requests`):
  python3 scripts/patent-watch-rehearsal.py --client .client-src --settled 2026-10-27 [--upcoming 2026-11-03] [--out outbox]
"""
import argparse
import datetime
import json
import os
import pathlib
import subprocess
import sys
import time

WATCHER = pathlib.Path(".github/scripts/patent_watch.py")
REMOVED = ("GITHUB_ACTIONS", "GH_TOKEN", "GH_REPO", "GITHUB_OUTPUT", "GITHUB_API_URL", "WEEK_OVERRIDE")


def rehearse(client, week):
    """One week through the watcher. -> {week, code, seconds, log, manifest}."""
    manifest_path = client / "outbox" / "patents" / f"watch-{week}.json"
    manifest_path.unlink(missing_ok=True)
    env = {k: v for k, v in os.environ.items() if k not in REMOVED}
    env.update(WEEK_OVERRIDE=week, PYTHONDONTWRITEBYTECODE="1")
    t0 = time.monotonic()
    p = subprocess.Popen([sys.executable, str(WATCHER)], cwd=client, env=env,
                         stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
    lines = []
    for line in p.stdout:
        print(line, end="", flush=True)
        lines.append(line)
    code = p.wait()
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else None
    return {"week": week, "code": code, "seconds": round(time.monotonic() - t0), "log": "".join(lines), "manifest": manifest}


def row(label, r):
    m = r["manifest"] or {}
    sc = m.get("scanned") or {}
    matches = m.get("matches") or []
    by = {b: sum(1 for x in matches if x["basis"] == b) for b in ("assignee", "text")}
    return (f"| {label} | {r['week']} | {m.get('week_thursday', '-')} | {'read' if r['code'] == 0 else 'NOT READ'} | {r['seconds']} s "
            f"| {m.get('read_complete', '-')} | {sc.get('grants', {}).get('families_on_day', '-')} "
            f"| {sc.get('applications', {}).get('families_on_day', '-')} "
            f"| {len(matches) if m else '-'} ({by['assignee']} assignee, {by['text']} text) |")


def render(results, client, stamp):
    try:
        sha = subprocess.run(["git", "-C", str(client), "rev-parse", "HEAD"], capture_output=True, text=True, timeout=20).stdout.strip() or "unknown"
    except (OSError, subprocess.SubprocessError):
        sha = "unknown"
    env = os.environ
    run = "/".join([env["GITHUB_SERVER_URL"], env["GITHUB_REPOSITORY"], "actions/runs", env["GITHUB_RUN_ID"]]) \
        if all(env.get(k) for k in ("GITHUB_SERVER_URL", "GITHUB_REPOSITORY", "GITHUB_RUN_ID")) else "not run in Actions"
    out = [
        f"# Patent watch rehearsal, {stamp}", "",
        "The client's watcher, run unmodified against the real PPUBS host with no token: nothing filed, nothing chained.",
        f"Client commit read: `{sha}`. Run: {run}.", "",
        "| week | Tuesday | Thursday | result | time | read_complete | grant day families | pub day families | matches |",
        "|---|---|---|---|---|---|---|---|---|",
    ]
    out += [row(label, r) for label, r in results]
    for label, r in results:
        out += ["", f"## {label}: {r['week']}, exit {r['code']}", "", "### Log", "", "```", r["log"].rstrip(), "```"]
        if r["manifest"]:
            out += ["", "### Manifest", "", "```json", json.dumps(r["manifest"], indent=2), "```"]
        else:
            out += ["", "No manifest was written for this week."]
    return "\n".join(out) + "\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--client", required=True)
    ap.add_argument("--settled", required=True, help="a grant Tuesday that is fully published; its read decides the exit code")
    ap.add_argument("--upcoming", help="the Tuesday the next scheduled run reads; reported only")
    ap.add_argument("--out", default="outbox")
    a = ap.parse_args()
    client = pathlib.Path(a.client).resolve()
    if not (client / WATCHER).exists():
        print(f"FAIL: no watcher at {client / WATCHER}")
        return 1
    results = [("settled week", rehearse(client, a.settled))]
    if a.upcoming:
        results.append(("upcoming week", rehearse(client, a.upcoming)))
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out = pathlib.Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    path = out / f"patent-watch-rehearsal-{stamp}.md"
    path.write_text(render(results, client, stamp))
    print(f"\nWrote {path}\n")
    print("\n".join(l for l in path.read_text().splitlines() if l.startswith("| ")))
    return 0 if results[0][1]["code"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
