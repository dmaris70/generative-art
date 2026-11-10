"""Declared local grouping hypotheses from luminance and chromatic edge chains.

Heuristics are development proposals, not a reproduction of a validated
perceptual model. No inferred connector is inserted into measured edge pixels.
"""
import itertools
import math
import cv2
import numpy as np
from PIL import Image
from scipy.ndimage import map_coordinates
from scipy.spatial import cKDTree
from skimage.morphology import skeletonize
from .features import rgb_to_lab
from .contour_structure import trace_chains, describe_chain, endpoint, gap_candidates, matched_chains

PROTOCOL={
 'version':'contour-relations-0.1',
 'conditions':[{'id':'lightness_only','channels':[0],'scale':1.,'low':20,'high':45},
               {'id':'color_edges','channels':[0,1,2],'scale':1.,'low':20,'high':45},
               {'id':'color_stricter','channels':[0,1,2],'scale':1.,'low':30,'high':65},
               {'id':'color_half','channels':[0,1,2],'scale':.5,'low':20,'high':45}],
 'encoding':'Assumed sRGB/D65 to CIELAB. L*=0..100, a*,b*=-128..127 mapped to fixed uint8 ranges. No image-wise contrast normalization.',
 'detector':'Gaussian sigma .8; per-channel Canny L2; union before skeletonization; no morphological gap closing.',
 'minimum_chain_shortside':.025,'repeat_minimum_chain_shortside':.04,
 'repeat_distance_shortside':[.03,.4],'repeat_maximum_length_ratio':1.5,'repeat_maximum_shape_rms':.12,
 'repeat_samples':32,'continuation_maximum_side_delta_e':15.,
 'junction_cap_minimum_angle':155.,'junction_stem_angle_range':[60.,120.],
 'junction_isolation_pixels':3.,'junction_minimum_frame_margin_pixels':3.,
 'scope':'Frozen engineering heuristics on two development reproductions. Numerical eligibility does not establish artistic significance, object identity or depth.',
 'background_reference':{'url':'https://pmc.ncbi.nlm.nih.gov/articles/PMC3482144/','scope':'Review sections on grouping and contour completion inspected. Provides conceptual vocabulary, not validation of these thresholds or code.'}}
RULES={
 'continuation':{'title':'Possible continuation across a gap','required':['alignment','extent','appearance'],
  'possible_effect':'These separated edges could be read as a continued contour.',
  'alternative':'They may be unrelated marks, texture, or boundaries of different forms.',
  'missing':'Independent contour and grouping review; occlusion is not established by an intervening edge.'},
 'repetition':{'title':'Similar local contour shapes','required':['shape','extent','proximity'],
  'possible_effect':'These nearby contours could contribute to a repeated visual pattern.',
  'alternative':'Short generic curves can resemble one another without belonging to a meaningful motif.',
  'missing':'Independent motif/grouping judgment and whole-composition context. A pair does not establish rhythm.'},
 'junction':{'title':'Possible T-junction','required':['degree','angles','isolation'],
  'possible_effect':'The crossbar and ending stem are compatible with an occlusion reading.',
  'alternative':'A painted intersection, texture, or detector fragmentation may produce the same geometry.',
  'missing':'Surface/border ownership and supporting global cues remain unknown. No foreground region or physical depth is assigned.'}}


def decision(facts, family):
    required=RULES[family]['required'];failed=[k for k in required if facts.get(k,{}).get('passes') is False]
    unknown=[k for k in required if type(facts.get(k,{}).get('passes')) is not bool]
    return {'status':'rejected' if failed else 'unavailable' if unknown else 'eligible_hypothesis',
            'failed_families':failed,'missing_families':unknown,'semantic_approval':False}


def resample(points,n=32,closed=False):
    p=np.asarray(points,float);s=np.r_[0,np.cumsum(np.linalg.norm(np.diff(p,axis=0),axis=1))]
    if s[-1]<=1e-12:return None
    x=np.linspace(0,s[-1],n,endpoint=not closed)
    return np.column_stack([np.interp(x,s,p[:,i]) for i in (0,1)])


def shape_match(a,b,closed=False):
    """Translation/rotation/scale-normalized fit; path direction may reverse, reflection may not."""
    a=resample(a,PROTOCOL['repeat_samples'],closed);b=resample(b,PROTOCOL['repeat_samples'],closed)
    if a is None or b is None:return None
    a-=a.mean(axis=0);b-=b.mean(axis=0);na=np.linalg.norm(a);nb=np.linalg.norm(b)
    if min(na,nb)<1e-9:return None
    a/=na;b/=nb;best=None
    for reversed_path in [False,True]:
        x=b[::-1] if reversed_path else b
        for shift in range(len(x)) if closed else [0]:
            y=np.roll(x,shift,axis=0);u,_,vt=np.linalg.svd(y.T@a);fix=np.diag([1.,np.linalg.det(u@vt)]);rot=u@fix@vt
            error=float(np.linalg.norm(y@rot-a))
            if best is None or error<best['normalized_rms']:
                best={'normalized_rms':error,'rotation_degrees':float(np.degrees(np.arctan2(rot[0,1],rot[0,0]))),
                      'size_ratio_b_over_a':float(nb/na),'path_reversed':reversed_path,'cyclic_shift':shift,'reflection_allowed':False}
    return best


def side_colors(lab, point, normal, radius):
    offsets=np.array([radius,radius*1.5,radius*2.]);xy=np.asarray(point)[None,:]+offsets[:,None]*normal
    if np.any(xy[:,0]<0) or np.any(xy[:,1]<0) or np.any(xy[:,0]>lab.shape[1]-1) or np.any(xy[:,1]>lab.shape[0]-1):return None
    return np.median(np.column_stack([map_coordinates(lab[:,:,k],xy[:,::-1].T,order=1,mode='nearest') for k in range(3)]),axis=0)


def continuations(chains,edge,lab,size):
    rows=[];byid={c['id']:c for c in chains}
    for g in gap_candidates(chains,edge,size):
        a=np.array(g['from']['point']);b=np.array(g['to']['point']);v=b-a;v/=np.linalg.norm(v);normal=np.array([-v[1],v[0]])
        colors=[[side_colors(lab,p,sign*normal,max(1.5,min(size)*.005)) for sign in [1,-1]] for p in [a,b]]
        differences=None if any(x is None for pair in colors for x in pair) else [float(np.linalg.norm(colors[0][i]-colors[1][i])) for i in [0,1]]
        facts={'alignment':{'passes':None if any(x is None for x in g['endpoint_angles_degrees']) else max(g['endpoint_angles_degrees'])<=25,'endpoint_angles_degrees':g['endpoint_angles_degrees']},
               'extent':{'passes':g['gap_shortside']<=.06 and not(g['from']['frame_truncated'] or g['to']['frame_truncated']),'gap_shortside':g['gap_shortside'],'frame_truncated':g['from']['frame_truncated'] or g['to']['frame_truncated']},
               'appearance':{'passes':None if differences is None else max(differences)<=PROTOCOL['continuation_maximum_side_delta_e'],'side_delta_e76':differences}}
        rows.append({'id':'continuation-'+g['id'],'family':'continuation','chain_ids':[g['from']['chain_id'],g['to']['chain_id']],
                     'connector':[a.tolist(),b.tolist()],'facts':facts,**decision(facts,'continuation'),
                     'intervening_edge_pixels':g['intervening_edge_pixels'],'interruption_status':g['interruption_status']})
    return rows


def repetitions(chains,size):
    candidates=[c for c in chains if c['geometry']['length_shortside']>=PROTOCOL['repeat_minimum_chain_shortside']]
    if len(candidates)<2:return [],{'eligible_length_chains':len(candidates),'outside_search_radius_pairs':0}
    centers=np.array([np.mean(c['points'],axis=0) for c in candidates]);short=min(size)
    pairs=sorted(cKDTree(centers).query_pairs(PROTOCOL['repeat_distance_shortside'][1]*short));rows=[]
    for i,j in pairs:
        a,b=candidates[i],candidates[j];distance=float(np.linalg.norm(centers[i]-centers[j])/short)
        ratio=max(a['geometry']['length_pixels'],b['geometry']['length_pixels'])/min(a['geometry']['length_pixels'],b['geometry']['length_pixels'])
        extent=ratio<=PROTOCOL['repeat_maximum_length_ratio'] and a['closed']==b['closed']
        # No expensive normalized fit for a pair already outside the declared extent family.
        match=shape_match(a['points'],b['points'],a['closed']) if extent else None
        facts={'extent':{'passes':bool(extent),'arc_length_ratio':ratio,'same_closure':a['closed']==b['closed']},
               'proximity':{'passes':distance>=PROTOCOL['repeat_distance_shortside'][0],'center_distance_shortside':distance},
               'shape':{'passes':None if match is None else match['normalized_rms']<=PROTOCOL['repeat_maximum_shape_rms'],'fit':match}}
        rows.append({'id':'repetition-'+a['id']+'-'+b['id'],'family':'repetition','chain_ids':[a['id'],b['id']],
                     'facts':facts,**decision(facts,'repetition')})
    return rows,{'eligible_length_chains':len(candidates),'outside_search_radius_pairs':len(candidates)*(len(candidates)-1)//2-len(pairs),
                 'scope':'All pairs within the fixed spatial search radius; other pairs and shorter chains are outside this local-repeat search, not rejected perceptual groups.'}


def junctions(chains,junction_pixels,size):
    endmap={};rows=[]
    for c in chains:
        if c['closed']:continue
        for end,point in [('start',c['points'][0]),('end',c['points'][-1])]:
            e=endpoint(c,end,size);endmap.setdefault(tuple(point),[]).append(e)
    jp=np.asarray(junction_pixels,float)
    for i,p in enumerate(junction_pixels):
        ends=endmap.get(tuple(p),[]);vectors=[-np.asarray(e['outward_tangent']) for e in ends if e['outward_tangent'] is not None]
        cap=None;stem=None;angles=None
        if len(vectors)==3:
            pairs=[(math.degrees(math.acos(float(np.clip(np.dot(vectors[a],vectors[b]),-1,1)))),a,b) for a,b in itertools.combinations(range(3),2)]
            _,a,b=max(pairs);s=next(k for k in range(3) if k not in [a,b]);cap=[a,b];stem=s
            angles={'cap':max(pairs)[0],'stem':[math.degrees(math.acos(float(np.clip(np.dot(vectors[s],vectors[k]),-1,1)))) for k in cap]}
        near=int(((np.linalg.norm(jp-np.asarray(p),axis=1)<=PROTOCOL['junction_isolation_pixels'])&(np.linalg.norm(jp-np.asarray(p),axis=1)>0)).sum())
        margin=min(p[0],p[1],size[0]-1-p[0],size[1]-1-p[1])
        facts={'degree':{'passes':len(ends)==3,'retained_incident_chains':len(ends)},
               'angles':{'passes':None if angles is None else angles['cap']>=PROTOCOL['junction_cap_minimum_angle'] and all(PROTOCOL['junction_stem_angle_range'][0]<=v<=PROTOCOL['junction_stem_angle_range'][1] for v in angles['stem']),'degrees':angles},
               'isolation':{'passes':near==0 and margin>=PROTOCOL['junction_minimum_frame_margin_pixels'],'nearby_junction_pixels':near,'frame_margin_pixels':margin}}
        rows.append({'id':'junction-'+str(i+1),'family':'junction','chain_ids':[e['chain_id'] for e in ends],
                     'point':p,'cap_chain_ids':[] if cap is None else [ends[k]['chain_id'] for k in cap],
                     'stem_chain_id':None if stem is None else ends[stem]['chain_id'],'facts':facts,**decision(facts,'junction'),
                     'ownership':'unresolved','depth':'unresolved'})
    return rows


def analyze(edge,lab):
    if edge.dtype!=bool or edge.ndim!=2 or lab.shape!=(*edge.shape,3):raise ValueError('Boolean edge field and matching Lab image required')
    size=[edge.shape[1],edge.shape[0]];trace=trace_chains(edge);chains=[];discarded=[]
    for i,c in enumerate(trace['chains'],1):
        c={'id':'C'+str(i),**c,'geometry':describe_chain(c['points'],c['closed'],size)}
        if c['geometry']['length_shortside']<PROTOCOL['minimum_chain_shortside']:discarded.append({'id':c['id'],'points':c['points'],'reason':'below_minimum_length'})
        else:chains.append(c)
    repeats,coverage=repetitions(chains,size)
    return {'image_size':size,'chains':chains,'discarded_chains':discarded,'junction_pixels':trace['junction_pixels'],
            'candidates':continuations(chains,edge,lab,size)+repeats+junctions(chains,trace['junction_pixels'],size),
            'repeat_search_coverage':coverage,'trace_accounting':{k:trace[k] for k in ['adjacency_edge_count','traced_edge_count']}}


def condition(image,spec):
    size=[max(3,round(v*spec['scale'])) for v in image.size]
    im=image if list(image.size)==size else image.resize(size,Image.Resampling.LANCZOS)
    lab=rgb_to_lab(np.asarray(im)/255.)
    encoded=np.stack([lab[:,:,0]*255/100,lab[:,:,1]+128,lab[:,:,2]+128],axis=2)
    edges=[]
    for k in spec['channels']:
        channel=np.clip(np.rint(encoded[:,:,k]),0,255).astype('uint8')
        edges.append(cv2.Canny(cv2.GaussianBlur(channel,(0,0),.8),spec['low'],spec['high'],L2gradient=True)>0)
    edge=skeletonize(np.logical_or.reduce(edges));a=analyze(edge,lab)
    scale=[image.width/size[0],image.height/size[1]]
    a.update(id=spec['id'],condition=spec,edge_pixels=int(edge.sum()),source_from_condition={'scale':scale,'offset':[(s-1)/2 for s in scale]})
    return a


def compare(primary,other):
    match=matched_chains(primary,other);mapping={x['primary_id']:x['secondary_id'] for x in match['matches']}
    index={}
    for c in other['candidates']:index.setdefault((c['family'],tuple(sorted(c['chain_ids']))),[]).append(c)
    rows=[]
    for c in primary['candidates']:
        if c['status']!='eligible_hypothesis':continue
        mapped=[mapping[x] for x in c['chain_ids'] if x in mapping]
        matches=index.get((c['family'],tuple(sorted(mapped))),[]) if len(mapped)==len(c['chain_ids']) else []
        rows.append({'primary_id':c['id'],'matched_candidate_ids':[x['id'] for x in matches],
                     'status':'not_matched' if not matches else 'eligible_hypothesis' if any(x['status']=='eligible_hypothesis' for x in matches) else 'not_eligible',
                     'scope':'One-to-one chain proximity match; an unmatched candidate is not proof of perceptual disappearance.'})
    return {'chains':match,'eligible_primary_candidates':rows}


def build(image,binding):
    if image.mode!='RGB':raise ValueError('An RGB reproduction is required')
    conditions=[condition(image,s) for s in PROTOCOL['conditions']]
    primary=conditions[1]
    return {'version':PROTOCOL['version'],'binding':binding,'image_size':list(image.size),'protocol':PROTOCOL,'rules':RULES,
            'conditions':conditions,'primary_condition':'color_edges','sensitivity':{c['id']:compare(primary,c) for c in conditions if c is not primary},
            'semantic_approval':False,'independent_validation':False,
            'limits':['Color channels can expose boundaries missed by lightness, but their union can also add fragments and junctions.',
                      'Normalized shape fitting allows rotation, scale and path reversal; it does not identify an object or repeated motif.',
                      'T-like geometry is a local cue proposal. Border ownership and depth remain unresolved.',
                      'Side colors describe assumed-sRGB reproduction samples, not physical paint or calibrated appearance.',
                      'Fixed-condition repeatability and synthetic tests do not establish perceptual or artistic validity.']}
