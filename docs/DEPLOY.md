# Deploying the laboratory page

The page deploys to Cloudflare Workers as an assets-only Worker — the F# is
compiled to JavaScript ahead of time and runs in the browser, so there is no
server-side script.

Everything is committed and verified. **One secret is missing, and only a human
can add it.**

## Add this, and the deploy works

At **Settings → Secrets and variables → Actions → New repository secret**:

| Name | Value |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | a token with **Workers Scripts: Edit** |

Create the token at **dash.cloudflare.com → My Profile → API Tokens → Create
Token**, using the **Edit Cloudflare Workers** template.

Add `CLOUDFLARE_ACCOUNT_ID` as well **only if** that token can reach more than
one Cloudflare account; wrangler infers the account otherwise.

Then re-run the `deploy` workflow (Actions → deploy → Run workflow), or push any
non-docs change.

## Deploy runs only after verify passes

`deploy` is triggered by `verify` completing successfully on `main`, not by the
push itself. A failing check suite therefore blocks the deploy rather than
racing it. A manual dispatch bypasses this deliberately, so you can still ship
from a known-good commit without waiting.

## What it will publish

```
https://field-laboratory.jeffunglesbee.workers.dev
```

That hostname was confirmed free before any of this was built:

| URL | Result |
| --- | --- |
| `field-laboratory.jeffunglesbee.workers.dev` | 404, `error code 1042` — no such Worker |
| `field-laboratory.pages.dev` | DNS does not resolve |
| `field-playground.jeffunglesbee.workers.dev` | 200 — the sibling repo is deployed here |

So the account and subdomain pattern are already in use by `field-playground`;
this repo simply never had a page.

Probed from a GitHub Actions runner via `.github/workflows/probe-url.yml`, not
from a session: the agent sandbox blocks `*.workers.dev` at the proxy with
`403 CONNECT tunnel failed`, so a session cannot answer "does this URL exist".

## Why the failing run failed the way it did

The `deploy` workflow checks for the token in its **first** step and exits with
a named error, before installing .NET, restoring tools, or building. A missing
secret should cost seconds and say what to do, not fail three minutes later
inside wrangler with a credentials error.

## What gets built

`npm run build` does two things: compiles F# to `build/` with Fable, then runs
`scripts/build-site.mjs` to assemble `public/`.

`public/` is what deploys **and** what `npm run serve` serves locally, so the
render checks exercise the deployable artifact rather than a local-only
arrangement. That mattered: before this, `index.html` imported solid-js straight
out of `node_modules`, which worked only because the dev server happened to
serve the repo root — and `node_modules` is gitignored, so it was never
deployable at all.

The deploy verifies `public/` has real content before publishing, and then
fetches the live URL and greps it, so a green run means the page actually
served — not merely that wrangler exited 0.

## Deliberate choices worth not undoing

- **`not_found_handling = "none"`** in `wrangler.toml`. The page fetches
  `./data/*.json`; if a missing file were rewritten to `index.html`, the failure
  would surface as a baffling JSON parse error instead of a 404.
- **The deploy ignores `docs/**`, `outbox/**`, and `**/*.md`.** The drift
  sentinel pushes to `main` daily; without this it would redeploy the site every
  time it records a log row.
- **Test fixtures are not copied into `public/`.** Deliberately corrupted data
  has no business on a deployed page.

## Not done yet

The deployed page will render the committed captures in `data/`, not live relay
data. A Worker *can* reach the relay, so serving live data is genuinely possible
from here — but it needs a route on the Worker to proxy `/context/date/*`
server-side, which is a separate change with its own verification, not something
to smuggle into the first deploy.
