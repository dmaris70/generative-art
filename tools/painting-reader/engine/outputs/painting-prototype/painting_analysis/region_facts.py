"""Exact selected-pixel predicates, kept separate from depicted-object meanings."""
import itertools
from .region_hypotheses import verify_graph,digest

def pair_facts(graph,masks,a,b):
    regions=verify_graph(graph,masks)
    if a==b or a not in regions or b not in regions:raise ValueError('Two known distinct region IDs required')
    if regions[a]['empty'] or regions[b]['empty']:raise ValueError('Nonempty selected pixel scopes required')
    ma,mb=masks[a],masks[b];da,db=regions[a]['descriptor'],regions[b]['descriptor']
    na,nb=int(ma.sum()),int(mb.sum());shared=int((ma&mb).sum());union=na+nb-shared
    # Exact integer counts decide set predicates. Rounded IoU never decides equality or containment.
    values={'a_pixels':na,'b_pixels':nb,'shared_pixels':shared,'union_pixels':union,
        'a_outside_b_pixels':na-shared,'b_outside_a_pixels':nb-shared,
        'a_contained_in_b':shared==na,'b_contained_in_a':shared==nb,
        'equal_pixel_sets':shared==na==nb,'disjoint_pixel_sets':shared==0,
        'iou':shared/union,'fraction_a_inside_b':shared/na,'fraction_b_inside_a':shared/nb,
        'mean_lightness_a':da['mean_lab_d65'][0],'mean_lightness_b':db['mean_lab_d65'][0],
        'mean_lightness_a_less_b':da['mean_lab_d65'][0]<db['mean_lab_d65'][0],
        'mean_lightness_difference_a_minus_b':da['mean_lab_d65'][0]-db['mean_lab_d65'][0],
        'centroid_a':da['centroid_normalized'],'centroid_b':db['centroid_normalized'],
        'centroid_displacement_a_minus_b':[x-y for x,y in zip(da['centroid_normalized'],db['centroid_normalized'])]}
    fact={'version':'region-facts-0.1','subject':a,'reference':b,'graph_sha256':graph['sha256'],
        'image_sha256':graph['image_sha256'],'mask_pixel_sha256s':[regions[a]['mask_pixel_sha256'],regions[b]['mask_pixel_sha256']],
        'values':values,'scope':'Selected reproduction pixels; not object identity, physical depth, contact, pattern repetition, symmetry, attention or significance.',
        'rounding':'Integer pixel predicates are exact on these masks. Floating color/centroid measurements are computational values; displayed rounding does not establish exact equality.',
        'semantic_approval':False}
    fact['id']='FACT-'+digest(fact)[:20]
    return fact

def render_pair(fact,aliases=None):
    aliases=aliases or {};a=aliases.get(fact['subject'],fact['subject']);b=aliases.get(fact['reference'],fact['reference']);v=fact['values']
    if v['equal_pixel_sets']:geometry=f'{a} and {b} select exactly the same {v["shared_pixels"]:,} pixels.'
    elif v['disjoint_pixel_sets']:geometry=f'{a} and {b} share no selected pixels.'
    else:
        geometry=f'{a} and {b} share {v["shared_pixels"]:,} pixels.'
        if v['a_contained_in_b']:geometry+=f' Every pixel in {a} is inside {b}; {b} contains {v["b_outside_a_pixels"]:,} additional pixels.'
        elif v['b_contained_in_a']:geometry+=f' Every pixel in {b} is inside {a}; {a} contains {v["a_outside_b_pixels"]:,} additional pixels.'
        else:geometry+=f' {a} has {v["a_outside_b_pixels"]:,} pixels outside {b}, and {b} has {v["b_outside_a_pixels"]:,} outside {a}.'
    dl=v['mean_lightness_difference_a_minus_b']
    if dl==0:color='Their computed mean L* values are equal.'
    elif abs(dl)<.005:color='Their computed mean L* values differ by less than 0.005; rounding to two decimal places conceals this difference.'
    else:color=f'{a} has {"lower" if dl<0 else "higher"} mean L* than {b}, by approximately {abs(dl):.2f} units.'
    return geometry+' '+color+' These are selected-pixel measurements, not depicted-object relationships.'

def build_facts(graph,masks,region_ids):
    if len(set(region_ids))!=len(region_ids):raise ValueError('Duplicate region ID')
    facts=[pair_facts(graph,masks,a,b) for a,b in itertools.combinations(region_ids,2)]
    return {'graph_sha256':graph['sha256'],'region_ids':list(region_ids),'pairs':facts,
        'semantic_approval':False,'identity_status':'unresolved','method':'Boolean mask set operations plus retained pixel descriptors; no language-model adjudication.'}
