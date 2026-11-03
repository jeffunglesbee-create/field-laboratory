#!/usr/bin/env python3
"""Regression check for field-relay-nba's scripts/drama-backfill.mjs: a read that failed is not a score.

WHAT IT HOLDS. On 2026-10-31 at 19:37Z the backfill asked the relay for ESPN's summary of Bayern v Dortmund
(event 401884754), was answered HTTP 403, and its error path wrote drama_peak = 0 "to clear this game from the
missing queue". /archive/drama-by-id writes only while drama_peak IS NULL (CC-CMD-2026-07-06), so that 0 is
final: the same request answers 200 today and the row still says 0, next to five Bundesliga rows of that day
that hold 52 to 70. This check runs the script UNMODIFIED against a local copy of the relay routes it calls
(the missing-queue list, the guarded write, the ESPN proxy with the relay's own pass-through of upstream
statuses, the two recompute posts) and requires:

  * a read that failed (403, 429, 500, 503, a dropped connection, a body that is not JSON) writes NOTHING for
    that game: the row stays NULL, the game is fetched once in the run, the rest of the batch is still scored,
    the run ends non-zero and says "deferred", and the NEXT run scores it;
  * only ESPN saying the event does not exist (404, 410) stores the 0 "cannot be scored" mark, once, through
    each reader (soccer, MLB, WNBA), and the run still counts it as an error;
  * a batch in which every game is deferred ends the loop (the relay keeps listing a NULL row, 20 at a time);
  * what already worked is kept: a game is scored, an unsupported sport and an empty reading store 0, and a
    write the relay refused is not stored as a score;
  * scripts/reset-drama-refused-read.mjs, the one-shot that sets the 10-31 row back to NULL through the relay's
    authenticated /d1/execute, touches nothing unless the row is exactly the stored refusal, ESPN answers for the
    event now and the update changes exactly one row, and checks it by reading the row back.

WHAT IT DOES NOT HOLD. The real relay and the real ESPN. The stand-in answers the shapes the script reads
(the relay's relayFetch passes an upstream status through with the body "espn-summary returned N"; probed live
2026-11-03: a missing event answers 404 for soccer and MLB). It does not run the AFL reader, which fetches
ESPN directly.

Usage (repository root; stdlib only, needs `node`):
  python3 scripts/check-drama-backfill.py [--script PATH] [--only NAME[,NAME]]
  --script  default .relay-src/scripts/drama-backfill.mjs (verify.yml checks the relay out there); the
            script imports ../src/identity-resolver.js, so it must sit in a tree with a src/ beside scripts/
  --reset-script  default .relay-src/scripts/reset-drama-refused-read.mjs (scenario reset_row)
  --only    run only the named scenarios (the mutation harness uses this)
"""
import argparse
import json
import os
import pathlib
import re
import shutil
import socket
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

DEFAULT_SCRIPT = ".relay-src/scripts/drama-backfill.mjs"
DEFAULT_RESET = ".relay-src/scripts/reset-drama-refused-read.mjs"
RESET_ID, RESET_EVENT = "Bundesliga_2026-10-31_e401884754", "401884754"
NOKEYEVENTS = "nokeyevents"
OK, EMPTY, RESET, BADJSON = "ok", "empty", "reset", "badjson"
LIST_FIELDS = ("id", "sport", "date", "home", "away", "home_score", "away_score", "espn_event_id")

SOCCER_OK = {
    "header": {"competitions": [{"competitors": [
        {"homeAway": "home", "team": {"id": "10"}}, {"homeAway": "away", "team": {"id": "20"}}]}]},
    "keyEvents": [
        {"type": {"text": "Goal", "abbreviation": "g"}, "team": {"id": "10"}, "period": {"number": 1}, "clock": {"displayValue": "30'"}},
        {"type": {"text": "Goal", "abbreviation": "g"}, "team": {"id": "20"}, "period": {"number": 2}, "clock": {"displayValue": "70'"}},
    ],
}
MLB_OK = {"plays": [
    {"homeScore": 0, "awayScore": 0, "period": {"number": 1}, "clock": {"displayValue": ""}, "outs": 0},
    {"homeScore": 3, "awayScore": 3, "period": {"number": 9}, "clock": {"displayValue": ""}, "outs": 2,
     "onSecond": {}, "pitchCount": {"balls": 3, "strikes": 2}},
]}
DROP = object()  # answer by closing the connection


def game(n, sport="Bundesliga", event=None, date="2026-10-31"):
    ev = str(event if event is not None else 4000000 + n)
    return {"id": f"{sport}_{date}_e{ev}", "sport": sport, "date": date, "home": f"Home{n}", "away": f"Away{n}",
            "home_score": 2, "away_score": 2, "espn_event_id": ev}


class Relay:
    """The routes the script calls, with the guard the real /archive/drama-by-id has."""

    def __init__(self, games, espn=None, fail_write=(), update_changes=None, update_noop=False):
        self.rows = {g["id"]: dict(g, drama_peak=None, drama_arc=None) for g in games}
        self.order = [g["id"] for g in games]
        self.espn = dict(espn or {})
        self.fail_write = set(fail_write)
        self.writes = []      # (id, peak, arc, "stored" | "skipped" | "refused")
        self.espn_hits = {}   # event id -> requests
        self.recomputes = []  # (path, date)
        self.unknown = []
        self.listings = 0
        self.runaway = None  # set when one event is fetched more often than any correct run needs
        self.update_changes = update_changes  # /d1/execute UPDATE reports this many changes (None: the real count)
        self.update_noop = update_noop        # ... and reports changes without applying them
        self.d1 = []                          # (kind, params) of every /d1/execute call
        self.lock = threading.Lock()

    def stored(self, gid):
        return [w for w in self.writes if w[0] == gid and w[3] == "stored"]

    def handle(self, method, path, query, body, headers=None):
        headers = headers or {}
        with self.lock:
            if method == "GET" and path == "/archive/drama-missing":
                self.listings += 1
                limit = min(20, int((query.get("limit") or ["5"])[0] or 5))
                rows = [self.rows[i] for i in self.order if self.rows[i]["drama_peak"] is None][:limit]
                return 200, {"ok": True, "games": [{k: r[k] for k in LIST_FIELDS} for r in rows]}, "application/json"
            if method == "POST" and path == "/archive/drama-by-id":
                doc = json.loads(body or b"{}")
                gid = doc.get("id")
                if gid in self.fail_write:
                    self.writes.append((gid, doc.get("drama_peak"), doc.get("drama_arc"), "refused"))
                    return 500, {"ok": False, "error": "d1 busy", "id": gid}, "application/json"
                row = self.rows.get(gid)
                if row is not None and row["drama_peak"] is not None:
                    self.writes.append((gid, doc.get("drama_peak"), doc.get("drama_arc"), "skipped"))
                    return 200, {"ok": True, "skipped": True, "reason": "already_scored", "id": gid}, "application/json"
                if row is not None:
                    row["drama_peak"], row["drama_arc"] = doc.get("drama_peak"), doc.get("drama_arc")
                self.writes.append((gid, doc.get("drama_peak"), doc.get("drama_arc"), "stored"))
                return 200, {"ok": True, "id": gid, "changes": 1}, "application/json"
            m = re.match(r"^/espn-summary/sports/([a-z]+)/([a-z0-9.]+)/summary$", path)
            if method == "GET" and m:
                ev = (query.get("event") or [""])[0]
                self.espn_hits[ev] = self.espn_hits.get(ev, 0) + 1
                if self.espn_hits[ev] > 3 and not self.runaway:
                    self.runaway = f"event {ev} fetched {self.espn_hits[ev]} times"
                how = self.espn.get(ev, OK)
                if how is RESET:
                    return DROP
                if how == BADJSON:
                    return 200, "<html>maintenance</html>", "text/html"
                if isinstance(how, int):
                    return how, f"espn-summary returned {how}", "text/plain"
                if how == EMPTY:
                    return 200, {"plays": []}, "application/json"
                if how == NOKEYEVENTS:
                    return 200, {"keyEvents": []}, "application/json"
                return 200, (MLB_OK if m.group(1) in ("baseball", "basketball") else SOCCER_OK), "application/json"
            if method == "POST" and path == "/d1/execute":
                if headers.get("X-FIELD-Relay") != "stand-in":
                    return 401, "unauthorized", "text/plain"
                doc = json.loads(body or b"{}")
                sql, params = doc.get("sql", ""), doc.get("params") or []
                if sql.strip().upper().startswith("SELECT"):
                    self.d1.append(("select", params))
                    row = self.rows.get(params[0])
                    return 200, {"success": True, "results": [dict(row)] if row else [], "meta": {}}, "application/json"
                self.d1.append(("update", params))
                row = self.rows.get(params[0]) if params else None
                hit = bool(row) and row["drama_peak"] == 0 and row["drama_arc"] == params[1] and row["espn_event_id"] == params[2]
                if hit and not self.update_noop:
                    row["drama_peak"], row["drama_arc"] = None, None
                changes = self.update_changes if self.update_changes is not None else (1 if hit else 0)
                return 200, {"success": True, "results": [], "meta": {"changes": changes}}, "application/json"
            if method == "GET" and path.startswith("/fifa-rankings/"):
                return 404, "no ranking", "text/plain"
            if method == "POST" and path in ("/analytics/night-stars/recompute", "/analytics/jinx/recompute"):
                self.recomputes.append((path, (query.get("date") or [""])[0]))
                return 200, {}, "application/json"
            self.unknown.append((method, path))
            return 404, {"ok": False, "error": "not in the stand-in"}, "application/json"


def handler_for(relay):
    class H(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def _serve(self, method):
            u = urlparse(self.path)
            n = int(self.headers.get("Content-Length") or 0)
            res = relay.handle(method, u.path, parse_qs(u.query), self.rfile.read(n) if n else b"", self.headers)
            if res is DROP:
                self.close_connection = True
                try:
                    self.connection.shutdown(socket.SHUT_RDWR)
                except OSError:
                    pass
                return
            status, body, ctype = res
            data = (body if isinstance(body, str) else json.dumps(body)).encode()
            self.send_response(status)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            self._serve("GET")

        def do_POST(self):
            self._serve("POST")

    return H


def run_script(script, relay, timeout=120, secret="stand-in"):
    """One run of the script against `relay`. -> (exit code, stdout + stderr)."""
    srv = ThreadingHTTPServer(("127.0.0.1", 0), handler_for(relay))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    root = pathlib.Path(script).resolve().parent.parent
    env = {"PATH": os.environ.get("PATH", ""), "HOME": os.environ.get("HOME", "/tmp"),
           "RELAY_BASE": f"http://127.0.0.1:{srv.server_address[1]}"}
    if secret is not None:
        env["RELAY_SHARED_SECRET"] = secret
    try:
        p = subprocess.Popen(["node", str(pathlib.Path(script).resolve())], cwd=root, env=env,
                             stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        out = []
        reader = threading.Thread(target=lambda: out.append(p.stdout.read()), daemon=True)
        reader.start()
        t0 = time.monotonic()
        while p.poll() is None:
            if relay.runaway or time.monotonic() - t0 > timeout:
                p.kill()
                p.wait()
                reader.join(5)
                why = relay.runaway or f"no exit in {timeout} s"
                return 125, "".join(out) + f"\nRUNAWAY: {why}"
            time.sleep(0.05)
        reader.join(10)
        return p.returncode, "".join(out)
    finally:
        srv.shutdown()
        srv.server_close()


class Tally:
    def __init__(self):
        self.n = 0
        self.fails = []

    def ok(self, label, cond, detail=""):
        self.n += 1
        if not cond:
            self.fails.append(f"{label}" + (f"  [{detail}]" if detail else ""))


SCENARIOS = {}


def scenario(fn):
    SCENARIOS[fn.__name__] = fn
    return fn


def scored(relay, gid):
    s = relay.stored(gid)
    return len(s) == 1 and isinstance(s[0][1], (int, float)) and s[0][1] > 0 and s[0][2] is not None


@scenario
def scores(t, script):
    games = [game(1), game(2), game(3, "MLB", event=5000003)]
    r = Relay(games)
    code, log = run_script(script, r)
    t.ok("scores: exit 0", code == 0, f"exit {code}: {log[-300:]}")
    t.ok("scores: every game stored once, as a measurement", all(scored(r, g["id"]) for g in games), str(r.writes))
    t.ok("scores: nothing deferred", "0 deferred" in log, log[-200:])
    t.ok("scores: night-stars and jinx recomputed for the touched date",
         sorted(set(r.recomputes)) == [("/analytics/jinx/recompute", "2026-10-31"), ("/analytics/night-stars/recompute", "2026-10-31")],
         str(r.recomputes))
    t.ok("scores: the stand-in saw no route it does not know", not r.unknown, str(r.unknown))
    t.ok("scores: no event fetched more than three times", not r.runaway, str(r.runaway))


@scenario
def refused_read(t, script):
    for how in (403, 429, 500, 503, RESET, BADJSON):
        tag = f"a read that failed ({how})"
        bad, good = game(1, event=4001), game(2, event=4002)
        r = Relay([bad, good], espn={"4001": how})
        code, log = run_script(script, r)
        t.ok(f"{tag}: nothing written for the game", not any(w[0] == bad["id"] for w in r.writes), str(r.writes))
        t.ok(f"{tag}: its row is still NULL", r.rows[bad["id"]]["drama_peak"] is None, str(r.rows[bad["id"]]))
        t.ok(f"{tag}: fetched once in the run", r.espn_hits.get("4001") == 1, str(r.espn_hits))
        t.ok(f"{tag}: the rest of the batch is still scored", scored(r, good["id"]), str(r.writes))
        t.ok(f"{tag}: the run ends non-zero", code == 1, f"exit {code}")
        t.ok(f"{tag}: the log says deferred, once", log.count("[deferred]") == 1 and "1 deferred" in log, log[-400:])


@scenario
def absent_event(t, script):
    for sport, how in (("Bundesliga", 404), ("Bundesliga", 410), ("MLB", 404), ("MLB", 410), ("WNBA", 404)):
        tag = f"ESPN says {sport} event is absent ({how})"
        g = game(1, sport, event=4101)
        r = Relay([g], espn={"4101": how})
        code, log = run_script(script, r)
        s = r.stored(g["id"])
        t.ok(f"{tag}: the 0 mark is stored once", len(s) == 1 and s[0][1] == 0 and s[0][2] is None, str(r.writes))
        t.ok(f"{tag}: fetched once", r.espn_hits.get("4101") == 1, str(r.espn_hits))
        t.ok(f"{tag}: still counted as an error", code == 1, f"exit {code}")
        t.ok(f"{tag}: the log says absent, not deferred", "[absent]" in log and "[deferred]" not in log, log[-300:])


@scenario
def next_run_scores_it(t, script):
    g = game(1, event=4201)
    r = Relay([g], espn={"4201": 403})
    run_script(script, r)
    t.ok("run 1 (403): the row is still NULL", r.rows[g["id"]]["drama_peak"] is None, str(r.writes))
    r.espn["4201"] = OK
    code, log = run_script(script, r)
    t.ok("run 2 (ESPN answers): the game is scored for real", scored(r, g["id"]) and not [w for w in r.writes if w[3] == "skipped"], str(r.writes))
    t.ok("run 2: exit 0", code == 0, f"exit {code}")


@scenario
def all_deferred(t, script):
    games = [game(i, event=4300 + i, date="2026-10-31") for i in range(1, 26)]
    r = Relay(games, espn={g["espn_event_id"]: 403 for g in games})
    code, log = run_script(script, r)
    t.ok("25 games all refused: nothing written", not r.writes, str(r.writes[:3]))
    t.ok("25 games all refused: the loop ends in a few listings", r.listings <= 3, f"{r.listings} listings")
    t.ok("25 games all refused: the 20 listed are fetched once each, the other 5 not at all",
         sum(r.espn_hits.values()) == 20 and all(v == 1 for v in r.espn_hits.values()), str(r.espn_hits))
    t.ok("25 games all refused: ends non-zero and says why", code == 1 and "all deferred" in log, f"exit {code}: {log[-300:]}")


@scenario
def kept_behaviour(t, script):
    nhl, empty = game(1, "NHL", event=4401), game(2, "MLB", event=4402)
    r = Relay([nhl, empty], espn={"4402": EMPTY})
    code, log = run_script(script, r)
    t.ok("unsupported sport: stored 0 without asking ESPN", [w[1:] for w in r.stored(nhl["id"])] == [(0, None, "stored")] and "4401" not in r.espn_hits, str(r.writes))
    t.ok("empty reading: stored 0 as no-states", [w[1:] for w in r.stored(empty["id"])] == [(0, None, "stored")] and "[no-states]" in log, str(r.writes))
    t.ok("both: exit 0, nothing deferred", code == 0 and "0 deferred" in log, f"exit {code}")


@scenario
def refused_write(t, script):
    a, b = game(1, event=4501), game(2, event=4502)
    r = Relay([a], espn={}, fail_write={a["id"]})
    code, log = run_script(script, r)
    t.ok("a write the relay refused is not a stored score", not r.stored(a["id"]) and r.rows[a["id"]]["drama_peak"] is None, str(r.writes))
    t.ok("a refused write: the game is tried once, deferred, run non-zero", r.espn_hits.get("4501") == 1 and "[deferred]" in log and code == 1, f"hits {r.espn_hits} exit {code}")
    r = Relay([b], espn={"4502": 404}, fail_write={b["id"]})
    code, log = run_script(script, r)
    t.ok("an absent event whose 0 was refused: tried once, deferred, nothing stored", r.espn_hits.get("4502") == 1 and not r.stored(b["id"]) and "the 0 was not stored" in log and code == 1,
         f"hits {r.espn_hits} exit {code}: {log[-300:]}")


def refusal_row():
    g = game(1, event=RESET_EVENT)
    g["id"] = RESET_ID
    return g


def reset_relay(peak=0, arc="null", espn=None, **kw):
    r = Relay([refusal_row()], espn=espn or {RESET_EVENT: OK}, **kw)
    r.rows[RESET_ID]["drama_peak"], r.rows[RESET_ID]["drama_arc"] = peak, arc
    return r


def updates(r):
    return [p for k, p in r.d1 if k == "update"]


@scenario
def reset_row(t, script):
    rs = RESET_SCRIPT[0]
    row = lambda r: (r.rows[RESET_ID]["drama_peak"], r.rows[RESET_ID]["drama_arc"])
    r = reset_relay()
    code, log = run_script(rs, r)
    t.ok("reset: the stored refusal is set back to NULL, once", code == 0 and row(r) == (None, None) and len(updates(r)) == 1, f"exit {code} row {row(r)} {log[-300:]}")
    t.ok("reset: the update is bound to the id, the 'null' arc and the event", updates(r) == [[RESET_ID, "null", RESET_EVENT]], str(updates(r)))
    t.ok("reset: the log shows before, proof, reset and after", all(x in log for x in ("[before]", "[proof]", "[reset] changes=1", "[after]")), log[-300:])
    r = reset_relay(peak=None, arc=None)
    code, log = run_script(rs, r)
    t.ok("reset: a row already NULL is left alone", code == 0 and not updates(r) and "nothing to reset" in log, f"exit {code} {log[-200:]}")
    for what, kw in (("a real score (57)", dict(peak=57, arc="[52, 57]")), ("a 0 with a real arc", dict(peak=0, arc="[52, 57]"))):
        r = reset_relay(**kw)
        code, log = run_script(rs, r)
        t.ok(f"reset: {what} is refused and untouched", code == 1 and not updates(r) and row(r) == (kw["peak"], kw["arc"]) and "refusing to touch it" in log, f"exit {code} {log[-250:]}")
    for what, how in (("ESPN refusing the event now", 403), ("ESPN answering with no key events", NOKEYEVENTS)):
        r = reset_relay(espn={RESET_EVENT: how})
        code, log = run_script(rs, r)
        t.ok(f"reset: {what} is not a reset", code == 1 and not updates(r) and row(r) == (0, "null"), f"exit {code} {log[-250:]}")
    r = reset_relay(update_changes=2)
    code, log = run_script(rs, r)
    t.ok("reset: an update that reports two changes fails the run", code == 1 and "expected exactly 1" in log, f"exit {code} {log[-250:]}")
    r = reset_relay(update_changes=0)
    code, log = run_script(rs, r)
    t.ok("reset: an update that reports no change fails the run", code == 1, f"exit {code} {log[-250:]}")
    r = reset_relay(update_noop=True)
    code, log = run_script(rs, r)
    t.ok("reset: a reset that did not take is caught by reading the row back", code == 1 and "read back after the reset" in log, f"exit {code} {log[-250:]}")
    r = Relay([], espn={})
    code, log = run_script(rs, r)
    t.ok("reset: a missing row fails the run", code == 1 and not updates(r) and "found 0" in log, f"exit {code} {log[-250:]}")
    r = reset_relay()
    code, log = run_script(rs, r, secret=None)
    t.ok("reset: no secret, no call", code == 1 and not r.d1 and "RELAY_SHARED_SECRET is not set" in log, f"exit {code} calls {r.d1} {log[-200:]}")


RESET_SCRIPT = [DEFAULT_RESET]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--script", default=DEFAULT_SCRIPT)
    ap.add_argument("--reset-script", default=DEFAULT_RESET)
    ap.add_argument("--only")
    a = ap.parse_args()
    RESET_SCRIPT[0] = a.reset_script
    script = pathlib.Path(a.script)
    if not script.exists():
        print(f"FAIL: no script at {script}")
        return 1
    names_wanted = a.only.split(",") if a.only else []
    if (not names_wanted or "reset_row" in names_wanted) and not pathlib.Path(a.reset_script).exists():
        print(f"FAIL: no reset script at {a.reset_script}")
        return 1
    if not shutil.which("node"):
        print("FAIL: node is not installed")
        return 1
    names = a.only.split(",") if a.only else list(SCENARIOS)
    unknown = [n for n in names if n not in SCENARIOS]
    if unknown:
        print(f"FAIL: no scenario {unknown}; have {sorted(SCENARIOS)}")
        return 1
    t = Tally()
    for n in names:
        before = len(t.fails)
        SCENARIOS[n](t, script)
        print(f"{'ok  ' if len(t.fails) == before else 'FAIL'} {n}")
    for f in t.fails:
        print(f"  FAIL: {f}")
    print(f"\n{t.n - len(t.fails)} of {t.n} checks passed in {len(names)} scenarios")
    return 0 if not t.fails else 1


if __name__ == "__main__":
    sys.exit(main())
