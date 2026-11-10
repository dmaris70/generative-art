"""Join independently dispatched role reviews without hiding missing results."""
from copy import deepcopy

def assemble(items,rows):
 ids=[r['id'] for r in items]
 if len(ids)!=len(set(ids)):raise ValueError('Duplicate source relation ID')
 observed={}
 for row in rows:
  rid=row['relation_id']
  if rid not in ids:raise ValueError('Unknown dispatched relation')
  if rid in observed:raise ValueError('Repeated dispatched relation')
  c=row['classification'];entry={'relation_id':rid,'status':c['status'],'assessment':None,'semantic_approval':False}
  if c['status']=='structural_proposal':
   answers=c['record']['assessments']
   if len(answers)!=1 or answers[0]['relation_id']!=rid:raise ValueError('Response does not match focused dispatch')
   entry['assessment']=deepcopy(answers[0])
  observed[rid]=entry
 entries=[observed.get(rid,{'relation_id':rid,'status':'not_dispatched','assessment':None,'semantic_approval':False}) for rid in ids]
 return {'entries':entries,'dispatch_complete':len(observed)==len(ids),'assessment_complete':all(x['assessment'] is not None for x in entries),'semantic_approval':False,'independent_validation':False,'scope':'Each source relationship remains represented, including unavailable checks. Complete dispatch is not correct interpretation.'}
