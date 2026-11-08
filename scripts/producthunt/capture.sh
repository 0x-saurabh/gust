#!/bin/sh
# Re-captures the Product Hunt gallery from the live site at 1270x760 with headless Chrome.
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; OUT=$(dirname "$0")/gallery; T=$(mktemp -d)
i=2; for p in market sell trades mcp; do "$CH" --headless=new --disable-gpu --hide-scrollbars --window-size=1270,760 --force-dark-mode --virtual-time-budget=8000 --screenshot="$T/$p.png" "https://kyte.sh/$p" >/dev/null 2>&1; ffmpeg -v error -y -i "$T/$p.png" -q:v 2 "$OUT/0$i-$p.jpg"; i=$((i+1)); done
i=7; for p in launchpad stake proof docs; do "$CH" --headless=new --disable-gpu --hide-scrollbars --window-size=1270,760 --force-dark-mode --virtual-time-budget=8000 --screenshot="$T/$p.png" "https://kyte.sh/$p" >/dev/null 2>&1; ffmpeg -v error -y -i "$T/$p.png" -q:v 2 "$OUT/$(printf %02d $i)-$p.jpg"; i=$((i+1)); done
echo "gallery refreshed in $OUT"
