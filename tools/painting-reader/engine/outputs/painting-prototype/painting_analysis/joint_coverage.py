"""Exhaustive engineering coverage of retained contour/region/group inventories.

Uses unchanged linked-focus thresholds. A supported combination remains an
assistant-authored hypothesis, never an independently validated interpretation.
"""
from collections import Counter,defaultdict
from .linked_focus import contour_points,associate,eligibility,joint_decision,PROTOCOL as LINK_PROTOCOL

VERSION='joint-coverage-0.1'
PROTOCOL={'scope':'Every retained contour candidate, including all rejected audits, in every published detector condition; all supplied proposal masks and existing group readings.',
 'selection':'No candidate sampling. Optional viewer filter retains every candidate with at least one eligible joint account, in existing candidate-ID order. It is not an artistic-importance ranking.',
 'thresholds':'Reuse linked-focus-graph-0.1 thresholds without adjustment.',
 'conditions':'Each contour detector condition links to the original primary region masks and group readings. This cross-condition comparison is explicit; it is not a jointly resampled pipeline.',
 'interpretation':'Coverage of the engine’s existing records and rules; not accuracy, recall, artistic meaning, causal effect, or independent usefulness.'}


def index_associations(points,associations,groups):
    """Bitsets preserve method-specific identities, including identical masks."""
    proposal_ids=[r['proposal_id'] for r in associations]
    if len(set(proposal_ids))!=len(proposal_ids):raise ValueError('Duplicate proposal identity')
    positions={pid:i for i,pid in enumerate(proposal_ids)}
    chains={cid:{'mask':0,'samples':len(p['sample_pixels'])} for cid,p in points.items()}
    for row in associations:
        for cid in row['associated_chain_ids']:
            if cid not in chains:raise ValueError('Association refers to unknown chain')
            chains[cid]['mask']|=1<<positions[row['proposal_id']]
    group_index=[]
    for group in groups['groups']:
        if len(set(group['members']))!=len(group['members']) or any(p not in positions for p in group['members']):raise ValueError('Invalid group members')
        mask=sum(1<<positions[p] for p in group['members'])
        group_index.append({'id':group['id'],'mask':mask,'members':group['members'],'collection_id':group.get('collection_id'),
                            'readings':[(r['id'],eligibility(r['status'])) for r in group['readings']]})
    return {'chains':chains,'proposal_ids':proposal_ids,'groups':group_index}


def diagnose(candidate,index):
    ids=candidate['chain_ids'];chains=index['chains']
    if len(set(ids))!=len(ids) or any(c not in chains for c in ids):raise ValueError('Candidate has invalid chain identities')
    masks=[chains[c]['mask'] for c in ids];union=0
    for m in masks:union|=m
    enough=all(chains[c]['samples']>=LINK_PROTOCOL['minimum_unique_samples_per_chain'] for c in ids)
    scope=[];complete=[];positive=[];statuses=Counter();failures=Counter();contour=eligibility(candidate['status'])
    for i,g in enumerate(index['groups']):
        if (g['mask']&union).bit_count()<2:continue
        scope.append(i);covered=bool(ids) and all(g['mask']&m for m in masks)
        if covered:complete.append(i)
        for rid,group in g['readings']:
            premises={'contour':contour,'region_link':covered if enough else None,'group':group}
            status=joint_decision(premises);statuses[status]+=1
            for k,v in premises.items():
                if v is not True:failures[k+(' unknown' if v is None else ' failed')]+=1
            if status=='eligible_hypothesis':positive.append([i,rid])
    if not ids:stage='unlocated'
    elif not enough:stage='insufficient_chain_samples'
    elif not all(masks):stage='unassociated_chain'
    elif not scope:stage='no_multi_region_group'
    elif not complete:stage='incompatible_group_coverage'
    elif not any(any(v is True for _,v in index['groups'][i]['readings']) for i in complete):stage='no_eligible_group_reading'
    else:stage='regional_support_available'
    return {'candidate_id':candidate['id'],'family':candidate['family'],'contour_status':candidate['status'],
            'regional_stage':stage,'associated_proposals':union.bit_count(),'scope_group_count':len(scope),
            'complete_group_count':len(complete),'account_statuses':dict(statuses),'failed_premises':dict(failures),
            'eligible_accounts':positive,'semantic_approval':False}


def analyze_condition(condition,candidates,size,masks,proposals,groups):
    ids=[c['id'] for c in candidates]
    if len(ids)!=len(set(ids)):raise ValueError('Candidate IDs overlap between retained and rejected evidence')
    points=contour_points(condition,{'chain_ids':[c['id'] for c in condition['chains']]},size)
    associations=associate(points,masks,proposals['proposals']);index=index_associations(points,associations,groups)
    rows=[];summary={};eligible=[]
    for c in candidates:
        r=diagnose(c,index);rows.append(r)
        key=c['family']+'/'+c['status']
        if key not in summary:summary[key]={'candidates':0,'regional_stages':Counter(),'account_statuses':Counter(),'failed_premises':Counter(),'candidates_with_eligible_accounts':0}
        s=summary[key];s['candidates']+=1;s['regional_stages'][r['regional_stage']]+=1;s['account_statuses'].update(r['account_statuses']);s['failed_premises'].update(r['failed_premises'])
        if r['eligible_accounts']:
            s['candidates_with_eligible_accounts']+=1;eligible.append({'id':c['id'],'family':c['family'],'joint_accounts':len(r['eligible_accounts'])})
    serial_index={'proposal_ids':index['proposal_ids'],'groups':[{k:v for k,v in g.items() if k!='mask'} for g in index['groups']],
      'chains':{cid:{'unique_samples':r['samples'],'associated_proposal_indices':[i for i in range(len(index['proposal_ids'])) if r['mask']&(1<<i)]} for cid,r in index['chains'].items()}}
    return {'condition_id':condition['id'],'summary':summary,'eligible_candidates':eligible,
            'audit':{'index':serial_index,'associations':associations,'candidates':rows},
            'totals':{'chains':len(points),'candidates':len(candidates),'candidates_with_eligible_accounts':len(eligible),
                      'eligible_joint_accounts':sum(r['joint_accounts'] for r in eligible)}}
