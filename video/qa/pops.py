#!/usr/bin/env python3
"""pops.py <mp4> [--csv out.csv] [--ratio 3] [--scale 192x108]

Finds single-frame pops and hard cuts. Decodes the video at low resolution
(grayscale) and computes, per frame k:
  d[k]    mean |f[k] - f[k-1]|        (frame-to-frame difference, 0-255 scale)
  skip[k] mean |f[k+1] - f[k-1]|      (difference across frame k)

  pop  : frame k is unlike both neighbours while the neighbours agree with each
         other, i.e. d[k] and d[k+1] are both > ratio x max(d[k-1], d[k+2])
         and > ratio x skip[k]. That is a one-frame flash, glitch or stray frame.
  cut  : d[k] > max(abs_min, ratio x the local median of d over +-0.5 s) and
         frame k is not a pop edge. Lists every hard cut so each can be checked
         as intended.
Prints timestamps and writes video/out/qa/pops.csv. Exit 1 if any pop is found.
Needs ffmpeg/ffprobe and numpy.
"""
import argparse
import csv
import os
import subprocess
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_CSV = os.path.normpath(os.path.join(HERE, "..", "out", "qa", "pops.csv"))


def fps_of(path):
    r = subprocess.check_output(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                                 "stream=r_frame_rate", "-of", "csv=p=0", path]).decode().strip().split()[0].strip(",")
    a, b = r.split("/")
    return float(a) / float(b)


def tc(f, fps):
    t = f / fps
    m, s = divmod(t, 60)
    return f"{int(m)}:{s:06.3f}"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("mp4")
    ap.add_argument("--csv", default=DEFAULT_CSV)
    ap.add_argument("--ratio", type=float, default=3.0)
    ap.add_argument("--scale", default="192x108")
    ap.add_argument("--floor", type=float, default=1.0, help="ignore diffs below this (0-255 scale)")
    ap.add_argument("--cut-min", type=float, default=12.0, help="absolute minimum diff for a hard cut")
    a = ap.parse_args()

    w, h = map(int, a.scale.split("x"))
    fps = fps_of(a.mp4)
    proc = subprocess.Popen(["ffmpeg", "-v", "error", "-i", a.mp4, "-an", "-vf", f"scale={w}:{h}:flags=area",
                             "-f", "rawvideo", "-pix_fmt", "gray", "-"], stdout=subprocess.PIPE)
    size = w * h
    d, skip = [0.0], [0.0]
    prev2 = prev = None
    while True:
        buf = proc.stdout.read(size)
        if len(buf) < size:
            break
        f = np.frombuffer(buf, np.uint8).astype(np.int16)
        if prev is not None:
            d.append(float(np.mean(np.abs(f - prev))))
        if prev2 is not None:
            skip.append(float(np.mean(np.abs(f - prev2))))  # skip[k-1] = |f[k] - f[k-2]|
        prev2, prev = prev, f
    proc.wait()
    n = len(d)
    skip.append(0.0)
    d = np.array(d)
    skip = np.array(skip[:n])
    if n < 4:
        sys.exit("too few frames")

    r, floor = a.ratio, a.floor
    pops = []
    for k in range(1, n - 1):
        before = d[k - 1] if k >= 2 else 0.0
        after = d[k + 2] if k + 2 < n else 0.0
        ref = max(before, after, skip[k], floor)
        if d[k] > r * ref and d[k + 1] > r * ref:
            pops.append(k)
    pop_edges = set(pops) | {k + 1 for k in pops}

    half = int(round(fps / 2))
    cuts = []
    for k in range(1, n):
        if k in pop_edges:
            continue
        lo, hi = max(1, k - half), min(n, k + half + 1)
        local = np.median(np.concatenate([d[lo:k], d[k + 1:hi]])) if hi - lo > 1 else 0.0
        if d[k] > max(a.cut_min, r * max(local, floor)):
            cuts.append(k)

    os.makedirs(os.path.dirname(os.path.abspath(a.csv)), exist_ok=True)
    with open(a.csv, "w", newline="") as fh:
        wr = csv.writer(fh)
        wr.writerow(["kind", "frame", "time_s", "timecode", "diff", "prev_diff", "next_diff", "skip_diff"])
        for kind, ks in (("pop", pops), ("cut", cuts)):
            for k in ks:
                wr.writerow([kind, k, f"{k / fps:.3f}", tc(k, fps), f"{d[k]:.2f}",
                             f"{d[k - 1]:.2f}", f"{d[k + 1]:.2f}" if k + 1 < n else "", f"{skip[k]:.2f}"])

    print(f"{a.mp4}: {n} frames @ {fps:g} fps, median diff {np.median(d[1:]):.2f}")
    print(f"single-frame pops: {len(pops)}")
    for k in pops:
        print(f"  POP  frame {k:6d}  {tc(k, fps)}  diff in {d[k]:.1f} / out {d[k + 1]:.1f}, "
              f"neighbours {d[k - 1]:.1f}/{d[k + 2] if k + 2 < n else 0:.1f}, across {skip[k]:.1f}")
    print(f"hard cuts: {len(cuts)}")
    for k in cuts:
        print(f"  CUT  frame {k:6d}  {tc(k, fps)}  diff {d[k]:.1f}")
    print(f"wrote {a.csv}")
    return 1 if pops else 0


if __name__ == "__main__":
    sys.exit(main())
