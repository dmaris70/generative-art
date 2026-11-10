"""Coordinates for source-bound views. Pixel boxes are integer, half-open crops."""
import math
import re

VERSION = 'view-context-0.1'


def validate_size(size):
    if not isinstance(size, (list, tuple)) or len(size) != 2 or any(type(v) is not int or v < 2 for v in size):
        raise ValueError('Source dimensions must be integer widths/heights of at least two pixels')
    return tuple(size)


def validate_crop(crop, size):
    w, h = validate_size(size)
    if not isinstance(crop, (list, tuple)) or len(crop) != 4 or any(type(v) is not int for v in crop):
        raise ValueError('Crop must contain four integer pixel coordinates')
    l, t, r, b = crop
    if not (0 <= l < r <= w and 0 <= t < b <= h and r-l >= 2 and b-t >= 2):
        raise ValueError('Crop is outside the source or contains fewer than two pixels per side')
    return tuple(crop)


def normalized_point(point):
    if not isinstance(point, (list, tuple)) or len(point) != 2 or any(type(v) not in (int, float) or not math.isfinite(v) or not 0 <= v <= 1 for v in point):
        raise ValueError('Point must be two finite normalized coordinates')
    return point


def to_source(point, crop, size):
    """Normalized endpoints address first/last pixel centres, matching saved notes."""
    u, v = normalized_point(point)
    l, t, r, b = validate_crop(crop, size)
    return [(l+u*(r-l-1))/(size[0]-1), (t+v*(b-t-1))/(size[1]-1)]


def from_source(point, crop, size):
    x, y = normalized_point(point)
    l, t, r, b = validate_crop(crop, size)
    uv = [(x*(size[0]-1)-l)/(r-l-1), (y*(size[1]-1)-t)/(b-t-1)]
    return uv if all(-1e-9 <= v <= 1+1e-9 for v in uv) else None


def bind_context(payload, graph, graph_sha256, targets):
    if not isinstance(payload, dict) or payload.get('graph_sha256') != graph_sha256:
        raise ValueError('View evidence changed; reload before attaching this note')
    views = {v['id']: v for v in graph['views']}
    view = views.get(payload.get('view_id'))
    if view is None:
        raise ValueError('Unknown displayed view')
    session = payload.get('session_id')
    if not isinstance(session, str) or not re.fullmatch(r'[a-f0-9]{32}', session):
        raise ValueError('Invalid viewing-session reference')
    sequence = payload.get('sequence')
    if type(sequence) is not int or not 1 <= sequence <= 100000:
        raise ValueError('Invalid viewing sequence')
    trail = payload.get('visited_view_ids')
    if not isinstance(trail, list) or not 1 <= len(trail) <= 128 or any(not isinstance(v, str) or v not in views for v in trail):
        raise ValueError('Invalid view history')
    if trail[-1] != view['id'] or len(trail) > sequence:
        raise ValueError('The note must refer to the recorded view context')
    outlines = payload.get('outlines_visible')
    if type(outlines) is not bool:
        raise ValueError('Record whether outlines were displayed')
    for target in targets:
        if target['type'] == 'point' and from_source([target['x'], target['y']], view['crop_xyxy'], graph['image_size']) is None:
            raise ValueError('A note point lies outside its attached view')
        if target['type'] == 'proposal' and not view['region_visibility'][target['id']]['visible_pixels']:
            raise ValueError('A note region is absent from its attached view')
        if target['type'] == 'proposal_variant':
            if target['catalog_sha256'] != graph.get('proposal_catalog',{}).get('catalog_sha256') or not view.get('proposal_visibility',{}).get(target['id'],0):
                raise ValueError('A method-specific region is absent from this view or uses different evidence')
    return {'version': VERSION, 'graph_sha256': graph_sha256, 'view_id': view['id'],
            'level': view['level'], 'crop_xyxy': view['crop_xyxy'],
            'image_size': graph['image_size'], 'image_sha256': graph['image_sha256'],
            'source_sha256': graph['source_sha256'], 'session_id': session,
            'sequence': sequence, 'visited_view_ids': trail, 'outlines_visible': outlines,
            'coordinate_convention': 'Normalized first/last pixel centres; source crop uses half-open integer edges.',
            'scope': 'Client-declared viewing context when the note was attached. This is interface history, not eye tracking or proof of comprehension.'}
