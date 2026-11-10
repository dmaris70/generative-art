"""Three-valued checks of explicit typed premises, not artistic interpretation."""
import math

LABELS=('supported','contradicted','undetermined')
UNKNOWN_COLORS={'mixed_or_uncertain','unknown','not_claimed'}


def evaluate(facts, claim):
    """Return a verdict and sufficient explicit source IDs; missing is not false.

    Positions use x increasing right and y increasing downward, normalized to
    the image. 'Central' means x in [1/3, 2/3]. Only source-record relationships
    are evaluated; identity/material/meaning require explicit matching records.
    """
    lookup={};ids=set()
    for f in facts:
        key=(f['subject'],f['attribute'])
        if key in lookup or f['id'] in ids:raise ValueError('Duplicate or ambiguous fact')
        if f['value'] is None:raise ValueError('Omit unavailable facts rather than storing null')
        if f['attribute'] in {'x','y','lightness'}:
            value=f['value']
            if isinstance(value,bool) or not isinstance(value,(int,float)) or not math.isfinite(value):raise ValueError('Non-finite/non-numeric measure')
            if f['attribute'] in {'x','y'} and not 0<=value<=1:raise ValueError('Invalid normalized position')
        lookup[key]=f;ids.add(f['id'])
    def get(subject,attribute):return lookup.get((subject,attribute))
    def result(value,proof=()):return {'verdict':'undetermined' if value is None else ('supported' if value else 'contradicted'),'sufficient_evidence_ids':list(proof)}
    op=claim['op'];a=claim.get('a');b=claim.get('b')
    if op in {'above','left_of','lighter_than','same_color'}:
        attribute={'above':'y','left_of':'x','lighter_than':'lightness','same_color':'color'}[op]
        x,y=get(a,attribute),get(b,attribute)
        if x is None or y is None:return result(None)
        if op=='same_color' and (x['value'] in UNKNOWN_COLORS or y['value'] in UNKNOWN_COLORS):return result(None)
        value=x['value']==y['value'] if op=='same_color' else (x['value']>y['value'] if op=='lighter_than' else x['value']<y['value'])
        return result(value,[x['id'],y['id']])
    if op=='both_central':
        records=[get(s,'x') for s in (a,b)]
        # One known noncentral region disproves 'both', even with the other missing.
        noncentral=[r for r in records if r is not None and not 1/3<=r['value']<=2/3]
        if noncentral:return result(False,[noncentral[0]['id']])
        if any(r is None for r in records):return result(None)
        return result(True,[r['id'] for r in records])
    if op=='equals':
        f=get(a,claim['attribute'])
        if f is None:return result(None)
        if claim['attribute']=='color' and f['value'] in UNKNOWN_COLORS:return result(None)
        return result(f['value']==claim['value'],[f['id']])
    raise ValueError('Unsupported predicate: '+str(op))
