"""Source-pixel edge chains and explicitly hypothetical connections across gaps.

No morphological closing joins edges. Closed edge fields and unassigned mask
space are geometric proposals, never recovered objects or depicted depth.
"""
import itertools
import math
import cv2
import numpy as np
from PIL import Image
from scipy.ndimage import binary_fill_holes, label, generate_binary_structure
from scipy.spatial import cKDTree
from skimage.morphology import skeletonize

VERSION='contour-structure-0.1'
PROTOCOL={
    'conditions':[{'id':'primary','scale':1.,'sigma':.8,'low':40,'high':100},
                  {'id':'lower_thresholds','scale':1.,'sigma':.8,'low':25,'high':70},
                  {'id':'higher_thresholds','scale':1.,'sigma':.8,'low':60,'high':140},
                  {'id':'half_resolution','scale':.5,'sigma':.8,'low':40,'high':100}],
    'minimum_chain_length_shortside':.015,'short_accent_maximum_shortside':.12,
    'tangent_window_shortside':.025,'curvature_sample_step_shortside':.008,
    'maximum_gap_shortside':.06,'maximum_endpoint_angle_degrees':25,
    'minimum_field_area_fraction':.001,'minimum_field_pixels':20,
    'matching_tolerance_shortside':.008,'minimum_bidirectional_match_fraction':.75,
    'edge_detector':'RGB to encoded grayscale; Gaussian blur; Canny L2 gradient; skeletonize; no gap closing',
    'trace_rule':'8 neighbors, excluding diagonal edges if an orthogonal connector exists; split at degree != 2',
    'scope':'Frozen development settings. Geometric evidence and finite sensitivity, not independent contour accuracy.'}


def validate_mask(mask, shape=None):
    if not isinstance(mask,np.ndarray) or mask.ndim!=2 or mask.dtype!=bool or min(mask.shape)<2 or (shape is not None and mask.shape!=shape):
        raise ValueError('Boolean masks must have matching dimensions of at least two pixels')


def trace_chains(edge):
    """Partition every undirected adjacency edge exactly once, including loops."""
    validate_mask(edge);h,w=edge.shape;pixels=set(np.flatnonzero(edge).tolist());adj={}
    for p in sorted(pixels):
        y,x=divmod(p,w);neighbors=[]
        for dy,dx in itertools.product([-1,0,1],repeat=2):
            if (dy,dx)==(0,0) or not (0<=x+dx<w and 0<=y+dy<h):continue
            q=(y+dy)*w+x+dx
            if q not in pixels:continue
            if dx and dy and (y*w+x+dx in pixels or (y+dy)*w+x in pixels):continue
            neighbors.append(q)
        adj[p]=sorted(neighbors)
    used=set();paths=[]
    def walk(start,second):
        path=[start];a,b=start,second
        while True:
            used.add(tuple(sorted((a,b))));path.append(b)
            if b==start or len(adj[b])!=2:break
            c=next(n for n in adj[b] if n!=a)
            if tuple(sorted((b,c))) in used:break
            a,b=b,c
        paths.append(path)
    for p in adj:
        if len(adj[p])!=2:
            for q in adj[p]:
                if tuple(sorted((p,q))) not in used:walk(p,q)
    for p in adj:
        for q in adj[p]:
            if tuple(sorted((p,q))) not in used:walk(p,q)
    chains=[{'points':[[p%w,p//w] for p in path], 'closed':path[0]==path[-1]} for path in paths]
    return {'chains':chains,'junction_pixels':[[p%w,p//w] for p in adj if len(adj[p])>=3],
            'isolated_pixels':[[p%w,p//w] for p in adj if not adj[p]],
            'adjacency_edge_count':sum(map(len,adj.values()))//2,'traced_edge_count':len(used)}


def arc_samples(points, step):
    p=np.asarray(points,float);s=np.r_[0,np.cumsum(np.linalg.norm(np.diff(p,axis=0),axis=1))]
    if s[-1]==0:return p[:1]
    d=np.linspace(0,s[-1],max(3,int(math.ceil(s[-1]/step))+1))
    return np.column_stack([np.interp(d,s,p[:,axis]) for axis in [0,1]])


def describe_chain(points, closed, size):
    p=np.asarray(points,float);short=min(size);length=float(np.linalg.norm(np.diff(p,axis=0),axis=1).sum())
    chord=float(np.linalg.norm(p[-1]-p[0]));samples=arc_samples(p,max(2,short*PROTOCOL['curvature_sample_step_shortside']))
    directions=np.diff(samples,axis=0);angles=np.arctan2(directions[:,1],directions[:,0]);turn=np.diff(np.unwrap(angles))
    if closed and len(angles)>1:turn=np.r_[turn,math.atan2(math.sin(angles[0]-angles[-1]),math.cos(angles[0]-angles[-1]))]
    return {'length_pixels':length,'length_shortside':length/short,'chord_pixels':chord,
            'tortuosity':None if closed or chord<1e-9 else length/chord,
            'absolute_turn_degrees':float(np.degrees(np.abs(turn).sum())),
            'signed_turn_degrees':float(np.degrees(turn.sum())),
            'short_accent_candidate':bool(length/short<=PROTOCOL['short_accent_maximum_shortside']),
            'frame_contact':bool(np.any((p[:,0]<=0)|(p[:,0]>=size[0]-1)|(p[:,1]<=0)|(p[:,1]>=size[1]-1))),
            'scope':'Sampled edge-chain geometry; turn can include pixel noise and corners. A chain is not necessarily a painted stroke.'}


def endpoint(chain, end, size):
    p=np.asarray(chain['points'],float)
    if end=='end':p=p[::-1]
    distance=np.r_[0,np.cumsum(np.linalg.norm(np.diff(p,axis=0),axis=1))]
    k=min(len(p)-1,int(np.searchsorted(distance,max(2,min(size)*PROTOCOL['tangent_window_shortside']))))
    v=p[0]-p[k];norm=float(np.linalg.norm(v))
    return {'chain_id':chain['id'],'end':end,'point':p[0].tolist(),'outward_tangent':(v/norm).tolist() if norm else None,
            'window_arc_pixels':float(distance[k]),'frame_truncated':bool(p[0,0]<=1 or p[0,0]>=size[0]-2 or p[0,1]<=1 or p[0,1]>=size[1]-2)}


def gap_candidates(chains, edge, size):
    ends=[endpoint(c,end,size) for c in chains if not c['closed'] for end in ['start','end']]
    if len(ends)<2:return []
    pairs=sorted(cKDTree([e['point'] for e in ends]).query_pairs(min(size)*PROTOCOL['maximum_gap_shortside']))
    rows=[]
    for i,j in pairs:
        a,b=ends[i],ends[j]
        if a['chain_id']==b['chain_id']:continue
        pa,pb=np.asarray(a['point']),np.asarray(b['point']);v=pb-pa;gap=float(np.linalg.norm(v))
        if gap<1e-9:continue # Shared junction, not a missing segment.
        angles=[math.degrees(math.acos(float(np.clip(np.dot(e['outward_tangent'],direction),-1,1)))) if e['outward_tangent'] is not None else None for e,direction in [(a,v/gap),(b,-v/gap)]]
        # Occupancy is sampled only in the interior of the connector, never at its supporting ends.
        xy=np.unique(np.rint(np.linspace(pa,pb,max(3,int(math.ceil(gap*2))+1))).astype(int),axis=0)
        xy=xy[(np.linalg.norm(xy-pa,axis=1)>2)&(np.linalg.norm(xy-pb,axis=1)>2)]
        occupied=int(edge[xy[:,1],xy[:,0]].sum()) if len(xy) else None
        reasons=[]
        if any(x is None for x in angles):reasons.append('tangent_unavailable')
        elif max(angles)>PROTOCOL['maximum_endpoint_angle_degrees']:reasons.append('endpoint_tangents_misaligned')
        if a['frame_truncated'] or b['frame_truncated']:reasons.append('endpoint_at_source_frame')
        rows.append({'id':'G'+str(len(rows)+1),'from':a,'to':b,'gap_pixels':gap,'gap_shortside':gap/min(size),
                     'endpoint_angles_degrees':angles,'connector_interior_samples':int(len(xy)),
                     'intervening_edge_pixels':occupied,
                     'gap_occupancy':None if occupied is None else occupied/len(xy),
                     'status':'rejected' if reasons else 'aligned_gap_candidate', 'rejection_reasons':reasons,
                     'interruption_status':'unavailable' if occupied is None else 'intervening_edge_candidate' if occupied else 'no_sampled_intervening_edge',
                     'semantic_approval':False,
                     'scope':'Dashed connector is a geometric hypothesis across undetected support, not a detected contour. Intervening edges do not establish occlusion or depth.'})
    return rows


def path_for(mask):
    contours,_=cv2.findContours(mask.astype('uint8'),cv2.RETR_LIST,cv2.CHAIN_APPROX_SIMPLE)
    return ' '.join('M'+' L'.join(f'{x},{y}' for x,y in c[:,0,:])+' Z' for c in contours if len(c)>=3)


def components(mask, edge, prefix, masks, comparison=None):
    labels,count=label(mask,generate_binary_structure(2,1));minimum=max(PROTOCOL['minimum_field_pixels'],math.ceil(mask.size*PROTOCOL['minimum_field_area_fraction']))
    rows=[];discarded=[]
    # Find slices once; avoid scanning the entire image for every small component.
    from scipy.ndimage import find_objects
    for i,sl in enumerate(find_objects(labels),1):
        if sl is None:continue
        local=labels[sl]==i;area=int(local.sum())
        if area<minimum:discarded.append({'component':i,'pixels':area,'reason':'below_declared_area_threshold'});continue
        m=np.zeros_like(mask);m[sl]=local;y,x=np.nonzero(m)
        rows.append({'id':prefix+str(i),'pixels':area,'area_fraction':area/m.size,
                     'bounds':[int(x.min()),int(y.min()),int(x.max()+1),int(y.max()+1)],'path':path_for(m),
                     'frame_connected':bool(m[0].any() or m[-1].any() or m[:,0].any() or m[:,-1].any()),
                     'edge_density':float(edge[m].mean()),
                     'region_pixels_inside':{rid:int((m&v).sum()) for rid,v in masks.items()},'semantic_approval':False})
        if comparison is not None:
            shared=int((m&comparison).sum())
            rows[-1].update(pixels_also_enclosed_with_8_connected_background=shared,topology_sensitive=shared!=area)
    return {'fields':rows,'component_count':count,'discarded':discarded,'minimum_pixels':minimum}


def space_evidence(edge, masks):
    for m in masks.values():validate_mask(m,edge.shape)
    holes={str(connectivity):binary_fill_holes(edge,structure=generate_binary_structure(2,connectivity))&~edge for connectivity in [1,2]}
    enclosed=components(holes['1'],edge,'H',masks,comparison=holes['2'])
    covered=np.logical_or.reduce(list(masks.values())) if masks else np.zeros_like(edge)
    unassigned=components(~covered,edge,'U',masks)
    frame=[]
    for rid,m in sorted(masks.items()):
        y,x=np.nonzero(m)
        frame.append({'region_id':rid,'pixels':int(m.sum()),
                      'margins_pixels':None if not len(x) else {'left':int(x.min()),'right':edge.shape[1]-1-int(x.max()),'top':int(y.min()),'bottom':edge.shape[0]-1-int(y.max())},
                      'frame_contact_pixels':{'left':int(m[:,0].sum()),'right':int(m[:,-1].sum()),'top':int(m[0].sum()),'bottom':int(m[-1].sum())},
                      'scope':'Position relative to the reproduction frame, which may differ from the physical painting boundary.'})
    return {'enclosed_edge_fields':enclosed,'unassigned_space':unassigned,'frame_relations':frame,
            'scope':'Flood-fill closure is topology of detected edges. Unassigned pixels are outside the selected proposals, not established negative space or background. No depth ownership is inferred.'}


def analyze_edges(edge, masks=None):
    validate_mask(edge);masks=masks or {}
    for m in masks.values():validate_mask(m,edge.shape)
    size=[edge.shape[1],edge.shape[0]];trace=trace_chains(edge);kept=[];discarded=[]
    minimum=max(3,min(size)*PROTOCOL['minimum_chain_length_shortside'])
    for i,c in enumerate(trace['chains'],1):
        c={'id':'C'+str(i),**c,'geometry':describe_chain(c['points'],c['closed'],size)}
        if c['geometry']['length_pixels']<minimum:discarded.append({'id':c['id'],'points':c['points'],'length_pixels':c['geometry']['length_pixels'],'reason':'below_declared_length_threshold'})
        else:
            xy=np.asarray(c['points'],int)
            c['region_samples']={rid:{'chain_samples':len(xy),'inside_samples':int(m[xy[:,1],xy[:,0]].sum())} for rid,m in masks.items()}
            c['semantic_approval']=False;kept.append(c)
    return {'chains':kept,'discarded_chains':discarded,'junction_pixels':trace['junction_pixels'],
            'isolated_pixels':trace['isolated_pixels'],'trace_accounting':{k:trace[k] for k in ['adjacency_edge_count','traced_edge_count']},
            'gap_candidates':gap_candidates(kept,edge,size),'space':space_evidence(edge,masks),
            'image_size':size,'edge_pixels':int(edge.sum()),'minimum_chain_length_pixels':minimum}


def condition(image, masks, spec):
    size=[max(2,round(v*spec['scale'])) for v in image.size]
    im=image if size==list(image.size) else image.resize(size,Image.Resampling.LANCZOS)
    mm={rid:m if size==list(image.size) else np.asarray(Image.fromarray(m).resize(size,Image.Resampling.NEAREST),bool) for rid,m in masks.items()}
    gray=cv2.cvtColor(np.asarray(im),cv2.COLOR_RGB2GRAY)
    gray=cv2.GaussianBlur(gray,(0,0),spec['sigma'])
    edge=skeletonize(cv2.Canny(gray,spec['low'],spec['high'],L2gradient=True)>0)
    result=analyze_edges(edge,mm)
    scale=[image.width/size[0],image.height/size[1]]
    result.update(id=spec['id'],condition=spec,source_from_condition={'scale':scale,'offset':[(v-1)/2 for v in scale],
        'convention':'Pixel-centre affine map: source = (condition + 0.5) * scale - 0.5.'})
    return result,edge


def matched_chains(primary, secondary):
    """One-to-one bidirectional proximity; unmatched/fragmented chains stay explicit."""
    def points(c,result):
        p=arc_samples(c['points'],2);m=result['source_from_condition'];return p*np.array(m['scale'])+np.array(m['offset'])
    aa={c['id']:points(c,primary) for c in primary['chains']};bb={c['id']:points(c,secondary) for c in secondary['chains']}
    short=min(primary['image_size']);tol=short*PROTOCOL['matching_tolerance_shortside'];eligible=[]
    at={k:cKDTree(v) for k,v in aa.items()};bt={k:cKDTree(v) for k,v in bb.items()}
    for a,pa in aa.items():
        for b,pb in bb.items():
            # Non-overlapping expanded boxes cannot match.
            if np.any(pa.max(axis=0)+tol<pb.min(axis=0)) or np.any(pb.max(axis=0)+tol<pa.min(axis=0)):continue
            ca=float((bt[b].query(pa)[0]<=tol).mean());cb=float((at[a].query(pb)[0]<=tol).mean())
            if min(ca,cb)>=PROTOCOL['minimum_bidirectional_match_fraction']:eligible.append((min(ca,cb),a,b,ca,cb))
    matches=[];used_a=set();used_b=set()
    for score,a,b,ca,cb in sorted(eligible,key=lambda x:(-x[0],x[1],x[2])):
        if a in used_a or b in used_b:continue
        used_a.add(a);used_b.add(b);matches.append({'primary_id':a,'secondary_id':b,'primary_covered_fraction':ca,'secondary_covered_fraction':cb})
    return {'matches':matches,'unmatched_primary':sorted(set(aa)-used_a),'unmatched_secondary':sorted(set(bb)-used_b),
            'primary_matched_fraction':len(matches)/len(aa) if aa else None,'tolerance_source_pixels':tol,
            'scope':'One-to-one proximity under fixed settings. Splits and merges may remain unmatched; this is repeatability, not independent accuracy.'}


def build(image, masks, binding):
    if image.mode!='RGB':raise ValueError('RGB reproduction required')
    for m in masks.values():validate_mask(m,(image.height,image.width))
    conditions=[]
    for spec in PROTOCOL['conditions']:
        result,_=condition(image,masks,spec);conditions.append(result)
    sensitivity={c['id']:matched_chains(conditions[0],c) for c in conditions[1:]}
    return {'version':VERSION,'binding':binding,'image_size':list(image.size),'protocol':PROTOCOL,
            'conditions':conditions,'sensitivity':sensitivity,'semantic_approval':False,'independent_validation':False,
            'limits':['Grayscale edges can miss isoluminant color boundaries and faint marks.',
                      'Edge chains can follow texture, depicted objects or stroke borders; their role is unresolved.',
                      'Detector-generated junctions, aligned gaps and closed fields do not establish perceptual grouping.',
                      'Frame and unassigned-space records inherit source cropping and incomplete region proposals.',
                      'Threshold/resolution checks use these development works; they are not held-out evaluation.']}
