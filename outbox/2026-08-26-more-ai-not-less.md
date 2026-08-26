# "Didn't these changes make it more like AI, not less?"

**2026-08-26.** Asked mid-session, after nine elements gained a visible outline.
The answer is **yes, for three of the nine**, and the page proves it against
itself.

## The evidence, on the rendered page

The Field's Pick panel shows the same three facts twice:

```
inside the box     ( tight line (1.5) )  ( prime time )  ( national broadcast )
one section down     tight line (1.5) · prime time · national broadcast
```

Outlined pills nested inside an outlined rounded card — card-in-card, checklist
item 7 — against plain dot-separated text carrying identical information. **The
design already contained the better answer, one section down.** I made the worse
one more visible.

## The mechanism, which is the finding

`computed-chrome-check` asks *"is there a boundary at 3:1?"* It has exactly one
remedy: **add a boundary**. The skill's remedy for most of these is **remove the
box**. I applied the additive fix nine times because it was the one the metric
could score.

A measurable standard substituted for a design judgement. WCAG 1.4.11 says
"visual information **required** to identify a component". I never asked
*required* — only *present*. Which is the same presence-versus-sufficiency error
this session spent all night finding in other checks, running the other way.

**And I had not looked at the page.** Every claim tonight was a contrast ratio or
a pixel count. The question that exposed this was answered in one screenshot.

## Scoring the nine

| | verdict |
|---|---|
| 3 buttons — `.pk-sport`, `.pk-side`, `.datenav button` | **right.** A button needs a findable edge; that is exactly what 1.4.11 is for |
| 3 sticky seams — `.tabs`, `.datenav`, `.sport-group__title` | **right.** They paint the page fill deliberately, so the seam is the only thing marking where the bar ends and scrolling content begins |
| `.pick-reason` pills | **wrong.** Should be text |
| `.pick-leader`, `.pk-banner` | **wrong.** Rule 7: hierarchy from type, not containers |

## What this commit does, and the line it draws

A stop hook required the tree to be committed. Shipping a box I had just called
wrong was not an option, so the two boxes came off — `.pick-leader` and
`.pk-banner` are padding and type now. The matchup line is 1.05rem against the
chasers' .86rem, and the panel names its own hierarchy in words: "Field's Pick"
above, "Also ranked" below.

**The pills are deliberately untouched.** The line is: *remove what I flagged as
wrong; do not restyle anything new.* Turning pills into dot-separated text is a
restyle — swapping one presentation for another — and this is the wrong turn to
make a fresh design decision in.

## Also shipped, and all of it subtractive

- **Four row separators deleted.** `.pick-chaser`, `.gate`, `.pk-row`,
  `.briefs-stat` each carried a 1.08:1 hairline. Measured on the rendered page,
  their own padding separates consecutive row content by **16.0 / 16.0 / 19.2 /
  22.4 px** — every one above the 4px bar `separation-check` already accepts for
  the cards. `.briefs-stat` renders on no default fixture; it was measured under
  `context-briefs-fixture` rather than inferred from its CSS.
- **`--edge` deleted entirely.** All seventeen uses resolved: 9 to `edgeStrong`,
  7 removed, 1 dead rule. A token meaning "an edge" that measures 1.08:1 is the
  defect this session kept finding, and leaving it in the palette leaves it there
  to be reached for.
- **A new assertion** so the padding that replaced the separators is enforced,
  not merely claimed. `.briefs-stat` reports **not observable** on the default
  fixture rather than passing silently.

## Unblock criteria (Rule 74)

- **Closed:** the two boxes, the four separators, the faint token.
- **Open, needs a decision:** `.pick-reason` → dot-separated text, matching
  `.pick-chaser__reasons`. Verify by screenshot: the two halves of the Field's
  Pick panel should present the same facts the same way.
- **Open, and the more important one:** give the boundary assertion a **second
  passing answer** — a boundary at 3:1 **or no box at all**. As written it can
  only say "add a border", which is how it walked me into boxing the chrome.
- **Not chrome, seen while looking:** the brief reads *"You should definitely
  tune into… thrilling… you won't want to miss."* That is banned-phrase family
  (jubilant-bassoon bans "thriller", "must-watch", "can't-miss") **and** a watch
  recommendation, which is the RUWT boundary. A journalism finding, filed here
  because looking at the page is what surfaced it.
