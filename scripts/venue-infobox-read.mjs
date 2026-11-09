// The reading of one Wikipedia article's parse tree, shared by the infobox probe (scripts/venue-infobox.mjs) and the roof rule
// (scripts/venue-source.mjs). docs/CC-CMD-2026-11-09-venue-review-remainder.md, Task 2, option 3, Step B.
//
// WHY IT IS ITS OWN FILE. The probe imports `retryWait` from the rule, so the rule importing anything from the probe would be an
// import cycle. This file imports nothing of ours; both of them import it. The code below was moved out of the probe without a
// changed line (outbox/venue-infobox-read-extraction-2026-11-09.txt shows the moved text identical, and every mutation that cuts it
// still goes red by name).
//
// NO NETWORK AND NO DECISION HERE. It turns the XML that `action=parse&prop=parsetree` returns into templates and parameters. What a
// parameter means is not this file's business.

import { DOMParser, XMLSerializer } from '@xmldom/xmldom'

export const API = 'https://en.wikipedia.org/w/api.php'
const INFOBOX = /^(?:template:)?infobox(?![a-z])/i
const RAW_CAP = 4000

export const parseUrl = title => `${API}?action=parse&page=${title}&prop=parsetree|revid&section=0&redirects=1&format=json`

// --- reading the parse tree --------------------------------------------------------------------

const kids = el => Array.from(el.childNodes ?? [])
const elems = (el, tag) => kids(el).filter(n => n.nodeType === 1 && n.tagName === tag)
const squash = s => s.replace(/\s+/g, ' ').trim()

/** A <value> as text: its own text and the values of any template nested in it. A ref (<ext>), a comment and any other element are counted and left out. */
export const flatOf = value => {
  const seen = { templates: [], exts: [], comments: 0, other: [] }
  const walk = el => {
    let text = ''
    for (const n of kids(el)) {
      if (n.nodeType === 3 || n.nodeType === 4) text += n.data
      else if (n.nodeType !== 1) continue
      else if (n.tagName === 'template') {
        seen.templates.push(squash(elems(n, 'title')[0]?.textContent ?? ''))
        for (const p of elems(n, 'part')) text += ' ' + walk(elems(p, 'value')[0] ?? p)
      } else if (n.tagName === 'ext') seen.exts.push(squash(elems(n, 'name')[0]?.textContent ?? ''))
      else if (n.tagName === 'comment') seen.comments++
      else seen.other.push(n.tagName)
    }
    return text
  }
  return { flat: squash(walk(value)), ...seen }
}

/** The XML text of one article's section 0 into: every top-level template title, and every Infobox template with its parameter names and its roof parameters. */
export const readTree = xml => {
  const errors = []
  let doc
  try {
    doc = new DOMParser({ onError: (level, msg) => errors.push(`${level}: ${String(msg).slice(0, 160)}`) }).parseFromString(xml, 'text/xml')
  } catch (e) {
    return { ok: false, why: `${e.name}: ${String(e.message).slice(0, 200)}`, errors }
  }
  const root = doc.documentElement
  if (root?.tagName !== 'root') return { ok: false, why: `the root element is ${root ? `<${root.tagName}>` : 'missing'}, not <root>`, errors }
  const templates0 = [], infoboxes = []
  for (const t of elems(root, 'template')) {
    const template = squash(elems(t, 'title')[0]?.textContent ?? '')
    templates0.push(template)
    if (!INFOBOX.test(template)) continue
    const params = [], roof = []
    for (const p of elems(t, 'part')) {
      const nm = elems(p, 'name')[0], val = elems(p, 'value')[0]
      if (!nm || !val) return { ok: false, why: `a parameter of "${template}" has no ${nm ? '<value>' : '<name>'}`, errors }
      const index = nm.getAttribute('index')
      const param = index ? `#${index}` : squash(nm.textContent)
      params.push(param)
      if (!index && /roof/i.test(param)) {
        const raw = new XMLSerializer().serializeToString(p)
        roof.push({ param, ...flatOf(val), raw: raw.slice(0, RAW_CAP), rawLength: raw.length })
      }
    }
    infoboxes.push({ template, params, roof })
  }
  return { ok: true, errors, templates0, infoboxes }
}
