"""Unedited proposal masks, reproducible measurements, and explicit selection.

All descriptors concern the supplied reproduction and selected pixels. Neither
mask containment nor area bins certify objects, parts, groups or artistic value.
"""
from __future__ import annotations
import hashlib
import itertools
import json
import cv2
import numpy as np
from .features import rgb_to_lab

VERSION = 'automatic-regions-0.1'


def checked_mask(mask, shape=None):
    mask = np.asarray(mask)
    if mask.dtype != np.bool_ or mask.ndim != 2 or not mask.any():
        raise ValueError('Nonempty two-dimensional boolean mask required')
    if shape is not None and mask.shape != tuple(shape):
        raise ValueError('Mask and reproduction dimensions differ')
    return mask


def mask_digest(mask):
    mask = checked_mask(mask)
    header = json.dumps(list(mask.shape), separators=(',', ':')).encode()
    return hashlib.sha256(header + b'\0' + np.packbits(mask.ravel()).tobytes()).hexdigest()


def describe_mask(rgb, mask, image_sha256, region_id, method):
    rgb = np.asarray(rgb)
    if rgb.dtype != np.uint8 or rgb.ndim != 3 or rgb.shape[2] != 3:
        raise ValueError('RGB uint8 reproduction required')
    mask = checked_mask(mask, rgb.shape[:2])
    h, w = mask.shape
    ys, xs = np.nonzero(mask)
    # Pixel centres, normalized by full reproduction dimensions.
    x, y = (xs + .5) / w, (ys + .5) / h
    pixels = rgb[mask].astype(float) / 255
    lab = rgb_to_lab(pixels)
    count, _, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), 8)
    components = sorted((int(n) for n in stats[1:, cv2.CC_STAT_AREA]), reverse=True)
    cov = np.cov(np.stack([xs, ys]), bias=True) if len(xs) > 1 else np.zeros((2, 2))
    values, vectors = np.linalg.eigh(cov)
    anisotropy = float((values[1] - values[0]) / values.sum()) if values.sum() else 0.
    angle = float(np.degrees(np.arctan2(vectors[1, 1], vectors[0, 1])) % 180) if anisotropy >= .1 else None
    return {'id': region_id, 'method': method, 'image_sha256': image_sha256,
        'mask_sha256': mask_digest(mask), 'size': [w, h], 'pixel_count': int(mask.sum()),
        'area_fraction': float(mask.mean()), 'component_count_8_connected': count - 1,
        'component_pixel_counts': components, 'largest_component_fraction': components[0] / len(xs),
        'bbox_pixels_half_open': [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1],
        'centroid_normalized': [float(x.mean()), float(y.mean())],
        'mean_srgb': pixels.mean(axis=0).tolist(), 'mean_lab_d65': lab.mean(axis=0).tolist(),
        'lab_standard_deviation': lab.std(axis=0).tolist(),
        'principal_axis_degrees_clockwise_from_right': angle, 'axis_anisotropy': anisotropy,
        'touches_frame': {'left': bool(mask[:, 0].any()), 'right': bool(mask[:, -1].any()),
                          'top': bool(mask[0].any()), 'bottom': bool(mask[-1].any())},
        'scope': 'All pixels in this unedited proposal; disconnected components retained. '
                 'Axis describes pixel distribution, not brushstroke direction. RGB appearance is not paint chemistry.',
        'semantic_status': 'unlabelled_proposal'}


def select_regions(descriptors, masks):
    """Fixed six-slot inspection budget; area/scale sampling is not importance."""
    if len({r['id'] for r in descriptors}) != len(descriptors):
        raise ValueError('Duplicate region IDs')
    lookup = {r['id']: r for r in descriptors}
    slots = [('color-largest', 'color', .005, .95, None),
             ('color-next', 'color', .005, .95, None),
             ('boundary-coarse', 'boundary', .005, .95, '3'),
             ('boundary-fine', 'boundary', .005, .95, '12'),
             ('sam-larger', 'sam2', .20, .95, None),
             ('sam-smaller', 'sam2', .005, .20, None)]
    selected, decisions = [], []
    for name, method, lower, upper, scale in slots:
        candidates = sorted([r for r in descriptors if r['method'] == method
            and lower <= r['area_fraction'] < upper and (scale is None or scale in r.get('snapshot_membership', []))],
            key=lambda r: (-r['pixel_count'], r['id']))
        rejected, chosen = [], None
        for r in candidates:
            a = checked_mask(masks[r['id']])
            if mask_digest(a) != r['mask_sha256']:
                raise ValueError('Mask changed after description')
            matches = []
            for prior in selected:
                b = checked_mask(masks[prior], a.shape)
                iou = float((a & b).sum() / (a | b).sum())
                if iou >= .95: matches.append({'id': prior, 'iou': iou})
            if matches:
                rejected.append({'id': r['id'], 'reason': 'inspection_duplicate_iou_at_least_0.95', 'matches': matches})
            else:
                chosen = r['id']; selected.append(chosen); break
        decisions.append({'slot': name, 'selected': chosen, 'candidate_order': [r['id'] for r in candidates], 'skipped': rejected})
    return {'selected_ids': selected, 'decisions': decisions,
        'unselected_ids': [r['id'] for r in descriptors if r['id'] not in selected],
        'scope': 'Fixed inspection budget; omitted proposals remain available. No substitution across method or scale slots. '
                 'Area bins do not mean object/part/group. Near duplicates are skipped only for inspection, never deleted.'}


def measured_relations(descriptors, masks, selected_ids):
    lookup = {r['id']: r for r in descriptors}
    if len(lookup) != len(descriptors) or len(set(selected_ids)) != len(selected_ids):
        raise ValueError('Unique IDs required')
    images = {lookup[i]['image_sha256'] for i in selected_ids}
    if len(images) != 1: raise ValueError('One reproduction required')
    for i in selected_ids:
        if mask_digest(masks[i]) != lookup[i]['mask_sha256']: raise ValueError('Changed mask binding')
    out = []
    for a_id, b_id in itertools.combinations(selected_ids, 2):
        a, b = lookup[a_id], lookup[b_id]
        ma, mb = masks[a_id], checked_mask(masks[b_id], masks[a_id].shape)
        overlap = int((ma & mb).sum()); union = int((ma | mb).sum())
        delta = np.asarray(a['mean_lab_d65']) - b['mean_lab_d65']
        offset = np.asarray(a['centroid_normalized']) - b['centroid_normalized']
        # Count shared 4-neighbour edges between exclusively assigned pixels.
        aa, bb = ma & ~mb, mb & ~ma
        contact = sum(int(x.sum()) for x in [aa[:, :-1] & bb[:, 1:], bb[:, :-1] & aa[:, 1:],
                                             aa[:-1] & bb[1:], bb[:-1] & aa[1:]])
        out.append({'id': 'M' + str(len(out) + 1), 'participant_ids': [a_id, b_id],
            'image_sha256': a['image_sha256'], 'mask_sha256s': [a['mask_sha256'], b['mask_sha256']],
            'centroid_a_minus_b_normalized': offset.tolist(), 'mean_lab_a_minus_b': delta.tolist(),
            'mean_lab_euclidean_distance': float(np.linalg.norm(delta)),
            'overlap_pixels': overlap, 'intersection_over_union': overlap / union,
            'fraction_a_inside_b': overlap / a['pixel_count'], 'fraction_b_inside_a': overlap / b['pixel_count'],
            'exclusive_shared_pixel_edges_4_neighbour': contact,
            'scope': 'Relations between selected pixels. Centroid displacement is not complete object ordering or physical depth. '
                     'Mean Lab distance is not an artistic-significance or viewer-response score. Mask overlap is not depicted occlusion.'})
    return out
