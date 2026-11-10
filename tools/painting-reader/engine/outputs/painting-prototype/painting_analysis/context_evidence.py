"""Frozen passage retrieval and explicit, curator-authored support edges.

Retrieval relevance is not semantic entailment. This module verifies declared
support, identity, attribution and evidence availability; it cannot validate the
truth of arbitrary prose or discover undocumented material facts.
"""
from collections import Counter
import hashlib
import json
import math
from pathlib import Path
import re
import unicodedata

LENSES = {
    'formal': 'How is the work organized? Compare a source account with image observations.',
    'material': 'What is documented about the physical object, support and paint?',
    'historical': 'What artistic and cultural context is documented, at what scope?',
    'institutional': 'How did collecting and circulation shape the work’s public life?',
    'experiential': 'Whose experience or theory of experience is being described?',
    'intention': 'What did an artist reportedly say? This does not determine every interpretation.',
}
FACETS = {
    'medium': ['medium', 'material', 'materials', 'support', 'canvas', 'oil'],
    'pigments': ['pigment', 'pigments', 'chemical', 'chemistry'],
    'layers': ['layer', 'layers', 'stratigraphy', 'glaze', 'glazing', 'impasto'],
    'viewpoint': ['viewpoint', 'angle', 'shallow', 'perspective', 'flattening'],
    'acquisition': ['acquisition', 'acquired', 'collection', 'collecting'],
    'japanese_prints': ['japanese', 'prints', 'japan', 'influence'],
    'music': ['music', 'musical', 'abstraction'],
    'cross': ['cross', 'shape'],
    'corners': ['corners', 'centre', 'center', 'heavier', 'lighter'],
    'title': ['title', 'designation', 'cannons'],
    'experience': ['experience', 'spectator', 'viewer', 'feels', 'feeling'],
    'war': ['war', 'intention', 'intend', 'intended'],
    'conservation_treatment': ['conservation', 'conservator', 'treatment', 'treatments', 'varnish', 'removal', 'restoration'],
    'figure_identity': ['adult', 'mother', 'nurse', 'identity'],
    'iconography': ['iconography', 'religious', 'christ', 'secular'],
    'treatment_date': ['date', 'dated', 'when'],
    'reproduction_state': ['reproduction', 'photograph', 'capture', 'before', 'after'],
    'conservation_chemistry': ['solvent', 'solvents', 'resin', 'resins'],
    'audiovisual_details': ['video', 'footage', 'transcript', 'timestamp'],
}
STOP = set('a an the of to in and is it its this that what how was were does did with on for by'.split())


def encoded(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2, allow_nan=False).encode()


def sha(value):
    return hashlib.sha256(value).hexdigest()


def tokens(text):
    return [w for w in re.findall(r'[^\W_]+', unicodedata.normalize('NFKC', text).lower()) if w not in STOP]


def eligible(passage, work):
    source = passage['source']
    return (passage['scope'] == 'work' and work['work_id'] in source['work_ids']) or (
        passage['scope'] == 'artist' and work['artist_id'] in source['artist_ids'])


def validate(corpus):
    sources = corpus['sources']; passages = corpus['passages']; claims = corpus['claims']
    for rows in [sources, passages, claims, corpus['works']]:
        key = 'work_id' if rows is corpus['works'] else 'id'
        if len({r[key] for r in rows}) != len(rows):
            raise ValueError('Duplicate evidence identity')
    sm = {s['id']: s for s in sources}; pm = {p['id']: p for p in passages}
    for p in passages:
        if p['source_id'] not in sm or p['source'] != sm[p['source_id']]:
            raise ValueError('Passage source binding differs')
        if p['quote_sha256'] != sha(p['quote'].encode()):
            raise ValueError('Passage text changed')
        if p['lens'] not in LENSES or p['scope'] not in {'work', 'artist'}:
            raise ValueError('Invalid passage scope')
        facets = p.get('supported_facets')
        if facets is not None and (not isinstance(facets, list) or not facets or
                                   any(f not in FACETS for f in facets)):
            raise ValueError('Invalid declared passage facets')
        if corpus['version'] == 'context-evidence-0.2' and facets is None:
            raise ValueError('New corpus passages require explicit facet limits')
    for c in claims:
        if c['lens'] not in LENSES or c['facet'] not in FACETS:
            raise ValueError('Invalid claim lens or facet')
        for edge in c['evidence']:
            if edge['passage_id'] not in pm or edge['relation'] not in {'supports', 'contradicts'}:
                raise ValueError('Invalid curated support edge')
            if edge['quote_sha256'] != pm[edge['passage_id']]['quote_sha256']:
                raise ValueError('Support edge text changed')
    return corpus


def support(corpus, claim, work, available=None):
    """Validate manually curated edges, never infer entailment from similarity."""
    pm = {p['id']: p for p in corpus['passages']}
    positive, negative, rejected = [], [], []
    if claim['work_id'] != work['work_id']:
        return {'status': 'wrong_work', 'supports': [], 'contradicts': [], 'rejected': []}
    for edge in claim['evidence']:
        pid = edge['passage_id']; p = pm.get(pid); reason = None
        if p is None or (available is not None and pid not in available): reason = 'missing_passage'
        elif p['quote_sha256'] != sha(p['quote'].encode()) or edge['quote_sha256'] != p['quote_sha256']: reason = 'changed_passage'
        elif not eligible(p, work): reason = 'wrong_work_or_artist'
        elif p['scope'] != claim['scope']: reason = 'scope_mismatch'
        elif p['source']['kind'] not in claim['allowed_source_kinds']: reason = 'wrong_evidence_kind'
        elif p['source']['kind'] == 'published_artist_letter' and claim['attribution'] != 'published_artist_account': reason = 'artist_account_requires_attribution'
        elif p['source'].get('required_attribution') and claim['attribution'] != p['source']['required_attribution']: reason = 'source_access_requires_attribution'
        elif p.get('supported_facets') is not None and claim['facet'] not in p['supported_facets']: reason = 'unsupported_evidence_facet'
        if reason:
            rejected.append({'passage_id': pid, 'reason': reason}); continue
        (positive if edge['relation'] == 'supports' else negative).append(pid)
    status = 'conflicting' if positive and negative else 'contradicted' if negative else 'supported_as_attributed' if positive else 'unsupported'
    return {'status': status, 'supports': positive, 'contradicts': negative, 'rejected': rejected,
            'independent_lineages': sorted({pm[p]['source']['lineage_id'] for p in positive}),
            'semantic_approval': False, 'support_origin': 'Explicit assistant-authored passage-to-claim mapping; not automatic entailment'}


def plan(query):
    words = set(tokens(query))
    facets = [f for f, terms in FACETS.items() if words.intersection(terms)]
    # Date and before/after words alone do not necessarily concern conservation.
    # These are declared lexical rules, not general natural-language understanding.
    if 'conservation_treatment' not in facets:
        facets = [f for f in facets if f not in {'treatment_date', 'reproduction_state'}]
    if 'conservation_treatment' in facets and words.intersection({'chemical', 'chemistry'}):
        if 'conservation_chemistry' not in facets: facets.append('conservation_chemistry')
    return facets


def search(corpus, work_id, query='', lens='', mode='planned', limit=3):
    if not isinstance(query, str) or len(query) > 500: raise ValueError('Use a question of at most 500 characters')
    if lens and lens not in LENSES: raise ValueError('Unknown interpretive lens')
    if mode not in {'plain', 'planned'} or type(limit) is not int or not 1 <= limit <= 12: raise ValueError('Invalid retrieval settings')
    work = next((w for w in corpus['works'] if w['work_id'] == work_id), None)
    if work is None: raise ValueError('Unknown painting')
    facets = plan(query)
    allp = corpus['passages']
    documents = [Counter(tokens(p['quote']+' '+p['locator']+' '+p['source']['title'])) for p in allp]
    average = sum(sum(d.values()) for d in documents) / max(1, len(documents))
    qwords = set(tokens(query))
    if mode == 'planned': qwords.update(word for f in facets for word in FACETS[f])
    scores, excluded = [], []
    for p, d in zip(allp, documents):
        if mode == 'planned' and (not eligible(p, work) or (lens and p['lens'] != lens)):
            excluded.append({'passage_id': p['id'], 'reason': 'wrong_scope' if not eligible(p, work) else 'different_lens'}); continue
        score = 0.
        for word in qwords:
            df = sum(word in doc for doc in documents); tf = d[word]
            if tf:
                idf = math.log(1+(len(documents)-df+.5)/(df+.5))
                score += idf*tf*2.2/(tf+1.2*(.25+.75*sum(d.values())/average))
        if query.strip() and score <= 0: continue
        scores.append((score, p))
    scores.sort(key=lambda row: (-row[0], row[1]['id']))
    found = scores[:limit]; ids = {p['id'] for _, p in found}
    rows = []
    for c in corpus['claims']:
        if c['work_id'] != work_id or (lens and c['lens'] != lens): continue
        if query.strip() and (not facets or c['facet'] not in facets): continue
        check = support(corpus, c, work, ids)
        if check['supports'] or check['contradicts']:
            rows.append({**c, 'support_check': check})
    # Pigment/layer questions need those exact support families; catalog medium is insufficient.
    unresolved = [f for f in facets if not any(c['facet'] == f and c['support_check']['status'] == 'supported_as_attributed' for c in rows)]
    return {'work_id': work_id, 'source_sha256': work['source_sha256'], 'query': query, 'lens': lens,
            'mode': mode, 'limit': limit, 'planned_facets': facets, 'unresolved_facets': unresolved,
            'passages': [{**p, 'retrieval_score': round(score, 8), 'scope_matches': eligible(p, work)} for score, p in found],
            'claims': rows, 'excluded': excluded,
            'status': 'supported_attributed_claims' if rows and not unresolved else 'incomplete_support' if rows else 'no_supported_answer',
            'notice': 'Relevance is not entailment. Only explicit curated claims are shown. Artist accounts describe an attributed position; they do not establish viewer responses or measured geometry.',
            'search_limits': corpus['search_limits']}


def load_bound(root, work, expected=None):
    """Load content-addressed corpus and bind the reproduction before exposing claims."""
    root = Path(root)
    key = expected or json.loads((root/'context/catalog.json').read_text())['corpus_sha256']
    if not isinstance(key, str) or not re.fullmatch('[a-f0-9]{64}', key): raise ValueError('Invalid corpus reference')
    raw = (root/'context'/key/'corpus.json').read_bytes()
    if sha(raw) != key: raise ValueError('Context corpus changed')
    corpus = validate(json.loads(raw))
    w = next((w for w in corpus['works'] if w['work_id'] == work['work_id']), None)
    if not w or w['source_sha256'] != work['source_sha256'] or w['image_sha256'] != work['files'][work['image_url']]:
        raise ValueError('Context belongs to another reproduction')
    return corpus, key
