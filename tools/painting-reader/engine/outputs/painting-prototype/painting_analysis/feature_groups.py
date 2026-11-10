"""Source-bound feature members and separate proposal availability.

Source spans establish attribution, never visual truth. Rectangles describe
model proposals, not subject masks or validated complete depiction.
"""
import math

def bind_members(feature,payload):
    members=[];seen=set()
    for i,item in enumerate(payload['members'],1):
        errors=[];field=item['source_field'];quote=item['source_quote'];label=item['label'].strip()
        if field not in ['label','observation'] or not quote or quote not in feature.get(field,''):errors.append('source_quote_not_found')
        if not label:errors.append('empty_label')
        if label.casefold() in seen:errors.append('duplicate_member_label')
        seen.add(label.casefold())
        members.append({'id':'M'+str(i),**item,'source_binding':'exact_span' if not errors else 'rejected','errors':errors})
    relation=payload['relation'];field=relation['source_field'];q=relation['source_quote']
    relation_ok=field in ['label','observation'] and bool(q) and q in feature.get(field,'')
    return {'members':members,'relation':{**relation,'source_binding':'exact_span' if relation_ok else 'rejected'},
        'scope_note':payload['scope_note'],'source_completeness':'not_established','semantic_approval':False}

def box_fraction_inside(member_box,reference_box):
    """Fraction of a proposed member rectangle retained by a reference rectangle."""
    for b in [member_box,reference_box]:
        if len(b)!=4 or any(type(v) not in [int,float] or not math.isfinite(v) or not 0<=v<=1 for v in b) or not(b[0]<b[2] and b[1]<b[3]):raise ValueError('Invalid normalized rectangle')
    l,t,r,b=member_box;x,y,z,w=reference_box
    return max(0,min(r,z)-max(l,x))*max(0,min(b,w)-max(t,y))/((r-l)*(b-t))

def assemble(feature,bound,locations,relation_check,reference_box=None,*,image_sha256):
    wanted={m['id'] for m in bound['members']}
    if set(locations)!=wanted:raise ValueError('Every proposed member must remain accounted for')
    nodes=[]
    for m in bound['members']:
        c=locations[m['id']];box=c.get('normalized_box') if c.get('status')=='location_proposal' else None
        if c.get('image_sha256')!=image_sha256:raise ValueError('Member reproduction mismatch')
        if m['source_binding']!='exact_span' and box is not None:raise ValueError('Rejected source member cannot acquire a location')
        node={**m,'location':c,'has_rectangle_proposal':box is not None}
        if box is not None and reference_box is not None:node['rectangle_fraction_inside_previous_box']=box_fraction_inside(box,reference_box)
        nodes.append(node)
    if relation_check.get('image_sha256')!=image_sha256:raise ValueError('Relation reproduction mismatch')
    all_boxes=bool(nodes) and all(m['has_rectangle_proposal'] for m in nodes)
    return {'feature':feature,'members':nodes,'proposed_relation':bound['relation'],'relation_check':relation_check,
        'availability':'all_proposed_members_have_rectangles' if all_boxes else 'some_proposed_members_unresolved',
        'image_sha256':image_sha256,'complete_feature_coverage':'not_established','semantic_approval':False,'independent_validation':False,
        'scope_note':bound['scope_note'],
        'measurement_limit':'Rectangle overlap compares two model proposals. It does not measure how much of a real subject is retained.'}
