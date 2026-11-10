"""Render computed mask predicates as explicit reading sources, without semantic approval."""
import copy
from .region_hypotheses import verify_graph
from .region_facts import pair_facts

def scope_name(graph,rid):
    if rid==graph['whole_region_id']:return 'whole reproduction (all image pixels)'
    complements=[c['region_id'] for c in graph['complements'] if c['complement_region_id']==rid]
    if complements:return 'pixel complement of '+', '.join(complements)+'; not verified background'
    return 'selected mask pixels; object/part/group identity unresolved'

def fact_text(f):
    a,b=f['subject'],f['reference'];v=f['values']
    sentences=[f'{a} has {v["a_pixels"]} selected pixels. {b} has {v["b_pixels"]} selected pixels. They share {v["shared_pixels"]} selected pixels.',
        f'Exactly {v["a_outside_b_pixels"]} pixels of {a} lie outside {b}; exactly {v["b_outside_a_pixels"]} pixels of {b} lie outside {a}.',
        f'Fraction of {a} inside {b}: {v["fraction_a_inside_b"]:.8f}. Fraction of {b} inside {a}: {v["fraction_b_inside_a"]:.8f}.',
        f'All pixels of {a} are inside {b}: {str(v["a_contained_in_b"]).lower()}. All pixels of {b} are inside {a}: {str(v["b_contained_in_a"]).lower()}.',
        f'Exactly equal selected pixel sets: {str(v["equal_pixel_sets"]).lower()}. No shared selected pixels: {str(v["disjoint_pixel_sets"]).lower()}.',
        f'Intersection-over-union is {v["iou"]:.8f}; it is shared pixels divided by union pixels, not the fraction of either region inside the other.']
    dl=v['mean_lightness_difference_a_minus_b']
    sentences.append(f'Mean L* of {a} is {v["mean_lightness_a"]:.8f}; mean L* of {b} is {v["mean_lightness_b"]:.8f}. '+
        ('The computed means are equal.' if dl==0 else f'{a} has {"lower" if dl<0 else "higher"} mean L* than {b} by {abs(dl):.8f} units.'))
    for axis,k,negative,positive in [('x',0,'left','right'),('y',1,'above','below')]:
        d=v['centroid_displacement_a_minus_b'][k]
        relation='equal on this axis' if d==0 else f'{negative if d<0 else positive} on this axis'
        sentences.append(f'Centroid {axis} of {a}: {v["centroid_a"][k]:.8f}; of {b}: {v["centroid_b"][k]:.8f}. The centroid of {a} is {relation} relative to the centroid of {b}.')
    sentences.append('All coordinates are normalized in the image plane, with origin top-left and y increasing downward. Centroid ordering does not order every pixel or establish a depicted-object relationship. Rounded displays do not establish exact equality. No identity, physical depth, contact, symmetry, salience or artistic meaning is inferred.')
    return ' '.join(sentences)

def explicit_bundle(graph,masks,original):
    regions=verify_graph(graph,masks)
    if original['graph_sha256']!=graph['sha256'] or original['image_sha256']!=graph['image_sha256']:raise ValueError('Wrong graph or reproduction')
    if not set(original['region_ids'])<=set(regions):raise ValueError('Unknown region')
    result=copy.deepcopy(original)
    for source in result['sources']:
        if source['kind']=='pixel_measurement':
            rid=source['region_ids'][0];source['scope_role']=scope_name(graph,rid)
            source['text']+=' Scope role: '+source['scope_role']+'.'
        elif source['kind']=='pixel_relationship':
            a,b=source['region_ids'];f=pair_facts(graph,masks,a,b)
            source['text']=fact_text(f);source['computed_fact']=f
    result['policy']+=' Explicit computed containment, directional fractions, centroid directions and scope roles replace ambiguous numeric shorthand. All selected masks, IDs and identity hypotheses remain unchanged.'
    result['source_representation']='explicit-computed-pixel-facts-v1'
    return result
