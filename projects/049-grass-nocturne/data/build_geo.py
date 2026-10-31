#!/usr/bin/env python3
"""Build the geography the journey reads: geo.bin.gz and geo.json, from public-domain sources.

    python3 build_geo.py <source-folder> <output-folder>

The source folder holds:
  ne_50m_admin_0_countries.geojson, ne_50m_geography_marine_polys.geojson,
  ne_10m_populated_places_simple.geojson   Natural Earth, public domain (naturalearthdata.com)
  etopo.txt   ETOPO 2022 surface elevation, NOAA, public domain, sampled every 0.5° through OPeNDAP:
    https://www.ngdc.noaa.gov/thredds/dodsC/global/ETOPO2022/60s/60s_surface_elev_netcdf/
      ETOPO_2022_v1_60s_N90W180_surface.nc.ascii?z[15:30:10799][15:30:21599]
  koppen_0p5.tif (optional)   Köppen-Geiger V3, 1991–2020, 0.5°, Beck et al. (2023), CC BY 4.0
    — when present, its classes are added as a fifth layer.

geo.bin.gz is 1440 × 720 cells of 0.25°, row 0 at 90°N, column 0 at 180°W, as layers of one byte:
  0 country (0 = sea, else index into geo.json countries)   1 sea (index into geo.json seas, every cell)
  2 elevation, land only: sqrt(m / 6000) × 255               3 distance to the coast in 10 km (max 2550 km)
  4 Köppen class 1…30, or 0 (only if the source was given)
"""
import gzip, heapq, json, math, os, re, sys
import numpy as np
from PIL import Image, ImageDraw

SRC, OUT = sys.argv[1], sys.argv[2]
W, H, R = 1440, 720, 4          # 0.25°

def px(lon, lat):
    return ((lon + 180) * R, (90 - lat) * R)

def polys(geom):
    if geom['type'] == 'Polygon': return [geom['coordinates']]
    if geom['type'] == 'MultiPolygon': return geom['coordinates']
    return []

def ring_area(r):
    a = 0
    for (x0, y0), (x1, y1) in zip(r, r[1:] + r[:1]): a += x0 * y1 - x1 * y0
    return abs(a) / 2

def rasterize(features, name_of):
    """largest first, so that smaller shapes inside larger ones win; holes are ignored"""
    rings = []
    for i, f in enumerate(features, 1):
        for p in polys(f['geometry']):
            rings.append((ring_area(p[0]), i, p[0]))
    rings.sort(key=lambda r: -r[0])
    img = Image.new('L', (W, H), 0); d = ImageDraw.Draw(img)
    for _, i, ring in rings:
        pts = [px(x, y) for x, y in ring]
        if len(pts) > 2: d.polygon(pts, fill=i)
    return np.array(img, dtype=np.uint8), [name_of(f) for f in features]

def ascii_name(s):
    import unicodedata
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode()
    return re.sub(r'\s+', ' ', s).strip()

countries = json.load(open(os.path.join(SRC, 'ne_50m_admin_0_countries.geojson')))['features']
country, cnames = rasterize(countries, lambda f: ascii_name(f['properties']['NAME']))
marine = json.load(open(os.path.join(SRC, 'ne_50m_geography_marine_polys.geojson')))['features']
sea, snames = rasterize(marine, lambda f: ascii_name(f['properties']['name']).title().replace(' Of ', ' of ').replace(' The ', ' the ').replace(' De ', ' de '))
land = country > 0

# every cell gets the nearest sea's name (breadth-first from the named cells)
from collections import deque
q = deque(zip(*np.nonzero(sea)))
while q:
    y, x = q.popleft()
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        yy, xx = y + dy, (x + dx) % W
        if 0 <= yy < H and sea[yy, xx] == 0:
            sea[yy, xx] = sea[y, x]; q.append((yy, xx))

# elevation: 0.5° ETOPO, bilinearly to 0.25°, land only
txt = open(os.path.join(SRC, 'etopo.txt')).read()
rows = re.findall(r'^\[(\d+)\],\s*(.+)$', txt.split('z.lat')[0], re.M)
z = np.array([[float(v) for v in r[1].split(',')] for r in rows], dtype=np.float32)   # 360 × 720, row 0 at 89.75°S
z = z[::-1]                                                                           # row 0 at 89.75°N
assert z.shape == (360, 720), z.shape
yy = (np.arange(H) + 0.5) / R; xx = (np.arange(W) + 0.5) / R                          # degrees from N and from W
fy = np.clip(yy * 2 - 0.5, 0, 359); fx = xx * 2 - 0.5
y0 = np.floor(fy).astype(int); y1 = np.minimum(y0 + 1, 359); ty = (fy - y0)[:, None]
x0 = np.floor(fx).astype(int) % 720; x1 = (x0 + 1) % 720; tx = (fx - np.floor(fx))[None, :]
e = (z[y0][:, x0] * (1 - tx) + z[y0][:, x1] * tx) * (1 - ty) + (z[y1][:, x0] * (1 - tx) + z[y1][:, x1] * tx) * ty
elev = np.where(land, np.round(np.sqrt(np.clip(e, 0, 6000) / 6000) * 255), 0).astype(np.uint8)

# distance to the coast, in km, Dijkstra over the grid from the cells on either side of it
lat = 90 - yy
kx = 27.83 * np.cos(np.radians(lat)); ky = 27.83
dist = np.full((H, W), np.inf)
heap = []
for y in range(H):
    for x in range(W):
        l = land[y, x]
        if any(0 <= y + dy < H and land[y + dy, (x + dx) % W] != l for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1))):
            dist[y, x] = 0; heap.append((0.0, y, x))
heapq.heapify(heap)
steps = [(dy, dx) for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dy or dx]
while heap:
    d, y, x = heapq.heappop(heap)
    if d > dist[y, x] or d > 2550: continue
    for dy, dx in steps:
        ny, nx = y + dy, (x + dx) % W
        if not 0 <= ny < H: continue
        nd = d + math.hypot(dx * kx[y], dy * ky)
        if nd < dist[ny, nx]: dist[ny, nx] = nd; heapq.heappush(heap, (nd, ny, nx))
coast = np.round(np.minimum(dist, 2550) / 10).astype(np.uint8)

layers = [country, sea, elev, coast]
kg_path = os.path.join(SRC, 'koppen_0p5.tif')
if os.path.exists(kg_path):
    kg = np.array(Image.open(kg_path)).astype(np.uint8)
    assert kg.shape == (360, 720), kg.shape
    layers.append(np.repeat(np.repeat(kg, 2, axis=0), 2, axis=1) * land)

os.makedirs(OUT, exist_ok=True)
with gzip.open(os.path.join(OUT, 'geo.bin.gz'), 'wb', compresslevel=9) as f:
    for a in layers: f.write(a.tobytes())

places = json.load(open(os.path.join(SRC, 'ne_10m_populated_places_simple.geojson')))['features']
keep = []
for p in places:
    q2 = p['properties']
    if (q2.get('pop_max') or 0) >= 150000 or q2.get('adm0cap') == 1:
        keep.append([round(q2['latitude'], 2), round(q2['longitude'], 2), ascii_name(q2['nameascii'] or q2['name']), ascii_name(q2['adm0name'] or ''), int(q2.get('pop_max') or 0)])
json.dump({'w': W, 'h': H, 'layers': len(layers), 'countries': [''] + cnames, 'seas': [''] + snames, 'places': keep,
           'sources': ['Natural Earth (public domain)', 'ETOPO 2022, NOAA NCEI (public domain)'] + (['Köppen-Geiger V3, Beck et al. (2023), CC BY 4.0'] if len(layers) > 4 else [])},
          open(os.path.join(OUT, 'geo.json'), 'w'), separators=(',', ':'))
print('land', round(land.mean(), 3), 'places', len(keep), 'countries', len(cnames), 'seas', len(snames), 'layers', len(layers),
      'bytes', os.path.getsize(os.path.join(OUT, 'geo.bin.gz')), os.path.getsize(os.path.join(OUT, 'geo.json')))
