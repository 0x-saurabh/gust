#!/usr/bin/env bash
# check.sh <mp4> [--fix]
# Asserts the delivery spec (video/SPEC.md) and measures loudness.
#   1920x1080, 60 fps constant (r_frame_rate = avg_frame_rate = 60/1), h264, yuv420p,
#   duration 85-95 s, an AAC audio stream; EBU R128 integrated loudness vs -14 LUFS (+-1 LU)
#   and true peak <= -2 dBTP.
# --fix writes <name>.norm.mp4 next to the input: two-pass loudnorm (linear) to
#   -14 LUFS / -2 dBTP, video stream copied, AAC 320k 48 kHz, then re-checks it.
# Exit status: 0 if every check passes, 1 otherwise.
set -uo pipefail

TARGET_I=-14
TARGET_TP=-2
TOL_I=1

usage() { echo "usage: $0 <mp4> [--fix]" >&2; exit 2; }
[ $# -ge 1 ] || usage
IN="" FIX=0
for a in "$@"; do
  case "$a" in
    --fix) FIX=1 ;;
    -h|--help) usage ;;
    *) IN="$a" ;;
  esac
done
[ -f "$IN" ] || { echo "no such file: $IN" >&2; exit 2; }

FAIL=0
if [ -t 1 ]; then G=$'\033[32m' R=$'\033[31m' Y=$'\033[33m' N=$'\033[0m'; else G="" R="" Y="" N=""; fi
ok()   { printf '  %sPASS%s  %-14s %s\n' "$G" "$N" "$1" "$2"; }
bad()  { printf '  %sFAIL%s  %-14s %s\n' "$R" "$N" "$1" "$2"; FAIL=1; }
warn() { printf '  %sWARN%s  %-14s %s\n' "$Y" "$N" "$1" "$2"; }

probe() { ffprobe -v error -select_streams "$1" -show_entries "$2" -of default=nw=1:nk=1 "$IN" | head -1; }

check_file() {
  IN="$1"; FAIL=0
  echo "== $IN"
  local w h r avg codec pix dur acodec arate ach nb
  w=$(probe v:0 stream=width); h=$(probe v:0 stream=height)
  r=$(probe v:0 stream=r_frame_rate); avg=$(probe v:0 stream=avg_frame_rate)
  codec=$(probe v:0 stream=codec_name); pix=$(probe v:0 stream=pix_fmt)
  nb=$(probe v:0 stream=nb_frames)
  dur=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$IN")
  acodec=$(probe a:0 stream=codec_name); arate=$(probe a:0 stream=sample_rate); ach=$(probe a:0 stream=channels)

  [ "$w" = 1920 ] && [ "$h" = 1080 ] && ok size "${w}x${h}" || bad size "${w}x${h} (want 1920x1080)"
  [ "$r" = 60/1 ] && [ "$avg" = 60/1 ] && ok fps "r=$r avg=$avg" || bad fps "r=$r avg=$avg (want 60/1 constant)"
  [ "$codec" = h264 ] && ok codec "$codec" || bad codec "$codec (want h264)"
  [ "$pix" = yuv420p ] && ok pix_fmt "$pix" || bad pix_fmt "$pix (want yuv420p)"
  if awk -v d="$dur" 'BEGIN{exit !(d>=85 && d<=95)}'; then ok duration "${dur}s"; else bad duration "${dur}s (want 85-95)"; fi
  if [ -n "$nb" ] && [ "$nb" != N/A ]; then
    exp=$(awk -v d="$dur" 'BEGIN{printf "%d", d*60+0.5}')
    awk -v n="$nb" -v e="$exp" 'BEGIN{exit !(n-e<=2 && e-n<=2)}' && ok frames "$nb (~${exp} expected)" || warn frames "$nb vs ~$exp from duration"
  fi
  if [ "$acodec" = aac ]; then ok audio "aac ${arate}Hz ${ach}ch"; else bad audio "${acodec:-none} (want aac)"; return; fi

  local log I TP LRA
  log=$(ffmpeg -nostats -hide_banner -i "$IN" -map 0:a:0 -af ebur128=peak=true:framelog=quiet -f null - 2>&1)
  I=$(echo "$log" | awk '/^ +I:/{v=$2} END{print v}')
  TP=$(echo "$log" | awk '/^ +Peak:/{v=$2} END{print v}')
  LRA=$(echo "$log" | awk '/^ +LRA:/{v=$2} END{print v}')
  if awk -v i="$I" -v t=$TARGET_I -v tol=$TOL_I 'BEGIN{d=i-t; if(d<0)d=-d; exit !(d<=tol)}'; then
    ok loudness "I=${I} LUFS (target ${TARGET_I} +-${TOL_I}), LRA=${LRA} LU"
  else
    bad loudness "I=${I} LUFS (target ${TARGET_I} +-${TOL_I}), LRA=${LRA} LU -> run with --fix"
  fi
  if awk -v p="$TP" -v t=$TARGET_TP 'BEGIN{exit !(p<=t)}'; then ok true_peak "${TP} dBTP (max ${TARGET_TP})"; else bad true_peak "${TP} dBTP (max ${TARGET_TP}) -> run with --fix"; fi
}

check_file "$IN"
RESULT=$FAIL

if [ $FIX = 1 ]; then
  OUT="${IN%.*}.norm.mp4"
  echo "== loudnorm pass 1 (measure)"
  J=$(ffmpeg -nostats -hide_banner -i "$IN" -map 0:a:0 \
      -af "loudnorm=I=${TARGET_I}:TP=${TARGET_TP}:LRA=11:print_format=json" -f null - 2>&1 \
      | awk '/^\{/{p=1} p{print} /^\}/{p=0}')
  get() { echo "$J" | awk -F'"' -v k="$1" '$2==k{print $4}'; }
  MI=$(get input_i); MTP=$(get input_tp); MLRA=$(get input_lra); MTH=$(get input_thresh); OFF=$(get target_offset)
  echo "   measured I=$MI TP=$MTP LRA=$MLRA thresh=$MTH offset=$OFF"
  [ -n "$MI" ] || { echo "loudnorm measurement failed" >&2; exit 1; }
  # loudnorm treats measured_LRA=0 as unmeasured and silently falls back to dynamic mode
  MLRA=$(awk -v l="$MLRA" 'BEGIN{print (l<0.1 ? 0.1 : l)}')
  # Linear mode also needs target LRA >= measured LRA. Sparse SFX-only mixes measure ~20+ LU, so a fixed LRA=11
  # forced dynamic mode. Target max(11, measured+1), within loudnorm's 1..50 range.
  TLRA=$(awk -v l="$MLRA" 'BEGIN{t=l+1; if (t<11) t=11; if (t>50) t=50; printf "%.1f", t}')
  echo "== loudnorm pass 2 (apply, linear) -> $OUT"
  J2=$(ffmpeg -y -nostats -hide_banner -i "$IN" -map 0:v:0 -map 0:a:0 -c:v copy \
    -af "loudnorm=I=${TARGET_I}:TP=${TARGET_TP}:LRA=${TLRA}:measured_I=${MI}:measured_TP=${MTP}:measured_LRA=${MLRA}:measured_thresh=${MTH}:offset=${OFF}:linear=true:print_format=json" \
    -ar 48000 -c:a aac -b:a 320k -movflags +faststart "$OUT" 2>&1)
  NT=$(echo "$J2" | awk -F'"' '$2=="normalization_type"{print $4}')
  echo "   normalization_type=$NT"
  [ "$NT" = linear ] || echo "   note: loudnorm fell back to dynamic mode (the mix needs more than linear gain to hit ${TARGET_TP} dBTP; consider lowering peaks in the mix)"
  check_file "$OUT"
  RESULT=$FAIL
fi
exit $RESULT
