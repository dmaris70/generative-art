"""A focused revision informed by one viewer, with reproducible image features."""
from datetime import datetime,timezone
import copy
import json
from pathlib import Path
import re

from PIL import Image
from jsonschema import Draft202012Validator
from .reasoning import ROOT,sha,dump,code_digest
from .assessment import runtime_snapshot,finite_values
from .reading_features import detail_features,sky_probe,curve_overlay,focus_overlay
from .reading_model import paragraph_schema
from .grounded_synthesis import dimension_result

VERSION='0.8.0'
WORK_ID='met-436535'
TRANSFER_IDS=['met-36005','met-435866']


def viewer_context(summary,records,image_sha):
    if summary['work_id']!=WORK_ID or summary['image_sha256']!=image_sha:raise ValueError('Viewer response is bound to another image')
    lookup={r['id']:r for r in records}
    if set(summary['source_response_ids'])!=lookup.keys():raise ValueError('Incomplete viewer-response trace')
    if any(r['work_id']!=WORK_ID or r['source']['image_sha256']!=image_sha for r in records):raise ValueError('Response/image association mismatch')
    tree=next(r for r in records if r.get('reported_target')=='The vertical tree on the far right of the image')
    clouds=next(r for r in records if r.get('reported_target')=='The circular clouds')
    land=next(r for r in records if r.get('reported_target')=='The golden land')
    sequence=next(r for r in records if r['kind']=='self_reported_attention_sequence')
    return [{'id':'V-tree','kind':'viewer_report','statement':tree['verbatim_response'],'attention_order':1,'source_response_id':tree['id']},
        {'id':'V-clouds','kind':'viewer_report','statement':clouds['verbatim_response'],'attention_order':2,'source_response_id':clouds['id']},
        {'id':'V-land','kind':'viewer_report','statement':land['verbatim_response'],'attention_order':3,'source_response_id':land['id']},
        {'id':'V-sequence','kind':'viewer_report','statement':sequence['verbatim_response'],'source_response_id':sequence['id'],
         'scope':'One self-reported viewing sequence, not measured gaze or an expert annotation.'}]


def image_evidence(source,features,sky):
    lookup={e['id']:e for e in source['measurements']['evidence']};c={c['id']:c for c in features['candidates']}
    return [{'id':'O-tree','kind':'source_visual_proposal','statement':lookup['C1-O']['statement']},
        {'id':'O-sky','kind':'source_visual_proposal','statement':lookup['C3-O']['statement']},
        {'id':'O-land','kind':'source_visual_proposal','statement':lookup['C2-O']['statement']},
        {'id':'M-tree-shape','kind':'measurement','statement':'Inherited tree-box geometry; no silhouette or attention inference.','facts':c['C1']['geometry']},
        {'id':'M-tree-color','kind':'measurement','statement':'Color/lightness differences against local ring and remaining image; no automatic importance score.','facts':c['C1']['color']},
        {'id':'M-sky-curves','kind':'measurement_proxy','statement':'Curved-edge candidates at two blur scales; not a circular-cloud detector or a turmoil measurement.','facts':sky},
        {'id':'M-land-color','kind':'measurement','statement':'Average field color describes pixels; experienced warmth is a separate viewer report.','facts':c['C2']['color']}]


def paragraph_text(payload):return ' '.join(c['text'].strip() for c in payload['clauses'])


def attributed_summary(responses):
    by_id={r['id']:r['statement'].strip().rstrip('.') for r in responses}
    tree=re.sub(r'^its\s+','',by_id['V-tree'],flags=re.I)
    clouds=re.sub(r'^their\s+','',by_id['V-clouds'],flags=re.I)
    return (f'The tree on the right draws your attention first through {tree}. '
        f'Your attention then moves to the clouds, where you notice {clouds}. '
        f'The golden land feels “{by_id["V-land"]}” to you.')


def display_choice(payload,judgment,responses):
    text=paragraph_text(payload);lower=text.lower();flags=[]
    reported=' '.join(r['statement'] for r in responses).lower()
    if not re.search(r'\b(you|your)\b',lower):flags.append('Viewer attribution is missing.')
    additions=[word for word in ['calm','calmness','comfort','comfortable','peace','peaceful','serene','serenity','fear','anxiety','relaxing'] if re.search(r'\b'+word+r'\b',lower) and not re.search(r'\b'+word+r'\b',reported)]
    if additions:flags.append('An unreported emotional interpretation was added.')
    expected=[word for word in ['height','contrast','turmoil','warm'] if word in reported]
    if not all(word in lower for word in expected):flags.append('A stated viewer association was omitted.')
    if len(text.split())>90:flags.append('The account exceeds the short-reading budget.')
    assessment=dimension_result('role',text,judgment)
    if assessment['disposition']=='withheld':flags.append('Native audit withheld the generated account.')
    return {'origin':'attributed_response_summary' if flags else 'viewer_informed_model_draft',
        'paragraph':attributed_summary(responses) if flags else text,'selection_flags':flags,'generated_assessment':assessment,
        'scope':'A reading shaped by one viewer’s comments; not a universal attention order or independently validated interpretation.'}


def validate_reading(r):
    finite_values(r);Draft202012Validator(json.loads((ROOT/'schema/reading.schema.json').read_text())).validate(r)
    if r['work_id']!=WORK_ID:raise ValueError('This focused reading has a different work identity')
    for key,informed in [('image_only',False),('viewer_informed',True)]:Draft202012Validator(paragraph_schema(informed)).validate(r[key]['payload'])
    j={a['case_id']:a for a in r['audit_dimensions']}
    if set(j)!={'image_only','viewer_informed'}:raise ValueError('Missing reading audit')
    if display_choice(r['viewer_informed']['payload'],j['viewer_informed'],r['viewer_responses'])!=r['display']:raise ValueError('Displayed reading differs from attributed-source safeguards')
    if any(p['work_id']==WORK_ID or 'viewer_responses' in p for p in r['transfer_probes']):raise ValueError('Viewer feedback leaked into transfer probes')
    return {'structure':'passed','attributed_response_boundary':'passed','independent_validation':'not_obtained'}


def run_reading(output,backend,progress=None):
    progress=progress or (lambda _:None);output=Path(output)
    if (output/'reading.json').exists():raise ValueError('Completed focused reading is immutable')
    source_dir=ROOT/'runs/composition/roles'/WORK_ID;source=json.loads((source_dir/'roles.json').read_text())
    image_path=ROOT/'runs/synthesis/arguments'/WORK_ID/'image.png';image=Image.open(image_path).convert('RGB')
    feedback_dir=ROOT/'reviews/viewer-responses'/WORK_ID
    summary_file=max((feedback_dir/'summaries').glob('*.json'),key=lambda p:json.loads(p.read_text())['recorded_at'])
    summary=json.loads(summary_file.read_text());record_files=[feedback_dir/(rid+'.json') for rid in summary['source_response_ids']]
    records=[json.loads(p.read_text()) for p in record_files];responses=viewer_context(summary,records,sha(image_path))
    execution=runtime_snapshot(output);(output/'inputs/roles.json').write_bytes((source_dir/'roles.json').read_bytes())
    (output/'inputs/viewer-summary.json').write_bytes(summary_file.read_bytes())
    for f in record_files:(output/'inputs'/f.name).write_bytes(f.read_bytes())
    image.save(output/'image.png');progress('Measuring proportions, color context and curved-edge candidates')
    features=detail_features(image,source);sky,curves=sky_probe(image,source)
    curve_overlay(image,curves).save(output/'curves.png');focus_overlay(image,source).save(output/'regions.png')
    evidence=image_evidence(source,features,sky);audit=[]
    progress('Writing a short image-only account');before=backend.paragraph(evidence,image);audit.append(before)
    progress('Writing a separate viewer-informed account');after=backend.paragraph(evidence,image,responses);audit.append(after)
    cases=[{'case_id':'image_only','kind':'image_analysis','text':paragraph_text(before['payload']),'premises':evidence},
        {'case_id':'viewer_informed','kind':'attributed_viewer_reading','text':paragraph_text(after['payload']),'premises':evidence+responses}]
    checked=backend.audit_readings(cases,image);audit.append(checked);dimensions=checked['payload']['items'];j={d['case_id']:d for d in dimensions}
    display=display_choice(after['payload'],j['viewer_informed'],responses);probes=[]
    for wid in TRANSFER_IDS:
        folder=ROOT/'runs/composition/roles'/wid;s=json.loads((folder/'roles.json').read_text());im=Image.open(folder/'image.png').convert('RGB')
        (output/'inputs'/(wid+'-roles.json')).write_bytes((folder/'roles.json').read_bytes());im.save(output/(wid+'.png'))
        probes.append({'work_id':wid,'source_roles_sha256':sha(folder/'roles.json'),'source_image_sha256':sha(folder/'image.png'),
            'features':detail_features(im,s),'scope':'Numerical development probe only; no viewer feedback or semantic target labels are transferred.'})
    result={'version':VERSION,'artifact_kind':'viewer_informed_reading','work_id':WORK_ID,'generated_at':datetime.now(timezone.utc).isoformat(),
        'binding':{'code_sha256':execution,'roles_sha256':sha(source_dir/'roles.json'),'image_sha256':sha(image_path),
            'summary_sha256':sha(summary_file),'response_files':{f.name:sha(f) for f in record_files}},
        'features':features,'sky_probe':sky,'image_evidence':evidence,'viewer_responses':responses,
        'image_only':{'payload':copy.deepcopy(before['payload']),'paragraph':paragraph_text(before['payload'])},
        'viewer_informed':{'payload':copy.deepcopy(after['payload']),'paragraph':paragraph_text(after['payload'])},
        'audit_dimensions':dimensions,'display':display,'transfer_probes':probes,
        'model':{'id':backend.lock['model_id'],'revision':backend.lock['revision'],'independent_validation':False},
        'limits':['The viewer’s comments guide a revision of this case; they are not a held-out test or general audience finding.',
            'Tree height describes a supplied box. Sky curves are derivative-based candidates, not verified cloud boundaries or actual emotional causes.',
            'Curvature and color depend on resolution, blur and reproduction. A warm feeling is not inferred from mean color.',
            'The other two paintings test numerical behavior only; they do not establish interpretive generalization.']}
    validation=validate_reading(result)
    if code_digest()!=execution:raise RuntimeError('Runtime changed during focused reading; native caches retained')
    dump(output/'reading.json',result);dump(output/'inference-audit.json',audit);dump(output/'validation.json',validation)
    from .reading_report import render_reading
    (output/'report.html').write_text(render_reading(result,output));return result
