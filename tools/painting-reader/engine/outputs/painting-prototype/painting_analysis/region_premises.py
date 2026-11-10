"""An immutable observational handoff; generated interpretations remain unverified."""
import hashlib
import json
import re
from jsonschema import Draft202012Validator
from .reasoning_model import obj,string

VERSION='region-premise-handoff-0.1'
COLOR_NAMES={'pale_neutral':'pale and nearly neutral','dark':'dark','yellow':'yellow','blue':'blue','green':'green','red':'red','mixed_or_uncertain':'mixed or uncertain in color'}

def digest(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()

def make_premises(registry):
    """Only scoped color and measured position; omit object/material guesses entirely."""
    premises=[];withheld=[];seen=set()
    for record in registry:
        rid=record['region_id']
        if rid in seen or not re.fullmatch(r'R[1-9][0-9]*',rid):raise ValueError('Invalid/duplicate region ID')
        seen.add(rid)
        if not record['diagnostics']['eligible_as_proposal']:
            withheld.append({'region_id':rid,'reason':record['diagnostics']['issues']});continue
        color=record['proposal']['dominant_color']
        if color not in COLOR_NAMES:raise ValueError('Unknown color category')
        x,y=record['view_binding']['centroid_normalized']
        if not(0<=x<=1 and 0<=y<=1):raise ValueError('Invalid centroid')
        vertical='above' if y<.5 else 'below'
        horizontal='toward the left' if x<1/3 else ('toward the right' if x>2/3 else 'near the horizontal center')
        text=f'A region {vertical} the image midpoint, {horizontal}, is provisionally described as {COLOR_NAMES[color]}.'
        p={'id':'P-'+rid,'region_id':rid,'observation':text,'color_category':color,
            'source_kind':'constructed_from_mask_position_and_unverified_model_color',
            'source_region_record_sha256':digest(record),'native_request_sha256':record['native_request_sha256'],
            'source_fields':['/view_binding/centroid_normalized','/proposal/dominant_color'],
            'scope':'Mask centroid location plus tentative model color; not object identity, physical material, artistic role or independent color truth.',
            'uncertainties':record['diagnostics']['issues'],'semantic_approval':False}
        p['sha256']=digest(p);premises.append(p)
    return {'premises':premises,'withheld':withheld,'version':VERSION}

def schema(premises):
    if len(premises)<2:raise ValueError('At least two eligible premises required for a relationship')
    return obj({'relations':{'type':'array','minItems':1,'maxItems':2,'items':obj({
        'premise_ids':{'type':'array','minItems':2,'maxItems':3,'uniqueItems':True,'items':{'enum':[p['id'] for p in premises]}},
        'interpretation':string(320),'bridge':string(400),'alternative':string(300)})}})

def compile_reading(payload,premises):
    """Resolve exact source text; refuse changes and missing IDs rather than repair them."""
    Draft202012Validator(schema(premises)).validate(payload)
    lookup={}
    for p in premises:
        without_hash={k:v for k,v in p.items() if k!='sha256'}
        if digest(without_hash)!=p['sha256']:raise ValueError('Premise integrity mismatch')
        if p['id'] in lookup:raise ValueError('Duplicate premise ID')
        lookup[p['id']]=p
    relations=[]
    for r in payload['relations']:
        bound=[lookup[pid] for pid in r['premise_ids']]
        text=' '.join(r[k] for k in ['interpretation','bridge','alternative']).lower()
        supplied_colors={p['color_category'] for p in bound};concerns=[]
        for color in ['yellow','blue','green','red','dark']:
            if re.search(r'\b'+color+r'\b',text) and color not in supplied_colors:
                concerns.append('color_not_in_cited_premises:'+color)
        if not re.search(r'\b(?:may|might|could|possibly|perhaps)\b',r['interpretation'],re.I):
            concerns.append('interpretation_not_explicitly_tentative')
        if re.search(r'\b(?:canvas|paper|pigment|binder|artist intended)\b',text):concerns.append('external_evidence_required')
        relations.append({'observations':[{'premise_id':p['id'],'text':p['observation'],'source_sha256':p['sha256']} for p in bound],
                          **r,'concerns':concerns,'status':'hypothesis_requires_review','semantic_approval':False})
    return {'version':VERSION,'relations':relations,'binding_integrity':'verified_exact_copy',
            'observation_origin':'deterministic rendering of source-bound fields; not new native prose',
            'semantic_approval':False,'limits':['Exact copying establishes traceability, not truth of the source observation.',
            'Interpretations, bridges and alternatives can still introduce unsupported features or effects.',
            'Color-word screening is incomplete; independent semantic review remains necessary.']}
