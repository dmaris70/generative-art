"""Explicit higher-order grouping hypotheses; numeric eligibility is not interpretation validation."""
import copy
import hashlib
import itertools
import json
import math
import numpy as np
from PIL import Image
from .features import rgb_to_lab
from .multiscale import geometry,crop_for,pair_measurement

VERSION='composition-groups-0.1'
PROTOCOL={
 'collections':['color-consensus','boundary-scale-3','boundary-scale-6','boundary-scale-12','boundary-consensus','sam-raw','sam-consensus'],
 'candidate_rule':'Every unordered triple in each declared collection, plus the complete collection when larger than three. No cross-method mixtures or outcome-based replacements.',
 'conditions':[{'id':'primary','scale':1,'crop_fraction':1},{'id':'three_quarter','scale':.75,'crop_fraction':1},{'id':'half','scale':.5,'crop_fraction':1},{'id':'central_crop','scale':1,'crop_fraction':.6}],
 'profiles':{'primary':{'overlap':.1,'color':18,'alignment':.08,'lightness_step':6},'stricter':{'overlap':.05,'color':12,'alignment':.04,'lightness_step':10},'looser':{'overlap':.15,'color':24,'alignment':.12,'lightness_step':3}},
 'minimum_pixels':20,'minimum_centroid_span_fraction':.15,
 'scope':'Declared development heuristics, not a replication, a learned significance score or independent evidence of a perceptual effect.'}
RULES={
 'color_connection':{'title':'Color affinity across connected fields','requirements':[('minimum_pixels','ge',20),('max_overlap','le','overlap'),('connected','eq',1),('max_color_distance','le','color')],
  'possible_effect':'Color resemblance and direct contacts may help these fields read together.',
  'alternative':'Broad color averages can hide varied patches, and neighboring segments need not form an artistic group.'},
 'contact_chain':{'title':'A chain of contacting fields','requirements':[('minimum_pixels','ge',20),('max_overlap','le','overlap'),('contact_path','eq',1)],
  'possible_effect':'A sequence of contacts may connect these fields through an intermediate region.',
  'alternative':'The chain may be an artifact of segmentation; contact does not establish a visual path or viewing order.'},
 'tonal_progression':{'title':'Lightness progression along aligned centers','requirements':[('minimum_pixels','ge',20),('max_overlap','le','overlap'),('alignment_ratio','le','alignment'),('centroid_span','ge',.15),('minimum_tonal_step','ge','lightness_step')],
  'possible_effect':'A change in average lightness along aligned region centers may contribute to a directional organization.',
  'alternative':'Centroids and mean lightness can conceal interlocking shapes, local reversals and competing directions.'}}
FAMILIES={'minimum_pixels':'sampling','max_overlap':'mask_identity','connected':'contact','contact_path':'contact','max_color_distance':'color',
          'alignment_ratio':'position','centroid_span':'position','minimum_tonal_step':'lightness'}


def evaluate(facts,kind,profile='primary'):
    clauses=[]
    for name,op,limit in RULES[kind]['requirements']:
        threshold=PROTOCOL['profiles'][profile][limit] if isinstance(limit,str) else limit
        value=facts.get(name)
        if value is not None and (type(value) not in (int,float) or not math.isfinite(value)):raise ValueError('Facts must be finite numbers or unknown')
        passed=None if value is None else value<=threshold if op=='le' else value>=threshold if op=='ge' else value==threshold
        clauses.append({'fact_id':name,'family':FAMILIES[name],'operator':op,'threshold':threshold,'value':value,
                        'status':'unknown' if passed is None else 'met' if passed else 'not_met'})
    status='not_eligible' if any(c['status']=='not_met' for c in clauses) else 'undetermined' if any(c['status']=='unknown' for c in clauses) else 'eligible_hypothesis'
    return {'status':status,'clauses':clauses,'semantic_approval':False}


def condition_inputs(image,masks,c):
    w,h=image.size;fraction=c['crop_fraction'];cw=max(2,round(w*fraction));ch=max(2,round(h*fraction));l=(w-cw)//2;t=(h-ch)//2
    box=[l,t,l+cw,t+ch];size=[max(2,round(v*c['scale'])) for v in (cw,ch)]
    im=image.crop(box).resize(size,Image.Resampling.LANCZOS)
    mm={k:np.asarray(Image.fromarray(v[t:t+ch,l:l+cw]).resize(size,Image.Resampling.NEAREST),dtype=bool) for k,v in masks.items()}
    return im,mm,{'id':c['id'],'source_crop_xyxy':box,'image_size':size,'source_from_condition':{'scale':[cw/size[0],ch/size[1]],'offset':[l+(cw/size[0]-1)/2,t+(ch/size[1]-1)/2]}}


def measure(image,masks,members,pairs):
    """Facts retain paths to full pair measurements; absence never becomes zero similarity."""
    selected=[pairs['|'.join(sorted((a,b)))] for a,b in itertools.combinations(members,2)]
    counts={k:int(masks[k].sum()) for k in members};all_geometry=all(counts.values());all_color=all(p['availability']['color']=='measured' for p in selected)
    overlaps=[p['overlap_pixels']/min(p['pixel_counts']) for p in selected] if all_geometry else []
    contacts=[p['region_ids'] for p in selected if p['direct_contact']['edge_count']>0]
    neighbors={k:set() for k in members}
    for a,b in contacts:neighbors[a].add(b);neighbors[b].add(a)
    visited={members[0]};pending=[members[0]]
    while pending:
        for n in neighbors[pending.pop()]-visited:visited.add(n);pending.append(n)
    connected=len(visited)==len(members)
    centroids={k:geometry(masks[k])['center'] for k in members};ratio=None;span=None;order=[];step=None
    if all_geometry:
        xy=np.asarray([[centroids[k][0]*(image.width-1),centroids[k][1]*(image.height-1)] for k in members]);xy-=xy.mean(axis=0)
        _,s,v=np.linalg.svd(xy,full_matrices=False)
        if s[0]>1e-9:
            axis=v[0];axis=axis if axis[np.argmax(abs(axis))]>=0 else -axis
            projected=xy@axis;order=[members[i] for i in sorted(range(len(members)),key=lambda i:(projected[i],members[i]))]
            ratio=float((s[1]/s[0])**2);span=float(np.ptp(projected)/math.hypot(image.width,image.height))
            if all_color:
                # Pair differences carry the same means used to construct the evidence ledger.
                diffs=[]
                for a,b in zip(order,order[1:]):
                    p=pairs['|'.join(sorted((a,b)))];d=p['signed_mean_lab_B_minus_A'][0];diffs.append(d if p['region_ids']==[a,b] else -d)
                step=float(max(min(diffs),min(-d for d in diffs)))
    facts={'minimum_pixels':min(counts.values()) if all_geometry else None,'max_overlap':max(overlaps) if overlaps else None,'connected':int(connected) if all_geometry else None,
           'contact_path':int(connected and len(contacts)==len(members)-1 and max(map(len,neighbors.values()))<=2) if all_geometry else None,
           'max_color_distance':max(p['mean_color_difference_delta_e76'] for p in selected) if all_color else None,
           'alignment_ratio':ratio,'centroid_span':span,'minimum_tonal_step':step}
    return {'facts':facts,'pixel_counts':counts,'contact_edges':contacts,'centroid_order':order,
            'pair_refs':['|'.join(sorted((a,b))) for a,b in itertools.combinations(members,2)],
            'scope':'Complete masks in this condition; centroids are not objects, contacts are not gaze, and tonal steps are regional means.'}


def dependency_checks(facts,kind):
    original=evaluate(facts,kind);checks=[]
    for family in sorted({c['family'] for c in original['clauses']}):
        changed={k:None if FAMILIES[k]==family else v for k,v in facts.items()};after=evaluate(changed,kind)
        checks.append({'removed_family':family,'before':original['status'],'after':after['status'],
                       'no_unsupported_pass':after['status']!='eligible_hypothesis','scope':'Synthetic evidence withdrawal, not an altered painting or perceptual intervention.'})
    return checks


def build(image,catalog,catalog_key,masks,binding):
    if image.mode!='RGB' or list(image.size)!=catalog['image_size']:raise ValueError('Source image mismatch')
    if binding['proposal_catalog_sha256']!=catalog_key or binding['source_sha256']!=catalog['binding']['source_sha256'] or binding['image_sha256']!=catalog['binding']['image_sha256'] or binding['work_id']!=catalog['binding']['work_id']:raise ValueError('Proposal source mismatch')
    if set(masks)!={p['id'] for p in catalog['proposals']}:raise ValueError('Missing proposal masks')
    for m in masks.values():
        if m.dtype!=bool or m.shape!=(image.height,image.width):raise ValueError('Source-sized boolean masks required')
    collections={c['id']:c for c in catalog['collections']};groups=[];availability=[]
    for cid in PROTOCOL['collections']:
        c=collections.get(cid);ids=sorted(c['proposal_ids']) if c else []
        availability.append({'collection_id':cid,'status':'available' if len(ids)>=3 else 'insufficient_regions','region_count':len(ids)})
        if len(ids)<3:continue
        candidates=list(itertools.combinations(ids,3))
        if len(ids)>3:candidates.append(tuple(ids))
        for members in candidates:
            gid='G'+hashlib.sha256(json.dumps([cid,members]).encode()).hexdigest()[:20]
            union=np.logical_or.reduce([masks[k] for k in members]);g=geometry(union)
            if g['bounds'] is None:raise ValueError('Empty proposed group')
            groups.append({'id':gid,'collection_id':cid,'members':list(members),'geometry':g,'crop_xyxy':crop_for(g['bounds'],image.size,.08),'conditions':{},'semantic_approval':False})
    required=sorted({tuple(sorted((a,b))) for g in groups for a,b in itertools.combinations(g['members'],2)})
    condition_records=[]
    for spec in PROTOCOL['conditions']:
        im,mm,c=condition_inputs(image,masks,spec);lab=rgb_to_lab(np.asarray(im,dtype=float)/255)
        c['pairs']={'|'.join((a,b)):pair_measurement(im,mm,a,b,lab) for a,b in required};condition_records.append(c)
        for group in groups:
            measured=measure(im,mm,group['members'],c['pairs']);group['conditions'][spec['id']]=measured
            measured['rules']={kind:{profile:evaluate(measured['facts'],kind,profile) for profile in PROTOCOL['profiles']} for kind in RULES}
    for group in groups:
        primary=group['conditions']['primary'];group['readings']=[]
        for kind,rule in RULES.items():
            decision=primary['rules'][kind]['primary'];statuses={c:row['rules'][kind]['primary']['status'] for c,row in group['conditions'].items()}
            clauses=[{'text':f"{c['fact_id'].replace('_',' ')} = {c['value']:.3f}" if c['value'] is not None else c['fact_id'].replace('_',' ')+': unavailable',
                      'fact_ref':'groups/'+group['id']+'/conditions/primary/facts/'+c['fact_id'],'family':c['family'],'role':'measured_premise'} for c in decision['clauses']]
            group['readings'].append({'id':kind,'title':rule['title'],'status':decision['status'],'premises':clauses,
                                     'possible_effect':rule['possible_effect'] if decision['status']=='eligible_hypothesis' else None,
                                     'withheld_effect':rule['possible_effect'] if decision['status']!='eligible_hypothesis' else None,
                                     'bridge_origin':'authored_testable_hypothesis','alternative':rule['alternative'],
                                     'next_evidence':'Inspect competing masks and the whole painting, then obtain independent region and grouping judgments.',
                                     'condition_statuses':statuses,'status_same_in_all_conditions':len(set(statuses.values()))==1,
                                     'dependency_checks':dependency_checks(primary['facts'],kind),'semantic_approval':False})
    # Browsing order is explicit. No prose model, affect inference or importance ranking is involved.
    selected=[];used=set()
    for kind in RULES:
        candidates=sorted((g for g in groups if g['conditions']['primary']['rules'][kind]['primary']['status']=='eligible_hypothesis'),key=lambda g:(PROTOCOL['collections'].index(g['collection_id']),g['id']))
        chosen=next((g for g in candidates if set(g['members'])!=used),None) if candidates else None
        if chosen:selected.append({'group_id':chosen['id'],'reading_id':kind});used=set(chosen['members'])
    return {'version':VERSION,'binding':binding,'image_size':list(image.size),'protocol':copy.deepcopy(PROTOCOL),'rules':copy.deepcopy(RULES),
            'availability':availability,'conditions':condition_records,'groups':groups,'suggested_examples':selected,
            'selection_scope':'At most one eligible example per rule, using fixed collection order then stable ID. Not a ranking of significance or a whole-work explanation.',
            'independent_validation':False,'semantic_approval':False,
            'limits':['These candidate sets are restricted to existing segmentation outputs; absent objects or groups cannot be recovered by a rule.',
                      'All triples are tested within each declared collection; complete-collection candidates add one larger scale. This does not exhaust possible artistic groupings.',
                      'Mask variants and resampling conditions are correlated evidence, not independent votes.',
                      'No historical, material, emotional, intentional or causal claim is established by these measurements.']}


def extend_graph(graph,image,baseline_masks,artifact,key,proposal_masks):
    """Append immutable group views, retaining all pre-existing view meanings."""
    binding=artifact['binding']
    if binding['work_id']!=graph['work_id'] or binding['source_sha256']!=graph['source_sha256'] or binding['image_sha256']!=graph['image_sha256'] or binding['proposal_catalog_sha256']!=graph.get('proposal_catalog',{}).get('catalog_sha256'):raise ValueError('Group evidence belongs to another graph source')
    result=copy.deepcopy(graph);result['composition_catalog']={'analysis_sha256':key,'analysis_url':f'composition-groups/{graph["work_id"]}/{key}/analysis.json'}
    lab=rgb_to_lab(np.asarray(image,dtype=float)/255);cache={}
    for group in artifact['groups']:
        gid='composition-'+group['id'];members=group['members'];label=group['collection_id']+' · '+' + '.join(m.split('/')[-1] for m in members)
        result['nodes'].append({'id':gid,'kind':'candidate_group','label':label,'members':['proposal/'+m for m in members],
                                'geometry':group['geometry'],'origin':'declared_group_enumeration','semantic_approval':False})
        for m in members:result['edges'].append({'from':gid,'to':'proposal/'+m,'type':'candidate_membership','origin':'declared_group_enumeration','semantic_approval':False})
        box=group['crop_xyxy'];l,t,r,b=box;boxkey=tuple(box)
        if boxkey not in cache:
            mm={k:m[t:b,l:r] for k,m in baseline_masks.items()}
            cache[boxkey]={'region_visibility':{k:{'source_pixels':int(m.sum()),'visible_pixels':int(m[t:b,l:r].sum()),'source_fraction_visible':float(m[t:b,l:r].sum()/m.sum())} for k,m in baseline_masks.items()},
                          'proposal_visibility':{pid:int(m[t:b,l:r].sum()) for pid,m in proposal_masks.items()},
                          'context_pairs':{a+'--'+b0:pair_measurement(image.crop(box),mm,a,b0,lab[t:b,l:r]) for a,b0 in itertools.combinations(sorted(mm),2)}}
        result['views'].append({'id':gid,'level':'group','node_id':gid,'label':label,'composition_group_id':group['id'],'composition_analysis_sha256':key,
                                'crop_xyxy':box,'crop_size':[r-l,b-t],'crop_is_whole_image':box==[0,0,*image.size],
                                'source_to_crop_translation':[-l,-t],'crop_to_source_translation':[l,t],
                                'region_ids':sorted(baseline_masks),**copy.deepcopy(cache[boxkey]),
                                'context_scope':'Original color-field metrics remain distinct from the proposed grouping and its source-wide evidence.'})
    return result
