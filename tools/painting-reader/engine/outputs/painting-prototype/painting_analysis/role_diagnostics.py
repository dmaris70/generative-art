"""Deterministic diagnostics over asserted global depth roles, not image truth."""
from collections import defaultdict

def diagnose(objects,links,account=None):
 h=objects['image_sha256']
 if links['image_sha256']!=h:raise ValueError('Different reproduction')
 ids=[o['id'] for o in objects['objects']]
 if len(ids)!=len(set(ids)):raise ValueError('Duplicate instance ID')
 rids=[r['id'] for r in links['relations']]
 if len(rids)!=len(set(rids)):raise ValueError('Duplicate relation ID')
 edges=defaultdict(list);normalized=[]
 for r in links['relations']:
  a,b,p=(r['subject_id'],r['object_id'],r['predicate']) if 'subject_id' in r else (r['from_id'],r['to_id'],r['kind'])
  if a not in ids or b not in ids:raise ValueError('Unknown participant')
  if p not in {'behind','in_front_of'}:continue
  if p=='behind':a,b=b,a
  edges[(a,b)].append(r['id']);normalized.append({'relation_id':r['id'],'front_id':a,'back_id':b})
 equivalent=[{'front_id':a,'back_id':b,'relation_ids':rs,'meaning':'Same asserted depth direction; do not count as independent corroboration.'} for (a,b),rs in sorted(edges.items()) if len(rs)>1]
 opposing=[]
 for a,b in sorted(edges):
  if a<b and (b,a) in edges:opposing.append({'participants':[a,b],'relation_ids':sorted(edges[(a,b)]+edges[(b,a)]),'meaning':'Opposing whole-instance depth assertions. Inspect spatial scope and ambiguity; no automatic correction.'})
 self_depth=[{'participant':a,'relation_ids':rs} for (a,b),rs in sorted(edges.items()) if a==b]
 adj=defaultdict(set)
 for a,b in edges:
  if a!=b:adj[a].add(b)
 cycles=[]
 def walk(start,path):
  for nxt in sorted(adj[path[-1]]):
   if nxt==start and len(path)>=3:
    pairs=list(zip(path,path[1:]+[start]));cycles.append({'participants':path.copy(),'relation_ids':sorted({r for pair in pairs for r in edges[pair]}),'meaning':'Cycle under a global depth-order reading. Local occlusion may need finer spatial scope; this is not proof of a false painting interpretation.'})
   elif nxt>start and nxt not in path:walk(start,path+[nxt])
 for start in sorted(adj):walk(start,[start])
 conflict_ids=sorted({r for item in opposing+cycles+self_depth for r in item['relation_ids']})
 cited=[]
 if account is not None:
  if account['image_sha256']!=h:raise ValueError('Different account reproduction')
  refs=account.get('payload',{}).get('relation_ids',[])
  if any(r not in rids for r in refs):raise ValueError('Unknown account citation')
  cited=sorted(set(refs)&set(conflict_ids))
 return {'image_sha256':h,'normalized_depth_claims':normalized,'equivalent_claim_groups':equivalent,'opposing_depth_groups':opposing,'potential_depth_cycles':cycles,'self_depth_claims':self_depth,'review_relation_ids':conflict_ids,'account_cites_flagged_relations':cited,'semantic_approval':False,'independent_validation':False,'scope':'Algebra over asserted IDs and predicates only. Opposing/cyclic global depth needs review of scope; no claim is reversed, deleted, merged or visually verified.'}
