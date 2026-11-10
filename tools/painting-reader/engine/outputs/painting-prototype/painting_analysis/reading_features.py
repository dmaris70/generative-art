"""Focused geometry, local color and level-set curvature proxies; no emotion detector."""
from __future__ import annotations
import numpy as np
from PIL import Image,ImageFilter,ImageDraw
from .features import rgb_to_lab,srgb_to_linear
from .role_measurements import box_mask,ring

METHOD={'geometry':'Rasterized inherited box width/height relative to the analyzed frame, pixel aspect and relative height ranks. Boxes are envelopes, not silhouettes.',
 'color':'D65 sRGB CIELAB mean of box minus a square-dilation surrounding ring, and versus the complement of the box. Separate lightness and a/b-plane differences; mean RGB is a display swatch, not a paint sample.',
 'curvature':'After Gaussian blur at 1/512 and 2/512 of the long side (minimum 0.5 px), central-difference derivatives estimate absolute level-set curvature: (fxx*fy^2 - 2*fxy*fx*fy + fyy*fx^2)/(fx^2+fy^2)^(3/2). Strong gradients exceed max(0.02, global 85th percentile). Boundaries and mask margins are excluded. Curvature is expressed as estimated tangent turning over 2.5% of the short side; >=12 degrees is a declared curved-edge candidate threshold.',
 'limits':'Curved-edge candidates can include depicted contours, texture, strokes and reproduction artifacts. They are neither closed-circle detection nor evidence of emotional turmoil. All results depend on image scale and supplied regions.'}


def curvature_field(image,blur_pixels):
    rgb=np.asarray(image.filter(ImageFilter.GaussianBlur(blur_pixels)),dtype=float)/255
    gray=srgb_to_linear(rgb)@np.array([.2126,.7152,.0722])
    fy,fx=np.gradient(gray);fyy,fyx=np.gradient(fy);fxy,fxx=np.gradient(fx)
    cross=(fyx+fxy)/2;magnitude=np.hypot(fx,fy)
    numerator=fxx*fy**2-2*cross*fx*fy+fyy*fx**2
    curvature=np.divide(numerator,magnitude**3,out=np.zeros_like(gray),where=magnitude>1e-8)
    threshold=max(.02,float(np.quantile(magnitude,.85)))
    strong=magnitude>=threshold;strong[:3,:]=False;strong[-3:,:]=False;strong[:,:3]=False;strong[:,-3:]=False
    span=.025*min(image.size)
    turning=np.degrees(np.abs(curvature)*span)
    return {'magnitude':magnitude,'strong':strong,'curvature':curvature,'turning_degrees':turning,'threshold':threshold,'span_pixels':span}


def valid_interior(mask):
    # Erode by two pixels so a region/exclusion boundary is not treated as measured structure.
    return np.asarray(Image.fromarray(mask.astype('uint8')*255).filter(ImageFilter.MinFilter(5)))>0


def curvature_summary(image,mask,blur_pixels):
    arrays=curvature_field(image,blur_pixels);valid=valid_interior(mask);selected=arrays['strong']&valid
    count=int(selected.sum());curved=selected&(arrays['turning_degrees']>=12)
    return {'blur_pixels':blur_pixels,'region_pixels':int(mask.sum()),'interior_pixels':int(valid.sum()),'strong_edge_pixels':count,
        'curved_edge_pixels':int(curved.sum()),'curved_share_of_strong_edges':float(curved.sum()/count) if count>=20 else None,
        'median_absolute_curvature_per_pixel':float(np.median(np.abs(arrays['curvature'][selected]))) if count>=20 else None,
        'median_turning_degrees':float(np.median(arrays['turning_degrees'][selected])) if count>=20 else None,
        'gradient_threshold':arrays['threshold'],'turning_span_pixels':arrays['span_pixels'],
        'status':'measured_proxy' if count>=20 else 'insufficient_edge_samples'},curved


def geometry(size,box):
    mask,bounds=box_mask(size,box);w=bounds[2]-bounds[0];h=bounds[3]-bounds[1]
    return {'pixel_bounds':bounds,'width_fraction':w/size[0],'height_fraction':h/size[1],
        'pixel_height_to_width':h/w,'area_fraction':float(mask.mean()),'center_normalized':[(bounds[0]+bounds[2])/(2*size[0]),(bounds[1]+bounds[3])/(2*size[1])]}


def color_context(image,lab,mask):
    surround=ring(mask,max(1,round(min(image.size)*.06)));other=~mask
    box_mean=lab[mask].mean(0);rgb=np.asarray(image,dtype=float)[mask].mean(0)
    result={'mean_lab':box_mean.tolist(),'mean_rgb':[int(v) for v in np.rint(rgb)],'comparisons':{}}
    for name,comparison in [('local_ring',surround),('remaining_image',other)]:
        if not comparison.any():result['comparisons'][name]=None;continue
        average=lab[comparison].mean(0);delta=box_mean-average
        result['comparisons'][name]={'comparison_pixels':int(comparison.sum()),'comparison_mean_lab':average.tolist(),
            'signed_lightness_difference':float(delta[0]),'signed_ab_difference':delta[1:].tolist(),
            'ab_distance':float(np.linalg.norm(delta[1:])),'delta_E_1976':float(np.linalg.norm(delta))}
    return result


def detail_features(image,source):
    if min(image.size)<8:raise ValueError('A focused reading needs at least eight pixels per axis')
    lab=rgb_to_lab(np.asarray(image,dtype=float)/255);rows=[]
    for c in source['measurements']['candidates']:
        mask,_=box_mask(image.size,c['bbox_analysis']);control=[]
        for amount in [1,2]:
            blur=max(.5,max(image.size)*amount/512)
            summary,_=curvature_summary(image,mask,blur);control.append(summary)
        rows.append({'id':c['id'],'bbox_analysis':c['bbox_analysis'],'geometry':geometry(image.size,c['bbox_analysis']),
            'color':color_context(image,lab,mask),'curvature_controls':control})
    for row in rows:
        row['geometry']['height_rank_among_candidates']=1+sum(other['geometry']['height_fraction']>row['geometry']['height_fraction']+1e-12 for other in rows)
    return {'image_size':list(image.size),'candidates':rows,'method':METHOD}


def sky_probe(image,source,sky_id='C3',exclude_ids=('C1',)):
    lookup={c['id']:c for c in source['measurements']['candidates']}
    if sky_id not in lookup:raise ValueError('Unknown sky-region proposal')
    mask,_=box_mask(image.size,lookup[sky_id]['bbox_analysis'])
    for cid in exclude_ids:
        if cid not in lookup:raise ValueError('Unknown exclusion region')
        other,_=box_mask(image.size,lookup[cid]['bbox_analysis']);mask&=~other
    rows=[];shown=None
    for amount in [1,2]:
        summary,curved=curvature_summary(image,mask,max(.5,max(image.size)*amount/512));rows.append(summary)
        if amount==1:shown=curved
    return {'region_id':sky_id,'excluded_candidate_ids':list(exclude_ids),'mask_pixels':int(mask.sum()),'controls':rows,
        'scope':'Supplied sky envelope minus supplied tree envelope; not an authenticated cloud mask. This region can include other depicted forms and image texture.'},shown


def curve_overlay(image,curve_mask):
    rgb=np.asarray(image).copy();rgb[curve_mask]=np.rint(.35*rgb[curve_mask]+.65*np.array([220,50,145])).astype('uint8')
    return Image.fromarray(rgb)


def focus_overlay(image,source):
    output=image.copy();draw=ImageDraw.Draw(output)
    for cid,label,color in [('C1','Tree',(31,99,69)),('C3','Sky',(36,111,164)),('C2','Land',(170,106,26))]:
        c=next(c for c in source['measurements']['candidates'] if c['id']==cid);_,bounds=box_mask(image.size,c['bbox_analysis'])
        draw.rectangle(bounds,outline=color,width=3);draw.rectangle((bounds[0],bounds[1],bounds[0]+48,bounds[1]+16),fill=(250,247,237));draw.text((bounds[0]+2,bounds[1]+1),label,fill=color)
    return output
