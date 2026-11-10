"""Preserve geometry, alternative masks and tentative identities as separate evidence.

No semantic winner is chosen. Pixel overlap between category proposals is an
ambiguity to inspect, not proof that two depicted objects contradict each other.
"""
from __future__ import annotations
import copy,hashlib,json,math
import numpy as np
from .automatic_regions import describe_mask,measured_relations

VERSION='region-hypotheses-0.1'
def digest(value):return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False).encode()).hexdigest()
def mask_digest(mask):
    a=np.asarray(mask)
    if a.ndim!=2 or a.dtype!=bool:raise ValueError('Two-dimensional boolean mask required')
    return hashlib.sha256(json.dumps(list(a.shape),separators=(',',':')).encode()+b'\0'+np.packbits(a.ravel()).tobytes()).hexdigest()

def build_graph(rgb,image_sha256,candidates,masks):
    rgb=np.asarray(rgb)
    if rgb.dtype!=np.uint8 or rgb.ndim!=3 or rgb.shape[2]!=3:raise ValueError('RGB uint8 image required')
    if len(image_sha256)!=64 or any(c not in '0123456789abcdef' for c in image_sha256):raise ValueError('SHA256 image identity required')
    if len({c['id'] for c in candidates})!=len(candidates):raise ValueError('Duplicate hypothesis ID')
    if set(masks)!={c['id'] for c in candidates}:raise ValueError('Every candidate must retain exactly one mask')
    before=copy.deepcopy(candidates);regions={};geometry_masks={};hypotheses=[];groups={}
    def geometry(a,origin):
        if a.shape!=rgb.shape[:2]:raise ValueError('Mask uses another image grid')
        sha=mask_digest(a);rid='R-'+digest({'image':image_sha256,'mask':sha})[:20]
        if rid not in regions:
            desc=describe_mask(rgb,a,image_sha256,rid,'retained_proposal_pixels') if a.any() else None
            regions[rid]={'id':rid,'image_sha256':image_sha256,'mask_pixel_sha256':sha,'descriptor':desc,'origins':[],
                'empty':not bool(a.any()),'semantic_status':'unresolved','scope_kind':'unresolved'}
            geometry_masks[rid]=a.copy()
        elif not np.array_equal(geometry_masks[rid],a):raise ValueError('Geometry identifier collision')
        regions[rid]['origins'].append(origin);return rid
    whole=geometry(np.ones(rgb.shape[:2],bool),{'kind':'whole_reproduction'})
    for candidate in sorted(candidates,key=lambda c:c['id']):
        c=copy.deepcopy(candidate);a=np.asarray(masks[c['id']]);mask_digest(a)
        if not isinstance(c['label'],str) or not c['label'].strip():raise ValueError('Proposed query label required')
        if not isinstance(c['proposal_group'],str) or not c['proposal_group']:raise ValueError('Proposal group required')
        if c['detector_score'] is not None and not math.isfinite(c['detector_score']):raise ValueError('Nonfinite diagnostic score')
        rid=geometry(a,{'kind':'native_candidate','candidate_id':c['id'],'mask_file_sha256':c['mask_file_sha256']})
        h={**c,'region_id':rid,'kind':'category_and_boundary_hypothesis','identity_verified':False,'boundary_verified':False,
            'score_meaning':'Model diagnostic, not a calibrated probability or cross-query semantic ranking.'}
        hypotheses.append(h)
        group=groups.setdefault(c['proposal_group'],{'id':c['proposal_group'],'candidate_ids':[],'inspection_default':None})
        group['candidate_ids'].append(c['id'])
        if c['inspection_default']:
            if group['inspection_default'] is not None:raise ValueError('Multiple inspection defaults in one native proposal group')
            if not a.any():raise ValueError('An empty mask cannot be an inspection default')
            group['inspection_default']=c['id']
    defaults=[h for h in hypotheses if h['inspection_default']]
    complements=[]
    for rid in sorted({h['region_id'] for h in defaults}):
        comp=geometry(~geometry_masks[rid],{'kind':'pixel_complement','of_region':rid})
        complements.append({'region_id':rid,'complement_region_id':comp,'meaning':'Other reproduction pixels; not verified background or negative space.'})
    selected=sorted({whole,*[h['region_id'] for h in defaults],*[c['complement_region_id'] for c in complements]})
    selected=[rid for rid in selected if not regions[rid]['empty']]
    descriptors=[r['descriptor'] for r in regions.values() if r['descriptor'] is not None]
    relations=measured_relations(descriptors,geometry_masks,selected)
    lookup={frozenset(r['participant_ids']):r for r in relations};overlaps=[]
    for i,a in enumerate(defaults):
        for b in defaults[i+1:]:
            if a['label']==b['label']:continue
            if a['region_id']==b['region_id']:
                pixels=regions[a['region_id']]['descriptor']['pixel_count'];relation_id=None
            else:
                relation=lookup[frozenset([a['region_id'],b['region_id']])];pixels=relation['overlap_pixels'];relation_id=relation['id']
            if pixels:
                overlaps.append({'a':a['id'],'b':b['id'],'region_ids':[a['region_id'],b['region_id']],
                    'overlap_pixels':pixels,'relation_id':relation_id,'status':'different_query_labels_share_pixels',
                    'identity_conflict_established':False,'winner':None})
    for region in regions.values():region['origins'].sort(key=lambda x:json.dumps(x,sort_keys=True))
    graph={'version':VERSION,'image_sha256':image_sha256,'size':[rgb.shape[1],rgb.shape[0]],'whole_region_id':whole,
        'regions':sorted(regions.values(),key=lambda r:r['id']),'hypotheses':hypotheses,'proposal_groups':sorted(groups.values(),key=lambda g:g['id']),
        'complements':complements,'relations':relations,'relation_scope':'Whole image, nonempty inspection defaults and their complements. Alternative masks remain retained; pair measurements can be requested explicitly.',
        'cross_label_overlaps':overlaps,'semantic_winners':[],
        'limits':['All native candidates are retained, including empty masks and exact pixel duplicates with different labels.',
            'Equal geometry does not establish equal meaning. Containment is not a verified part/group hierarchy. Different labels may describe compatible parts, objects or scales.',
            'Inspection defaults are native mask-score choices, never semantic approval. No hypothesis is deleted because another score is higher.',
            'CIELAB values assume the supplied RGB pixels are sRGB; uncalibrated reproductions do not establish paint color, pigment, lighting or atmosphere.',
            'Original labels remain data. No historical identity, intention, affect or physical depth is inferred.'],
        'independent_validation':False,'semantic_approval':False}
    assert candidates==before
    graph['sha256']=digest(graph)
    return graph,geometry_masks

def verify_graph(graph,masks):
    if graph.get('sha256')!=digest({k:v for k,v in graph.items() if k!='sha256'}):raise ValueError('Graph changed after construction')
    regions={r['id']:r for r in graph['regions']}
    if set(regions)!=set(masks):raise ValueError('Missing or extra geometry mask')
    for rid,r in regions.items():
        if mask_digest(masks[rid])!=r['mask_pixel_sha256']:raise ValueError('Mask pixels changed')
    return regions

def relation_for(graph,masks,a,b):
    regions=verify_graph(graph,masks)
    if a==b:raise ValueError('Choose two distinct pixel regions')
    if a not in regions or b not in regions:raise ValueError('Unknown region')
    if regions[a]['empty'] or regions[b]['empty']:raise ValueError('An empty mask has no spatial/color comparison')
    pair=measured_relations([regions[a]['descriptor'],regions[b]['descriptor']],masks,[a,b])[0]
    pair['id']='REL-'+digest({'graph':graph['sha256'],'a':a,'b':b})[:20]
    return pair

def observation_bundle(graph,masks,region_ids):
    """Adapter consumed by the existing automatic_reading_tasks.observations_request.

    Use neutral region names. Keep every candidate label and competing overlap
    as an attributed source, including hypotheses outside the selected scope.
    """
    regions=verify_graph(graph,masks)
    if len(set(region_ids))!=len(region_ids) or len(region_ids)<3:raise ValueError('At least three distinct pixel scopes required by the existing reading stage')
    if any(rid not in regions or regions[rid]['empty'] for rid in region_ids):raise ValueError('Nonempty known regions required')
    labels={rid:'selected pixel region '+rid for rid in region_ids};sources=[]
    hypotheses={h['id']:h for h in graph['hypotheses']}
    for rid in region_ids:
        d=regions[rid]['descriptor'];lab=d['mean_lab_d65'];cent=d['centroid_normalized']
        sources.append({'id':'E_'+rid,'region_ids':[rid],'kind':'pixel_measurement','image_sha256':graph['image_sha256'],'mask_sha256':d['mask_sha256'],
            'text':f'{rid}: retained pixels occupy {100*d["area_fraction"]:.2f}% of the reproduction; mean CIELAB D65 under an sRGB assumption = ({lab[0]:.2f},{lab[1]:.2f},{lab[2]:.2f}); centroid = ({cent[0]:.3f},{cent[1]:.3f}) from top-left. These are pixel-scope measurements, not object identity, materials or emotion.'})
        own=[h for h in graph['hypotheses'] if h['region_id']==rid]
        related=[]
        for edge in graph['cross_label_overlaps']:
            if rid in edge['region_ids']:
                for key in ['a','b']:
                    if hypotheses[edge[key]]['region_id']!=rid:related.append(hypotheses[edge[key]])
        related={h['id']:h for h in related}
        sources.append({'id':'H_'+rid,'region_ids':[rid],'kind':'unresolved_identity_proposals',
            'hypothesis_ids':[h['id'] for h in own],'overlapping_hypothesis_ids':sorted(related),
            'text':f'{rid}: attached model query labels are {json.dumps(sorted({h["label"] for h in own}))}; other overlapping default-mask query labels are {json.dumps(sorted({h["label"] for h in related.values()}))}. All are unverified hypotheses; no category has won. Do not convert any query label into an established object. Overlap alone does not establish incompatibility or depicted occlusion.'})
    for i,a in enumerate(region_ids):
        for b in region_ids[i+1:]:
            r=relation_for(graph,masks,a,b);dx,dy=r['centroid_a_minus_b_normalized'];dl=r['mean_lab_a_minus_b'][0]
            sources.append({'id':r['id'],'region_ids':[a,b],'kind':'pixel_relationship','relation':r,
                'text':f'{a} minus {b}: mean L* difference {dl:.2f}; centroid displacement ({dx:.3f},{dy:.3f}), x right and y down; {r["overlap_pixels"]} shared pixels, IoU {r["intersection_over_union"]:.4f}. Masks may overlap. This describes selected pixels, not object ordering, physical contact, salience or depth.'})
    return {'sources':sources,'labels':labels,'region_ids':list(region_ids),'image_sha256':graph['image_sha256'],
        'graph_sha256':graph['sha256'],'policy':'Neutral pixel scopes with all attached hypotheses and overlapping default-label alternatives retained as attributed unresolved sources. No semantic winner or reference-annotation leakage.',
        'semantic_approval':False,'independent_validation':False}
