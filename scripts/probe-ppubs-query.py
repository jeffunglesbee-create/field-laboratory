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

TWO MODES (PPUBS_MODE). "forms" is the first run's: which spellings answer, at
0.5 s between calls. It found the host rate-limits (HTTP 429, body
{"message": "Too many requests"}) at about one call a second, which polluted its
reading of the real week. "reading" paces at 3 s, backs off on 429 and records
the 429's headers, and measures what the watcher will actually do: known answers
per watchlist term and database, the production query forms against them, the
date totals for eight weeks, the OR query against per-term queries, and how many
hits the assignee field and the all-fields phrase each produce per week.
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
MODE = os.environ.get("PPUBS_MODE", "forms")
PAUSE = float(os.environ.get("PPUBS_PAUSE", "3.0" if MODE == "reading" else "0.5"))
DEADLINE_S = float(os.environ.get("PPUBS_DEADLINE", str((28 if MODE == "reading" else 14) * 60)))
RETRY_429 = int(os.environ.get("PPUBS_RETRY_429", "3"))
BACKOFF = float(os.environ.get("PPUBS_BACKOFF", "20"))
RATE_HEADERS = {
    "retry-after", "x-ratelimit-limit", "x-ratelimit-remaining", "x-ratelimit-reset",
    "ratelimit-limit", "ratelimit-remaining", "ratelimit-reset", "ratelimit-policy",
    "x-request-id", "server", "via", "date",
}
MIN_DATE_DOCS = int(os.environ.get("PPUBS_MIN_DATE_DOCS", "20"))
MIN_TOTAL = int(os.environ.get("PPUBS_MIN_TOTAL", "500"))
PROD_DATE = '@PD="{d}"'          # the forms the "forms" run verified against the known patent
PROD_ASSIGNEE = '"{n}".as.'
RANGE = '@PD>="{a}"<="{b}"'
WEEKS = 8

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


def recent_weekdays(weekday, today, k):
    """The k most recent dates with this weekday strictly before `today`, newest first."""
    first = last_weekday(weekday, today)
    return [first - datetime.timedelta(days=7 * i) for i in range(k)]


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


def scalars(result):
    """The top-level scalar values of a response, so a field such as totalResults can be read."""
    if not isinstance(result, dict):
        return {}
    return {
        k: v for k, v in result.items()
        if v is None or isinstance(v, (int, float, bool)) or (isinstance(v, str) and len(v) <= 60)
    }


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
        self.calls = 0
        self.events = []
        self.t0 = time.monotonic()

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
        renewed = False
        tries_429 = 0
        extra = {}
        while True:
            t0 = time.monotonic()
            try:
                r = self.s.post(f"{BASE}{path}", json=body, timeout=TIMEOUT)
            except requests.RequestException as e:
                return None, {"error": str(e)[:300], "ms": int((time.monotonic() - t0) * 1000), **extra}
            self.calls += 1
            ms = int((time.monotonic() - t0) * 1000)
            if r.status_code in (401, 403) and not renewed:
                renewed = True
                self.renewed += 1
                if not self.open():
                    return r, {"http": r.status_code, "ms": ms, "renew_failed": True, **extra}
                continue
            if r.status_code == 429:
                ev = {
                    "t": round(time.monotonic() - self.t0, 1), "call_no": self.calls, "path": path,
                    "headers": {k: v for k, v in r.headers.items() if k.lower() in RATE_HEADERS},
                    "body": r.text[:120],
                }
                self.events.append(ev)
                tries_429 += 1
                extra["rate_limited"] = tries_429
                if tries_429 <= RETRY_429:
                    ra = r.headers.get("Retry-After", "")
                    ev["waited_s"] = float(ra) if ra.replace(".", "", 1).isdigit() else BACKOFF
                    time.sleep(ev["waited_s"])
                    continue
            return r, {"http": r.status_code, "ms": ms, **extra}

    def query_body(self, q, db):
        return {
            "caseId": self.case_id, "hl_snippets": "2", "op": "OR", "q": q,
            "queryName": q, "highlights": "1", "qt": "brs", "spellCheck": False,
            "viewName": "tile", "plurals": True, "britishEquivalents": True,
            "databaseFilters": [{"databaseName": db, "countryCodes": []}],
            "searchType": 1, "ignorePersist": True, "userEnteredQuery": q,
        }

    def run(self, q, db, n=100, start=0, counts=True):
        """counts then search, as patent_fetch.py does (counts=False: search only).
        -> entry dict with raw docs under '_docs'."""
        body = self.query_body(q, db)
        entry = {"q": q, "db": db, "start": start, "n": n}
        if counts:
            r, meta = self._post("/api/searches/counts", body)
            entry["counts"] = dict(meta)
            if r is not None:
                entry["counts"]["head"] = r.text[:300]
                try:
                    entry["counts"]["num_results"] = r.json().get("numResults")
                except (ValueError, AttributeError):
                    pass
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
                entry["search"]["scalars"] = scalars(result)
                entry["search"]["n_found"], entry["search"]["n_found_key"] = found_count(result)
                if isinstance(result, dict):
                    docs = result.get("patents") or result.get("docs") or []
        entry["n_docs"] = len(docs)
        entry["docs"] = [doc_summary(d) for d in docs[:25]]
        entry["_docs"] = docs
        entry["total"] = (entry["search"].get("scalars") or {}).get("totalResults")
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



def or_query(form, names):
    return "(" + " OR ".join(fill(form, name=n) for n in names) + ")"


def matched_terms(summary, names):
    """Watch terms found, case-insensitively, in the doc's assignee text or title."""
    text = f"{summary['assignee']} | {summary['title']}".lower()
    return [n for n in names if n.lower() in text]


def build_reading_report(client, today, grant_day, pub_day):
    t0 = time.monotonic()
    report = {
        "meta": {"base": BASE, "mode": "reading", "run_utc": datetime.datetime.utcnow().isoformat() + "Z",
                 "grant_day": grant_day, "pub_day": pub_day, "pause_s": PAUSE, "requests": requests.__version__,
                 "min_total": MIN_TOTAL},
        "phases": {}, "verdict": [], "or_vs_term": [], "weekly": [],
    }
    late = lambda: time.monotonic() - t0 > DEADLINE_S
    dbs = (("USPAT", grant_day), ("US-PGPUB", pub_day))

    def phase(name):
        report["phases"][name] = []
        return report["phases"][name]

    # R0: the number form, with the counts call and without it
    p0 = phase("0_number_control")
    q0 = f'"{CTRL_NUMBER[0]}".pn.'
    e = client.run(q0, "USPAT", n=5, counts=True)
    e["variant"], e["pass"] = "counts then search", any(x["guid"] == CTRL_NUMBER[1] for x in e["docs"])
    p0.append(strip_private(e))
    e = client.run(q0, "USPAT", n=5, counts=False)
    e["variant"], e["pass"] = "search only", any(x["guid"] == CTRL_NUMBER[1] for x in e["docs"])
    p0.append(strip_private(e))
    report["meta"]["number_control_pass"] = all(x["pass"] for x in p0)
    report["meta"]["search_only_works"] = p0[1]["pass"]

    # R1: newest documents per watch term and database since 2019, to find known answers
    p1 = phase("1_known_answers")
    known = {}
    for db, end in dbs:
        for name in WATCHLIST:
            if late():
                report["meta"]["truncated"] = "phase 1"
                break
            q = f"{fill(PROD_ASSIGNEE, name=name)} AND " + RANGE.format(a="20190101", b=compact(end))
            e = client.run(q, db, n=3, counts=False)
            e["term"] = name
            if db == "USPAT" and name == CTRL_NAME:
                e["pass"] = any(x["guid"] == CTRL_GUID for x in e["docs"])
                report["meta"]["range_control_pass"] = e["pass"]
            p1.append(strip_private(e))
            if e["docs"]:
                known.setdefault(db, []).append((name, e["docs"][0]))

    # R2: the production form (assignee AND exact date) and the OR form, on the documents just found
    p2 = phase("2_production_form_on_known_answers")
    r2_ok = True
    for db, items in known.items():
        for name, d in items[:3]:
            for kind, qa in (("single", fill(PROD_ASSIGNEE, name=name)), ("or", or_query(PROD_ASSIGNEE, WATCHLIST))):
                if late():
                    report["meta"]["truncated"] = "phase 2"
                    break
                e = client.run(f"{qa} AND {fill(PROD_DATE, day=d['date'])}", db, n=100, counts=False)
                e["kind"], e["expect"] = kind, d["guid"]
                e["pass"] = any(x["guid"] == d["guid"] for x in e["docs"]) and all(x["date"] == d["date"] for x in e["docs"])
                e["foreign_docs"] = [x["guid"] for x in e["docs"] if not matched_terms(x, WATCHLIST)]
                r2_ok = r2_ok and e["pass"]
                p2.append(strip_private(e))
    report["meta"]["known_answers"] = {db: [(n, d["guid"], d["date"]) for n, d in items[:3]] for db, items in known.items()}
    report["meta"]["production_form_pass"] = bool(p2) and r2_ok

    # R3: how many documents a whole day has, per eight weeks
    p3 = phase("3_date_totals")
    days = [(db, d.isoformat()) for db, wd in (("USPAT", 1), ("US-PGPUB", 3)) for d in recent_weekdays(wd, today, WEEKS)]
    totals_ok = True
    for db, day in days:
        if late():
            report["meta"]["truncated"] = "phase 3"
            break
        e = client.run(fill(PROD_DATE, day=day), db, n=1, counts=True)
        e["day"] = day
        n = e["counts"].get("num_results")
        e["pass"] = e["total"] is not None and e["total"] >= MIN_TOTAL and n == e["total"]
        totals_ok = totals_ok and e["pass"]
        p3.append(strip_private(e))
    report["meta"]["totals_pass"] = bool(p3) and totals_ok

    # R4: the weekly reading for eight weeks, assignee field and all-fields phrase, one OR query each
    p4 = phase("4_eight_weeks_or")
    by_key = {}
    for db, day in days:
        for kind, form in (("assignee", PROD_ASSIGNEE), ("phrase", PHRASE_FORM[1])):
            if late():
                report["meta"]["truncated"] = "phase 4"
                break
            e = client.run(f"{or_query(form, WATCHLIST)} AND {fill(PROD_DATE, day=day)}", db, n=100, counts=False)
            e["day"], e["kind"] = day, kind
            e["truncated_page"] = bool(e["total"] and e["total"] > e["n_docs"])
            for x in e["docs"]:
                x["terms"] = matched_terms(x, WATCHLIST)
            by_key[(db, day, kind)] = {x["guid"] for x in e["docs"]}
            report["weekly"].append({"db": db, "day": day, "kind": kind, "docs": e["n_docs"], "total": e["total"]})
            p4.append(strip_private(e))

    # R5: is one OR query the same as fifteen single-term queries? most recent week, both kinds
    p5 = phase("5_or_vs_per_term")
    for db, day in ((dbs[0][0], grant_day), (dbs[1][0], pub_day)):
        for kind, form in (("assignee", PROD_ASSIGNEE), ("phrase", PHRASE_FORM[1])):
            union, complete = set(), True
            for name in WATCHLIST:
                if late():
                    report["meta"]["truncated"] = "phase 5"
                    complete = False
                    break
                e = client.run(f"{fill(form, name=name)} AND {fill(PROD_DATE, day=day)}", db, n=100, counts=False)
                e["term"], e["kind"], e["day"] = name, kind, day
                union |= {x["guid"] for x in e["docs"]}
                p5.append(strip_private(e))
            orset = by_key.get((db, day, kind))
            report["or_vs_term"].append({
                "db": db, "day": day, "kind": kind, "complete": complete,
                "or_guids": sorted(orset or []), "union_guids": sorted(union),
                "equal": complete and orset is not None and orset == union,
            })

    unrecovered = [
        e for es in report["phases"].values() for e in es
        if e.get("search", {}).get("http") == 429 or e.get("counts", {}).get("http") == 429
    ]
    report["meta"]["rate_limit_events"] = len(client.events)
    report["meta"]["unrecovered_429"] = len(unrecovered)
    report["meta"]["calls"] = client.calls
    report["meta"]["session_renewals"] = client.renewed
    report["meta"]["seconds"] = round(time.monotonic() - t0, 1)
    report["rate_limit_events"] = client.events[:20]
    report["session"] = client.session_log
    eq = [x["equal"] for x in report["or_vs_term"]]
    report["ok"] = bool(
        report["meta"]["number_control_pass"] and report["meta"].get("range_control_pass")
        and report["meta"]["production_form_pass"] and report["meta"]["totals_pass"]
        and eq and all(eq) and not unrecovered and not report["meta"].get("truncated")
    )
    report["verdict"] = [
        f"number control (counts+search / search only): {[x['pass'] for x in p0]}",
        f"range + assignee control (RUWT since 2019 includes {CTRL_GUID}): {report['meta'].get('range_control_pass')}",
        f"production form finds every known answer, single and OR: {report['meta']['production_form_pass']}",
        f"eight-week date totals all >= {MIN_TOTAL} and counts == search: {report['meta']['totals_pass']}",
        f"OR query equals the union of single-term queries: {eq or 'NOT RUN'}",
        f"429 events {len(client.events)}, unrecovered {len(unrecovered)}, calls {client.calls}, {report['meta']['seconds']} s",
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
    if report.get("weekly"):
        out += ["## weekly reading (OR over the watchlist): documents returned / total matching", "",
                "| day | db | assignee field | all-fields phrase |", "|---|---|---|---|"]
        rows = {}
        for w in report["weekly"]:
            rows.setdefault((w["day"], w["db"]), {})[w["kind"]] = f"{w['docs']} / {w['total']}"
        for (day, db), v in sorted(rows.items(), reverse=True):
            out.append(f"| {day} | {db} | {v.get('assignee', '-')} | {v.get('phrase', '-')} |")
        out.append("")
    if report.get("or_vs_term"):
        out += ["## OR query against the union of single-term queries", "", "| day | db | kind | OR | union | equal |", "|---|---|---|---|---|---|"]
        for c in report["or_vs_term"]:
            out.append(f"| {c['day']} | {c['db']} | {c['kind']} | {len(c['or_guids'])} | {len(c['union_guids'])} | {c['equal']} |")
        out.append("")
    if report.get("rate_limit_events"):
        out += ["## rate-limit events (first 20)", ""]
        out += [f"- t={e['t']}s call {e['call_no']} {e['path']} headers {e['headers']} body {e['body']!r} waited {e.get('waited_s')}" for e in report["rate_limit_events"]]
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
    today = (datetime.date.fromisoformat(os.environ["PPUBS_TODAY"]) if os.environ.get("PPUBS_TODAY")
             else datetime.datetime.utcnow().date())
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
    report = (build_reading_report if MODE == "reading" else build_report)(client, today, grant_day, pub_day)
    jp, mp = write_outputs(report)
    print(render_md(report))
    print(f"Wrote {jp} and {mp}")
    return 0 if report["ok"] else 1


def self_test():
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import tempfile
    import ppubs_stand_in as si

    global BASE, PAUSE, MIN_DATE_DOCS, MODE, BACKOFF, MIN_TOTAL, DEADLINE_S
    PAUSE, MIN_DATE_DOCS, BACKOFF, MIN_TOTAL = 0.0, 5, 0.0, 20
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


    # ---- reading mode against a stand-in laid out like the real host: eight weeks of days
    MODE = "reading"
    today = datetime.date(2026, 11, 3)
    rc = [si.doc("US-10846193-B2", "USPAT", "2020-11-24", ["Dynatrace LLC"]),
          si.doc("US-10328326-B2", "USPAT", "2019-06-25", ["RUWT, LLC"]),
          si.doc("US-9900001-B2", "USPAT", "2026-10-13", ["Datadog, Inc."]),
          si.doc("US-9900002-B2", "USPAT", "2026-10-27", ["Akamai Technologies, Inc."]),
          si.doc("US-20260000001-A1", "US-PGPUB", "2026-10-29", ["Dynatrace LLC"]),
          si.doc("US-20260000003-A1", "US-PGPUB", "2026-10-29", ["Sportradar AG"]),
          si.doc("US-20260000004-A1", "US-PGPUB", "2026-10-22", ["LogRocket, Inc."]),
          si.doc("US-20260000005-A1", "US-PGPUB", "2026-10-15", ["Stats Perform Ltd"]),
          si.doc("US-20260000002-A1", "US-PGPUB", "2026-10-29", [], "Proactive repair for New Relic code review")]
    for wd, db, prefix in ((1, "USPAT", "US-8"), (3, "US-PGPUB", "US-2025")):
        for dd in recent_weekdays(wd, today, WEEKS):
            rc += [si.doc(f"{prefix}{dd.month:02d}{dd.day:02d}{i:04d}", db, dd.isoformat(), ["Other Co"]) for i in range(25)]

    def run_reading(mode="ok", corpus=None):
        base, log, stop = si.serve(corpus or rc, None, mode=mode)
        try:
            global BASE
            BASE = base
            with tempfile.TemporaryDirectory() as td:
                os.environ["PPUBS_OUT"] = td
                os.environ["PPUBS_TODAY"] = "2026-11-03"
                os.environ["GRANT_DAY"], os.environ["PUB_DAY"] = "2026-10-27", "2026-10-29"
                code = main()
                rep = json.load(open(os.path.join(td, [f for f in os.listdir(td) if f.endswith(".json")][0])))
            return code, rep
        finally:
            stop()

    code, rep = run_reading()
    t("reading: a faithful host passes", code == 0)
    t("reading: search without the counts call works and is recorded", rep["meta"]["search_only_works"] is True)
    t("reading: the range + assignee control found the RUWT patent", rep["meta"]["range_control_pass"] is True)
    t("reading: the production form finds every known answer, single and OR", rep["meta"]["production_form_pass"] is True)
    t("reading: eight weeks of date totals are all above the floor", rep["meta"]["totals_pass"] is True and len(rep["phases"]["3_date_totals"]) == 16)
    t("reading: the OR query equals the union of single-term queries, all four", len(rep["or_vs_term"]) == 4 and all(c["equal"] for c in rep["or_vs_term"]))
    wk = {(w["day"], w["db"], w["kind"]): w["docs"] for w in rep["weekly"]}
    t("reading: the all-fields phrase sees the document the assignee field cannot",
      wk[("2026-10-29", "US-PGPUB", "phrase")] == 3 and wk[("2026-10-29", "US-PGPUB", "assignee")] == 2)
    t("reading: the planted USPAT grant is read on the grant day", wk[("2026-10-27", "USPAT", "assignee")] == 1)
    t("reading: nothing was rate limited on a host that does not", rep["meta"]["rate_limit_events"] == 0)

    code, rep = run_reading("rate429")
    t("reading: a host that answers every fourth call 429 is recovered by backing off", code == 0 and rep["meta"]["rate_limit_events"] > 0 and rep["meta"]["unrecovered_429"] == 0)
    code, rep = run_reading("rate429_always")
    t("reading: a host that answers every call 429 fails the run, and counts the 429s as unrecovered", code == 1 and rep["meta"]["unrecovered_429"] > 0)
    code, rep = run_reading("no_and")
    t("reading: a host that cannot conjoin fails", code == 1)
    code, rep = run_reading("or_zero")
    t("reading: a host that answers a long OR with zero documents fails, although every single term works",
      code == 1 and rep["meta"]["production_form_pass"] is False)
    code, rep = run_reading("or_loses")
    t("reading: a long OR that silently loses one assignee's documents fails although every known answer is found",
      code == 1 and rep["meta"]["production_form_pass"] is True and [c["equal"] for c in rep["or_vs_term"]] == [True, True, False, False])
    code, rep = run_reading("rate429_all:20260908| OR ")
    t("reading: a 429 that no retry recovers on a day with no hits still fails the run",
      code == 1 and rep["meta"]["unrecovered_429"] > 0 and rep["meta"]["totals_pass"] is True and all(c["equal"] for c in rep["or_vs_term"]))
    code, rep = run_reading("counts_off")
    t("reading: a counts call that disagrees with the search total fails the totals check",
      code == 1 and rep["meta"]["totals_pass"] is False)
    saved, DEADLINE_S = DEADLINE_S, 0.0
    try:
        code, rep = run_reading()
    finally:
        DEADLINE_S = saved
    t("reading: a run cut short by its deadline fails and says where it stopped",
      code == 1 and bool(rep["meta"].get("truncated")))
    thin = [d for d in rc if d["assigneeName"] != ["Other Co"]]
    for wd, db, prefix in ((1, "USPAT", "US-8"), (3, "US-PGPUB", "US-2025")):
        for dd in recent_weekdays(wd, today, WEEKS):
            thin += [si.doc(f"{prefix}{dd.month:02d}{dd.day:02d}{i:04d}", db, dd.isoformat(), ["Other Co"]) for i in range(5)]
    code, rep = run_reading("ok", thin)
    t("reading: days with too few documents fail the totals floor although every query returns 200",
      code == 1 and rep["meta"]["totals_pass"] is False)
    MODE = "forms"

    print(f"\n{passed}/{passed + failed} checks passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(self_test() if "--self-test" in sys.argv else main())
