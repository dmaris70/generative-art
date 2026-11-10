"""D36 source spans and separate, explicitly limited syntactic diagnostics."""
from copy import deepcopy
from painting_analysis.source_first_roles import compare as source_compare
LEXICAL={'supports':{'support','bear'},'holds':{'hold'},'wears':{'wear'},'touches':{'touch','contact'},'reflects':{'reflect'},'occludes':{'obscure','occlude','cover'}}

def validate(payload,lookup,parsed):
 tokens=parsed['tokens'];ids={t['id']:i for i,t in enumerate(tokens)};entities={e['id'] for e in lookup};errors=[];assertions=[]
 def span(ref):
  i,j=ids[ref['start_token']],ids[ref['end_token']]
  if i>j:raise ValueError('reversed_token_span')
  a,b=tokens[i]['source_span'][0],tokens[j]['source_span'][1]
  return [a,b],parsed['original_text'][a:b],list(range(i,j+1))
 for i,raw in enumerate(payload['assertions']):
  a=deepcopy(raw);issues=[]
  for side in ['subject','object']:
   x=a[side]
   if x['entity_id'] not in entities|{'UNRESOLVED'}:issues.append(side+':unknown_entity')
   if x['entity_id']=='UNRESOLVED' and x['scope']!='unresolved':issues.append(side+':unresolved_id_scope')
   try:x['source_span'],x['mention'],x['token_indices']=span(x['span'])
   except (ValueError,KeyError) as exc:issues.append(side+':'+str(exc));x.update(source_span=None,mention='',token_indices=[])
  if a['predicate_token'] not in ids:issues.append('unknown_predicate_anchor')
  a.update(id='A'+str(i+1),source_quote=parsed['original_text'],errors=issues)
  assertions.append(a);errors.extend(a['id']+':'+e for e in issues)
 return {'assertions':assertions,'unresolved':payload['unresolved'],'errors':errors,'structure_accepted':not errors,'semantic_approval':False,'independent_validation':False,'scope':'Exact spans are reconstructed from source tokens. Span selection, entity mapping and semantic assertions remain unverified.'}

def syntax_check(record,parsed):
 ts=parsed['tokens'];by={t['id']:t for t in ts};children={t['index']:[c for c in ts if c['head_index']==t['index'] and c['index']!=t['index']] for t in ts};out=[]
 for a in record['assertions']:
  d={'assertion_id':a['id'],'role_check':'not_assessed','scope_check':'not_assessed','issues':[],'expected_heads':{},'semantic_approval':False}
  if a['errors']:d['issues'].append('invalid_span');out.append(d);continue
  p=by[a['predicate_token']];idx=p['index'];cs=children[idx]
  if a['predicate'] not in LEXICAL:d['issues'].append('predicate_outside_syntax_coverage');out.append(d);continue
  if p['lemma'].lower() not in LEXICAL[a['predicate']]:d['issues'].append('predicate_anchor_mismatch');d['role_check']='conflict';out.append(d);continue
  passive=[c for c in cs if c['dep'] in {'nsubjpass','csubjpass'}];active=[c for c in cs if c['dep']=='nsubj'];actor=[];patient=[]
  if passive:
   patient=passive
   agents=[c for c in cs if c['dep']=='agent' or (a['predicate']=='reflects' and c['dep']=='prep' and c['lemma']=='in')]
   actor=[o for c in agents for o in children[c['index']] if o['dep']=='pobj']
  else:
   actor=active;patient=[c for c in cs if c['dep']=='dobj']
   if not actor and p['dep']=='conj':actor=[c for c in children[p['head_index']] if c['dep']=='nsubj']
  resolved=[]
  for t in actor:
   if t['text'].lower() in {'which','that','who'} and p['dep']=='relcl':resolved.append(ts[p['head_index']])
   else:resolved.append(t)
  actor=resolved
  patient=[ts[p['head_index']] if t['text'].lower() in {'which','that','who','whom'} and p['dep']=='relcl' else t for t in patient]
  if len(actor)==len(patient)==1:
   ah,ph=actor[0]['index'],patient[0]['index'];d['expected_heads']={'subject':actor[0]['id'],'object':patient[0]['id']}
   if any(t['pos']=='PRON' for t in actor+patient):d['issues'].append('pronoun_head_unresolved')
   elif ah==ph:d['issues'].append('same_head_ambiguous')
   elif ah in a['subject']['token_indices'] and ph in a['object']['token_indices'] and ph not in a['subject']['token_indices'] and ah not in a['object']['token_indices']:d['role_check']='consistent'
   else:d['role_check']='conflict';d['issues'].append('source_span_roles_conflict_with_dependencies')
  else:d['issues'].append('dependency_arguments_incomplete_or_multiple')
  ancestors=[];cursor=p;seen=set()
  while cursor['head_index']!=cursor['index'] and cursor['head_index'] not in seen:
   seen.add(cursor['head_index']);cursor=ts[cursor['head_index']];ancestors.append(cursor)
  scope=None;local=[c['lemma'].lower() for c in cs];context=[p]+ancestors
  conditional=any(c['lemma'].lower() in {'if','unless','whether'} and c['dep']=='mark' for t in context for c in children[t['index']])
  modal=any(c['tag']=='MD' and c['lemma'].lower() in {'may','might','could','would','can','should'} for t in context for c in children[t['index']])
  unestablished=any(t['lemma'].lower() in {'establish','confirm','know','determine'} and any(c['dep']=='neg' for c in children[t['index']]) for t in ancestors)
  attribution=any(t['lemma'].lower() in {'say','claim','believe','think','report','suggest','seem','appear'} for t in ancestors)
  if conditional or modal or unestablished:scope='uncertain'
  elif attribution:d['issues'].append('attribution_or_epistemic_scope_unresolved')
  elif any(c['dep']=='neg' for c in cs):scope='negated'
  elif not ancestors or p['dep'] in {'relcl','conj'}:scope='affirmed'
  if scope is not None:
   d['expected_assertion']=scope;d['scope_check']='consistent' if a['assertion']==scope else 'conflict'
   if d['scope_check']=='conflict':d['issues'].append('assertion_status_conflicts_with_dependency_scope')
  out.append(d)
 return {'assertions':out,'semantic_approval':False,'independent_validation':False,'scope':'Limited parser-based diagnostic for six predicate families. Dependency parses are predictions. Agreement does not verify entities, imagery, causality or artistic significance.'}

def compare(candidate,classification):
 base=source_compare(candidate,classification);checked=deepcopy(base)
 if classification.get('status')=='structural_proposal':
  conflicts={a['assertion_id'] for a in classification['syntax']['assertions'] if a['role_check']=='conflict' or a['scope_check']=='conflict'}
  relevant=sorted(conflicts&set(base['assertion_ids']))
  if relevant:checked.update(agreement='unclear',reason_code='syntax_model_disagreement',conflicting_assertion_ids=relevant)
 return {'unfiltered':base,'with_syntax_diagnostic':checked,'semantic_approval':False,'independent_validation':False}
