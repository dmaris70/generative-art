#!/usr/bin/env python3
"""Real elevation for 027 — open AWS Terrain Tiles (Mapzen 'terrarium' PNG; sources SRTM, GMTED, ArcticDEM, national
surveys — https://registry.opendata.aws/terrain-tiles/). For each place: 3×3 tiles at z=12 (the data is natively ~30 m; z=13 is only
upsampled) around the point, decoded (h = R·256 + G + B/256 − 32768 m), cropped to 512² centred on it.

    python3 tools/ridge-dem-fetch.py            fetch every place in PLACES → projects/027-ridge-encounters/dem/<slug>.dem + index.json
    python3 tools/ridge-dem-fetch.py --probe    fetch CANDIDATES too, keep nothing, print how much crest each tile holds

File format (.dem): 512×512 Uint16 little-endian decimetres above the window's minimum, each row delta-coded along x (mod 65536),
then gzip. A third to a quarter of the raw size. Decode: gunzip, then running sum along each row in Uint16 arithmetic.

The crest measure (what 027 needs: it stands on ridges): ridge cells = smoothed ground standing > 25 m proud of its 360 m surroundings
and a local maximum across at least one direction; `crest_km` is their length, `walk_km` the part lying on gentle broad ground (< 30°).
"""
import gzip, io, json, math, os, sys, urllib.request
import numpy as np
from PIL import Image

PLACES = [  # chosen for ridge character, not for geography
    ('cuillin', 'Black Cuillin, Skye — gabbro arête', 57.2060, -6.2230),
    ('trecime', 'Tre Cime — bedded dolomite towers', 46.6186, 12.3026),
    ('fitzroy', 'Fitz Roy — granite spires', -49.2710, -73.0430),
    ('trollveggen', 'Trollveggen, Romsdal — gneiss wall', 62.4890, 7.7300),
    ('astraka', 'Tymfi–Astraka — limestone escarpment', 39.9700, 20.7700),
    ('liathach', 'Liathach, Torridon — sandstone terraces and pinnacles', 57.5600, -5.4700),
    ('matterhorn', 'Matterhorn — four ridges to one point', 45.9766, 7.6585),
    ('jorasses', 'Grandes Jorasses — granite north wall', 45.8690, 6.9880),
    ('badile', 'Piz Badile, Bregaglia — granite slabs', 46.2950, 9.5860),
    ('triglav', 'Triglav — limestone north face', 46.3783, 13.8367),
    ('urriellu', 'Picu Urriellu, Picos de Europa — limestone tower', 43.2017, -4.8167),
    ('olympus', 'Olympus, Mytikas–Stefani — limestone cirques', 40.0859, 22.3583),
    ('stetind', 'Stetind — granite obelisk above a fjord', 68.1650, 16.5930),
    ('trango', 'Trango Towers, Baltoro — granite towers', 35.7667, 76.1833),
    ('amadablam', 'Ama Dablam — hanging ridges', 27.8617, 86.8614),
    ('alpamayo', 'Alpamayo — fluted ice face', -8.8792, -77.6533),
    ('aoraki', 'Aoraki / Mount Cook — ice arête', -43.5950, 170.1420),
    ('drakensberg', 'Drakensberg Amphitheatre — basalt wall', -28.7500, 28.9000),
    # taken from the 2026-09-21 probe (49 candidates measured for crest):
    ('nevis', 'Ben Nevis and the Carn Mor Dearg arête', 56.8000, -4.9900),
    ('lyskamm', 'Lyskamm and Monte Rosa — corniced knife-edge', 45.9230, 7.8350),
    ('meije', 'La Meije — serrated crest', 45.0050, 6.3080),
    ('watzmann', 'Watzmann — the long traverse', 47.5550, 12.9220),
    ('brenta', 'Brenta Dolomites — ledges and towers', 46.1600, 10.9000),
    ('civetta', 'Civetta — the wall of walls', 46.3800, 12.0500),
    ('perdido', 'Monte Perdido and Ordesa — stepped limestone', 42.6750, 0.0340),
    ('cinto', 'Monte Cinto, Corsica — granite crest', 42.3800, 8.9450),
    ('taygetos', 'Taygetos — one long limestone crest', 36.9540, 22.3510),
    ('besseggen', 'Besseggen, Jotunheimen — ridge between two lakes', 61.5050, 8.7800),
    ('ushba', 'Ushba — twin-summited wall', 43.1250, 42.6600),
    ('huashan', 'Hua Shan — granite blades', 34.4800, 110.0800),
    ('kinabalu', 'Kinabalu — granite plateau and pinnacles', 6.0750, 116.5580),
    ('k2', 'K2 and the Godwin-Austen', 35.8800, 76.5100),
    ('machapuchare', 'Machapuchare — the fishtail', 28.4950, 83.9490),
    ('hotaka', 'Hotaka–Yari — the Daikiretto', 36.3200, 137.6500),
    ('tetons', 'Teton Range', 43.7411, -110.8024),
    ('robson', 'Mount Robson — Emperor Face', 53.1100, -119.1560),
    ('denali', 'Denali — Cassin and the South Buttress', 63.0700, -151.0000),
    ('huayhuash', 'Cordillera Huayhuash — Siula and Yerupajá', -10.2700, -76.9000),
    ('castillo', 'Cerro Castillo — basalt battlements', -46.0700, -72.2000),
    ('napali', 'Nā Pali, Kauaʻi — fluted green blades', 22.1600, -159.6500),
    ('simien', 'Simien escarpment', 13.2300, 38.0700),
    ('toubkal', 'Toubkal, High Atlas', 31.0600, -7.9150),
    ('darrans', 'Darran Mountains and Mitre Peak', -44.6300, 167.8600),
    ('arthurs', 'Western Arthurs, Tasmania — crest strung with tarns', -43.1300, 146.2700),
]
Z, OUT = 12, os.path.join(os.path.dirname(__file__), '..', 'projects', '027-ridge-encounters', 'dem')
URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'

def tile_xy(lat, lon, z):
    n = 2 ** z; x = (lon + 180) / 360 * n
    y = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
    return x, y

CANDIDATES = [  # probed 2026-09-21 and NOT taken (see README: too rounded at 30 m, too finely dissected, mostly sea, or a near twin of one kept)
    # dropped 2026-09-23 (v1.1): nothing kept from it in 14 batches of selection
    ('roraima', 'Roraima — tepui wall', 5.1400, -60.7600),
    # dropped 2026-09-23 (v1.1): nothing kept from it in 14 batches of selection
    ('eiger', 'Eiger–Mönch — limestone wall and ice', 46.5680, 8.0050),
    # dropped 2026-09-23 (v1.1): nothing kept from it in 14 batches of selection
    ('prokletije', 'Prokletije — the accursed mountains', 42.4400, 19.8100),
    # dropped 2026-09-21 after a ten-seed batch (2/10 clean): towers cannot be held by a 30 m heightfield and render as smeared slabs
    ('paine', 'Torres del Paine — granite towers and horns', -50.9500, -72.9800),
    ('anteallach', 'An Teallach — sandstone pinnacle crest', 57.8060, -5.2620),
    ('aonacheagach', 'Aonach Eagach, Glen Coe — notched crest', 56.6800, -5.0300),
    ('helvellyn', 'Helvellyn — Striding and Swirral Edge', 54.5270, -3.0100),
    ('cribgoch', 'Crib Goch and the Snowdon horseshoe', 53.0750, -4.0560),
    ('bernina', 'Piz Bernina — Biancograt', 46.3820, 9.9080),
    ('orlaperc', 'Orla Perć, High Tatras', 49.2220, 20.0150),
    ('malyovitsa', 'Malyovitsa, Rila — granite cirques', 42.1700, 23.3700),
    ('durmitor', 'Durmitor — limestone crests and lakes', 43.1280, 19.0300),
    ('reine', 'Moskenesøya, Lofoten — walls out of the sea', 67.9300, 13.0800),
    ('lyngen', 'Lyngen Alps', 69.6000, 20.1000),
    ('huangshan', 'Huangshan — granite pillars in cloud', 30.1300, 118.1700),
    ('tsurugi', 'Tsurugi-dake', 36.6230, 137.6170),
    ('minarets', 'The Minarets, Ritter Range', 37.6610, -119.1750),
    ('palisades', 'The Palisades, Sierra crest', 37.0940, -118.5140),
    ('cirquetowers', 'Cirque of the Towers, Wind River', 42.7700, -109.2200),
    ('bugaboos', 'Bugaboo Spires', 50.7350, -116.7800),
    ('zion', 'Zion — Angels Landing and the fins', 37.2700, -112.9500),
    ('mtkenya', 'Mount Kenya — Batian and Nelion', -0.1520, 37.3080),
    ('rwenzori', 'Rwenzori — Margherita and Alexandra', 0.3860, 29.8720),
    ('remarkables', 'The Remarkables', -45.0600, 168.8100),
    ('carstensz', 'Carstensz Pyramid — limestone fin', -4.0790, 137.1580),
]

def crest(win, mpp):
    import cv2
    a = cv2.GaussianBlur(win, (0, 0), 60 / mpp); tpi = a - cv2.GaussianBlur(win, (0, 0), 360 / mpp); k = int(max(2, round(90 / mpp)))
    mx = np.zeros_like(a, bool)
    for dy, dx in ((0, 1), (1, 0), (1, 1), (1, -1)):
        f = np.roll(a, (dy * k, dx * k), (0, 1)); g = np.roll(a, (-dy * k, -dx * k), (0, 1)); mx |= (a >= f) & (a >= g)
    ridge = mx & (tpi > 25); b = cv2.GaussianBlur(win, (0, 0), 150 / mpp); gy, gx = np.gradient(b, mpp)
    walk = ridge & (np.hypot(gx, gy) < math.tan(math.radians(30)))
    w = max(1, 2 * k * 0.6)                                         # a ridge band is about this many cells wide
    return round(ridge.sum() / w * mpp / 1000, 1), round(walk.sum() / w * mpp / 1000, 1)

def window(lat, lon):
    fx, fy = tile_xy(lat, lon, Z); tx, ty = int(fx), int(fy); mosaic = np.zeros((768, 768), np.float32)
    for j in range(3):
        for i in range(3):
            raw = urllib.request.urlopen(URL.format(z=Z, x=tx - 1 + i, y=ty - 1 + j), timeout=60).read()
            t = np.asarray(Image.open(io.BytesIO(raw)).convert('RGB')).astype(np.float32)
            mosaic[j * 256:(j + 1) * 256, i * 256:(i + 1) * 256] = t[..., 0] * 256 + t[..., 1] + t[..., 2] / 256 - 32768
    cx, cy = int((fx - tx + 1) * 256), int((fy - ty + 1) * 256); x0, y0 = min(max(cx - 256, 0), 256), min(max(cy - 256, 0), 256)
    return mosaic[y0:y0 + 512, x0:x0 + 512], 40075016.686 * math.cos(math.radians(lat)) / (2 ** Z * 256)

probe = '--probe' in sys.argv; index = []
for slug, label, lat, lon in PLACES + (CANDIDATES if probe else []):
    try: win, mpp = window(lat, lon)
    except Exception as e: print(slug, 'FAILED', e); continue
    lo = float(win.min()); ck, wk = crest(win, mpp); sea = float((win <= lo + 1).mean())
    print('%-14s mpp %4.1f  relief %4d m  crest %5.1f km  walkable %5.1f km  flat/sea %3d%%' % (slug, mpp, win.max() - lo, ck, wk, sea * 100))
    if probe: continue
    q = np.clip((win - lo) * 10, 0, 65535).astype('<u2'); d = q.copy(); d[:, 1:] = q[:, 1:] - q[:, :-1]
    open(os.path.join(OUT, slug + '.dem'), 'wb').write(gzip.compress(d.tobytes(), 9, mtime=0))
    index.append(dict(slug=slug, label=label, lat=lat, lon=lon, size=512, mpp=round(mpp, 2), min_m=round(lo), relief_m=round(float(win.max()) - lo), crest_km=ck, walk_km=wk))
if not probe:
    for f in os.listdir(OUT):
        if f.endswith('.bin'): os.remove(os.path.join(OUT, f))
    json.dump(dict(source='AWS Terrain Tiles (terrarium), z=12', format='.dem = gzip( rows delta-coded along x, Uint16 LE decimetres above min_m ), 512x512, north up', places=index), open(os.path.join(OUT, 'index.json'), 'w'), indent=1)
