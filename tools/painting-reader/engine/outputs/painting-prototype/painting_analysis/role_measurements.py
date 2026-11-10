"""Located, deterministic candidate relationships; no automatic focal-point detector."""
from __future__ import annotations

import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from .features import measure
from .formal import extract_fields

METHOD = "Box envelopes and existing coarse sparse masks; square dilation rings at 3% and 6% of the short image side. Lab means use D65 sRGB assumptions inherited from the analyzed reproduction. Delta E is Euclidean CIELAB (1976). No learned salience, silhouette, gaze or physical-material measurement."


def box_mask(size, box):
    if len(box) != 4 or not all(math.isfinite(x) for x in box) or not (0 <= box[0] < box[2] <= 1 and 0 <= box[1] < box[3] <= 1):
        raise ValueError("Invalid analysis-frame candidate box")
    w, h = size
    bounds = [round(box[0]*w), round(box[1]*h), round(box[2]*w), round(box[3]*h)]
    if bounds[0] == bounds[2] or bounds[1] == bounds[3]:
        raise ValueError("Candidate box is empty at this resolution")
    mask = np.zeros((h,w), dtype=bool)
    mask[bounds[1]:bounds[3],bounds[0]:bounds[2]] = True
    return mask, bounds


def ring(mask, radius):
    expanded = np.asarray(Image.fromarray(mask.astype('uint8')*255).filter(ImageFilter.MaxFilter(2*radius+1))) > 0
    return expanded & ~mask


def field_mask(field, grid, size):
    mask = np.zeros((size[1],size[0]), dtype=bool)
    for x,y in field['cells_xy']:
        mask[grid['y_pixel_boundaries'][y]:grid['y_pixel_boundaries'][y+1], grid['x_pixel_boundaries'][x]:grid['x_pixel_boundaries'][x+1]] = True
    return mask


def neighborhood(image, arrays, mask, fraction):
    radius = max(1, round(min(image.size)*fraction))
    surround = ring(mask,radius)
    if not surround.any():
        return {'radius_pixels':radius,'ring_pixels':0,'signed_lightness_difference':None,'mean_color_distance':None,'edge_density_difference':None}
    a,b = arrays['lab'][mask].mean(0),arrays['lab'][surround].mean(0)
    return {'radius_pixels':radius,'ring_pixels':int(surround.sum()),
        'signed_lightness_difference':float(a[0]-b[0]), 'mean_color_distance':float(np.linalg.norm(a-b)),
        'edge_density_difference':float(arrays['strong_edges'][mask].mean()-arrays['strong_edges'][surround].mean())}


def measure_roles(image, reasoning):
    measurements,arrays = measure(image)
    formal = extract_fields(image,arrays,measurements,{'analysis_bounds_in_source':[0,0,1,1]})
    usable = {e['id']:e for e in reasoning['evidence'] if e['status'] not in {'rejected','needs_review','requires_external_evidence'}}
    candidates,evidence = [],[]
    for item in reasoning['evidence']:
        if not item['id'].startswith('B-') or item['id'] not in usable:continue
        rid = item['id'][2:]
        obs = usable.get('E-'+rid)
        if not obs:continue
        box = item.get('facts',{}).get('bbox_analysis')
        if box is None:continue
        mask,bounds = box_mask(image.size,box)
        area = float(mask.mean())
        if not .003 <= area <= .8:continue
        cid = 'C'+str(len(candidates)+1)
        near,wide = neighborhood(image,arrays,mask,.03),neighborhood(image,arrays,mask,.06)
        sign = lambda value: 0 if value is None or abs(value)<1e-6 else 1 if value>0 else -1
        near_sign,wide_sign=sign(near['signed_lightness_difference']),sign(wide['signed_lightness_difference'])
        stable = 'unavailable' if not near['ring_pixels'] or not wide['ring_pixels'] else 'same_direction' if near_sign==wide_sign else 'direction_changes'
        oid,mid = cid+'-O',cid+'-N'
        evidence.append({'id':oid,'kind':'visual_description','status':'model_proposal_unreviewed','candidate_ids':[cid],
            'statement':obs['statement'],'source_evidence_id':obs['id'],'limitations':obs.get('limitations',[])})
        facts={'bbox_analysis':box,'pixel_bounds':bounds,'area_fraction':area,'mean_lab':arrays['lab'][mask].mean(0).tolist(),
            'edge_density':float(arrays['strong_edges'][mask].mean()),'near_ring':near,'wide_ring':wide,'lightness_direction_control':stable}
        evidence.append({'id':mid,'kind':'measurement','status':'measured','candidate_ids':[cid],'facts':facts,
            'statement':f'{cid} is a proposed box envelope compared with its two surrounding pixel rings; the signed lightness differences describe the box minus each ring.',
            'source_evidence_id':item['id'],'limitations':['The box includes background and other forms. Its mean, area and contrasts do not measure an object silhouette or artistic importance.','Ring width and framing affect these descriptors.']})
        candidates.append({'id':cid,'source_region_id':rid,'bbox_analysis':box,'pixel_bounds':bounds,'evidence_ids':[oid,mid]})
    # No area-based or semantic winner is selected. Every eligible source box is kept.
    sparse = [f for f in formal['fields'] if f['kind']=='sparse']
    fields=[]
    for index,f in enumerate(sparse,1):
        fid='S'+str(index);mask=field_mask(f,formal['grid'],image.size)
        fields.append({'id':fid,**{k:f[k] for k in ['cells_xy','bbox_analysis','area_fraction','touches_boundary']}})
        evidence.append({'id':fid+'-M','kind':'measurement','status':'measured','candidate_ids':[],
            'statement':f'{fid} is a connected low-detail field; negative-space status has not been established.',
            'facts':{'area_fraction':float(mask.mean()),'touches_boundary':f['touches_boundary']},
            'limitations':['May include depicted surfaces, mounts, inscriptions or margins. Sparse texture is not sufficient evidence of negative space.']})
        for c in candidates:
            box,_=box_mask(image.size,c['bbox_analysis']);neighborhood_mask=ring(box,max(1,round(min(image.size)*.06)))
            common=int((neighborhood_mask&mask).sum())
            if not common:continue
            eid=c['id']+'-'+fid+'-R'
            facts={'field_id':fid,'field_fraction_inside_box':float((mask&box).sum()/mask.sum()),
                'ring_fraction_in_field':float(common/neighborhood_mask.sum()),'field_fraction_in_ring':float(common/mask.sum()),
                'field_touches_image_boundary':f['touches_boundary']}
            evidence.append({'id':eid,'kind':'measurement','status':'measured','candidate_ids':[c['id']],
                'statement':f'The wide surrounding ring of candidate {c["id"]} intersects low-detail field {fid}; overlap and adjacency refer to the box envelope and coarse field.',
                'facts':facts,'limitations':['No verified foreground/background ownership, contour or negative-space designation follows from this intersection.']})
    gaps=[]
    for i,a in enumerate(candidates):
        for b in candidates[i+1:]:
            aa,bb=a['bbox_analysis'],b['bbox_analysis'];gap=None;axis=None
            for order in ((aa,bb),(bb,aa)):
                left,right=order
                if left[2]<right[0] and min(left[3],right[3])>max(left[1],right[1]):
                    gap=[left[2],max(left[1],right[1]),right[0],min(left[3],right[3])];axis='horizontal';break
                if left[3]<right[1] and min(left[2],right[2])>max(left[0],right[0]):
                    gap=[max(left[0],right[0]),left[3],min(left[2],right[2]),right[1]];axis='vertical';break
            if gap is None:continue
            try:mask,bounds=box_mask(image.size,gap)
            except ValueError:continue
            eid=a['id']+'-'+b['id']+'-G'
            gaps.append({'id':eid,'bbox_analysis':gap,'candidate_ids':[a['id'],b['id']]})
            evidence.append({'id':eid,'kind':'measurement','status':'measured','candidate_ids':[a['id'],b['id']],
                'statement':f'A {axis} rectangular interval separates the two proposed box envelopes. The interval can contain other depicted forms.',
                'facts':{'bbox_analysis':gap,'pixel_bounds':bounds,'area_fraction':float(mask.mean()),'edge_density':float(arrays['strong_edges'][mask].mean())},
                'limitations':['This is a box-to-box interval, not an automatically identified empty area or negative-space silhouette.']})
    return {'method':METHOD,'image_size':list(image.size),'candidates':candidates,'sparse_fields':fields,'grid':formal['grid'],
        'intervals':gaps,'evidence':evidence,'selection':'All eligible source boxes with 0.3%–80% rasterized area; no salience score or forced winner. Whole-image envelopes excluded.'}


def overlay(image, measured):
    layer=Image.new('RGBA',image.size,(0,0,0,0));draw=ImageDraw.Draw(layer)
    colors=[(45,135,155,85),(174,112,43,85),(121,75,163,85),(64,146,85,85),(178,70,87,85)]
    for i,f in enumerate(measured['sparse_fields']):
        mask=field_mask(f,measured['grid'],image.size)
        tint=Image.new('RGBA',image.size,colors[i%len(colors)])
        layer.alpha_composite(Image.composite(tint,Image.new('RGBA',image.size),(Image.fromarray(mask.astype('uint8')*255))))
    draw=ImageDraw.Draw(layer)
    for c in measured['candidates']:
        bounds=c['pixel_bounds'];draw.rectangle(bounds,outline=(220,42,35,255),width=2)
        draw.rectangle((bounds[0],bounds[1],bounds[0]+24,bounds[1]+14),fill=(255,250,238,245));draw.text((bounds[0]+2,bounds[1]),c['id'],fill=(100,15,10,255))
    return Image.alpha_composite(image.convert('RGBA'),layer).convert('RGB')
