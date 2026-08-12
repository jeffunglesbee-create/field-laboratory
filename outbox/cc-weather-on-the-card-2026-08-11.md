# Weather on the card — 2026-08-11

Jeff, from the deployed page:

> Can weather be affixed to the game card?

Yes. The card already carried the venue name, so it already had the join key.

## The tension that had to be resolved first

The card renders synchronously; weather arrives asynchronously. And weather was
deliberately made **lazy** two commits ago, precisely so a third-party fetch
would not sit on page load — which is what broke every render check the first
time.

Affixing weather to the card means loading it without waiting for the tab.
Otherwise the chip appears only for viewers who happen to click Weather, which is
worse than not having it.

The signal that resolves this already existed in `Program.fs`, for the date
controls: **a page pinned to `?data=` is rendering a committed capture, and a
fixture render must not reach the network.** So the load fires when
`queryParam "data"` is `None`. Every render check pins a capture and stays clean;
a real viewer gets the chips.

## The chip, and what is NOT in it

`cardChip` is temperature and sky only. The card already carries a venue, a
matchup, a score, a status, odds and a desk line; a seventh full sentence makes
it a paragraph.

The roof caveat is **not** trimmed to fit. It goes in `cardChipTitle`, on both
`title` and `aria-label`. A caveat dropped for space is the display walking past
the honest limit, which is the exact move `RoofState` exists to prevent — so it
moves rather than disappearing.

Cards with no reading are left **empty**, not filled with a dash. An empty slot
says nothing; a dash says "we looked and there is nothing", which is a different
claim and usually false. The panel is one click away and states which of "not in
the table", "did not answer" and "outage" applies.

## The check found the table, not the fill

`nav-check` stubs Open-Meteo — the product should not avoid the network to suit a
probe, so the probe stubs the dependency, and the real service is exercised by
`weather-live-check` on a runner. Then it asserts a chip actually reaches the DOM,
because `fillCards` could silently match nothing and every other check would stay
green: an empty slot is indistinguishable from "no reading" **by design**.

First run:

```
FAIL  at least one card carries a weather chip
      → 2 slots, 0 filled — fillCards matched nothing
```

The fill was correct. The **table** was incomplete. The committed captures use
`S.C.G.`, `Marrara Oval`, `Yankee Stadium` and `Rate Field`, and the first two
were not in `Venues.fs`. A venue table whose coverage is never measured against
the slates actually rendered is a table that looks complete because nothing
asked. Both added, with their zones, which the planet check will verify on the
runner.

Worth naming: the three chip assertions after that one **passed vacuously** —
`Array.every` on an empty array is `true`. That is exactly what the F# harness
would call `NoTeeth`, sitting in the JavaScript half where nothing enforces a
counterexample. They are real now only because the first assertion failed and
made them non-empty.

## Two wrong diagnoses, both mine

`nav-check` timed out and I blamed `networkidle`, reasoning that a page with
three network sources has no idle moment. I rewrote the wait on that basis. The
actual cause was that **the local server had died**. I reverted the edit rather
than keep a change justified by a misreading — it may even have been an
improvement, but I did not establish that, and keeping it would be reasoning
dressed as evidence.

Before that I had also placed the chip assertions after `browser.close()`.

CONFIDENCE: 96.

Artifacts: `check:nav` 22/22 including the four new chip assertions; `check`
13/13 and `check:hard` 13/13, both still free of console errors because they pin
a capture; `VerifyMain` 35/35 with three new chip checks whose counterexamples
are a rain label on a dry reading and an open-air title on a retractable venue;
`tab-check` 24/24; the gate.

Docked four: the chip has been seen filled only against a **stubbed** 61°F
reading. Its live behaviour — real temperatures, a real precipitation state, the
alias collapse under load — runs on the runner, and the run that exercises it is
the one this commit triggers.

## The automated follow-up

The docking above — "the chip has been seen filled only against a stubbed 61°F
reading" — is closed by automation rather than by a promise to check.

`render-check` now asserts the chip against the REAL service, and only when
unpinned, which is `npm run check:live` on a runner with egress.

The expectation is **derived, not a constant**: count the cards whose venue the
table actually carries, and require exactly that many chips. A slate with no
known venue expects zero and passes; a slate with twelve expects twelve. It
cannot rot into "at least one", which would go green on a single lucky card while
eleven silently stayed blank — and "at least one" is what I would have written if
the F# harness had not spent this session making counterexamples compulsory.

**`check:workflows` caught the cost of that immediately:**

```
FAIL  no job runs a build-dependent script without building
      → live-check.yml:live runs scripts/render-check.mjs — which import build/
        — but never builds
```

Deriving the expectation means importing `build/Venues.js`, and `live-check.yml`
had no build step. That is precisely the failure the guard was written for, found
before any run hit it. `live-check` now builds; 6/6.

So both surfaces are now checked live on a schedule or a trigger:
`weather-live-check` verifies the venue table against the planet daily, and
`check:live` verifies that the chips actually reach the cards of the deployed
page. Neither needs me to look.
