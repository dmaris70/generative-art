"""Competing segmentation proposals with method-qualified, source-bound identity."""
import base64
import hashlib
import io
import itertools
import json
from pathlib import Path
import cv2
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt
from .multiscale import geometry, path_for, crop_for, pair_measurement
from .features import rgb_to_lab
from .regional_evidence import distribution

VERSION='proposal-alternatives-0.1'


def mask_digest(mask):
    return hashlib.sha256(json.dumps(list(mask.shape)).encode()+np.packbits(mask,bitorder='little').tobytes()).hexdigest()


def qualify(method,stage,local_id):
    for value in (method,stage,local_id):
        if not isinstance(value,str) or not value or any(c not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-' for c in value):
            raise ValueError('Proposal identifiers must contain letters, digits, underscores or hyphens')
    return '/'.join([method,stage,local_id])


def mask_png(mask):
    rgba=np.full((*mask.shape,4),255,dtype=np.uint8);rgba[:,:,3]=mask.astype('uint8')*255
    out=io.BytesIO();Image.fromarray(rgba).save(out,format='PNG')
    return base64.b64encode(out.getvalue()).decode()


def overlap(a,b):
    intersection=int((a&b).sum());union=int((a|b).sum());na=int(a.sum());nb=int(b.sum())
    return {'intersection_pixels':intersection,'union_pixels':union,'iou':intersection/union if union else None,
            'a_covered_by_b':intersection/na if na else None,'b_covered_by_a':intersection/nb if nb else None,
            'a_only_pixels':na-intersection,'b_only_pixels':nb-intersection,
            'scope':'Agreement between proposals, not boundary accuracy or shared semantic identity.'}


def build(image, variants, masks, collections, relations, binding, availability):
    """Input identities are never deduplicated merely because pixels agree."""
    if image.mode!='RGB':raise ValueError('RGB source required')
    ids=[v['id'] for v in variants]
    if len(ids)!=len(set(ids)) or set(ids)!=set(masks):raise ValueError('Unique proposal records and masks must agree')
    lab=rgb_to_lab(np.asarray(image,dtype=float)/255);nodes=[]
    for v in variants:
        if v['id']!=qualify(v['method'],v['stage'],v['local_id']):raise ValueError('Method-qualified identity mismatch')
        m=masks[v['id']]
        if m.dtype!=bool or m.shape!=(image.height,image.width) or not m.any():raise ValueError('Nonempty source-sized boolean proposal masks required')
        dist=distance_transform_edt(np.pad(m,1))[1:-1,1:-1];y,x=np.unravel_index(np.argmax(dist),m.shape)
        g=geometry(m);n,_,_,_=cv2.connectedComponentsWithStats(m.astype('uint8'),connectivity=8)
        nodes.append({**v,'geometry':g,'component_count':n-1,'mask_sha256':mask_digest(m),'path':path_for(m),
                      'mask_png_base64':mask_png(m),'distribution':distribution(lab,m),'anchor':[int(x),int(y)],
                      'crop_xyxy':crop_for(g['bounds'],list(image.size),.08),'semantic_approval':False})
    if len({c['id'] for c in collections})!=len(collections):raise ValueError('Duplicate collection identity')
    for c in collections:
        if len(c['proposal_ids'])!=len(set(c['proposal_ids'])) or not set(c['proposal_ids'])<=set(ids):raise ValueError('Collection has duplicate or missing proposal references')
        if c.get('is_partition'):
            if not c['proposal_ids'] or not np.all(np.stack([masks[r] for r in c['proposal_ids']]).sum(axis=0)==1):raise ValueError('Declared partition must cover every pixel exactly once')
    checked=[]
    for rel in relations:
        if rel['from'] not in masks or rel['to'] not in masks:raise ValueError('Relationship has unknown endpoints')
        a,b=masks[rel['from']],masks[rel['to']];o=overlap(a,b)
        if rel['type']=='partition_child' and o['a_covered_by_b']!=1:raise ValueError('Declared hierarchy child is outside parent')
        checked.append({**rel,'overlap':o,'semantic_approval':False})
    pair_records={a+'|'+b:overlap(masks[a],masks[b]) for a,b in itertools.combinations(sorted(masks),2)}
    coverage=[]
    for c in collections:
        if not c['proposal_ids']:
            coverage.append({'collection_id':c['id'],'status':'unavailable','covered_pixels':None});continue
        stack=np.stack([masks[r] for r in c['proposal_ids']]);union=stack.any(axis=0)
        coverage.append({'collection_id':c['id'],'status':'measured','covered_pixels':int(union.sum()),
                         'uncovered_pixels':int((~union).sum()),'overlap_pixels':int((stack.sum(axis=0)>1).sum()),
                         'scope':'Coverage by selected masks, not object recall or background ownership.'})
    return {'version':VERSION,'binding':binding,'image_size':list(image.size),'proposals':nodes,
            'collections':collections,'relations':checked,'overlaps':pair_records,'coverage':coverage,'availability':availability,
            'semantic_approval':False,'independent_validation':False,
            'limits':['Raw masks, refined consensus masks and refinement conditions retain separate identities.',
                      'SAM model scores are diagnostics, not measured accuracy, object identity or artistic significance.',
                      'Boundary grouping scales and pixel containment do not establish semantic parts or groups.',
                      'No replacement is synthesized for missing or unsuccessful method outputs.']}


def read_masks(root, catalog):
    """Verify copied inputs and mask fingerprints before using them for views."""
    root=Path(root).resolve();files=catalog['binding']['proposal_files'];archives={};masks={}
    for name,sha in files.items():
        path=(root/name).resolve()
        if not path.is_relative_to(root) or hashlib.sha256(path.read_bytes()).hexdigest()!=sha:raise ValueError('Proposal input missing or changed')
    for p in catalog['proposals']:
        source=p['source'];name=source['file']
        if name not in files:raise ValueError('Mask archive is not bound to this catalog')
        if name not in archives:
            with np.load(root/name,allow_pickle=False) as z:archives[name]={k:z[k].copy() for k in z.files}
        m=archives[name][source['key']]
        if m.dtype!=bool or mask_digest(m)!=p['mask_sha256']:raise ValueError('Proposal mask fingerprint changed')
        masks[p['id']]=m
    return masks


def extend_graph(graph,image,baseline_masks,catalog,key,masks):
    """Add source-bound region/detail views without changing existing view meanings."""
    if catalog['binding']['work_id']!=graph['work_id'] or catalog['binding']['source_sha256']!=graph['source_sha256'] or catalog['binding']['image_sha256']!=graph['image_sha256'] or catalog['image_size']!=graph['image_size']:
        raise ValueError('Alternative proposals belong to another reproduction')
    graph=json.loads(json.dumps(graph));lab=rgb_to_lab(np.asarray(image,dtype=float)/255)
    graph['proposal_catalog']={'catalog_sha256':key,'catalog_url':f'proposals/{graph["work_id"]}/{key}/catalog.json'}
    for p in catalog['proposals']:
        pid=p['id'];node_id='proposal/'+pid
        graph['nodes'].append({'id':node_id,'kind':'alternative_region','label':p['label'],'proposal_id':pid,'proposal_catalog_sha256':key,'geometry':p['geometry'],'origin':p['method']+'/'+p['stage'],'semantic_approval':False})
        graph['edges'].append({'from':'whole','to':node_id,'type':'contains_proposed_mask','origin':'source_pixel_geometry','semantic_approval':False})
        x,y=p['anchor'];side=max(2,round(min(image.size)*.28));l=max(0,min(image.width-side,x-side//2));t=max(0,min(image.height-side,y-side//2))
        for level,box in [('region',p['crop_xyxy']),('detail',[l,t,l+side,t+side])]:
            view={'id':'proposal-'+level+'-'+pid,'level':level,'node_id':node_id,'label':p['label']+(' · context' if level=='region' else ' · detail'),
                  'crop_xyxy':box,'proposal_ids':[pid],'proposal_catalog_sha256':key,'region_ids':sorted(baseline_masks),'anchor':p['anchor']}
            l0,t0,r0,b0=box;view['crop_size']=[r0-l0,b0-t0];view['crop_is_whole_image']=box==[0,0,*image.size]
            view['source_to_crop_translation']=[-l0,-t0];view['crop_to_source_translation']=[l0,t0]
            view['region_visibility']={rid:{'source_pixels':int(m.sum()),'visible_pixels':int(m[t0:b0,l0:r0].sum()),'source_fraction_visible':float(m[t0:b0,l0:r0].sum()/m.sum())} for rid,m in baseline_masks.items()}
            mm={rid:m[t0:b0,l0:r0] for rid,m in baseline_masks.items()};im=image.crop(box)
            view['context_pairs']={a+'--'+b:pair_measurement(im,mm,a,b,lab[t0:b0,l0:r0]) for a,b in itertools.combinations(sorted(mm),2)}
            view['context_scope']='Color metrics refer to the visible portions of the original color proposals, not to a replacement interpretation of the selected alternative.'
            graph['views'].append(view)
    for view in graph['views']:
        l,t,r,b=view['crop_xyxy'];view['proposal_visibility']={pid:int(m[t:b,l:r].sum()) for pid,m in masks.items()}
    for rel in catalog['relations']:
        graph['edges'].append({'from':'proposal/'+rel['from'],'to':'proposal/'+rel['to'],'type':rel['type'],'origin':rel['origin'],'evidence_ref':'proposal_catalog/relations','semantic_approval':False})
    return graph
