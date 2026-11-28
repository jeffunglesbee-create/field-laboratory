#!/usr/bin/env node
// OUTCOME-BLIND coverage for CC-CMD-2026-11-27-uefa-forecast-on-tonights-cards, "Exploration 2026-11-28": how many of the clubs in the 2026-27 league phases have a UEFA row
// in 2025-26, so how many could carry a prior from the archive's own UEFA history. It reads CLUB NAMES ONLY from the two committed bundles; no score is read, printed or used,
// and no rating, share or model number is computed. The six aliases are the ones outbox/forecast-fit-uefa-2026-11-27.mjs (CLUB_ALIASES) fixed for the fit, copied rather than
// imported because that file has side effects on import.
//
//   node outbox/uefa-prior-coverage-2026-11-28.mjs
import fs from 'node:fs'

const ALIAS = { 'Paris Saint-Germain': 'PSG', 'SC Freiburg': 'Freiburg', 'Crystal Palace': 'C Palace', 'Rayo Vallecano': 'Rayo', 'Man United': 'Man Utd', 'Ararat': 'Ararat-Armenia' }
const canon = c => ALIAS[c] ?? c
const LABELS = ['UEFA Champions League', 'UEFA Europa League', 'UEFA Europa Conference League']
const load = f => JSON.parse(fs.readFileSync(f, 'utf8')).rows
const b25 = load('outbox/forecast-uefa-data-2025-26-2026-11-27.json')
const b26 = load('outbox/forecast-uefa-data-2026-27-frozen-2026-11-27.json')
const clubs = (rows, label) => { const s = new Set(); for (const r of rows) if (!label || r.sport === label) { s.add(canon(r.home)); s.add(canon(r.away)) } return s }

const any25 = clubs(b25)
const same25 = Object.fromEntries(LABELS.map(l => [l, clubs(b25, l)]))
console.log('2025-26 clubs by competition (every row of the bundle, knockouts included): ' + LABELS.map(l => `${l.replace('UEFA ', '')} ${same25[l].size}`).join(' | ') + ` | distinct across the three ${any25.size}`)
let slots = 0, same = 0, any = 0
const none = []
for (const l of LABELS) {
  const c26 = clubs(b26, l)
  const s = [...c26].filter(c => same25[l].has(c)), a = [...c26].filter(c => any25.has(c)), n = [...c26].filter(c => !any25.has(c)).sort()
  console.log(`${l.replace('UEFA ', '').padEnd(26)} 2026-27 clubs ${c26.size} | same competition in 2025-26 ${s.length} | any UEFA competition in 2025-26 ${a.length} (another competition ${a.length - s.length}) | none ${n.length}`)
  slots += c26.size; same += s.length; any += a.length; none.push(...n.map(x => [l, x]))
}
console.log(`CLUB-SLOTS ${slots}: same-competition prior ${same} (${Math.round(same / slots * 100)}%), any UEFA prior ${any} (${Math.round(any / slots * 100)}%), no UEFA row in 2025-26 ${slots - any} (${Math.round((slots - any) / slots * 100)}%)`)
for (const l of LABELS) console.log(`  no 2025-26 UEFA row, ${l.replace('UEFA ', '')}: ${none.filter(x => x[0] === l).map(x => x[1]).join(', ')}`)
// Is any "no row" club a spelling mismatch of a 2025-26 club? A crude shared-word screen, printed for a human to judge; it is not a match rule.
const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\b(fc|fk|sc|ac|as|cf|sk|kaa|bk|if|afc)\b/g, ' ').replace(/\s+/g, ' ').trim()
const idx = [...any25].map(c => [c, norm(c)])
console.log('shared-word screen (candidates only, for a human to judge):')
for (const [, c] of none) { const n = norm(c); const toks = n.split(' ').filter(t => t.length >= 4); const cand = idx.filter(([, on]) => toks.some(t => on.includes(t)) || on.split(' ').some(t => t.length >= 4 && n.includes(t))).map(x => x[0]); if (cand.length) console.log(`  ${c} ~ ${cand.join(' | ')}`) }
