"""Located straight-edge proposals and geometric near-junctions in capture interiors."""
import itertools
import math
import cv2
import numpy as np
from PIL import Image
from scipy.ndimage import binary_erosion, distance_transform_edt


def axial_difference(a, b):
    return abs((a - b + 90) % 180 - 90)


def sample_segment(endpoints, size):
    a, b = np.asarray(endpoints, float).reshape(2, 2)
    n = max(2, int(np.ceil(np.linalg.norm(b - a))) + 1)
    points = np.rint(np.linspace(a, b, n)).astype(int)
    points[:, 0] = np.clip(points[:, 0], 0, size[0] - 1)
    points[:, 1] = np.clip(points[:, 1], 0, size[1] - 1)
    return points


def detect_segments(image, domain, config, minimum_length=None):
    if domain.shape != (image.height, image.width) or min(image.size) < 8:
        raise ValueError('Image/domain mismatch or image too small')
    c = config['line_detector']; short = min(image.size)
    cv2.setNumThreads(1)
    # Detect the full image first; a filled/masked image would invent a polygon edge.
    gray = cv2.cvtColor(np.asarray(image.convert('RGB')), cv2.COLOR_RGB2GRAY)
    detector = cv2.createLineSegmentDetector(c['refine'], c['scale'], c['sigma_scale'], c['quant'],
        c['ang_th'], c['log_eps'], c['density_th'], c['n_bins'])
    detected, widths, _, _ = detector.detect(gray)
    margin = max(1, round(short * c['capture_margin_shortside']))
    boundary_distance = distance_transform_edt(np.pad(domain, 1, constant_values=False))[1:-1, 1:-1]
    cutoff = short * (c['minimum_length_shortside'] if minimum_length is None else minimum_length)
    retained = []; rejected = {'short': 0, 'capture_boundary': 0}
    for i, raw in enumerate([] if detected is None else detected.reshape(-1, 4)):
        support_width = float(np.asarray(widths).reshape(-1)[i]) if widths is not None else 1.
        support_margin = int(np.ceil(support_width/2)) + 1
        valid = boundary_distance > margin + support_margin
        p = raw.reshape(2, 2).astype(float)
        if tuple(p[1]) < tuple(p[0]): p = p[::-1]
        original = p.copy(); original_length = float(np.linalg.norm(p[1] - p[0]))
        length = float(np.linalg.norm(p[1] - p[0]))
        if length < cutoff:
            rejected['short'] += 1; continue
        samples = sample_segment(p, image.size)
        eligible = valid[samples[:, 1], samples[:, 0]]
        runs = []; start = None
        for k, okay in enumerate(eligible):
            if okay and start is None: start = k
            if start is not None and (not okay or k == len(eligible)-1):
                end = k if okay else k-1; runs.append((start, end)); start = None
        if not runs:
            rejected['capture_boundary'] += 1; continue
        start, end = max(runs, key=lambda r: r[1]-r[0])
        clipped = start > 0 or end < len(samples)-1
        if clipped:
            coordinates = np.linspace(original[0], original[1], len(samples))
            p = coordinates[[start, end]]
            length = float(np.linalg.norm(p[1] - p[0]))
            if length < cutoff:
                rejected['capture_boundary'] += 1; continue
            samples = sample_segment(p, image.size)
        fraction = float(valid[samples[:, 1], samples[:, 0]].mean())
        if fraction < c['minimum_valid_sample_fraction']:
            rejected['capture_boundary'] += 1; continue
        delta = p[1] - p[0]
        retained.append({'endpoints_pixels': p.tolist(), 'length_pixels': length,
            'unclipped_endpoints_pixels': original.tolist(), 'capture_clipped': clipped,
            'retained_length_fraction': length / original_length,
            'length_shortside': length / short, 'angle_degrees': math.degrees(math.atan2(delta[1], delta[0])) % 180,
            'detector_support_width_pixels': support_width, 'capture_support_margin_pixels': support_margin,
            'valid_sample_fraction': fraction})
    retained.sort(key=lambda x: (-x['length_pixels'], x['endpoints_pixels']))
    total = len(retained); retained = retained[:c['maximum_segments']]
    for i, row in enumerate(retained): row['id'] = 'L' + str(i + 1)
    length = sum(r['length_pixels'] for r in retained)
    orthogonal = sum(r['length_pixels'] for r in retained if min(axial_difference(r['angle_degrees'], 0), axial_difference(r['angle_degrees'], 90)) <= 10)
    return {'segments': retained, 'detected_count': 0 if detected is None else len(detected),
        'eligible_before_cap': total, 'truncated_count': max(0, total - len(retained)), 'rejected': rejected,
        'capture_margin_pixels': margin, 'minimum_length_shortside': cutoff / short,
        'axis_aligned_length_fraction': orthogonal / length if length else None,
        'scope': 'Straight image-edge proposals. Both edges of a dark band can be detected; counts are not painted lines or brushstrokes.'}


def segment_meeting(a, b, tolerance, minimum_angle):
    if axial_difference(a['angle_degrees'], b['angle_degrees']) < minimum_angle: return None
    p, q = np.asarray(a['endpoints_pixels'], float); r, s = np.asarray(b['endpoints_pixels'], float)
    u, v = q - p, s - r
    matrix = np.column_stack((u, -v))
    if abs(np.linalg.det(matrix)) < 1e-9: return None
    t, z = np.linalg.solve(matrix, r - p)
    ga = max(0., -float(t), float(t) - 1) * np.linalg.norm(u)
    gb = max(0., -float(z), float(z) - 1) * np.linalg.norm(v)
    if ga > tolerance or gb > tolerance: return None
    return {'point': (p + t * u).tolist(), 'segment_ids': [a['id'], b['id']],
        'endpoint_extension_pixels': [float(ga), float(gb)]}


def junction_candidates(segments, domain, config):
    h, w = domain.shape; short = min(w, h); c = config['junctions']
    tolerance = short * c['endpoint_tolerance_shortside']; radius = short * c['cluster_radius_shortside']
    meetings = []
    for a, b in itertools.combinations(segments, 2):
        row = segment_meeting(a, b, tolerance, c['minimum_crossing_angle'])
        if row:
            x, y = np.rint(row['point']).astype(int)
            if 0 <= x < w and 0 <= y < h and domain[y, x]: meetings.append(row)
    # Fixed-anchor clustering avoids long chains joining distant intersections.
    groups = []
    for meeting in sorted(meetings, key=lambda r: tuple(r['point'])):
        match = next((g for g in groups if np.linalg.norm(np.array(g[0]['point']) - meeting['point']) <= radius), None)
        if match is None: groups.append([meeting])
        else: match.append(meeting)
    by_id = {s['id']: s for s in segments}; rows = []
    for group in groups:
        point = np.mean([m['point'] for m in group], axis=0)
        ids = sorted({sid for m in group for sid in m['segment_ids']})
        angles = []
        for sid in ids:
            for endpoint in by_id[sid]['endpoints_pixels']:
                delta = np.asarray(endpoint) - point
                if np.linalg.norm(delta) > tolerance:
                    angle = math.degrees(math.atan2(delta[1], delta[0])) % 360
                    if all(abs((angle - prior + 180) % 360 - 180) >= c['ray_separation_degrees'] for prior in angles): angles.append(angle)
        # Two opposite rays are a continuation, not a corner.
        if len(angles) < 2: continue
        if len(angles) == 2 and abs(abs((angles[0] - angles[1] + 180) % 360 - 180) - 180) < c['ray_separation_degrees']: continue
        kind = 'corner_like' if len(angles) == 2 else 'T_like' if len(angles) == 3 else 'crossing_like' if len(angles) == 4 else 'complex_near_meeting'
        rows.append({'id': 'J' + str(len(rows) + 1), 'point_pixels': point.tolist(), 'segment_ids': ids,
            'kind': kind, 'ray_count': len(angles), 'ray_degrees': sorted(angles), 'pair_meetings': group,
            'scope': 'Geometric near-meeting; missing or doubled band edges can alter its apparent type.'})
    return rows


def connect_regions(network, masks, image_size, config):
    short = min(image_size); c = config['region_relations']; rows = []
    for rid, mask in masks.items():
        boundary = mask & ~binary_erosion(mask, border_value=0)
        distance = distance_transform_edt(~boundary) if boundary.any() else None
        for line in network['segments']:
            points = sample_segment(line['endpoints_pixels'], image_size)
            fraction = float((distance[points[:, 1], points[:, 0]] <= short * c['line_boundary_band_shortside']).mean()) if distance is not None else 0
            if fraction >= c['minimum_line_contact_fraction']:
                rows.append({'id': rid + '--' + line['id'], 'region_id': rid, 'segment_id': line['id'],
                    'boundary_contact_fraction': fraction, 'scope': 'Near a proposed mask boundary; this is not a verified depicted-object edge.'})
    return rows


def opposite_side_fields(network, masks, image_size, config):
    """Sample both sides of each segment; retain ambiguous/unassigned sides explicitly."""
    offset = max(2, min(image_size) * config['region_relations']['line_boundary_band_shortside'])
    result = []
    for segment in network['segments']:
        a, b = np.asarray(segment['endpoints_pixels']); tangent = (b - a) / np.linalg.norm(b - a)
        normal = np.array([-tangent[1], tangent[0]])
        center = np.linspace(a, b, max(10, round(segment['length_pixels'])))
        sides = []
        for sign in [-1, 1]:
            points = np.rint(center + sign * offset * normal).astype(int)
            valid = (points[:, 0] >= 0) & (points[:, 0] < image_size[0]) & (points[:, 1] >= 0) & (points[:, 1] < image_size[1])
            points = points[valid]
            sides.append({rid: float(mask[points[:, 1], points[:, 0]].mean()) if len(points) else 0 for rid, mask in masks.items()})
        pairs = []
        for left, lf in sides[0].items():
            for right, rf in sides[1].items():
                if left != right and lf >= .25 and rf >= .25: pairs.append({'negative_side_region': left, 'positive_side_region': right, 'sample_fractions': [lf, rf]})
        result.append({'segment_id': segment['id'], 'offset_pixels': offset, 'side_membership_fractions': sides, 'opposite_proposal_pairs': pairs,
            'scope': 'Different mask proposals sampled on opposite sides, not proof that the entire segment separates depicted objects.'})
    return result


def line_overlay(image, network, junctions):
    pixels = np.asarray(image.convert('RGB')).copy()
    for s in network['segments']:
        a, b = np.rint(s['endpoints_pixels']).astype(int)
        cv2.line(pixels, tuple(a), tuple(b), (204, 36, 112), 2, cv2.LINE_AA)
    for j in junctions:
        p = tuple(np.rint(j['point_pixels']).astype(int)); cv2.circle(pixels, p, 5, (255, 219, 66), 2, cv2.LINE_AA)
    return Image.fromarray(pixels)


def match_segments(full, other, full_size, other_size, config):
    short = min(full_size); c = config['controls']; candidates = []
    scale = np.array([(full_size[0] - 1) / (other_size[0] - 1), (full_size[1] - 1) / (other_size[1] - 1)])
    for a in full['segments']:
        p = np.asarray(a['endpoints_pixels'])
        for b in other['segments']:
            q = np.asarray(b['endpoints_pixels']) * scale
            # Endpoints are unoriented for the matching diagnostic.
            distance = min(float(np.linalg.norm(p - q, axis=1).max()), float(np.linalg.norm(p - q[::-1], axis=1).max())) / short
            delta = q[1] - q[0]; angle = math.degrees(math.atan2(delta[1], delta[0])) % 180
            if distance <= c['matching_endpoint_distance_shortside'] and axial_difference(a['angle_degrees'], angle) <= c['matching_angle_degrees']:
                candidates.append((distance, a['id'], b['id']))
    matches = []; used_a = set(); used_b = set()
    for distance, a, b in sorted(candidates):
        if a in used_a or b in used_b: continue
        used_a.add(a); used_b.add(b); matches.append({'full_id': a, 'secondary_id': b, 'endpoint_distance_shortside': distance})
    return {'matches': matches, 'full_count': len(full['segments']), 'secondary_count': len(other['segments']),
        'full_matched_fraction': len(matches) / len(full['segments']) if full['segments'] else None,
        'scope': 'Greedy one-to-one endpoint agreement across resolution, not detection accuracy. Splitting/merging can reduce agreement.'}
