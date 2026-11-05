#!/usr/bin/env python3
"""contact.py <mp4> [n=24] [out.jpg]

Contact sheet of n evenly spaced frames (6 columns, each stamped with its
timestamp) -> video/out/contact-sheet.jpg. Needs ffmpeg/ffprobe and numpy only:
this ffmpeg build has no drawtext, so timestamps are drawn with a tiny built-in
bitmap font.
"""
import os
import subprocess
import sys

import numpy as np

COLS, TW, TH, PAD = 6, 384, 216, 8
HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_OUT = os.path.normpath(os.path.join(HERE, "..", "out", "contact-sheet.jpg"))

# 3x5 glyphs, rows top->bottom, bits left->right
FONT = {
    "0": ["111", "101", "101", "101", "111"], "1": ["010", "110", "010", "010", "111"],
    "2": ["111", "001", "111", "100", "111"], "3": ["111", "001", "111", "001", "111"],
    "4": ["101", "101", "111", "001", "001"], "5": ["111", "100", "111", "001", "111"],
    "6": ["111", "100", "111", "101", "111"], "7": ["111", "001", "010", "010", "010"],
    "8": ["111", "101", "111", "101", "111"], "9": ["111", "101", "111", "001", "111"],
    ":": ["000", "010", "000", "010", "000"], ".": ["000", "000", "000", "000", "010"],
    "f": ["011", "100", "110", "100", "100"], " ": ["000"] * 5,
}


def stamp(img, text, x, y, s=4):
    w = len(text) * 4 * s + 2 * s
    img[y:y + 7 * s, x:x + w] = (img[y:y + 7 * s, x:x + w] * 0.25).astype(np.uint8)
    cx = x + s
    for ch in text:
        for r, row in enumerate(FONT.get(ch, FONT[" "])):
            for c, b in enumerate(row):
                if b == "1":
                    img[y + s + r * s:y + s + (r + 1) * s, cx + c * s:cx + (c + 1) * s] = 255
        cx += 4 * s


def frame_at(path, t):
    out = subprocess.run(
        ["ffmpeg", "-v", "error", "-ss", f"{t:.3f}", "-i", path, "-frames:v", "1",
         "-vf", f"scale={TW}:{TH}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        capture_output=True, check=True).stdout
    if len(out) < TW * TH * 3:
        return np.zeros((TH, TW, 3), np.uint8)
    return np.frombuffer(out[:TW * TH * 3], np.uint8).reshape(TH, TW, 3).copy()


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    path = sys.argv[1]
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 24
    out = sys.argv[3] if len(sys.argv) > 3 else DEFAULT_OUT
    dur = float(subprocess.check_output(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]).strip())
    rows = (n + COLS - 1) // COLS
    W, H = COLS * TW + (COLS + 1) * PAD, rows * TH + (rows + 1) * PAD
    sheet = np.full((H, W, 3), 24, np.uint8)
    for i in range(n):
        t = (i + 0.5) * dur / n
        img = frame_at(path, t)
        m, s = divmod(t, 60)
        stamp(img, f"{int(m)}:{s:05.2f}  f{int(round(t * 60))}", 6, TH - 34)
        r, c = divmod(i, COLS)
        y, x = PAD + r * (TH + PAD), PAD + c * (TW + PAD)
        sheet[y:y + TH, x:x + TW] = img
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24",
                    "-s", f"{W}x{H}", "-i", "-", "-q:v", "3", "-frames:v", "1", "-update", "1", out],
                   input=sheet.tobytes(), check=True)
    print(f"{out}  ({n} frames, {dur:.2f}s, {COLS} cols)")


if __name__ == "__main__":
    main()
