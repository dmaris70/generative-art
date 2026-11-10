"""Typed source proposals: routing is mechanical; semantic fidelity is unverified."""
from copy import deepcopy
TARGETS={'entity','part','group','region'}
ROUTES={**{k:'localize_proposal' for k in sorted(TARGETS)},'attribute':'inspect_appearance','spatial_role':'inspect_arrangement','relation':'compare_participants','interpretive_effect':'interpretation_only','context':'external_evidence','reference':'scope_only','unresolved':'unresolved'}

def bind_graph(feature,payload):
    nodes=deepcopy(payload['nodes']);ids=[n['id'] for n in nodes];errors=[]
    if len(set(ids))!=len(ids):errors.append('duplicate_node_ids')
    byid={n['id']:n for n in nodes}
    for n in nodes:
        issues=[];quote=n['source_quote'];field=n['source_field']
        if not quote or quote not in feature.get(field,''):issues.append('source_span_missing')
        refs=n['participant_ids']
        if len(set(refs))!=len(refs):issues.append('duplicate_participants')
        if n['id'] in refs:issues.append('self_reference')
        if any(r not in byid for r in refs):issues.append('dangling_participant')
        if n['kind'] not in ROUTES:issues.append('unknown_kind')
        if n['kind'] in TARGETS and refs:issues.append('target_has_claim_participants')
        if n['kind'] in {'attribute','spatial_role','relation','interpretive_effect'}:
            if not refs:issues.append('claim_without_subject')
            if any(byid[r]['kind'] not in TARGETS for r in refs if r in byid):issues.append('claim_participant_not_target')
        if n['kind']=='relation' and len(refs)<2:issues.append('relation_requires_two_participants')
        n.update(binding_errors=issues,source_binding='exact_span' if 'source_span_missing' not in issues else 'rejected',
                 route=ROUTES.get(n['kind'],'unresolved'),semantic_approval=False)
        errors.extend(n['id']+':'+e for e in issues)
    # All nodes survive, including errors; no partial graph quietly passes.
    accepted=not errors
    return {'nodes':nodes,'errors':errors,'structure_accepted':accepted,
            'dispatch':[{'node_id':n['id'],'route':n['route'],'label':n['label'],'participant_ids':n['participant_ids']} for n in nodes] if accepted else [],
            'scope_note':payload['scope_note'],'source_completeness':'not_established','semantic_approval':False}
