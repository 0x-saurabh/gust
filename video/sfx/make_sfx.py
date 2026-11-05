#!/usr/bin/env python3
"""Synthesize the Kyte film's original UI sound effects.

Everything here is generated from scratch (sines, filtered noise, a synthetic
reverb), so the cues are reproducible and license-free. Output: 48 kHz 24-bit
WAV, each normalized to -1 dBFS true peak (4x oversampled), with short raised-cosine fades so no cue
starts or ends with a click, and a 20 Hz high-pass so none carries DC.

Usage:
    python make_sfx.py                 # writes ../remotion/public/sfx/*.wav
    python make_sfx.py --qa            # also writes spectrograms to ../out/qa/sfx-*.png
    python make_sfx.py --out DIR

Needs numpy + scipy (matplotlib only for --qa).
"""
import argparse
import os
import sys
import wave

import numpy as np
from scipy import signal

SR = 48000
PEAK_DBFS = -1.0
HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_OUT = os.path.normpath(os.path.join(HERE, "..", "remotion", "public", "sfx"))
QA_DIR = os.path.normpath(os.path.join(HERE, "..", "out", "qa"))


# ---------------------------------------------------------------- helpers
def t_axis(dur):
    return np.arange(int(round(dur * SR))) / SR


def rng(seed):
    return np.random.default_rng(seed)


def bandpass(x, lo, hi, order=4):
    sos = signal.butter(order, [lo, hi], btype="band", fs=SR, output="sos")
    return signal.sosfilt(sos, x, axis=-1)


def highpass(x, f, order=4):
    sos = signal.butter(order, f, btype="high", fs=SR, output="sos")
    return signal.sosfilt(sos, x, axis=-1)


def lowpass(x, f, order=4):
    sos = signal.butter(order, f, btype="low", fs=SR, output="sos")
    return signal.sosfilt(sos, x, axis=-1)


def adsr_exp(t, attack, tau, start=0.0):
    """Raised-cosine attack then exponential decay, starting at `start` s."""
    tt = t - start
    env = np.zeros_like(t)
    a = (tt >= 0) & (tt < attack)
    env[a] = 0.5 - 0.5 * np.cos(np.pi * tt[a] / attack)
    d = tt >= attack
    env[d] = np.exp(-(tt[d] - attack) / tau)
    return env


def cents(c):
    return 2.0 ** (c / 1200.0)


def fades(x, fin=0.0015, fout=0.012):
    """Raised-cosine fade-in/out on the last axis."""
    n = x.shape[-1]
    ni, no = max(1, int(fin * SR)), max(1, int(fout * SR))
    w = np.ones(n)
    w[:ni] = 0.5 - 0.5 * np.cos(np.pi * np.arange(ni) / ni)
    w[n - no:] = 0.5 + 0.5 * np.cos(np.pi * np.arange(no) / no)
    return x * w


def pan(mono, p):
    """Equal-power pan. p in [-1, 1], scalar or per-sample array."""
    th = (np.asarray(p) + 1) * np.pi / 4
    return np.stack([mono * np.cos(th), mono * np.sin(th)])


def reverb_ir(dur, tau, seed, lp=7000, hp=200):
    """Decorrelated stereo exponential-noise IR: a soft synthetic room."""
    t = t_axis(dur)
    r = rng(seed)
    ir = r.standard_normal((2, t.size)) * np.exp(-t / tau)
    ir = lowpass(highpass(ir, hp, 2), lp, 2)
    # darker over time: blend in a lower-passed copy as it decays
    dark = lowpass(ir, lp / 3, 2)
    mix = np.clip(t / dur, 0, 1)
    ir = ir * (1 - mix) + dark * mix
    ir[:, : int(0.004 * SR)] *= np.linspace(0, 1, int(0.004 * SR))  # soft onset
    return ir / np.sqrt(np.sum(ir ** 2, axis=-1, keepdims=True))


def add_reverb(st, wet, ir_dur, tau, seed, total=None):
    """st: (2, n). Returns dry + wet*reverb, length `total` s (default n + ir)."""
    ir = reverb_ir(ir_dur, tau, seed)
    n = st.shape[-1]
    out_n = int(total * SR) if total else n + ir.shape[-1]
    out = np.zeros((2, out_n))
    out[:, :min(n, out_n)] += st[:, :out_n]
    for c in range(2):
        w = signal.fftconvolve(st[c], ir[c])[:out_n]
        out[c, : w.size] += wet * w
    return out


def finalize(x):
    """DC-block, fade, normalize to PEAK_DBFS. Returns float array."""
    x = np.atleast_2d(x).astype(np.float64)
    x = highpass(x, 20, 2)
    x = fades(x)
    # normalize on the 4x-oversampled (true) peak so inter-sample peaks stay <= -1 dBFS
    peak = max(np.max(np.abs(x)), np.max(np.abs(signal.resample_poly(x, 4, 1, axis=-1))))
    x = x * (10 ** (PEAK_DBFS / 20) / peak)
    return x if x.shape[0] > 1 else x[0]


def write_wav24(path, x):
    x = np.atleast_2d(x)
    ch, n = x.shape
    q = np.clip(np.round(x.T * (2 ** 23 - 1)), -(2 ** 23), 2 ** 23 - 1).astype("<i4")
    b = q.reshape(-1).view(np.uint8).reshape(-1, 4)[:, :3].tobytes()
    with wave.open(path, "wb") as w:
        w.setnchannels(ch)
        w.setsampwidth(3)
        w.setframerate(SR)
        w.writeframes(b)


# ---------------------------------------------------------------- cues
def click():
    """Soft UI tap: filtered transient + small tonal body + faint low knock."""
    t = t_axis(0.060)
    r = rng(11)
    tr = bandpass(r.standard_normal(t.size), 1800, 6500, 2) * adsr_exp(t, 0.0006, 0.0028)
    f = 1500 - 300 * (1 - np.exp(-t / 0.01))  # body pitch settles 1.5k -> 1.2k
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * adsr_exp(t, 0.0012, 0.012)
    knock = np.sin(2 * np.pi * 190 * t) * adsr_exp(t, 0.002, 0.010)
    x = 0.55 * tr + 0.35 * body + 0.45 * knock
    x = lowpass(x, 9000, 2)
    return finalize(x)


def key(seed=21, body_f=2300, band=(2800, 9000), tau=0.0022):
    """Very light keystroke tick."""
    t = t_axis(0.035)
    r = rng(seed)
    tr = bandpass(r.standard_normal(t.size), *band, 2) * adsr_exp(t, 0.0004, tau)
    body = np.sin(2 * np.pi * body_f * t + r.uniform(0, 1)) * adsr_exp(t, 0.0008, 0.005)
    thock = np.sin(2 * np.pi * 320 * t) * adsr_exp(t, 0.001, 0.004)
    return finalize(0.7 * tr + 0.22 * body + 0.18 * thock)


def hover():
    """Barely-there airy tick."""
    t = t_axis(0.050)
    r = rng(31)
    air = bandpass(r.standard_normal(t.size), 5000, 13000, 2) * adsr_exp(t, 0.003, 0.009)
    tone = np.sin(2 * np.pi * 4200 * t) * adsr_exp(t, 0.002, 0.006)
    return finalize(0.8 * air + 0.12 * tone)


def svf_bandpass(x, fc, q):
    """Time-varying state-variable band-pass; fc per sample."""
    y = np.zeros_like(x)
    low = band = 0.0
    damp = 1.0 / q
    g = 2 * np.sin(np.pi * np.clip(fc, 20, SR / 6) / SR)
    for i in range(x.size):
        high = x[i] - low - damp * band
        band += g[i] * high
        low += g[i] * band
        y[i] = band
    return y


def whoosh():
    """Airy swish, 0.45 s: band sweep up then settle, L->R pan sweep."""
    dur = 0.45
    t = t_axis(dur)
    r = rng(41)
    u = t / dur
    # asymmetric bell envelope peaking at ~55%
    env = np.sin(np.pi * np.clip(u, 0, 1) ** 0.85) ** 2.2
    fc = 500 * (9.0 ** np.sin(np.pi * u * 0.9))  # 500 Hz -> ~4.5 kHz -> back down
    # two cascaded SVF stages -> 12 dB/oct skirts, so the sweep reads clearly
    n1 = svf_bandpass(svf_bandpass(r.standard_normal(t.size), fc, 1.8), fc, 1.8)
    n2 = svf_bandpass(svf_bandpass(r.standard_normal(t.size), fc * 1.9, 2.5), fc * 1.9, 2.5)
    n1, n2 = n1 / np.std(n1), n2 / np.std(n2)
    body = lowpass(r.standard_normal(t.size), 700, 2)
    body /= np.std(body)
    mono = lowpass((n1 + 0.4 * n2 + 0.3 * body) * env, 11000, 2)
    st = pan(mono, -0.65 + 1.3 * (u ** 1.2))
    st = add_reverb(st, 0.18, 0.4, 0.09, 42, total=dur)
    return finalize(st)


def bell(t, f, start, amp, tau, detune_c=0.0):
    """Soft bell: fundamental + gentle harmonics, upper partials decay faster."""
    partials = [(1.0, 1.0, 1.0), (2.0, 0.22, 0.45), (3.0, 0.06, 0.3), (4.2, 0.025, 0.2)]
    x = np.zeros_like(t)
    ff = f * cents(detune_c)
    for mult, a, tm in partials:
        x += a * np.sin(2 * np.pi * ff * mult * (t - start)) * adsr_exp(t, 0.003, tau * tm, start)
    return amp * x


def confirm():
    """Success chime: E6 -> B6, soft bell, ~0.9 s."""
    dur = 0.9
    t = t_axis(dur)
    E6, B6 = 1318.51, 1975.53
    L = bell(t, E6, 0.0, 0.9, 0.30, -2) + bell(t, B6, 0.11, 0.8, 0.36, -2)
    R = bell(t, E6, 0.0, 0.9, 0.30, +2) + bell(t, B6, 0.11, 0.8, 0.36, +2)
    # a whisper of warmth an octave below the first note
    warm = 0.18 * np.sin(2 * np.pi * E6 / 2 * t) * adsr_exp(t, 0.006, 0.18)
    st = np.stack([L + warm, R + warm])
    st = lowpass(st, 9000, 2)
    st = add_reverb(st, 0.35, 0.9, 0.22, 52, total=dur)
    return finalize(st)


def shimmer():
    """NFT reveal: rising sparkle of detuned partials over noise air, ~1.2 s."""
    dur = 1.2
    t = t_axis(dur)
    r = rng(61)
    # E major pentatonic, rising arpeggio across ~0.65 s
    base = [659.25, 739.99, 830.61, 987.77, 1108.73]
    notes = [b * o for o in (2, 4) for b in base] + [659.25 * 8]
    st = np.zeros((2, t.size))
    for i, f in enumerate(notes):
        start = 0.02 + 0.058 * i
        amp = 0.55 * (1.0 - 0.035 * i)
        glide = 1 + 0.004 * (1 - np.exp(-np.clip(t - start, 0, None) / 0.05))
        for dc in (-4, 4):
            ph = 2 * np.pi * np.cumsum(f * cents(dc) * glide) / SR
            tone = np.sin(ph + r.uniform(0, 2 * np.pi)) * adsr_exp(t, 0.004, 0.22, start)
            st += pan(amp * 0.5 * tone, np.clip(r.uniform(-0.7, 0.7) + dc / 20, -1, 1))
    # noise air: rising high band, swelling then fading
    u = t / dur
    air_env = np.sin(np.pi * np.clip(u / 0.85, 0, 1)) ** 2
    air = highpass(r.standard_normal((2, t.size)), 7000, 4) * air_env * 0.09
    st = lowpass(st + air, 14000, 2)
    st = add_reverb(st, 0.45, 1.0, 0.3, 62, total=dur)
    return finalize(st)


def pad(t, freqs, cutoff, detune=(-7, 0, 7), nharm=14, seed=0):
    """Additive saw-ish pad; per-sample low-pass cutoff shapes harmonics."""
    r = rng(seed)
    st = np.zeros((2, t.size))
    for f in freqs:
        for k, dc in enumerate(detune):
            p = np.clip((k - (len(detune) - 1) / 2) * 0.6, -1, 1)
            ph0 = r.uniform(0, 2 * np.pi, nharm)
            mono = np.zeros_like(t)
            for n in range(1, nharm + 1):
                fn = f * n * cents(dc)
                if fn > 12000:
                    break
                gain = (1.0 / n) / np.sqrt(1 + (fn / cutoff) ** 4)  # 2-pole style roll-off
                mono += gain * np.sin(2 * np.pi * fn * t + ph0[n - 1])
            st += pan(mono, p)
    return st / (len(freqs) * len(detune))


def soft_hit(t, start, low=62.0, bell_f=None, amp=1.0, seed=0):
    """Rounded impact: pitched low thump + short filtered noise + optional bell."""
    r = rng(seed)
    tt = np.clip(t - start, 0, None)
    f = low + (low * 1.8) * np.exp(-tt / 0.035)
    thump = np.sin(2 * np.pi * np.cumsum(f) / SR) * adsr_exp(t, 0.004, 0.32, start)
    nz = lowpass(r.standard_normal(t.size), 2500, 2) * adsr_exp(t, 0.002, 0.03, start)
    mono = 0.9 * thump + 0.25 * nz
    st = pan(mono, 0.0)
    if bell_f:
        st += np.stack([bell(t, bell_f, start, 0.22, 0.6, -3), bell(t, bell_f, start, 0.22, 0.6, 3)])
    return amp * st


def swell():
    """Welcome: warm pad + sub rising into a soft hit at 2.8 s, then a tail. 3.5 s."""
    dur, hit = 3.5, 2.8
    t = t_axis(dur)
    r = rng(71)
    # rise: slow ease-in to the hit, then quick fall to a low tail
    u = np.clip(t / hit, 0, 1)
    rise = u ** 2.4
    after = np.exp(-np.clip(t - hit, 0, None) / 0.35)
    env = np.where(t < hit, rise, after)
    cutoff = 250 + 2600 * u ** 2  # filter opens with the swell
    chord = [82.41, 123.47, 164.81, 207.65, 246.94]  # E2 B2 E3 G#3 B3
    pd = pad(t, chord, np.where(t < hit, cutoff, 2850 * after + 250), seed=72)
    sub = np.sin(2 * np.pi * 41.2 * t) * np.clip(t / hit, 0, 1) ** 2 * np.where(t < hit, 1, after)
    # airy riser into the hit
    riser = highpass(r.standard_normal((2, t.size)), 3000, 2) * np.where(t < hit, u ** 4, 0) * 0.05
    # avoid a hard edge where the riser stops
    riser = lowpass(riser, 10000, 2) * np.clip((hit + 0.03 - t) / 0.09, 0, 1)
    st = 1.0 * pd * env + 0.35 * np.stack([sub, sub]) + riser
    st += soft_hit(t, hit, low=58.0, bell_f=659.25, amp=0.85, seed=73)
    st = add_reverb(st, 0.3, 1.4, 0.35, 74, total=dur)
    return finalize(st)


def outro():
    """Final logo: soft resolving hit + warm chord bloom + tail, 2.5 s."""
    dur = 2.5
    t = t_axis(dur)
    start = 0.02
    chord = [164.81, 246.94, 329.63, 415.30, 493.88]  # E3 B3 E4 G#4 B4
    env = adsr_exp(t, 0.03, 0.75, start)
    pd = pad(t, chord, 1800, nharm=10, seed=81) * env
    st = 1.1 * pd + soft_hit(t, start, low=55.0, bell_f=987.77, amp=0.8, seed=82)
    st = add_reverb(st, 0.4, 1.8, 0.45, 83, total=dur)
    return finalize(st)


def tick():
    """Tiny tick for counters/chips appearing."""
    t = t_axis(0.028)
    r = rng(91)
    tone = np.sin(2 * np.pi * 3100 * t) * adsr_exp(t, 0.0006, 0.0045)
    nz = bandpass(r.standard_normal(t.size), 4000, 11000, 2) * adsr_exp(t, 0.0003, 0.0015)
    return finalize(0.6 * tone + 0.4 * nz)


CUES = {
    "click": click,
    "key": lambda: key(21, 2300, (2800, 9000), 0.0022),
    "key2": lambda: key(22, 2450, (3200, 9500), 0.0019),
    "key3": lambda: key(23, 2150, (2600, 8500), 0.0025),
    "hover": hover,
    "whoosh": whoosh,
    "confirm": confirm,
    "shimmer": shimmer,
    "swell": swell,
    "outro": outro,
    "tick": tick,
}


def qa_plot(name, x, out_dir):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    mono = x.mean(axis=0) if x.ndim == 2 else x
    t = np.arange(mono.size) / SR
    fig, (a1, a2) = plt.subplots(2, 1, figsize=(9, 5), sharex=True,
                                 gridspec_kw={"height_ratios": [1, 2.2]})
    if x.ndim == 2:
        a1.plot(t, x[0], lw=0.5, label="L")
        a1.plot(t, x[1], lw=0.5, alpha=0.7, label="R")
        a1.legend(loc="upper right", fontsize=7)
    else:
        a1.plot(t, x, lw=0.5)
    a1.set_ylim(-1, 1)
    a1.set_title(f"{name}.wav  {mono.size / SR * 1000:.0f} ms  peak {20*np.log10(np.max(np.abs(x))):.2f} dBFS")
    nper = 256 if mono.size < SR * 0.2 else 1024
    f, tt, S = signal.spectrogram(mono, SR, nperseg=nper, noverlap=nper * 7 // 8)
    D = 10 * np.log10(S + 1e-16)
    a2.pcolormesh(tt, f / 1000, D, shading="auto", vmin=D.max() - 80, vmax=D.max(), cmap="magma")
    a2.set_ylabel("kHz")
    a2.set_xlabel("s")
    a2.set_ylim(0, 20)
    fig.tight_layout()
    fig.savefig(os.path.join(out_dir, f"sfx-{name}.png"), dpi=90)
    plt.close(fig)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--qa", action="store_true", help="write spectrograms to video/out/qa")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    if args.qa:
        os.makedirs(QA_DIR, exist_ok=True)
    print(f"{'cue':8} {'ch':>2} {'ms':>6} {'peak dBFS':>9} {'dc':>9} {'first':>9} {'last':>9}")
    for name, fn in CUES.items():
        x = fn()
        path = os.path.join(args.out, f"{name}.wav")
        write_wav24(path, x)
        xx = np.atleast_2d(x)
        print(f"{name:8} {xx.shape[0]:>2} {xx.shape[1] / SR * 1000:6.0f} "
              f"{20 * np.log10(np.max(np.abs(xx))):9.2f} {np.max(np.abs(xx.mean(axis=1))):9.1e} "
              f"{np.max(np.abs(xx[:, 0])):9.1e} {np.max(np.abs(xx[:, -1])):9.1e}")
        if args.qa:
            qa_plot(name, x, QA_DIR)
    print(f"wrote {len(CUES)} cues to {args.out}")


if __name__ == "__main__":
    sys.exit(main())
