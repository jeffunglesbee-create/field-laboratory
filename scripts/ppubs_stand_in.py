#!/usr/bin/env python3
"""A stand-in for the anonymous half of ppubs.uspto.gov, for tests that must not
reach the real host.

WHY THIS EXISTS. ppubs.uspto.gov is outside the dev sandbox's egress allowlist,
so everything that talks to it can only be measured on a runner. A runner round
trip is minutes; a defect in the probe or in the watcher that reads PPUBS should
cost seconds. This serves the same five paths patent_fetch.py uses
(jubilant-bassoon .github/scripts/patent_fetch.py, lines 20 to 25) over a corpus
the test hands it, so the CLIENT code runs unmodified against a local address.

WHAT IT DELIBERATELY MODELS, because each is a way a real source goes wrong
without saying so:
  * a query form the server does not understand answers 200 with zero documents,
    not an error. The syntax it does understand is the `syntax` argument, so a
    test can make the true form something other than the first one tried.
  * every API path wants the X-Access-Token the session call issued, and answers
    403 without it.
  * `mode` can make the whole host misbehave: "http500" answers 500 everywhere,
    "html" answers 200 with an HTML page (the shape of a bot wall), "empty"
    answers 200 with an empty JSON object, "no_and" answers every single term
    correctly and every conjunction with zero documents, "rate429" answers every
    fourth API call 429 {"message": "Too many requests"} with Retry-After 0 (the
    measured shape of PPUBS' limit), "rate429_always" answers every API call so,
    "or_zero" answers a query with five or more OR operators with zero documents
    and status 200, "or_loses" answers such a query with every document except
    Sportradar's, "counts_low" makes the counts call report one document fewer than
    the search holds families, "total_is_total" makes totalResults the total of
    matching documents instead of the documents on the page (the shape the probe's
    first version assumed, and the real host does not have), "fam_off" makes
    numberOfFamilies one too many ("fam_off_or": only on a query with an OR), "page_cap:N" silently returns at most N families
    whatever pageCount asks, "docs_short" drops the last document of every page,
    "no_families" leaves numberOfFamilies out, "no_phrase" answers every bare
    phrase query with zero documents, "phrase_lossy" looks for a bare phrase in the
    title only, "flaky500" fails every fifth API call once with a 500, "date_loose" lets a date
    term also match the day two days later, "no_guid" sends documents without a guid, "json_list" answers a JSON list,
    "error_field" fills the answer's `error`, "bare_patents" answers only
    {"patents": [...]}, the one key patent_fetch.py reads, "zero_date_page" answers a bare day
    at page size 100 with nothing, and "rate429_all:a|b" answers 429, on every try, to a
    call whose body contains both a and b.

WHAT IT KNOWS, measured on the real host (probe run 2, 2026-11-03, 152 search
responses, no exception): a search answers `numberOfFamilies`, the total number of
matching FAMILIES; `numFound`, the number of families on THIS page, which is
max(0, min(pageCount, numberOfFamilies - start)); `patents`, every matching
document of those families, so it can be longer than numFound; and `totalResults`,
the number of documents on this page (len(patents)), not a total. `perPage` echoes
pageCount, `page` is start // pageCount, `totalPages` is 0 even when thousands
match, `error` is null. The counts call answers `numResults`, the number of
DOCUMENTS, which is never below numberOfFamilies. A corpus entry may carry a
`family` (see doc()); documents without one are families of their own.

WHAT IT DOES NOT KNOW: how the real host decides which documents share a family,
what a page holds when one family has members in both databases, the contents of
`hlSnippets`, or what `cursorMarker` encodes. Those keys are present with inert
values so a consumer that reads them does not crash; nothing here says what they mean.

Importable. Nothing runs at import.
"""
import datetime
import json
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TOKEN = "stand-in-token"

TOKEN_RE = re.compile(
    r'\(|\)|\bAND\b|\bOR\b'
    r'|@\w+(?:>=|<=|=)"[^"]*"(?:(?:>=|<=)"[^"]*")?'
    r'|"[^"]*"(?:\.\w+\.)?'
    r'|[^\s()]+'
)

DEFAULT_SYNTAX = {"date": '@PD="{d}"', "assignee": '"{n}".as.', "number": '"{n}".pn.',
                  "range": '@PD>="{a}"<="{b}"'}


def _term_regex(template, field, pattern):
    """A compiled regex for one term form. The first `{field}` becomes a capture
    group matching `pattern` and any later one must repeat it, so a range form
    such as @PD>="{d}"<="{d}" only matches a range whose two ends agree."""
    marker = re.escape("{" + field + "}")
    esc = re.escape(template)
    first, _, rest = esc.partition(marker)
    esc = first + "(?P<v>" + pattern + ")" + rest.replace(marker, "(?P=v)")
    return re.compile("^" + esc + "$")


def _range_regex(template):
    """A two-ended range form: the first {a} and the first {b} are captured, so the
    ends need not agree."""
    esc = re.escape(template)
    esc = esc.replace(re.escape("{a}"), r"(?P<a>\d{8})").replace(re.escape("{b}"), r"(?P<b>\d{8})")
    return re.compile("^" + esc + "$")


def build_matchers(syntax):
    return {
        "date": _term_regex(syntax["date"], "d", r"\d{8}|\d{4}-\d{2}-\d{2}"),
        "assignee": _term_regex(syntax["assignee"], "n", r'[^"]+?'),
        "number": _term_regex(syntax["number"], "n", r'[^"]+?'),
        "range": _range_regex(syntax["range"]) if syntax.get("range") else None,
    }


def _doc_text(doc):
    return " ".join(
        [doc.get("inventionTitle") or ""] + list(doc.get("assigneeName") or [])
    ).lower()


def term_matches(term, doc, matchers):
    """True / False for a recognised term, None for one this host does not understand."""
    m = matchers["date"].match(term)
    if m:
        want, have = m.group("v").replace("-", ""), (doc.get("datePublished") or "")[:10].replace("-", "")
        if matchers.get("date_loose"):  # a date form that also matches the day two days later
            try:
                later = (datetime.datetime.strptime(want, "%Y%m%d") + datetime.timedelta(days=2)).strftime("%Y%m%d")
            except ValueError:
                return False
            return have in (want, later)
        return have == want
    if matchers.get("range"):
        m = matchers["range"].match(term)
        if m:
            d = (doc.get("datePublished") or "")[:10].replace("-", "")
            return m.group("a") <= d <= m.group("b")
    m = matchers["assignee"].match(term)
    if m:
        return m.group("v").lower() in " ".join(doc.get("assigneeName") or []).lower()
    m = matchers["number"].match(term)
    if m:
        return m.group("v") in (doc.get("guid") or "")
    if re.match(r'^"[^"]*"$', term):  # a bare phrase: the stand-in's "all fields"
        text = (doc.get("inventionTitle") or "").lower() if matchers.get("phrase_title_only") else _doc_text(doc)
        return term.strip('"').lower() in text
    return None


class _Unsupported(Exception):
    pass


def _family(d):
    """The family a corpus entry belongs to: its `family`, else its own guid."""
    return d.get("family") or d.get("guid")


def _public(d):
    """A corpus entry as the host would send it: without the stand-in's own `family` key."""
    return {k: v for k, v in d.items() if k != "family"}


def evaluate(query, doc, matchers):
    """AND binds tighter than OR; parentheses group. Raises _Unsupported on a term
    the host does not understand, which the caller turns into zero documents."""
    toks = TOKEN_RE.findall(query)
    pos = [0]

    def peek():
        return toks[pos[0]] if pos[0] < len(toks) else None

    def take():
        t = toks[pos[0]]
        pos[0] += 1
        return t

    def parse_or():
        v = parse_and()
        while peek() == "OR":
            take()
            r = parse_and()
            v = v or r
        return v

    def parse_and():
        v = parse_atom()
        while peek() == "AND":
            take()
            r = parse_atom()
            v = v and r
        return v

    def parse_atom():
        t = peek()
        if t is None:
            raise _Unsupported("unexpected end")
        if t == "(":
            take()
            v = parse_or()
            if peek() != ")":
                raise _Unsupported("missing )")
            take()
            return v
        take()
        r = term_matches(t, doc, matchers)
        if r is None:
            raise _Unsupported(t)
        return r

    v = parse_or()
    if pos[0] != len(toks):
        raise _Unsupported("trailing tokens")
    return v


def run_query(body_query, corpus, matchers, mode="ok"):
    """-> (matching docs, unsupported?)"""
    q = body_query.get("q") or ""
    if mode == "no_and" and " AND " in q:  # a host that answers single terms but not a conjunction
        return [], True
    if mode == "or_zero" and q.count(" OR ") >= 5:  # a host that answers a long disjunction with nothing
        return [], True
    if mode == "no_phrase" and any(re.fullmatch(r'"[^"]*"', t) for t in TOKEN_RE.findall(q)):  # no bare phrase is understood
        return [], True
    drop = None
    if mode == "or_loses" and q.count(" OR ") >= 5:  # a long disjunction silently loses one assignee's documents
        drop = "sportradar"
    dbs = {f.get("databaseName") for f in body_query.get("databaseFilters") or []}
    out = []
    try:
        for doc in corpus:
            if dbs and doc.get("type") not in dbs:
                continue
            if drop and drop in " ".join(doc.get("assigneeName") or []).lower():
                continue
            if evaluate(q, doc, matchers):
                out.append(doc)
    except _Unsupported:
        return [], True
    out.sort(key=lambda d: d.get("datePublished") or "", reverse=True)
    return out, False


def make_handler(corpus, syntax, mode, log, queries=None):
    matchers = build_matchers(syntax)
    if mode == "phrase_lossy":  # a bare phrase is looked for in the title only
        matchers["phrase_title_only"] = True
    if mode == "date_loose":  # a date term also matches the day two days later
        matchers["date_loose"] = True
    state = {"n": 0}

    class H(BaseHTTPRequestHandler):
        def log_message(self, *a):  # silent
            pass

        def _send(self, code, payload, ctype="application/json", headers=None):
            raw = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(raw)))
            for k, v in (headers or {}).items():
                self.send_header(k, v)
            self.end_headers()
            self.wfile.write(raw)

        def _body(self):
            n = int(self.headers.get("Content-Length") or 0)
            return json.loads(self.rfile.read(n) or b"null") if n else None

        def _mode_override(self):
            if mode == "http500":
                self._send(500, {"error": "stand-in: http500"})
                return True
            if mode == "html":
                self._send(200, b"<html><body>Access Denied</body></html>", "text/html")
                return True
            return False

        def do_GET(self):
            log.append(("GET", self.path))
            if self._mode_override():
                return
            if self.path.startswith("/pubwebapp/"):
                self._send(200, b"<html>app</html>", "text/html", {"Set-Cookie": "JSESSIONID=stand-in; Path=/"})
            else:
                self._send(404, {"error": "stand-in: no such path"})

        def do_POST(self):
            body = self._body()
            log.append(("POST", self.path))
            if self._mode_override():
                return
            if self.path == "/api/users/me/session":
                self._send(200, {"userCase": {"caseId": 4242}}, headers={"X-Access-Token": TOKEN})
                return
            if self.headers.get("X-Access-Token") != TOKEN:
                self._send(403, {"error": "stand-in: token"})
                return
            if mode == "empty":
                self._send(200, {})
                return
            if mode == "json_list":
                self._send(200, [])
                return
            if mode.startswith("rate429_all:"):  # 429 for any call whose body holds every listed substring
                raw = json.dumps(body)
                if all(part in raw for part in mode.split(":", 1)[1].split("|")):
                    self._send(429, {"message": "Too many requests"}, headers={"Retry-After": "0"})
                    return
            if mode == "flaky500":  # every fifth API call fails once with a 500
                state["n"] += 1
                if state["n"] % 5 == 0:
                    self._send(500, {"error": "stand-in: flaky500"})
                    return
            if mode in ("rate429", "rate429_always"):
                state["n"] += 1
                if mode == "rate429_always" or state["n"] % 4 == 0:
                    self._send(429, {"message": "Too many requests"}, headers={"Retry-After": "0"})
                    return
            if queries is not None and self.path in ("/api/searches/counts", "/api/searches/searchWithBeFamily"):
                q = body.get("q") if self.path.endswith("counts") else (body.get("query") or {}).get("q")
                queries.append((self.path.rsplit("/", 1)[1], q, body.get("start"), body.get("pageCount")))
            if self.path == "/api/searches/counts":
                docs, _ = run_query(body, corpus, matchers, mode)
                n_docs = len(docs)
                if mode == "counts_low":  # fewer documents than the search has families
                    n_docs = max(0, len({_family(d) for d in docs}) - 1)
                # measured: the echoed query plus numResults, a count of DOCUMENTS
                self._send(200, {"id": None, "caseId": body.get("caseId"),
                                 "numResults": n_docs, "q": body.get("q")})
                return
            if self.path == "/api/searches/searchWithBeFamily":
                docs, _ = run_query(body["query"], corpus, matchers, mode)
                start, n = int(body.get("start", 0)), int(body.get("pageCount", 10))
                fams = []
                for d in docs:  # families in result order
                    f = _family(d)
                    if f not in fams:
                        fams.append(f)
                if mode.startswith("page_cap:"):  # a silent cap on the page, whatever was asked
                    n_served = min(n, int(mode.split(":", 1)[1]))
                else:
                    n_served = n
                if mode == "zero_date_page" and n >= 100 and " AND " not in (body["query"].get("q") or "") and " OR " not in (body["query"].get("q") or ""):
                    fams = []  # a bare day listed at page size 100 comes back empty
                page_fams = set(fams[start:start + n_served])
                page = [_public(d) for d in docs if _family(d) in page_fams]
                if mode == "docs_short" and page:  # a page that lost its last document
                    page = page[:-1]
                if mode == "no_guid":  # documents that carry no guid
                    page = [{k: v for k, v in d.items() if k != "guid"} for d in page]
                q = body["query"].get("q") or ""
                n_total_fams = len(fams) + (1 if mode == "fam_off" or (mode == "fam_off_or" and " OR " in q) else 0)
                tail = {} if mode == "no_families" else {"numberOfFamilies": n_total_fams}
                if mode == "bare_patents":  # only the key patent_fetch.py reads
                    self._send(200, {"patents": page})
                    return
                # measured: numFound = families on this page, numberOfFamilies = all matching families,
                # totalResults = documents on this page, patents may be longer than numFound
                self._send(200, {"numFound": len(page_fams), "perPage": n, "page": start // max(n, 1),
                                 "totalPages": 0, "hlSnippets": [], "sort": body.get("sort"),
                                 "query": body.get("query", {}).get("q"), "duration": 1, "highlightingTime": 0,
                                 "cursorMarker": "*" if not page else "stand-in-cursor",
                                 "totalResults": len(docs) if mode == "total_is_total" else len(page),
                                 "error": "stand-in: error_field" if mode == "error_field" else None,
                                 "patents": page, "qtime": 1, **tail})
                return
            self._send(404, {"error": "stand-in: no such path"})

    return H


def serve(corpus, syntax=None, mode="ok", queries=None):
    """Start the stand-in on an ephemeral port. -> (base_url, request_log, stop()).
    `queries`, if a list, receives (call, q, start, pageCount) for every counts and search call."""
    log = []
    srv = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(corpus, syntax or DEFAULT_SYNTAX, mode, log, queries))
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()

    def stop():
        srv.shutdown()
        srv.server_close()

    return f"http://127.0.0.1:{srv.server_address[1]}", log, stop


def doc(guid, db, date, assignees, title="t", family=None):
    """A corpus entry in the shape patent_fetch.py's extract_metadata reads. `family`
    puts several entries in one family: a search then counts them once in numFound and
    numberOfFamilies and returns all of them in patents. It is the stand-in's own key
    and is never sent."""
    d = {
        "guid": guid,
        "type": db,
        "datePublished": f"{date}T00:00:00Z",
        "assigneeName": list(assignees),
        "inventionTitle": title,
    }
    if family:
        d["family"] = family
    return d
