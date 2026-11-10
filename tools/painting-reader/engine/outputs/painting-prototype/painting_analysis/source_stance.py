"""Source selection, explicit verdict polarity, and connected-premise requirements."""
from .isolated_evidence import fingerprint

STANCES={'supports','opposes','unresolved','not_image_testable'}
VERDICTS={'supported','contradicted','uncertain','not_image_testable'}

def compatibility(verdict,stance):
    if verdict not in VERDICTS or stance not in STANCES:raise ValueError('Unknown verdict or explanation stance')
    if verdict=='uncertain':return 'conservative'
    if verdict=='not_image_testable':return 'consistent' if stance=='not_image_testable' else 'unresolved'
    if stance=='unresolved':return 'unresolved'
    if stance=='not_image_testable':return 'conflict'
    return 'consistent' if (verdict,stance) in {('supported','supports'),('contradicted','opposes')} else 'conflict'

def source_fields(record):
    p=record['payload'];fields=[{'id':'S1','field':'reason','text':p['reason']}]
    fields.extend({'id':'P_'+i,'field':i+'.contribution','text':v['contribution']} for i,v in sorted(p['participants'].items()))
    if any(not isinstance(x['text'],str) or not x['text'].strip() for x in fields):raise ValueError('Nonempty source fields required')
    return fields

def selected_sources(ids,fields):
    lookup={x['id']:x for x in fields}
    if len(lookup)!=len(fields) or not ids or len(set(ids))!=len(ids) or not set(ids)<=set(lookup):raise ValueError('Unique known source IDs required')
    return [dict(lookup[i]) for i in ids]

def connected_support(records):
    selected=[r for r in records if r['eligible_for_tentative_account']];issues=[]
    ids=[r['relation']['id'] for r in selected]
    if len(set(ids))!=len(ids):raise ValueError('Duplicate relation ID')
    images={r['relation']['image_sha256'] for r in selected}
    if len(images)>1:raise ValueError('One reproduction required')
    statements={' '.join(r['relation']['statement'].casefold().split()) for r in selected}
    participants=sorted({i for r in selected for i in r['relation']['participant_ids']})
    if len(statements)<2:issues.append('fewer_than_two_distinct_relation_statements')
    if len(participants)<3:issues.append('fewer_than_three_named_participants')
    graph={i:set() for i in participants}
    for r in selected:
        for i in r['relation']['participant_ids']:graph[i].update(set(r['relation']['participant_ids'])-{i})
    reached=set();todo=participants[:1]
    while todo:
        i=todo.pop()
        if i not in reached:reached.add(i);todo.extend(graph[i]-reached)
    if len(reached)!=len(participants):issues.append('disconnected_relation_groups')
    return {'eligible_for_connected_account':not issues,'relation_ids':ids,'participant_ids':participants,'issues':issues,
        'support_fingerprint':fingerprint(selected),'scope':'Selected connected particulars; not exhaustive explanation of the painting.',
        'semantic_approval':False,'independent_validation':False,
        'limits':'Graph connectivity and distinct labels/statements are necessary structural conditions here, not proof of nonredundant meaning or artistic significance.'}
