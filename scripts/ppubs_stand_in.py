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
    measured shape of PPUBS' limit), "rate429_always" answers every API call so, "or_zero" answers a query with
    five or more OR operators with zero documents and status 200, "or_loses" answers
    such a query with every document except Sportradar's, "counts_off" makes the counts call
    disagree with the search by one, and "rate429_all:a|b"
    answers 429, on every try, to a call whose body contains both a and b.

WHAT IT DOES NOT KNOW: the real response shapes. `numFound` and `patents` come
from the key names patent_fetch.py reads (`result.get("patents") or
result.get("docs")`); the rest is a guess and is labelled as one in the probe's
report. Measure the real host before trusting any of it.

Importable. Nothing runs at import.
"""
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
        return (doc.get("datePublished") or "")[:10].replace("-", "") == m.group("v").replace("-", "")
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
        return term.strip('"').lower() in _doc_text(doc)
    return None


class _Unsupported(Exception):
    pass


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


def make_handler(corpus, syntax, mode, log):
    matchers = build_matchers(syntax)
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
            if mode.startswith("rate429_all:"):  # 429 for any call whose body holds every listed substring
                raw = json.dumps(body)
                if all(part in raw for part in mode.split(":", 1)[1].split("|")):
                    self._send(429, {"message": "Too many requests"}, headers={"Retry-After": "0"})
                    return
            if mode in ("rate429", "rate429_always"):
                state["n"] += 1
                if mode == "rate429_always" or state["n"] % 4 == 0:
                    self._send(429, {"message": "Too many requests"}, headers={"Retry-After": "0"})
                    return
            if self.path == "/api/searches/counts":
                docs, _ = run_query(body, corpus, matchers, mode)
                # measured: the echoed query plus numResults
                self._send(200, {"id": None, "caseId": body.get("caseId"),
                                 "numResults": len(docs) + (1 if mode == "counts_off" else 0), "q": body.get("q")})
                return
            if self.path == "/api/searches/searchWithBeFamily":
                docs, _ = run_query(body["query"], corpus, matchers, mode)
                start, n = int(body.get("start", 0)), int(body.get("pageCount", 10))
                page = docs[start:start + n]
                # measured: numFound is the PAGE size, totalResults is the total
                self._send(200, {"numFound": len(page), "perPage": n, "page": start // max(n, 1),
                                 "totalResults": len(docs), "error": None, "patents": page})
                return
            self._send(404, {"error": "stand-in: no such path"})

    return H


def serve(corpus, syntax=None, mode="ok"):
    """Start the stand-in on an ephemeral port. -> (base_url, request_log, stop())"""
    log = []
    srv = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(corpus, syntax or DEFAULT_SYNTAX, mode, log))
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()

    def stop():
        srv.shutdown()
        srv.server_close()

    return f"http://127.0.0.1:{srv.server_address[1]}", log, stop


def doc(guid, db, date, assignees, title="t"):
    """A corpus entry in the shape patent_fetch.py's extract_metadata reads."""
    return {
        "guid": guid,
        "type": db,
        "datePublished": f"{date}T00:00:00Z",
        "assigneeName": list(assignees),
        "inventionTitle": title,
    }
