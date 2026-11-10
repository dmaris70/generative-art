"""Source-anchored targets, claims, and explicit dependency edges.

IDs and quotations come from code. Chosen spans/types/edges remain proposals.
"""
import re
from copy import deepcopy
TARGET_KINDS=('entity','part','group','region','reference','unresolved')
CLAIM_KINDS=('attribute','spatial_role','relation','interpretive_effect','context','unresolved')

def index_fields(feature):
    return [{'id':prefix+str(i+1).zfill(3),'field':field,'span':[m.start(),m.end()],'text':m.group()} for field,prefix in [('label','L'),('observation','O')] for i,m in enumerate(re.finditer(r'\S+',feature[field]))]

def resolve(feature,start,end):
    ts={t['id']:t for t in index_fields(feature)}
    if start not in ts or end not in ts:raise ValueError('unknown_token')
    a,b=ts[start],ts[end]
    if a['field']!=b['field']:raise ValueError('cross_field_span')
    lo,hi=a['span'][0],b['span'][1]
    if lo>=hi:raise ValueError('reversed_span')
    return {'source_field':a['field'],'source_span':[lo,hi],'quote':feature[a['field']][lo:hi]}

def targets(feature,payload):
    rows=[];errors=[];seen=set()
    for i,p in enumerate(payload['targets']):
        r={'id':'E'+str(i+1),**deepcopy(p),'semantic_approval':False}
        try:
            r.update(resolve(feature,p['start_token'],p['end_token']));key=(r['source_field'],tuple(r['source_span']))
            if key in seen:raise ValueError('duplicate_source_target')
            seen.add(key)
        except ValueError as e:r['error']=str(e);errors.append(r['id']+':'+str(e))
        rows.append(r)
    return {'targets':rows,'errors':errors,'structure_accepted':not errors,'scope_note':payload['scope_note'],'semantic_approval':False,'source_completeness':'not_established'}

def claims(feature,target_record,payload):
    if not target_record['structure_accepted']:raise ValueError('unaccepted_targets')
    ts={t['id']:t for t in target_record['targets']};rows=[];errors=[]
    for i,p in enumerate(payload['claims']):
        r={'id':'C'+str(i+1),**deepcopy(p),'semantic_approval':False};issues=[]
        try:r.update(resolve(feature,p['start_token'],p['end_token']))
        except ValueError as e:issues.append(str(e))
        refs=p['participant_ids']
        if len(refs)!=len(set(refs)):issues.append('duplicate_participants')
        if any(x not in ts for x in refs):issues.append('unknown_participant')
        if p['kind'] in ('attribute','spatial_role','relation'):
            if not refs:issues.append('no_participants')
            if any(ts[x]['kind'] in ('reference','unresolved') for x in refs if x in ts):issues.append('nonvisual_participant')
        if p['kind']=='relation' and len(refs)<2:issues.append('relation_requires_two_targets')
        r['errors']=issues;rows.append(r);errors.extend(r['id']+':'+e for e in issues)
    return {'claims':rows,'errors':errors,'structure_accepted':not errors,'scope_note':payload['scope_note'],'semantic_approval':False}

def dependencies(target_record,claim_record,payload):
    if not target_record['structure_accepted'] or not claim_record['structure_accepted']:raise ValueError('unaccepted_components')
    ts={t['id']:t for t in target_record['targets']};cs={c['id']:c for c in claim_record['claims']};errors=[];edges=deepcopy(payload['edges']);seen=set();graph={}
    for i,e in enumerate(edges):
        a,b,k=e['from_id'],e['to_id'],e['kind'];issues=[];key=(a,b,k)
        if key in seen:issues.append('duplicate_edge')
        seen.add(key)
        if a==b:issues.append('self_edge')
        if k in ('part_of','member_of'):
            if a not in ts or b not in ts:issues.append('ownership_requires_targets')
            elif k=='part_of' and ts[a]['kind']!='part':issues.append('part_of_requires_part')
            elif k=='member_of' and ts[b]['kind']!='group':issues.append('member_of_requires_group')
            graph.setdefault(a,[]).append(b)
        elif k=='interpretation_depends_on':
            if a not in cs or b not in cs:issues.append('dependency_requires_claims')
            elif cs[a]['kind']!='interpretive_effect' or cs[b]['kind'] not in ('attribute','spatial_role','relation'):issues.append('invalid_interpretive_dependency')
        else:issues.append('unknown_edge_kind')
        e['errors']=issues;errors.extend('edge'+str(i+1)+':'+s for s in issues)
    def visit(x,trail):
        if x in trail:return True
        return any(visit(y,trail|{x}) for y in graph.get(x,[]))
    if any(visit(x,set()) for x in graph):errors.append('ownership_cycle')
    return {'edges':edges,'errors':errors,'structure_accepted':not errors,'scope_note':payload['scope_note'],'semantic_approval':False}

def assemble(feature,t,c,d,image_sha):
    accepted=all(r['structure_accepted'] for r in (t,c,d))
    return {'source':deepcopy(feature),'image_sha256':image_sha,'targets':t,'claims':c,'dependencies':d,'structure_accepted':accepted,
      'localization_targets':[{'id':x['id'],'label':x['quote'],'kind':x['kind'],'source_field':x['source_field'],'source_span':x['source_span']} for x in t['targets'] if x['kind'] in ('entity','part','group','region')] if accepted else [],
      'semantic_approval':False,'source_completeness':'not_established','independent_validation':False}

def epistemic_contract(payload,arm,scope):
    state=payload['candidate_assessment'];basis=payload['basis'];errors=[]
    if (arm=='neutral')!=(state=='not_requested'):errors.append('candidate_scope_mismatch')
    if state in ('supported','contradicted') and basis!='direct_visible':errors.append('decisive_claim_without_direct_evidence')
    if scope=='viewer_response' and state in ('supported','contradicted'):errors.append('viewer_response_not_measured')
    if scope=='material_state' and state in ('supported','contradicted'):errors.append('material_state_not_measured')
    return {'structure_accepted':not errors,'errors':errors,'semantic_approval':False}
