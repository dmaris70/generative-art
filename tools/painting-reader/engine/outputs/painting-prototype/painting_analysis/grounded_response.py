"""Attributed viewer responses; immutable revisions, no automatic semantic approval."""
from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import re
import threading
import uuid

LOCK = threading.Lock()


class Conflict(ValueError):
    pass


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load(path):
    return json.loads(Path(path).read_text())


def text(value, limit, required=False):
    if not isinstance(value, str) or len(value) > limit or (required and not value.strip()):
        raise ValueError(f'Text must contain {"1 to " if required else "at most "}{limit} characters')
    return value  # Keep wording, whitespace and Unicode exactly as submitted.


def validate(payload, work):
    if not isinstance(payload, dict):
        raise ValueError('A response object is required')
    if payload.get('source_sha256') != work['source_sha256']:
        raise Conflict('The image or evidence changed. Reload before saving.')
    if payload.get('actor') not in {'local_viewer', 'automated_test'}:
        raise ValueError('Response attribution is required')
    if payload.get('kind') not in {'personal_response', 'visual_observation', 'interpretation'}:
        raise ValueError('Choose a response type')
    targets = payload.get('targets')
    if not isinstance(targets, list) or not 1 <= len(targets) <= 4:
        raise ValueError('Choose the whole painting or up to four places')
    for target in targets:
        if not isinstance(target, dict):
            raise ValueError('Invalid target')
        kind = target.get('type')
        if kind == 'whole':
            if len(targets) != 1 or set(target) != {'type'}:
                raise ValueError('Whole painting cannot be combined with local targets')
        elif kind == 'point':
            if set(target) != {'type', 'x', 'y'} or any(type(target.get(k)) not in (float, int) or not math.isfinite(target[k]) or not 0 <= target[k] <= 1 for k in ('x', 'y')):
                raise ValueError('Points must be finite coordinates within the image')
        elif kind == 'proposal':
            if set(target) != {'type', 'id'} or target.get('id') not in {r['id'] for r in work['regions']}:
                raise ValueError('Unknown region proposal')
        elif kind == 'proposal_variant':
            if set(target) != {'type','catalog_sha256','id'} or not isinstance(target.get('catalog_sha256'),str) or not re.fullmatch(r'[a-f0-9]{64}',target['catalog_sha256']) or not isinstance(target.get('id'),str) or not re.fullmatch(r'[A-Za-z0-9_-]+/[A-Za-z0-9_-]+/[A-Za-z0-9_-]+',target['id']):
                raise ValueError('Invalid method-specific proposal reference')
        elif kind == 'composition_group':
            if set(target)!={'type','analysis_sha256','id'} or not isinstance(target.get('analysis_sha256'),str) or not re.fullmatch(r'[a-f0-9]{64}',target['analysis_sha256']) or not isinstance(target.get('id'),str) or not re.fullmatch(r'G[a-f0-9]{20}',target['id']):raise ValueError('Invalid proposed-group reference')
        else:
            raise ValueError('Unknown target type')
    if len({json.dumps(t, sort_keys=True) for t in targets}) != len(targets):
        raise ValueError('Duplicate targets')
    candidate = payload.get('candidate_id')
    if candidate is not None and candidate not in {c['id'] for c in work['candidates']}:
        raise ValueError('Unknown engine hypothesis')
    stance = payload.get('stance')
    if (candidate is None and stance is not None) or (candidate is not None and stance not in {'fits', 'different_reading', 'unsure'}):
        raise ValueError('Choose how the hypothesis relates to your reading')
    return {'actor': payload['actor'], 'kind': payload['kind'], 'targets': targets,
            'response': text(payload.get('response'), 2000, True),
            'reason': text(payload.get('reason', ''), 2000),
            'alternative': text(payload.get('alternative', ''), 2000),
            'candidate_id': candidate, 'stance': stance}


class ResponseStore:
    def __init__(self, root):
        self.root = Path(root).resolve()

    def catalog(self):
        return load(self.root / 'catalog.json')

    def work(self, wid):
        if not isinstance(wid, str) or not re.fullmatch(r'(?:aic|met)-[0-9]+', wid):
            raise ValueError('Invalid painting')
        work = next((w for w in self.catalog()['works'] if w['work_id'] == wid), None)
        if work is None:
            raise ValueError('Unknown painting')
        for name, expected in work['files'].items():
            path = (self.root / name).resolve()
            if not path.is_relative_to(self.root) or digest(path) != expected:
                raise Conflict('Source material changed. Responses cannot be rebound silently.')
        return work

    def history(self, wid):
        work = self.work(wid)
        records = [load(p) for p in sorted((self.root / 'responses' / wid).glob('*.json'))]
        head = None
        for i, r in enumerate(records, 1):
            if r['sequence'] != i or r['previous_id'] != head or r['source_sha256'] != work['source_sha256']:
                raise Conflict('Response history is incomplete or belongs to another source')
            head = r['id']
            if any(t['type'] in ('proposal_variant','composition_group') for t in r['targets']) and 'view_context' not in r:
                raise Conflict('Method-specific targets require their recorded view')
            if 'view_context' in r and r['view_context'] != self.bind_view(wid, r['view_context'], work, r['targets']):
                raise Conflict('Saved view context no longer matches its immutable source')
        replaced = {r['supersedes'] for r in records if r['supersedes']}
        return {'head': head, 'records': records, 'active': [r for r in records if r['id'] not in replaced]}

    def bind_view(self, wid, payload, work, targets):
        from .view_context import bind_context
        key = payload.get('graph_sha256') if isinstance(payload, dict) else None
        if not isinstance(key, str) or not re.fullmatch(r'[a-f0-9]{64}', key):
            raise ValueError('Invalid view evidence reference')
        path = self.root / 'multiscale' / wid / key / 'graph.json'
        if not path.is_file() or digest(path) != key:
            raise Conflict('The recorded view evidence is missing or changed')
        from .linked_focus import resolve_graph
        graph = resolve_graph(self.root, wid, key)
        if graph['work_id'] != wid or graph['source_sha256'] != work['source_sha256'] or graph['bindings'] != work['files']:
            raise Conflict('View evidence belongs to another painting or source version')
        context = bind_context(payload, graph, key, targets)
        if 'source_context' in payload:
            context['source_context'] = self.bind_source_context(payload['source_context'], work)
        if 'contour_context' in payload:
            context['contour_context'] = self.bind_contour_context(payload['contour_context'], work, graph, context['view_id'])
        if 'linked_context' in payload:
            linked = payload['linked_context']
            if not isinstance(linked, dict) or linked.get('graph_sha256') != key or not graph.get('focus_extension'):
                raise ValueError('A linked account must refer to this focus graph')
            account = next((a for a in graph['focus_extension']['joint_accounts'] if a['id'] == linked.get('account_id')), None)
            if account is None:
                raise ValueError('Unknown linked account')
            contour = context.get('contour_context')
            reference = graph['focus_extension']['contour_reference']
            if not contour or any(contour.get(k) != reference[k] for k in ['analysis_sha256','condition_id','candidate_id']):
                raise ValueError('A linked account requires its own recorded contour reference')
            context['linked_context'] = {'graph_sha256':key,'account_id':account['id'],'status':account['status'],
                'measured_account':account['measured_account'],'possible_interpretation':account['possible_interpretation'],
                'group_id':account['group_id'],'reading_id':account['reading_id'],'semantic_approval':False,
                'scope':'Selected conditional account; documentary evidence remains separately attributed.'}
        if 'composition_context' in payload:
            context['composition_context']=self.bind_composition(wid,payload['composition_context'],work,graph)
        for target in targets:
            if target['type']=='composition_group':
                c=context.get('composition_context')
                if not c or c['analysis_sha256']!=target['analysis_sha256'] or c['group_id']!=target['id']:raise ValueError('Group target must match the recorded composition context')
                v=next(v for v in graph['views'] if v['id']==context['view_id'])
                if any(not v.get('proposal_visibility',{}).get(pid,0) for pid in c['members']):raise ValueError('A group member is absent from the attached view')
        for target in targets:
            if target['type']=='proposal_variant':
                self.bind_proposals(wid,{'catalog_sha256':target['catalog_sha256'],'proposal_ids':[target['id']],'display_mode':'outline'},work)
        if 'proposal_overlay' in payload:
            overlay=self.bind_proposals(wid,payload['proposal_overlay'],work)
            if overlay['catalog_sha256'] != graph.get('proposal_catalog',{}).get('catalog_sha256'):
                raise ValueError('Proposal overlay and view must use the same catalog')
            context['proposal_overlay']=overlay
        if 'structure_overlay' in payload:
            context['structure_overlay'] = self.bind_structure(wid, payload['structure_overlay'], work)
        return context

    def bind_contour_context(self, payload, work, graph, view_id):
        if not isinstance(payload, dict):
            raise ValueError('Invalid contour relationship context')
        key = payload.get('analysis_sha256')
        if not isinstance(key, str) or not re.fullmatch('[a-f0-9]{64}', key):
            raise ValueError('Invalid contour relationship reference')
        path = self.root/'contour-relations'/work['work_id']/key/'analysis.json'
        if not path.is_file() or digest(path) != key:
            raise Conflict('Contour relationship evidence is missing or changed')
        a = load(path); b = a['binding']
        if b['work_id'] != work['work_id'] or b['source_sha256'] != work['source_sha256'] or b['files'] != work['files'] or b['image_sha256'] != work['files'][work['image_url']]:
            raise Conflict('Contour relationship belongs to another reproduction')
        condition = next((c for c in a['conditions'] if c['id'] == payload.get('condition_id')), None)
        if condition is None or type(payload.get('overlay_visible')) is not bool:
            raise ValueError('Unknown condition or missing overlay state')
        candidate = next((r for r in condition['candidates'] if r['id'] == payload.get('candidate_id')), None)
        if candidate is None:
            audit = a['rejected_audits'][condition['id']]; ap = (path.parent/audit['file']).resolve()
            if not ap.is_relative_to(path.parent) or not ap.is_file() or digest(ap) != audit['sha256']:
                raise Conflict('Rejected contour evidence is missing or changed')
            candidate = next((r for r in load(ap)['candidates'] if r['id'] == payload.get('candidate_id')), None)
        if candidate is None:
            raise ValueError('Unknown contour relationship')
        chains = {c['id']:c for c in condition['chains']}
        if not set(candidate['chain_ids']) <= set(chains):
            raise Conflict('Relationship refers to unavailable chains')
        crop = next(v['crop_xyxy'] for v in graph['views'] if v['id'] == view_id)
        transform = condition['source_from_condition']; coverage = {}
        for cid in candidate['chain_ids']:
            points = [[p[i]*transform['scale'][i]+transform['offset'][i] for i in (0,1)] for p in chains[cid]['points']]
            coverage[cid] = sum(crop[0]-.5 <= x < crop[2]-.5 and crop[1]-.5 <= y < crop[3]-.5 for x,y in points)/len(points)
        return {'analysis_sha256':key,'condition_id':condition['id'],'candidate_id':candidate['id'],
                'family':candidate['family'],'chain_ids':candidate['chain_ids'],'candidate_status':candidate['status'],
                'overlay_visible':payload['overlay_visible'],'visible_sample_fractions':coverage,'semantic_approval':False,
                'scope':'Source-wide contour hypothesis; visible fractions describe this crop. No artistic importance, border ownership or physical depth is established.'}

    def bind_source_context(self, payload, work):
        from .context_evidence import load_bound, support
        if not isinstance(payload, dict) or not isinstance(payload.get('claim_id'), str):
            raise ValueError('Invalid source account reference')
        key = payload.get('corpus_sha256')
        if not isinstance(key, str) or not re.fullmatch('[a-f0-9]{64}', key):
            raise ValueError('A frozen context corpus is required')
        try:
            corpus, key = load_bound(self.root, work, key)
        except (ValueError, OSError) as exc:
            raise Conflict('Source account evidence is missing, changed or belongs to another reproduction') from exc
        claim = next((c for c in corpus['claims'] if c['id'] == payload['claim_id']), None)
        if claim is None or claim['work_id'] != work['work_id']:
            raise ValueError('Unknown source account for this painting')
        bound_work = next(w for w in corpus['works'] if w['work_id'] == work['work_id'])
        check = support(corpus, claim, bound_work)
        return {'corpus_sha256': key, 'claim_id': claim['id'], 'text': claim['text'],
                'attribution': claim['attribution'], 'scope': claim['scope'], 'support_status': check['status'],
                'passage_ids': check['supports'] + check['contradicts'], 'semantic_approval': False,
                'notice': 'Selected documentary account. Attaching a response does not validate the source or apply its claim to the selected crop.'}

    def bind_composition(self,wid,payload,work,graph):
        if not isinstance(payload,dict):raise ValueError('Invalid composition context')
        key=payload.get('analysis_sha256')
        if not isinstance(key,str) or not re.fullmatch(r'[a-f0-9]{64}',key):raise ValueError('Invalid composition evidence reference')
        path=self.root/'composition-groups'/wid/key/'analysis.json'
        if not path.is_file() or digest(path)!=key:raise Conflict('Composition evidence is missing or changed')
        a=load(path);b=a['binding']
        if b['work_id']!=wid or b['source_sha256']!=work['source_sha256'] or b['files']!=work['files'] or b['image_sha256']!=work['files'][work['image_url']] or key!=graph.get('composition_catalog',{}).get('analysis_sha256') or b['proposal_catalog_sha256']!=graph.get('proposal_catalog',{}).get('catalog_sha256'):raise Conflict('Composition evidence belongs to another source or view version')
        g=next((g for g in a['groups'] if g['id']==payload.get('group_id')),None)
        if g is None:raise ValueError('Unknown candidate group')
        r=next((r for r in g['readings'] if r['id']==payload.get('reading_id')),None)
        if r is None:raise ValueError('Unknown grouping reading')
        if type(payload.get('overlay_visible')) is not bool:raise ValueError('Record whether group masks are displayed')
        self.bind_proposals(wid,{'catalog_sha256':b['proposal_catalog_sha256'],'proposal_ids':g['members'][:1],'display_mode':'filled'},work)
        proposals=load(self.root/'proposals'/wid/b['proposal_catalog_sha256']/'catalog.json')
        if not set(g['members'])<={p['id'] for p in proposals['proposals']}:raise Conflict('Group references unavailable masks')
        return {'analysis_sha256':key,'group_id':g['id'],'reading_id':r['id'],'members':g['members'],'proposal_catalog_sha256':b['proposal_catalog_sha256'],
                'overlay_visible':payload['overlay_visible'],'rule_status':r['status'],'semantic_approval':False,
                'scope':'Selected grouping account and optional masks. Rule eligibility is not independent validation or a reported viewer response.'}

    def bind_proposals(self,wid,payload,work):
        if not isinstance(payload,dict):raise ValueError('Invalid proposal overlay')
        key=payload.get('catalog_sha256')
        if not isinstance(key,str) or not re.fullmatch(r'[a-f0-9]{64}',key):raise ValueError('Invalid proposal catalog reference')
        path=self.root/'proposals'/wid/key/'catalog.json'
        if not path.is_file() or digest(path)!=key:raise Conflict('Proposal evidence is missing or changed')
        catalog=load(path);binding=catalog['binding']
        if binding['work_id']!=wid or binding['source_sha256']!=work['source_sha256'] or binding['files']!=work['files'] or binding['image_sha256']!=work['files'][work['image_url']]:
            raise Conflict('Proposals belong to another reproduction')
        for name,sha in binding['proposal_files'].items():
            p=(self.root/name).resolve()
            if not p.is_relative_to(self.root) or not p.is_file() or digest(p)!=sha:raise Conflict('Proposal source archive is missing or changed')
        ids=payload.get('proposal_ids');mode=payload.get('display_mode')
        if not isinstance(ids,list) or not 1<=len(ids)<=2 or any(not isinstance(v,str) for v in ids) or len(ids)!=len(set(ids)) or not set(ids)<={p['id'] for p in catalog['proposals']}:
            raise ValueError('Unknown or duplicate proposal overlay references')
        if mode not in ('outline','filled'):raise ValueError('Invalid proposal display mode')
        return {'catalog_sha256':key,'proposal_ids':ids,'display_mode':mode,'source_sha256':work['source_sha256'],
                'semantic_approval':False,'scope':'Displayed competing masks; overlap is agreement, not independent boundary accuracy.'}

    def bind_structure(self, wid, payload, work):
        if not isinstance(payload, dict):
            raise ValueError('Invalid structural overlay')
        key = payload.get('analysis_sha256')
        if not isinstance(key, str) or not re.fullmatch(r'[a-f0-9]{64}', key):
            raise ValueError('Invalid structural evidence reference')
        path = self.root / 'structure' / wid / key / 'analysis.json'
        if not path.is_file() or digest(path) != key:
            raise Conflict('Structural evidence is missing or changed')
        analysis = load(path); binding = analysis['binding']
        if binding['work_id'] != wid or binding['source_sha256'] != work['source_sha256'] or binding['files'] != work['files'] or binding['image_sha256'] != work['files'][work['image_url']]:
            raise Conflict('Structural evidence belongs to another reproduction')
        condition = next((c for c in analysis['conditions'] if c['id'] == payload.get('condition_id')), None)
        if condition is None:
            raise ValueError('Unknown structural condition')
        options = {'chain':condition['chains'], 'gap':condition['gap_candidates'],
                   'enclosed':condition['space']['enclosed_edge_fields']['fields'],
                   'unassigned':condition['space']['unassigned_space']['fields']}
        kind = payload.get('kind')
        if not isinstance(kind, str) or kind not in options:
            raise ValueError('Unknown structural layer')
        item = next((item for item in options[kind] if item['id'] == payload.get('id')), None)
        if item is None:
            raise ValueError('Unknown structural feature')
        return {'analysis_sha256':key, 'condition_id':condition['id'], 'kind':kind, 'id':item['id'],
                'source_sha256':work['source_sha256'], 'condition_image_size':condition['image_size'],
                'source_from_condition':condition['source_from_condition'], 'semantic_approval':False,
                'scope':'Displayed detector evidence or geometric proposal, not an approved interpretation.'}

    def save(self, wid, payload):
        with LOCK:
            work = self.work(wid)
            clean = validate(payload, work)
            if any(t['type'] in ('proposal_variant','composition_group') for t in clean['targets']) and 'view_context' not in payload:
                raise ValueError('Method-specific targets require a view context')
            if 'view_context' in payload:
                clean['view_context'] = self.bind_view(wid, payload['view_context'], work, clean['targets'])
            history = self.history(wid)
            if 'expected_head' not in payload or payload['expected_head'] != history['head']:
                raise Conflict('Another response was saved. Reload the history before saving.')
            supersedes = payload.get('supersedes')
            if supersedes is not None and supersedes not in {r['id'] for r in history['active']}:
                raise Conflict('That response has already been revised or does not exist')
            sequence = len(history['records']) + 1
            record = {'version': 'grounded-response-0.2' if 'view_context' in clean else 'grounded-response-0.1', 'id': uuid.uuid4().hex,
                      'work_id': wid, 'source_sha256': work['source_sha256'],
                      'sequence': sequence, 'previous_id': history['head'], 'supersedes': supersedes,
                      'created_at': datetime.now(timezone.utc).isoformat(), **clean,
                      'independent_validation': False, 'semantic_approval': False,
                      'artist_intention_established': False, 'model_judgments_changed': False,
                      'scope': 'Client-declared viewer response. Point targets are locations, not boundaries. Proposal targets retain their original uncertainty. A response does not validate an engine hypothesis.'}
            folder = self.root / 'responses' / wid
            folder.mkdir(parents=True, exist_ok=True)
            destination = folder / f'{sequence:06}.json'
            temporary = folder / ('.pending-' + record['id'])
            temporary.write_text(json.dumps(record, ensure_ascii=False, allow_nan=False, indent=2))
            try:
                os.link(temporary, destination)
            except FileExistsError as exc:
                raise Conflict('Concurrent save; reload history before retrying') from exc
            finally:
                temporary.unlink(missing_ok=True)
            return record
