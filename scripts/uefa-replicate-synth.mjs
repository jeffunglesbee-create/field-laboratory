// SYNTHETIC SEASONS for the replication tooling's checks and for the independent implementation's fixtures (scripts/check-uefa-replicate.mjs, scripts/export-uefa-replicate-fixtures.mjs). Seeded, no real data except that the Look 2 fixture reuses the PINNED frozen 2026-27 bundle's 252 rows for its frozen part
// (club names mapped to one id per canonical club) and adds synthetic forward matches. Every season goes through the REAL collector (scripts/uefa-replication-data.mjs) against a stubbed ESPN, so a bundle here has exactly the collector's shape.
import { collect } from './uefa-replication-data.mjs'

export const prng = seed => { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
export const poisson = (rnd, m) => { const L = Math.exp(-m); let k = 0, p = 1; do { k++; p *= rnd() } while (p > L); return k - 1 }
export const addDays = (d, k) => new Date(Date.parse(d + 'T00:00:00Z') + k * 86400000).toISOString().slice(0, 10)
export const COMPS = [{ slug: 'uefa.champions', N: 8 }, { slug: 'uefa.europa', N: 8 }, { slug: 'uefa.europa.conf', N: 6 }]
/** ESPN-shaped events of one synthetic season: `starts[c]` and `spacing[c]` give each competition's matchday dates; `knockout` adds 45 events after the league phase (some AET or PEN). */
export function synthEvents({ seed, starts, spacing, knockout, sigma = 0, teamOf = (c, i) => (c + 1) * 100 + i }) {
  const rnd = prng(seed), ev = []
  let id = seed * 1000
  // sigma 0: no club strength (the scores are independent Poisson draws); sigma above 0 (a number, or one per competition): each club has a latent strength s ~ uniform(-sigma, sigma) that scales its goals (exp(s_home - s_away))
  const str = new Map(), sg = c => (Array.isArray(sigma) ? sigma[c] : sigma), sOf = (c, i) => { const k = `${c}|${i}`; if (!str.has(k)) str.set(k, sg(c) === 0 ? 0 : (2 * rnd() - 1) * sg(c)); return str.get(k) }
  const mk = (c, date, hh, h, a, status, phase) => { const d = sOf(c, h) - sOf(c, a), hg = poisson(rnd, 1.4 * Math.exp(d)), ag = poisson(rnd, 1.1 * Math.exp(-d)); ev.push({ slug: COMPS[c].slug, day: date, e: { id: String(++id), date: `${date}T${hh}Z`, season: { slug: phase }, competitions: [{ status: { type: { name: status, completed: true } }, competitors: [{ homeAway: 'home', team: { id: String(teamOf(c, h)), shortDisplayName: `T${h}` }, score: String(hg) }, { homeAway: 'away', team: { id: String(teamOf(c, a)), shortDisplayName: `T${a}` }, score: String(ag) }] }] } }) }
  for (const [c, { N }] of COMPS.entries()) {
    for (let md = 0; md < N; md++) {
      const order = Array.from({ length: 36 }, (_, i) => i + 1).map(v => [rnd(), v]).sort((x, y) => x[0] - y[0]).map(x => x[1])
      for (let j = 0; j < 18; j++) { const [h, a] = rnd() < 0.5 ? [order[2 * j], order[2 * j + 1]] : [order[2 * j + 1], order[2 * j]]; mk(c, addDays(starts[c], spacing[c] * md), j < 9 ? '17:45' : '20:00', h, a, 'STATUS_FULL_TIME', 'league-phase') }
    }
    if (knockout) for (let k = 0; k < 45; k++) mk(c, addDays('2025-02-10', 2 * k), '20:00', (k % 36) + 1, ((k + 7) % 36) + 1, k % 9 === 0 ? 'STATUS_FINAL_AET' : k % 15 === 0 ? 'STATUS_FINAL_PEN' : 'STATUS_FULL_TIME', 'knockout-round-playoffs')
  }
  return ev
}
export const stub = events => { const by = new Map(); for (const x of events) { const k = `${x.slug}|${x.day.replaceAll('-', '')}`; by.set(k, [...(by.get(k) ?? []), x.e]) } return async url => { const m = url.match(/soccer\/([^/]+)\/scoreboard\?dates=(\d{8})/); return { status: 200, json: async () => ({ events: by.get(`${m[1]}|${m[2]}`) ?? [] }) } } }
export const bundleOf = async (events, from, to) => { const r = await collect({ from, to, get: stub(events) }); if (!r.bundle) throw new Error(r.stopped); const text = JSON.stringify(r.bundle, null, 1) + '\n'; return { bundle: r.bundle, text } }

/** The Look 2 fixture: the pinned frozen bundle's rows as ESPN events (one id per canonical club via `canon`) plus synthetic forward matches that bring every club to N, as events ready for bundleOf(). `labels` is the list of the three competition labels in order. */
export function forwardEvents(frozenDoc, canon, labels) {
  const clubsOf = {}
  for (const r of frozenDoc.rows) (clubsOf[r.sport] ??= new Set()).add(canon(r.home)).add(canon(r.away))
  const teamId = new Map(); let tid = 5000
  for (const r of frozenDoc.rows) for (const nm of [canon(r.home), canon(r.away)]) if (!teamId.has(r.sport + nm)) teamId.set(r.sport + nm, ++tid)
  const toEvent = r => ({ slug: COMPS[labels.indexOf(r.sport)].slug, day: r.date, e: { id: r.espn_event_id, date: r.start_time, season: { slug: 'league-phase' }, competitions: [{ status: { type: { name: 'STATUS_FULL_TIME', completed: true } }, competitors: [{ homeAway: 'home', team: { id: String(teamId.get(r.sport + canon(r.home))), shortDisplayName: canon(r.home) }, score: String(r.home_score) }, { homeAway: 'away', team: { id: String(teamId.get(r.sport + canon(r.away))), shortDisplayName: canon(r.away) }, score: String(r.away_score) }] }] } })
  const fwdEvents = frozenDoc.rows.map(toEvent)
  const rnd = prng(7); let id = 9000000
  for (const [c, { N }] of COMPS.entries()) {
    const label = labels[c], clubs = [...clubsOf[label]], played = frozenDoc.rows.filter(r => r.sport === label).length * 2 / clubs.length
    for (let md = played; md < N; md++) {
      const order = clubs.map(v => [rnd(), v]).sort((x, y) => x[0] - y[0]).map(x => x[1])
      for (let j = 0; j < 18; j++) { const hg = poisson(rnd, 1.4), ag = poisson(rnd, 1.1), date = addDays('2026-12-03', 17 * (md - played) + c); fwdEvents.push({ slug: COMPS[c].slug, day: date, e: { id: String(++id), date: `${date}T20:00Z`, season: { slug: 'league-phase' }, competitions: [{ status: { type: { name: 'STATUS_FULL_TIME', completed: true } }, competitors: [{ homeAway: 'home', team: { id: String(teamId.get(label + order[2 * j])), shortDisplayName: order[2 * j] }, score: String(hg) }, { homeAway: 'away', team: { id: String(teamId.get(label + order[2 * j + 1])), shortDisplayName: order[2 * j + 1] }, score: String(ag) }] }] } }) }
    }
  }
  return fwdEvents
}
