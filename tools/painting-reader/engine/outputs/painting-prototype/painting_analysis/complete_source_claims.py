"""Preserve whole source sentences around proposed complete claim roles."""
import re
from copy import deepcopy

def sentences(feature):
    source=feature['observation'];out=[];start=0
    for m in re.finditer(r'[.!?](?:\s+|$)',source):
        end=m.end();out.append({'id':'S'+str(len(out)+1),'span':[start,end],'text':source[start:end]});start=end
    if start<len(source):out.append({'id':'S'+str(len(out)+1),'span':[start,len(source)],'text':source[start:]})
    if not out:raise ValueError('Empty source observation')
    assert ''.join(x['text'] for x in out)==source
    return out

def bind(feature,payload):
    ss={s['id']:s for s in sentences(feature)};rows=[];errors=[]
    for i,item in enumerate(payload['claims']):
        r={'id':'Q'+str(i+1),**deepcopy(item)};issues=[];ids=item['source_sentence_ids']
        if not ids or any(x not in ss for x in ids):issues.append('unknown_or_missing_source_sentence')
        if len(ids)!=len(set(ids)):issues.append('duplicate_source_sentence')
        for key in ['subject','predicate','complement']:
            if not item[key].strip():issues.append('empty_'+key)
        r['source_sentences']=[deepcopy(ss[x]) for x in ids if x in ss];r['errors']=issues;r['semantic_approval']=False
        rows.append(r);errors.extend(r['id']+':'+s for s in issues)
    return {'claims':rows,'errors':errors,'structure_accepted':not errors,'source_completeness':'not_established','semantic_approval':False,'unresolved':payload['unresolved']}

def verify_review(reference,records,review):
    """Validate accountable manual coverage notes; do not certify their judgments."""
    if set(review)!=set(reference):raise ValueError('Every checklist item must be reviewed')
    known={x['id'] for x in records['claims']}
    for key,row in review.items():
        if row['status'] not in ('retained','partial','missing','distorted'):raise ValueError('Unknown review status')
        if not row['reason'].strip():raise ValueError('Missing rationale')
        if any(x not in known for x in row['claim_ids']):raise ValueError('Unknown output claim')
        if row['status'] in ('retained','partial','distorted') and not row['claim_ids']:raise ValueError('Judgment requires exact claim IDs')
    return {'items_reviewed':len(review),'reviewer_independent':False,'source_truth_verified':False}
