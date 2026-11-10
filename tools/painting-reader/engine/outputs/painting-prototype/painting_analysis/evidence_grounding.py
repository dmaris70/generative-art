"""Experimental typed claim bindings. Passing checks never approves an interpretation.

Regions locate content; evidence records support properties. Optional pixel guards
flag gross mismatches on proposed masks, not semantic object or material truth.
"""
from __future__ import annotations

import re
import numpy as np
from jsonschema import Draft202012Validator
from .reasoning_model import obj, string

VERSION = 'claim-grounding-0.2'
COLORS = ['not_claimed', 'pale_neutral', 'dark', 'yellow', 'blue', 'green', 'red', 'mixed_or_uncertain']
PROPERTY_SOURCES = {
    'color': {'color', 'relation'}, 'shape': {'shape'},
    'position': {'shape', 'relation'}, 'pattern': {'directions'},
    'relation': {'relation'}, 'appearance': {'color', 'shape', 'directions', 'relation'},
}
COLOR_WORDS = {
    'pale_neutral': r'\b(?:white|pale|neutral)\b', 'dark': r'\b(?:dark|black)\b',
    'yellow': r'\b(?:yellow|golden|gold)\b', 'blue': r'\b(?:blue|bluish)\b',
    'green': r'\b(?:green|greenish)\b', 'red': r'\b(?:red|reddish)\b',
}
EFFECT_WORDS = r'\b(?:anchor\w*|ground(?:ed|ing)|balances?|tension|turmoil|guid(?:e|es|ing) the eye|calm\w*|evok\w*|symbol\w*)\b'


def schema(evidence, regions):
    citation = {'type':'array', 'minItems':1, 'maxItems':4, 'uniqueItems':True,
                'items':{'enum':['IMAGE'] + [e['id'] for e in evidence]}}
    anchor = obj({
        'region_id':{'enum':['whole_image'] + [r['id'] for r in regions]},
        'phrase':string(220), 'property':{'enum':list(PROPERTY_SOURCES)},
        'evidence_ids':citation,
        'dominant_color':{'enum':COLORS},
        'shape_axis':{'enum':['not_claimed','vertical','horizontal','diagonal']},
    })
    claim = obj({
        'observation':string(550),
        'supports':{'type':'array','minItems':1,'maxItems':3,'items':anchor},
        'interpretation':{'type':'string','maxLength':400},
        'bridge':{'type':'string','maxLength':400},
    })
    return obj({'claims':{'type':'array','minItems':1,'maxItems':3,'items':claim},
                'alternative':string(400), 'limitation':string(400)})


def pixel_color_guard(image, mask):
    """Broad, overlapping HSV categories on RGB pixels; never a color-name oracle."""
    rgb = np.asarray(image.convert('RGB'), dtype=float)/255
    mask = np.asarray(mask)
    if mask.dtype != bool or mask.shape != rgb.shape[:2]:
        raise ValueError('Mask must be Boolean and match the image dimensions')
    rgb = rgb[mask]
    if len(rgb) < 16:
        return {'status':'unavailable','pixels':len(rgb),'fractions':{}}
    maximum=rgb.max(1); minimum=rgb.min(1); delta=maximum-minimum
    saturation=np.divide(delta, maximum, out=np.zeros_like(delta), where=maximum>0)
    hue=np.zeros_like(delta); colored=delta>0
    r,g,b=rgb.T
    red=colored & (maximum==r); green=colored & ~red & (maximum==g); blue=colored & ~red & ~green
    hue[red]=((g[red]-b[red])/delta[red])%6
    hue[green]=(b[green]-r[green])/delta[green]+2
    hue[blue]=(r[blue]-g[blue])/delta[blue]+4
    hue*=60
    # Darkness and chromatic hue can coexist. Do not classify dark green as
    # non-green solely because it also falls inside the broad 'dark' bin.
    saturated=(saturation>=.25)&(maximum>=.10)
    categories={
        'pale_neutral':(saturation<=.25)&(maximum>=.65),
        'dark':maximum<=.35,
        'yellow':saturated&(hue>=40)&(hue<=75),
        'blue':saturated&(hue>=175)&(hue<=260),
        'green':saturated&(hue>=75)&(hue<=175),
        'red':saturated&((hue<=25)|(hue>=335)),
    }
    return {'status':'measured_proxy','pixels':len(rgb),
            'fractions':{k:float(v.mean()) for k,v in categories.items()},
            'scope':'Broad reproduction RGB categories on an unverified mask; no semantic object, pigment or aesthetic determination.'}


def audit(payload, evidence, regions, guards=None):
    """Separate contract failures, diagnostic concerns and unresolved semantics.

    Guards may use held-back mask pixels solely for post-generation diagnostics.
    No edits, retry, substitution or publication occurs here.
    """
    errors=list(Draft202012Validator(schema(evidence,regions)).iter_errors(payload))
    if errors:
        return {'version':VERSION,'schema_valid':False,'contract_valid':False,'status':'invalid_contract',
                'schema_errors':[{'path':list(e.absolute_path),'message':e.message} for e in errors],
                'claims':[], 'semantic_approval':False}
    by_id={e['id']:e for e in evidence}; guards=guards or {}; results=[]
    for ci,claim in enumerate(payload['claims']):
        failures=[];concerns=[]; anchor_checks=[]
        for ai,anchor in enumerate(claim['supports']):
            rid=anchor['region_id']; phrase=anchor['phrase']; codes=[];warnings=[]
            if phrase not in claim['observation']:codes.append('phrase_not_in_observation')
            for eid in anchor['evidence_ids']:
                if eid=='IMAGE':continue
                record=by_id[eid]
                if rid not in record['region_ids']:codes.append('evidence_region_mismatch')
                if eid.split(':')[-1] not in PROPERTY_SOURCES[anchor['property']]:
                    codes.append('evidence_property_mismatch')
            if rid=='whole_image':warnings.append('whole_image_location_not_region_verified')
            color=anchor['dominant_color']; axis=anchor['shape_axis']
            # Lexical checks are review signals, not a language-understanding proof.
            visible_color_words=[k for k,pattern in COLOR_WORDS.items() if re.search(pattern,phrase,re.I)]
            if len(visible_color_words)>1:warnings.append('multiple_color_terms_require_scope_review')
            if len(phrase.split())>18:warnings.append('long_support_phrase_requires_atomicity_review')
            if color=='not_claimed' and visible_color_words:warnings.append('color_words_without_typed_color')
            if color in COLOR_WORDS and not re.search(COLOR_WORDS[color],phrase,re.I):
                warnings.append('typed_color_not_explicit_in_phrase')
            guard=guards.get(rid,{}); fraction=None
            if color in COLOR_WORDS:
                if 'IMAGE' not in anchor['evidence_ids'] and not any(e.split(':')[-1] in {'color','relation'} for e in anchor['evidence_ids']):
                    codes.append('typed_color_without_color_source')
                if re.search(r'\b(?:not|no|without|less|unlike)\b',phrase,re.I):
                    warnings.append('color_scope_requires_language_review')
                elif guard.get('status')=='measured_proxy':
                    fraction=guard['fractions'].get(color)
                    if fraction is None:warnings.append('color_guard_unavailable')
                    elif fraction<.15:warnings.append('dominant_color_location_mismatch')
                    elif fraction<.60:warnings.append('dominant_color_support_uncertain')
                else:warnings.append('color_guard_unavailable')
            if axis!='not_claimed':
                if 'IMAGE' not in anchor['evidence_ids'] and rid+':shape' not in anchor['evidence_ids']:
                    codes.append('typed_axis_without_shape_source')
                shape=by_id.get(rid+':shape',{}).get('facts',{})
                angle=shape.get('principal_axis_degrees_clockwise_from_right'); elong=shape.get('principal_axis_elongation')
                if angle is None or elong is None or elong<1.5:warnings.append('shape_axis_not_verified')
                else:
                    expected='vertical' if 65<=angle<=115 else ('horizontal' if angle<=25 or angle>=155 else 'diagonal')
                    if axis!=expected:warnings.append('shape_axis_mismatch')
            if anchor['property']=='pattern':
                warnings.append('pattern_descriptor_does_not_establish_stroke_or_gaze')
            failures.extend(codes);concerns.extend(warnings)
            anchor_checks.append({'anchor_index':ai,'region_id':rid,'failures':sorted(set(codes)),
                                  'concerns':sorted(set(warnings)),'claimed_color_pixel_fraction':fraction})
        if claim['interpretation'] and not claim['bridge'].strip():failures.append('interpretation_without_bridge')
        if re.search(EFFECT_WORDS,claim['observation'],re.I):concerns.append('possible_inference_in_observation')
        combined=claim['observation']+' '+claim['interpretation']
        if re.search(r'\bR\d+(?::[a-z]+)?\b',combined):concerns.append('internal_ids_in_reading')
        if re.search(r'\b(?:canvas|pigment|binder|linseed|painted by|artist intended)\b',combined,re.I):
            concerns.append('material_or_intent_language_requires_external_evidence')
        # Deliberately do not equate zero concerns with a supported claim.
        results.append({'claim_index':ci,'failures':sorted(set(failures)),'concerns':sorted(set(concerns)),
            'anchors':anchor_checks,'image_only':all(e=='IMAGE' for a in claim['supports'] for e in a['evidence_ids']),
            'status':'binding_failure' if failures else ('diagnostic_review_needed' if concerns else 'semantic_review_needed')})
    words=len(re.findall(r"\b[\w’'-]+\b",' '.join(c['observation']+' '+c['interpretation'] for c in payload['claims'])))
    return {'version':VERSION,'schema_valid':True,
            'contract_valid':not any(c['failures'] for c in results) and words<=120,
            'schema_errors':[], 'claims':results,
            'statement_word_count':words,'within_word_cap':words<=120,
            'binding_failures':sum(bool(c['failures']) for c in results),
            'status':'review_required','semantic_approval':False,
            'limits':['Phrase coverage is partial; a valid phrase does not prove that every asserted feature has a correct premise.',
                      'Color and axis guards are scoped diagnostics, not semantic verification.',
                      'IMAGE supports direct inspection but bypasses numerical-descriptor dependence.',
                      'Alternative readings and inference bridges still require semantic review.']}
