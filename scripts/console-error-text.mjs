// The text a live check prints for a page error, with the request behind it named.
//
// WHICH REQUEST FAILED.
//
// Chromium reports a failed request to the console as "Failed to load resource: the
// server responded with a status of 429 (Too Many Requests)" and puts the request's
// URL on the message's LOCATION, not in its text. Printing only the text cannot say
// which host refused. scripts/schedule-live-check.mjs went red on 2026-11-22 with 30
// identical lines of that text and on 2026-11-23 with 6; src/ names three hosts a page
// request can go to (the relay, statsapi.mlb.com, api.open-meteo.com) and neither log
// said which one.
//
// MEASURED 2026-11-24, playwright 1.62.1 (the lab's pin) on Chromium revision 1243:
// `location().url` is the failed request, for a 429 and for net::ERR_*, same-origin and
// cross-origin. For the other two shapes a console handler sees it is NOT: a CORS refusal
// already names the request in its text and carries the PAGE as its location, and an
// app-level console.error carries its script. Appending the URL to those would blame
// the page, so only "Failed to load resource" lines get one. The runner installs
// revision 1234; scripts/schedule-live-check-names-request.mjs runs
// scripts/schedule-live-check.mjs against a stub 429 on that build in every live-check
// run, and holds this function's five cases beside it
// (docs/CC-CMD-2026-11-24-step16-names-the-request.md).
//
// A MODULE OF ITS OWN, NOT A FUNCTION IN THE SCRIPT. The script launches a browser the
// moment it is imported, and the five cases need none. The first version kept them in a
// `--self-test` branch of the script that ended in `process.exit(summarize())`. That is an
// early report exit, the 64th against a ratchet of 63, and verify went red on "No check
// script kills itself mid-write" (run 45473543164, 2026-11-24). Nothing in this file exits.
export const describeConsoleError = (text, requestUrl) =>
  text.startsWith('Failed to load resource') && requestUrl ? `${text} — ${requestUrl}` : text
