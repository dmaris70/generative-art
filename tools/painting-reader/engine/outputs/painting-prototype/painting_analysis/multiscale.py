"""Measured regional relationships and honest, source-bound multiscale views."""
import itertools
import math
import cv2
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt
from .features import rgb_to_lab
from .regional_evidence import boundary_contrast, distribution
from .view_context import validate_crop, validate_size

VERSION = 'multiscale-relations-0.2'
PROTOCOL = {'scales': [1.0, 0.75, 0.5], 'image_resize': 'Pillow LANCZOS',
            'mask_resize': 'Pillow NEAREST', 'region_padding_fraction': 0.08,
            'detail_side_fraction_of_short_side': 0.28,
            'detail_anchor': 'Maximum distance inside the mask; ties use raster order. Not an attention prediction.',
            'group_rule': 'All pairs of existing regions plus their total union, explicitly constructed for comparison.',
            'minimum_color_pixels': 20, 'zero_tolerance': 1e-9,
            'scope': 'Development inspection and finite numerical sensitivity, not independent perceptual validation.'}


def path_for(mask):
    contours, _ = cv2.findContours(mask.astype('uint8'), cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    return ' '.join('M'+' L'.join(f'{x},{y}' for x,y in c[:,0,:])+' Z' for c in contours if len(c)>=3)


def bounds(mask):
    y,x = np.nonzero(mask)
    return [int(x.min()),int(y.min()),int(x.max()+1),int(y.max()+1)] if len(x) else None


def crop_for(box, size, padding=0):
    l,t,r,b = box
    dx,dy = math.ceil((r-l)*padding),math.ceil((b-t)*padding)
    l,t,r,b = max(0,l-dx),max(0,t-dy),min(size[0],r+dx),min(size[1],b+dy)
    if r-l<2: l,r=max(0,l-1),min(size[0],r+1)
    if b-t<2: t,b=max(0,t-1),min(size[1],b+1)
    return list(validate_crop([l,t,r,b],size))


def geometry(mask):
    y,x = np.nonzero(mask)
    if not len(x): return {'status':'empty','pixel_count':0,'area_fraction':0,'bounds':None,'center':None}
    return {'status':'measured','pixel_count':int(len(x)), 'area_fraction':float(mask.mean()),
            'bounds':bounds(mask),'center':[float(x.mean()/(mask.shape[1]-1)),float(y.mean()/(mask.shape[0]-1))]}


def pair_measurement(image, masks, a, b, lab=None):
    lab = rgb_to_lab(np.asarray(image,dtype=float)/255) if lab is None else lab
    ma,mb = masks[a],masks[b]
    ga,gb = geometry(ma),geometry(mb)
    ca,cb = distribution(lab,ma),distribution(lab,mb)
    both = ca['status']==cb['status']=='measured'
    delta = np.asarray(cb['mean_lab'])-np.asarray(ca['mean_lab']) if both else None
    contact = boundary_contrast(lab,ma,mb)
    return {'region_ids':[a,b], 'pixel_counts':[int(ma.sum()),int(mb.sum())],
            'availability': {'geometry': 'both_regions_visible' if ma.any() and mb.any() else 'region_absent',
                             'color': 'measured' if both else 'insufficient_visible_pixels'},
            'overlap_pixels':int((ma&mb).sum()), 'direct_contact':contact,
            'centers':[ga['center'],gb['center']],
            'center_offset_B_minus_A':(np.array(gb['center'])-np.array(ga['center'])).tolist() if ga['center'] and gb['center'] else None,
            'signed_mean_lab_B_minus_A':delta.tolist() if both else None,
            'mean_color_difference_delta_e76':float(np.linalg.norm(delta)) if both else None,
            'scope':'Proposed mask geometry and assumed sRGB/D65 reproduction values. Centroid ordering is not whole-object ordering; contact is not perceptual grouping.'}


def scale_probe(image, masks):
    records=[]
    for scale in PROTOCOL['scales']:
        size=[max(2,round(x*scale)) for x in image.size]
        im=image.copy() if scale==1 else image.resize(size,Image.Resampling.LANCZOS)
        mm={k:v.copy() if scale==1 else np.asarray(Image.fromarray(v).resize(size,Image.Resampling.NEAREST),dtype=bool) for k,v in masks.items()}
        lab=rgb_to_lab(np.asarray(im,dtype=float)/255)
        records.append({'scale':scale,'size':size,'pairs':{a+'--'+b:pair_measurement(im,mm,a,b,lab) for a,b in itertools.combinations(sorted(mm),2)}})
    summary={}
    for key in records[0]['pairs']:
        rows=[r['pairs'][key] for r in records]
        values=[r['signed_mean_lab_B_minus_A'][0] if r['signed_mean_lab_B_minus_A'] is not None else None for r in rows]
        present=[v for v in values if v is not None]
        order='unavailable' if len(present)!=len(values) else 'B_lighter' if all(v>1e-9 for v in present) else 'A_lighter' if all(v < -1e-9 for v in present) else 'equal_at_tolerance' if all(abs(v)<=1e-9 for v in present) else 'changes_across_scales'
        contacts=[r['direct_contact']['edge_count']>0 for r in rows]
        summary[key]={'lightness_order':order,'signed_mean_L_difference_range':[min(present),max(present)] if present else None,
                      'color_measurements_available':len(present),'expected':len(values),
                      'contact_presence':contacts,'contact_presence_same_at_all_scales':len(set(contacts))==1,
                      'scope':'Finite resampling sensitivity. Stable measurements do not validate boundaries or artistic meaning.'}
    return {'protocol':PROTOCOL,'conditions':records,'summary':summary}


def build(image, masks, work, source_files, implementation):
    size=list(image.size);validate_size(size)
    if image.mode!='RGB':raise ValueError('RGB source required')
    if not masks:raise ValueError('At least one nonempty region is required')
    for rid,m in masks.items():
        if rid not in {r['id'] for r in work['regions']} or m.dtype!=bool or m.shape!=(size[1],size[0]) or not m.any():
            raise ValueError('Nonempty boolean masks must match source dimensions and registered region IDs')
    lab=rgb_to_lab(np.asarray(image,dtype=float)/255)
    nodes=[{'id':'whole','kind':'whole','label':'Whole painting','members':sorted(masks),'geometry':{'bounds':[0,0,*size]},'origin':'source_reproduction'}]
    edges=[];views=[{'id':'whole','level':'whole','node_id':'whole','label':'Whole painting','crop_xyxy':[0,0,*size],'region_ids':sorted(masks)}]
    for rid,m in sorted(masks.items()):
        g=geometry(m)
        nodes.append({'id':rid,'kind':'region','label':'Region '+rid,'members':[rid],'geometry':g,'distribution':distribution(lab,m),'path':path_for(m),'origin':'existing_color_proposal','semantic_approval':False})
        edges.append({'from':'whole','to':rid,'type':'contains','origin':'pixel_geometry','coverage':1.0})
        views.append({'id':'region-'+rid,'level':'region','node_id':rid,'label':'Region '+rid+' in context','crop_xyxy':crop_for(g['bounds'],size,PROTOCOL['region_padding_fraction']),'region_ids':[rid]})
        # Pad the array with false pixels so edge-touching/full masks have a finite interior distance.
        distances=distance_transform_edt(np.pad(m,1))[1:-1,1:-1]
        y,x=np.unravel_index(np.argmax(distances),m.shape)
        side=max(2,round(min(size)*PROTOCOL['detail_side_fraction_of_short_side']))
        left=max(0,min(size[0]-side,int(x)-side//2));top=max(0,min(size[1]-side,int(y)-side//2))
        box=[left,top,min(size[0],left+side),min(size[1],top+side)]
        did='detail-'+rid
        nodes.append({'id':did,'kind':'detail','label':'Detail within '+rid,'members':[rid], 'geometry':{'bounds':box},'anchor':[int(x),int(y)],'origin':'declared_interior_sample','semantic_approval':False})
        edges.append({'from':did,'to':rid,'type':'samples','origin':'declared_crop','region_fraction_in_crop':float(m[top:box[3],left:box[2]].sum()/m.sum())})
        views.append({'id':did,'level':'detail','node_id':did,'label':'Detail within '+rid,'crop_xyxy':box,'region_ids':[rid],'anchor':[int(x),int(y)]})
    pairs={}
    for a,b in itertools.combinations(sorted(masks),2):
        key=a+'--'+b;relation=pair_measurement(image,masks,a,b,lab);pairs[key]=relation
        edges.append({'from':a,'to':b,'type':'measured_relationship','origin':'pixel_measurement','evidence_ref':'/pairs/'+key,'semantic_approval':False})
        if relation['direct_contact']['edge_count']:
            edges.append({'from':a,'to':b,'type':'adjacent','origin':'four_neighbor_pixel_contact','edge_count':relation['direct_contact']['edge_count'],'semantic_approval':False})
    groups=list(itertools.combinations(sorted(masks),2))
    if len(masks)>2:groups.append(tuple(sorted(masks)))
    for members in groups:
        gid='group-'+'-'.join(members);union=np.logical_or.reduce([masks[r] for r in members]);g=geometry(union)
        nodes.append({'id':gid,'kind':'group','label':'Compare '+' + '.join(members),'members':list(members),'geometry':g,'path':path_for(union),'origin':'constructed_comparison_group','semantic_approval':False})
        edges.append({'from':'whole','to':gid,'type':'contains','origin':'pixel_geometry','coverage':1.0})
        for rid in members:edges.append({'from':gid,'to':rid,'type':'includes','origin':'declared_group_membership','coverage':1.0,'semantic_approval':False})
        views.append({'id':gid,'level':'group','node_id':gid,'label':'Compare '+' + '.join(members),'crop_xyxy':crop_for(g['bounds'],size,PROTOCOL['region_padding_fraction']),'region_ids':list(members)})
    for view in views:
        l,t,r,b=view['crop_xyxy'];view['crop_size']=[r-l,b-t]
        view['region_visibility']={rid:{'source_pixels':int(m.sum()),'visible_pixels':int(m[t:b,l:r].sum()),'source_fraction_visible':float(m[t:b,l:r].sum()/m.sum())} for rid,m in sorted(masks.items())}
        view['source_to_crop_translation']=[-l,-t]
        view['crop_to_source_translation']=[l,t]
        view['crop_is_whole_image']=view['crop_xyxy']==[0,0,*size]
        view['context_pairs']={}
        im=image.crop((l,t,r,b));mm={rid:m[t:b,l:r] for rid,m in masks.items()}
        for a,bid in itertools.combinations(sorted(mm),2):
            view['context_pairs'][a+'--'+bid]=pair_measurement(im,mm,a,bid,lab[t:b,l:r])
        view['context_scope']='Metrics use visible portions only. A changed crop changes the sampled evidence, not the underlying painting.'
    return {'version':VERSION,'work_id':work['work_id'],'source_sha256':work['source_sha256'],
            'image_sha256':source_files[work['image_url']], 'image_size':size,'image_url':work['image_url'],
            'bindings':source_files,'implementation':implementation,'protocol':PROTOCOL,
            'nodes':nodes,'edges':edges,'views':views,'pairs':pairs,'sensitivity':scale_probe(image,masks),
            'unmeasured_relationships':['perceptual repetition','curve continuation','interruption','semantic enclosure','artist intention','physical materials'],
            'semantic_approval':False,'independent_validation':False,
            'limits':['Three existing color proposals do not cover every meaningful part of the artwork.',
                      'Groups are comparison sets, not discovered figures, crowds or artistic units.',
                      'Pixel contact and color differences do not establish perceptual connection or experienced effects.',
                      'Detail views enlarge a limited-resolution reproduction; no new surface information is recovered.']}
