"""Evidence routing and participant bindings, independent of any model backend.

Declared roles describe the request's provenance; they do not prove visual
identity. Model answers remain proposals even when every structural check passes.
"""
from __future__ import annotations
import copy,hashlib,json,math,re

ROLES={'visual_target','input_reference','viewer_response','documentary_assertion','unresolved'}
RELATION_KINDS={'visual_relation','interpretation','documentary_assertion'}

def fingerprint(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False,allow_nan=False).encode()).hexdigest()

def identifier(value):
    if not isinstance(value,str) or not re.fullmatch(r'[A-Za-z][A-Za-z0-9_-]{0,79}',value):raise ValueError('Invalid evidence ID')
    return value
def sha(value):
    if not isinstance(value,str) or not re.fullmatch(r'[a-f0-9]{64}',value):raise ValueError('Image digest required')
    return value
def box(value):
    if not isinstance(value,list) or len(value)!=4 or any(type(x) not in (int,float) or not math.isfinite(x) or not 0<=x<=1 for x in value):raise ValueError('Normalized finite box required')
    if value[0]>=value[2] or value[1]>=value[3]:raise ValueError('Empty or reversed box')
    return copy.deepcopy(value)
def target(value):
    if not isinstance(value,dict) or set(value)!={'id','label','role','image_sha256','provenance'}:raise ValueError('Explicit target fields required; unrelated context is not a target')
    identifier(value['id']);sha(value['image_sha256'])
    if not isinstance(value['label'],str) or not value['label'].strip() or len(value['label'])>350:raise ValueError('Target label required')
    if value['role'] not in ROLES or not isinstance(value['provenance'],str) or not value['provenance'].strip():raise ValueError('Declared role and attribution required')
    return copy.deepcopy(value)
def target_route(value):
    t=target(value)
    return {'visual_target':'identity','unresolved':'identity','input_reference':'input_reference_not_depicted',
        'viewer_response':'attributed_response','documentary_assertion':'documentary_evidence_required'}[t['role']]
def identity_input(value,view):
    t=target(value)
    if target_route(t)!='identity':raise ValueError('This declared request role does not call for image identification')
    if view['source_image_sha256']!=t['image_sha256']:raise ValueError('Target/view image mismatch')
    if view['kind'] not in {'full_image','exact_crop'}:raise ValueError('Unknown supplied view')
    # Only the requested label and actual view enter the model's semantic input.
    return {'target':{'id':t['id'],'label':t['label']},'supplied_view':{'id':view['id'],'kind':view['kind']}}
def coverage_input(value,full,crop):
    t=target(value)
    if target_route(t)!='identity':raise ValueError('Nonvisual target has no crop coverage')
    if full['kind']!='full_image' or crop['kind']!='exact_crop':raise ValueError('Coverage needs full reference then exact crop')
    if full['source_image_sha256']!=t['image_sha256'] or crop['source_image_sha256']!=t['image_sha256']:raise ValueError('Coverage source mismatch')
    if full['pixel_sha256']!=crop['parent_pixel_sha256']:raise ValueError('Crop is not bound to supplied full pixels')
    rect=crop['pixel_rectangle'];size=full['size']
    if len(rect)!=4 or any(type(x) is not int for x in rect) or not (0<=rect[0]<rect[2]<=size[0] and 0<=rect[1]<rect[3]<=size[1]):raise ValueError('Invalid exact crop rectangle')
    return {'target':{'id':t['id'],'label':t['label']},'views_in_order':[{'id':full['id'],'role':'complete_reproduction_reference'},
        {'id':crop['id'],'role':'exact_crop_of_reference','rectangle_in_reference_pixels':rect}],
        'coverage_definition':'How much of the target AS DEPICTED in image 1 is retained in image 2. Not completeness of an imagined physical object.'}
def relation(value,targets):
    if not isinstance(value,dict) or set(value)!={'id','statement','kind','participant_ids','image_sha256','provenance'}:raise ValueError('Explicit relation fields required')
    identifier(value['id']);sha(value['image_sha256'])
    if value['kind'] not in RELATION_KINDS or not isinstance(value['statement'],str) or not value['statement'].strip():raise ValueError('Typed relation statement required')
    ids=value['participant_ids']
    if not isinstance(ids,list) or not 2<=len(ids)<=4 or len(set(ids))!=len(ids):raise ValueError('Two to four distinct participants required')
    if not isinstance(value['provenance'],str) or not value['provenance'].strip():raise ValueError('Relation attribution required')
    lookup={target(t)['id']:t for t in targets}
    if len(lookup)!=len(targets):raise ValueError('Duplicate participant ID')
    if not set(ids)<=set(lookup):raise ValueError('Unknown relation participant')
    if any(lookup[i]['image_sha256']!=value['image_sha256'] for i in ids):raise ValueError('Participants belong to another reproduction')
    return copy.deepcopy(value)
def relation_input(value,targets,view):
    r=relation(value,targets);lookup={t['id']:t for t in targets}
    if r['kind']!='visual_relation':raise ValueError('Interpretation and documentary claims require their separate evidence routes')
    if any(target_route(lookup[i])!='identity' for i in r['participant_ids']):raise ValueError('Nonvisual participant in visual relation')
    if view['kind']!='full_image' or view['source_image_sha256']!=r['image_sha256']:raise ValueError('Relation needs its bound whole reproduction')
    return {'relation':{'id':r['id'],'statement':r['statement']},'participants':[{'id':i,'label':lookup[i]['label']} for i in r['participant_ids']],
        'view_id':view['id']}
def relationship_record(value,targets,identity_records,relation_record):
    r=relation(value,targets);lookup={t['id']:t for t in targets};missing=[]
    for pid in r['participant_ids']:
        record=identity_records.get(pid)
        if not record or record.get('image_sha256')!=r['image_sha256'] or record.get('target_fingerprint')!=fingerprint(lookup[pid]) or record.get('target_id')!=pid or record.get('view_kind')!='full_image' or record.get('pixel_sha256')!=relation_record.get('pixel_sha256') or record.get('status')!='model_proposal' or record.get('payload',{}).get('identity')!='present':missing.append(pid)
    bound=relation_record.get('image_sha256')==r['image_sha256'] and relation_record.get('relation_id')==r['id'] and relation_record.get('relation_fingerprint')==fingerprint(r)
    payload=relation_record.get('payload',{}) if bound and relation_record.get('status')=='model_proposal' else {}
    participant_checks=payload.get('participants',{})
    unresolved=[i for i in r['participant_ids'] if participant_checks.get(i,{}).get('identity')!='present']
    eligible=r['kind']=='visual_relation' and not missing and not unresolved and payload.get('assessment')=='supported'
    return {'relation':r,'eligible_for_tentative_account':eligible,
        'level':'whole_image_relation_proposed' if eligible else 'unresolved_or_not_supported',
        'missing_identity_support':missing,'relation_participants_unresolved':unresolved,
        'identity_records':copy.deepcopy(identity_records),'relation_record':copy.deepcopy(relation_record),
        'semantic_approval':False,'independent_validation':False,'relation_localization':'not_established_by_participant_boxes'}
def targets_from_regions(regions,image_sha256,provenance):
    """Adapter for the existing semantic engine's native localization output."""
    sha(image_sha256);out=[]
    for region in regions:
        if len(region['bbox_1000'])!=4 or any(type(x) is not int for x in region['bbox_1000']):raise ValueError('Four integer localization coordinates required')
        b=box([x/1000 for x in region['bbox_1000']])
        t=target({'id':region['id'],'label':region['label'],'role':'unresolved','image_sha256':image_sha256,'provenance':provenance})
        out.append({'target':t,'proposed_box':b,'localization_status':'unverified_model_proposal'})
    if len({r['target']['id'] for r in out})!=len(out):raise ValueError('Duplicate localized target ID')
    return out
