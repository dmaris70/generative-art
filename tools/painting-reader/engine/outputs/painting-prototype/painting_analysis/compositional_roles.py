"""Version 0.6: compositional roles grounded in located relationships."""
from __future__ import annotations

import copy
from datetime import datetime,timezone
import json
from pathlib import Path
import re

from PIL import Image
from jsonschema import Draft202012Validator

from .assessment import runtime_snapshot,finite_values,component_result,BAD
from .reasoning import ROOT,sha,dump,code_digest
from .role_measurements import measure_roles,overlay
from .role_model import QUESTIONS
from .role_candidates import candidate_accounts,candidate_cases,assess_candidates

VERSION='0.6.0'
PARTS=('observation','role','bridge','effect')
SOURCES=[{'title':'Getty: Elements of Art','url':'https://www.getty.edu/education/teachers/building_lessons/formal_analysis.html'},
    {'title':'Getty: Principles of Design','url':'https://www.getty.edu/education/teachers/building_lessons/formal_analysis2.html'},
    {'title':'Serenade: Description, Analysis, Interpretation and Evaluation','url':'https://serenademagazine.art/a-step-by-step-guide-to-analysing-visual-art-from-observation-to-interpretation/'}]
LIMITS=['These are development outputs from a purpose-selected collection, not independently validated interpretations.',
    'Candidate boxes are inherited model proposals and include background. Coarse low-detail masks do not establish negative space or foreground/background ownership.',
    'No focal winner, attention score, actual gaze measurement, universal emotional effect or physical-material determination is supplied.',
    'All measurements describe the analyzed reproduction. Framing, scale, mounts and box errors can affect the relationships.',
    'Source-correction reanalysis remains in version 0.4. New component overlays flag dependencies without silently recomputing these immutable results.']


def fact_view(items):
    return [{k:e[k] for k in ('id','kind','statement','status','facts','limitations','candidate_ids','source_question','source_disposition') if k in e} for e in items]


def cases_for_answers(answers,evidence):
    lookup={e['id']:e for e in evidence};cases=[]
    for a in answers:
        for part in PARTS:
            if part=='effect' and a[part]['action']=='abstain':continue
            c=a[part]
            cases.append({'case_id':a['case_id']+':'+part,'kind':'visual_description' if part=='observation' else 'reasoning_bridge' if part=='bridge' else 'viewer_response_hypothesis' if part=='effect' else 'interpretive_hypothesis',
                'text':c['text'],'conclusion':a['role']['text'] if part=='bridge' else None,
                'evidence':fact_view([lookup[eid] for eid in c['evidence_ids']])})
    return cases


def withhold(component,flag):
    component['effective_status']='unsupported';component['disposition']='withheld';component['deterministic_flags'].append(flag)


def attach_assessments(answers,evidence,factual,visual,candidates):
    facts={e['id']:e for e in evidence};valid={c['id'] for c in candidates}
    for a in answers:
        if not set(a['candidate_ids'])<=valid:raise ValueError('Unknown role candidate')
        for part in PARTS:
            c=a[part]
            if part=='effect' and c['action']=='abstain':
                c['assessment']=None
                continue
            key=a['case_id']+':'+part
            kind='visual_description' if part=='observation' else 'viewer_response_hypothesis' if part=='effect' else 'interpretive_hypothesis'
            c['assessment']=component_result(c['text'],kind,c['evidence_ids'],evidence,factual[key],visual[key],bridge=part=='bridge')
            selected=[facts[eid] for eid in c['evidence_ids']]
            if part in {'role','bridge'}:
                measurements=[e for e in selected if e['kind']=='measurement' and e.get('candidate_ids')]
                observations=[e for e in selected if e['kind']=='visual_description']
                if len(measurements)<2 or not observations:
                    withhold(c['assessment'],'A role/bridge requires a visual description and at least two located measurement premises; no isolated-feature inference.')
                if not a['candidate_ids'] or not set(a['candidate_ids'])<=set(cid for e in selected for cid in e.get('candidate_ids',[])):
                    withhold(c['assessment'],'Selected candidates are not all grounded in this component’s cited premises.')
                if a['state']=='unresolved':withhold(c['assessment'],'Role explicitly unresolved; retained as a question rather than a supported interpretation.')
        # Support for a possible effect cannot bypass a withheld observation or role.
        dependency={'role':['observation'],'bridge':['observation','role'],'effect':['observation','role','bridge']}
        for part,parents in dependency.items():
            c=a[part]['assessment']
            if c is None:continue
            if any(a[p]['assessment'] and a[p]['assessment']['disposition']=='withheld' for p in parents):
                withhold(c,'An upstream observation/role is withheld; dependent interpretation is not established.')
    return answers


def check_component(c,evidence):
    if not set(c['evidence_ids'])<=evidence:raise ValueError('Dangling role citation')
    assessment=c.get('assessment')
    if assessment is None:return
    if assessment['text']!=c['text'] or assessment['evidence_ids']!=c['evidence_ids']:raise ValueError('Assessment does not match component')
    if assessment['effective_status'] in BAD and assessment['disposition']!='withheld':raise ValueError('Unsupported role component promoted')
    if assessment['effective_kind']!='visual_description' and assessment['effective_status']=='directly_supported':raise ValueError('Interpretation promoted to fact')


def validate_roles(result):
    finite_values(result)
    Draft202012Validator(json.loads((ROOT/'schema/roles.schema.json').read_text())).validate(result)
    facts={e['id']:e for e in result['measurements']['evidence']};evidence=set(facts)
    if len(evidence)!=len(result['measurements']['evidence']):raise ValueError('Duplicate role evidence')
    candidates={c['id'] for c in result['measurements']['candidates']}
    if len(candidates)!=len(result['measurements']['candidates']):raise ValueError('Duplicate role candidate')
    if result['questions']!=QUESTIONS or [a['case_id'] for a in result['answers']]!=[q['id'] for q in QUESTIONS]:raise ValueError('Question alignment changed')
    for a in result['answers']:
        if not set(a['candidate_ids'])<=candidates:raise ValueError('Unknown role candidate')
        for part in PARTS:
            check_component(a[part],evidence)
            if part=='effect' and ((a[part]['action']=='abstain') != (a[part]['assessment'] is None)):raise ValueError('Abstention carries a positive assessment')
        for part in ('role','bridge'):
            c=a[part];cited=[facts[eid] for eid in c['evidence_ids']]
            sufficient=len([e for e in cited if e['kind']=='measurement' and e.get('candidate_ids')])>=2 and any(e['kind']=='visual_description' for e in cited)
            grounded=bool(a['candidate_ids']) and set(a['candidate_ids'])<=set(cid for e in cited for cid in e.get('candidate_ids',[]))
            if (not sufficient or not grounded or a['state']=='unresolved') and c['assessment']['disposition']!='withheld':raise ValueError('Role bypassed its located-premise gate')
        for part,parents in {'role':['observation'],'bridge':['observation','role'],'effect':['observation','role','bridge']}.items():
            c=a[part]['assessment']
            if c and any(a[p]['assessment']['disposition']=='withheld' for p in parents) and c['disposition']!='withheld':raise ValueError('Role dependency bypassed')
    seen=set()
    for a in result['candidate_accounts']:
        if a['id'] in seen or a['question_id'] not in {'Q1','Q2'} or a['id']!=a['question_id']+'-H':raise ValueError('Invalid candidate account identity')
        seen.add(a['id'])
        if not set(a['candidate_ids'])<=candidates:raise ValueError('Unknown proposed-account candidate')
        for part in ('statement','bridge'):check_component(a[part],evidence)
        if a['statement']['assessment']['disposition']=='withheld' and a['bridge']['assessment']['disposition']!='withheld':raise ValueError('Candidate dependency bypassed')
    return {'structure':'passed','question_alignment':'passed','independent_expert_review':'not_obtained'}


def run_roles(wid,output,backend,source=None,progress=None):
    progress=progress or (lambda _:None);source=Path(source or ROOT/'runs/reasoning'/wid);output=Path(output)
    if (output/'roles.json').exists():raise ValueError('Completed role artifact is immutable')
    old=json.loads((source/'reasoning.json').read_text())
    if old['work_id']!=wid:raise ValueError('Role source identity mismatch')
    execution=runtime_snapshot(output)
    (output/'inputs/reasoning.json').write_bytes((source/'reasoning.json').read_bytes())
    image=Image.open(source/'images/whole.png').convert('RGB');image.save(output/'image.png')
    measured=measure_roles(image,old);overlay(image,measured).save(output/'overlay.png')
    audit=[];accounts=candidate_accounts(measured)
    if measured['candidates']:
        progress('Proposing emphasis and figure–ground roles from located relationships')
        response=backend.roles(measured,[image,Image.open(output/'overlay.png').convert('RGB')]);audit.append(response)
        answers=copy.deepcopy(response['payload']['items'])
        cases=cases_for_answers(answers,measured['evidence'])+candidate_cases(accounts,measured['evidence']);checks=[]
        for pictures in (None,[image]):
            progress('Checking cited premises' if pictures is None else 'Checking visible basis separately')
            response=backend.support(cases,pictures);audit.append(response);checks.append({j['case_id']:j for j in response['payload']['items']})
        attach_assessments(answers,measured['evidence'],*checks,measured['candidates'])
        assess_candidates(accounts,measured['evidence'],*checks)
    else:
        answers=[]
        for q in QUESTIONS:
            c={'text':'No eligible located candidate is available; the question remains unresolved.','evidence_ids':[]}
            a={'case_id':q['id'],'state':'unresolved','candidate_ids':[],**{p:copy.deepcopy(c) for p in PARTS},'alternative':'A corrected region proposal may make analysis possible.','challenge':'Supply or correct a located visual region.'}
            a['effect'].update(action='abstain',assessment=None)
            for part in PARTS[:-1]:
                j={'case_id':q['id']+':'+part,'status':'unsupported','reason':'No eligible candidate.','missing_evidence':'Located visual regions.'}
                a[part]['assessment']=component_result(c['text'],'interpretive_hypothesis',[],[],j)
            answers.append(a)
    result={'version':VERSION,'artifact_kind':'compositional_roles','work_id':wid,'generated_at':datetime.now(timezone.utc).isoformat(),
        'binding':{'code_sha256':execution,'reasoning_sha256':sha(source/'reasoning.json'),'image_sha256':sha(source/'images/whole.png')},
        'measurements':measured,'questions':QUESTIONS,'answers':answers,'candidate_accounts':accounts,
        'model':{'id':backend.lock['model_id'],'revision':backend.lock['revision'],'independent_validation':False},'method_sources':SOURCES,'limits':LIMITS}
    validation=validate_roles(result)
    if code_digest()!=execution:raise RuntimeError('Runtime changed during role inference; cached native responses retained')
    dump(output/'roles.json',result);dump(output/'inference-audit.json',audit);dump(output/'validation.json',validation)
    from .role_report import render_roles
    (output/'report.html').write_text(render_roles(result,output));progress('Role artifact complete; independent review pending')
    return result


def comparison_evidence(result,alias):
    evidence=[{**copy.deepcopy(e),'id':alias+':'+e['id'],'work_alias':alias,'source_question':None} for e in result['measurements']['evidence']]
    for a in result['answers']:
        for part in ('observation','role','bridge'):
            c=a[part];s=c['assessment']
            evidence.append({'id':alias+':'+a['case_id']+':'+part,'kind':s['effective_kind'],'statement':c['text'],
                'status':'rejected' if s['disposition']=='withheld' else 'model_proposal_unreviewed','source_question':a['case_id'],
                'work_alias':alias,'source_disposition':s['disposition'],'limitations':['Same-model source judgment; original premises and weaknesses retained.'],
                'premise_ids':[alias+':'+eid for eid in c['evidence_ids']]})
    for a in result['candidate_accounts']:
        for part in ('statement','bridge'):
            c=a[part];s=c['assessment']
            evidence.append({'id':alias+':'+a['id']+':'+part,'kind':'interpretive_hypothesis','statement':c['text'],
                'status':'rejected' if s['disposition']=='withheld' else 'model_proposal_unreviewed','source_question':a['question_id'],
                'work_alias':alias,'source_disposition':s['disposition'],'limitations':['Transparent rule-generated candidate; same-model critique is not independent validation.'],
                'premise_ids':[alias+':'+eid for eid in c['evidence_ids']]})
    return evidence


def pair_cases(items,evidence):
    lookup={e['id']:e for e in evidence};cases=[]
    for a in items:
        for part in ('statement','bridge'):
            c=a[part]
            cases.append({'case_id':a['case_id']+':'+part,'kind':'comparative_hypothesis','text':c['text'],
                'conclusion':a['statement']['text'] if part=='bridge' else None,'evidence':fact_view([lookup[eid] for eid in c['evidence_ids']])})
    return cases


def normalized_pair(payload,evidence,checks):
    items=[];lookup={e['id']:e for e in evidence}
    for raw in payload['items']:
        c=copy.deepcopy(raw);c['statement']={'text':c.pop('text'),'evidence_ids':c['evidence_ids'][:]}
        c['bridge']={'text':c['bridge'],'evidence_ids':c['evidence_ids'][:]};del c['evidence_ids']
        for part in ('statement','bridge'):
            entry=c[part];entry['assessment']=component_result(entry['text'],'interpretive_hypothesis',entry['evidence_ids'],evidence,checks[c['case_id']+':'+part],bridge=part=='bridge')
            cited=[lookup[eid] for eid in entry['evidence_ids']]
            flags=[]
            for alias in ('A','B'):
                own=[e for e in cited if e.get('work_alias')==alias]
                if not any(e.get('source_question')==c['case_id'] for e in own):flags.append('Both works require a question-aligned source account.')
            if any(e.get('source_question') not in (None,c['case_id']) for e in cited):flags.append('Evidence crosses analytical questions.')
            if any(e['status']=='rejected' for e in cited):flags.append('A cited source account is withheld.')
            if any(e.get('source_disposition')=='qualified' for e in cited) and entry['assessment']['disposition']=='proposed':
                entry['assessment'].update(effective_status='partly_supported',disposition='qualified')
                entry['assessment']['deterministic_flags'].append('Qualified source account limits the comparative conclusion.')
            if c['relation']=='unresolved':flags.append('Comparative relation explicitly unresolved.')
            if re.search(r'\b(unique|superior|inferior)\b',entry['text'],re.I):flags.append('Pair evidence cannot establish uniqueness or artistic superiority.')
            for flag in flags:withhold(entry['assessment'],flag)
        if c['statement']['assessment']['disposition']=='withheld':withhold(c['bridge']['assessment'],'Comparative statement is withheld.')
        c['scope']='this_pair_only';items.append(c)
    return items


def validate_role_comparison(result):
    finite_values(result)
    Draft202012Validator(json.loads((ROOT/'schema/role-comparison.schema.json').read_text())).validate(result)
    evidence={e['id'] for e in result['evidence']}
    if len(evidence)!=len(result['evidence']):raise ValueError('Duplicate role-comparison evidence')
    if result['questions']!=QUESTIONS or [a['case_id'] for a in result['comparisons']]!=[q['id'] for q in QUESTIONS]:raise ValueError('Comparative question alignment changed')
    if [w['alias'] for w in result['works']]!=['A','B'] or len({w['work_id'] for w in result['works']})!=2:raise ValueError('Invalid comparison identities')
    lookup={e['id']:e for e in result['evidence']}
    for c in result['comparisons']:
        for part in ('statement','bridge'):
            check_component(c[part],evidence);entry=c[part];cited=[lookup[eid] for eid in entry['evidence_ids']]
            valid=all(any(e.get('work_alias')==alias and e.get('source_question')==c['case_id'] for e in cited) for alias in ('A','B'))
            valid=valid and not any(e.get('source_question') not in (None,c['case_id']) or e['status']=='rejected' for e in cited)
            if (not valid or c['relation']=='unresolved') and entry['assessment']['disposition']!='withheld':raise ValueError('Comparative source/question gate bypassed')
            if any(e.get('source_disposition')=='qualified' for e in cited) and entry['assessment']['disposition']=='proposed':raise ValueError('Qualified source promoted without its uncertainty')
        if c['statement']['assessment']['disposition']=='withheld' and c['bridge']['assessment']['disposition']!='withheld':raise ValueError('Comparative dependency bypassed')
    cases={q['id']+':'+p for q in QUESTIONS for p in ('statement','bridge')}
    order=result['order_control']
    for key in ('original','reversed'):
        if {j['case_id'] for j in order[key]}!=cases or len(order[key])!=len(cases):raise ValueError('Incomplete order-control judgments')
    a={j['case_id']:j['status'] for j in order['original']};b={j['case_id']:j['status'] for j in order['reversed']}
    if sorted(cid for cid in a if a[cid]!=b[cid])!=order['changed_case_ids']:raise ValueError('Hidden order-control change')
    duplicate=result['duplicate_control']
    expected=[j['case_id'] for j in duplicate['raw_items'] if j['relation'] in {'different','mixed'}]
    if duplicate['pixels_equal'] is not True or duplicate['unexpected_difference_ids']!=expected:raise ValueError('Hidden duplicate-image difference')
    return {'structure':'passed','question_alignment':'passed','independent_expert_review':'not_obtained'}


def run_role_comparison(left_dir,right_dir,output,backend,progress=None):
    progress=progress or (lambda _:None);output=Path(output);directories=[Path(left_dir),Path(right_dir)]
    if (output/'role-comparison.json').exists():raise ValueError('Completed role comparison is immutable')
    sources=[json.loads((d/'roles.json').read_text()) for d in directories]
    if sources[0]['work_id']==sources[1]['work_id']:raise ValueError('Select different works; duplicate control is separate')
    execution=runtime_snapshot(output);images=[];works=[];evidence=[];audit=[]
    for alias,d,r in zip(('A','B'),directories,sources):
        image=Image.open(d/'image.png').convert('RGB');image.save(output/(alias+'.png'));images.append(image)
        (output/'inputs'/(alias+'-roles.json')).write_bytes((d/'roles.json').read_bytes())
        works.append({'alias':alias,'work_id':r['work_id'],'roles_sha256':sha(d/'roles.json'),'image_sha256':sha(d/'image.png')})
        evidence+=comparison_evidence(r,alias)
    progress('Comparing both works through identical emphasis and figure–ground questions')
    response=backend.compare_roles(fact_view(evidence),images);audit.append(response)
    placeholder={a['case_id']+':'+p:{'case_id':a['case_id']+':'+p,'status':'plausible_inference','reason':'Awaiting native assessment.','missing_evidence':'Native assessment.'} for a in response['payload']['items'] for p in ('statement','bridge')}
    items=normalized_pair(response['payload'],evidence,placeholder);cases=pair_cases(items,evidence);checks=[]
    for order,pictures in ((['A','B'],images),(['B','A'],images[::-1])):
        response=backend.support(cases,pictures,order);audit.append(response);checks.append(response['payload']['items'])
    items=normalized_pair(audit[0]['payload'],evidence,{j['case_id']:j for j in checks[0]})
    progress('Checking identical-image comparison without forcing a difference')
    duplicate_evidence=comparison_evidence(sources[0],'A')+comparison_evidence(sources[0],'B')
    duplicate=backend.compare_roles(fact_view(duplicate_evidence),[images[0],images[0]]);audit.append(duplicate)
    original={j['case_id']:j['status'] for j in checks[0]};reverse={j['case_id']:j['status'] for j in checks[1]}
    result={'version':VERSION,'artifact_kind':'role_comparison','pair_id':'--'.join(s['work_id'] for s in sources),
        'generated_at':datetime.now(timezone.utc).isoformat(),'binding':{'code_sha256':execution},'works':works,'questions':QUESTIONS,
        'evidence':evidence,'comparisons':items,'order_control':{'original':checks[0],'reversed':checks[1],'changed_case_ids':sorted(cid for cid in original if original[cid]!=reverse[cid])},
        'duplicate_control':{'pixels_equal':True,'work_id':sources[0]['work_id'],'raw_items':copy.deepcopy(duplicate['payload']['items']),
            'unexpected_difference_ids':[i['case_id'] for i in duplicate['payload']['items'] if i['relation'] in {'different','mixed'}]},
        'model':{'id':backend.lock['model_id'],'revision':backend.lock['revision'],'independent_validation':False},'method_sources':SOURCES,
        'limits':LIMITS+['Both answers address the same analytical question. Shared, different, mixed and unresolved are permitted; none establishes artistic uniqueness.',
            'Order checks reassess fixed propositions with explicit reversed image mapping; duplicate-image results remain inspectable even when they fail.']}
    validation=validate_role_comparison(result)
    if code_digest()!=execution:raise RuntimeError('Runtime changed during comparison; native caches retained')
    dump(output/'role-comparison.json',result);dump(output/'inference-audit.json',audit);dump(output/'validation.json',validation)
    from .role_report import render_role_comparison
    (output/'report.html').write_text(render_role_comparison(result,output));return result
