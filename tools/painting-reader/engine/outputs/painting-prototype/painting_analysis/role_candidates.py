"""Transparent candidate construction, separate from free model proposals and critique."""
import copy

from .assessment import component_result


def candidate_accounts(measured):
    """At most one bounded, falsifiable candidate per question; never a verdict."""
    candidates=measured['candidates'];facts={e['id']:e for e in measured['evidence']};accounts=[]
    def description(cid):return facts[cid+'-O']['statement'].split('.')[0][:150]
    def record(qid,cids,ids,text,bridge,alternative,challenge,selection):
        accounts.append({'id':qid+'-H','question_id':qid,'candidate_ids':cids,
            'generator':'transparent_rule_candidate','selection':selection,
            'statement':{'text':text,'evidence_ids':ids[:]},'bridge':{'text':bridge,'evidence_ids':ids[:]},
            'alternative':alternative,'challenge':challenge})
    if len(candidates)>=2:
        a,b=candidates[:2];aid,bid=a['id'],b['id'];af,bf=facts[aid+'-N']['facts'],facts[bid+'-N']['facts']
        av,bv=af['wide_ring']['signed_lightness_difference'],bf['wide_ring']['signed_lightness_difference']
        if av is not None and bv is not None:
            record('Q1',[aid,bid],[aid+'-O',bid+'-O',aid+'-N',bid+'-N'],
                f'The regions described as “{description(aid)}” and “{description(bid)}” may compete for emphasis through their relative size, position and value contrast against their surroundings.',
                f'The proposed envelopes occupy {af["area_fraction"]:.1%} and {bf["area_fraction"]:.1%} of the frame; box-minus-wide-ring lightness is {av:.2f} and {bv:.2f} L*. These located relationships may support distributed emphasis, without establishing a focal winner.',
                'Another candidate, semantic recognition or an inaccurate box may matter more than these envelope descriptors.',
                'Correct either box and inspect whether the proposed rivalry remains visible at different viewing scales.',
                'First two eligible source regions in preserved source order, not a salience ranking. Other candidates remain visible in the measurement table.')
    relations=[e for e in measured['evidence'] if e['id'].endswith('-R')]
    if relations:
        # Select a neighborhood relation to inspect, not an important object or an authenticated void.
        r=max(relations,key=lambda e:(e['facts']['ring_fraction_in_field'],e['id']));cid=r['candidate_ids'][0];n=facts[cid+'-N']['facts'];value=n['wide_ring']['signed_lightness_difference']
        if value is not None:
            f=r['facts'];record('Q2',[cid],[cid+'-O',cid+'-N',r['id'],f['field_id']+'-M'],
                f'The region described as “{description(cid)}” may separate from an adjacent low-detail field, providing a candidate figure–ground relationship.',
                f'{f["ring_fraction_in_field"]:.1%} of its wide surrounding ring intersects the sparse field, while {f["field_fraction_inside_box"]:.1%} of that field lies inside the box. Box-minus-ring lightness is {value:.2f} L*. Adjacency and value contrast may support separation; neither establishes a silhouette.',
                'The sparse area may be a depicted surface, mount or margin, or may interpenetrate the form rather than function as ground.',
                'Inspect actual coarse-mask cells and form boundaries; reject the candidate if the field mainly describes a mount or the proposed distinction is not visible.',
                'Largest sparse-field share of a candidate’s wide ring; an explicit inspection heuristic, not perceptual importance or negative-space classification.')
    return accounts


def candidate_cases(accounts,evidence):
    lookup={e['id']:e for e in evidence}
    from .compositional_roles import fact_view
    return [{'case_id':a['id']+':'+part,'kind':'interpretive_hypothesis' if part=='statement' else 'reasoning_bridge','text':a[part]['text'],
        'conclusion':a['statement']['text'] if part=='bridge' else None,'evidence':fact_view([lookup[eid] for eid in a[part]['evidence_ids']])}
        for a in accounts for part in ('statement','bridge')]


def assess_candidates(accounts,evidence,factual,visual):
    from .compositional_roles import withhold
    for a in accounts:
        for part in ('statement','bridge'):
            c=a[part];key=a['id']+':'+part
            c['assessment']=component_result(c['text'],'interpretive_hypothesis',c['evidence_ids'],evidence,factual[key],visual[key],bridge=part=='bridge')
        if a['statement']['assessment']['disposition']=='withheld':withhold(a['bridge']['assessment'],'Candidate account is withheld; its bridge remains dependent.')
    return accounts
