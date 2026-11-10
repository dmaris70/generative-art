"""Experimental mask-bound inspection, separate from interpretive reasoning."""
from __future__ import annotations
import hashlib
import re
import numpy as np
from PIL import Image
from jsonschema import Draft202012Validator
from .reasoning_model import obj, string
from .evidence_grounding import pixel_color_guard

VERSION='region-identification-0.1'
INSPECTION_PROMPT='''Inspect only the target pixels in these THREE views of one painting reproduction.
View 1: the whole unmodified image, for context. View 2: the whole image with all pixels OUTSIDE the target mask replaced by artificial gray. View 3: a tight crop of view 2. The flat gray is a diagnostic background, not part of the painting. Only original pixels retained in views 2 and 3 belong to the target. A crop adds no new resolution. Do not describe a nearby colored shape merely because it is prominent in view 1.
Describe this target alone, not the whole scene. Give a short literal label (under eight words), its broad dominant color, its visible shape, and what it might depict. Use mixed_or_uncertain if no single broad color fits. Light blue-gray may be pale_neutral; dark green may be green or dark. object_guess may be 'unresolved' or 'nonfigurative color field'. An object can be only a fragment: never infer a complete silhouette from this mask. Mark identity_status as tentative or unresolved; you cannot verify object identity from these views. Give one specific limitation. Do not propose balance, anchoring, gaze, mood, symbols, material, artist, date or intention. Return JSON only.
'''


def inspection_schema():
    return obj({'short_label':string(90),
        'dominant_color':{'enum':['pale_neutral','dark','yellow','blue','green','red','mixed_or_uncertain']},
        'visible_shape':string(160),'object_guess':string(130),
        'identity_status':{'enum':['tentative','unresolved']},'limitation':string(240)})


def prepare_views(image, mask, padding=8):
    """Preserve target RGB bytes exactly; exclude outside pixels from inspection crops."""
    if not isinstance(padding,int) or padding<0:raise ValueError('Invalid padding')
    rgb=np.asarray(image.convert('RGB'));mask=np.asarray(mask)
    if mask.dtype!=bool or mask.shape!=rgb.shape[:2]:raise ValueError('Mask must match image and be Boolean')
    ys,xs=np.nonzero(mask)
    if len(xs)<16:raise ValueError('Too few target pixels for a regional inspection')
    left,top,right,bottom=int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1)
    crop=[max(0,left-padding),max(0,top-padding),min(image.width,right+padding),min(image.height,bottom+padding)]
    isolated=np.full_like(rgb,128);isolated[mask]=rgb[mask]
    isolated_image=Image.fromarray(isolated)
    views=[image.convert('RGB'),isolated_image,isolated_image.crop(tuple(crop))]
    cx=float((xs.mean()+.5)/image.width);cy=float((ys.mean()+.5)/image.height)
    horizontal='left' if cx<1/3 else ('right' if cx>2/3 else 'center')
    vertical='upper' if cy<1/3 else ('lower' if cy>2/3 else 'middle')
    return views,{'mask_sha256':hashlib.sha256(mask.astype('uint8').tobytes()).hexdigest(),
        'mask_pixels':len(xs),'target_pixel_bounds':[left,top,right,bottom],'crop_pixel_bounds':crop,
        'centroid_normalized':[cx,cy],'centroid_zone':vertical+'-'+horizontal,
        'coordinate_scope':'Centroid/bounds of this proposed mask, not a verified object silhouette.',
        'outside_fill_rgb':[128,128,128], 'padding_pixels':padding,
        'views':[{'sha256':hashlib.sha256(v.tobytes()).hexdigest(),'size':list(v.size),'mode':v.mode} for v in views]}


def assess_inspection(payload, guard):
    errors=list(Draft202012Validator(inspection_schema()).iter_errors(payload))
    if errors:return {'schema_valid':False,'eligible_as_proposal':False,'issues':[e.message for e in errors],'semantic_approval':False}
    issues=[];color=payload['dominant_color'];fraction=guard.get('fractions',{}).get(color)
    if color!='mixed_or_uncertain':
        if fraction is None:issues.append('color_guard_unavailable')
        elif fraction<.15:issues.append('color_location_mismatch')
        elif fraction<.60:issues.append('dominant_color_support_uncertain')
    if len(payload['short_label'].split())>8:issues.append('label_too_long')
    literal=' '.join(payload[k] for k in ['short_label','visible_shape','object_guess'])
    if re.search(r'\b(?:balance|anchor|turmoil|calm|symbol|pigment|canvas|binder|intention)\w*\b',literal,re.I):
        issues.append('interpretation_or_material_in_identification')
    return {'schema_valid':True,'eligible_as_proposal':not any(i in issues for i in ['color_location_mismatch','interpretation_or_material_in_identification']),
        'issues':issues,'claimed_color_pixel_fraction':fraction,'semantic_approval':False,
        'status':'unverified_visual_proposal','scope':'Color checks cannot authenticate the object guess or visible-shape description.'}


def region_record(region_id, payload, views_binding, guard, native_hash):
    if not re.fullmatch(r'R[1-9][0-9]*',region_id):raise ValueError('Invalid region ID')
    assessment=assess_inspection(payload,guard)
    return {'region_id':region_id,'source_kind':'model_image_observation', 'native_request_sha256':native_hash,
        'view_binding':views_binding,'proposal':payload,'diagnostics':assessment,
        'location_from_mask':{'centroid_zone':views_binding['centroid_zone'],'pixel_bounds':views_binding['target_pixel_bounds']}}


def prompt_record(record):
    """Never turn a failed proposal into a supplied appearance fact."""
    result={'region_id':record['region_id'],'location_from_mask':record['location_from_mask'],
            'status':'unverified visual proposal; use IMAGE as source, never as proof of meaning'}
    if record['diagnostics']['eligible_as_proposal']:
        result['proposal']=record['proposal'];result['issues']=record['diagnostics']['issues']
    else:result['status']='Appearance withheld after diagnostic failure; inspect IMAGE or leave unresolved.'
    return result
