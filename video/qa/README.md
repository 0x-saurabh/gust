# QA tools

Needs `ffmpeg`/`ffprobe` and a `python3` with numpy (set `PYTHON=` to choose the interpreter
for contact.sh). Outputs go to `video/out/` (gitignored). Run from anywhere.

| tool | what it does | output |
|---|---|---|
| `check.sh <mp4> [--fix]` | Asserts 1920x1080, 60 fps constant (`r_frame_rate` and `avg_frame_rate` 60/1), h264, yuv420p, duration 85–95 s, AAC audio; measures EBU R128 integrated loudness (target -14 LUFS ±1) and true peak (max -2 dBTP). `--fix` writes `<name>.norm.mp4` next to the input with two-pass `loudnorm` (linear gain when possible), video stream copied, AAC 320k 48 kHz, then re-checks it. Exit 0 only if everything passes. | stdout |
| `contact.sh <mp4> [n=24] [out.jpg]` | n evenly spaced frames (at (i+0.5)·dur/n), 6 columns, each stamped `m:ss.ss fNNNN` (this ffmpeg has no drawtext, so contact.py draws a bitmap font). | `out/contact-sheet.jpg` |
| `pops.py <mp4> [--ratio 3] [--csv f]` | Decodes at 192x108 gray, per-frame mean abs diff. **pop**: frame k differs from both neighbours by > 3x their own diffs and > 3x the diff across it (a one-frame flash or stray frame). **cut**: diff > max(12, 3x the local ±0.5 s median), so every hard cut can be checked. Exit 1 if any pop. | stdout + `out/qa/pops.csv` |
| `stills.sh <mp4> <t1> <t2> …` | Frame-accurate full-res PNGs at the given seconds. | `out/qa/<name>-<t>s.png` |

Typical pass on a render:
```
video/qa/check.sh video/out/kyte-demo-90s.mp4          # spec + loudness
video/qa/check.sh video/out/kyte-demo-90s.mp4 --fix    # -> kyte-demo-90s.norm.mp4
video/qa/pops.py  video/out/kyte-demo-90s.mp4          # then stills.sh at any flagged time
video/qa/contact.sh video/out/kyte-demo-90s.mp4 36
video/qa/stills.sh video/out/kyte-demo-90s.mp4 2.8 31.5 88
```
Frame k of a 60 fps file is at k/60 s, so `stills.sh f.mp4 50.0` gives frame 3000.

Notes
- `loudnorm` silently drops to dynamic mode when `measured_LRA` is 0 (pure tones); check.sh clamps it to 0.1. If the fix still reports `dynamic`, the mix's peaks are too high for a linear gain to reach -14 LUFS under -2 dBTP; pull the hottest cues down in the mix instead.
- Tested on a synthetic 90 s testsrc2 file with a white frame injected at frame 3000 and an inverted-colour cut at 60 s: pops.py reported exactly `POP frame 3000 0:50.000` and `CUT frame 3600 1:00.000`.

## SFX

`video/sfx/make_sfx.py` regenerates every cue in `remotion/public/sfx/` (48 kHz 24-bit, -1 dBTP each).
`--qa` also writes waveform + spectrogram PNGs to `out/qa/sfx-*.png`. Needs numpy + scipy (+ matplotlib for `--qa`).
