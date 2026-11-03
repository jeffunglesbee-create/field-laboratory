#!/usr/bin/env python3
"""Regression check for jubilant-bassoon's .github/scripts/patent_watch.py.

WHAT IT HOLDS. The weekly watcher read bulkdata.uspto.gov, whose DNS record is gone,
printed "0 matches" and exited 0, and the run committed a manifest saying no watchlist
assignee had a patent that week (client run 41574599866, 2026-11-03). The dead-cron
watch would then have read the first scheduled "success" as a working job. This check
runs the watcher UNMODIFIED against scripts/ppubs_stand_in.py, a local copy of the
anonymous half of ppubs.uspto.gov whose response shape was measured on the real host
(probe runs 1 and 2, outbox/ppubs-query-probe-*.md), and requires:

  * a week it could not read, in each of 33 cases (the `writes no manifest` assertions of a run), ends non-zero with NO manifest,
    no GITHUB_OUTPUT and "NOT READ" in the log; a zero from a query form the host does
    not understand is not a reading (the known-answer controls and the day floor);
  * a week it read says what it read (families on the day), tags every hit as assignee
    or text, keeps a family's members, reads past the first page, refuses to cut a large
    answer, files one issue per scan that has hits, and chains only utility grants;
  * the publication Thursday is the one BEFORE the grant Tuesday (the old rule named a
    day that had not happened when the Wednesday job ran).

WHAT IT DOES NOT HOLD. It says nothing about the real host: that is the probe's job and
the watcher's own controls, which run on every real run. The stand-in answers the shapes
measured so far; a shape not yet seen is not tested.

Usage (from the repository root):
  python3 scripts/check-patent-watch.py [--watcher PATH] [--real-watchlist PATH] [--only NAME[,NAME]]
  --watcher         default .client-src/.github/scripts/patent_watch.py (verify.yml checks the client out there)
  --real-watchlist  also run the standard week with this watchlist file (the client's own)
  --only            run only the named scenarios (the mutation harness uses this)
"""
import argparse
import datetime
import importlib.util
import json
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import ppubs_stand_in as si  # noqa: E402

DEFAULT_WATCHER = ".client-src/.github/scripts/patent_watch.py"
TUE, THU = "2026-11-03", "2026-10-29"  # the week the first scheduled run reads (Wednesday 2026-11-04)
WATCHLIST = ["Datadog", "Dynatrace LLC", "Sportradar", "LogRocket", "RUWT"]
MISSING = object()

CONTROL_DOCS = [
    si.doc("US-10846193-B2", "USPAT", "2020-11-24", ["Some Co"], "A method"),
    si.doc("US-10328326-B2", "USPAT", "2019-06-25", ["RUWT, LLC"], "RUWT excitement notifier"),
    si.doc("US-20260332641-A1", "US-PGPUB", "2026-10-22", ["Dynatrace LLC"], "Dynatrace LLC agent rum"),
]
G1 = si.doc("US-9900001-B2", "USPAT", TUE, ["Datadog, Inc."], "Tracing spans")
G2 = si.doc("US-9900002-B2", "USPAT", TUE, ["Foo Corp"], "A method that cites Sportradar feeds")
G3 = si.doc("US-D1153227-S", "USPAT", TUE, ["Datadog, Inc."], "Display screen")
A1 = si.doc("US-20260400001-A1", "US-PGPUB", THU, ["Dynatrace LLC"], "Agent a", family="F1")
A2 = si.doc("US-20260400002-A1", "US-PGPUB", THU, ["Dynatrace LLC"], "Agent b", family="F1")
A3 = si.doc("US-20260400003-A1", "US-PGPUB", THU, ["Bar Corp"], "Replay built on LogRocket")
A4 = si.doc("US-20260400004-A1", "US-PGPUB", THU, [], "Dynatrace LLC based agent")  # the term is the APPLICANT, the assignee field is empty
A4["applicantName"] = ["Dynatrace LLC"]
PLANTED = [G1, G2, G3, A1, A2, A3, A4]
EXPECTED = {  # (scan, guid) -> basis
    ("grants", "US-9900001-B2"): "assignee", ("grants", "US-D1153227-S"): "assignee", ("grants", "US-9900002-B2"): "text",
    ("applications", "US-20260400001-A1"): "assignee", ("applications", "US-20260400002-A1"): "assignee",
    ("applications", "US-20260400003-A1"): "text", ("applications", "US-20260400004-A1"): "assignee",
}


def filler(db, day, n=520):
    prefix, kind = ("US-8", "B2") if db == "USPAT" else ("US-2025", "A1")
    return [si.doc(f"{prefix}{i:07d}-{kind}", db, day, [f"Other Co {i}"]) for i in range(n)]


def world(planted=None, controls=True, grants_day=True, apps_day=True, drop=()):
    w = list(CONTROL_DOCS) if controls else []
    if grants_day:
        w += filler("USPAT", TUE)
    if apps_day:
        w += filler("US-PGPUB", THU)
    w += PLANTED if planted is None else planted
    return [d for d in w if d["guid"] not in drop]


class GitHubStub:
    """Receives the issue POSTs."""

    def __init__(self, status=201):
        self.issues, self.status, stub = [], status, self

        class H(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def do_POST(self):
                n = int(self.headers.get("Content-Length") or 0)
                stub.issues.append({"path": self.path, "auth": self.headers.get("Authorization"),
                                    "body": json.loads(self.rfile.read(n) or b"null")})
                ok = stub.status < 300
                raw = json.dumps({"html_url": f"http://stub/issues/{len(stub.issues)}"} if ok else {"message": "stub failure"}).encode()
                self.send_response(stub.status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(raw)))
                self.end_headers()
                self.wfile.write(raw)

        self.srv = ThreadingHTTPServer(("127.0.0.1", 0), H)
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        self.url = f"http://127.0.0.1:{self.srv.server_address[1]}"

    def stop(self):
        self.srv.shutdown()
        self.srv.server_close()


class Result:
    pass


def run_watcher(watcher, corpus, mode="ok", syntax=None, watchlist=WATCHLIST, week=TUE, gh_status=201,
                token=True, actions=True, env=None):
    queries = []
    base, _log, stop = si.serve(corpus, syntax, mode, queries)
    gh = GitHubStub(gh_status)
    td = pathlib.Path(tempfile.mkdtemp())
    try:
        (td / ".github").mkdir()
        if watchlist is not MISSING:
            text = watchlist if isinstance(watchlist, str) else "# test watchlist\n" + "\n".join(watchlist) + "\n"
            (td / ".github" / "patent-watchlist.txt").write_text(text)
        e = {k: v for k, v in os.environ.items()
             if k not in ("GH_TOKEN", "GH_REPO", "GITHUB_ACTIONS", "GITHUB_OUTPUT", "GITHUB_STEP_SUMMARY", "WEEK_OVERRIDE",
                          "GITHUB_API_URL", "PPUBS_DEADLINE")}
        e.update(PPUBS_BASE=base, PPUBS_PAUSE="0", PPUBS_BACKOFF="0", PYTHONDONTWRITEBYTECODE="1",
                 GITHUB_OUTPUT=str(td / "github_output.txt"), GITHUB_STEP_SUMMARY=str(td / "summary.md"))
        if week:
            e["WEEK_OVERRIDE"] = week
        if actions:
            e["GITHUB_ACTIONS"] = "true"
        if token:
            e.update(GH_TOKEN="stub-token", GH_REPO="owner/repo", GITHUB_API_URL=gh.url)
        e.update(env or {})
        p = subprocess.run([sys.executable, str(watcher)], cwd=td, env=e, capture_output=True, text=True, timeout=300)
        r = Result()
        r.code, r.out, r.queries, r.issues = p.returncode, p.stdout + p.stderr, queries, gh.issues
        files = sorted((td / "outbox" / "patents").glob("watch-*.json")) if (td / "outbox" / "patents").exists() else []
        r.files = [f.name for f in files]
        r.manifest = json.loads(files[0].read_text()) if files else None
        r.manifest_bytes = files[0].read_bytes() if files else None
        out = td / "github_output.txt"
        r.outputs = dict(l.split("=", 1) for l in out.read_text().splitlines() if "=" in l) if out.exists() else {}
        r.summary = (td / "summary.md").read_text() if (td / "summary.md").exists() else ""
        return r
    finally:
        stop()
        gh.stop()
        shutil.rmtree(td, ignore_errors=True)


def load_module(watcher):
    spec = importlib.util.spec_from_file_location("patent_watch_under_test", str(watcher))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class Tally:
    def __init__(self):
        self.passed = self.failed = 0

    def __call__(self, name, ok, detail=""):
        if ok:
            self.passed += 1
        else:
            self.failed += 1
        print(f"{'PASS' if ok else 'FAIL'}  {name}" + ("" if ok or not detail else f"\n        -> {str(detail)[-600:]}"))


SCENARIOS = {}


def scenario(fn):
    SCENARIOS[fn.__name__] = fn
    return fn


def matches_by_key(manifest):
    return {(m["scan"], m["guid"]): m["basis"] for m in manifest["matches"]}


def unread(t, label, r, frag=None):
    """The shape of every week that could not be read: red, nothing written, and the log says so.
    `frag` is a piece of the reason the log must give, so a different clause going red first does not pass."""
    t(f"{label}: exits non-zero", r.code != 0, r.out)
    t(f"{label}: writes no manifest", r.files == [] and r.manifest is None, r.files)
    t(f"{label}: writes no GITHUB_OUTPUT, so nothing is chained", r.outputs == {}, r.outputs)
    t(f"{label}: says NOT READ in the log and in the step summary", "NOT READ:" in r.out and "NOT READ" in r.summary, r.out[-400:])
    if frag:
        t(f"{label}: the log gives the reason ({frag!r})", frag in r.out, r.out[-500:])


@scenario
def happy(t, w):
    r = run_watcher(w, world())
    t("happy: a faithful host, exit 0", r.code == 0, r.out)
    m = r.manifest or {}
    t("happy: the manifest says it was read completely, from ppubs, for the right week",
      m.get("read_complete") is True and m.get("source") == "ppubs" and m.get("week_tuesday") == TUE and m.get("week_thursday") == THU, m)
    t("happy: seven matches, each tagged assignee or text as planted", matches_by_key(m) == EXPECTED if m else False, matches_by_key(m) if m else None)
    t("happy: a document whose APPLICANT is the term counts as an assignee hit although the assignee field is empty",
      matches_by_key(m).get(("applications", "US-20260400004-A1")) == "assignee" if m else False)
    t("happy: each match lists each term once, and assignee_match is the first of them",
      all(len(set(x["terms"])) == len(x["terms"]) and x["assignee_match"] == x["terms"][0] for x in m.get("matches") or []) and bool(m.get("matches")))
    t("happy: a family's two members are two matches", {x["guid"] for x in m.get("matches") or []} >= {A1["guid"], A2["guid"]})
    t("happy: the design patent keeps its D number", any(x["patent_id"] == "D1153227" for x in m.get("matches") or []))
    sc = m.get("scanned") or {}
    t("happy: 'scanned' states what was read: the database, the day and the families on it, on both scans",
      sc.get("grants", {}).get("database") == "USPAT" and sc["grants"].get("day") == TUE and sc["grants"].get("families_on_day", 0) >= 500
      and sc.get("applications", {}).get("database") == "US-PGPUB" and sc["applications"].get("day") == THU
      and sc["applications"].get("families_on_day", 0) >= 500 and sc["grants"].get("queries") == 2 * len(WATCHLIST), sc)
    t("happy: all five controls are recorded", len(m.get("controls") or []) == 5, m.get("controls"))
    t("happy: two issues, one per scan, titled with their hit counts",
      sorted(i["body"]["title"] for i in r.issues) ==
      [f"Patent watch (applications): 4 hit(s) - {TUE}", f"Patent watch (grants): 3 hit(s) - {TUE}"], [i["body"]["title"] for i in r.issues])
    t("happy: the issue is assigned to the repository owner and labelled",
      all(i["body"].get("assignees") == ["owner"] and i["body"].get("labels") == ["patent-watch"] and i["path"] == "/repos/owner/repo/issues"
          and i["auth"] == "Bearer stub-token" for i in r.issues), r.issues[:1])
    g = next((i for i in r.issues if "grants" in i["body"]["title"]), {"body": {"body": "", "labels": []}})
    t("happy: the grants issue tags the hits and prints the chain command for utility grants only",
      "US9900001" in g["body"]["body"] and "assignee" in g["body"]["body"] and "-f patents=9900001,9900002" in g["body"]["body"]
      and "D1153227" in g["body"]["body"] and "patents=9900001,9900002,D" not in g["body"]["body"], g["body"]["body"])
    t("happy: hits for chaining are the utility grants, assignee hits first, the design patent left out",
      r.outputs.get("grant_hits") == "9900001,9900002" and r.outputs.get("grant_hits_count") == "2", r.outputs)
    dates = {q.split('@PD="')[1][:8] for _, q, *_ in r.queries if q and '@PD="' in q} - {"20190625", "20261022"}
    t("happy: the publication Thursday is the one before the grant Tuesday: 20261029 and 20261103, never Tuesday + 2 (20261105)",
      dates == {"20261103", "20261029"}, dates)
    t("happy: no search is made before the controls have run: the first search is the number control",
      bool(r.queries) and r.queries[0][1] == '"10846193".pn.', r.queries[:2])


@scenario
def idempotent(t, w):
    a, b = run_watcher(w, world()), run_watcher(w, world())
    t("idempotent: a re-run writes the same bytes (the commit step then has nothing to commit)",
      a.manifest_bytes is not None and a.manifest_bytes == b.manifest_bytes)


@scenario
def no_hits(t, w):
    r = run_watcher(w, world(planted=[]))
    m = r.manifest or {}
    t("no hits: exit 0, a manifest with no matches that still says what it read",
      r.code == 0 and m.get("matches") == [] and m.get("scanned", {}).get("grants", {}).get("families_on_day", 0) >= 500, r.out)
    t("no hits: no issue is filed and nothing is chained", r.issues == [] and r.outputs.get("grant_hits") == "" and r.outputs.get("grant_hits_count") == "0", r.outputs)
    r2 = run_watcher(w, world(planted=[]), token=False)
    t("no hits: needs no GH_TOKEN even under Actions", r2.code == 0, r2.out)


@scenario
def pure_functions(t, w):
    m = load_module(w)
    d = datetime.datetime
    t("the Wednesday 16:05 UTC run reads Tuesday 2026-11-03 and the Thursday before it, 2026-10-29",
      m.last_tuesday(d(2026, 11, 4, 16, 5)).date() == datetime.date(2026, 11, 3)
      and m.thursday_before(m.last_tuesday(d(2026, 11, 4, 16, 5))).date() == datetime.date(2026, 10, 29))
    t("a Tuesday morning run goes back a week (grants are not out yet); Tuesday afternoon does not",
      m.last_tuesday(d(2026, 11, 3, 10, 0)).date() == datetime.date(2026, 10, 27) and m.last_tuesday(d(2026, 11, 3, 17, 0)).date() == datetime.date(2026, 11, 3))
    t("only utility grants are chained", m.chainable("US-12730857-B2") and m.chainable("US-9900001-B1")
      and not m.chainable("US-D1153227-S") and not m.chainable("US-20260332641-A1") and not m.chainable("US-RE12345-E"))
    t("patent_number strips the country and kind", m.patent_number("US-12730857-B2") == "12730857" and m.patent_number("US-D1153227-S") == "D1153227"
      and m.patent_number("US-20260332641-A1") == "20260332641")


@scenario
def override_not_tuesday(t, w):
    r = run_watcher(w, world(), week="2026-11-05")
    unread(t, "WEEK_OVERRIDE on a Thursday", r, "is a Thursday")
    r = run_watcher(w, world(), week="next tuesday")
    unread(t, "WEEK_OVERRIDE that is not a date", r, "Bad WEEK_OVERRIDE")


def host_scenario(mode, why, frag):
    def run(t, w):
        r = run_watcher(w, world(), mode=mode)
        unread(t, f"host mode {mode} ({why})", r, frag)
    run.__name__ = "host_" + mode.replace(":", "_")
    return scenario(run)


for _mode, _why, _frag in [
        ("http500", "every call 500", "HTTP 500"), ("html", "a bot wall answers 200 with HTML", "caseId"),
        ("empty", "200 with {}", "no `patents` list"), ("json_list", "200 with a JSON list", "not an object"),
        ("error_field", "the answer's error is filled", "reports an error"),
        ("bare_patents", "only the patents list, no counters", "missing or not an integer"),
        ("no_families", "numberOfFamilies missing", "missing or not an integer"),
        ("fam_off", "numberOfFamilies one too many", "the page was cut or a counter changed meaning"),
        ("total_is_total", "totalResults is a total", "totalResults"), ("docs_short", "a page loses its last document", "documents for"),
        ("page_cap:1", "the page is silently capped", "the page was cut or a counter changed meaning"),
        ("rate429_always", "429 on every call", "retries"), ("no_phrase", "no bare phrase is understood", "control 'text + exact date, grants'"),
        ("phrase_lossy", "the text query misses what the assignee query finds", "text answer"),
        ("no_guid", "documents without a guid", "without a guid")]:
    host_scenario(_mode, _why, _frag)


@scenario
def host_recovers(t, w):
    base = run_watcher(w, world())
    for mode in ("rate429", "flaky500"):
        r = run_watcher(w, world(), mode=mode)
        t(f"host mode {mode}: waited out, exit 0, the same week as a clean host",
          r.code == 0 and base.manifest is not None and r.manifest == base.manifest, r.out)
        t(f"host mode {mode}: the log shows it waited", "waiting" in r.out, r.out)


@scenario
def date_loose(t, w):
    stray = si.doc("US-9900009-B2", "USPAT", "2026-11-05", ["Datadog, Inc."], "Stray")
    r = run_watcher(w, world(planted=PLANTED + [stray]), mode="date_loose")
    unread(t, "a date form that returns other days", r, "US-9900009-B2")
    ruwt = si.doc("US-10328327-B2", "USPAT", "2019-06-27", ["RUWT, LLC"], "RUWT other")
    r = run_watcher(w, world(planted=PLANTED + [ruwt]), mode="date_loose")
    unread(t, "a date form that returns other days, seen first by a control", r, "is not dated 2019-06-25")


@scenario
def syntax_changed(t, w):
    r = run_watcher(w, world(), syntax={"date": '@PD="{d}"', "assignee": '"{n}".asnm.', "number": '"{n}".pn.'})
    unread(t, "the assignee form answers zero documents", r, "control 'assignee + exact date, grants'")
    r = run_watcher(w, world(), syntax={"date": '@PD>="{d}"<="{d}"', "assignee": '"{n}".as.', "number": '"{n}".pn.'})
    unread(t, "the exact date form answers zero documents", r, "control 'assignee + exact date, grants'")


@scenario
def day_not_indexed(t, w):
    r = run_watcher(w, world(grants_day=False))
    unread(t, "the grant day holds a handful of documents", r, f"USPAT holds 3 families for {TUE} (fewer than 500)")
    r = run_watcher(w, world(apps_day=False))
    unread(t, "the publication day holds a handful of documents", r, f"US-PGPUB holds 3 families for {THU} (fewer than 500)")


@scenario
def controls_missing(t, w):
    unread(t, "the number control's patent is absent", run_watcher(w, world(drop=("US-10846193-B2",))), "control 'number form'")
    unread(t, "the RUWT control's patent is absent", run_watcher(w, world(drop=("US-10328326-B2",))), "control 'assignee + exact date, grants'")
    unread(t, "the Dynatrace control's publication is absent", run_watcher(w, world(drop=("US-20260332641-A1",))), "control 'assignee + exact date, applications'")


@scenario
def paginates(t, w):
    many = [si.doc(f"US-95{i:06d}-B2", "USPAT", TUE, ["Datadog, Inc."], f"Trace {i}") for i in range(130)]
    r = run_watcher(w, world(planted=many))
    m = r.manifest or {}
    got = {x["guid"] for x in m.get("matches") or []}
    t("pagination: 130 families for one term are all read, over two pages", r.code == 0 and got == {d["guid"] for d in many}, r.out)
    t("pagination: the second page was asked for", any(q[2] == 100 for q in r.queries if q[1] and '"Datadog".as.' in q[1]), r.queries[-3:])
    t("pagination: the chain is capped at 20 grants", len((r.outputs.get("grant_hits") or "").split(",")) == 20 and r.outputs.get("grant_hits_count") == "20", r.outputs)


@scenario
def too_many(t, w):
    many = [si.doc(f"US-95{i:06d}-B2", "USPAT", TUE, ["Datadog, Inc."], f"Trace {i}") for i in range(600)]
    r = run_watcher(w, world(planted=many))
    unread(t, "600 families for one term", r, "refusing to cut the answer")


@scenario
def watchlist(t, w):
    unread(t, "no watchlist file", run_watcher(w, world(), watchlist=MISSING), "no watchlist at")
    unread(t, "a watchlist of comments only", run_watcher(w, world(), watchlist="# nothing\n\n# here\n"), "has no terms")
    unread(t, "a term with a double quote", run_watcher(w, world(), watchlist=["Datadog", 'Data"dog']), "double quote")
    r = run_watcher(w, world(), watchlist=["Datadog", "datadog", "  Datadog  ", "Sportradar"])
    n = sum(1 for _, q, *_ in r.queries if q and q.startswith('"Datadog".as. AND'))
    t("a term listed three ways is queried once per scan, and blank and comment lines are skipped",
      r.code == 0 and n == 2 and (r.manifest or {}).get("watchlist") == ["Datadog", "Sportradar"], (n, (r.manifest or {}).get("watchlist")))


@scenario
def issues(t, w):
    unread(t, "the issue API answers 500", run_watcher(w, world(), gh_status=500), "issue could not be filed: HTTP 500")
    unread(t, "hits under Actions with no token", run_watcher(w, world(), token=False), "no GH_TOKEN/GH_REPO")
    r = run_watcher(w, world(), token=False, actions=False)
    t("hits on a developer machine with no token: reported, skipped, exit 0", r.code == 0 and r.manifest is not None and r.issues == [], r.out)


@scenario
def deadline(t, w):
    r = run_watcher(w, world(), env={"PPUBS_DEADLINE": "0"})
    unread(t, "the time budget is already spent", r, "stopped after")


@scenario
def real_watchlist(t, w):
    path = ARGS.real_watchlist
    if not path:
        t("the client's own watchlist file (skipped: --real-watchlist not given)", True)
        return
    text = pathlib.Path(path).read_text()
    terms = [l.strip() for l in text.splitlines() if l.strip() and not l.startswith("#")]
    r = run_watcher(w, world(), watchlist=text)
    t("the client's own watchlist parses and the standard week reads with it", r.code == 0 and (r.manifest or {}).get("watchlist") == terms, r.out)


@scenario
def rehearsal(t, w):
    """scripts/patent-watch-rehearsal.py, the tool that runs this watcher on the real host: it files nothing
    even when the environment says Actions with a token, keeps its evidence, lets only the settled week decide,
    and never reports a manifest it did not just read."""
    script = HERE / "patent-watch-rehearsal.py"

    def go(mode, settled, upcoming, client_exists=True):
        base, _log, stop = si.serve(world(), None, mode, [])
        gh = GitHubStub()
        td = pathlib.Path(tempfile.mkdtemp())
        try:
            client = td / "client"
            if client_exists:
                (client / ".github" / "scripts").mkdir(parents=True)
                shutil.copy(w, client / ".github" / "scripts" / "patent_watch.py")
                (client / ".github" / "patent-watchlist.txt").write_text("# t\n" + "\n".join(WATCHLIST) + "\n")
                old = client / "outbox" / "patents" / f"watch-{settled}.json"
                old.parent.mkdir(parents=True)
                old.write_text(json.dumps({"stale_marker": True}))
            e = dict(os.environ, PPUBS_BASE=base, PPUBS_PAUSE="0", PPUBS_BACKOFF="0", PYTHONDONTWRITEBYTECODE="1",
                     GITHUB_ACTIONS="true", GH_TOKEN="stub-token", GH_REPO="owner/repo", GITHUB_API_URL=gh.url,
                     GITHUB_OUTPUT=str(td / "out.txt"))
            e.pop("PPUBS_DEADLINE", None)
            args = [sys.executable, str(script), "--client", str(client), "--settled", settled, "--out", str(td / "evidence")]
            if upcoming:
                args += ["--upcoming", upcoming]
            p = subprocess.run(args, env=e, capture_output=True, text=True, timeout=300)
            ev = [f.read_text() for f in sorted((td / "evidence").glob("patent-watch-rehearsal-*.md"))] if (td / "evidence").exists() else []
            return p, ev, gh.issues, (td / "out.txt").exists()
        finally:
            stop()
            gh.stop()
            shutil.rmtree(td, ignore_errors=True)

    p, ev, filed, chained = go("ok", TUE, "2026-11-10")
    t("rehearsal: the settled week is read and the exit is 0, although the upcoming week is not indexed", p.returncode == 0, p.stdout[-500:] + p.stderr[-300:])
    t("rehearsal: nothing is filed or chained although the environment says Actions with a token and the week has hits", filed == [] and not chained, (filed, chained))
    t("rehearsal: one evidence file, with the settled week's manifest and the upcoming week's NOT READ",
      len(ev) == 1 and '"read_complete": true' in ev[0] and "NOT READ:" in ev[0], ev[0][-500:] if ev else "no evidence file")
    t("rehearsal: the evidence table has the settled week as read and the upcoming week as not read",
      bool(ev) and f"| settled week | {TUE} | 2026-10-29 | read |" in ev[0] and "| upcoming week | 2026-11-10 |" in ev[0] and "| NOT READ |" in ev[0], ev[0][:900] if ev else "")
    t("rehearsal: a manifest left in the client's outbox is not reported as this run's reading", bool(ev) and "stale_marker" not in ev[0])
    p, ev, filed, chained = go("http500", TUE, "2026-11-10")
    t("rehearsal: a host that answers 500 turns the rehearsal red", p.returncode != 0, p.stdout[-400:])
    t("rehearsal: ...and the evidence says NOT READ, shows no manifest, and not the old one either",
      len(ev) == 1 and "NOT READ" in ev[0] and "No manifest was written for this week." in ev[0] and "stale_marker" not in ev[0], ev[0][:600] if ev else "no evidence file")
    p, ev, filed, chained = go("ok", TUE, None, client_exists=False)
    t("rehearsal: a client checkout with no watcher is red and says so", p.returncode != 0 and "no watcher at" in p.stdout and ev == [], p.stdout[-300:])


ARGS = None


def main():
    global ARGS
    ap = argparse.ArgumentParser()
    ap.add_argument("--watcher", default=DEFAULT_WATCHER)
    ap.add_argument("--real-watchlist")
    ap.add_argument("--only")
    ARGS = ap.parse_args()
    w = pathlib.Path(ARGS.watcher).resolve()
    if not w.exists():
        print(f"FAIL: no watcher at {w}")
        return 1
    names = ARGS.only.split(",") if ARGS.only else list(SCENARIOS)
    unknown = [n for n in names if n not in SCENARIOS]
    if unknown:
        print(f"FAIL: unknown scenario(s) {unknown}; known: {sorted(SCENARIOS)}")
        return 1
    t = Tally()
    for n in names:
        print(f"\n== {n}")
        SCENARIOS[n](t, w)
    print(f"\n{t.passed}/{t.passed + t.failed} checks passed")
    return 1 if t.failed else 0


if __name__ == "__main__":
    sys.exit(main())
