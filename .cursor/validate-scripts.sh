#!/usr/bin/env bash
# Idempotent sanity checks for Windows .bat / .vbs files in this repository.
# Scripts are intended to run on Windows; this validates structure on Linux agents.
set -euo pipefail

cd /workspace

shopt -s nullglob
bat_files=(*.bat)
vbs_files=(*.vbs)
files=("${bat_files[@]}" "${vbs_files[@]}")

if ((${#files[@]} < 1)); then
  echo "error: no .bat or .vbs files found in repository root" >&2
  exit 1
fi

for f in "${files[@]}"; do
  if [[ ! -s "$f" ]]; then
    echo "error: empty file: $f" >&2
    exit 1
  fi
  bytes=$(wc -c <"$f")
  lines=$(wc -l <"$f")
  printf 'OK: %s (%s lines, %s bytes)\n' "$f" "$lines" "$bytes"
done

echo "Validated ${#files[@]} Windows script file(s). Run on Windows for full execution."
