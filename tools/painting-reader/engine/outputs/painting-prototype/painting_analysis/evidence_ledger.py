"""Version-bound evidence projections; no diagnostic becomes visual approval."""
import hashlib,json
from copy import deepcopy

def digest(v):return hashlib.sha256(json.dumps(v,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()
def normalize(r):
 return {'id':r['id'],'subject_id':r.get('subject_id',r.get('from_id')),'predicate':r.get('predicate',r.get('kind')),'object_id':r.get('object_id',r.get('to_id')),'observation':r.get('visual_evidence',r.get('observation')),'uncertainty':r.get('uncertainty','')}
def binding(graph_sha,image_sha,r):return digest({'graph_sha256':graph_sha,'image_sha256':image_sha,'relation':normalize(r)})
def project(graph_sha,image_sha,objects,relations,account,diagnostics=(),reviews=(),graph_diagnostics=None):
 ids=[o['id'] for o in objects];rids=[r['id'] for r in relations]
 if len(ids)!=len(set(ids)) or len(rids)!=len(set(rids)):raise ValueError('Duplicate IDs')
 expected={r['id']:binding(graph_sha,image_sha,r) for r in relations};byd={};byv={}
 for collection,target in [(diagnostics,byd),(reviews,byv)]:
  for d in collection:
   if d['relation_id'] not in expected or d['binding']!=expected[d['relation_id']] or d['image_sha256']!=image_sha:raise ValueError('Evidence binding mismatch')
   target.setdefault(d['relation_id'],[]).append(deepcopy(d))
 for ds in byd.values():
  keys=[d['checker_model'] for d in ds]
  if len(keys)!=len(set(keys)):raise ValueError('Duplicate checker evidence')
 graph_flags=[]
 if graph_diagnostics is not None:
  if graph_diagnostics['image_sha256']!=image_sha or any(r not in expected for r in graph_diagnostics['review_relation_ids']):raise ValueError('Graph diagnostic mismatch')
  graph_flags=graph_diagnostics['review_relation_ids']
 entries=[]
 for raw in relations:
  r=normalize(raw)
  if r['subject_id'] not in ids or r['object_id'] not in ids:raise ValueError('Unknown participant')
  ds=byd.get(r['id'],[]);vs=byv.get(r['id'],[]);flags=[]
  for d in ds:
   comp=d['comparison'];syntax=d['syntax']['assertions']
   if comp['unfiltered']['agreement']=='disagrees':flags.append('text_role_disagreement')
   if any(a['role_check']=='conflict' or a['scope_check']=='conflict' for a in syntax):flags.append('syntax_disagreement')
  if vs:flags.append('assistant_visual_concern')
  if r['id'] in graph_flags:flags.append('graph_depth_scope_concern')
  entries.append({'relation':r,'binding':expected[r['id']],'graph_sha256':graph_sha,'image_sha256':image_sha,'source_text':r['observation'],'source_text_sha256':digest(r['observation']),'text_checks':ds,'text_check_status':'available_model_diagnostics' if ds else 'not_assessed_for_this_version','visual_reviews':vs,'image_evidence':{'kind':'full_reproduction_supplied_to_original_model','participant_localization':'not_established_by_this_record','independent_verification':'absent'},'flags':sorted(set(flags)),'factual_approval':False,'interpretation_approval':False})
 refs=[] if account is None else account['relation_ids']
 if len(refs)!=len(set(refs)) or any(r not in expected for r in refs):raise ValueError('Account citation mismatch')
 cited=[e for e in entries if e['relation']['id'] in refs]
 affected={flag:[e['relation']['id'] for e in cited if flag in e['flags']] for flag in ['text_role_disagreement','syntax_disagreement','assistant_visual_concern','graph_depth_scope_concern']}
 return {'entries':entries,'graph_diagnostics':deepcopy(graph_diagnostics),'original_account':deepcopy(account),'account_projection':{'status':'unavailable' if account is None else 'provisional_model_interpretation','cited_relations':refs,'cited_concerns':affected,'cited_without_text_check':[e['relation']['id'] for e in cited if not e['text_checks']],'citation_scope':'Account-level citations only. This does not prove which sentence depends on which edge, that citations cover all prose, or that a flagged premise invalidates the entire interpretation.','image_verification':'not_independently_verified','eligible_as_verified_fact':False},'semantic_approval':False,'independent_validation':False}
