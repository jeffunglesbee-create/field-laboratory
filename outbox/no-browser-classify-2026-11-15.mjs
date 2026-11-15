// Reads the results of outbox/no-browser-probe-2026-11-15.py (argv[2], JSON) and classifies each probed expectation the way `mutation-check.mjs --no-browser` does (scripts/mutation-lib.mjs).
//   unshare -m bash -c 'mount -t tmpfs tmpfs /opt/pw-browsers && python3 outbox/no-browser-probe-2026-11-15.py outbox/no-browser-results-2026-11-15.json'
//   node outbox/no-browser-classify-2026-11-15.mjs outbox/no-browser-results-2026-11-15.json
import { readFileSync } from 'node:fs'
import { notApplicableBecause } from '../scripts/mutation-lib.mjs'
const d = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const cls = r => r.status === 0 ? 'PASS' : (['no-browser', 'exit-3'].includes(notApplicableBecause({ cmd: r.cmd, status: r.status, text: r.text, noBrowser: true })) ? 'N/A' : 'FAILURE')
const rows = d.results.map(r => ({ ...r, cls: cls(r), plain: notApplicableBecause({ cmd: r.cmd, status: r.status, text: r.text, noBrowser: false }) }))
const by = c => rows.filter(r => r.cls === c)
console.log(`distinct expectations ${d.distinct}; accounted ${JSON.stringify(d.accounted)} (trap = a --self-test the launch trap measures, harness = runs the mutation harness itself, neither is run here)`)
console.log(`run here with no browser: ${rows.length} | PASS ${by('PASS').length} | N/A ${by('N/A').length} | FAILURE ${by('FAILURE').length}   (browser directory seen by the commands: ${JSON.stringify(d.browserDirSeen)})`)
console.log('--- N/A (a hole under --no-browser)'); for (const r of by('N/A')) console.log('  ', r.cmd)
console.log('--- FAILURE (not classed n/a)'); for (const r of by('FAILURE')) console.log('  ', r.status, r.cmd, '=>', r.text.trim().split('\n').slice(-2).join(' | ').slice(0, 160))
console.log(`without --no-browser, expectations classed n/a other than by exit 3: ${rows.filter(r => r.plain === 'no-browser').length}`)
