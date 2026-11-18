// Builds test/open-meteo-recorded.json for docs/CC-CMD-2026-11-18-split-live-weather-check.md, Task 0.
// One-off, kept beside its output so the fixture can be rebuilt and its provenance read. Run from the repo root
// after `npm run build`: node outbox/open-meteo-fixture-build-2026-11-18.mjs
//
// Every body is a REAL response to the page's own URL (forecastUrl, unchanged), recorded by
// rain-precip-pair-probe.yml into outbox/rain-precip-pair-*.jsonl with status 200 and a body the probe read.
// Key: "latitude,longitude" exactly as forecastUrl writes them, which is all a route handler can see.
// The one refused body is a recorded body EDITED so rain exceeds precipitation; the edit is written into the file.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { all } from '../build/Venues.js'
import { forecastUrl } from '../build/Weather.js'

const keyOf = url => { const u = new URL(url); return `${u.searchParams.get('latitude')},${u.searchParams.get('longitude')}` }
const table = new Map(Array.from(all).map(v => [v.Name, v]))
const files = readdirSync('outbox').filter(f => /^rain-precip-pair-.*\.jsonl$/.test(f)).sort()
const bodies = {}
for (const f of files) {
  for (const line of readFileSync(`outbox/${f}`, 'utf8').split('\n').filter(Boolean)) {
    const r = JSON.parse(line)
    if (r.kind === 'egress' || r.status !== 200 || !r.ok || !table.has(r.ground)) continue
    const j = JSON.parse(r.body)
    if (typeof j?.current?.temperature_2m !== 'number') continue
    bodies[keyOf(forecastUrl(table.get(r.ground).Where))] = { ground: r.ground, at: r.at, source: `outbox/${f}`, body: r.body }
  }
}
const keys = Object.keys(bodies).sort()
const def = keys[0]
const base = JSON.parse(bodies[def].body)
base.current.precipitation = 0.3
base.current.rain = 0.6
const out = {
  about: 'Recorded Open-Meteo responses to the page\'s own forecastUrl, for render-check --recorded-weather. ' +
    'Built by outbox/open-meteo-fixture-build-2026-11-18.mjs; docs/CC-CMD-2026-11-18-split-live-weather-check.md.',
  built: new Date().toISOString().slice(0, 10),
  bodies,
  default: def,
  refused: { basedOn: def, edit: 'current.precipitation set to 0.3 and current.rain to 0.6, the second refused body of verify run 42863538303 (2026-11-10)', body: JSON.stringify(base) },
}
writeFileSync('test/open-meteo-recorded.json', JSON.stringify(out, null, 1) + '\n')
console.log(`venues ${keys.length} from ${files.length} file(s); default ${def} (${bodies[def].ground}); refused based on it`)
