"""Literal source assertions and conservative comparison; never visual truth."""
from copy import deepcopy
from painting_analysis.directed_scene import PREDICATES,SYMMETRIC

def validate(payload,objects,sentence):
 ids={x['id'] for x in objects};errors=[];assertions=[]
 for i,a in enumerate(payload['assertions']):
  issues=[]
  if not a['source_quote'].strip() or a['source_quote'] not in sentence:issues.append('quote_not_in_source')
  for side in ['subject','object']:
   x=a[side]
   if x['entity_id'] not in ids|{'UNRESOLVED'}:issues.append(side+':unknown_id')
   if not x['mention'].strip() or x['mention'] not in a['source_quote']:issues.append(side+':mention_not_in_quote')
   if x['entity_id']=='UNRESOLVED' and x['scope']!='unresolved':issues.append(side+':unresolved_id_has_resolved_scope')
  if a['predicate'] not in PREDICATES:issues.append('unknown_predicate')
  assertions.append({**deepcopy(a),'id':'A'+str(i+1),'errors':issues});errors += [str(i+1)+':'+e for e in issues]
 return {'assertions':assertions,'unresolved':payload['unresolved'],'errors':errors,'structure_accepted':not errors,'semantic_approval':False,'independent_validation':False,'scope':'Exact quote validation establishes textual provenance only. Entity resolution, predicate and assertion status remain model proposals.'}

def key(s,p,o):
 if p=='behind':s,p,o=o,'in_front_of',s
 if p in SYMMETRIC:s,o=sorted([s,o])
 return s,p,o

def compare(candidate,classification):
 out={'relation_id':candidate['id'],'agreement':'unclear','reason_code':'extraction_unavailable','assertion_ids':[],'semantic_approval':False,'independent_validation':False}
 if classification.get('status')!='structural_proposal':return out
 assertions=classification['record']['assertions'];target=key(candidate['subject_id'],candidate['predicate'],candidate['object_id']);exact=[];reverse=[];near=[];scoped=[]
 for a in assertions:
  s,p,o=a['subject']['entity_id'],a['predicate'],a['object']['entity_id']
  if any(a[z]['scope']!='exact_entity' or a[z]['entity_id']=='UNRESOLVED' for z in ['subject','object']):
   scoped.append(a);continue
  k=key(s,p,o)
  if k==target:exact.append(a)
  elif p!='other_visible_relation' and key(o,p,s)==target:reverse.append(a)
  elif set((s,o))&set((candidate['subject_id'],candidate['object_id'])):near.append(a)
 statuses={a['assertion'] for a in exact}
 if 'uncertain' in statuses or {'affirmed','negated'}<=statuses:
  reason='uncertain_or_conflicting_source';used=exact
 elif 'affirmed' in statuses:out['agreement']='aligns';reason='explicit_matching_roles';used=exact
 elif 'negated' in statuses:out['agreement']='disagrees';reason='explicit_source_negation';used=exact
 elif any(a['assertion']=='affirmed' for a in reverse):
  out['agreement']='disagrees';reason='reversed_roles_in_source';used=[a for a in reverse if a['assertion']=='affirmed']
 elif reverse:reason='uncertain_reverse_not_contradiction';used=reverse
 elif scoped:reason='participant_scope_unresolved';used=scoped
 elif near:reason='different_predicate_or_participants';used=near
 else:reason='relation_not_established';used=[]
 out.update(reason_code=reason,assertion_ids=[a['id'] for a in used])
 out['scope']='Comparison with extracted source roles only. Reversal means an unfaithful mapping of this assertion, not proof the reverse is impossible in the world. Unmentioned relations stay unclear.'
 return out
