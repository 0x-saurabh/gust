#!/usr/bin/env bash
# stills.sh <mp4> <t1> <t2> ...   (seconds, decimals ok)
# Writes full-resolution PNGs to video/out/qa/<name>-<t>s.png (frame-accurate seek).
set -euo pipefail
[ $# -ge 2 ] || { echo "usage: $0 <mp4> <t1> [t2 ...]" >&2; exit 2; }
IN="$1"; shift
OUT_DIR="$(cd "$(dirname "$0")/.." && pwd)/out/qa"
mkdir -p "$OUT_DIR"
base=$(basename "${IN%.*}")
for t in "$@"; do
  f="$OUT_DIR/${base}-${t}s.png"
  # input-side -ss is frame-accurate when re-encoding; -update 1 writes a single image
  ffmpeg -v error -y -ss "$t" -i "$IN" -frames:v 1 -update 1 "$f"
  echo "$f"
done
