# Venue sourcing, stage 1: a rule for trusting a geocoded point, and the means to calibrate it

CC-CMD: `docs/CC-CMD-2026-10-20-outdoor-venue-sourcing.md`. The owner chose "full"
(about 360 venues) after Task 0 priced it (`outbox/cc-session-2026-10-21-outdoor-venue-sourcing-task0.md`).
This is the first of four stages. It adds no venue to the table.

## Why the first stage is a rule and not a list

field-playground's `scripts/probe-poi-geocode.mjs` validates a handful of
venues whose coordinates are already known and scores the result on distance. It
is not a bulk geocoder, and a NEW venue has nothing to score against. Its own
header names the danger: a geocoder returning a plausible-but-wrong point is
worse than returning nothing, because it renders a believable temperature for
the wrong city. So 360 venues cannot be added until there is a rule for when a
point is trusted, and the rule has to be measured before it is used.

## The rule (`scripts/venue-source.mjs`)

A point is ACCEPTED only when two independent families agree within the
probe's own threshold, 0.02 degrees on each axis: Wikidata, and OpenStreetMap
through either of its two front ends (Nominatim, Photon). The independence is
the point. Nominatim and Photon both read OpenStreetMap, so their agreeing with
each other is one witness heard twice. Anything else is `review` with every
candidate listed, or `none`.

Premises, and the one command that tests each (Rule 100):

1. "Two independent families agreeing is safe." Tested by `--calibrate`, which
   runs the rule over the 109 venues in `src/Venues.fs`, whose coordinates are
   hand-reviewed, and requires **zero accepted-and-wrong**. The calibration also
   counts how often the two OSM front ends agreed alone and were wrong, which
   prices the independence rule instead of asserting it. Runs on a runner:
   this sandbox does not reach the geocoder hosts. **Not run yet in this stage's
   commit; the result is recorded below.**
2. "The table reader sees every venue." Measured here: `readTable()` returns
   109, the same as the count of `at "` lines in `src/Venues.fs`.

## Verified here

- `--self-test`: 12 of 12, no network. It covers: Wikidata plus one OSM source
  accepted at the mean; two OSM sources alone refused; Wikidata dissenting from
  two agreeing OSM points refused; an outlier named as dissent while the
  agreeing pair still wins; one source alone and no source; the threshold from
  both sides (0.02 exactly accepted, 0.0201 not); independent axes.
- **Three mutations, each caught** (`--only <id>`):
  `venue-source-one-family-accepted` (OSM alone accepted),
  `venue-source-threshold-widened` (0.02 to 0.2), `venue-source-one-axis-only`
  (longitude ignored).
- The guards that police a new script and workflow pass: `check:workflows`,
  script orphans, short-circuit, row-confidence, gate inventory, and
  `check-push-lands.py` (now 9 push-retry loops, mine included).

## Public-service etiquette (API-COST-A)

The script sends a User-Agent naming this repository, waits 1.1 s between
Nominatim requests, retries once on 429 or 5xx, and keeps a committed cache
(`outbox/venue-source-cache.json`, 30-day TTL). Only successful answers are
cached; an error is never remembered as an answer. Calibration is about 450
requests, roughly 8 minutes.

## What comes next, and what it needs

2. Roof type and a declared zone. The zone must NOT come from Open-Meteo, or
   `weather-live-check`, which compares the declared zone with Open-Meteo's, is
   circular. An offline timezone-boundary lookup is independent of it.
3. The target list: the exact venue strings from `field-archive` (read through
   the D1 connector, because the runner token is refused with code 7403).
4. Rows into `src/Venues.fs` in gated batches, each with a mutation, and a
   review list for everything the rule did not accept.
