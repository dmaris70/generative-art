#!/usr/bin/env python3
"""Measure the source diptych for 027's targets.
    python3 tools/ridge-measure.py                      # from the tonal readings kept in 024/025 data.js (grain removed, half-res)
    python3 tools/ridge-measure.py left.webp right.webp # from the source images themselves, if at hand
Writes projects/027-ridge-encounters/review/source-measurements.json: tone percentiles and black/white shares (what the
curation harness compares against), how local contrast falls as the picture lightens (aerial perspective), and the
movement smear — direction and length — from the anisotropy of the autocorrelation in a grid of patches."""
import sys, os, json, base64
import numpy as np, cv2
from PIL import Image
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')

def from_image(path):
    g = np.asarray(Image.open(path).convert('L')).astype(np.float32)
    m = np.abs(g - g[5, 5]) > 6; ys = np.where(m.mean(1) > .5)[0]; xs = np.where(m.mean(0) > .5)[0]
    p = g[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    return cv2.resize(cv2.fastNlMeansDenoising(p.astype(np.uint8), None, h=10), None, fx=.5, fy=.5, interpolation=cv2.INTER_AREA).astype(np.float32)
def from_data(slug):
    s = open(os.path.join(ROOT, 'projects', slug, 'data.js')).read(); d = json.loads(s[s.index('{'):s.rindex('}') + 1])
    return np.frombuffer(base64.b64decode(d['tone']), np.uint8).reshape(d['th'], d['tw']).astype(np.float32)

def tones(p):
    q = lambda v: int(np.percentile(p, v))
    return dict(p02=q(2), p10=q(10), p50=q(50), p90=q(90), p98=q(98), black=round(float((p < 70).mean()), 3), white=round(float((p > 190).mean()), 3))
def smear(d, size=64):
    out = []
    for y in range(0, d.shape[0] - size + 1, size):
        for x in range(0, d.shape[1] - size + 1, size):
            a = d[y:y + size, x:x + size]; a = a - cv2.GaussianBlur(a, (0, 0), 8)
            if a.std() < 3: continue                                  # cloud: nothing to measure
            f = np.fft.fft2(a * np.outer(np.hanning(size), np.hanning(size))); ac = np.fft.fftshift(np.real(np.fft.ifft2(f * np.conj(f)))); ac /= ac.max()
            yy, xx = np.mgrid[-size // 2:size // 2, -size // 2:size // 2]; k = (ac > 0.5) & (np.hypot(xx, yy) < 16)
            if k.sum() < 6: continue
            w, v = np.linalg.eigh(np.cov(np.vstack([xx[k], yy[k]])))
            out.append(dict(x=int(x + size / 2) * 2, y=int(y + size / 2) * 2, angle=round(float(np.degrees(np.arctan2(v[1, 1], v[0, 1]))) % 180, 1),
                            length_px=round(float(4 * np.sqrt(w[1])), 1), aniso=round(float(np.sqrt(w[1] / max(w[0], 1e-6))), 2), contrast=round(float(a.std()), 1)))
    return out
def falloff(d):
    mean = cv2.GaussianBlur(d, (0, 0), 10); sd = np.sqrt(cv2.GaussianBlur((d - mean) ** 2, (0, 0), 10)); rows = []
    for lo in range(60, 200, 20):
        k = (mean >= lo) & (mean < lo + 20)
        if k.sum() > 1000: rows.append(dict(tone=lo + 10, local_contrast=round(float(sd[k].mean()), 1)))
    return rows

L, R = (from_image(sys.argv[1]), from_image(sys.argv[2])) if len(sys.argv) > 2 else (from_data('024-ridge-study-left'), from_data('025-ridge-study-right'))
both = np.hstack([L, R]); sm = smear(R); strong = [s for s in sm if s['aniso'] > 1.5]
res = dict(basis='source images' if len(sys.argv) > 2 else '024/025 tonal readings (grain removed)', pair=tones(both), left=tones(L), right=tones(R), contrast_by_tone=falloff(both),
           smear=dict(note='right sheet; x,y in full-res picture pixels; angle 0 = horizontal, 90 = vertical', median_angle=round(float(np.median([s['angle'] for s in strong])), 1) if strong else None,
                      median_length_px=round(float(np.median([s['length_px'] for s in strong])), 1) if strong else None, strongest=sorted(strong, key=lambda s: -s['aniso'])[:6], patches=sm))
out = os.path.join(ROOT, 'projects', '027-ridge-encounters', 'review', 'source-measurements.json'); json.dump(res, open(out, 'w'), indent=1)
print(json.dumps({k: res[k] for k in ('pair', 'left', 'right', 'contrast_by_tone')})); print('smear', res['smear']['median_angle'], 'deg', res['smear']['median_length_px'], 'px', res['smear']['strongest'][:3])
