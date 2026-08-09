#!/bin/bash
# Compile the F# project to JavaScript with Fable.
#
# The wrapper exists for one measured reason, not for style: the JS-hosted
# Fable compiler (@fable-org/fable-compiler-js v2.11.0) exits 0 even when
# compilation fails. Verified directly — a project referencing a NuGet package
# it cannot resolve printed "ERROR: Cannot find package ...", emitted no
# JavaScript, and still returned exit code 0. A bare `fable ...` build script
# would therefore report success on a broken build. This turns that into a
# real failure.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

OUT_DIR="build"
ENTRY="build/Program.js"

LOG="$(mktemp)"
trap 'rm -f "$LOG"' EXIT

npx fable src/Laboratory.fsproj --outDir "$OUT_DIR" 2>&1 | tee "$LOG"

if grep -qE '^ERROR:|\): (error|Error):' "$LOG"; then
  echo "build.sh: Fable reported errors (see output above)." >&2
  exit 1
fi

if [ ! -s "$ENTRY" ]; then
  echo "build.sh: expected JavaScript output at $ENTRY was not produced." >&2
  exit 1
fi

echo "build.sh: OK — $ENTRY produced."
