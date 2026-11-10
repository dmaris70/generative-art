"""Refined region proposals, directional controls and explicitly provisional accounts."""
from datetime import datetime,timezone
import copy
import importlib.metadata
import json
from pathlib import Path
import numpy as np
from PIL import Image
from jsonschema import Draft202012Validator
from .reasoning import ROOT,sha,dump,code_digest
from .assessment import runtime_snapshot,finite_values
from .region_masks import polygon_mask,discover_regions,refine_region,region_overlay
from .directional_relations import tensor_field,region_directions,summarize_field,direction_overlay
from .relational_accounts import region_color,build_relations,alternatives
from .features import load_image

VERSION='0.10.0'

def analyze_regions(image,specs,domain,protocol,progress=None):
    progress=progress or (lambda _:None);regions=[];masks={};fields=[tensor_field(image,domain,s,protocol['direction']) for s in protocol['direction']['blur_at_512']]
    for spec in specs:
        progress('Refining '+spec['label']);region_domain=domain.copy()
        for rid in spec.get('exclude_region_ids',[]):
            if rid not in masks:raise ValueError('Exclusion must refer to an earlier region')
            region_domain&=~masks[rid]['possible']
        record,data=refine_region(image,spec,region_domain,protocol['segmentation']);masks[spec['id']]=data
        directions,_=region_directions(image,domain,data['consensus'],protocol['direction'],fields)
        record['color']=region_color(image,data['consensus'],domain);record['directions']=directions
        record['boundary']={'all_condition_iou':record['all_condition_intersection_over_union'],'pairwise_iou':record['pairwise_iou'],
            'disagreement_fraction':record['disagreement_fraction_of_possible'],'extent_scope':spec['scope'],
            'sensitivity':'unavailable' if record['all_condition_intersection_over_union'] is None else 'condition_sensitive' if record['all_condition_intersection_over_union']<.75 else 'relatively_stable_in_declared_conditions',
            'accuracy':'not_independently_assessed'}
        record['boundary']['conditional_on_annotation']=True
        record['mask_condition_directions']=[{'condition':condition,'scales':[summarize_field(f,mask,image.size,protocol['direction']) for f in fields]} for condition,mask in zip(protocol['segmentation']['conditions'],data['variants'])]
        regions.append(record)
    evidence,pairs=build_relations(regions,masks,image.size)
    accounts=alternatives(regions,pairs)
    for account in accounts:
        account['origin']='declared_descriptor_construction';account['independent_review']='not_obtained'
        account['boundary_caveat']='All source masks are proposals. Perturbation stability is not boundary accuracy.'
    return {'regions':regions,'evidence':evidence,'pairs':pairs,'accounts':accounts},masks,fields

def resolution_comparison(full,small,full_masks,small_masks):
    result=[];by={r['id']:r for r in small['regions']}
    for r in full['regions']:
        rid=r['id'];a=full_masks[rid]['consensus'];b=np.asarray(Image.fromarray(small_masks[rid]['consensus'].astype('uint8')*255).resize((a.shape[1],a.shape[0]),Image.Resampling.NEAREST))>0
        union=int((a|b).sum());rows=[]
        for x,y in zip(r['directions'],by[rid]['directions']):
            xx,yy=x['primary'],y['primary'];u,v=xx['curved_fraction_of_eligible'],yy['curved_fraction_of_eligible']
            rows.append({'blur_at_full_pixels':xx['blur_pixels'],'full_curved_fraction':u,'small_curved_fraction':v,
                'difference_full_minus_small':u-v if u is not None and v is not None else None,
                'full_samples':xx['eligible_direction_pixels'],'small_samples':yy['eligible_direction_pixels']})
        result.append({'region_id':rid,'mask_iou_after_nearest_rescaling':float((a&b).sum()/union) if union else None,'direction_scales':rows,
            'scope':'Both segmentation and descriptors rerun with the same normalized specs; no expectation of exact resolution invariance.'})
    return result

def validate_relational(result):
    finite_values(result);Draft202012Validator(json.loads((ROOT/'schema/relational.schema.json').read_text())).validate(result)
    ids={e['id'] for e in result['analysis']['evidence']};accounts=result['analysis']['accounts'];allids=ids|{a['id'] for a in accounts}
    for account in accounts:
        if not set(account['support_ids']+account['challenge_ids'])<=allids:raise ValueError('Dangling relational account evidence')
        if account.get('independent_review')!='not_obtained' or account.get('origin')!='declared_descriptor_construction':raise ValueError('Unjustified interpretation approval')
    if result['partition']=='new_transfer_probe' and any('viewer' in key for key in result['analysis']):raise ValueError('Viewer responses leaked into transfer analysis')
    return {'structure':'passed','evidence_references':'passed','independent_boundary_review':'not_obtained','independent_interpretive_review':'not_obtained'}

def run_relational(output,work,protocol,discovery,capture,specs=None,progress=None):
    output=Path(output);progress=progress or (lambda _:None)
    if (output/'relations.json').exists():raise ValueError('Completed relational analysis is immutable')
    source=(ROOT/work['image_path']).resolve()
    if not source.is_relative_to(ROOT.resolve()):raise ValueError('Source image must be preserved inside the project')
    if work.get('image_sha256') and sha(source)!=work['image_sha256']:raise ValueError('Source image binding changed')
    image,processing=load_image(source,max_side=protocol['direction']['long_side']);source_size=processing['oriented_size']
    execution=runtime_snapshot(output);dump(output/'inputs/protocol.json',protocol);dump(output/'inputs/discovery.json',discovery);dump(output/'inputs/work.json',work);dump(output/'inputs/capture.json',capture)
    (output/'inputs'/('source-image'+source.suffix)).write_bytes(source.read_bytes())
    image.save(output/'image.png');domain=polygon_mask(image.size,capture['polygon']);Image.fromarray(domain.astype('uint8')*255).save(output/'domain.png')
    if specs is None:specs=discover_regions(image,domain,discovery)
    dump(output/'inputs/region-specs.json',specs)
    analysis,masks,fields=analyze_regions(image,specs,domain,protocol,progress)
    small=image.copy();small.thumbnail((256,256),Image.Resampling.LANCZOS);small.save(output/'image-256.png');small_domain=polygon_mask(small.size,capture['polygon'])
    secondary,small_masks,_=analyze_regions(small,specs,small_domain,protocol,progress)
    for rid,data in masks.items():
        for key in ['consensus','stable','possible','uncertain']:Image.fromarray(data[key].astype('uint8')*255).save(output/(rid+'-'+key+'.png'))
        for i,mask in enumerate(data['variants']):Image.fromarray(mask.astype('uint8')*255).save(output/(rid+'-condition-'+str(i)+'.png'))
    region_overlay(image,masks).save(output/'regions.png');region_overlay(image,masks,True).save(output/'disagreement.png')
    direction_overlay(image,fields[1],domain).save(output/'directions.png')
    result={'version':VERSION,'artifact_kind':'regional_relations','work_id':work['id'],'partition':work['partition'],
        'generated_at':datetime.now(timezone.utc).isoformat(),'identity':{k:work[k] for k in ['title','artist','catalog_url'] if k in work},
        'binding':{'code_sha256':execution,'source_image_sha256':sha(source),'protocol_sha256':sha(output/'inputs/protocol.json'),
            'discovery_sha256':sha(output/'inputs/discovery.json'),'specs_sha256':sha(output/'inputs/region-specs.json'),'capture_sha256':sha(output/'inputs/capture.json')},
        'capture':{'source_size':source_size,'analysis_size':list(image.size),'upsampled':False,'domain':capture,'processing':processing},
        'analysis':analysis,'resolution_control':{'size':list(small.size),'analysis':secondary,'comparison':resolution_comparison(analysis,secondary,masks,small_masks)},
        'runtime':{name:importlib.metadata.version(name) for name in ['numpy','Pillow','opencv-python','scipy']},
        'limits':['Seeded masks and automatic palette fields are region proposals, not independent annotations.',
            'Direction fields describe reproduction pixels; neither physical brushstroke grouping nor emotion is measured.',
            'Alternative accounts are declared descriptor constructions for inspection; no interpretation is selected or independently validated.',
            'New transfer images test numerical behavior and produce review materials; independent explanatory usefulness remains unmeasured.']}
    validation=validate_relational(result)
    if code_digest()!=execution:raise RuntimeError('Sources changed during analysis; no mixed-runtime artifact published')
    dump(output/'relations.json',result);dump(output/'validation.json',validation)
    worksheet={'version':VERSION,'artifact_sha256':sha(output/'relations.json'),'reviewer':None,'review_status':'not_obtained',
        'items':[{'hypothesis_id':a['id'],'visual_correctness':None,'relational_particularity':None,'evidence_fit':None,'alternative_usefulness':None,'comment':None} for a in analysis['accounts']]}
    dump(output/'review-worksheet.json',worksheet)
    from .relational_report import render_relational
    (output/'report.html').write_text(render_relational(result,output));return result
