# Decomposes the traced sheet (../023-horses-study/data.js) into its components: each
# horse or horse-group, the moon, the white tree, the forest band, the two plants, and the
# ground that is left. Hand-drawn catchment polygons + a pigment rule (meadow greens belong
# to the ground) decide membership. Writes parts.js; optional 2nd arg = debug PNG.
import sys, json, re, colorsys, numpy as np, cv2
src = open(sys.argv[1] if len(sys.argv) > 1 else '../023-horses-study/data.js').read()
W, H = [int(v) for v in re.search(r'SRC_W=(\d+), SRC_H=(\d+)', src).groups()]
REG = json.loads(re.search(r'const REGIONS=(.*?);\n', src).group(1))
PEN = json.loads(re.search(r'const PENCIL=(.*?);\n', src).group(1))

def circle(cx, cy, r): return [(cx + r * np.cos(a), cy + r * np.sin(a)) for a in np.linspace(0, 6.283, 40)]
# name, kind, facing (+1 right), catchment, keep greens?
PARTS = [
 ('moon', 'moon', 1, circle(1105, 165, 150), True),
 ('colt', 'horse', 1, [(440,700),(500,640),(540,608),(632,628),(628,662),(560,672),(540,720),(520,800),(470,830),(450,900),(428,900)], False),
 ('white', 'horse', 1, [(872,425),(900,380),(1000,350),(1140,340),(1180,325),(1255,370),(1245,402),(1180,392),(1100,420),(1072,480),(1062,600),(1052,705),(990,705),(980,612),(890,604),(880,500)], False),
 ('trio', 'horse', 1, [(335,440),(440,398),(560,328),(610,298),(690,198),(800,182),(892,213),(886,255),(1010,328),(1058,385),(1000,422),(900,400),(872,430),(886,640),(882,785),(800,792),(740,762),(700,690),(560,702),(450,682),(430,765),(368,735),(350,640),(333,560)], False),
 ('blue', 'horse', 1, [(470,832),(560,808),(740,798),(780,728),(850,688),(960,668),(1024,700),(1012,732),(930,732),(902,780),(902,862),(760,866),(690,882),(600,902),(572,1002),(498,1012),(520,900)], False),
 ('spotted', 'horse', 1, [(1122,858),(1240,826),(1328,830),(1318,640),(1400,616),(1492,618),(1502,660),(1462,700),(1500,760),(1512,1000),(1482,1102),(1420,1102),(1400,1002),(1240,1012),(1200,1112),(1140,1112),(1150,1000)], False),
 ('cream', 'horse', 1, [(676,880),(760,858),(900,868),(1010,850),(1060,790),(1150,748),(1250,742),(1288,790),(1240,818),(1170,812),(1130,850),(1122,1000),(1100,1112),(1040,1112),(1040,1012),(800,1012),(760,1052),(700,1002),(688,950)], False),
 ('bay', 'horse', -1, [(1480,700),(1560,660),(1640,640),(1700,600),(1688,560),(1760,528),(1862,538),(1932,600),(1962,700),(1962,1012),(1900,1012),(1880,862),(1700,862),(1660,1002),(1600,1002),(1580,862),(1500,800)], False),
 ('black', 'horse', 1, [(958,1180),(1050,1128),(1280,1128),(1330,1040),(1400,998),(1500,998),(1602,1060),(1582,1102),(1480,1092),(1500,1200),(1492,1452),(1380,1452),(1370,1322),(1080,1322),(1060,1452),(978,1452),(990,1300)], False),
 ('runner', 'horse', 1, [(280,1130),(380,1090),(520,1060),(580,1028),(660,1028),(742,1050),(732,1082),(640,1092),(622,1150),(680,1250),(702,1342),(650,1342),(560,1262),(440,1252),(330,1202)], False),
 ('tree', 'tree', 1, [(1240,60),(1500,0),(1905,0),(1905,420),(1700,520),(1592,560),(1600,1000),(1685,1282),(1480,1302),(1500,1000),(1500,620),(1420,500),(1240,330)], False),
 ('plant', 'plant', 1, [(30,680),(280,655),(425,700),(432,1000),(332,1100),(332,1335),(60,1342),(20,1000)], False),
 ('fronds', 'plant', 1, [(1640,1040),(1962,1040),(1992,1457),(1640,1457)], False),
 ('forest', 'forest', 1, [(0,0),(655,0),(655,300),(560,330),(440,398),(335,440),(333,660),(0,660)], True),
]
def meadow(c):
    h, s, v = colorsys.rgb_to_hsv(c[0] / 255, c[1] / 255, c[2] / 255); h *= 360
    return 66 <= h <= 166 and s >= 0.33 and v > 0.30
polys = [np.array(p[3], np.float32) for p in PARTS]
def inside(poly, pts):
    return np.mean([cv2.pointPolygonTest(poly, (float(x), float(y)), False) >= 0 for x, y in pts])
out = [dict(name=p[0], kind=p[1], face=p[2], regions=[], pencil=[]) for p in PARTS]; ground = []
for r in REG:
    pts = np.array(r[3]).reshape(-1, 2); home = None
    for k, p in enumerate(PARTS):
        if inside(polys[k], pts[:: max(1, len(pts) // 24)]) >= 0.7 and (p[4] or not meadow(r[1])): home = k; break
    (out[home]['regions'] if home is not None else ground).append(r)
for l in PEN:
    pts = np.array(l).reshape(-1, 2); m = pts[len(pts) // 2]
    for k, p in enumerate(PARTS):
        if p[1] != 'forest' and cv2.pointPolygonTest(polys[k], (float(m[0]), float(m[1])), False) >= 0: out[k]['pencil'].append(l); break
# what the sheet shows once a component is lifted off it: each of its passages takes the nearest ground pigment
from scipy.spatial import cKDTree
def groundish(c):
    h, s_, v = colorsys.rgb_to_hsv(c[0] / 255, c[1] / 255, c[2] / 255); return 50 <= h * 360 <= 200 and s_ >= 0.25
stray = [r for r in ground if not groundish(r[1])]                 # coat fragments the catchments missed: lifted too
ground = [r for r in ground if groundish(r[1])]
out.append(dict(name='stray', kind='stray', face=1, regions=stray, pencil=[]))
big = [r for r in ground if r[0] > 300 and meadow(r[1])]
tree = cKDTree([np.array(r[3]).reshape(-1, 2).mean(0) for r in big])
sky = max(ground, key=lambda r: r[0])[1]
for o in out:
    for r in o['regions']:
        if o['kind'] == 'moon': r.append(sky); continue                 # the moon lifts off the night wash, not off meadow
        r.append(big[tree.query(np.array(r[3]).reshape(-1, 2).mean(0))[1]][1])
for o in out:
    a = np.concatenate([np.array(r[3]).reshape(-1, 2) for r in o['regions']])
    o['box'] = [int(v) for v in (*a.min(0), *a.max(0))]
    print(o['name'], len(o['regions']), 'regions', len(o['pencil']), 'pencil', o['box'])
print('ground', len(ground))
with open('parts.js', 'w') as f:
    f.write('// generated by decompose.py from the 022 trace — components of the sheet, source px\n')
    f.write('const SRC_W=%d, SRC_H=%d;\nconst PARTS=%s;\nconst GROUND=%s;\n' % (W, H, json.dumps(out, separators=(',', ':')), json.dumps(ground, separators=(',', ':'))))
if len(sys.argv) > 2:
    im = np.full((H, W, 3), 90, np.uint8)
    for o in out:
        for r in o['regions']: cv2.fillPoly(im, [np.array(r[3], np.int32).reshape(-1, 2)], r[1][::-1])
    for p in polys: cv2.polylines(im, [p.astype(np.int32)], True, (255, 255, 255), 1)
    cv2.imwrite(sys.argv[2], cv2.resize(im, (1400, 1020)))
