#!/usr/bin/env python3
"""Read paintings with the painting reader and write Poured Ground reading records.

The reader (painting_handoff.analyze, measurement-only path) turns an image into a handoff:
colour clusters, value masses, colour islands, detail distribution, formal configurations.
This driver runs it over the works Poured Ground holds an image for and compacts each handoff
into a small record that the engine turns into a composition (engine.js: readBrief). Nothing is
interpreted here: the record keeps the reader's measurements, the engine decides what to pour.

  --colorlisa   the public-domain originals in projects/060-poured-ground/originals/ (originals.js)
                → projects/060-poured-ground/readings.js and readings/<id>.handoff.json
  --archive     Colorist Archive works that are public domain and have an image URL on one of
                --hosts (museum CDNs; Wikimedia is rate-limited and is not read by default)
                → projects/060-poured-ground/archive/readings.json (resumable with --resume)

Images are downloaded into their own temporary directory and deleted after reading; only the
measurements, the image's SHA-256 and its URL are kept. The optional vision model is not used:
no subject description is produced or invented (coverage.visual_reading = unavailable).
"""
import argparse, json, math, re, sys, tempfile, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import painting_handoff  # noqa: E402

ROOT = HERE.parents[1]
PROJECT = ROOT / 'projects/060-poured-ground'
ARCHIVE_BASE = 1000
UA = {'User-Agent': 'PouredGround/1.0 (generative-art research; https://github.com/dmaris70/generative-art)'}
HOSTS = {
    'met': ('images.metmuseum.org', 'The Metropolitan Museum of Art'),
    'tate': ('media.tate.org.uk', 'Tate'),
    'cma': ('openaccess-cdn.clevelandart.org', 'Cleveland Museum of Art'),
    'nga': ('api.nga.gov', 'National Gallery of Art'),
    'google': ('lh3.googleusercontent.com', 'Google Arts & Culture'),
    'google2': ('lh5.ggpht.com', 'Google Arts & Culture'),
    'wikimedia': ('upload.wikimedia.org', 'Wikimedia Commons'),
}
DELTA_E_MERGE = 12.0   # two clusters closer than this in CIELAB are one colour for our purposes


def r3(x): return None if x is None else round(float(x), 3)
def r2(x): return None if x is None else round(float(x), 2)


def js_object(path):
    """The data object of a `(function (g) { g.NAME = {...}; })(...)` file."""
    text = Path(path).read_text(encoding='utf-8')
    start = text.index('= {') + 2
    depth = 0
    for i in range(start, len(text)):
        if text[i] == '{': depth += 1
        elif text[i] == '}':
            depth -= 1
            if depth == 0:
                return json.loads(text[start:i + 1])
    raise ValueError('unterminated object in ' + str(path))


def merge_palette(palette):
    """Six reader clusters → five colours, largest share first. Returns (colors, shares, map6, centroids).

    The two clusters closest in CIELAB are merged (the smaller into the larger) when their
    distance is below DELTA_E_MERGE; otherwise the smallest cluster is folded into its nearest.
    map6[i] is the index among the five of reader cluster i.
    """
    cl = [{'i': i, 'hex': p['hex'], 'share': float(p['share']), 'lab': list(p['lab']), 'c': list(p.get('centroid') or [0.5, 0.5])} for i, p in enumerate(palette)]
    cl.sort(key=lambda c: -c['share'])
    if len(cl) < 5:
        raise ValueError('reader palette has fewer than 5 clusters')
    merged_into = {}
    while len(cl) > 5:
        best = None
        for a in range(len(cl)):
            for b in range(a + 1, len(cl)):
                d = math.dist(cl[a]['lab'], cl[b]['lab'])
                if best is None or d < best[0]: best = (d, a, b)
        d, a, b = best
        if d >= DELTA_E_MERGE:   # nothing close: drop the smallest into its nearest
            b = len(cl) - 1
            a = min((j for j in range(len(cl) - 1)), key=lambda j: math.dist(cl[j]['lab'], cl[b]['lab']))
        keep, gone = (a, b) if cl[a]['share'] >= cl[b]['share'] else (b, a)
        w0, w1 = cl[keep]['share'], cl[gone]['share']
        cl[keep]['c'] = [(cl[keep]['c'][k] * w0 + cl[gone]['c'][k] * w1) / (w0 + w1) for k in (0, 1)]   # share-weighted pixel centroid
        cl[keep]['share'] += cl[gone]['share']
        merged_into[cl[gone]['i']] = cl[keep]['i']
        for k, v in list(merged_into.items()):
            if v == cl[gone]['i']: merged_into[k] = cl[keep]['i']
        del cl[gone]
    cl.sort(key=lambda c: -c['share'])
    pos = {c['i']: k for k, c in enumerate(cl)}
    map6 = [pos[merged_into.get(i, i)] for i in range(len(palette))]
    return [c['hex'] for c in cl], [r3(c['share']) for c in cl], map6, [[r3(c['c'][0]), r3(c['c'][1])] for c in cl]


def mask_bits(cells, cols, rows):
    """A field's coarse mask (the reader's connected grid cells) as base64: row-major, y down,
    bit (y*cols + x) set where the cell belongs, bytes packed least-significant bit first."""
    import base64
    buf = bytearray((cols * rows + 7) // 8)
    for x, y in cells:
        i = int(y) * cols + int(x); buf[i >> 3] |= 1 << (i & 7)
    return base64.b64encode(bytes(buf)).decode()


def compact(doc, meta, measurements=None, formal=None):
    """One reading record from a handoff.json (see engine.js readBrief for how it is used).

    The palette is merged from the measurements artifact when given: the handoff's palette
    entries carry hex, share and Lab, the artifact's also each cluster's pixel centroid.
    """
    ve = doc['visual_evidence']
    colors, shares, map6, centroids = merge_palette((measurements or {}).get('palette') or ve['palette'])
    grid = None; cells = {}
    if formal and formal.get('grid'):
        grid = [int(formal['grid']['columns']), int(formal['grid']['rows'])]
        cells = {f['id']: f.get('cells_xy') or [] for f in formal.get('fields', [])}
    fields = []
    for f in ve['formal_fields']:
        b = f['bbox_analysis']; c = f['centroid_analysis']
        row = [f['id'], f['kind'], r3(f['area_fraction']), r3(b[0]), r3(b[1]), r3(b[2]), r3(b[3]), r3(c[0]), r3(c[1]),
               None if f.get('principal_axis_degrees') is None else round(float(f['principal_axis_degrees'])),
               r2(f.get('axis_variance_ratio')), r2(f['occupancy_in_bbox']), r3(f['edge_density']), round(float(f['mean_lightness'])),
               None if f.get('palette_index') is None else map6[int(f['palette_index'])]]
        if grid and cells.get(f['id']): row.append(mask_bits(cells[f['id']], grid[0], grid[1]))   # 16th: the field's own silhouette
        fields.append(row)
    configs = [[c['id'], c['kind'], list(c['field_ids'])] for c in ve['formal_configurations']]
    shared = sorted({fid for h in ve['formal_interactions'] for fid in h.get('shared_field_ids', [])})
    e = ve['edges'] or {}
    cells = sorted(ve['grid_cells'] or [], key=lambda c: c['id'])
    rec = {'id': meta['id'], 'sha256': doc['input']['sha256'], 'image': meta['image'], 'source': meta['source'],
           'px': list(doc['input']['dimensions_px']), 'reader': meta['reader'], 'code_sha256': meta['code_sha256'], 'read_on': meta['read_on'],
           'reading': doc['coverage']['visual_reading'], 'grid': grid,
           'colors': colors, 'shares': shares, 'centroids': centroids, 'map6': map6, 'fields': fields, 'configs': configs, 'shared': shared,
           'edges': [round(float(e.get('dominant_tangent_degrees', 0))), r3(e.get('dominant_bin_share', 0)), r3(e.get('strong_edge_density', 0))],
           'ebins': [r3(v) for v in (e.get('orientation_shares') or [])],   # the whole grain: 8 bins over 180 degrees, 0 = horizontal
           'cells': [r3(c['strong_edge_density']) for c in cells]}
    return rec


def read_image(image_path, meta):
    with tempfile.TemporaryDirectory(prefix='pg-reading-') as tmp:
        out = Path(tmp) / 'handoff'
        doc = painting_handoff.analyze(image_path, out)
        prov = json.loads((out / 'artifacts/provenance.json').read_text())
        measurements = json.loads((out / 'artifacts/measurements.json').read_text())
        formal = json.loads((out / 'artifacts/formal.json').read_text())
        meta = dict(meta, reader=prov.get('formal_layer'), code_sha256=prov.get('code_sha256'), read_on=time.strftime('%Y-%m-%d'))
        return compact(doc, meta, measurements, formal), doc


def write_js(path, name, data, comment):
    body = json.dumps(data, indent=0, ensure_ascii=False)
    Path(path).write_text(comment + '(function (g) { g.' + name + ' = ' + body + "; })(typeof window !== 'undefined' ? window : globalThis);\n", encoding='utf-8')


def run_colorlisa():
    originals = js_object(PROJECT / 'originals.js')
    out_dir = PROJECT / 'readings'; out_dir.mkdir(exist_ok=True)
    records = {}
    for sid, o in sorted(originals.items(), key=lambda kv: int(kv[0])):
        if not o.get('public_domain'): continue
        image = PROJECT / 'originals' / o['file']
        rec, doc = read_image(image, {'id': int(sid), 'image': 'originals/' + o['file'], 'source': o['source']})
        records[sid] = rec
        (out_dir / (sid.zfill(3) + '.handoff.json')).write_text(json.dumps(doc, indent=1, ensure_ascii=False) + '\n', encoding='utf-8')
        print(sid, o['artist'], '|', o['title'], '|', len(rec['fields']), 'fields,', len(rec['configs']), 'configurations,', rec['colors'])
    comment = ('// Readings of the public-domain originals by the painting reader (tools/painting-reader, measurement-only\n'
               '// path: colour clusters, value masses, colour islands, detail distribution, formal configurations; no subject\n'
               '// identification). Each record is compacted from readings/<id>.handoff.json by tools/painting-reader/read_works.py\n'
               '// and turned into a composition by engine.js readBrief. Fields: [id, kind, area, x0, y0, x1, y1, cx, cy, axis°,\n'
               '// axisVarianceRatio, occupancyInBbox, edgeDensity, meanL*, colourIndex, mask]. The mask is the field\'s own silhouette:\n'
               '// the reader\'s connected grid cells (grid [cols, rows]) as base64 bits, row-major, y down, least-significant bit first.\n'
               '// centroids: the pixel centroid of each colour.\n'
               '// Coordinates: image uv, x right, y down.\n')
    write_js(PROJECT / 'readings.js', 'READINGS', records, comment)
    print('wrote', PROJECT / 'readings.js', 'and', len(records), 'handoffs in', out_dir)


def archive_jobs(hosts):
    ix = json.loads((PROJECT / 'archive/index.json').read_text())
    allowed = {HOSTS[h][0]: HOSTS[h][1] for h in hosts}
    jobs = []
    for a in ix['artists']:
        works = json.loads((PROJECT / 'archive' / (a['id'] + '.json')).read_text())
        for i, w in enumerate(works):
            if not (w.get('pd') and w.get('i')): continue
            host = w['i'].split('/')[2]
            if host in allowed:
                jobs.append({'id': ARCHIVE_BASE + a['o'] + i, 'image': w['i'], 'source': allowed[host], 'title': w['t'], 'artist': a['name']})
    return jobs


WIKIMEDIA_WIDTH = 1280   # Wikimedia serves hotlinked thumbnails only at standard widths; 1280 px is accepted
def readable_url(url):
    """The URL to fetch: Wikimedia thumbnails at a standard width (the archive's 600 px ones are refused)."""
    if '://upload.wikimedia.org/' in url and '/thumb/' in url:
        return re.sub(r'/\d+px-', '/%dpx-' % WIKIMEDIA_WIDTH, url)
    return url


import threading
PACE = {'seconds': 0.0, 'next': 0.0, 'lock': threading.Lock()}
def paced():
    """Wait so that requests are at least PACE['seconds'] apart (all workers together)."""
    with PACE['lock']:
        now = time.time(); wait = max(0.0, PACE['next'] - now)
        PACE['next'] = max(now, PACE['next']) + PACE['seconds']
    if wait: time.sleep(wait)


def fetch(url, dest, tries=4):
    url = readable_url(url)
    k = 0
    while k < tries:
        paced()
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=60) as r:
                if int(r.headers.get('Content-Length') or 0) > 60_000_000: raise ValueError('image too large')
                data = r.read(60_000_001)
            if len(data) > 60_000_000: raise ValueError('image too large')
            dest.write_bytes(data); return True
        except urllib.error.HTTPError as e:
            if e.code == 429:   # rate limited: wait as told and try again; this does not count as an attempt
                time.sleep(int(e.headers.get('Retry-After') or 15) + 1 + PACE['seconds']); continue
            if e.code in (400, 403, 404, 410): return False
            time.sleep(3 * (k + 1))
        except Exception:
            time.sleep(3 * (k + 1))
        k += 1
    return False


def run_archive(hosts, out, resume, workers, limit):
    jobs = archive_jobs(hosts)
    done = {}
    if resume and Path(out).exists():
        done = json.loads(Path(out).read_text())
    todo = [j for j in jobs if str(j['id']) not in done]
    if limit: todo = todo[:limit]
    print(len(jobs), 'eligible works on', hosts, '|', len(done), 'already read |', len(todo), 'to read', flush=True)
    failures = []

    def one(j):
        with tempfile.TemporaryDirectory(prefix='pg-dl-') as tmp:
            img = Path(tmp) / 'image'
            if not fetch(j['image'], img): return j, None, 'download failed'
            try:
                rec, _ = read_image(img, {'id': j['id'], 'image': readable_url(j['image']), 'source': j['source']})
                return j, rec, None
            except Exception as e:
                return j, None, type(e).__name__ + ': ' + str(e)[:120]
    n = 0
    with ThreadPoolExecutor(workers) as ex:
        for j, rec, err in ex.map(one, todo):
            n += 1
            if rec: done[str(j['id'])] = rec
            else: failures.append({'id': j['id'], 'image': j['image'], 'error': err})
            if n % 25 == 0 or n == len(todo):
                Path(out).write_text(json.dumps(done, separators=(',', ':'), ensure_ascii=False) + '\n', encoding='utf-8')
                print(n, 'of', len(todo), '|', len(done), 'readings |', len(failures), 'failed', flush=True)
    Path(out).write_text(json.dumps(done, separators=(',', ':'), ensure_ascii=False) + '\n', encoding='utf-8')
    if failures:
        Path(str(out) + '.failures.json').write_text(json.dumps(failures, indent=1) + '\n')
    print('done:', len(done), 'readings;', len(failures), 'failures')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--colorlisa', action='store_true')
    ap.add_argument('--archive', action='store_true')
    ap.add_argument('--hosts', default='met,tate,cma,nga,google,google2')
    ap.add_argument('--out', default=str(PROJECT / 'archive/readings.json'))
    ap.add_argument('--resume', action='store_true')
    ap.add_argument('--workers', type=int, default=3)
    ap.add_argument('--limit', type=int, default=0)
    ap.add_argument('--pace', type=float, default=0, help='minimum seconds between requests, all workers together (Wikimedia needs ~120 from a cloud address)')
    a = ap.parse_args()
    if a.colorlisa: run_colorlisa()
    PACE['seconds'] = a.pace
    if a.archive: run_archive([h for h in a.hosts.split(',') if h], a.out, a.resume, a.workers, a.limit)
    if not (a.colorlisa or a.archive): ap.print_help()


if __name__ == '__main__':
    main()
