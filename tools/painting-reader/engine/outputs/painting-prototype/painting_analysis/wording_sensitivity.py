"""Matched wording diagnostics; never an accuracy score or semantic approval."""
def compare_arms(arms):
    if set(arms)!={'neutral','positive','negative'}:raise ValueError('All three arms required')
    bindings=[r['request']['bindings'] for r in arms.values()]
    for key in ['case_id','probe_id','image_sha256']:
        if len({b[key] for b in bindings})!=1:raise ValueError('Mismatched '+key)
    if len({r['request']['data']['question'] for r in arms.values()})!=1:raise ValueError('Mismatched question')
    for name,r in arms.items():
        if r['request']['bindings']['arm']!=name:raise ValueError('Mismatched arm')
        if r['classification']['status']!='probe_proposal':return {'status':'comparison_unavailable','semantic_approval':False}
    a={name:r['classification']['payload']['candidate_assessment'] for name,r in arms.items()}
    p,n=a['positive'],a['negative']
    if p==n and p in {'supported','contradicted'}:flag='opposing_candidates_both_'+p
    elif {p,n}=={'supported','contradicted'}:flag='opposite_candidate_judgments'
    elif p==n:flag='same_nondecisive_judgment'
    else:flag='mixed_decisive_and_nondecisive_judgments'
    return {'status':'wording_diagnostic','assessments':a,'pattern':flag,'semantic_approval':False,'accuracy':'not_established','limitation':'Pattern describes candidate judgments, not truth or consistency of the accompanying prose. Candidate opposition is authored, not automatically proven.'}
