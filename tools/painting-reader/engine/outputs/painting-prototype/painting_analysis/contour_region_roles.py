"""Source-sample relations to proposed regions, without assigning brushwork or ownership."""
from collections import Counter
import numpy as np
from scipy.ndimage import binary_erosion, distance_transform_edt, generate_binary_structure

VERSION = 'contour-region-roles-0.1'
PROFILES = [
    {'id':'primary','tolerance':1.5,'dominance':.8},
    {'id':'narrow_band','tolerance':1.,'dominance':.8},
    {'id':'wide_band','tolerance':2.,'dominance':.8},
    {'id':'lower_dominance','tolerance':1.5,'dominance':.7},
    {'id':'higher_dominance','tolerance':1.5,'dominance':.9},
]
PROTOCOL = {'minimum_samples':8,'boundary_fraction':.5,'mixed_side_fraction':.2,
    'profiles':PROFILES,
    'sampling':'Unique source pixels mapped from detected contour samples; not arc-length coverage. Hypothetical connectors are excluded.',
    'boundary':'Inside-mask four-neighbor boundary, including the source frame; distance measured in source pixels.',
    'partition':'Near boundary, deeper inside and farther outside are mutually exclusive sample sets.',
    'scope':'Spatial relation to a proposed mask, not proof of a painted mark, object identity, border ownership, artistic importance or perceptual grouping. Large masks can trivially contain contours.',
    'conditions':'Detector conditions are compared with the same original region masks; this is not a jointly resampled pipeline.'}


def classify(n, near, inside, outside, dominance=.8, empty=False):
    if min(n, near, inside, outside) < 0 or near+inside+outside != n:
        raise ValueError('Sample partitions must reconcile')
    if empty: return 'empty_region'
    if n < PROTOCOL['minimum_samples']: return 'insufficient_samples'
    if near/n >= PROTOCOL['boundary_fraction']: return 'boundary_near'
    if inside/n >= dominance: return 'interior'
    if outside/n >= dominance: return 'outside'
    if inside/n >= PROTOCOL['mixed_side_fraction'] and outside/n >= PROTOCOL['mixed_side_fraction']:
        return 'inside_and_outside'
    return 'mixed'


def measure(points, masks, proposals, size):
    if len({p['id'] for p in proposals}) != len(proposals): raise ValueError('Duplicate proposal identity')
    samples={}
    for cid,p in points.items():
        xy=np.asarray(p['sample_pixels'],int).reshape(-1,2)
        if len(np.unique(xy,axis=0)) != len(xy): raise ValueError('Duplicate contour samples')
        if np.any(xy<0) or np.any(xy[:,0]>=size[0]) or np.any(xy[:,1]>=size[1]): raise ValueError('Samples outside source')
        samples[cid]=xy
    rows=[]
    for proposal in proposals:
        pid=proposal['id'];mask=masks[pid]
        if mask.dtype != bool or mask.shape != (size[1],size[0]): raise ValueError('Mask differs from source dimensions')
        boundary=mask & ~binary_erosion(mask,structure=generate_binary_structure(2,1),border_value=0)
        distance=distance_transform_edt(~boundary) if boundary.any() else None
        chains={}
        for cid,xy in samples.items():
            n=len(xy);is_inside=mask[xy[:,1],xy[:,0]]
            distances=distance[xy[:,1],xy[:,0]] if distance is not None else np.full(n,np.inf)
            profiles=[]
            for profile in PROFILES:
                near=distances<=profile['tolerance'];inside=is_inside & ~near;outside=~is_inside & ~near
                counts=[int(v.sum()) for v in [near,inside,outside]]
                profiles.append({'id':profile['id'],'near':counts[0],'interior':counts[1],'outside':counts[2],
                                 'role':classify(n,*counts,dominance=profile['dominance'],empty=not mask.any())})
            chains[cid]={'unique_samples':n,'profiles':profiles,'role':profiles[0]['role'],
                         'stable_across_profiles':len({p['role'] for p in profiles})==1}
        rows.append({'proposal_id':pid,'label':proposal.get('label',pid),'method':proposal['method'],'stage':proposal['stage'],
                     'mask_pixels':int(mask.sum()),'source_fraction':float(mask.mean()),'chains':chains,
                     'semantic_approval':False})
    return rows


def index_roles(rows):
    ids=[r['proposal_id'] for r in rows]
    if len(set(ids))!=len(ids): raise ValueError('Duplicate proposal identity')
    chains={}
    for i,row in enumerate(rows):
        for cid,r in row['chains'].items():
            c=chains.setdefault(cid,{'interior':[0]*len(PROFILES),'boundary':0})
            for j,p in enumerate(r['profiles']):
                if p['role']=='interior': c['interior'][j]|=1<<i
            if r['role']=='boundary_near': c['boundary']|=1<<i
    if any(set(r['chains'])!=set(chains) for r in rows): raise ValueError('Missing chain evidence')
    return {'proposal_ids':ids,'chains':chains}


def candidate_roles(candidate, rows):
    index=rows if isinstance(rows,dict) else index_roles(rows)
    ids=candidate['chain_ids'];chains=index['chains'];proposals=index['proposal_ids']
    if len(set(ids))!=len(ids): raise ValueError('Duplicate chain identity')
    if any(cid not in chains for cid in ids): raise ValueError('Missing chain evidence')
    masks=[]
    for j in range(len(PROFILES)):
        common=(1<<len(proposals))-1 if ids else 0
        for cid in ids: common &= chains[cid]['interior'][j]
        masks.append(common)
    expand=lambda mask:[pid for i,pid in enumerate(proposals) if mask&(1<<i)]
    stable=masks[0]
    for mask in masks[1:]:stable &= mask
    interior=sum(bool(chains[c]['interior'][0]) for c in ids)
    boundary=sum(bool(chains[c]['boundary']) for c in ids)
    return {'candidate_id':candidate['id'],'family':candidate['family'],'contour_status':candidate['status'],
            'common_interior_proposals':expand(masks[0]),
            'common_interior_by_profile':{p['id']:expand(mask) for p,mask in zip(PROFILES,masks)},
            'interior_chain_count':interior,'boundary_chain_count':boundary,
            'all_chains_have_interior_relation':bool(ids) and interior==len(ids),
            'all_chains_have_boundary_relation':bool(ids) and boundary==len(ids),
            'stable_common_interior_proposals':expand(stable),'semantic_approval':False}
