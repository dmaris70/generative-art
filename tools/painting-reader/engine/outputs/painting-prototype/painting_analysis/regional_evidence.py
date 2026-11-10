"""Reproduction distributions, immediate boundary contrasts and axial directions.

All statistics concern proposed pixel masks. No perceptual threshold, physical
brushstroke identity, artistic intention or viewer effect is inferred.
"""
from __future__ import annotations
import itertools
import numpy as np
from .features import rgb_to_lab
from .directional_relations import tensor_field, summarize_field
from .checked_interpretation import digest

VERSION = 'regional-evidence-0.1'
MINIMUM_PIXELS = 20
QUANTILES = [.05, .25, .5, .75, .95]


def validate_inputs(image, domain, masks):
    if image.mode != 'RGB' or min(image.size) < 8:
        raise ValueError('An RGB reproduction at least 8 pixels wide/high is required')
    shape=(image.height,image.width)
    if not isinstance(domain,np.ndarray) or domain.dtype!=bool or domain.shape!=shape or domain.sum()<20:
        raise ValueError('Invalid analysis domain')
    if not masks: raise ValueError('No masks supplied')
    for rid,mask in masks.items():
        if not isinstance(rid,str) or not rid.startswith('R') or not rid[1:].isdigit():raise ValueError('Invalid region ID')
        if not isinstance(mask,np.ndarray) or mask.dtype!=bool or mask.shape!=shape:
            raise ValueError('Mask must be boolean and match image dimensions')
        if np.any(mask & ~domain):raise ValueError('Mask extends outside analysis domain')


def normalized_hist(values, edges):
    counts=np.histogram(values,bins=edges)[0].astype(float)
    if counts.sum()==0:return None
    return (counts/counts.sum()).tolist()


def intersection(a,b):
    if a is None or b is None:return None
    a,b=np.asarray(a,dtype=float),np.asarray(b,dtype=float)
    if a.shape!=b.shape or a.ndim!=1 or not np.isfinite(a).all() or not np.isfinite(b).all():raise ValueError('Invalid histograms')
    if np.any(a<0) or np.any(b<0) or not np.isclose(a.sum(),1) or not np.isclose(b.sum(),1):raise ValueError('Histograms must be normalized')
    return float(np.minimum(a,b).sum())


def distribution(lab,mask):
    pixels=lab[mask];n=len(pixels)
    if n<MINIMUM_PIXELS:return {'status':'insufficient_pixels','pixels':n}
    mean=pixels.mean(axis=0)
    # Quantization is declared; the unclipped values remain in numeric summaries.
    edges=[np.linspace(0,100,21),np.linspace(-128,128,17),np.linspace(-128,128,17)]
    return {'status':'measured','pixels':n,'mean_lab':mean.tolist(),
            'std_lab':pixels.std(axis=0).tolist(),
            'quantile_probabilities':QUANTILES,
            'lab_quantiles':np.quantile(pixels,QUANTILES,axis=0).tolist(),
            'distance_from_region_mean_delta_e76_quantiles':np.quantile(np.linalg.norm(pixels-mean,axis=1),QUANTILES).tolist(),
            'histograms':{name:{'edges':e.tolist(),'mass':normalized_hist(np.clip(pixels[:,i],e[0],e[-1]),e)} for i,(name,e) in enumerate(zip(['L','a','b'],edges))},
            'scope':'Assumed sRGB/D65 reproduction values. Delta E76 is Euclidean Lab distance, not calibrated perceptual significance or pigment identity.'}


def adjacent_samples(lab,a,b):
    """Every horizontal/vertical edge from A to B once, oriented A -> B.

    No bridging of gaps or diagonal contact. Overlap is excluded explicitly.
    Endpoint pixels may occur in several distinct edges; counts are edges,
    not statistically independent samples.
    """
    aa=a & ~b;bb=b & ~a;left=[];right=[]
    for u,v in [((slice(None),slice(None,-1)),(slice(None),slice(1,None))),
                ((slice(None,-1),slice(None)),(slice(1,None),slice(None)))]:
        forward=aa[u]&bb[v];backward=bb[u]&aa[v]
        left.extend([lab[u][forward],lab[v][backward]])
        right.extend([lab[v][forward],lab[u][backward]])
    return np.concatenate(left),np.concatenate(right)


def boundary_contrast(lab,a,b):
    x,y=adjacent_samples(lab,a,b);n=len(x);overlap=int((a&b).sum())
    result={'status':'no_direct_contact' if n==0 else 'insufficient_edges' if n<MINIMUM_PIXELS else 'measured',
            'edge_count':n,'overlap_pixels_excluded':overlap,
            'scope':'4-neighbor cross-mask edges; signed differences are B minus A. No gap is bridged. Edges are not independent perceptual trials.'}
    if n<MINIMUM_PIXELS:return result
    diff=y-x
    result.update(signed_L_difference_quantiles=np.quantile(diff[:,0],QUANTILES).tolist(),
                  absolute_L_difference_quantiles=np.quantile(abs(diff[:,0]),QUANTILES).tolist(),
                  delta_e76_quantiles=np.quantile(np.linalg.norm(diff,axis=1),QUANTILES).tolist(),
                  median_lab_A=np.median(x,axis=0).tolist(),median_lab_B=np.median(y,axis=0).tolist())
    return result


def color_overlap(lab,a,b):
    if min(a.sum(),b.sum())<MINIMUM_PIXELS:return {'status':'insufficient_pixels'}
    pa,pb=lab[a],lab[b];rows=[]
    for counts in [(10,8,8),(20,16,16)]:
        edges=[np.linspace(0,100,counts[0]+1),np.linspace(-128,128,counts[1]+1),np.linspace(-128,128,counts[2]+1)]
        aa=np.clip(pa,[0,-128,-128],[100,128,128]);bb=np.clip(pb,[0,-128,-128],[100,128,128])
        ha=np.histogramdd(aa,bins=edges)[0].ravel();hb=np.histogramdd(bb,bins=edges)[0].ravel()
        rows.append({'bins_lab':list(counts),'intersection':intersection(ha/ha.sum(),hb/hb.sum())})
    lightness=[]
    for bins in [20,40]:
        e=np.linspace(0,100,bins+1)
        lightness.append({'bins':bins,'intersection':intersection(normalized_hist(np.clip(pa[:,0],0,100),e),normalized_hist(np.clip(pb[:,0],0,100),e))})
    return {'status':'measured','joint_lab_histogram_intersection':rows,'lightness_histogram_intersection':lightness,
            'scope':'Histogram overlap at declared bin widths. 1 means identical bin proportions; 0 means disjoint bins. This is not a probability of artistic similarity.'}


def compare_directions(a,b):
    rows=[]
    for x,y in zip(a,b):
        measured=x['orientation_histogram_12'] is not None and y['orientation_histogram_12'] is not None
        p,q=x['mean_tangent_degrees_clockwise_from_right'],y['mean_tangent_degrees_clockwise_from_right']
        angle=abs(p-q)%180 if p is not None and q is not None else None
        if angle is not None:angle=min(angle,180-angle)
        rows.append({'blur_pixels':x['blur_pixels'],'status':'measured' if measured else 'insufficient_direction_samples',
                     'histogram_intersection':intersection(x['orientation_histogram_12'],y['orientation_histogram_12']),
                     'axial_mean_difference_degrees':angle,
                     'concentration_A':x['global_axial_concentration'],'concentration_B':y['global_axial_concentration'],
                     'eligible_pixels_A':x['eligible_direction_pixels'],'eligible_pixels_B':y['eligible_direction_pixels']})
    return rows


def analyze_condition(image,domain,masks,direction_config,fields=None):
    validate_inputs(image,domain,masks)
    lab=rgb_to_lab(np.asarray(image,dtype=float)/255)
    fields=fields or [tensor_field(image,domain,s,direction_config) for s in direction_config['blur_at_512']]
    regions={}
    for rid,mask in masks.items():
        ys,xs=np.nonzero(mask)
        regions[rid]={'distribution':distribution(lab,mask),
                      'centroid_normalized':[float(xs.mean()/image.width),float(ys.mean()/image.height)] if len(xs) else None,
                      'surround_boundary':boundary_contrast(lab,mask,domain&~mask),
                      'directions':[summarize_field(f,mask,image.size,direction_config) for f in fields]}
    pairs={}
    for a,b in itertools.combinations(sorted(masks),2):
        da,db=regions[a]['distribution'],regions[b]['distribution']
        both=da['status']==db['status']=='measured'
        signed=np.array(db['mean_lab'])-np.array(da['mean_lab']) if both else None
        pooled=float(np.sqrt((da['std_lab'][0]**2+db['std_lab'][0]**2)/2)) if both else None
        pairs[a+'--'+b]={'region_ids':[a,b],'signed_mean_lab_B_minus_A':signed.tolist() if both else None,
                         'mean_L_difference_over_pooled_within_std':float(abs(signed[0])/pooled) if both and pooled>1e-12 else None,
                         'color_overlap':color_overlap(lab,masks[a],masks[b]),
                         'direct_boundary':boundary_contrast(lab,masks[a],masks[b]),
                         'directions':compare_directions(regions[a]['directions'],regions[b]['directions'])}
    return {'regions':regions,'pairs':pairs}


def interval(values):
    observed=[v for v in values if v is not None]
    return {'available':len(observed),'total':len(values),'range':[min(observed),max(observed)] if observed else None}


def summarize_conditions(conditions):
    """Ranges report a finite sensitivity sweep, never confidence intervals."""
    result={}
    for key in conditions['consensus']['pairs']:
        pairs=[c['pairs'][key] for c in conditions.values()]
        light=[p['signed_mean_lab_B_minus_A'][0] if p['signed_mean_lab_B_minus_A'] is not None else None for p in pairs]
        valid=[v for v in light if v is not None]
        result[key]={'conditions':list(conditions),
                     'signed_mean_L_difference':interval(light),
                     'same_nonzero_lightness_order_in_all_conditions':len(valid)==len(light) and (all(v>0 for v in valid) or all(v<0 for v in valid)),
                     'lightness_overlap':interval([p['color_overlap']['lightness_histogram_intersection'][0]['intersection'] if p['color_overlap']['status']=='measured' else None for p in pairs]),
                     'boundary_statuses':{name:c['pairs'][key]['direct_boundary']['status'] for name,c in conditions.items()},
                     'boundary_median_delta_e76':interval([p['direct_boundary'].get('delta_e76_quantiles',[None]*5)[2] for p in pairs]),
                     'direction_overlap_across_masks_and_scales':interval([d['histogram_intersection'] for p in pairs for d in p['directions']]),
                     'direction_mean_angle_difference_across_masks_and_scales':interval([d['axial_mean_difference_degrees'] for p in pairs for d in p['directions']]),
                     'scope':'Observed sensitivity across declared masks/scales only; not a confidence interval or independent segmentation accuracy.'}
    return result


def measure(image,domain,mask_conditions,config,bindings):
    if 'consensus' not in mask_conditions:raise ValueError('Consensus masks required')
    region_ids=set(mask_conditions['consensus'])
    for masks in mask_conditions.values():
        if set(masks)!=region_ids:raise ValueError('Conditions must contain identical region IDs')
        validate_inputs(image,domain,masks)
    fields=[tensor_field(image,domain,s,config) for s in config['blur_at_512']]
    conditions={name:analyze_condition(image,domain,masks,config,fields) for name,masks in mask_conditions.items()}
    result={'version':VERSION,'image_size':list(image.size),'bindings':bindings,'direction_config':config,
            'minimum_samples':MINIMUM_PIXELS,'conditions':conditions,'sensitivity':summarize_conditions(conditions),
            'semantic_approval':False,
            'limits':['Reproduction pixels and proposed masks, not original pigments or physical brushstrokes.',
                      'Finite mask/scale sensitivity ranges are not statistical confidence intervals.',
                      'No independent perceptual or art-historical validation.']}
    result['sha256']=digest(result)
    return result


def evidence_cards(result):
    """Deterministic measured statements and explicitly conditional effects."""
    unsigned={k:v for k,v in result.items() if k!='sha256'}
    if digest(unsigned)!=result['sha256']:raise ValueError('Altered measurement artifact')
    cards=[]
    for key,pair in result['conditions']['consensus']['pairs'].items():
        a,b=pair['region_ids'];s=result['sensitivity'][key];facts=[]
        def add(path,text):facts.append({'measurement_path':path,'statement':text,'artifact_sha256':result['sha256']})
        root='/conditions/consensus/pairs/'+key
        overlap=pair['color_overlap']
        if overlap['status']=='measured':
            d=pair['signed_mean_lab_B_minus_A'][0];o=overlap['lightness_histogram_intersection'][0]['intersection']
            add(root+'/signed_mean_lab_B_minus_A',f'{b} minus {a}: mean lightness difference {d:+.2f} L*.')
            add(root+'/color_overlap/lightness_histogram_intersection/0',f'The sampled lightness distributions overlap by {100*o:.1f}% with 20 fixed bins.')
            overlaps=[v['intersection'] for v in overlap['joint_lab_histogram_intersection']]
            add(root+'/color_overlap/joint_lab_histogram_intersection',f'Joint Lab color-distribution overlap is {100*min(overlaps):.1f}–{100*max(overlaps):.1f}% across the two declared bin grids.')
        boundary=pair['direct_boundary']
        if boundary['status']=='measured':
            add(root+'/direct_boundary',f'{boundary["edge_count"]} direct pixel-edge contacts; median cross-edge color distance {boundary["delta_e76_quantiles"][2]:.2f} Delta E76.')
            boundary_reading='A local separation reading can now be examined against actual cross-edge samples, alongside the broader color distributions.'
        else:
            add(root+'/direct_boundary',f'Direct boundary comparison: {boundary["status"].replace("_"," ")} ({boundary["edge_count"]} pixel-edge contacts).')
            boundary_reading='These masks do not provide enough direct boundary samples to support a shared-edge explanation.'
        measured=[d for d in pair['directions'] if d['histogram_intersection'] is not None]
        if measured:
            v=[d['histogram_intersection'] for d in measured]
            add(root+'/directions',f'Direction-distribution overlap is {100*min(v):.1f}–{100*max(v):.1f}% across {len(v)} available blur scales.')
        else:add(root+'/directions','Direction comparison is unavailable: too few eligible image-direction samples.')
        cards.append({'id':key,'region_ids':[a,b],'checked_observations':facts,
                      'possible_effect':f'Color separation or continuity between areas {a[1:]} and {b[1:]} remains a compositional hypothesis. '+boundary_reading,
                      'alternative':'Whole-area averages may conceal substantial local variation; similar direction histograms need not form a continuous path.',
                      'sensitivity':s,'effect_status':'authored_hypothesis_not_validated','semantic_approval':False,
                      'next_evidence':'Inspect the highlighted samples and mask alternatives, then test whether independent viewers find this relationship important.'})
    return cards
