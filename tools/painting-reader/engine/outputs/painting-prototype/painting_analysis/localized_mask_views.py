"""Exact local context and selected-pixel views for a proposed region.

The isolated view replaces background for inspection only. Measurements always
refer to the original reproduction, and every component of the mask is retained.
"""
import hashlib,math
import numpy as np
from .automatic_regions import checked_mask,mask_digest

VERSION='localized-mask-views-0.1'

def localized_views(rgb,mask,*,proposed_box=None,padding_fraction=.15,minimum_padding=8,background=(128,128,128)):
    rgb=np.asarray(rgb)
    if rgb.dtype!=np.uint8 or rgb.ndim!=3 or rgb.shape[2]!=3:raise ValueError('Original RGB uint8 pixels required')
    mask=checked_mask(mask,rgb.shape[:2]);height,width=mask.shape
    if not math.isfinite(padding_fraction) or not 0<=padding_fraction<=1:raise ValueError('Invalid padding fraction')
    if type(minimum_padding) is not int or minimum_padding<0:raise ValueError('Invalid minimum padding')
    if len(background)!=3 or any(type(v) is not int or not 0<=v<=255 for v in background):raise ValueError('RGB background required')
    ys,xs=np.nonzero(mask);bounds=[int(xs.min()),int(ys.min()),int(xs.max())+1,int(ys.max())+1]
    union=list(bounds)
    if proposed_box is not None:
        if len(proposed_box)!=4 or any(type(v) not in (int,float) or not math.isfinite(v) for v in proposed_box):raise ValueError('Finite pixel box required')
        l,t,r,b=proposed_box
        if not 0<=l<r<=width or not 0<=t<b<=height:raise ValueError('Box outside reproduction')
        union=[min(union[0],math.floor(l)),min(union[1],math.floor(t)),max(union[2],math.ceil(r)),max(union[3],math.ceil(b))]
    padx=max(minimum_padding,math.ceil((union[2]-union[0])*padding_fraction))
    pady=max(minimum_padding,math.ceil((union[3]-union[1])*padding_fraction))
    rect=[max(0,union[0]-padx),max(0,union[1]-pady),min(width,union[2]+padx),min(height,union[3]+pady)]
    l,t,r,b=rect;context=rgb[t:b,l:r].copy();local_mask=mask[t:b,l:r].copy()
    isolated=np.empty_like(context);isolated[:]=background;isolated[local_mask]=context[local_mask]
    if int(local_mask.sum())!=int(mask.sum()):raise ValueError('Crop lost selected pixels')
    manifest={'version':VERSION,'parent_size':[width,height],'crop_xyxy_half_open':rect,'mask_bbox_xyxy_half_open':bounds,
        'proposed_box_xyxy_pixels':proposed_box,'padding_fraction':padding_fraction,'minimum_padding':minimum_padding,
        'source_rgb_pixel_sha256':hashlib.sha256(rgb.tobytes()).hexdigest(),'source_mask_sha256':mask_digest(mask),
        'crop_size':[r-l,b-t],'retained_selected_pixels':int(local_mask.sum()),'all_mask_components_retained':True,
        'context_rgb_pixel_sha256':hashlib.sha256(context.tobytes()).hexdigest(),
        'isolated_rgb_pixel_sha256':hashlib.sha256(isolated.tobytes()).hexdigest(),
        'display_background_rgb':list(background),'mask_coverage':1.0,'full_reproduction_area_fraction':(r-l)*(b-t)/(width*height),
        'scope':'The context view is an exact original-pixel crop. The isolated view preserves every selected RGB pixel and replaces only excluded pixels with neutral gray. '
                'No resampling or enhancement; no off-crop target completeness claim. The isolated view is a display aid, not a second measurement image.'}
    return context,isolated,local_mask,manifest
