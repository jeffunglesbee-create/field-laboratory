// Where Manadon Sports Hub is, computed from what was read (Rule 89: the artifact is this script's printed result).
// docs/CC-CMD-2026-11-09-venue-review-remainder.md, Task 3 ("Manadon Sports Hub approved", 2026-11-11 09:50 ET).
//
// It reads two committed files and nothing else, and uses no network:
//   outbox/venue-manadon-probe-2026-11-11.txt   three runner probes, each the Probe step's output verbatim (answers cut at 400 bytes)
//   outbox/venue-manadon-pages-2026-11-11.txt   public pages, quoted by hand from the session's fetch tool (a read, not a capture)
// Every number printed is parsed from one of them. The only numbers typed here are the sourcing rule's tolerance (0.02 degrees,
// scripts/venue-source.mjs) and the metres in a degree, which put that tolerance into metres for the one source that is in OS grid
// metres. Both are approximations and say so.
//
// Usage, from the repository root:
//   node outbox/venue-manadon-evidence-2026-11-11.mjs               the report; exits 1 unless every check holds
//   node outbox/venue-manadon-evidence-2026-11-11.mjs --self-test   the same judgement on doctored copies of the real files, each of which must be caught by a named check

import { readFileSync } from 'node:fs'
import { createChecks, finish, isMain } from '../scripts/checks.mjs'

export const PROBE = 'outbox/venue-manadon-probe-2026-11-11.txt'
export const PAGES = 'outbox/venue-manadon-pages-2026-11-11.txt'
export const NAME = 'Manadon Sports Hub'
/** The postcode on the council's licence for the hub. The point below is this postcode's. */
export const HUB_POSTCODE = 'PL5 3FD'
/** The postcode on the club's 2018 FAQ and on the Active Places listing of the older centre. */
export const SITE_POSTCODE = 'PL5 3JG'
export const ZONE = 'Europe/London'
/** The sourcing rule's tolerance: two sources agree when each coordinate is within this many degrees of the other's. */
export const BOX = 0.02
/** Approximate metres in a degree: 111.2 km of latitude; 111.32 km of longitude at the equator, times cos(latitude). */
export const M_PER_DEG_LAT = 111_200
export const mPerDegLon = lat => 111_320 * Math.cos(lat * Math.PI / 180)
/** How many URL blocks the three probes hold: 8 + 8 + 1. */
export const BLOCKS = 17

const NUM = '-?\\d+(?:\\.\\d+)?'
const u = {
  nameSearch: 'https://nominatim.openstreetmap.org/search?q=Manadon+Sports+and+Community+Hub&format=jsonv2&limit=3',
  pc: p => `https://api.postcodes.io/postcodes/${p.replace(' ', '%20')}`,
  nomPostcode: 'https://nominatim.openstreetmap.org/search?postalcode=PL5+3FD&country=gb&format=jsonv2&limit=3',
  revHub: 'https://nominatim.openstreetmap.org/reverse?lat=50.40913&lon=-4.145326&zoom=18&format=jsonv2',
  revSite: 'https://nominatim.openstreetmap.org/reverse?lat=50.409761&lon=-4.145762&zoom=18&format=jsonv2',
  photonName: 'https://photon.komoot.io/api/?q=Manadon+Sports+and+Community+Hub&limit=3',
  meteo: 'https://api.open-meteo.com/v1/forecast?latitude=50.4091&longitude=-4.1453&current=temperature_2m&timezone=auto',
}

/** The one match of `re` (global) in `text`, or an error that says how many there were. An anchor that is not unique is a failure, never a choice. */
export const once = (text, re, what) => {
  const all = [...text.matchAll(re)]
  if (all.length !== 1) throw new Error(`${what}: expected exactly one match, found ${all.length}`)
  return all[0]
}

/** Every "GET <url>" block of the probe file, keyed by URL. A URL that occurs twice is an error. */
export const blocks = text => {
  const out = new Map()
  for (const part of text.split(/^={20,}$/m).slice(1)) {
    const lines = part.replace(/^\n/, '').split('\n')
    const url = (lines[0].match(/^GET (\S+)$/) ?? [])[1]
    if (!url) throw new Error(`a probe block has no GET line: ${JSON.stringify(lines[0]).slice(0, 80)}`)
    if (out.has(url)) throw new Error(`the URL occurs twice in the probe file: ${url.slice(0, 90)}`)
    const result = (lines[1] ?? '').match(/^ {2}RESULT: (?:HTTP (\d+), (\d+) bytes|unreachable)/)
    if (!result) throw new Error(`no RESULT line under ${url.slice(0, 90)}`)
    const start = lines.findIndex(l => l === '  --- first 400 bytes ---')
    let body = ''
    if (start >= 0) {
      const rest = lines.slice(start + 1)
      const end = rest.findIndex(l => /^(#### |##\[error\]|  \^ )/.test(l))
      body = (end < 0 ? rest : rest.slice(0, end)).join('\n').trim()
    }
    out.set(url, { status: result[1] ? Number(result[1]) : 'unreachable', body })
  }
  return out
}

const need = (map, url) => {
  const b = map.get(url)
  if (!b) throw new Error(`no probe block for ${url}`)
  return b
}

export const postcodeRow = body => {
  const m = body.match(new RegExp(`"postcode":"([A-Z0-9 ]+)","quality":(\\d+),"eastings":(\\d+),"northings":(\\d+),.*?"longitude":(${NUM}),"latitude":(${NUM})`))
  if (!m) throw new Error(`not a postcodes.io row: ${body.slice(0, 80)}`)
  return { postcode: m[1], quality: Number(m[2]), e: Number(m[3]), n: Number(m[4]), lon: Number(m[5]), lat: Number(m[6]) }
}

export const nominatimPostcode = body => {
  const m = body.match(new RegExp(`"postcode_id":"Pgb:PL5_3FD","lat":"(${NUM})","lon":"(${NUM})"`))
  if (!m) throw new Error(`not Nominatim's PL5 3FD postcode point: ${body.slice(0, 80)}`)
  return { lat: Number(m[1]), lon: Number(m[2]) }
}

export const nominatimReverse = body => {
  const m = body.match(new RegExp(`"osm_type":"(\\w+)","osm_id":(\\d+),"lat":"(${NUM})","lon":"(${NUM})","category":"(\\w+)","type":"(\\w+)".*?"name":"([^"]*)","display_name":"([^"]*)`))
  if (!m) throw new Error(`not a Nominatim reverse answer: ${body.slice(0, 80)}`)
  return { osmType: m[1], osmId: m[2], lat: Number(m[3]), lon: Number(m[4]), category: m[5], type: m[6], name: m[7], display: m[8] }
}

export const timezoneOf = body => {
  const m = body.match(/"timezone":"([^"]+)"/)
  if (!m) throw new Error(`no timezone in: ${body.slice(0, 80)}`)
  return m[1]
}

export const gridOf = body => {
  const m = body.match(new RegExp(`^\\{"latitude":(${NUM}),"longitude":(${NUM}),.*?"current":\\{"time":"([^"]+)"`))
  if (!m) throw new Error(`not an Open-Meteo answer: ${body.slice(0, 80)}`)
  return { lat: Number(m[1]), lon: Number(m[2]), time: m[3] }
}

export const councilAddress = pages => once(pages, /^> (121 St Peters Road, Plymouth, Devon, PL5 3FD)$/gm, "the council's address line")[1]
export const activePlaces = pages => {
  const m = once(pages, /^> \(Easting:(\d+\.\d+), Northing:(\d+\.\d+)\)$/gm, 'the Active Places grid reference')
  return { e: Number(m[1]), n: Number(m[2]) }
}

export const haversine = (a, b) => {
  const R = 6_371_000, rad = d => d * Math.PI / 180
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
const fs4 = x => x.toFixed(4)
const r1 = x => (Math.round(x * 10) / 10).toFixed(1)
const sgn = x => (x >= 0 ? '+' : '') + x

/** The judgement. Returns the printed lines and the named checks; throws when a file does not hold what it must. */
export const judge = (probeText, pagesText) => {
  const map = blocks(probeText)
  const statuses = [...map.values()].map(b => b.status)
  const count = s => statuses.filter(x => x === s).length
  const hub = postcodeRow(need(map, u.pc(HUB_POSTCODE)).body)
  const site = postcodeRow(need(map, u.pc(SITE_POSTCODE)).body)
  const ap = activePlaces(pagesText)
  const council = councilAddress(pagesText)
  const nomPc = nominatimPostcode(need(map, u.nomPostcode).body)
  const revHub = nominatimReverse(need(map, u.revHub).body)
  const revSite = nominatimReverse(need(map, u.revSite).body)
  const nameSearch = need(map, u.nameSearch).body
  const meteoBody = need(map, u.meteo).body
  const zone = timezoneOf(meteoBody), cell = gridOf(meteoBody)
  const photonFirst = need(map, u.photonName).body.match(/"name":"([^"]+)".*?"state":"([^"]+)"/)

  const point = { lat: hub.lat, lon: hub.lon }
  const row = `at "${NAME}" ${fs4(hub.lat)} ${fs4(hub.lon)} OpenAir "${ZONE}"`
  const boxM = { n: BOX * M_PER_DEG_LAT, e: BOX * mPerDegLon(point.lat) }
  const inBoxDeg = p => Math.abs(p.lat - point.lat) <= BOX && Math.abs(p.lon - point.lon) <= BOX
  // The Active Places listing is in OS grid metres, the point's own grid reference is in the same grid: compare there, in metres.
  const apOffset = { e: ap.e - hub.e, n: ap.n - hub.n }
  const apDist = Math.hypot(apOffset.e, apOffset.n)
  const apInBox = Math.abs(apOffset.n) <= boxM.n && Math.abs(apOffset.e) <= boxM.e
  const siteDist = haversine(point, site)

  const checks = []
  const check = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), detail })
  check(`the probe file holds ${BLOCKS} URL blocks, each URL once`, map.size === BLOCKS, `found ${map.size}`)
  check("the council's address line carries the postcode the point was taken for", council.endsWith(HUB_POSTCODE) && hub.postcode === HUB_POSTCODE, `${council} / ${hub.postcode}`)
  check('postcodes.io answers quality 1 for both postcodes', hub.quality === 1 && site.quality === 1, `quality ${hub.quality} and ${site.quality}`)
  check("the OS postcode directory's other postcode is inside the sourcing rule's box around the point", inBoxDeg(site), `${r1(siteDist)} m, dLat ${sgn(+(site.lat - point.lat).toFixed(6))} dLon ${sgn(+(site.lon - point.lon).toFixed(6))}`)
  check("the Active Places grid reference is inside the sourcing rule's box around the point", apInBox, `dE ${sgn(r1(apOffset.e))} m, dN ${sgn(r1(apOffset.n))} m, box ${r1(boxM.e)} by ${r1(boxM.n)} m`)
  check("the Active Places grid reference is neither postcode's centre", apDist > 1 && Math.hypot(ap.e - site.e, ap.n - site.n) > 1, `${r1(apDist)} m from ${HUB_POSTCODE}, ${r1(Math.hypot(ap.e - site.e, ap.n - site.n))} m from ${SITE_POSTCODE}`)
  check("OpenStreetMap has nothing under the hub's licensed name, and names nothing at the two postcode points", nameSearch === '[]' && revHub.name === '' && revSite.name === '', `name search ${nameSearch.slice(0, 60)}; reverse names ${JSON.stringify(revHub.name)} and ${JSON.stringify(revSite.name)}`)
  check(`Open-Meteo reports ${ZONE} at the row's point`, zone === ZONE, `Open-Meteo says ${zone}`)

  const lines = [
    `MANADON SPORTS HUB: where the evidence puts it. Reads ${PROBE} and ${PAGES}; no network.`,
    `COVERAGE: parsed ${map.size} of ${BLOCKS} URL blocks (${count(200)} answered HTTP 200, ${count(406)} HTTP 406, ${count('unreachable')} unreachable); 2 of 2 anchored page lines read once each (the council's address, the Active Places grid reference).`,
    '',
    `THE POINT       ${HUB_POSTCODE} (the council's address for the hub), OS postcode directory through postcodes.io: lat ${hub.lat}, lon ${hub.lon}, E ${hub.e} N ${hub.n}, quality ${hub.quality}`,
    `THE BOX         the sourcing rule's ${BOX} degrees is about ${r1(boxM.n)} m north-south and ${r1(boxM.e)} m east-west at this latitude (approximate constants, ${M_PER_DEG_LAT} m a degree of latitude)`,
    '',
    'FAMILIES that place the hub (the point belongs to family 1; each other source must be inside the box):',
    `  1. OS postcode directory: the point, and the site's other postcode ${SITE_POSTCODE} (the club's FAQ postcode)   lat ${site.lat}, lon ${site.lon}   ${r1(siteDist)} m from the point   dLat ${sgn(+(site.lat - point.lat).toFixed(6))} dLon ${sgn(+(site.lon - point.lon).toFixed(6))}   ${inBoxDeg(site) ? 'inside' : 'OUTSIDE'}`,
    `  2. Sport England Active Places listing   E ${ap.e} N ${ap.n}   ${r1(apDist)} m from the point   dE ${sgn(r1(apOffset.e))} dN ${sgn(r1(apOffset.n))}   ${apInBox ? 'inside' : 'OUTSIDE'}   (${r1(Math.hypot(ap.e - site.e, ap.n - site.n))} m from ${SITE_POSTCODE}'s centre: it is neither postcode's centre)`,
    '',
    'NOT COUNTED:',
    `  Nominatim's postcode point for ${HUB_POSTCODE}   lat ${nomPc.lat}, lon ${nomPc.lon}   ${r1(haversine(point, nomPc))} m from the point (where Nominatim takes GB postcodes from was not established)`,
    `  OpenStreetMap reverse at the point: ${revHub.osmType} ${revHub.osmId}, ${revHub.category}/${revHub.type}, name ${JSON.stringify(revHub.name)}, ${r1(haversine(point, revHub))} m away`,
    `  OpenStreetMap reverse at ${SITE_POSTCODE}: ${revSite.osmType} ${revSite.osmId}, ${revSite.category}/${revSite.type}, name ${JSON.stringify(revSite.name)}`,
    `  OpenStreetMap name search "Manadon Sports and Community Hub": ${nameSearch}`,
    `  Photon, the same name: ${photonFirst ? `"${photonFirst[1]}", ${photonFirst[2]}` : 'no name read'} (a different place)`,
    '',
    `ZONE            Open-Meteo at the row's point: ${zone}; its grid cell is lat ${cell.lat}, lon ${cell.lon}, current ${cell.time}`,
    `THE ROW         ${row}`,
  ]
  return { lines, checks, row }
}

const read = () => ({ probe: readFileSync(PROBE, 'utf8'), pages: readFileSync(PAGES, 'utf8') })

/** Replace `find` with `to` in `text`; a harness that mutates nothing must not report a result. */
export const mutate = (text, find, to) => {
  const n = text.split(find).length - 1
  if (n !== 1) throw new Error(`HARNESS: the anchor occurs ${n} times, not once: ${JSON.stringify(find).slice(0, 100)}`)
  const out = text.replace(find, () => to)
  if (out === text) throw new Error('HARNESS: the mutation changed nothing')
  return out
}

/** Each doctoring of the real files, and the named check (or the thrown message) that must catch it. */
export const MUTATIONS = [
  { name: 'A LOW POSITIONAL QUALITY IS CAUGHT', file: 'probe',
    find: `GET ${u.pc(HUB_POSTCODE)}\n  RESULT: HTTP 200, 1873 bytes\n  --- first 400 bytes ---\n{"status":200,"result":{"postcode":"PL5 3FD","quality":1,`,
    to: `GET ${u.pc(HUB_POSTCODE)}\n  RESULT: HTTP 200, 1873 bytes\n  --- first 400 bytes ---\n{"status":200,"result":{"postcode":"PL5 3FD","quality":6,`,
    caught: { check: 'quality 1' } },
  { name: 'A SECOND POSTCODE 22 KM AWAY IS CAUGHT BY THE BOX', file: 'probe',
    find: '"longitude":-4.145762,"latitude":50.409761', to: '"longitude":-4.145762,"latitude":50.609761',
    caught: { check: 'other postcode is inside' } },
  { name: 'AN ACTIVE PLACES POINT 3 KM NORTH IS CAUGHT BY THE BOX', file: 'pages',
    find: '(Easting:247664.88, Northing:58727.59)', to: '(Easting:247664.88, Northing:61727.59)',
    caught: { check: 'Active Places grid reference is inside' } },
  { name: 'AN ACTIVE PLACES POINT THAT IS A POSTCODE CENTRE IS CAUGHT', file: 'pages',
    find: '(Easting:247664.88, Northing:58727.59)', to: '(Easting:247660.00, Northing:58786.00)',
    caught: { check: "neither postcode's centre" } },
  { name: 'A NAMED OPENSTREETMAP OBJECT UNDER THE HUB NAME IS CAUGHT', file: 'probe',
    find: `GET ${u.nameSearch}\n  RESULT: HTTP 200, 2 bytes\n  --- first 400 bytes ---\n[]`,
    to: `GET ${u.nameSearch}\n  RESULT: HTTP 200, 90 bytes\n  --- first 400 bytes ---\n[{"place_id":1,"name":"Manadon Sports and Community Hub"}]`,
    caught: { check: 'OpenStreetMap has nothing under' } },
  { name: 'A DIFFERENT ZONE FROM OPEN-METEO IS CAUGHT', file: 'probe',
    find: '"timezone":"Europe/London","timezone_abbreviation":"GMT"', to: '"timezone":"Europe/Paris","timezone_abbreviation":"CET"',
    caught: { check: 'Open-Meteo reports' } },
  { name: "A DIFFERENT POSTCODE ON THE COUNCIL'S LINE IS CAUGHT", file: 'pages',
    find: '> 121 St Peters Road, Plymouth, Devon, PL5 3FD', to: '> 121 St Peters Road, Plymouth, Devon, PL5 3FE',
    caught: { throws: /the council's address line: expected exactly one match, found 0/ } },
  { name: 'A DUPLICATED ANCHOR IN THE PAGES FILE IS CAUGHT', file: 'pages',
    find: '> (Easting:247664.88, Northing:58727.59)', to: '> (Easting:247664.88, Northing:58727.59)\n> (Easting:247664.88, Northing:58727.59)',
    caught: { throws: /Active Places grid reference: expected exactly one match, found 2/ } },
  { name: 'A URL THAT OCCURS TWICE IS CAUGHT', file: 'probe',
    find: `GET ${u.pc(SITE_POSTCODE)}\n`, to: `GET ${u.pc(HUB_POSTCODE)}\n`,
    caught: { throws: /the URL occurs twice/ } },
  { name: 'A MISSING PROBE BLOCK IS CAUGHT', file: 'probe',
    find: `GET ${u.pc(HUB_POSTCODE)}\n`, to: `GET ${u.pc('PL5 3FX')}\n`,
    caught: { throws: /no probe block for https:\/\/api\.postcodes\.io\/postcodes\/PL5%203FD/ } },
]

const selfTest = () => {
  const { check, summarize } = createChecks()
  const { probe, pages } = read()
  const base = judge(probe, pages)
  check('the real files pass every check, so a red below is the doctoring and not the baseline', base.checks.every(c => c.pass), base.checks.filter(c => !c.pass).map(c => c.name).join('; '))
  for (const m of MUTATIONS) {
    let caught = false, how = 'not caught: every check passed'
    try {
      const doctored = { probe, pages, [m.file]: mutate(m.file === 'probe' ? probe : pages, m.find, m.to) }
      const j = judge(doctored.probe, doctored.pages)
      const failed = j.checks.filter(c => !c.pass)
      if (m.caught.check) {
        caught = failed.some(c => c.name.includes(m.caught.check))
        how = caught ? '' : `the named check "${m.caught.check}" did not fail; failed: ${failed.map(c => c.name).join('; ') || 'none'}`
      } else how = 'judge returned instead of throwing'
    } catch (e) {
      if (/^HARNESS/.test(e.message)) throw e
      caught = Boolean(m.caught.throws && m.caught.throws.test(e.message))
      how = caught ? '' : `threw something else: ${e.message}`
    }
    check(m.name, caught, how)
  }
  // The harness's own guards must fire too: a mutation script that mutates nothing, or mutates the wrong place, reports a result about nothing.
  const throwsHarness = f => { try { f(); return false } catch (e) { return /^HARNESS/.test(e.message) } }
  check('A NON-UNIQUE ANCHOR STOPS THE HARNESS', throwsHarness(() => mutate(probe, '"quality":1,', '"quality":6,')), 'mutate() accepted an anchor that occurs more than once')
  check('A MUTATION THAT CHANGES NOTHING STOPS THE HARNESS', throwsHarness(() => mutate(probe, '#### END OF PROBE 3', '#### END OF PROBE 3')), 'mutate() accepted a replacement identical to its anchor')
  check(`checked ${MUTATIONS.length} of ${MUTATIONS.length} doctorings, each with a unique anchor in the real files`, true)
  finish(summarize())
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--self-test')) selfTest()
  else {
    const { probe, pages } = read()
    const { lines, checks } = judge(probe, pages)
    console.log(lines.join('\n') + '\n')
    const { check, summarize } = createChecks()
    for (const c of checks) check(c.name, c.pass, c.detail)
    finish(summarize())
  }
}
