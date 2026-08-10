#!/bin/bash
# Sets CLOUDFLARE_API_TOKEN as a repository Actions secret.
#
# WHY THIS IS A SCRIPT YOU RUN, NOT SOMETHING A SESSION DOES
# A Claude Code session cannot set this, and the reason is a deliberate
# guardrail rather than a missing feature. Verified directly:
#
#   GET /repos/<repo>/actions/secrets/public-key
#   403 {"message":"Access to this GitHub Actions path is not permitted
#        through this proxy."}
#
# The GitHub proxy authenticates ordinary API calls (GET /user returns 200) and
# specifically refuses the Actions secrets path. On top of that, a session has
# no business receiving a live credential in its transcript. So this runs where
# the token already is: your machine.
#
# The token is read from stdin, never from an argument — arguments land in
# shell history and the process list.
#
#   ./scripts/set-deploy-secret.sh
#   (paste the token, press Enter)
#
# or non-interactively, from a password manager:
#
#   op read op://private/cloudflare/token | ./scripts/set-deploy-secret.sh

set -uo pipefail

REPO="${REPO:-jeffunglesbee-create/field-laboratory}"
NAME="${NAME:-CLOUDFLARE_API_TOKEN}"

if ! command -v gh >/dev/null 2>&1; then
  cat >&2 <<'EOF'
This needs the GitHub CLI (`gh`), which handles the sealed-box encryption the
secrets API requires.

  brew install gh && gh auth login

If you would rather not install it, the web form is genuinely just as fast for a
one-time secret:
  Settings -> Secrets and variables -> Actions -> New repository secret
EOF
  exit 1
fi

if [ -t 0 ]; then
  printf 'Paste the Cloudflare API token (input hidden), then Enter: ' >&2
  read -rs TOKEN
  printf '\n' >&2
else
  read -r TOKEN
fi

if [ -z "${TOKEN:-}" ]; then
  echo "No token supplied; nothing was changed." >&2
  exit 1
fi

if ! printf '%s' "$TOKEN" | gh secret set "$NAME" --repo "$REPO" --app actions; then
  echo "Failed to set $NAME on $REPO." >&2
  exit 1
fi

echo "Set $NAME on $REPO."
echo
echo "Nothing else to do — the deploy workflow re-checks hourly and will"
echo "publish the site on its own. To watch it now:"
echo "  gh workflow run deploy.yml --repo $REPO"
echo "  gh run watch --repo $REPO"
