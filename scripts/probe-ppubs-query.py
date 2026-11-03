#!/usr/bin/env python3
"""Which PPUBS query forms answer for a date and an assignee, measured on a runner.

WHY THIS EXISTS. jubilant-bassoon's weekly patent watcher read bulkdata.uspto.gov,
a host whose DNS record was removed (ADR-PATENT-001), and ended green on every
fetch it could not make. Its replacement reads PPUBS (ppubs.uspto.gov), the
backend patent_fetch.py already uses to pull claims by patent NUMBER. Nothing in
any repo has ever searched PPUBS by assignee or by publication date, and the
query syntax for that is not documented. A guessed form is the dangerous kind of
wrong here: a server that does not understand a query answers 200 with zero
documents, which a watcher reads as "no matches this week".

THE METHOD, so a form cannot pass by being silent:
  * every candidate form is judged on the DOCUMENTS it returns, never on the
    absence of an error. A date form passes only if it returns at least
    MIN_DATE_DOCS documents and every one carries that publication date. An
    assignee form passes only if it returns the known patent and every document
    it returns names the assignee. A combined form must return the known patent
    for the known assignee on the known date.
  * the known answer is US10328326: assignee "RUWT, LLC", granted 2019-06-25,
    guid US-10328326-B2. It is in jubilant-bassoon outbox/patents/US10328326.json,
    written by patent_fetch.py through PPUBS on 2026-06-04.
  * the `.pn.` form patent_fetch.py already uses is run first and last. If it
    fails the host or the session is broken and nothing after it means anything.
  * the real week is then read: every watchlist term, for the most recent grant
    Tuesday (USPAT) and publication Thursday (US-PGPUB), both as an assignee query
    and as an all-fields phrase, so the choice between the two is made on counts.

RUNNER ONLY. ppubs.uspto.gov is outside the dev sandbox's egress allowlist.
PPUBS_BASE points the same code at scripts/ppubs_stand_in.py for --self-test.

Writes outbox/ppubs-query-probe-<UTC stamp>.json (every call) and .md (the
decision table), prints the table, and exits 1 if no working form was found.
"""
import datetime
import itertools
import json
import os
import sys
import time

import requests

BASE = os.environ.get("PPUBS_BASE", "https://ppubs.uspto.gov")
UA = "Mozilla/5.0 (X11; Linux x86_64) field-laboratory/ppubs-query-probe"
TIMEOUT = 60
PAUSE = float(os.environ.get("PPUBS_PAUSE", "0.5"))
DEADLINE_S = float(os.environ.get("PPUBS_DEADLINE", str(14 * 60)))
MIN_DATE_DOCS = int(os.environ.get("PPUBS_MIN_DATE_DOCS", "20"))

CTRL_NUMBER = ("10846193", "US-10846193-B2")
CTRL_NAME = "RUWT"
CTRL_GUID = "US-10328326-B2"
CTRL_DAY = "2019-06-25"

# The client's .github/patent-watchlist.txt as of jubilant-bassoon a669b84.
WATCHLIST = [
    "Dynatrace LLC", "Akamai Technologies", "Datadog", "New Relic",
    "Cisco AppDynamics", "Splunk LLC", "Tealeaf Technology", "SpeedCurve",
    "LogRocket", "Are You Watching This", "RUWT", "MetaBet", "Data Skrive",
    "Stats Perform", "Sportradar",
]

DATE_FORMS = [
    ("d1", '@PD="{d}"'),
    ("d2", "@PD={d}"),
    ("d3", '@PD>="{d}"<="{d}"'),
    ("d4", "@PD>={d}<={d}"),
    ("d5", "{d}.pd."),
    ("d6", '"{d}".pd.'),
    ("d7", "({d}).pd."),
    ("d8", '@PD="{i}"'),
    ("d9", '"{i}".pd.'),
    ("d10", '@PD>="{d}" AND @PD<="{d}"'),
    ("d11", '@pd="{d}"'),
    ("d12", "{d}.PD."),
]
ASSIGNEE_FORMS = [
    ("a1", '"{n}".as.'),
    ("a2", "{n}.as."),
    ("a3", "({n}).as."),
    ("a4", '"{n}".asnm.'),
    ("a5", "{n}.asnm."),
    ("a6", '"{n}".asg.'),
    ("a7", '@AS="{n}"'),
]
PHRASE_FORM = ("t1", '"{n}"')


def last_weekday(weekday, today):
    """The most recent date with this weekday (Mon=0) strictly before `today`."""
    back = (today.weekday() - weekday) % 7 or 7
    return today - datetime.timedelta(days=back)


def compact(day):
    return day.replace("-", "")


def doc_summary(d):
    names = d.get("assigneeName") or d.get("assignees") or []
    if isinstance(names, str):
        names = [names]
    text = " | ".join(n if isinstance(n, str) else json.dumps(n) for n in names)
    date = str(d.get("datePublished") or d.get("publicationDate") or "")[:10]
    return {
        "guid": d.get("guid"),
        "type": d.get("type"),
        "date": date,
        "assignee": text[:160],
        "title": str(d.get("inventionTitle") or "")[:80],
    }


def found_count(result):
    """(value, key path) of the first integer that looks like a total, else (None, None)."""
    names = ("numFound", "totalCount", "totalResults", "total", "count")
    if not isinstance(result, dict):
        return None, None
    for k in names:
        if isinstance(result.get(k), int) and not isinstance(result.get(k), bool):
            return result[k], k
    for outer, v in result.items():
        if isinstance(v, dict):
            for k in names:
                if isinstance(v.get(k), int) and not isinstance(v.get(k), bool):
                    return v[k], f"{outer}.{k}"
    return None, None


def shape(result):
    if not isinstance(result, dict):
        return type(result).__name__
    out = {}
    for k, v in result.items():
        if isinstance(v, (list, dict, str)):
            out[k] = f"{type(v).__name__}[{len(v)}]"
        else:
            out[k] = type(v).__name__
    return out


def pass_date(docs, day, minimum):
    s = [doc_summary(d) for d in docs]
    return len(s) >= minimum and all(x["date"] == day for x in s)


def pass_assignee(docs, needle, ctrl_guid):
    s = [doc_summary(d) for d in docs]
    return (
        bool(s)
        and any(x["guid"] == ctrl_guid for x in s)
        and all(needle.lower() in x["assignee"].lower() for x in s)
    )


def pass_combo(docs, needle, day, ctrl_guid):
    s = [doc_summary(d) for d in docs]
    return (
        any(x["guid"] == ctrl_guid for x in s)
        and all(needle.lower() in x["assignee"].lower() and x["date"] == day for x in s)
    )


class Ppubs:
    def __init__(self):
        self.s = None
        self.case_id = None
        self.renewed = 0
        self.session_log = []

    def open(self):
        s = requests.Session()
        s.headers.update({
            "X-Requested-With": "XMLHttpRequest",
            "User-Agent": UA,
            "Origin": BASE,
            "Referer": f"{BASE}/pubwebapp/",
            "Pragma": "no-cache",
            "Cache-Control": "no-cache",
        })
        log = {}
        try:
            r = s.get(f"{BASE}/pubwebapp/", timeout=TIMEOUT)
            log["prime"] = {"http": r.status_code, "cookies": sorted(s.cookies.keys())}
        except requests.RequestException as e:
            log["prime"] = {"error": str(e)[:300]}
            self.session_log.append(log)
            return False
        try:
            r = s.post(
                f"{BASE}/api/users/me/session", json=-1,
                headers={"X-Access-Token": "null", "referer": f"{BASE}/pubwebapp/"},
                timeout=TIMEOUT,
            )
        except requests.RequestException as e:
            log["session"] = {"error": str(e)[:300]}
            self.session_log.append(log)
            return False
        log["session"] = {
            "http": r.status_code,
            "content_type": r.headers.get("Content-Type"),
            "header_names": sorted(r.headers.keys()),
            "head": r.text[:200] if r.status_code != 200 else None,
        }
        token = r.headers.get("X-Access-Token") or r.headers.get("x-access-token")
        try:
            case_id = r.json()["userCase"]["caseId"]
        except (ValueError, KeyError, TypeError):
            case_id = None
        log["session"]["has_token"] = bool(token)
        log["session"]["case_id"] = case_id
        self.session_log.append(log)
        if r.status_code != 200 or not token or case_id is None:
            return False
        s.headers["X-Access-Token"] = token
        self.s, self.case_id = s, case_id
        return True

    def _post(self, path, body):
        for attempt in (1, 2):
            t0 = time.monotonic()
            try:
                r = self.s.post(f"{BASE}{path}", json=body, timeout=TIMEOUT)
            except requests.RequestException as e:
                return None, {"error": str(e)[:300], "ms": int((time.monotonic() - t0) * 1000)}
            ms = int((time.monotonic() - t0) * 1000)
            if r.status_code in (401, 403) and attempt == 1:
                self.renewed += 1
                if not self.open():
                    return r, {"http": r.status_code, "ms": ms, "renew_failed": True}
                continue
            return r, {"http": r.status_code, "ms": ms}
        raise AssertionError("unreachable")

    def query_body(self, q, db):
        return {
            "caseId": self.case_id, "hl_snippets": "2", "op": "OR", "q": q,
            "queryName": q, "highlights": "1", "qt": "brs", "spellCheck": False,
            "viewName": "tile", "plurals": True, "britishEquivalents": True,
            "databaseFilters": [{"databaseName": db, "countryCodes": []}],
            "searchType": 1, "ignorePersist": True, "userEnteredQuery": q,
        }

    def run(self, q, db, n=100, start=0):
        """counts then search, as patent_fetch.py does. -> entry dict with raw docs under '_docs'."""
        body = self.query_body(q, db)
        entry = {"q": q, "db": db, "start": start, "n": n}
        r, meta = self._post("/api/searches/counts", body)
        entry["counts"] = dict(meta)
        if r is not None:
            entry["counts"]["head"] = r.text[:300]
        time.sleep(PAUSE)
        full = {
            "start": start, "pageCount": n, "sort": "date_publ desc",
            "docFamilyFiltering": "familyIdFiltering", "searchType": 1,
            "familyIdEnglishOnly": True, "familyIdFirstPreferred": "US-PGPUB",
            "familyIdSecondPreferred": "USPAT", "familyIdThirdPreferred": "FPRS",
            "showDocPerFamilyPref": "showEnglish", "queryId": 0,
            "tagDocSearch": False, "query": body,
        }
        r, meta = self._post("/api/searches/searchWithBeFamily", full)
        entry["search"] = dict(meta)
        docs = []
        if r is not None:
            entry["search"]["bytes"] = len(r.content)
            try:
                result = r.json()
            except ValueError:
                entry["search"]["not_json"] = r.text[:200]
                result = None
            if result is not None:
                entry["search"]["shape"] = shape(result)
                entry["search"]["n_found"], entry["search"]["n_found_key"] = found_count(result)
                if isinstance(result, dict):
                    docs = result.get("patents") or result.get("docs") or []
        entry["n_docs"] = len(docs)
        entry["docs"] = [doc_summary(d) for d in docs[:25]]
        entry["_docs"] = docs
        time.sleep(PAUSE)
        return entry


def strip_private(entry):
    return {k: v for k, v in entry.items() if not k.startswith("_")}


def fill(form, name=None, day=None):
    return form.format(n=name, d=compact(day) if day else None, i=day)


def build_report(client, today, grant_day, pub_day):
    t0 = time.monotonic()
    report = {
        "meta": {
            "base": BASE, "run_utc": datetime.datetime.utcnow().isoformat() + "Z",
            "grant_day": grant_day, "pub_day": pub_day, "requests": requests.__version__,
            "min_date_docs": MIN_DATE_DOCS,
        },
        "phases": {}, "selected": {}, "verdict": [],
    }

    def late():
        return time.monotonic() - t0 > DEADLINE_S

    def phase(name):
        report["phases"][name] = []
        return report["phases"][name]

    # Phase 0: the number form patent_fetch.py already uses
    p0 = phase("0_number_control")
    e = client.run(f'"{CTRL_NUMBER[0]}".pn.', "USPAT", n=5)
    e["pass"] = any(x["guid"] == CTRL_NUMBER[1] for x in e["docs"])
    p0.append(strip_private(e))
    if e["_docs"]:
        report["meta"]["sample_doc_keys"] = sorted(e["_docs"][0].keys())
        report["meta"]["sample_doc"] = {
            k: (v if not isinstance(v, str) else v[:160])
            for k, v in e["_docs"][0].items()
            if isinstance(v, (str, int, float, bool, type(None)))
            or (isinstance(v, list) and len(str(v)) < 200)
        }
    report["meta"]["number_control_pass"] = e["pass"]

    # Phase 1: date forms, USPAT, the grant Tuesday
    p1 = phase("1_date_forms_uspat")
    date_pass = []
    for code, form in DATE_FORMS:
        if late():
            report["meta"]["truncated"] = "phase 1"
            break
        e = client.run(fill(form, day=grant_day), "USPAT", n=100)
        e["form"], e["code"] = form, code
        e["pass"] = pass_date(e["_docs"], grant_day, MIN_DATE_DOCS)
        p1.append(strip_private(e))
        if e["pass"]:
            date_pass.append((code, form))

    # Phase 1b: the passing date forms again on US-PGPUB, the publication Thursday
    p1b = phase("1b_date_forms_pgpub")
    date_pass_both = []
    for code, form in date_pass:
        if late():
            report["meta"]["truncated"] = "phase 1b"
            break
        e = client.run(fill(form, day=pub_day), "US-PGPUB", n=100)
        e["form"], e["code"] = form, code
        e["pass"] = pass_date(e["_docs"], pub_day, MIN_DATE_DOCS)
        p1b.append(strip_private(e))
        if e["pass"]:
            date_pass_both.append((code, form))

    # Phase 2: assignee forms against the known assignee, no date
    p2 = phase("2_assignee_forms_uspat")
    assignee_pass = []
    for code, form in ASSIGNEE_FORMS:
        if late():
            report["meta"]["truncated"] = "phase 2"
            break
        e = client.run(fill(form, name=CTRL_NAME), "USPAT", n=100)
        e["form"], e["code"] = form, code
        e["pass"] = pass_assignee(e["_docs"], CTRL_NAME, CTRL_GUID)
        p2.append(strip_private(e))
        if e["pass"]:
            assignee_pass.append((code, form))

    # Phase 3: assignee AND date, against the known answer
    p3 = phase("3_combined_forms_uspat")
    combo_pass = []
    for (dc, df), (ac, af) in itertools.islice(itertools.product(date_pass_both or date_pass, assignee_pass), 16):
        if late():
            report["meta"]["truncated"] = "phase 3"
            break
        q = f"{fill(af, name=CTRL_NAME)} AND {fill(df, day=CTRL_DAY)}"
        e = client.run(q, "USPAT", n=100)
        e["date_code"], e["assignee_code"] = dc, ac
        e["pass"] = pass_combo(e["_docs"], CTRL_NAME, CTRL_DAY, CTRL_GUID)
        p3.append(strip_private(e))
        if e["pass"]:
            combo_pass.append(((dc, df), (ac, af)))

    if combo_pass:
        (dc, df), (ac, af) = combo_pass[0]
        report["selected"] = {"date": {"code": dc, "form": df}, "assignee": {"code": ac, "form": af}}

        # Phase 4: the real week, one query per term and database, assignee and phrase
        p4 = phase("4_real_week")
        for db, day in (("USPAT", grant_day), ("US-PGPUB", pub_day)):
            for name in WATCHLIST:
                for kind, form in (("assignee", af), ("phrase", PHRASE_FORM[1])):
                    if late():
                        report["meta"]["truncated"] = "phase 4"
                        break
                    q = f"{fill(form, name=name)} AND {fill(df, day=day)}"
                    e = client.run(q, db, n=100)
                    e["term"], e["kind"], e["day"] = name, kind, day
                    p4.append(strip_private(e))
            # one OR query per kind: does a single query per database equal the union?
            for kind, form in (("assignee", af), ("phrase", PHRASE_FORM[1])):
                if late():
                    break
                ors = " OR ".join(fill(form, name=n) for n in WATCHLIST)
                q = f"({ors}) AND {fill(df, day=day)}"
                e = client.run(q, db, n=100)
                e["term"], e["kind"], e["day"] = "ALL(OR)", kind, day
                p4.append(strip_private(e))

        # Phase 5: what enumerating a whole day would cost (two pages of 500)
        p5 = phase("5_enumeration_cost")
        for start in (0, 500):
            if late():
                break
            e = client.run(fill(df, day=grant_day), "USPAT", n=500, start=start)
            e["page_start"] = start
            p5.append(strip_private(e))

    # Phase 6: the number control again, after ~hundreds of calls on one session
    p6 = phase("6_number_control_after")
    e = client.run(f'"{CTRL_NUMBER[0]}".pn.', "USPAT", n=5)
    e["pass"] = any(x["guid"] == CTRL_NUMBER[1] for x in e["docs"])
    p6.append(strip_private(e))

    report["meta"]["session_renewals"] = client.renewed
    report["meta"]["seconds"] = round(time.monotonic() - t0, 1)
    report["session"] = client.session_log
    ok = (
        report["meta"]["number_control_pass"]
        and bool(date_pass) and bool(assignee_pass) and bool(combo_pass)
    )
    report["ok"] = ok
    report["verdict"] = [
        f"number control: {'pass' if report['meta']['number_control_pass'] else 'FAIL'}",
        f"date forms that pass on USPAT: {[c for c, _ in date_pass] or 'NONE'}",
        f"... and on US-PGPUB: {[c for c, _ in date_pass_both] or 'NONE'}",
        f"assignee forms that pass: {[c for c, _ in assignee_pass] or 'NONE'}",
        f"combined forms that pass: {[(d[0], a[0]) for d, a in combo_pass] or 'NONE'}",
    ]
    return report


def render_md(report):
    out = ["# PPUBS query-form probe", ""]
    m = report["meta"]
    out.append(f"Run {m['run_utc']} against `{m['base']}`; grant day {m['grant_day']}, publication day {m['pub_day']}; {m.get('seconds')} s; session renewals {m.get('session_renewals')}.")
    out.append("")
    out += [f"- {v}" for v in report["verdict"]]
    if report.get("selected"):
        out.append(f"- selected: date `{report['selected']['date']['form']}`, assignee `{report['selected']['assignee']['form']}`")
    if m.get("truncated"):
        out.append(f"- TRUNCATED by the deadline in {m['truncated']}")
    out.append("")
    for name, entries in report["phases"].items():
        out += [f"## {name}", "", "| query | db | http | docs | found | pass |", "|---|---|---|---|---|---|"]
        for e in entries:
            s = e.get("search", {})
            q = e["q"] if len(e["q"]) < 90 else e["q"][:87] + "..."
            out.append(f"| `{q}` | {e['db']} | {s.get('http', s.get('error', '?'))} | {e['n_docs']} | {s.get('n_found')} | {e.get('pass', '')} |")
        out.append("")
    return "\n".join(out) + "\n"


def write_outputs(report):
    stamp = datetime.datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    outdir = os.environ.get("PPUBS_OUT", "outbox")
    os.makedirs(outdir, exist_ok=True)
    jp = os.path.join(outdir, f"ppubs-query-probe-{stamp}.json")
    mp = os.path.join(outdir, f"ppubs-query-probe-{stamp}.md")
    with open(jp, "w") as f:
        json.dump(report, f, indent=1, default=str)
    with open(mp, "w") as f:
        f.write(render_md(report))
    return jp, mp


def main():
    today = datetime.datetime.utcnow().date()
    grant_day = os.environ.get("GRANT_DAY") or last_weekday(1, today).isoformat()
    pub_day = os.environ.get("PUB_DAY") or last_weekday(3, today).isoformat()
    client = Ppubs()
    if not client.open():
        report = {
            "meta": {"base": BASE, "run_utc": datetime.datetime.utcnow().isoformat() + "Z",
                     "grant_day": grant_day, "pub_day": pub_day},
            "phases": {}, "selected": {}, "session": client.session_log, "ok": False,
            "verdict": ["session could not be opened: see 'session'"],
        }
        jp, mp = write_outputs(report)
        print(json.dumps(client.session_log, indent=1))
        print(f"FAIL: no PPUBS session. Wrote {jp}")
        return 1
    report = build_report(client, today, grant_day, pub_day)
    jp, mp = write_outputs(report)
    print(render_md(report))
    print(f"Wrote {jp} and {mp}")
    return 0 if report["ok"] else 1


def self_test():
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import tempfile
    import ppubs_stand_in as si

    global BASE, PAUSE, MIN_DATE_DOCS
    PAUSE, MIN_DATE_DOCS = 0.0, 5
    passed = failed = 0

    def t(name, ok):
        nonlocal passed, failed
        if ok:
            passed += 1
        else:
            failed += 1
        print(f"{'PASS' if ok else 'FAIL'}  {name}")

    # pure functions
    t("last_weekday: Tuesday before a Tuesday is a week back", last_weekday(1, datetime.date(2026, 11, 3)) == datetime.date(2026, 10, 27))
    t("last_weekday: Thursday before a Tuesday", last_weekday(3, datetime.date(2026, 11, 3)) == datetime.date(2026, 10, 29))
    t("found_count: top level", found_count({"numFound": 7}) == (7, "numFound"))
    t("found_count: nested", found_count({"counts": {"total": 9}}) == (9, "counts.total"))
    t("found_count: absent", found_count({"patents": []}) == (None, None))
    t("found_count: a bool is not a count", found_count({"count": True}) == (None, None))
    d = {"guid": "g", "datePublished": "2026-10-27T00:00:00Z", "assigneeName": ["Acme, Inc."]}
    t("pass_date needs the minimum count", not pass_date([d] * 3, "2026-10-27", 5))
    t("pass_date needs every date to match", not pass_date([d] * 5 + [{**d, "datePublished": "2026-10-28T00:00:00Z"}], "2026-10-27", 5))
    t("pass_date passes when all match", pass_date([d] * 5, "2026-10-27", 5))
    t("pass_assignee needs the known guid", not pass_assignee([{**d, "assigneeName": ["RUWT, LLC"]}], "RUWT", "US-10328326-B2"))
    t("pass_assignee rejects a foreign assignee", not pass_assignee([{**d, "guid": "US-10328326-B2", "assigneeName": ["RUWT, LLC"]}, d], "RUWT", "US-10328326-B2"))
    t("pass_assignee passes", pass_assignee([{**d, "guid": "US-10328326-B2", "assigneeName": ["RUWT, LLC"]}], "RUWT", "US-10328326-B2"))

    # the whole probe against the stand-in, whose true forms are neither first candidates
    corpus = [si.doc("US-10846193-B2", "USPAT", "2020-11-24", ["Some Co"]),
              si.doc("US-10328326-B2", "USPAT", "2019-06-25", ["RUWT, LLC"])]
    corpus += [si.doc(f"US-9{i:06d}-B2", "USPAT", "2026-10-27", ["Other Co"]) for i in range(30)]
    corpus += [si.doc("US-9900001-B2", "USPAT", "2026-10-27", ["Datadog, Inc."])]
    corpus += [si.doc(f"US-2026{i:07d}-A1", "US-PGPUB", "2026-10-29", ["Other Co"]) for i in range(30)]
    syntax = {"date": '@PD>="{d}"<="{d}"', "assignee": '"{n}".asnm.', "number": '"{n}".pn.'}
    base, log, stop = si.serve(corpus, syntax)
    try:
        BASE = base
        with tempfile.TemporaryDirectory() as td:
            os.environ["PPUBS_OUT"] = td
            os.environ["GRANT_DAY"], os.environ["PUB_DAY"] = "2026-10-27", "2026-10-29"
            code = main()
            files = sorted(os.listdir(td))
            rep = json.load(open(os.path.join(td, [f for f in files if f.endswith(".json")][0])))
        t("stand-in with unusual true forms: probe exits 0", code == 0)
        t("selected date form is the stand-in's, not the first candidate", rep["selected"].get("date", {}).get("code") == "d3")
        t("selected assignee form is the stand-in's, not the first candidate", rep["selected"].get("assignee", {}).get("code") == "a4")
        t("the stand-in's wrong-form answers were zero documents, not errors",
          all(e["search"]["http"] == 200 for e in rep["phases"]["1_date_forms_uspat"]) and rep["phases"]["1_date_forms_uspat"][0]["n_docs"] == 0)
        p4 = rep["phases"].get("4_real_week", [])
        hit = [e for e in p4 if e.get("term") == "Datadog" and e["kind"] == "assignee" and e["db"] == "USPAT"]
        t("phase 4 finds the one planted Datadog grant by assignee", bool(hit) and hit[0]["n_docs"] == 1)
        allq = [e for e in p4 if e.get("term") == "ALL(OR)" and e["kind"] == "assignee" and e["db"] == "USPAT"]
        t("the OR query across the watchlist returns the same one document", bool(allq) and allq[0]["n_docs"] == 1)
        t("number control passes before and after", rep["meta"]["number_control_pass"] and rep["phases"]["6_number_control_after"][0]["pass"])
        t("no token value is in the report", si.TOKEN not in json.dumps(rep))
    finally:
        stop()

    # a host that is broken in each of the three ways must make the probe fail, not pass
    for mode in ("http500", "html", "empty"):
        base, log, stop = si.serve(corpus, syntax, mode=mode)
        try:
            BASE = base
            with tempfile.TemporaryDirectory() as td:
                os.environ["PPUBS_OUT"] = td
                code = main()
            t(f"host mode {mode}: the probe fails", code == 1)
        finally:
            stop()

    # single terms work and a conjunction answers zero: every form passes alone and the probe must still fail
    base, log, stop = si.serve(corpus, syntax, mode="no_and")
    try:
        BASE = base
        with tempfile.TemporaryDirectory() as td:
            os.environ["PPUBS_OUT"] = td
            code = main()
            rep = json.load(open(os.path.join(td, [f for f in os.listdir(td) if f.endswith(".json")][0])))
        t("a host that cannot conjoin: the probe fails", code == 1)
        t("... although a date form and an assignee form each passed alone",
          any(e["pass"] for e in rep["phases"]["1_date_forms_uspat"]) and any(e["pass"] for e in rep["phases"]["2_assignee_forms_uspat"]))
        t("... and the verdict says no combined form passed", "combined forms that pass: NONE" in rep["verdict"])
    finally:
        stop()

    # a host whose true forms are none of the candidates must not be reported as working
    base, log, stop = si.serve(corpus, {"date": "ON {d}", "assignee": "BY {n}", "number": '"{n}".pn.'})
    try:
        BASE = base
        with tempfile.TemporaryDirectory() as td:
            os.environ["PPUBS_OUT"] = td
            code = main()
        t("no candidate form is the host's: the probe fails, silently-zero answers do not pass", code == 1)
    finally:
        stop()

    print(f"\n{passed}/{passed + failed} checks passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(self_test() if "--self-test" in sys.argv else main())
