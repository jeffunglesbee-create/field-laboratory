# "Two fonts only" was enforced twice, and neither reached the page

`Typography.fs` states the rule and encodes it:

> `"two fonts only"` → `Font` is a closed union of two. A third face is a compile
> change forced through every match, not a CSS import nobody notices.

Both existing guards are real, and neither covers page CSS:

| guard | what it reads | what it asserts |
|---|---|---|
| `typography-check.mjs` | `build/Typography.js` | the registry is internally consistent — every role resolves to one of two faces |
| `design-tokens-check.mjs` | `public/index.html` | `--font-identity` / `--font-body` **equal** `Typography.fontFamily(...)` |
| `computed-chrome-check.mjs` | the rendered page | `color`, `backgroundColor`, `border*`, `opacity`, `fontStyle`, `fontWeight`, `fontSize`, `textDecorationLine` — **not `fontFamily`** |

So F# cannot *name* a third face and the injected tokens are provably correct —
and a rule anywhere else in the stylesheet setting `font-family` directly passes
every one of them. Measured:

```
does anything forbid a font-family outside the injected block?   (nothing)
is fontFamily in any computed-style PROPS list?                  (no)
```

## Found while costing a charting library, but not about one

uPlot ships a required 1.9 KB stylesheet whose first rule is
`.uplot { font-family: system-ui, -apple-system, "Segoe UI", … }`. Vendoring it
would put a third stack on the page with every guard green. **The gap is not
about uPlot** — it is about any vendored stylesheet, any hand-added rule, and any
UA default reaching an element nothing styles.

## The corpus is text-bearing elements, not every element

`font-family` inherits. Scanning every element makes a wrapper report its
parent's face — one violation counted three times, and a `<div>` with no text
reporting a face no reader ever sees. An element with **its own non-empty text
node** is exactly the set whose font is visible.

## The positive control is the part that earns its place

A detector that has gone blind and a page that is genuinely clean produce
identical output. So every run injects `body * { font-family: "Comic Sans MS"
!important }`, re-scans, and asserts the detector fires on all of it — then
removes the rule and asserts the page is clean again, so the control cannot leave
the corpus dirty for the assertions that follow.

## Result — the page is clean today

```
PASS  the font corpus is real (195 text-bearing element(s))
PASS  there are exactly two declared faces to check against
PASS  every visible glyph is set in one of the two declared faces
PASS  the detector fires on an injected Comic Sans MS rule
PASS  ...and the control left the page as it found it

25/25 checks passed
```

195 elements, every one in `'Chakra Petch', ui-sans-serif, system-ui, sans-serif`
or `'DM Sans', system-ui, -apple-system, sans-serif`.

## Teeth — 1 of 3 mutations discriminates, and that is stated rather than rounded up

| mutation | result |
|---|---|
| the detector is made blind (`normFont` collapses everything) | **24/25 — the CONTROL fails** |
| the corpus filter dropped (every element, not text-bearing ones) | 25/25 — no discrimination |
| the vacuity floor removed (`> 20` → `>= 0`) | 25/25 — no discrimination |

**The first one is the whole design.** Blinding the detector does not fail the
main assertion — a blind detector reports a clean page, which is what it would
have done. It fails the *control*. Without the control the mutation is invisible.

The other two guard conditions this fixture cannot create. Dropping the corpus
filter changes nothing here because every element on this page inherits one of
the two faces anyway; it is a precision choice, not something this page can
falsify. The vacuity floor could not be made to fire at all — a deliberately
nonexistent fixture (`?data=does-not-exist`) still renders **94** text-bearing
elements, and no fixture reaches below 20. Both are guards against a future run,
asserted and **not proven**, and saying so is cheaper than implying three.
