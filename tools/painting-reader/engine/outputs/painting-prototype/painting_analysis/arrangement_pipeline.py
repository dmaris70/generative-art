"""Source-bound arrangement analysis and declared sensitivity experiments."""
import copy
from datetime import datetime, timezone
import importlib.metadata
import hashlib
import json
import math
from pathlib import Path
import numpy as np
from PIL import Image
from jsonschema import Draft202012Validator
from .reasoning import ROOT, sha, dump, code_digest
from .assessment import runtime_snapshot, finite_values
from .line_network import detect_segments, junction_candidates, connect_regions, opposite_side_fields, line_overlay, match_segments
from .spatial_arrangement import build_spatial, source_attributes, spatial_account, evidence_for, diagram_conditions, color_name

VERSION = '0.11.0'


def analyze_arrangement(image, domain, masks, attributes, protocol):
    network = detect_segments(image, domain, protocol)
    junctions = junction_candidates(network['segments'], domain, protocol)
    links = connect_regions(network, masks, image.size, protocol)
    sides = opposite_side_fields(network, masks, image.size, protocol)
    graph = build_spatial(masks, attributes, domain, protocol)
    return {'network': network, 'junctions': junctions, 'line_region_links': links, 'line_side_fields': sides,
        'spatial_graph': graph, 'evidence': evidence_for(graph, network, links, sides),
        'account': spatial_account(graph, network, links, sides),
        'layout_only_account': spatial_account(graph)}


def junction_agreement(a, b, size_a, size_b, config):
    scale = np.array([(size_a[0]-1)/(size_b[0]-1), (size_a[1]-1)/(size_b[1]-1)])
    candidates = []
    for x in a:
        for y in b:
            distance = float(np.linalg.norm(np.asarray(x['point_pixels']) - np.asarray(y['point_pixels']) * scale) / min(size_a))
            if distance <= config['controls']['junction_match_shortside']: candidates.append((distance, x['id'], y['id'], x['kind'] == y['kind']))
    matches = []; used_a = set(); used_b = set()
    for distance, x, y, same_kind in sorted(candidates):
        if x in used_a or y in used_b: continue
        used_a.add(x); used_b.add(y); matches.append({'full_id': x, 'secondary_id': y, 'distance_shortside': distance, 'same_kind': same_kind})
    return {'matches': matches, 'full_count': len(a), 'secondary_count': len(b),
        'full_matched_fraction': len(matches)/len(a) if a else None,
        'scope': 'Geometric candidate repeatability, not annotated junction accuracy.'}


def pixel_controls(image, domain, baseline, protocol):
    small = image.copy(); small.thumbnail((protocol['controls']['secondary_long_side'],)*2, Image.Resampling.LANCZOS)
    sm_domain = np.asarray(Image.fromarray(domain).resize(small.size, Image.Resampling.NEAREST), dtype=bool)
    net = detect_segments(small, sm_domain, protocol); junctions = junction_candidates(net['segments'], sm_domain, protocol)
    reflected = image.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    ref_net = detect_segments(reflected, domain[:, ::-1].copy(), protocol)
    mapped = copy.deepcopy(ref_net)
    for row in mapped['segments']:
        p = np.asarray(row['endpoints_pixels']); p[:, 0] = image.width - 1 - p[:, 0]
        row['endpoints_pixels'] = p.tolist(); d = p[1]-p[0]; row['angle_degrees'] = math.degrees(math.atan2(d[1], d[0])) % 180
    return {'resolution': {'size': list(small.size), 'network': net, 'junctions': junctions,
        'segment_agreement': match_segments(baseline['network'], net, image.size, small.size, protocol),
        'junction_agreement': junction_agreement(baseline['junctions'], junctions, image.size, small.size, protocol)},
        'reflection': {'network': ref_net, 'mapped_back_network': mapped,
            'segment_agreement': match_segments(baseline['network'], mapped, image.size, image.size, protocol),
            'scope': 'The detector reruns on reflected pixels and capture. This tests geometric repeatability only; no language model or human response is tested.'},
        'length_thresholds': [{'minimum_length_shortside': threshold, 'network': detect_segments(image, domain, protocol, threshold)} for threshold in protocol['line_detector']['length_controls']]}


def layout_diagnostics(cases):
    baseline = cases[0]['graph']; original_account = cases[0]['account']; by = {n['id']: n for n in baseline['nodes']}
    pairs = {p['id']: p for p in baseline['pairs']}; rows = []
    for case in cases:
        if case['status'] != 'executed':
            rows.append({'condition': case['id'], 'status': 'unavailable', 'checks': {}, 'account_changed': None}); continue
        graph = case['graph']; nodes = {n['id']: n for n in graph['nodes']}; checks = {}
        if case['id'] == 'identity': checks = {'same_spatial_graph': graph == baseline, 'same_account': case['account'] == original_account}
        elif case['id'] == 'reflect_positions':
            checks['areas_preserved'] = all(n['pixel_area'] == by[rid]['pixel_area'] for rid, n in nodes.items())
            checks['horizontal_offsets_reversed'] = all(np.allclose(n['offset_from_domain_center'], [-by[rid]['offset_from_domain_center'][0], by[rid]['offset_from_domain_center'][1]], atol=1e-12) for rid, n in nodes.items())
            checks['pair_distances_preserved'] = all(np.isclose(p['centroid_distance_shortside'], pairs[p['id']]['centroid_distance_shortside'], atol=1e-12) and np.isclose(p['nearest_gap_shortside'], pairs[p['id']]['nearest_gap_shortside'], atol=1e-12) for p in graph['pairs'])
            old = original_account.get('horizontal_relation'); new = case['account'].get('horizontal_relation')
            checks['account_horizontal_relation_reversed'] = new == {'left of': 'right of', 'right of': 'left of', 'horizontally aligned with': 'horizontally aligned with'}.get(old)
        elif case['id'] == 'shift_smallest':
            rid = case['target_region_id']; checks = {'areas_preserved': all(n['pixel_area'] == by[k]['pixel_area'] for k, n in nodes.items()),
                'target_position_changed': not np.allclose(nodes[rid]['centroid_pixels'], by[rid]['centroid_pixels']),
                'target_shift_matches_record': np.allclose(np.asarray(nodes[rid]['centroid_pixels']) - by[rid]['centroid_pixels'], [case['accepted_dx_pixels'], 0])}
        elif case['id'] == 'shrink_smallest':
            rid = case['target_region_id']; checks = {'target_area_reduced': nodes[rid]['pixel_area'] < by[rid]['pixel_area'],
                'other_areas_preserved': all(n['pixel_area'] == by[k]['pixel_area'] for k, n in nodes.items() if k != rid)}
        if case['id'] != 'identity': checks['fixed_color_attributes_preserved'] = all(n['mean_lab'] == by[k]['mean_lab'] for k, n in nodes.items())
        checks = {k: bool(v) for k, v in checks.items()}
        rows.append({'condition': case['id'], 'status': 'passed' if all(checks.values()) else 'failed', 'checks': checks,
            'account_changed': case['account']['text'] != original_account['text'],
            'overlap_pixels_counted_more_than_once': graph['distribution']['overlap_pixels_counted_more_than_once']})
    return {'conditions': rows, 'scope': 'Declared graph interventions and deterministic text construction. Passing checks establish mechanical sensitivity/invariance, not improved interpretation or perceptual validity.'}


def validate_arrangement(result):
    finite_values(result)
    Draft202012Validator(json.loads((ROOT/'schema/arrangement.schema.json').read_text())).validate(result)
    def check_analysis(analysis):
        lines = [s['id'] for s in analysis['network']['segments']]; line_ids = set(lines)
        if len(lines) != len(line_ids): raise ValueError('Duplicate line ID')
        evidence = analysis['evidence']; ids = [e['id'] for e in evidence]
        if len(set(ids)) != len(ids): raise ValueError('Duplicate evidence ID')
        for account in [analysis['account'], analysis['layout_only_account']]:
            if account['independent_review'] != 'not_obtained' or account['origin'] != 'declared_spatial_descriptor_construction': raise ValueError('Unjustified interpretation approval')
            for claim in account['claims']:
                if not claim['evidence_ids'] or not set(claim['evidence_ids']) <= set(ids): raise ValueError('Dangling spatial evidence')
        region_ids = {n['id'] for n in analysis['spatial_graph']['nodes']}
        for j in analysis['junctions']:
            if not set(j['segment_ids']) <= line_ids: raise ValueError('Dangling junction line')
        for link in analysis['line_region_links']:
            if link['region_id'] not in region_ids or link['segment_id'] not in line_ids: raise ValueError('Dangling region/line link')
    check_analysis(result['analysis'])
    conditions = result['diagram_experiments']
    if [x['id'] for x in conditions] != ['identity', 'reflect_positions', 'shift_smallest', 'shrink_smallest']: raise ValueError('Missing layout condition')
    for condition in conditions:
        if condition['status'] == 'executed':
            ids = {x['id'] for x in condition['evidence']}
            for claim in condition['account']['claims']:
                if not set(claim['evidence_ids']) <= ids: raise ValueError('Dangling experiment evidence')
            if condition['account']['independent_review'] != 'not_obtained': raise ValueError('Unjustified experiment review')
    return {'structure': 'passed', 'evidence_references': 'passed', 'independent_review': 'not_obtained'}


def compute(image, domain, masks, attributes, protocol):
    analysis = analyze_arrangement(image, domain, masks, attributes, protocol)
    cases = diagram_conditions(masks, attributes, domain, protocol)
    for case in cases:
        if case['status'] == 'executed': case['evidence'] = evidence_for(case['graph'])
    diagnostics = layout_diagnostics(cases)
    return analysis, pixel_controls(image, domain, analysis, protocol), cases, diagnostics


def run_arrangement(source_dir, output, protocol, progress=None):
    source_dir = Path(source_dir).resolve(); output = Path(output); progress = progress or (lambda _: None)
    if (output/'arrangement.json').exists(): raise ValueError('Completed arrangement analysis is immutable')
    if not source_dir.is_relative_to(ROOT.resolve()): raise ValueError('Source must be inside the project')
    source_file = source_dir/'relations.json'; source = json.loads(source_file.read_text())
    image = Image.open(source_dir/'image.png').convert('RGB'); domain = np.asarray(Image.open(source_dir/'domain.png'), dtype=bool)
    masks = {r['id']: np.asarray(Image.open(source_dir/(r['id']+'-consensus.png')), dtype=bool) for r in source['analysis']['regions']}
    if not masks: raise ValueError('No usable source proposals')
    attributes = source_attributes(image, domain, source['analysis']['regions'])
    for a in attributes:
        if source['work_id'] != 'met-436535':
            a['label'] = color_name(a['mean_lab'])+' region '+a['id']
    runtime = runtime_snapshot(output); dump(output/'inputs/protocol.json', protocol)
    files = [source_file, source_dir/'image.png', source_dir/'domain.png'] + [source_dir/(rid+'-consensus.png') for rid in masks]
    binding = {str(p.relative_to(ROOT.resolve())): sha(p) for p in files}
    for p in files: (output/'inputs'/p.name).write_bytes(p.read_bytes())
    image.save(output/'image.png'); dump(output/'inputs/attributes.json', attributes)
    progress('Detecting edges, near-junctions, spatial relations and controls')
    analysis, controls, cases, diagnostics = compute(image, domain, masks, attributes, protocol)
    line_overlay(image, analysis['network'], analysis['junctions']).save(output/'lines.png')
    from .arrangement_report import diagram_svg, render_arrangement
    for case in cases:
        (output/(case['id']+'.svg')).write_text(diagram_svg(case, image.size))
        if case['status'] == 'executed':
            for rid, mask in case['masks'].items(): Image.fromarray(mask.astype('uint8')*255).save(output/(case['id']+'-'+rid+'.png'))
        Image.fromarray(case['domain'].astype('uint8')*255).save(output/(case['id']+'-domain.png'))
    serial_cases = [{k: v for k, v in case.items() if k not in ['masks', 'domain']} for case in cases]
    result = {'version': VERSION, 'artifact_kind': 'spatial_arrangement', 'work_id': source['work_id'], 'identity': source['identity'],
        'generated_at': datetime.now(timezone.utc).isoformat(), 'partition': 'development_method_extension',
        'binding': {'code_sha256': runtime, 'source_files': binding, 'protocol_sha256': sha(output/'inputs/protocol.json'), 'attributes_sha256': sha(output/'inputs/attributes.json')},
        'image_size': list(image.size), 'source_region_caveats': [{'id': r['id'], 'scope': r['annotation_scope'], 'boundary': r['boundary']} for r in source['analysis']['regions']],
        'analysis': analysis, 'pixel_controls': controls, 'diagram_experiments': serial_cases, 'layout_diagnostics': diagnostics,
        'runtime': {name: importlib.metadata.version(name) for name in ['numpy', 'Pillow', 'opencv-python', 'scipy']},
        'limits': ['Source masks and capture boundaries remain proposals; manual extent errors are not quantified.',
            'Long straight edges omit curved structure, small accents and unselected fields; near-junctions are geometric candidates.',
            'Area and contrast moments are declared proxies, not calibrated perceptual weight, gaze, emotional effect or artistic quality.',
            'Layout experiments manipulate region diagrams with fixed color attributes; they do not establish image-level reasoning, artistic intention or human-perception effects.',
            'The short account is a declared descriptor construction; independent explanatory usefulness has not been evaluated.']}
    validate_arrangement(result)
    html = render_arrangement(result, output)
    if code_digest() != runtime: raise RuntimeError('Sources changed during analysis')
    dump(output/'validation.json', {'structure': 'passed', 'independent_review': 'not_obtained'})
    result_digest = hashlib.sha256((json.dumps(result, indent=2, ensure_ascii=False, allow_nan=False)+'\n').encode()).hexdigest()
    dump(output/'review-worksheet.json', {'artifact_sha256': result_digest, 'reviewer': None, 'status': 'not_obtained',
        'boundary_correctness': None, 'line_and_junction_correctness': None, 'relational_particularity': None, 'explanatory_usefulness': None, 'comment': None})
    (output/'report.html').write_text(html)
    dump(output/'arrangement.json', result)
    return result
