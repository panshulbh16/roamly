#!/usr/bin/env bash
# Post-deploy gate: fails unless $1 serves commit $2 within ~60s, with every page uncached and healthy.
set -euo pipefail
site=${1%/} sha=$2 live=""
version() { curl -fsS -o /dev/null -D - "$1" | tr -d '\r' | awk -F': ' 'tolower($1)=="x-roamly-version"{print $2}'; }
for _ in $(seq 1 30); do
  live=$(version "$site/?deploy=$sha" || true)
  [ "$live" = "$sha" ] && break
  sleep 2
done
[ "$live" = "$sha" ] || { echo "✗ live version is '${live:-none}', expected $sha"; exit 1; }
echo "✓ $sha is live at $site"
for path in / /pricing /together /explore /auth; do
  headers=$(curl -fsS -o /dev/null -D - "$site$path" | tr -d '\r')
  grep -qi '^cache-control: private, no-store' <<<"$headers" || { echo "✗ $path is cacheable"; exit 1; }
  grep -qi "^x-roamly-version: $sha" <<<"$headers" || { echo "✗ $path served an older version"; exit 1; }
  echo "✓ $path fresh"
done
