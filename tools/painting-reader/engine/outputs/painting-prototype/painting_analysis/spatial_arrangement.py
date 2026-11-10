"""Spatial relations and transparent layout interventions on existing region proposals."""
import itertools
import cv2
import numpy as np
from scipy.ndimage import binary_fill_holes, distance_transform_edt
from .features import rgb_to_lab
from .region_masks import mask_geometry
from .line_network import axial_difference


def color_name(lab):
    l, a, b = lab; chroma = float(np.hypot(a, b))
    if l < 30: return 'dark'
    if chroma < 16: return 'pale' if l > 65 else 'gray'
    if b > 20 and -20 < a < 25: return 'yellow-toned'
    if b < -10: return 'blue-toned'
    if a < -10: return 'green-toned'
    if a > 20: return 'red-toned'
    return 'muted'


def build_spatial(masks, attributes, domain, config):
    if not masks or not domain.any(): raise ValueError('Nonempty capture domain and proposals required')
    h, w = domain.shape; yy, xx = np.nonzero(domain); center = np.array([xx.mean(), yy.mean()])
    spans = np.array([xx.max() - xx.min() + 1, yy.max() - yy.min() + 1]); short = min(h, w)
    lookup = {r['id']: r for r in attributes}; nodes = []
    for rid, mask in masks.items():
        if mask.shape != domain.shape or (mask & ~domain).any(): raise ValueError('Proposal outside capture domain')
        g = mask_geometry(mask); ys, xs = np.nonzero(mask)
        if not len(xs): raise ValueError('Empty spatial proposal')
        centroid = np.array([xs.mean(), ys.mean()]); a = lookup[rid]; lab = a['mean_lab']
        label = a['label']; offset = (centroid - center) / spans
        nodes.append({'id': rid, 'label': label, 'mean_lab': lab, 'chroma': float(np.hypot(lab[1], lab[2])),
            'geometry': g, 'pixel_area': int(mask.sum()), 'area_fraction_of_domain': float(mask.sum() / domain.sum()),
            'centroid_pixels': centroid.tolist(), 'offset_from_domain_center': offset.tolist(),
            'contrast_from_domain_mean_delta_e76': a['contrast_from_domain_mean_delta_e76'],
            'area_moment': (mask.sum() / domain.sum() * offset).tolist(),
            'contrast_moment_unnormalized': (mask.sum() / domain.sum() * a['contrast_from_domain_mean_delta_e76'] * offset).tolist()})
    pairs = []; c = config['region_relations']
    for a, b in itertools.combinations(nodes, 2):
        ma, mb = masks[a['id']], masks[b['id']]; delta = (np.array(a['centroid_pixels']) - b['centroid_pixels']) / spans
        gap = float(distance_transform_edt(~ma)[mb].min())
        holes_a = binary_fill_holes(ma) & ~ma; holes_b = binary_fill_holes(mb) & ~mb
        pair = {'id': a['id'] + '--' + b['id'], 'region_ids': [a['id'], b['id']], 'centroid_delta_a_minus_b': delta.tolist(),
            'centroid_distance_shortside': float(np.linalg.norm(np.array(a['centroid_pixels']) - b['centroid_pixels']) / short),
            'nearest_gap_shortside': gap / short, 'near_adjacent': gap / short <= c['near_gap_shortside'],
            'touching_or_overlapping': gap <= 1.5, 'overlap_pixels': int((ma & mb).sum()),
            'area_ratio_a_over_b': a['pixel_area'] / b['pixel_area'],
            'aligned_centroid_x': bool(abs(delta[0]) <= c['centroid_alignment_fraction']),
            'aligned_centroid_y': bool(abs(delta[1]) <= c['centroid_alignment_fraction']),
            'shape_axis_difference_degrees': axial_difference(a['geometry'].get('principal_axis_degrees_clockwise_from_right', 0), b['geometry'].get('principal_axis_degrees_clockwise_from_right', 0)),
            'b_in_hole_of_a_fraction': float((holes_a & mb).sum() / mb.sum()),
            'a_in_hole_of_b_fraction': float((holes_b & ma).sum() / ma.sum()),
            'scope': 'Relations between mask proposals. Hole enclosure is topological mask enclosure, not depicted depth.'}
        pair['parallel_shape_axes'] = pair['shape_axis_difference_degrees'] <= c['axis_alignment_degrees']
        pair['similarly_sized'] = .8 <= pair['area_ratio_a_over_b'] <= 1.25
        pairs.append(pair)
    total_area = sum(n['area_fraction_of_domain'] for n in nodes)
    total_contrast = sum(n['area_fraction_of_domain'] * n['contrast_from_domain_mean_delta_e76'] for n in nodes)
    arrangement = {'id': 'distribution', 'area_centroid_offset': (np.sum([n['area_moment'] for n in nodes], axis=0) / total_area).tolist(),
        'contrast_centroid_offset': (np.sum([n['contrast_moment_unnormalized'] for n in nodes], axis=0) / total_contrast).tolist() if total_contrast > 1e-9 else None,
        'selected_proposal_area_sum_fraction': total_area,
        'overlap_pixels_counted_more_than_once': int(sum(m.sum() for m in masks.values()) - np.logical_or.reduce(list(masks.values())).sum()),
        'scope': 'Area and fixed color-contrast moments of selected proposals. Overlap is counted per proposal. Neither is calibrated perceptual weight, balance quality or eye movement.'}
    opposing = []
    for a, b in itertools.combinations(nodes, 2):
        x, y = a['contrast_moment_unnormalized'][0], b['contrast_moment_unnormalized'][0]
        if x * y < 0:
            opposing.append({'region_ids': [a['id'], b['id']], 'absolute_horizontal_moment_ratio': min(abs(x), abs(y)) / max(abs(x), abs(y)),
                'scope': 'Opposite horizontal contributions in the declared contrast-mass proxy, not established perceptual counterbalance.'})
    return {'nodes': nodes, 'pairs': pairs, 'distribution': arrangement, 'opposing_horizontal_contributions': opposing,
        'capture_center_pixels': center.tolist(), 'capture_spans_pixels': spans.tolist()}


def source_attributes(image, domain, source_regions):
    lab = rgb_to_lab(np.asarray(image, dtype=float) / 255); mean = lab[domain].mean(axis=0)
    return [{'id': r['id'], 'label': r['label'], 'mean_lab': r['color']['mean_lab'],
        'contrast_from_domain_mean_delta_e76': float(np.linalg.norm(np.asarray(r['color']['mean_lab']) - mean))} for r in source_regions]


def spatial_account(graph, network=None, links=None, side_fields=None):
    nodes = graph['nodes']; focus = min(nodes, key=lambda n: (n['pixel_area'], n['id']))
    other = max((n for n in nodes if n['id'] != focus['id']), key=lambda n: (n['pixel_area'], n['id']), default=None)
    if other is None: return {'id': 'A1', 'text': 'Too few proposed regions for an organizing account.', 'claims': [], 'status': 'unresolved', 'independent_review': 'not_obtained', 'origin': 'declared_spatial_descriptor_construction'}
    delta = (np.array(focus['centroid_pixels']) - other['centroid_pixels']) / graph['capture_spans_pixels']
    horizontal = 'left of' if delta[0] < -.03 else 'right of' if delta[0] > .03 else 'horizontally aligned with'
    vertical = 'above' if delta[1] < -.03 else 'below' if delta[1] > .03 else 'at a similar height to'
    ratio = other['pixel_area'] / focus['pixel_area']; ids = sorted([focus['id'], other['id']]); pid = '--'.join(ids)
    label = focus['label']; other_label = other['label']
    text = f'{label[:1].upper()+label[1:]} lies {horizontal} and {vertical} {other_label}; their centers are separated by {abs(delta[0])*100:.1f}% of the capture width horizontally and {abs(delta[1])*100:.1f}% of its height vertically. The latter covers {ratio:.1f} times its proposed area. '
    pair = next(p for p in graph['pairs'] if p['id'] == pid)
    overlap_pairs = [p for p in graph['pairs'] if focus['id'] in p['region_ids'] and p['overlap_pixels'] > 0]
    strongest_overlap = max(overlap_pairs, key=lambda p: p['overlap_pixels'], default=None)
    overlap_fraction = strongest_overlap['overlap_pixels'] / focus['pixel_area'] if strongest_overlap else 0
    if overlap_fraction > 0:
        overlap_other_id = next(rid for rid in strongest_overlap['region_ids'] if rid != focus['id'])
        overlap_other = next(n for n in nodes if n['id'] == overlap_other_id)
        text += f'It also overlaps {overlap_other["label"]} over {overlap_fraction*100:.1f}% of its own proposed area. '
    spatial_ids = list(dict.fromkeys([focus['id'] + ':position', other['id'] + ':position', pid + ':spatial'] + [p['id'] + ':spatial' for p in overlap_pairs]))
    claims = [{'kind': 'spatial_description', 'text': text.strip(), 'evidence_ids': spatial_ids}]
    if network is not None and network['segments']:
        contact = [l['segment_id'] for l in links or [] if l['region_id'] == focus['id']]
        addition = f'{len(contact)} straight-edge candidates run near the smaller region’s proposed boundary. ' if contact else 'No retained long straight-edge candidate is linked to the smaller region’s boundary. '
        text += addition
        claims.append({'kind': 'line_proxy_description', 'text': addition.strip(), 'evidence_ids': ['network'] + [focus['id'] + ':line_contacts']})
    focus_divisions = [s for s in side_fields or [] if any(focus['id'] in [p['negative_side_region'], p['positive_side_region']] for p in s['opposite_proposal_pairs'])]
    orthogonal = network is not None and network['axis_aligned_length_fraction'] is not None and network['axis_aligned_length_fraction'] >= .7 and len(network['segments']) >= 4 and bool(focus_divisions)
    hypothesis = ('One possible organizing account is that a largely horizontal-and-vertical edge network articulates unequal fields, giving the smaller mass a distinct place within the division.' if orthogonal else
        'One possible organizing account is that these unequal areas and their placement establish a relation between a smaller mass and a broader field.')
    if overlap_fraction > .05: hypothesis = 'This layout introduces overlap, so an account based on separate fields would need revision.'
    text += hypothesis
    claims.append({'kind': 'interpretive_hypothesis', 'text': hypothesis, 'evidence_ids': list(dict.fromkeys([pid + ':spatial', 'distribution'] + [p['id'] + ':spatial' for p in overlap_pairs] + (['network', 'line_field_divisions'] if orthogonal else [])))})
    return {'id': 'A1', 'text': text, 'claims': claims, 'focus_region_id': focus['id'], 'comparison_region_id': other['id'],
        'horizontal_relation': horizontal, 'vertical_relation': vertical, 'area_ratio_other_over_focus': ratio,
        'origin': 'declared_spatial_descriptor_construction', 'status': 'inspection_hypothesis', 'independent_review': 'not_obtained',
        'alternative': 'Line networks, small accents, unselected regions or depicted subjects may organize the image more strongly than this selected size/position relation.',
        'missing': 'Independent judgment of boundary correctness, particularity and explanatory usefulness. The size-based selection is not artistic importance.'}


def evidence_for(graph, network=None, links=None, side_fields=None):
    rows = [{'id': n['id'] + ':position', 'kind': 'spatial_measurement', 'facts': n} for n in graph['nodes']]
    rows += [{'id': p['id'] + ':spatial', 'kind': 'spatial_measurement', 'facts': p} for p in graph['pairs']]
    rows.append({'id': 'distribution', 'kind': 'declared_contrast_mass_proxy', 'facts': graph['distribution']})
    if network is not None:
        rows.append({'id': 'network', 'kind': 'image_edge_proxy', 'facts': network})
        rows.append({'id': 'line_field_divisions', 'kind': 'opposite_side_mask_samples', 'facts': side_fields or []})
        rows += [{'id': n['id'] + ':line_contacts', 'kind': 'geometric_boundary_proximity', 'facts': [x for x in links or [] if x['region_id'] == n['id']]} for n in graph['nodes']]
    return rows


def diagram_conditions(masks, attributes, domain, config):
    h, w = domain.shape; smallest = min(masks, key=lambda rid: (int(masks[rid].sum()), rid))
    cases = [{'id': 'identity', 'label': 'Original region diagram', 'status': 'executed', 'masks': {k: v.copy() for k, v in masks.items()}, 'domain': domain.copy(), 'intervention': 'No change.'},
        {'id': 'reflect_positions', 'label': 'Reflected positions', 'status': 'executed', 'masks': {k: v[:, ::-1].copy() for k, v in masks.items()}, 'domain': domain[:, ::-1].copy(),
            'intervention': 'Reflect every region and the capture domain horizontally. Per-region color attributes stay fixed; no painting image is generated.'}]
    target = masks[smallest]; ys, xs = np.nonzero(target)
    proposed = round(w * config['controls']['diagram_position_shift_fraction']) * (1 if xs.mean() < (w - 1) / 2 else -1)
    accepted = None
    for factor in [1, .75, .5, .25]:
        dx = round(proposed * factor)
        if dx == 0 or xs.min() + dx < 0 or xs.max() + dx >= w: continue
        shifted = np.zeros_like(target); shifted[ys, xs + dx] = True
        if not (shifted & ~domain).any(): accepted = (dx, shifted); break
    shifted_masks = {k: v.copy() for k, v in masks.items()}
    if accepted: shifted_masks[smallest] = accepted[1]
    cases.append({'id': 'shift_smallest', 'label': 'Shift the smallest proposal', 'status': 'executed' if accepted else 'unavailable',
        'masks': shifted_masks, 'domain': domain.copy(), 'target_region_id': smallest, 'accepted_dx_pixels': accepted[0] if accepted else None,
        'intervention': 'Translate the smallest mask toward the opposite horizontal side, reducing the step if capture limits require. Overlaps are measured; source color attributes stay fixed.'})
    scale = config['controls']['diagram_area_scale']; cx, cy = float(xs.mean()), float(ys.mean())
    matrix = np.array([[scale, 0, cx * (1 - scale)], [0, scale, cy * (1 - scale)]])
    shrunk = cv2.warpAffine(target.astype('uint8'), matrix, (w, h), flags=cv2.INTER_NEAREST, borderValue=0) > 0
    shrunk_masks = {k: v.copy() for k, v in masks.items()}; shrunk_masks[smallest] = shrunk
    okay = bool(shrunk.any() and not (shrunk & ~domain).any() and shrunk.sum() < target.sum())
    cases.append({'id': 'shrink_smallest', 'label': 'Reduce the smallest proposal', 'status': 'executed' if okay else 'unavailable', 'masks': shrunk_masks if okay else {k: v.copy() for k, v in masks.items()},
        'domain': domain.copy(), 'target_region_id': smallest, 'linear_scale': scale,
        'intervention': 'Scale the smallest mask about its centroid with nearest-neighbor resampling. This changes area; it does not simulate physical repainting.'})
    for case in cases:
        if case['status'] == 'executed':
            case['graph'] = build_spatial(case['masks'], attributes, case['domain'], config)
            case['account'] = spatial_account(case['graph'])
    return cases
