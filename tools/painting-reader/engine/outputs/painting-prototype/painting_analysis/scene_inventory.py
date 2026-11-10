"""Image-specific object and relation proposals before interpretation."""
from copy import deepcopy

def inventory(payload,image_sha):
    rows=[];errors=[];seen=set()
    for i,obj in enumerate(payload['objects']):
        r={'id':'E'+str(i+1),**deepcopy(obj)};label=obj['label'].strip().casefold()
        if not label:errors.append(r['id']+':empty_label')
        if label in seen:errors.append(r['id']+':duplicate_label')
        seen.add(label);rows.append(r)
    return {'objects':rows,'unresolved':payload['unresolved'],'image_sha256':image_sha,'errors':errors,'structure_accepted':not errors,'semantic_approval':False,'coverage':'not_established'}

def relations(payload,objects,image_sha):
    if objects['image_sha256']!=image_sha:raise ValueError('Different reproduction')
    if not objects['structure_accepted']:raise ValueError('Unaccepted inventory')
    ids={x['id'] for x in objects['objects']};rows=[];errors=[];seen=set()
    for i,item in enumerate(payload['relations']):
        r={'id':'R'+str(i+1),**deepcopy(item)};issues=[];a,b=item['from_id'],item['to_id'];key=(a,b,item['kind'])
        if a not in ids or b not in ids:issues.append('unknown_participant')
        if a==b:issues.append('self_relation')
        if key in seen:issues.append('duplicate_relation')
        seen.add(key);r['errors']=issues;rows.append(r);errors.extend(r['id']+':'+e for e in issues)
    return {'relations':rows,'unresolved':payload['unresolved'],'image_sha256':image_sha,'errors':errors,'structure_accepted':not errors,'semantic_approval':False}

def account(payload,objects,links,image_sha):
    if objects['image_sha256']!=image_sha or links['image_sha256']!=image_sha:raise ValueError('Different reproduction')
    if not objects['structure_accepted'] or not links['structure_accepted']:raise ValueError('Unaccepted scene components')
    ids={r['id'] for r in links['relations']};refs=payload['relation_ids'];errors=[]
    if any(r not in ids for r in refs):errors.append('unknown_relation')
    if len(refs)!=len(set(refs)):errors.append('duplicate_citation')
    if len(refs)<min(2,len(ids)):errors.append('too_few_relationships')
    if not ids:errors.append('no_relationships')
    return {'payload':deepcopy(payload),'image_sha256':image_sha,'errors':errors,'structure_accepted':not errors,'semantic_approval':False,'independent_validation':False,'scope':'Account and its cited premises remain unverified model proposals.'}
