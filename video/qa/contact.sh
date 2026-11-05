#!/usr/bin/env bash
# contact.sh <mp4> [n=24] [out.jpg]  -> video/out/contact-sheet.jpg
set -euo pipefail
exec "${PYTHON:-python3}" "$(dirname "$0")/contact.py" "$@"
