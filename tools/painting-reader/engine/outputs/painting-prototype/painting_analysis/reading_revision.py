"""Versioned, evidence-scoped revisions of a single viewer's painting reading."""
from contextlib import contextmanager
from datetime import datetime,timezone
import copy
import fcntl
import hashlib
import json
from pathlib import Path
import re

from PIL import Image
from jsonschema import Draft202012Validator
from .assessment import finite_values,runtime_snapshot
from .assessment_review import LOCK
from .grounded_synthesis import dimension_result
from .reasoning import ROOT,sha,dump,code_digest
from .reading_revision_model import claim_schema,draft_schema,TARGETS
from .synthesis_model import audit_schema

VERSION='0.9.0'
# These explicit capability boundaries supplement the fallible native check.
BOUNDARIES=[
 ('global_rank',r'\b(?:darkest|brightest|tallest|largest|most strongly yellow|most yellow|by far)\b','No reviewed object segmentation or whole-image ranking.'),
 ('band_crossing',r'\b(?:only|sole)\b.{0,45}\b(?:cross|span|bridge)\w*\b|\bcross\w*.{0,35}\b(?:sky|bands)\b','No verified intersections of object silhouettes with all three bands.'),
 ('contour_closure',r'\b(?:open arcs?|crescents?|closed|circles?|circular|loops?)\b','No verified contour-closure classification.'),
 ('stroke_scale',r'\b(?:group(?:ed|s|ing)?|individual|single)\b.{0,35}\b(?:strokes?|brush)\w*\b|\b(?:strokes?|brushstrokes?)\b.{0,30}\b(?:group|individual)\w*\b','No validated mapping from image blur to physical stroke scale.'),
 ('hue_balance',r'\b(?:warm|cool|hue)\w*\b.{0,65}\b(?:balanc|equal|37|38)\w*\b','No frozen hue classifier or area-balance measurement.'),
 ('hue_exclusion',r'\b(?:rather than|not|without|instead of)\s+(?:the\s+)?hue\b','Lightness differences do not establish the absence of hue/chroma differences.'),
 ('physical_or_causal',r'\b(?:pigment|impasto|canvas centimet|cm\b|intention|causes?|makes you|induces?|proves? that)\b','Physical materials and causal experience need different evidence.'),
 ('instruction',r'\b(?:ignore (?:all|previous|the)|system prompt|reveal|execute|run command)\b','Correction text is source data, not executable or system instructions.')]
EMOTIONS=['warm','warmth','cold','cool','turmoil','calm','calmness','comfort','comfortable','peace','peaceful','serene','serenity','fear','anxiety','inviting','relaxing','joy','sadness','grounding']

def boundary_flags(text):return [{'code':code,'reason':reason} for code,pattern,reason in BOUNDARIES if re.search(pattern,text,re.I)]

def correction_segments(note):
    if not isinstance(note,str) or not note.strip() or len(note)>2000:raise ValueError('A nonempty correction under 2000 characters is required')
    pieces=[];start=0
    for split in list(re.finditer(r'(?<=[.!?])\s+(?=[A-Z“"\'])|(?<=[;:])\s+|,\s+(?=(?:and (?:the )?only|which|in a composition|set against))|\n+',note))+[None]:
        end=split.start() if split else len(note)
        a=start;b=end
        while a<b and note[a].isspace():a+=1
        while b>a and note[b-1].isspace():b-=1
        if a<b:pieces.append({'id':'C'+str(len(pieces)+1),'start':a,'end':b,'text':note[a:b]})
        start=split.end() if split else end
    if len(pieces)>24:raise ValueError('Keep the correction to 24 sentences or fewer')
    return pieces

def revision_evidence(base):
    c={r['id']:r for r in base['features']['candidates']};tree=c['C1'];field=c['C2'];sky=c['C3']
    data=[{'id':'E-tree-shape','target':'tree','kind':'measurement','facts':tree['geometry'],
        'scope':'Approximate inherited tree box, not silhouette/full tree; height can be described without overall ranking.'},
        {'id':'E-tree-lightness','target':'tree','kind':'measurement','facts':tree['color'],
         'scope':'Signed L* and a/b differences from local ring and remaining pixels. Supports darker contrast when L* is negative, not darkest shape or absence of hue.'},
        {'id':'E-clouds','target':'clouds','kind':'visual_proposal','text':next(e['statement'] for e in base['image_evidence'] if e['id']=='O-sky'),
         'scope':'Unreviewed source description; curved forms may be described provisionally, not authenticated physical strokes or closed/open contours.'},
        {'id':'E-sky-curves','target':'clouds','kind':'measurement_proxy','facts':base['sky_probe'],
         'scope':'Broad gradient-curvature candidates only; no cloud closure, stroke scale or emotional cause.'},
        {'id':'E-field-color','target':'land','kind':'measurement','facts':{'field_mean_lab':field['color']['mean_lab'],'sky_mean_lab':sky['color']['mean_lab']},
         'scope':'Means of approximate region pixels. Supports a limited field/sky color description, not a global yellow ranking or hue-area balance.'}]
    for report in base['viewer_responses']:
        data.append({'id':report['id'],'target':{'V-tree':'tree','V-clouds':'clouds','V-land':'land'}.get(report['id'],'whole'),
            'kind':'viewer_report','text':report['statement'],'scope':'Attributed original report, not measured gaze or universal effect.'})
    return data

def checked_segments(segments,judgments,evidence):
    Draft202012Validator(claim_schema(segments,evidence)).validate({'items':judgments})
    by={j['case_id']:j for j in judgments};out=[]
    for s in segments:
        j=by[s['id']];flags=boundary_flags(s['text'])
        # Even a green same-model verdict cannot override an absent measurement family.
        personal=bool(re.search(r'\byour (?:reading|attention)\b|\byou (?:read|notice|experience|feel)\b|\bfeels?\b.{0,60}\bto you\b',s['text'],re.I))
        effective_kind='mixed' if personal and flags else 'viewer_report' if personal else j['kind']
        status='pending_verification' if flags or j['kind']=='instruction' else 'retained_as_report' if effective_kind=='viewer_report' else 'pending_verification' if j['support'] in {'unverified','contradicted'} else 'qualified' if j['support']=='partly_supported' or effective_kind=='mixed' else 'supported_with_scope'
        out.append({**s,'native':copy.deepcopy(j),'effective_kind':effective_kind,'status':status,'boundary_flags':flags})
    return out

def generation_context(base,segments,checked,evidence):
    admitted=copy.deepcopy(evidence)
    # Latest explicitly personal reports replace the old target report in the prose context.
    for target in TARGETS:
        updates=[c for c in checked if c['native']['target']==target and (c['status']=='retained_as_report' or c['effective_kind']=='mixed' and c['native']['support'] not in {'unverified','contradicted'}) and not any(f['code']=='instruction' for f in c['boundary_flags'])]
        if updates:
            admitted=[e for e in admitted if not(e['kind']=='viewer_report' and e['target']==target)]
            admitted.extend({'id':'R-'+c['id'],'target':target,'kind':'viewer_report','text':c['text'],
                'scope':'Only the attributed experience is admitted. Factual additions flagged in the correction remain pending.'} for c in updates)
    focus=[{'segment_id':c['id'],'target':c['native']['target'],'text':c['text']} for c in checked if c['status'] in {'supported_with_scope','retained_as_report','qualified'}]
    note=' '.join(s['text'] for s in segments)
    requested=[]
    lightness=next(e['facts'] for e in evidence if e['id']=='E-tree-lightness')['comparisons']
    if re.search(r'\blightness\b|\bdark\w*\b',note,re.I) and all(lightness[k] and lightness[k]['signed_lightness_difference']<0 for k in ['local_ring','remaining_image']):
        requested.append({'target':'tree','evidence_id':'E-tree-lightness','change':'Make darker lightness contrast explicit; do not claim darkest, far darker than every shape, or no hue difference.'})
    return {'evidence':admitted,'correction_focus':focus,
        'supported_feature_focus':requested,
        'pending':[{'segment_id':c['id'],'reasons':[f['reason'] for f in c['boundary_flags']] or [c['native']['reason']]} for c in checked if c['status']=='pending_verification'],
        'scope':'One viewer; short description of supported changes. Do not use pending factual additions as grounds.'}

def screen_draft(payload,context,previous):
    Draft202012Validator(draft_schema(context['evidence'])).validate(payload)
    flags=[]
    for clause in payload['clauses']:
        target=clause['case_id'];text=clause['text'];lower=text.lower()
        flags.extend({'target':target,**f} for f in boundary_flags(text))
        if re.search(r'\d|\btwo.thirds\b',text,re.I):flags.append({'target':target,'code':'numeric_scope','reason':'Keep numerical geometry in evidence, not an unqualified object-size claim.'})
        reports=' '.join(e['text'] for e in context['evidence'] if e['kind']=='viewer_report' and e['target'] in {target,'whole'}).lower()
        if not re.search(r'\b(?:you|your)\b',lower):flags.append({'target':target,'code':'attribution','reason':'Attribute the reading to this viewer.'})
        added=[w for w in EMOTIONS if re.search(r'\b'+w+r'\b',lower) and not re.search(r'\b'+w+r'\b',reports)]
        # Literal field/sky color words can be descriptive, but felt warmth/cold must be reported.
        if added:flags.append({'target':target,'code':'added_affect','reason':'Unreported affect vocabulary: '+', '.join(added)})
        denied=[w for w in EMOTIONS if re.search(r'\b(?:not (?:feel |feels |at all )?|no (?:sense of )?)'+w+r'\b',reports)]
        if any(re.search(r'\b'+w+r'\b',lower) and not re.search(r'\b(?:not (?:feel |feels |at all )?|no (?:sense of )?)'+w+r'\b',lower) for w in denied):
            flags.append({'target':target,'code':'contradicted_experience','reason':'A denied experience was restored without its negation.'})
        if target in {'clouds','land'}:
            reported_words=[w for w in EMOTIONS if re.search(r'\b'+w+r'\b',reports)]
            if reported_words and not any(re.search(r'\b'+w+r'\b',lower) for w in reported_words):flags.append({'target':target,'code':'omitted_experience','reason':'A supplied experience disappeared from the revision.'})
    paragraph=' '.join(c['text'].strip() for c in payload['clauses'])
    tree_text=payload['clauses'][0]['text']
    if context.get('supported_feature_focus') and not re.search(r'\b(?:lightness|darkness|dark|darker)\b',tree_text,re.I):
        flags.append({'target':'tree','code':'requested_feature_omitted','reason':'The supported requested lightness refinement was not applied.'})
    if len(paragraph.split())>90:flags.append({'target':'whole','code':'length','reason':'Short reading exceeds 90 words.'})
    if paragraph==previous:flags.append({'target':'whole','code':'unchanged','reason':'No new reading was produced.'})
    return paragraph,flags

def assess_draft(payload,judgments,context,previous):
    paragraph,flags=screen_draft(payload,context,previous);j={r['case_id']:r for r in judgments};assessments=[]
    if set(j)!=set(TARGETS):raise ValueError('Missing revised-sentence audit')
    for clause in payload['clauses']:
        a=dimension_result('role',clause['text'],j[clause['case_id']]);assessments.append({'target':clause['case_id'],**a})
        if a['disposition']=='withheld':flags.append({'target':clause['case_id'],'code':'audit_withheld','reason':'The native sentence audit withheld this proposal.'})
    return {'paragraph':paragraph,'eligible_for_display':not flags,'flags':flags,'assessments':assessments,
        'scope':'Automated source/wording checks and same-model audit; independent review pending.'}

def construct_supported_reading(context,evidence,checked,previous):
    """Small declared grammar; never relabels a withheld model judgment as approval."""
    feature_requested=bool(context.get('supported_feature_focus'))
    note=' '.join(c['text'] for c in checked).lower()
    if re.search(r'\b(?:not|never|no)\b',note):return None  # Negated/ambiguous updates need the free-draft path or further review.
    all_by={e['id']:e for e in evidence};available={e['id']:e for e in context['evidence']}
    g=all_by['E-tree-shape']['facts'];colors=all_by['E-tree-lightness']['facts']['comparisons']
    if not (0<g['height_fraction']<1 and all(colors[k] and colors[k]['signed_lightness_difference']<0 for k in ['local_ring','remaining_image'])):return None
    if 'height' not in all_by['V-tree']['text'].lower() or 'V-sequence' not in available:return None
    def experience(target):
        reports=[e for e in context['evidence'] if e['kind']=='viewer_report' and e['target']==target]
        for e in reversed(reports):
            text=e['text'].strip();match=None
            for pattern in [r'\bfeels?\s+(.+?)(?:\s+to you|[.;]|$)',r'\byou read (?:this|it) as\s+(.+?)(?:[.;]|$)',r'\bsense of\s+(.+?)(?:[.;]|$)']:
                match=re.search(pattern,text,re.I)
                if match:break
            quote=match.group(1).strip() if match else text if e['id'].startswith('V-') and len(text.split())<=6 else None
            if quote and quote in text and len(quote.split())<=8 and re.fullmatch(r"[A-Za-z][A-Za-z '\-]+",quote) and not boundary_flags(quote):return {'id':e['id'],'quote':quote,'source_text':text}
        return None
    clouds=experience('clouds');land=experience('land')
    if not clouds or not land:return None
    personal_update=any(quote['id'].startswith('R-') and quote['quote'].lower() not in all_by['V-'+target]['text'].lower() for target,quote in [('clouds',clouds),('land',land)])
    if not feature_requested and not personal_update:return None
    tree_report=next((e['id'] for e in context['evidence'] if e['kind']=='viewer_report' and e['target']=='tree'),None)
    if not tree_report:return None
    field=all_by['E-field-color']['facts']['field_mean_lab'];field_name='yellow field' if field[2]>0 else 'field'
    tree_text='In your reading, the tree on the right stands out first through its height and dark contrast with the surrounding scene.' if feature_requested else re.split(r'(?<=[.!?])\s+',previous,maxsplit=1)[0]
    payload={'clauses':[{'case_id':'tree','text':tree_text,
        'evidence_ids':['E-tree-shape','E-tree-lightness',tree_report]},
        {'case_id':'clouds','text':'You then notice the curved cloud forms and describe a sense of “'+clouds['quote']+'.”','evidence_ids':['E-clouds',clouds['id']]},
        {'case_id':'land','text':'The '+field_name+' feels “'+land['quote']+'” to you.','evidence_ids':['E-field-color',land['id']]}]}
    paragraph,flags=screen_draft(payload,context,previous)
    rules=[{'rule':'tree_position_height_darkness','grounds':['E-tree-shape','E-tree-lightness','V-tree',tree_report],
        'condition':'Inherited height is between zero and image height; local and remaining-image L* differences are negative; height was explicitly reported. Position/name follow this focused tree/sky/land case.'},
        {'rule':'attributed_cloud_experience','grounds':['E-clouds',clouds['id'],'V-sequence'],'exact_quote':clouds['quote'],'source_text':clouds['source_text']},
        {'rule':'attributed_field_experience','grounds':['E-field-color',land['id']],'exact_quote':land['quote'],'source_text':land['source_text']}]
    return {'payload':payload,'rules':rules,'display':{'paragraph':paragraph,'eligible_for_display':not flags,'flags':flags,'assessments':[],
        'scope':'Controlled construction from scoped image descriptors and exact attributed experience phrases. This has no fabricated native audit verdict and is not independently validated.'},
        'features_applied':[{'text':'Made the requested darker lightness contrast explicit; retained height without a whole-image ranking.' if feature_requested else 'Preserved the earlier tree reading while applying the changed personal report.','evidence_ids':['E-tree-shape','E-tree-lightness']},
            {'text':'Named the cloud forms and retained your exact reported experience.','evidence_ids':['E-clouds',clouds['id']]},
            {'text':'Kept your field response as a quote; hue balance and yellow rankings remain pending.','evidence_ids':['E-field-color',land['id']]}]}

def select_revision(draft,audit,context,evidence,checked,previous):
    native=assess_draft(draft,audit,context,previous)
    construction=construct_supported_reading(context,evidence,checked,previous) if not native['eligible_for_display'] else None
    chosen=construction['display'] if construction and construction['display']['eligible_for_display'] else native
    origin='controlled_evidence_and_report_rendering' if chosen is not native else 'native_revision_draft'
    return native,construction,{**chosen,'origin':origin}

def change_log(previous,payload,checked,features=()):
    # Each change quotes actual before/after text, rather than promising an unmade change.
    return {'previous_paragraph':previous,'revised_paragraph':' '.join(c['text'] for c in payload['clauses']),'features_applied':list(features),
        'retained_or_qualified':[{'segment_id':c['id'],'text':c['text'],'status':c['status'],'reason':c['native']['reason']} for c in checked if c['status']!='pending_verification'],
        'pending':[{'segment_id':c['id'],'text':c['text'],'reasons':[f['reason'] for f in c['boundary_flags']] or [c['native']['reason']]} for c in checked if c['status']=='pending_verification']}

def validate_revision(r):
    finite_values(r)
    Draft202012Validator(json.loads((ROOT/'schema/reading-revision.schema.json').read_text())).validate(r)
    Draft202012Validator(audit_schema(TARGETS)).validate({'items':r['draft_audit']})
    if r['version']!=VERSION or r['artifact_kind']!='reading_revision':raise ValueError('Invalid reading revision')
    segments=correction_segments(r['correction']['note'])
    if r['segments']!=segments:raise ValueError('Correction quote/offset mismatch')
    checked=checked_segments(segments,r['claim_audit'],r['evidence'])
    if checked!=r['checked_segments']:raise ValueError('Claim admission differs from capability guards')
    context=generation_context(None,segments,checked,r['evidence'])
    if context!=r['generation_context']:raise ValueError('Generation context changed')
    native,construction,assessment=select_revision(r['draft'],r['draft_audit'],context,r['evidence'],checked,r['previous_paragraph'])
    if native!=r['native_display'] or construction!=r['constructed_revision'] or assessment!=r['display']:raise ValueError('Display safeguards changed')
    controlled=assessment['origin']=='controlled_evidence_and_report_rendering'
    payload=construction['payload'] if controlled else r['draft']
    if change_log(r['previous_paragraph'],payload,checked,construction['features_applied'] if controlled else ())!=r['changes']:raise ValueError('Change log mismatch')
    return {'structure':'passed','source_scopes_and_display_guards':'passed','independent_review':'not_obtained'}

def run_revision(output,base,feedback,parent,backend,progress=None):
    output=Path(output);progress=progress or (lambda _:None)
    if (output/'revision.json').exists():raise ValueError('Completed revision is immutable')
    if feedback.get('choice')!='missing' or not feedback.get('note'):raise ValueError('No correction to apply')
    execution=runtime_snapshot(output);dump(output/'inputs/base-reading.json',base);dump(output/'inputs/feedback.json',feedback)
    if parent:dump(output/'inputs/parent-revision.json',parent)
    image_path=ROOT/'runs/reading'/base['work_id']/'image.png';image=Image.open(image_path).convert('RGB');image.save(output/'image.png')
    segments=correction_segments(feedback['note']);evidence=revision_evidence(base)
    previous=parent['display']['paragraph'] if parent else base['display']['paragraph']
    progress('Checking your correction against the available evidence')
    a=backend.check(segments,evidence,image);checked=checked_segments(segments,a['payload']['items'],evidence)
    context=generation_context(base,segments,checked,evidence)
    progress('Writing a short revision with unsupported additions kept pending')
    b=backend.draft(context,image)
    progress('Checking the revised sentences and preparing the change record')
    c=backend.audit(context,b['payload'],image)
    native,construction,display=select_revision(b['payload'],c['payload']['items'],context,evidence,checked,previous)
    controlled=display['origin']=='controlled_evidence_and_report_rendering'
    result={'version':VERSION,'artifact_kind':'reading_revision','work_id':base['work_id'],'revision_id':output.name,
        'generated_at':datetime.now(timezone.utc).isoformat(),'binding':{'code_sha256':execution,
            'base_sha256':feedback['artifact_sha256'],'image_sha256':sha(image_path),
            'feedback_revision':feedback['revision'],'feedback_sha256':sha(output/'inputs/feedback.json'),
            'parent_revision_id':feedback.get('reading_revision_id','baseline'),
            'parent_sha256':sha(output/'inputs/parent-revision.json') if parent else feedback['artifact_sha256']},
        'correction':feedback,'segments':segments,'evidence':evidence,'claim_audit':a['payload']['items'],'checked_segments':checked,
        'generation_context':context,'previous_paragraph':previous,'draft':b['payload'],'draft_audit':c['payload']['items'],
        'native_display':native,'constructed_revision':construction,'display':display,
        'changes':change_log(previous,construction['payload'] if controlled else b['payload'],checked,construction['features_applied'] if controlled else ()),
        'model':{'id':backend.lock['model_id'],'revision':backend.lock['revision'],'independent_validation':False}}
    validation=validate_revision(result)
    if code_digest()!=execution:raise RuntimeError('Sources changed during revision; native cache retained')
    dump(output/'revision.json',result);dump(output/'inference-audit.json',[a,b,c]);dump(output/'validation.json',validation)
    from .reading_revision_report import render_revision
    (output/'report.html').write_text(render_revision(result,output))
    return result
