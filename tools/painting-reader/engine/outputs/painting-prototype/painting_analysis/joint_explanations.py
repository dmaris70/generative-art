"""Exploratory joint mechanisms with explicit, three-valued dependencies.

Rules are designed on known development data. Eligibility means the declared
numeric conditions hold, not that an artistic effect is true or useful.
"""
from __future__ import annotations
import copy
import math
from .checked_interpretation import digest

VERSION='joint-explanations-0.1'
CONDITIONS=('consensus','condition-0','condition-1','condition-2')
PROFILES={
    'primary':{'low_overlap':.25,'high_direction_overlap':.65,'high_lightness_overlap':.5,'edge_excess_L':5.0},
    'stricter':{'low_overlap':.15,'high_direction_overlap':.75,'high_lightness_overlap':.6,'edge_excess_L':10.0},
    'looser':{'low_overlap':.35,'high_direction_overlap':.55,'high_lightness_overlap':.4,'edge_excess_L':2.0},
}
MECHANISMS={
    'joint_separation':{
        'title':'Tone and direction may reinforce separation',
        'families':['lightness_overlap','direction_overlap'],
        'possible_effect':'The difference in lightness distributions and the difference in image-direction distributions may jointly help these sampled areas read as distinct.',
        'alternative':'An organizing relationship outside these measurements could still connect the areas; two differences do not establish perceptual separation.',
        'next_evidence':'Inspect the samples in the full work and compare independent separation judgments when tonal and directional evidence are varied separately.',
    },
    'directional_connection':{
        'title':'Directions may connect areas that differ in tone',
        'families':['lightness_overlap','direction_overlap'],
        'possible_effect':'Resemblance between image-direction distributions may provide a connection across sampled areas whose lightness distributions differ.',
        'alternative':'Similar aggregate directions could arise in separate structures without a continuous path or perceptual connection.',
        'next_evidence':'Inspect where direction estimates occur and whether they continue across the intervening space; obtain independent grouping judgments.',
    },
    'local_edge_separation':{
        'title':'A local edge may distinguish broadly similar tones',
        'families':['lightness_overlap','edge_excess_L'],
        'possible_effect':'Local lightness changes at contacting mask edges may distinguish areas whose overall lightness distributions overlap.',
        'alternative':'The sampled contacts could follow a dividing line or a segmentation error rather than the intended area boundary.',
        'next_evidence':'Validate the contacting mask edges independently, then compare local-edge and whole-area judgments.',
    },
}


def verify_source(source):
    if source.get('version')!='regional-evidence-0.1':raise ValueError('Unsupported source version')
    if digest({k:v for k,v in source.items() if k!='sha256'})!=source.get('sha256'):
        raise ValueError('Changed source measurement artifact')
    if set(source['conditions'])!=set(CONDITIONS):raise ValueError('Expected consensus and three declared mask conditions')


def number(value,low,high):
    if value is None:return None
    if isinstance(value,bool) or not isinstance(value,(int,float)) or not math.isfinite(value) or not low<=value<=high:
        raise ValueError('Invalid measurement value')
    return float(value)


def build_ledger(source,pair_id):
    verify_source(source)
    if pair_id not in source['conditions']['consensus']['pairs']:raise ValueError('Unknown pair')
    facts=[];regions=source['conditions']['consensus']['pairs'][pair_id]['region_ids']
    for condition in CONDITIONS:
        pair=source['conditions'][condition]['pairs'][pair_id]
        if pair['region_ids']!=regions:raise ValueError('Region identity differs across conditions')
        prefix='/conditions/'+condition+'/pairs/'+pair_id
        def add(family,suffix,value,paths,calculation=None):
            facts.append({'id':condition+':'+family+':'+suffix,'family':family,'condition':condition,
                          'value':value,'source_paths':paths,'calculation':calculation})
        overlap=pair['color_overlap']
        entries=overlap.get('lightness_histogram_intersection',[])
        if overlap['status']=='measured' and [v['bins'] for v in entries]!=[20,40]:raise ValueError('Unexpected lightness bin grids')
        for index,bins in enumerate([20,40]):
            value=entries[index]['intersection'] if overlap['status']=='measured' else None
            add('lightness_overlap',str(bins),number(value,0,1),[prefix+'/color_overlap/lightness_histogram_intersection/'+str(index)] if value is not None else [prefix+'/color_overlap/status'])
        directions=pair['directions']
        if len(directions)!=3:raise ValueError('Expected three declared direction scales')
        scales=[number(row['blur_pixels'],.000001,10000) for row in directions]
        reference=[row['blur_pixels'] for row in source['conditions']['consensus']['pairs'][pair_id]['directions']]
        if None in scales or len(set(scales))!=3 or scales!=sorted(scales) or scales!=reference:
            raise ValueError('Duplicate, reordered or mismatched direction scales')
        for i,row in enumerate(directions):
            value=row['histogram_intersection'] if row['status']=='measured' else None
            add('direction_overlap',str(i),number(value,0,1),[prefix+'/directions/'+str(i)])
        boundary=pair['direct_boundary'];means=pair['signed_mean_lab_B_minus_A']
        excess=None;calculation=None
        if boundary['status']=='measured' and means is not None:
            if boundary['edge_count']<20:raise ValueError('Measured boundary has insufficient contact edges')
            local=number(boundary['absolute_L_difference_quantiles'][2],0,100.001)
            mean=number(means[0],-100.001,100.001)
            if local is None or mean is None:raise ValueError('Invalid measured lightness')
            excess=local-abs(mean)
            calculation={'median_absolute_edge_L':local,'absolute_mean_L_difference':abs(mean),
                         'expression':'median absolute cross-edge L difference minus absolute difference of region mean L'}
        add('edge_excess_L','0',excess,[prefix+'/direct_boundary',prefix+'/signed_mean_lab_B_minus_A'],calculation)
    result={'version':VERSION,'pair_id':pair_id,'region_ids':regions,'source_sha256':source['sha256'],'facts':facts}
    result['sha256']=digest(result)
    return result


def validate_ledger(ledger):
    if digest({k:v for k,v in ledger.items() if k!='sha256'})!=ledger.get('sha256'):raise ValueError('Altered ledger')
    expected={c+':'+f+':'+s for c in CONDITIONS for f,slots in [('lightness_overlap',['20','40']),('direction_overlap',['0','1','2']),('edge_excess_L',['0'])] for s in slots}
    facts=ledger['facts']
    if len(facts)!=len(expected) or {f['id'] for f in facts}!=expected:raise ValueError('Missing or duplicate ledger slot; missing values must remain explicit')
    for f in facts:
        c,family,_=f['id'].split(':')
        if f['family']!=family or f['condition']!=c:raise ValueError('Misassigned ledger fact')
        number(f['value'],-100.001 if family=='edge_excess_L' else 0,100.001 if family=='edge_excess_L' else 1)


def requirements(kind,profile):
    p=PROFILES[profile]
    if kind=='joint_separation':return [('lightness_overlap','le',p['low_overlap']),('direction_overlap','le',p['low_overlap'])]
    if kind=='directional_connection':return [('lightness_overlap','le',p['low_overlap']),('direction_overlap','ge',p['high_direction_overlap'])]
    if kind=='local_edge_separation':return [('lightness_overlap','ge',p['high_lightness_overlap']),('edge_excess_L','ge',p['edge_excess_L'])]
    raise ValueError('Unknown mechanism')


def evaluate(ledger,kind,profile='primary'):
    validate_ledger(ledger);clauses=[]
    for family,op,threshold in requirements(kind,profile):
        facts=[f for f in ledger['facts'] if f['family']==family]
        known=[f for f in facts if f['value'] is not None]
        failed=[f['id'] for f in known if (f['value']>threshold if op=='le' else f['value']<threshold)]
        missing=[f['id'] for f in facts if f['value'] is None]
        status='not_met' if failed else 'undetermined' if missing else 'met'
        values=[f['value'] for f in known]
        clauses.append({'family':family,'operator':op,'threshold':threshold,'status':status,
                        'available':len(known),'expected':len(facts),'range':[min(values),max(values)] if values else None,
                        'fact_ids':[f['id'] for f in facts],'failed_fact_ids':failed,'missing_fact_ids':missing})
    status='not_eligible' if any(c['status']=='not_met' for c in clauses) else 'undetermined' if any(c['status']=='undetermined' for c in clauses) else 'eligible_hypothesis'
    return {'kind':kind,'profile':profile,'status':status,'clauses':clauses,
            'ledger_sha256':ledger['sha256'],'semantic_approval':False}


def intervene(ledger,fact_ids,value):
    """Explicit synthetic evidence-record operation, never a new measurement."""
    validate_ledger(ledger)
    if not set(fact_ids)<={f['id'] for f in ledger['facts']}:raise ValueError('Unknown intervention target')
    modified=copy.deepcopy(ledger)
    for f in modified['facts']:
        if f['id'] in fact_ids:f['value']=value
    modified['intervention']={'source_ledger_sha256':ledger['sha256'],'fact_ids':sorted(fact_ids),'replacement':value,
                              'scope':'Synthetic record change only; not a modified painting or measured viewer response.'}
    modified.pop('sha256');modified['sha256']=digest(modified)
    validate_ledger(modified)
    return modified


def dependency_tests(ledger,kind):
    before=evaluate(ledger,kind);tests=[]
    for clause in before['clauses']:
        # One missing required observation must not quietly become a full pass.
        for fid in clause['fact_ids']:
            after=evaluate(intervene(ledger,[fid],None),kind)
            tests.append({'operation':'remove_one_required_fact','fact_ids':[fid],'before':before['status'],'after':after['status'],
                          'passed':after['status']!='eligible_hypothesis'})
        neutral=1.0 if clause['operator']=='le' else 0.0
        after=evaluate(intervene(ledger,clause['fact_ids'],neutral),kind)
        tests.append({'operation':'neutralize_required_family','family':clause['family'],'replacement':neutral,
                      'before':before['status'],'after':after['status'],'passed':after['status']=='not_eligible'})
    dependencies={f for c in before['clauses'] for f in c['fact_ids']}
    unused=[f['id'] for f in ledger['facts'] if f['id'] not in dependencies]
    if unused:
        after=evaluate(intervene(ledger,unused,None),kind)
        tests.append({'operation':'remove_unrelated_facts','fact_ids':unused,'before':before['status'],'after':after['status'],
                      'passed':before['status']==after['status']})
    return {'scope':'Dependency checks, not experimental evidence of a perceptual mechanism. Withdrawal is asserted only for an initially eligible hypothesis.',
            'initially_eligible':before['status']=='eligible_hypothesis','checks':tests}


def compile_study(source):
    verify_source(source);pairs=[]
    for pair_id in source['conditions']['consensus']['pairs']:
        ledger=build_ledger(source,pair_id);candidates=[]
        for kind,definition in MECHANISMS.items():
            decision=evaluate(ledger,kind)
            card={'id':pair_id+':'+kind,'kind':kind,**definition,'decision':decision,
                  'profile_sensitivity':{name:evaluate(ledger,kind,name)['status'] for name in PROFILES},
                  'checked_observations':[f for f in ledger['facts'] if f['family'] in definition['families']],
                  'dependency_tests':dependency_tests(ledger,kind) if decision['status']=='eligible_hypothesis' else None,
                  'effect_origin':'authored_development_hypothesis','semantic_approval':False}
            candidates.append(card)
        pairs.append({'pair_id':pair_id,'region_ids':ledger['region_ids'],'ledger':ledger,'candidates':candidates})
    result={'version':VERSION,'source_sha256':source['sha256'],'profiles':PROFILES,'pairs':pairs,
            'policy':'Every required observation in every declared mask, bin grid and direction scale must satisfy the rule. Missing data cannot qualify.',
            'threshold_scope':'Exploratory development cutoffs designed with this cohort already known; not preregistered, trained or perceptually validated.',
            'semantic_approval':False,'publication_eligible':False}
    result['sha256']=digest(result)
    return result


def verify_compilation(source,result):
    if compile_study(source)!=result:raise ValueError('Stale or altered joint-explanation compilation')
