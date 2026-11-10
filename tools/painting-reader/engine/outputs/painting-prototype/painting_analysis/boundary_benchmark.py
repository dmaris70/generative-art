"""Reference-mask validation and transparent overlap/boundary metrics.

Human independence is a declaration, not something this module can certify.
Missing references remain unscored; empty predictions score zero against a target.
"""
import hashlib
import json
import math
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import binary_erosion, distance_transform_edt

METHODS = ('color_fields', 'boundary_groups', 'sam_automatic', 'sam_point')


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode()).hexdigest()


def polygon_valid(points):
    if not isinstance(points, list) or not 3 <= len(points) <= 2000:
        return False
    if any(not isinstance(p, list) or len(p) != 2 or any(type(v) not in (int, float) or not math.isfinite(v) or not 0 <= v <= 1 for v in p) for p in points):
        return False
    if len({tuple(p) for p in points}) != len(points):
        return False
    def cross(a,b,c):
        return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
    def on(a,b,c):
        return abs(cross(a,b,c)) < 1e-12 and min(a[0],b[0])-1e-12 <= c[0] <= max(a[0],b[0])+1e-12 and min(a[1],b[1])-1e-12 <= c[1] <= max(a[1],b[1])+1e-12
    n = len(points)
    for i in range(n):
        a,b = points[i],points[(i+1)%n]
        for j in range(i+1,n):
            if j == i+1 or (i == 0 and j == n-1):
                continue
            c,d = points[j],points[(j+1)%n]
            if (cross(a,b,c)*cross(a,b,d) < 0 and cross(c,d,a)*cross(c,d,b) < 0) or on(a,b,c) or on(a,b,d) or on(c,d,a) or on(c,d,b):
                return False
    area = abs(sum(points[i][0]*points[(i+1)%n][1]-points[(i+1)%n][0]*points[i][1] for i in range(n)))/2
    return area > 1e-8


def rasterize(contours, size):
    if not isinstance(contours, list) or not 1 <= len(contours) <= 64:
        raise ValueError('One to 64 contours required')
    include, exclude = [Image.new('1', tuple(size), 0) for _ in range(2)]
    for contour in contours:
        if not isinstance(contour, dict) or contour.get('kind') not in ('include', 'exclude') or not polygon_valid(contour.get('points')):
            raise ValueError('Invalid or self-intersecting polygon')
        target = include if contour['kind'] == 'include' else exclude
        pixels = [(round(x*(size[0]-1)), round(y*(size[1]-1))) for x,y in contour['points']]
        ImageDraw.Draw(target).polygon(pixels, fill=1)
    a,b = np.asarray(include, dtype=bool),np.asarray(exclude, dtype=bool)
    if np.any(b & ~a):
        raise ValueError('A hole extends outside the included outline')
    mask = a & ~b
    if int(mask.sum()) < 4:
        raise ValueError('Reference target is empty or too small')
    return mask


def validate_annotations(packet, annotation):
    if annotation.get('version') != 'painting-boundary-annotation-0.1' or annotation.get('packet_id') != packet['packet_id']:
        raise ValueError('Wrong annotation version or packet')
    reviewer = annotation.get('reviewer', {})
    if not isinstance(reviewer.get('name_or_code'), str) or not reviewer['name_or_code'].strip():
        raise ValueError('Reviewer name or code required')
    if reviewer.get('role') not in ('human', 'assistant', 'synthetic_test') or reviewer.get('involvement') not in ('independent', 'involved', 'uncertain'):
        raise ValueError('Reviewer role and involvement declaration required')
    cases = annotation.get('cases', [])
    known = {c['id']:c for c in packet['cases']}
    if len(cases) != len(known) or {c.get('case_id') for c in cases} != set(known):
        raise ValueError('Missing, duplicate or unknown cases')
    masks, statuses = {}, {}
    for row in cases:
        case = known[row['case_id']]
        if row.get('image_sha256') != case['image_sha256']:
            raise ValueError('Reference image binding changed')
        if row.get('status') not in ('unanswered', 'outlined', 'ambiguous', 'skip') or not isinstance(row.get('notes'), str):
            raise ValueError('Invalid annotation status or notes')
        statuses[case['id']] = row['status']
        if row['status'] == 'outlined':
            masks[case['id']] = rasterize(row.get('contours'), case['image_size'])
        elif row.get('contours'):
            raise ValueError('Non-outlined cases must not contain active contours')
    independent = reviewer['role'] == 'human' and reviewer['involvement'] == 'independent'
    return masks, {'reference_count':len(masks), 'scheduled_cases':len(known), 'statuses':statuses,
                   'reference_status':'human_declared_independent' if independent else 'non_independent_or_uncertain',
                   'independence_verified':False, 'reviewer':reviewer}


def metrics(prediction, reference, tolerances=(1,2,4)):
    if prediction.dtype != bool or reference.dtype != bool or prediction.shape != reference.shape or prediction.ndim != 2:
        raise ValueError('Boolean masks with matching 2D shapes required')
    if not reference.any():
        raise ValueError('Empty reference is not a valid target')
    intersection = int((prediction & reference).sum())
    union = int((prediction | reference).sum())
    pn, rn = int(prediction.sum()), int(reference.sum())
    boundary = lambda mask: mask & ~binary_erosion(mask, structure=np.ones((3,3),bool), border_value=0)
    pb, rb = boundary(prediction), boundary(reference)
    to_ref = distance_transform_edt(~rb)
    to_pred = distance_transform_edt(~pb) if pb.any() else None
    rows = []
    for tolerance in tolerances:
        if tolerance < 0 or not math.isfinite(tolerance):
            raise ValueError('Boundary tolerance must be finite and nonnegative')
        precision = float((to_ref[pb] <= tolerance).mean()) if pb.any() else 0.
        recall = float((to_pred[rb] <= tolerance).mean()) if pb.any() else 0.
        f = 2*precision*recall/(precision+recall) if precision+recall else 0.
        rows.append({'tolerance_pixels':tolerance, 'precision':precision, 'recall':recall, 'f1':f})
    return {'iou':intersection/union, 'dice':2*intersection/(pn+rn),
            'target_coverage':intersection/rn, 'outside_target_fraction':(pn-intersection)/pn if pn else None,
            'empty_prediction':pn==0, 'boundary':rows}


def evaluate(packet, annotation, predictions):
    references, status = validate_annotations(packet, annotation)
    expected = {c['id'] for c in packet['cases']}
    if set(predictions) != expected:
        raise ValueError('Predictions must account for every scheduled case')
    results = []
    for case in packet['cases']:
        cid = case['id']
        for method in METHODS:
            if method not in predictions[cid]:
                raise ValueError('Every method must have an explicit outcome')
            prediction = predictions[cid][method]
            row = {'case_id':cid, 'work_id':case['work_id'], 'method':method, 'execution_status':prediction['status']}
            if cid not in references:
                row.update(status='unscored', reason=status['statuses'][cid])
            else:
                ref = references[cid]
                selected = prediction.get('selected')
                selected = np.zeros_like(ref) if selected is None else selected
                measured = metrics(selected, ref)
                pool = prediction.get('pool', {})
                oracle = max((metrics(mask,ref)['iou'] for mask in pool.values()), default=0.)
                row.update(status='scored', **measured, oracle_pool_iou=oracle,
                           oracle_scope='Reference-selected upper bound on this retained pool, not the primary prediction score')
            results.append(row)
    aggregates = {}
    for method in METHODS:
        rows = [r for r in results if r['method'] == method and r['status'] == 'scored']
        aggregates[method] = {'scheduled_cases':len(expected), 'scored_cases':len(rows),
                              'unscored_cases':len(expected)-len(rows),
                              'mean_iou':float(np.mean([r['iou'] for r in rows])) if rows else None,
                              'mean_boundary_f1_at_2px':float(np.mean([next(b['f1'] for b in r['boundary'] if b['tolerance_pixels']==2) for r in rows])) if rows else None,
                              'failed_execution_cases':sum(predictions[cid][method]['status']=='failed' for cid in expected)}
    return {'version':'painting-boundary-evaluation-0.1', 'packet_id':packet['packet_id'],
            'annotation_sha256':digest(annotation), 'references':status, 'cases':results, 'aggregates':aggregates,
            'scope':'Operational selected-mask scores: missing predictions count as empty against an available reference; execution failures also remain explicit. Missing references never become zero accuracy. Cases are nested within four paintings; no population claim.'}
