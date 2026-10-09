# Traces a supplied photograph (pressed wildflowers exposed onto paper, in the
# anthotype/cyanotype family) into data.js: twelve brightness-threshold isolines,
# each blurred more heavily than the last before thresholding, so a contour's own
# softness records how faint that region was in the source print. The source image
# is not shipped — only this derived polygon data is.
# usage: python3 trace.py src.jpg
import sys, cv2, numpy as np, json, os

IMG = sys.argv[1] if len(sys.argv) > 1 else "src.jpg"
OUT = "data.js"
PREVIEW = "preview.png"

REF_W, REF_H = 900, 1350

img = cv2.imread(IMG, cv2.IMREAD_COLOR)
h, w = img.shape[:2]
gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)

sx, sy = REF_W / w, REF_H / h

# (gray threshold, blur sigma). Core levels stay near-sharp; each lighter/softer
# level gets progressively more Gaussian blur before thresholding, so the isoline
# itself is soft the way an out-of-contact specimen's shadow is soft on the paper
# — the "lift" of the photogram is baked into the trace geometry, not faked after.
N_LEVELS = 12
GRAY_LO, GRAY_HI = 20, 210
SIGMA_LO, SIGMA_HI = 0.7, 15.0
LEVELS = []
for i in range(N_LEVELS):
    t = i / (N_LEVELS - 1)
    gray_lv = round(GRAY_LO + (GRAY_HI - GRAY_LO) * t)
    sigma = SIGMA_LO + (SIGMA_HI - SIGMA_LO) * (t ** 1.6)
    LEVELS.append((gray_lv, sigma))

levels_out = []
kernel = np.ones((3, 3), np.uint8)

for lv, sigma in LEVELS:
    blurred = cv2.GaussianBlur(gray, (0, 0), sigma) if sigma > 0 else gray
    mask = (blurred <= lv).astype(np.uint8) * 255
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=1)
    min_area = 9 + sigma * 2.5
    contours, _ = cv2.findContours(mask, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)

    polys = []
    for c in contours:
        area = cv2.contourArea(c)
        if area < min_area:
            continue
        peri = cv2.arcLength(c, True)
        eps = max(0.9, min(1.8, 0.0012 * peri))
        approx = cv2.approxPolyDP(c, eps, True)
        if len(approx) < 3:
            continue
        pts = [[round(float(p[0][0]) * sx, 2), round(float(p[0][1]) * sy, 2)] for p in approx]
        polys.append(pts)

    total_pts = sum(len(p) for p in polys)
    print(f"level {lv:3d} sigma {sigma:4.1f}: {len(polys):4d} polygons, {total_pts:5d} pts")
    levels_out.append({"gray": lv, "polygons": polys})

corner = np.concatenate([
    img[0:40, 0:40].reshape(-1, 3),
    img[0:40, w-40:w].reshape(-1, 3),
]).mean(axis=0)
paper_rgb = [round(float(corner[2])), round(float(corner[1])), round(float(corner[0]))]

core_mask = gray <= 20
core = img[core_mask].mean(axis=0) if core_mask.sum() else np.array([20, 20, 20])
ink_rgb = [round(float(core[2])), round(float(core[1])), round(float(core[0]))]

print("paper_rgb", paper_rgb, "ink_rgb", ink_rgb)

data = {"refW": REF_W, "refH": REF_H, "paper": paper_rgb, "ink": ink_rgb, "levels": levels_out}

with open(OUT, "w") as f:
    f.write("window.TRACE_DATA = ")
    f.write(json.dumps(data, separators=(",", ":")))
    f.write(";\n")
print("wrote", OUT, os.path.getsize(OUT), "bytes")

# quick visual sanity check: dark(core) drawn last/on top of light(halo)
canvas = np.zeros((REF_H, REF_W, 3), np.uint8)
canvas[:] = paper_rgb[::-1]
for lvl in reversed(levels_out):
    g = lvl["gray"]
    t = g / 206.0
    overlay = canvas.copy()
    for poly in lvl["polygons"]:
        pts = np.array(poly, np.int32).reshape(-1, 1, 2)
        cv2.fillPoly(overlay, [pts], ink_rgb[::-1])
    alpha = (1.0 - t) * 0.8 + 0.12
    canvas = cv2.addWeighted(overlay, alpha, canvas, 1 - alpha, 0)
cv2.imwrite(PREVIEW, canvas)
print("preview written")
