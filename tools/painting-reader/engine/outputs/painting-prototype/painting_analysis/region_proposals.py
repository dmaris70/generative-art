"""Multiscale proposal comparison; no object identity or significance is inferred.

The graph method approximates recursive normalized cuts on adjacent SLIC regions.
It is not a reproduction of Shi and Malik's full pixel affinity construction.
"""
from __future__ import annotations
import cv2
import numpy as np
from scipy.linalg import eigh
from skimage.segmentation import slic
from .features import rgb_to_lab


def mask_iou(a, b):
    union = int((a | b).sum())
    return float((a & b).sum() / union) if union else 0.0


def extent_label(mask):
    area = float(mask.mean())
    return 'small' if area < .03 else 'medium' if area < .20 else 'large'


def containment_links(masks, minimum_containment=.95, maximum_area_ratio=.90):
    """Pixel containment DAG, never a certified semantic part/whole hierarchy."""
    links = []
    for child, a in masks.items():
        n = int(a.sum())
        if n == 0:
            continue
        parents = []
        for parent, b in masks.items():
            m = int(b.sum())
            if child == parent or m == 0 or n / m > maximum_area_ratio:
                continue
            overlap = float((a & b).sum() / n)
            if overlap >= minimum_containment:
                parents.append((m, parent, overlap))
        # Smallest enclosing proposal gives a readable local parent relation.
        if parents:
            _, parent, overlap = min(parents)
            links.append({'child': child, 'parent': parent, 'child_coverage': overlap,
                          'scope': 'approximate pixel containment, not semantic part identity'})
    return links


def normalized_cut_split(weights, pixel_counts, minimum_pixels):
    """Return the best sampled split of the second normalized eigenvector."""
    n = len(weights)
    if n < 4 or np.any(~np.isfinite(weights)) or np.any(weights < 0):
        return None
    if not np.allclose(weights, weights.T):
        raise ValueError('Affinity must be symmetric')
    degree = weights.sum(axis=1)
    if np.any(degree <= 0):
        return None
    inv = 1 / np.sqrt(degree)
    laplacian = np.eye(n) - inv[:, None] * weights * inv[None, :]
    _, vectors = eigh(laplacian, subset_by_index=[0, 1], driver='evr')
    vector = inv * vectors[:, 1]
    # Fix eigenvector sign so equivalent solutions receive reproducible identities.
    if vector[np.argmax(np.abs(vector))] < 0:
        vector *= -1
    best = None
    for threshold in np.unique(np.quantile(vector, np.linspace(.05, .95, 19))):
        left = vector <= threshold
        if min(int(left.sum()), int((~left).sum())) < 2:
            continue
        if min(pixel_counts[left].sum(), pixel_counts[~left].sum()) < minimum_pixels:
            continue
        cut = weights[np.ix_(left, ~left)].sum()
        score = float(cut / degree[left].sum() + cut / degree[~left].sum())
        key = (score, abs(float(pixel_counts[left].sum() - pixel_counts[~left].sum())), float(threshold))
        if best is None or key < best[0]:
            best = (key, left)
    return None if best is None else (best[1], best[0][0])


def boundary_hierarchy(image, config):
    rgb = np.asarray(image, dtype=float) / 255
    lab = rgb_to_lab(rgb)
    labels = slic(rgb, n_segments=config['superpixels'], compactness=config['compactness'],
                  sigma=config['sigma'], start_label=0, enforce_connectivity=True, channel_axis=-1)
    ids, labels = np.unique(labels, return_inverse=True)
    labels = labels.reshape(rgb.shape[:2])
    n = len(ids)
    counts = np.bincount(labels.ravel(), minlength=n)
    means = np.array([np.bincount(labels.ravel(), weights=lab[..., c].ravel(), minlength=n) / counts for c in range(3)]).T
    contact = np.zeros((n, n), float)
    boundary = np.zeros((n, n), float)
    for a, b, ca, cb in [(labels[:, :-1], labels[:, 1:], lab[:, :-1], lab[:, 1:]),
                         (labels[:-1], labels[1:], lab[:-1], lab[1:])]:
        different = a != b
        ai, bi = a[different], b[different]
        delta = np.linalg.norm(ca[different] - cb[different], axis=1)
        np.add.at(contact, (ai, bi), 1)
        np.add.at(contact, (bi, ai), 1)
        np.add.at(boundary, (ai, bi), delta)
        np.add.at(boundary, (bi, ai), delta)
    valid = contact > 0
    edge_mean = np.divide(boundary, contact, out=np.zeros_like(boundary), where=valid)
    diff = np.linalg.norm(means[:, None] - means[None, :], axis=-1)
    perimeter = np.maximum(contact.sum(axis=1), 1)
    weights = contact / np.sqrt(perimeter[:, None] * perimeter[None, :])
    weights *= np.exp(-.5 * (diff / config['color_sigma_Lab']) ** 2 - .5 * (edge_mean / config['boundary_sigma_Lab']) ** 2)
    # Positive floor on actual contacts preserves graph connectivity numerically.
    weights[valid] = np.maximum(weights[valid], 1e-9)
    nodes = {'N0': {'superpixel_ids': list(range(n)), 'parent': None, 'depth': 0}}
    leaves = ['N0']
    snapshots, split_log, blocked = {}, [], set()
    target = max(config['region_counts'])
    while len(leaves) < target:
        choices = sorted((x for x in leaves if x not in blocked),
                         key=lambda x: (-counts[nodes[x]['superpixel_ids']].sum(), x))
        if not choices:
            break
        parent = choices[0]
        subset = np.array(nodes[parent]['superpixel_ids'])
        split = normalized_cut_split(weights[np.ix_(subset, subset)], counts[subset],
                                     max(20, labels.size * config['minimum_area_fraction']))
        if split is None:
            blocked.add(parent)
            continue
        left, cost = split
        children = []
        for chosen in [left, ~left]:
            child = 'N' + str(len(nodes))
            nodes[child] = {'superpixel_ids': subset[chosen].tolist(), 'parent': parent,
                            'depth': nodes[parent]['depth'] + 1}
            children.append(child)
        nodes[parent]['children'] = children
        split_log.append({'parent': parent, 'children': children, 'normalized_cut': cost})
        leaves.remove(parent)
        leaves.extend(children)
        if len(leaves) in config['region_counts']:
            snapshots[str(len(leaves))] = list(leaves)
    if str(len(leaves)) not in snapshots:
        snapshots[str(len(leaves))] = list(leaves)
    masks = {key: np.isin(labels, node['superpixel_ids']) for key, node in nodes.items()}
    return {'superpixel_count': n, 'nodes': nodes, 'snapshots': snapshots, 'splits': split_log,
            'scope': 'Recursive normalized-cut approximation on an adjacent SLIC graph; scale counts are inspection settings, not true compositional levels.'}, masks, labels


def proposal_to_seed_spec(mask, rid):
    """Explicit bridge to the unchanged three-condition GrabCut measurement pipeline.

    Largest connected component seeds the adapter; raw masks remain separately saved.
    Any loss of disconnected parts is measured and disclosed, not silently hidden.
    """
    mask = np.asarray(mask, dtype=bool)
    n, connected, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), 8)
    if n < 2:
        raise ValueError('Empty proposal')
    label = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    component = connected == label
    height, width = mask.shape
    ys, xs = np.nonzero(component)
    contours, _ = cv2.findContours(component.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    contour = max(contours, key=cv2.contourArea)
    polygon = cv2.approxPolyDP(contour, max(.5, .002 * cv2.arcLength(contour, True)), True)[:, 0, :]
    if len(polygon) < 3:
        raise ValueError('Proposal has no usable polygon')
    distance = cv2.distanceTransform(component.astype(np.uint8), cv2.DIST_L2, 5)
    y, x = np.unravel_index(np.argmax(distance), distance.shape)
    if distance[y, x] < max(3, round(min(width, height) * .008) + 1):
        raise ValueError('Proposal too narrow for unchanged seed-radius conditions')
    outside = cv2.distanceTransform((~component).astype(np.uint8), cv2.DIST_L2, 5)
    by, bx = np.unravel_index(np.argmax(outside), outside.shape)
    if outside[by, bx] < 4:
        raise ValueError('Insufficient background for common refinement')
    margin = .02
    spec = {'id': rid, 'label': 'proposal adapted for common refinement', 'scope': 'Largest connected component of raw proposal; full raw mask retained separately.',
            'roi': [max(0., xs.min() / width - margin), max(0., ys.min() / height - margin), min(1., (xs.max()+1) / width + margin), min(1., (ys.max()+1) / height + margin)],
            'initial_polygon': [[float(px / (width-1)), float(py / (height-1))] for px, py in polygon],
            'foreground_points': [[float(x / (width-1)), float(y / (height-1))]],
            'background_points': [[float(bx / (width-1)), float(by / (height-1))]]}
    return spec, {'largest_component_fraction_of_raw': float(component.sum() / mask.sum()),
                  'raw_pixels': int(mask.sum()), 'component_pixels': int(component.sum())}
