"""Instance-safe inventories and explicit relation roles; no semantic approval."""
from copy import deepcopy
from painting_analysis.scene_inventory import account
PREDICATES={
 'holds':'The subject holds the object.',
 'supports':'The subject bears or supports the object; the supported thing is the object.',
 'touches':'The subject and object visibly contact each other; symmetric. Nearness alone is insufficient.',
 'in_front_of':'The subject is spatially in front of the object in the depicted scene.',
 'behind':'The subject is spatially behind the object in the depicted scene.',
 'occludes':'A visible part of the subject covers a visible part of the object in the image.',
 'overlaps':'The two depictions share an area; this predicate alone does not specify front/back or support.',
 'beside':'The subject is beside the object; symmetric.',
 'echoes_color':'The subject and object have similar visible colors; symmetric.',
 'contrasts_with':'The subject and object visibly contrast; symmetric.',
 'wears':'The subject wears the object as a garment or accessory; not the same as holding.',
 'part_of':'The subject is a depicted part of the object.',
 'reflects':'The subject is a reflecting surface or depicted reflection of the object.',
 'other_visible_relation':'A visible relation without a more specific listed predicate; direction must be explained.'}
SYMMETRIC={'touches','overlaps','beside','echoes_color','contrasts_with'}
def inventory(payload,image_sha):
 rows=[];errors=[];notices=[];by_label={};by_description={}
 for i,obj in enumerate(payload['objects']):
  r={**deepcopy(obj),'id':'E'+str(i+1)};label=obj['label'].strip().casefold();appearance=obj['appearance'].strip().casefold()
  if not label:errors.append(r['id']+':empty_label')
  if not appearance:errors.append(r['id']+':empty_description')
  by_label.setdefault(label,[]).append(r['id']);by_description.setdefault((label,appearance),[]).append(r['id']);rows.append(r)
 for label,ids in by_label.items():
  if len(ids)>1:notices.append({'kind':'shared_label','ids':ids,'note':'A shared category name does not establish duplicate instances. IDs remain distinct.'})
 for key,ids in by_description.items():
  if len(ids)>1:notices.append({'kind':'indistinguishable_descriptions','ids':ids,'note':'Descriptions repeat; instance identity needs visual inspection. No automatic merge or deletion.'})
 return {'objects':rows,'unresolved':payload['unresolved'],'notices':notices,'image_sha256':image_sha,'errors':errors,'structure_accepted':not errors,'semantic_approval':False,'coverage':'not_established','instance_identity':'proposed_not_verified'}
def statement(subject,predicate,object_,objects):
 labels={o['id']:o['label'] for o in objects['objects']}
 return f"{subject} ({labels[subject]}) — {predicate.replace('_',' ')} → {object_} ({labels[object_]})"
def relations(payload,objects,image_sha):
 if objects['image_sha256']!=image_sha:raise ValueError('Different reproduction')
 if not objects['structure_accepted']:raise ValueError('Unaccepted inventory')
 ids={x['id'] for x in objects['objects']};rows=[];errors=[];seen=set()
 for i,item in enumerate(payload['relations']):
  r={**deepcopy(item),'id':'R'+str(i+1)};a,b,p=item['subject_id'],item['object_id'],item['predicate'];issues=[]
  if a not in ids or b not in ids:issues.append('unknown_participant')
  if a==b:issues.append('self_relation')
  if p not in PREDICATES:issues.append('unknown_predicate')
  pair=tuple(sorted((a,b))) if p in SYMMETRIC else (a,b);key=(pair,p)
  if key in seen:issues.append('duplicate_relation')
  seen.add(key);r['errors']=issues;r['statement']=statement(a,p,b,objects) if a in ids and b in ids else None
  r['statement_origin']='deterministic_rendering_of_proposed_roles';r['evidence_agreement']='not_established';rows.append(r);errors.extend(r['id']+':'+e for e in issues)
 return {'relations':rows,'unresolved':payload['unresolved'],'image_sha256':image_sha,'errors':errors,'structure_accepted':not errors,'semantic_approval':False,'evidence_scope':'Statements render model-selected roles. Neither role selection nor visual evidence is verified.'}
def role_review(payload,items):
 expected={x['id'] for x in items};seen=set();errors=[]
 for a in payload['assessments']:
  if a['relation_id'] not in expected:errors.append('unknown_relation:'+a['relation_id'])
  if a['relation_id'] in seen:errors.append('duplicate_assessment:'+a['relation_id'])
  seen.add(a['relation_id'])
 if expected-seen:errors.append('missing_assessments:'+','.join(sorted(expected-seen)))
 return {'assessments':deepcopy(payload['assessments']),'errors':errors,'structure_accepted':not errors,'semantic_approval':False,'scope':'Model comparison of supplied text roles only; no image evidence or visual verification.'}
