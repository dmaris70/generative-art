"""Typed measured relations and alternative inspection hypotheses, never a chosen meaning."""
import itertools
import numpy as np
from scipy.ndimage import binary_dilation,distance_transform_edt
from .features import rgb_to_lab

def region_color(image,mask,domain):
    lab=rgb_to_lab(np.asarray(image,dtype=float)/255)
    if not mask.any():return {'status':'unavailable','mean_lab':None,'rings':[]}
    mean=lab[mask].mean(0);rows=[]
    for fraction in [.03,.06]:
        radius=max(1,round(min(image.size)*fraction));ring=binary_dilation(mask,iterations=radius)&~mask&domain
        comparison=lab[ring].mean(0) if ring.any() else None
        rows.append({'radius_pixels':radius,'comparison_pixels':int(ring.sum()),'signed_lab_difference':(mean-comparison).tolist() if comparison is not None else None})
    return {'status':'measured_proposal','mean_lab':mean.tolist(),'rings':rows,'scope':'sRGB/D65 reproduction pixels in a proposed region; no pigment or emotional temperature measurement.'}

def axial_difference(a,b):return abs((a-b+90)%180-90) if a is not None and b is not None else None

def build_relations(regions,masks,size):
    evidence=[];pairs=[]
    for r in regions:
        rid=r['id']
        for family,key in [('shape','geometry'),('color','color'),('directions','directions'),('boundary','boundary')]:
            evidence.append({'id':rid+':'+family,'kind':'measurement_proxy' if family=='directions' else 'measurement','region_ids':[rid],'facts':r[key],
                'scope':'Descriptor of the supplied region proposal; no verified silhouette, physical stroke, artistic hierarchy or causal affect.'})
    for a,b in itertools.combinations(regions,2):
        ma,mb=masks[a['id']]['consensus'],masks[b['id']]['consensus'];counta=int(ma.sum());countb=int(mb.sum());both=int((ma&mb).sum())
        pair={'id':a['id']+'--'+b['id'],'region_ids':[a['id'],b['id']],
            'overlap_pixels':both,'overlap_fraction_of_smaller':both/min(counta,countb) if min(counta,countb)>0 else None,
            'nearest_gap_fraction_of_shortside':float(distance_transform_edt(~ma)[mb].min()/min(size)) if counta and countb else None,
            'shape_axis_difference_degrees':axial_difference(a['geometry'].get('principal_axis_degrees_clockwise_from_right'),b['geometry'].get('principal_axis_degrees_clockwise_from_right')),
            'signed_mean_lab_difference':(np.array(a['color']['mean_lab'])-np.array(b['color']['mean_lab'])).tolist() if a['color']['mean_lab'] is not None and b['color']['mean_lab'] is not None else None,'direction_scales':[]}
        for aa,bb in zip(a['directions'],b['directions']):
            x,y=aa['primary'],bb['primary'];hx,hy=x['orientation_histogram_12'],y['orientation_histogram_12'];similarity=None
            if hx is not None and hy is not None:
                hx=np.array(hx);hy=np.array(hy);similarity=float(np.dot(hx,hy)/(np.linalg.norm(hx)*np.linalg.norm(hy)))
            curvedratio=x['curved_fraction_of_eligible']/y['curved_fraction_of_eligible'] if x['curved_fraction_of_eligible'] is not None and y['curved_fraction_of_eligible'] is not None and y['curved_fraction_of_eligible']>0 else None
            pair['direction_scales'].append({'blur_pixels':x['blur_pixels'],'orientation_histogram_cosine':similarity,
                'mean_axis_difference_degrees':axial_difference(x['mean_tangent_degrees_clockwise_from_right'],y['mean_tangent_degrees_clockwise_from_right']),
                'curved_fraction_ratio_a_over_b':curvedratio,
                'curved_fraction_difference_a_minus_b':x['curved_fraction_of_eligible']-y['curved_fraction_of_eligible'] if x['curved_fraction_of_eligible'] is not None and y['curved_fraction_of_eligible'] is not None else None})
        pairs.append(pair);evidence.append({'id':pair['id']+':relation','kind':'measurement','region_ids':pair['region_ids'],'facts':pair,
            'scope':'Pairwise descriptors; a histogram cosine is not artistic similarity, and estimated image-tangent curvature is not physical stroke grouping.'})
    return evidence,pairs

def alternatives(regions,pairs):
    ids=[r['id'] for r in regions];names={r['id']:r['label'] for r in regions};pairids=[p['id']+':relation' for p in pairs]
    if len(ids)<2:return [{'id':'H0','status':'unresolved','text':'Too few usable region proposals for a relational account.','support_ids':[],'challenge_ids':[],'missing':'Additional inspectable region proposals.'}]
    strong=[p for p in pairs if p['signed_mean_lab_difference'] and abs(p['signed_mean_lab_difference'][0])>=3 or p['shape_axis_difference_degrees'] is not None and p['shape_axis_difference_degrees']>=25]
    continuous=[p for p in pairs if any(s['orientation_histogram_cosine'] is not None and s['orientation_histogram_cosine']>=.65 for s in p['direction_scales'])]
    contrast_text='No declared contrast inspection condition was met.'
    if strong:
        p=max(strong,key=lambda p:abs(p['signed_mean_lab_difference'][0]) if p['signed_mean_lab_difference'] else 0);a,b=p['region_ids'];d=p['signed_mean_lab_difference'];angle=p['shape_axis_difference_degrees']
        contrast_text=f'One possible account emphasizes separation between {names[a]} and {names[b]}. '
        if d:contrast_text+=f'The first proposal is {abs(d[0]):.1f} L* '+('darker' if d[0]<0 else 'lighter')+' in mean lightness. '
        if angle is not None:contrast_text+=f'Their geometric long axes differ by {angle:.0f}°. '
        contrast_text+='These differences may articulate distinct masses, but do not establish a focal point or actual gaze.'
    continuity_text='No declared directional-recurrence inspection condition was met.'
    if continuous:
        p=max(continuous,key=lambda p:sum(s['orientation_histogram_cosine'] is not None and s['orientation_histogram_cosine']>=.65 for s in p['direction_scales']));a,b=p['region_ids'];n=sum(s['orientation_histogram_cosine'] is not None and s['orientation_histogram_cosine']>=.65 for s in p['direction_scales'])
        continuity_text=f'Another account considers recurring image-tangent directions between {names[a]} and {names[b]}; the declared similarity condition holds at {n} of three scales. This may connect regions that differ in color or shape. It does not establish a shared physical brushstroke rhythm.'
    hypotheses=[{'id':'H1','status':'qualified_inspection_hypothesis' if strong else 'unresolved',
        'text':contrast_text,
        'support_ids':[p['id']+':relation' for p in strong],'challenge_ids':[p['id']+':relation' for p in pairs if p not in strong],
        'selection_rule':'Inspection candidate when |mean L* difference| >= 3 or shape-axis separation >= 25 degrees; neither threshold is perceptually calibrated.',
        'alternative':'Directional similarities may bind these regions despite their differences.',
        'missing':'Independent boundary assessment and viewer/art-historical evaluation of the proposed organizing effect.'},
        {'id':'H2','status':'qualified_inspection_hypothesis' if continuous else 'unresolved',
        'text':continuity_text,
        'support_ids':[p['id']+':relation' for p in continuous],'challenge_ids':[p['id']+':relation' for p in pairs if p not in continuous],
        'selection_rule':'Inspection candidate when at least one declared scale has histogram cosine >= 0.65; scale-specific disagreement remains visible.',
        'alternative':'Geometric and lightness differences may organize the work more strongly than directional recurrence.',
        'missing':'Evidence that the proposed recurrence is perceptually consequential, rather than texture or boundary artifacts.'}]
    # The whole-work question keeps both possibilities and all participating regions.
    return hypotheses+[{'id':'H3','status':'unresolved','text':'The central question is how separation and continuity work together across all proposed regions. Neither account is selected as the meaning of the painting.',
        'support_ids':[h['id'] for h in hypotheses],'challenge_ids':[],
        'configuration_region_ids':ids,'configuration_relation_ids':pairids,
        'missing':'Independent assessment of the complete image and comparison with credible alternative region boundaries.'}]
