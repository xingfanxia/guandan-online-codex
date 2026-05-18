#!/usr/bin/env bash
set -euo pipefail

dirs=()
for dir in api lib src; do
  if [[ -d "$dir" ]]; then
    dirs+=("$dir")
  fi
done

if [[ ${#dirs[@]} -eq 0 ]]; then
  exit 0
fi

violations="$(
  grep -RInE 'redis\.publish\(|client\.send\(' "${dirs[@]}" \
    --include='*.ts' \
    --exclude-dir=node_modules 2>/dev/null \
    | grep -v 'lib/realtime/payload.ts' || true
)"

if [[ -n "$violations" ]]; then
  printf 'Hidden-state publish/send guard failed:\n%s\n' "$violations" >&2
  exit 1
fi

publish_violations="$(
  grep -RInE '\.publish\(' "${dirs[@]}" \
    --include='*.ts' \
    --exclude-dir=node_modules 2>/dev/null \
    | grep -v 'lib/realtime/publish.ts' \
    | grep -v 'lib/realtime/upstash.ts' \
    | grep -v 'lib/realtime/upstashRest.ts' || true
)"

if [[ -n "$publish_violations" ]]; then
  printf 'Hidden-state publisher guard failed:\n%s\n' "$publish_violations" >&2
  exit 1
fi
