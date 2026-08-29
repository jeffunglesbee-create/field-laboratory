// Capture a REAL /context/date payload as a render fixture.
//
// WHY. `npm run check` renders against public/data/context-2026-05-15.json,
// which carries two AFL rows. Every Sport case added since — CFB, Bundesliga,
// EPL, La Liga, Ligue 1, Serie A, the six UEFA competitions, NFL, CFL, PGA Tour
// — is verified by the COMPILER (check:proof asserts a case without a registry
// entry does not build) and by nothing that renders a card.
//
// So `Matchup = AwayAtHome` on CFB and `HomeVersusAway` on Bundesliga are
// type-checked claims about a function nobody has watched produce output.
//
// The fixture is CAPTURED, never written by hand. Rule 1 — a hand-made row is
// an invented row, and the whole point is to render what the relay actually
// serves. 2026-08-29 is the first date carrying CFB, and it carries eleven
// sports at once, which makes it strictly better corpus than two AFL rows.
//
// CI-only: the sandbox 403s *.workers.dev.

import { writeFileSync } from 'node:fs'

const RELAY = process.env.RELAY_URL || 'https://field-relay-nba.jeffunglesbee.workers.dev'
const date = process.argv[2] || '2026-08-29'
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { console.error('usage: capture-render-fixture.mjs YYYY-MM-DD'); process.exit(1) }

// Three states. An unreachable relay is not an empty slate.
let payload = null
try {
  const r = await fetch(`${RELAY}/context/date/${date}`)
  if (!r.ok) { console.error(`UNREACHABLE — HTTP ${r.status}. Nothing captured.`); process.exit(1) }
  payload = await r.json()
} catch (e) { console.error(`UNREACHABLE — ${e.message}. Nothing captured.`); process.exit(1) }

const g = payload?.games ?? {}
const rows = [...(g.regular ?? []), ...(g.postseason ?? [])]
const sports = [...new Set(rows.map(r => r.sport))].sort()

console.log(`\n  ${date}: ${rows.length} row(s) across ${sports.length} sport(s)`)
console.log(`  ${sports.join(', ')}\n`)

// A fixture that carries fewer sports than the one it replaces is not an
// upgrade. Stated as a floor rather than a specific list so an ordinary slate
// change does not fail it, and a broken capture does.
if (sports.length < 5) {
  console.error(`REFUSED — ${sports.length} sport(s) is not a multi-sport corpus. Capture a fuller date.`)
  process.exit(1)
}

// `data/`, not `public/data/`. The first version of this script wrote to the
// latter and failed on a fresh checkout with ENOENT, because `public/` is
// GITIGNORED: it is build output. scripts/build-site.mjs copies data/ -> public/data/
// (`cp(`${ROOT}data`, `${OUT}/data`)`), so the tracked source of every fixture
// is data/ and writing to the copy would have produced a file that existed only
// on the runner and was staged by nothing.
//
// Written against an assumed path rather than a checked one — the same mistake
// this session has now made four times in different clothes.
const out = `data/context-${date}.json`
writeFileSync(out, JSON.stringify(payload, null, 1) + '\n')
console.log(`  wrote ${out}\n`)

// data/PROVENANCE.md exists so a reader can ask where any file in this directory
// came from. A capture that does not answer that question is the kind of
// unsourced fixture it exists to prevent.
const { appendFileSync } = await import('node:fs')
appendFileSync('data/PROVENANCE.md',
  `\n- \`context-${date}.json\` — captured ${new Date().toISOString().slice(0, 10)} from ` +
  `\`${RELAY}/context/date/${date}\` by \`scripts/capture-render-fixture.mjs\`. ` +
  `${rows.length} rows, ${sports.length} sports: ${sports.join(', ')}. ` +
  `Unedited — a hand-modified fixture is an invented one.\n`)
console.log('  appended provenance\n')
