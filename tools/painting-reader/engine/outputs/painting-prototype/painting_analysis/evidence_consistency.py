"""Scoped consistency checks on fallible evidence; never semantic certification.

Geometry describes supplied approximate boxes, not verified object boundaries.
Missing part localization cannot be replaced with its parent's whole-object box.
"""
import copy,math
from .isolated_evidence import fingerprint,box,relationship_record

PREDICATES={'left_of','right_of','above','below','below_left','overlaps','inside','not_box_testable'}

def payload(record):
    return record.get('payload',{}) if record.get('status')=='model_proposal' else {}

def bound_identity(t,record,view):
    return bool(record and view.get('source_image_sha256')==t['image_sha256'] and record.get('target_id')==t['id'] and record.get('target_fingerprint')==fingerprint(t)
        and record.get('image_sha256')==t['image_sha256'] and record.get('pixel_sha256')==view['pixel_sha256']
        and record.get('view_kind')==view['kind'])

def disagreement(a,b):
    # Different degrees of uncertainty are not proof of incompatible assertions.
    return a in {'present','absent','not_visual_target'} and b in {'present','absent','not_visual_target'} and a!=b

def crop_consistency(t,full_view,crop_view,full_record,crop_record,coverage_record):
    if not bound_identity(t,full_record,full_view) or not bound_identity(t,crop_record,crop_view):raise ValueError('Identity/view binding mismatch')
    if crop_view['parent_pixel_sha256']!=full_view['pixel_sha256'] or crop_view['source_image_sha256']!=t['image_sha256']:raise ValueError('Crop binding mismatch')
    if coverage_record.get('target_fingerprint')!=fingerprint(t) or coverage_record.get('image_sha256')!=t['image_sha256']:raise ValueError('Coverage/target binding mismatch')
    if coverage_record.get('request_binding_fingerprint')!=fingerprint({'target':t,'full':full_view,'crop':crop_view}):raise ValueError('Coverage must bind both exact views')
    f,c,v=payload(full_record),payload(crop_record),payload(coverage_record);issues=[]
    if disagreement(f.get('identity'),v.get('reference_identity')):issues.append({'code':'full_identity_disagreement','scope':'full_identity','basis':'incompatible_model_assertions'})
    if disagreement(c.get('identity'),v.get('crop_identity')):issues.append({'code':'crop_identity_disagreement','scope':'crop','basis':'incompatible_model_assertions'})
    geometry=None
    if f.get('identity')=='present' and f.get('box'):
        b=box(f['box']);w,h=full_view['size'];x0,y0,x1,y1=crop_view['pixel_rectangle'];q=[x0/w,y0/h,x1/w,y1/h]
        overlap=max(0,min(b[2],q[2])-max(b[0],q[0]))*max(0,min(b[3],q[3])-max(b[1],q[1]))
        fraction=overlap/((b[2]-b[0])*(b[3]-b[1]));geometry={'fraction_of_proposed_box_retained':fraction,'basis':'unverified_box_not_target_mask'}
        if fraction==0 and v.get('crop_identity')=='present':issues.append({'code':'crop_presence_outside_proposed_box','scope':'crop','basis':'conditional_on_unverified_box'})
        if v.get('coverage')=='complete_depiction' and fraction<.98:issues.append({'code':'complete_coverage_exceeds_crop_box_overlap','scope':'crop','basis':'conditional_on_unverified_box'})
    return {'target_id':t['id'],'issues':issues,'box_geometry':geometry,'native_records_fingerprint':fingerprint([full_record,crop_record,coverage_record]),
        'semantic_approval':False,'independent_validation':False}

def typed_relation(relation,spec):
    expected={'relation_fingerprint','predicate','subject_id','object_id','required_parts','author'}
    if set(spec)!=expected or spec['relation_fingerprint']!=fingerprint(relation):raise ValueError('Typed relation binding mismatch')
    if spec['predicate'] not in PREDICATES or not spec['author']:raise ValueError('Named predicate and attribution required')
    if spec['subject_id']==spec['object_id'] or not {spec['subject_id'],spec['object_id']}<=set(relation['participant_ids']):raise ValueError('Typed participant mismatch')
    for p in spec['required_parts']:
        if set(p)!={'parent_id','label'} or p['parent_id'] not in relation['participant_ids'] or not p['label']:raise ValueError('Explicit part reference required')
    return copy.deepcopy(spec)

def box_relation(a,b,predicate,margin=.005):
    a,b=box(a),box(b)
    if not isinstance(margin,(float,int)) or isinstance(margin,bool) or not math.isfinite(margin) or not 0<=margin<.25:raise ValueError('Invalid tolerance')
    left=a[2]<b[0]-margin;right=a[0]>b[2]+margin;above=a[3]<b[1]-margin;below=a[1]>b[3]+margin
    if predicate=='left_of':yes,no=left,right
    elif predicate=='right_of':yes,no=right,left
    elif predicate=='above':yes,no=above,below
    elif predicate=='below':yes,no=below,above
    elif predicate=='below_left':yes,no=below and left,above or right
    elif predicate=='overlaps':
        # Intersecting rectangles cannot prove that the depicted shapes overlap.
        yes,no=False,left or right or above or below
    elif predicate=='inside':
        # Containing rectangles cannot prove the relation between actual shapes.
        yes,no=False,any([a[0]<b[0]-margin,a[1]<b[1]-margin,a[2]>b[2]+margin,a[3]>b[3]+margin])
    elif predicate=='not_box_testable':return 'unresolved'
    else:raise ValueError('Unknown box predicate')
    return 'consistent' if yes else 'conflict' if no else 'unresolved'

def relation_consistency(relation,targets,identities,view,relation_record,spec,text_check,part_localizations=None):
    spec=typed_relation(relation,spec);lookup={t['id']:t for t in targets}
    original=relationship_record(relation,targets,identities,relation_record);issues=[];p=payload(relation_record)
    for pid in relation['participant_ids']:
        r=identities.get(pid)
        if not bound_identity(lookup[pid],r,view):raise ValueError('Relation identity/view mismatch')
        if disagreement(payload(r).get('identity'),p.get('participants',{}).get(pid,{}).get('identity')):
            issues.append({'code':'participant_identity_disagreement','participant_id':pid,'scope':'whole_relation','basis':'incompatible_model_assertions'})
    geometry={'result':'unresolved','basis':'unverified_boxes','predicate':spec['predicate']}
    boxes={i:payload(r).get('box') if payload(r).get('identity')=='present' else None for i,r in identities.items()};missing=[];parts={}
    for part in spec['required_parts']:
        key=part['parent_id']+'/'+part['label'];entry=(part_localizations or {}).get(key)
        if entry:
            if entry['parent_id']!=part['parent_id'] or entry['target']['label']!=part['label'] or entry['target']['image_sha256']!=relation['image_sha256'] or not bound_identity(entry['target'],entry['identity'],view):raise ValueError('Part localization binding mismatch')
            pp=payload(entry['identity'])
            if pp.get('identity')=='present' and pp.get('box'):parts.setdefault(part['parent_id'],[]).append(box(pp['box']));continue
        missing.append(part)
    if missing:
        issues.append({'code':'required_part_not_localized','scope':'whole_relation','basis':'missing_evidence','parts':missing})
        geometry['reason']='A parent box cannot establish the position of a specifically named part.'
    else:
        for parent,bs in parts.items():boxes[parent]=[min(b[0] for b in bs),min(b[1] for b in bs),max(b[2] for b in bs),max(b[3] for b in bs)]
    if not missing and spec['predicate']!='not_box_testable':
        a,b=[boxes.get(spec[k]) for k in ['subject_id','object_id']]
        if a and b:
            geometry['result']=box_relation(a,b,spec['predicate'])
            if geometry['result']=='conflict' and p.get('assessment')=='supported':issues.append({'code':'supported_relation_conflicts_with_proposed_boxes','scope':'whole_relation','basis':'conditional_on_unverified_boxes'})
    expected=fingerprint({'relation':relation,'record':relation_record})
    if text_check.get('source_fingerprint')!=expected:raise ValueError('Text check cannot be borrowed from another relation or response')
    tp=payload(text_check)
    if not tp or any(tp.get(k)!='consistent' for k in ['verdict_reason','participant_reason']):
        issues.append({'code':'textual_consistency_not_established','scope':'whole_relation','basis':'fallible_text_model_check','assessment':{k:tp.get(k,'unresolved') for k in ['verdict_reason','participant_reason']}})
    eligible=original['eligible_for_tentative_account'] and not issues
    return {'relation_id':relation['id'],'previously_eligible':original['eligible_for_tentative_account'],'eligible_after_consistency':eligible,
        'issues':issues,'geometry':geometry,'source_fingerprint':expected,'text_check_fingerprint':fingerprint(text_check),
        'status':'unflagged_proposal' if eligible else 'withheld_or_previously_ineligible',
        'semantic_approval':False,'independent_validation':False}

def filter_records(records,checks):
    ids={r['relation']['id'] for r in records};cids={r['relation_id'] for r in checks}
    if ids!=cids or len(ids)!=len(records) or len(cids)!=len(checks):raise ValueError('Complete one-to-one relation checks required')
    lookup={c['relation_id']:c for c in checks};out=copy.deepcopy(records)
    for r in out:
        c=lookup[r['relation']['id']]
        if c['source_fingerprint']!=fingerprint({'relation':r['relation'],'record':r['relation_record']}):raise ValueError('Consistency binding mismatch')
        r['eligible_for_tentative_account']=r['eligible_for_tentative_account'] and c['eligible_after_consistency']
    return out
