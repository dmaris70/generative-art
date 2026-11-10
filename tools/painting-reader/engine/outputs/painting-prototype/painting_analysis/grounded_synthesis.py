"""Staged argument construction with fixed premises and inspectable dependencies."""
from __future__ import annotations
import copy
from datetime import datetime,timezone
import json
from pathlib import Path
import random
import re

from PIL import Image
from jsonschema import Draft202012Validator
from .assessment import runtime_snapshot,finite_values
from .reasoning import ROOT,sha,dump,code_digest,EXTERNAL
from .role_model import QUESTIONS
from .semantic import interpretive_language

VERSION='0.7.0'
PARTS=('observation','relation','role','bridge')
LIMITS=['Evidence is selected before prose. A selected context is an audit input, not proof that it supports the resulting text.',
 'All image descriptions and organizing accounts remain model proposals. Same-model audits do not establish expert agreement.',
 'Measurements describe box envelopes and coarse masks in these reproductions, not silhouettes, physical materials, gaze or artistic quality.',
 'Evidence-removal controls test textual premise use and dependency handling; they do not prove human perceptual causation.',
 'These five familiar works are development examples. Independent review and a genuinely held-out collection remain pending.']


def atomic_evidence(source):
    result=[]
    for index,e in enumerate(source['measurements']['evidence']):
        base={'source_evidence_id':e['id'],'source_locator':f'roles.json#/measurements/evidence/{index}',
            'candidate_ids':e.get('candidate_ids',[]),'limitations':e['limitations']}
        if e['kind']=='visual_description':
            result.append({**base,'id':e['id'],'kind':'observation','family':'visible_content','questions':['Q1','Q2'],
                'statement':e['statement'],'value':None,'unit':None,'status':'model_proposal_unreviewed'})
            continue
        f=e['facts'];items=[]
        if e['id'].endswith('-N'):
            items=[('area','area','Box envelope area','area_fraction','fraction',['Q1','Q2']),
                ('position','position','Box envelope bounds','bbox_analysis','normalized bounds',['Q1','Q2']),
                ('local-value','local_value','Box minus wide surrounding-ring mean lightness','wide_ring/signed_lightness_difference','L*',['Q1','Q2']),
                ('local-color','local_color','Box-to-wide-ring mean CIELAB distance','wide_ring/mean_color_distance','Delta E 1976',['Q1']),
                ('local-detail','local_detail','Box minus wide-ring strong-gradient density','wide_ring/edge_density_difference','fraction',['Q1','Q2'])]
        elif e['id'].endswith('-R'):
            items=[('adjacency','sparse_adjacency','Wide-ring share intersecting this sparse field','ring_fraction_in_field','fraction',['Q2']),
                ('intrusion','sparse_intrusion','Sparse-field share inside the box envelope','field_fraction_inside_box','fraction',['Q2'])]
        elif e['id'].endswith('-G'):
            items=[('gap','box_interval','Rectangular interval between box envelopes','bbox_analysis','normalized bounds',['Q2'])]
        elif e['id'].endswith('-M'):
            items=[('extent','sparse_extent','Sparse-field area','area_fraction','fraction',['Q2'])]
        for suffix,family,label,path,unit,questions in items:
            value=f
            for key in path.split('/'):value=value[key]
            if value is None:continue
            result.append({**base,'id':e['id']+':'+suffix,'kind':'measurement','family':family,'questions':questions,
                'statement':label,'value':value,'unit':unit,'status':'measured','source_locator':base['source_locator']+'/facts/'+path})
    return result


def selections_context(selection,evidence):
    lookup={e['id']:e for e in evidence};contexts=[]
    for s in selection:
        contexts.append({'question_id':s['question_id'],'question':next(q['text'] for q in QUESTIONS if q['id']==s['question_id']),
            'action':s['action'],'support':[lookup[i] for i in s['observation_ids']+s['support_ids']],
            'challenging':[lookup[i] for i in s['challenge_ids']],'selection_reason':s['reason'],'missing_evidence':s['missing_evidence']})
    return contexts


def selection_flags(selection,evidence):
    lookup={e['id']:e for e in evidence};flags=[]
    if len(set(selection['observation_ids']+selection['support_ids']+selection['challenge_ids']))!=sum(len(selection[k]) for k in ('observation_ids','support_ids','challenge_ids')):flags.append('Supporting and challenging selections must be distinct.')
    observed=set()
    for eid in selection['observation_ids']:
        e=lookup[eid]
        if e['kind']!='observation':flags.append('Observation selection has the wrong type.')
        observed.update(e['candidate_ids'])
    for eid in selection['support_ids']+selection['challenge_ids']:
        e=lookup[eid]
        if e['kind']!='measurement' or selection['question_id'] not in e['questions']:flags.append('Measurement selection crosses the question/type boundary.')
    if len({lookup[i]['family'] for i in selection['support_ids']})<2:flags.append('Role context lacks two distinct measured feature families.')
    required=set(c for i in selection['support_ids'] for c in lookup[i]['candidate_ids'])
    if not observed or not required<=observed:flags.append('Supporting candidate regions need corresponding selected observations.')
    if selection['action']=='insufficient_data':flags.append('Selection explicitly marks insufficient data.')
    return sorted(set(flags))


def dimension_result(kind,text,judgment,flags=None):
    flags=list(flags or []);p,i,q=(judgment[k] for k in ('premises','inference','qualification'))
    status='proposed'
    if p in {'unsupported','not_assessable'} or i in {'unsupported','not_assessable'}:status='withheld'
    elif p=='partly_supported' or i=='weak' or q!='appropriate':status='qualified'
    effective=kind
    if kind in {'observation','relation'} and (interpretive_language(text) or re.search(r'\b(visual weight|focal point|emphasis|dominance|hierarchy|visual tension|anchor(?:s|ing)?|balanced?)\b',text,re.I)):
        effective='role';flags.append('Descriptive wording contains inferred-effect language; treat as a hypothesis.');status='qualified' if status=='proposed' else status
    if kind=='observation' and re.search(r'\bmeasurements?\b',text,re.I):
        flags.append('An observation cites only visual descriptions; measurement assertions belong in the separately grounded relation.');status='qualified' if status=='proposed' else status
    if kind in {'role','bridge','integration','comparison'} and i=='literal':
        flags.append('A model labeled an interpretive claim literal; the claim remains a hypothesis.');status='qualified' if status=='proposed' else status
    if EXTERNAL.search(text) or re.search(r'\b(unique|superior|inferior|viewers? (?:always|will)|proves)\b',text,re.I):flags.append('External evidence or a broader comparative basis is required.');status='withheld'
    if any(f.startswith(('Role context','Supporting candidate','Selection explicitly','Supporting and challenging','Measurement selection','Observation selection')) for f in flags):status='withheld'
    return {'raw':copy.deepcopy(judgment),'effective_kind':effective,'disposition':status,'flags':flags,'independent_review':'pending'}


def apply_dependencies(nodes):
    by_id={n['id']:n for n in nodes}
    for n in nodes:
        if any(by_id[p]['assessment']['disposition']=='withheld' for p in n['depends_on']):
            n['assessment']['disposition']='withheld';n['assessment']['flags'].append('A declared upstream argument component is withheld.')
        elif any(by_id[p]['assessment']['disposition']=='qualified' for p in n['depends_on']) and n['assessment']['disposition']=='proposed':
            n['assessment']['disposition']='qualified';n['assessment']['flags'].append('A declared upstream component is qualified.')
    return nodes


def build_nodes(selection,generated,evidence,judgments=None):
    nodes=[];sels={s['question_id']:s for s in selection};judgments=judgments or {}
    for item in generated['items']:
        qid=item['question_id'];s=sels[qid];flags=selection_flags(s,evidence)
        support=s['observation_ids']+s['support_ids']
        parents={'observation':[],'relation':[qid+':observation'],'role':[qid+':observation',qid+':relation'],'bridge':[qid+':observation',qid+':relation',qid+':role']}
        for part in PARTS:
            nid=qid+':'+part;n={'id':nid,'question_id':qid,'kind':part,'text':item[part],
                'support_ids':s['observation_ids'][:] if part=='observation' else support[:],
                'challenge_ids':[] if part=='observation' else s['challenge_ids'][:],'depends_on':parents[part]}
            if judgments:
                gate=flags[:] if part in {'role','bridge'} else []
                if item['state']=='unresolved' and part in {'role','bridge'}:gate.append('Selection explicitly unresolved at generation; interpretation remains open.')
                n['assessment']=dimension_result(part,n['text'],judgments[nid],gate)
            nodes.append(n)
    integration=generated['integration'];n={'id':'S:integration','question_id':None,'kind':'integration','text':integration['text'],
        'support_ids':[],'challenge_ids':[],'depends_on':['Q1:role','Q1:bridge','Q2:role','Q2:bridge']}
    if judgments:n['assessment']=dimension_result('integration',n['text'],judgments[n['id']],['Selection explicitly unresolved at integration.'] if integration['state']=='unresolved' else [])
    nodes.append(n)
    return apply_dependencies(nodes) if judgments else nodes


def audit_cases(nodes,evidence):
    lookup={e['id']:e for e in evidence};by_id={n['id']:n for n in nodes};cases=[]
    for n in nodes:
        premises=[lookup[i] for i in n['support_ids']]
        if n['kind']=='integration':
            premises=[{'id':pid,'kind':'source_hypothesis','statement':by_id[pid]['text'],'status':'unreviewed_generation'} for pid in n['depends_on']]
        cases.append({'case_id':n['id'],'kind':n['kind'],'text':n['text'],'premises':premises,
            'challenging_evidence':[lookup[i] for i in n['challenge_ids']],
            'conclusion_to_explain':by_id.get(n['question_id']+':role',by_id.get(n['question_id']+':statement',{})).get('text') if n['kind']=='bridge' else None})
    return cases


def dependency_removal(nodes,premise_id,evidence=None):
    removed={premise_id}
    # A selected source account carries its own primitive premises into a pair.
    while True:
        new=removed|{e['id'] for e in evidence or [] if set(e.get('premise_ids',[]))&removed}
        if new==removed:break
        removed=new
    affected={n['id'] for n in nodes if set(n['support_ids'])&removed}
    while True:
        new=affected|{n['id'] for n in nodes if set(n['depends_on'])&affected}
        if new==affected:break
        affected=new
    return sorted(affected)


def removal_plan(nodes,evidence):
    lookup={e['id']:e for e in evidence};cases=[];plan=[]
    for n in nodes:
        if n['kind']!='bridge':continue
        critical=next((eid for eid in n['support_ids'] if lookup[eid]['kind']=='measurement'),None)
        unused=next((e['id'] for e in evidence if e['id'] not in n['support_ids']+n['challenge_ids']),None)
        if critical is None:continue
        for condition,ids in [('full',n['support_ids']+([unused] if unused else [])),('remove_selected',[i for i in n['support_ids'] if i!=critical]+([unused] if unused else [])),('remove_distractor',n['support_ids'])]:
            case_id='D'+str(len(plan)+1)
            cases.append({'case_id':case_id,'kind':'bridge','text':n['text'],'premises':[lookup[i] for i in ids],
                'challenging_evidence':[],'conclusion_to_explain':None})
            plan.append({'case_id':case_id,'node_id':n['id'],'condition':condition,'available_ids':ids,
                'removed_id':critical if condition=='remove_selected' else unused if condition=='remove_distractor' else None})
    random.Random(1707).shuffle(cases)
    return {'cases':cases,'plan':plan,'graph_effects':[{'removed_id':p['removed_id'],'affected_node_ids':dependency_removal(nodes,p['removed_id'])} for p in plan if p['condition']=='remove_selected']}


def validate_synthesis(r):
    finite_values(r);Draft202012Validator(json.loads((ROOT/'schema/synthesis.schema.json').read_text())).validate(r)
    if r['questions']!=QUESTIONS or [s['question_id'] for s in r['selection']]!=['Q1','Q2']:raise ValueError('Synthesis questions changed')
    evidence={e['id']:e for e in r['evidence']};nodes={n['id']:n for n in r['nodes']}
    from .synthesis_model import selection_schema,generation_schema
    Draft202012Validator(selection_schema(r['evidence'])).validate({'items':r['selection']})
    Draft202012Validator(generation_schema()).validate(r['generation'])
    if len(evidence)!=len(r['evidence']) or len(nodes)!=9 or len(nodes)!=len(r['nodes']):raise ValueError('Duplicate/missing synthesis nodes or evidence')
    for s in r['selection']:
        if not set(s['observation_ids']+s['support_ids']+s['challenge_ids'])<=evidence.keys():raise ValueError('Dangling selected premise')
    for n in nodes.values():
        if not set(n['support_ids']+n['challenge_ids'])<=evidence.keys() or not set(n['depends_on'])<=nodes.keys():raise ValueError('Dangling argument dependency')
    checks={n['id']:n['assessment']['raw'] for n in r['nodes']}
    if build_nodes(r['selection'],r['generation'],r['evidence'],checks)!=r['nodes']:raise ValueError('Argument assessment/binding differs from deterministic reconstruction')
    if removal_plan(r['nodes'],r['evidence'])!={k:r['removal_controls'][k] for k in ('cases','plan','graph_effects')}:raise ValueError('Invalid premise-removal plan')
    if {a['case_id'] for a in r['removal_controls']['judgments']}!={p['case_id'] for p in r['removal_controls']['plan']}:raise ValueError('Incomplete premise-removal judgments')
    return {'structure':'passed','fixed_premise_bindings':'passed','independent_expert_review':'not_obtained'}


def run_synthesis(wid,output,backend,source=None,progress=None):
    progress=progress or (lambda _:None);source=Path(source or ROOT/'runs/composition/roles'/wid);output=Path(output)
    if (output/'synthesis.json').exists():raise ValueError('Completed synthesis is immutable')
    original=json.loads((source/'roles.json').read_text())
    if original['work_id']!=wid:raise ValueError('Synthesis source mismatch')
    execution=runtime_snapshot(output);(output/'inputs/roles.json').write_bytes((source/'roles.json').read_bytes())
    image=Image.open(source/'image.png').convert('RGB');image.save(output/'image.png')
    from .role_measurements import overlay
    overlay(image,original['measurements']).save(output/'overlay.png')
    evidence=atomic_evidence(original);audit=[]
    progress('Selecting atomic evidence before explanation');selected=backend.select(evidence,image);audit.append(selected)
    selection=copy.deepcopy(selected['payload']['items']);dump(output/'selection-before-generation.json',selection)
    contexts=selections_context(selection,evidence)
    progress('Generating observations, relations, roles and whole-work synthesis');generated=backend.synthesize(contexts,image);audit.append(generated)
    generation=copy.deepcopy(generated['payload']);nodes=build_nodes(selection,generation,evidence)
    progress('Auditing premises, inference and qualification separately');checked=backend.audit(audit_cases(nodes,evidence),[image]);audit.append(checked)
    nodes=build_nodes(selection,generation,evidence,{j['case_id']:j for j in checked['payload']['items']})
    progress('Testing selected-premise and distractor removal without images');controls=removal_plan(nodes,evidence)
    if controls['cases']:
        tested=backend.audit(controls['cases'],stage='premise-removal-audit');audit.append(tested);controls['judgments']=tested['payload']['items']
    else:controls['judgments']=[]
    r={'version':VERSION,'artifact_kind':'grounded_synthesis','work_id':wid,'generated_at':datetime.now(timezone.utc).isoformat(),
        'binding':{'code_sha256':execution,'roles_sha256':sha(source/'roles.json'),'image_sha256':sha(source/'image.png')},
        'questions':QUESTIONS,'evidence':evidence,'selection':selection,'generation':generation,'nodes':nodes,'removal_controls':controls,
        'model':{'id':backend.lock['model_id'],'revision':backend.lock['revision'],'independent_validation':False},'limits':LIMITS}
    validation=validate_synthesis(r)
    if code_digest()!=execution:raise RuntimeError('Runtime changed during synthesis; native caches retained')
    dump(output/'synthesis.json',r);dump(output/'inference-audit.json',audit);dump(output/'validation.json',validation)
    from .synthesis_report import render_synthesis
    (output/'report.html').write_text(render_synthesis(r,output));return r


def paired_evidence(r,alias):
    result=[{**copy.deepcopy(e),'id':alias+':'+e['id'],'work_alias':alias} for e in r['evidence']]
    for n in r['nodes']:
        if n['kind'] not in {'observation','relation','role'}:continue
        result.append({'id':alias+':'+n['id'],'kind':'source_observation' if n['kind']=='observation' else 'source_account','question_id':n['question_id'],
            'statement':n['text'],'source_kind':n['kind'],'source_disposition':n['assessment']['disposition'],'work_alias':alias,
            'status':'source_proposal','premise_ids':[alias+':'+i for i in n['support_ids']]})
    return result


def pair_contexts(selection,evidence):
    lookup={e['id']:e for e in evidence};contexts=[]
    for s in selection:
        c={'question_id':s['question_id'],'question':next(q['text'] for q in QUESTIONS if q['id']==s['question_id'])}
        for alias in ('A','B'):
            own=s[alias];ids=[own['observation_id'],own['account_id']]+own['measurement_ids']
            if len(ids)!=len(set(ids)):raise ValueError('Duplicate paired premise')
            for eid in ids:
                e=lookup[eid]
                if e['work_alias']!=alias or e.get('question_id') not in (None,s['question_id']) or e['kind']=='measurement' and s['question_id'] not in e['questions']:raise ValueError('Cross-work/question paired premise')
            if lookup[own['observation_id']]['kind']!='source_observation' or lookup[own['account_id']]['kind']!='source_account':raise ValueError('Paired account type mismatch')
            if not own['measurement_ids'] or any(lookup[i]['kind']!='measurement' for i in own['measurement_ids']):raise ValueError('Paired side lacks primitive measurement')
            c[alias]=[lookup[i] for i in ids]
        contexts.append(c)
    return contexts


def pair_nodes(selection,generation,evidence,judgments=None):
    contexts={c['question_id']:c for c in pair_contexts(selection,evidence)};nodes=[]
    for item in generation['items']:
        qid=item['question_id'];c=contexts[qid];facts=c['A']+c['B']
        for part,field in [('statement','text'),('bridge','bridge')]:
            nid=qid+':'+part;n={'id':nid,'question_id':qid,'kind':'comparison' if part=='statement' else 'bridge','text':item[field],
                'support_ids':[e['id'] for e in facts],'challenge_ids':[],'depends_on':[] if part=='statement' else [qid+':statement']}
            if judgments:
                n['assessment']=dimension_result(n['kind'],n['text'],judgments[nid])
                if any(e.get('source_disposition')=='withheld' for e in facts) or item['relation']=='unresolved':
                    n['assessment']['disposition']='withheld';n['assessment']['flags'].append('A selected source is withheld or the comparison is explicitly unresolved.')
                elif any(e.get('source_disposition')=='qualified' for e in facts) and n['assessment']['disposition']=='proposed':
                    n['assessment']['disposition']='qualified';n['assessment']['flags'].append('Qualified source uncertainty remains in the comparison.')
            nodes.append(n)
    return apply_dependencies(nodes) if judgments else nodes


def validate_synthesis_pair(r):
    finite_values(r);Draft202012Validator(json.loads((ROOT/'schema/synthesis-pair.schema.json').read_text())).validate(r)
    if r['questions']!=QUESTIONS or [s['question_id'] for s in r['selection']]!=['Q1','Q2']:raise ValueError('Paired synthesis question mismatch')
    if [w['alias'] for w in r['works']]!=['A','B'] or len({w['work_id'] for w in r['works']})!=2:raise ValueError('Invalid synthesis pair identities')
    from .synthesis_model import pair_selection_schema,pair_generation_schema
    Draft202012Validator(pair_selection_schema(r['evidence'])).validate({'items':r['selection']})
    Draft202012Validator(pair_generation_schema()).validate(r['generation'])
    expected=pair_nodes(r['selection'],r['generation'],r['evidence'],{n['id']:n['assessment']['raw'] for n in r['nodes']})
    if expected!=r['nodes']:raise ValueError('Paired argument reconstruction differs')
    original={a['case_id']:a for a in r['order_control']['original']};reverse={a['case_id']:a for a in r['order_control']['reversed']}
    if original.keys()!=reverse.keys() or original.keys()!={n['id'] for n in r['nodes']}:raise ValueError('Incomplete paired order audit')
    changed=sorted(i for i in original if any(original[i][d]!=reverse[i][d] for d in ['premises','inference','qualification']))
    if changed!=r['order_control']['changed_case_ids']:raise ValueError('Hidden paired order change')
    expected=[i['question_id'] for i in r['duplicate_control']['generation']['items'] if i['relation'] in {'mixed','different'}]
    if r['duplicate_control']['unexpected_difference_ids']!=expected or not r['duplicate_control']['pixels_equal']:raise ValueError('Hidden duplicate distinction')
    return {'structure':'passed','two_sided_question_bindings':'passed','independent_expert_review':'not_obtained'}


def run_synthesis_pair(left,right,output,backend,progress=None):
    progress=progress or (lambda _:None);directories=[Path(left),Path(right)];output=Path(output)
    if (output/'synthesis-pair.json').exists():raise ValueError('Completed synthesis pair is immutable')
    sources=[json.loads((d/'synthesis.json').read_text()) for d in directories]
    if sources[0]['work_id']==sources[1]['work_id']:raise ValueError('Different works required; duplicate control is separate')
    execution=runtime_snapshot(output);works=[];images=[];evidence=[];audit=[]
    for alias,d,r in zip(('A','B'),directories,sources):
        image=Image.open(d/'image.png').convert('RGB');image.save(output/(alias+'.png'));images.append(image)
        (output/'inputs'/(alias+'-synthesis.json')).write_bytes((d/'synthesis.json').read_bytes())
        works.append({'alias':alias,'work_id':r['work_id'],'synthesis_sha256':sha(d/'synthesis.json'),'image_sha256':sha(d/'image.png')});evidence+=paired_evidence(r,alias)
    progress('Binding evidence separately for each side and question');selected=backend.select_pair(evidence,images);audit.append(selected);selection=copy.deepcopy(selected['payload']['items'])
    dump(output/'selection-before-generation.json',selection);contexts=pair_contexts(selection,evidence)
    progress('Writing from the fixed two-sided contexts');generated=backend.compare(contexts,images);audit.append(generated);generation=copy.deepcopy(generated['payload'])
    nodes=pair_nodes(selection,generation,evidence);cases=audit_cases(nodes,evidence);checks=[]
    for order,pictures in [(['A','B'],images),(['B','A'],images[::-1])]:
        checked=backend.audit(cases,pictures,order,stage='paired-dimension-audit');audit.append(checked);checks.append(checked['payload']['items'])
    nodes=pair_nodes(selection,generation,evidence,{j['case_id']:j for j in checks[0]})
    progress('Running identical-input selection and comparison control');dup_evidence=paired_evidence(sources[0],'A')+paired_evidence(sources[0],'B')
    ds=backend.select_pair(dup_evidence,[images[0],images[0]]);audit.append(ds)
    dg=backend.compare(pair_contexts(ds['payload']['items'],dup_evidence),[images[0],images[0]]);audit.append(dg)
    a={j['case_id']:j for j in checks[0]};b={j['case_id']:j for j in checks[1]}
    r={'version':VERSION,'artifact_kind':'grounded_synthesis_pair','pair_id':'--'.join(s['work_id'] for s in sources),'generated_at':datetime.now(timezone.utc).isoformat(),
        'binding':{'code_sha256':execution},'works':works,'questions':QUESTIONS,'evidence':evidence,'selection':selection,'generation':generation,'nodes':nodes,
        'order_control':{'original':checks[0],'reversed':checks[1],'changed_case_ids':sorted(i for i in a if any(a[i][d]!=b[i][d] for d in ['premises','inference','qualification']))},
        'duplicate_control':{'pixels_equal':True,'work_id':sources[0]['work_id'],'selection':copy.deepcopy(ds['payload']['items']),'generation':copy.deepcopy(dg['payload']),
            'unexpected_difference_ids':[i['question_id'] for i in dg['payload']['items'] if i['relation'] in {'mixed','different'}]},
        'model':{'id':backend.lock['model_id'],'revision':backend.lock['revision'],'independent_validation':False},'limits':LIMITS+['Conclusions concern only these two reproductions. No uniqueness or artistic ranking is established.']}
    validation=validate_synthesis_pair(r)
    if code_digest()!=execution:raise RuntimeError('Runtime changed during paired synthesis; caches retained')
    dump(output/'synthesis-pair.json',r);dump(output/'inference-audit.json',audit);dump(output/'validation.json',validation)
    from .synthesis_report import render_synthesis_pair
    (output/'report.html').write_text(render_synthesis_pair(r,output));return r
