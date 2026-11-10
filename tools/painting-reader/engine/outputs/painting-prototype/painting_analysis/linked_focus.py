"""Compact immutable focus graphs linking contours, region proposals and groups.

A focus graph references an unchanged base graph. Proximity to a mask boundary
is an association, not ownership. Documentary accounts retain separate scope.
"""
import itertools
import json
import math
import re
from pathlib import Path
import numpy as np
from PIL import Image
from scipy.ndimage import binary_erosion, distance_transform_edt, generate_binary_structure
from .multiscale import pair_measurement
from .view_context import validate_crop
from .context_evidence import encoded,sha

VERSION='linked-focus-graph-0.1'
PROTOCOL={'minimum_span_shortside':.16,'padding_fraction':.15,'boundary_tolerance_source_pixels':1.5,
          'minimum_unique_samples_per_chain':8,'minimum_near_boundary_fraction':.5,
          'boundary_definition':'Inside-mask boundary under four-neighbor erosion; source-frame border is included.',
          'sampling':'Detected chain samples mapped by pixel-center affine transform and rounded to nearest source center (ties to even); duplicates removed per chain. Hypothetical gap connectors are excluded.',
          'scope':'Source-pixel proximity and manually specified explanatory bridges; no object ownership or independently validated perceptual grouping.'}


def verified(root,relative,key):
    from .grounded_response import Conflict
    if not isinstance(key,str) or not re.fullmatch('[a-f0-9]{64}',key):raise ValueError('Invalid evidence fingerprint')
    root=Path(root).resolve();p=(root/relative).resolve()
    if not p.is_relative_to(root) or not p.is_file() or sha(p.read_bytes())!=key:raise Conflict('Linked evidence is missing or changed')
    return json.loads(p.read_text())


def resolve_graph(root,wid,key):
    """Resolve one compact extension; reject nesting and changed dependencies."""
    from .grounded_response import Conflict
    graph=verified(root,f'multiscale/{wid}/{key}/graph.json',key)
    if graph.get('version')!=VERSION:return graph
    basekey=graph['base_graph_sha256'];base=verified(root,f'multiscale/{wid}/{basekey}/graph.json',basekey)
    if base.get('version')==VERSION:raise Conflict('Nested focus extensions are not permitted')
    for name in ['work_id','source_sha256','image_sha256','image_size','bindings']:
        if graph[name]!=base[name]:raise Conflict('Focus graph belongs to another source')
    for name,expected in graph['dependencies'].items():
        path=(Path(root)/name).resolve()
        if not path.is_relative_to(Path(root).resolve()) or not path.is_file() or sha(path.read_bytes())!=expected:
            raise Conflict('A linked focus dependency is missing or changed')
    view=graph['focus_view'];validate_crop(view['crop_xyxy'],graph['image_size'])
    if view['id'] in {v['id'] for v in base['views']} or graph['focus_node']['id'] in {n['id'] for n in base['nodes']}:
        raise Conflict('Focus view would replace an existing identity')
    base['views'].append(view);base['nodes'].append(graph['focus_node']);base['edges'].extend(graph['focus_edges'])
    base['focus_extension']=graph
    return base


def contour_points(condition,candidate,size):
    byid={c['id']:c for c in condition['chains']};m=condition['source_from_condition'];result={}
    for cid in candidate['chain_ids']:
        if cid not in byid:raise ValueError('Contour refers to a missing chain')
        points=np.asarray(byid[cid]['points'],float)*np.asarray(m['scale'])+np.asarray(m['offset'])
        pixels=np.unique(np.rint(points).astype(int),axis=0)
        if np.any(pixels<0) or np.any(pixels[:,0]>=size[0]) or np.any(pixels[:,1]>=size[1]):raise ValueError('Contour sample outside source')
        result[cid]={'source_points':points.tolist(),'sample_pixels':pixels.tolist()}
    return result


def focus_crop(points,condition,candidate,size):
    allpoints=[p for chain in points.values() for p in chain['source_points']]
    if not allpoints and candidate.get('point') is not None:
        m=condition['source_from_condition'];allpoints=[[candidate['point'][i]*m['scale'][i]+m['offset'][i] for i in [0,1]]]
    if not allpoints:raise ValueError('No located contour evidence is available for this focus')
    a=np.asarray(allpoints);lo=a.min(axis=0);hi=a.max(axis=0)
    minimum=max(2,round(min(size)*PROTOCOL['minimum_span_shortside']))
    center=(lo+hi)/2;span=np.maximum(hi-lo+1,minimum)*(1+2*PROTOCOL['padding_fraction'])
    box=[max(0,math.floor(center[0]-span[0]/2)),max(0,math.floor(center[1]-span[1]/2)),
         min(size[0],math.ceil(center[0]+span[0]/2)),min(size[1],math.ceil(center[1]+span[1]/2))]
    return list(validate_crop(box,size))


def associate(points,masks,proposal_records):
    """Retain all method-specific associations; no best mask or ownership winner."""
    rows=[];minn=PROTOCOL['minimum_unique_samples_per_chain'];tol=PROTOCOL['boundary_tolerance_source_pixels'];fraction=PROTOCOL['minimum_near_boundary_fraction']
    for p in proposal_records:
        mask=masks[p['id']]
        if mask.dtype!=bool or mask.ndim!=2:raise ValueError('Boolean proposal masks required')
        boundary=mask&~binary_erosion(mask,structure=generate_binary_structure(2,1),border_value=0)
        distance=distance_transform_edt(~boundary) if boundary.any() else None
        chain_rows={}
        for cid,record in points.items():
            xy=np.asarray(record['sample_pixels'],int);n=len(xy)
            inside=int(mask[xy[:,1],xy[:,0]].sum()) if n else 0
            near=int((distance[xy[:,1],xy[:,0]]<=tol).sum()) if n and distance is not None else 0
            ratio=near/n if n else None
            chain_rows[cid]={'unique_samples':n,'inside_samples':inside,'near_boundary_samples':near,
                             'inside_fraction':inside/n if n else None,'near_boundary_fraction':ratio,
                             'status':'insufficient_samples' if n<minn else 'associated' if ratio>=fraction else 'not_associated'}
        rows.append({'proposal_id':p['id'],'label':p.get('label',p['id']),'method':p['method'],'stage':p['stage'],
                     'chains':chain_rows,'associated_chain_ids':[cid for cid,r in chain_rows.items() if r['status']=='associated'],
                     'semantic_approval':False,'ownership':'unresolved'})
    return rows


def joint_decision(premises):
    """Unknown or removed required support cannot authorize a joint reading."""
    values=[premises.get(k) for k in ['contour','region_link','group']]
    if any(v is not None and type(v) is not bool for v in values):
        raise ValueError('Joint premises must be boolean or unknown')
    return 'withheld' if False in values else 'unavailable' if None in values else 'eligible_hypothesis'


def eligibility(status):
    if status=='eligible_hypothesis':return True
    if status in ['withheld','not_eligible','rejected']:return False
    return None


def joint_accounts(candidate,associations,groups):
    rows=[];am={r['proposal_id']:r for r in associations}
    for group in groups['groups']:
        matched=[pid for pid in group['members'] if am.get(pid,{}).get('associated_chain_ids')]
        if len(matched)<2:continue  # Search scope; records below preserve all group-rule outcomes for these intersections.
        covered={cid for pid in matched for cid in am[pid]['associated_chain_ids']}
        complete=bool(candidate['chain_ids']) and set(candidate['chain_ids'])<=covered
        sufficient=all(any(am[pid]['chains'][cid]['unique_samples']>=PROTOCOL['minimum_unique_samples_per_chain'] for pid in matched) for cid in candidate['chain_ids'])
        for reading in group['readings']:
            premises={'contour':eligibility(candidate['status']),
                      'region_link':None if not sufficient else complete,
                      'group':eligibility(reading['status'])}
            status=joint_decision(premises)
            local={'continuation':'a local contour connection','repetition':'a local recurrence of contour shape','junction':'a local boundary interruption'}[candidate['family']]
            larger={'color_connection':'a group linked by contact and similar mean color','contact_chain':'a chain of contacting regions','tonal_progression':'an aligned light-to-dark sequence'}[reading['id']]
            rows.append({'id':group['id']+'/'+reading['id'],'group_id':group['id'],'reading_id':reading['id'],
                         'group_members':group['members'],'associated_member_ids':matched,'covered_chain_ids':sorted(covered),
                         'premises':premises,'status':status,'semantic_approval':False,
                         'measured_account':f'{len(matched)} proposed regions in this grouping have boundary proximity to one or more supporting contours. '+('Every supporting contour has a qualifying association.' if complete else 'Some supporting contours lack a qualifying association.'),
                         'group_account':reading.get('possible_effect'),
                         'possible_interpretation':f'The combination could relate {local} to {larger}, if these proposed parts are perceived as a group.' if status=='eligible_hypothesis' else None,
                         'bridge_origin':'Assistant-authored conditional interpretation; not a measured perceptual effect.',
                         'alternative':'The contour pattern and regional arrangement may be unrelated, or a competing segmentation may organize the area differently.',
                         'missing':'Independent grouping judgment, global context and comparison with plausible alternative accounts.'})
    return rows


def build_extension(base,basekey,image,baseline,masks,proposals,contour,condition,candidate,groups,dependencies,documentary=None,implementation=None):
    size=list(image.size)
    if image.mode!='RGB' or size!=base['image_size']:raise ValueError('Source image differs from base view')
    for m in [*baseline.values(),*masks.values()]:
        if m.dtype!=bool or m.shape!=(size[1],size[0]):raise ValueError('Mask differs from source dimensions')
    points=contour_points(condition,candidate,size);crop=focus_crop(points,condition,candidate,size)
    associations=associate(points,masks,proposals['proposals']);accounts=joint_accounts(candidate,associations,groups)
    from . import contour_region_roles as roles
    role_rows=roles.measure(points,masks,proposals['proposals'],size)
    role_summary=roles.candidate_roles(candidate,role_rows)
    identity={'base':basekey,'analysis':dependencies['contour_analysis_sha256'],'condition':condition['id'],'candidate':candidate['id'],
              'proposal':dependencies['proposal_catalog_sha256'],'groups':dependencies['composition_analysis_sha256'],'documentary':documentary,
              'protocol':PROTOCOL,'implementation':implementation or {}}
    token=sha(encoded(identity))[:24];vid='focus-'+token;l,t,r,b=crop;anchor=[(l+r-1)//2,(t+b-1)//2]
    im=image.crop(crop);mm={rid:m[t:b,l:r] for rid,m in baseline.items()}
    view={'id':vid,'level':'detail','node_id':vid,'label':'Contour relationship in context','crop_xyxy':crop,'crop_size':[r-l,b-t],
          'anchor':anchor,'region_ids':sorted(baseline),'crop_is_whole_image':crop==[0,0,*size],
          'source_to_crop_translation':[-l,-t],'crop_to_source_translation':[l,t],
          'region_visibility':{rid:{'source_pixels':int(m.sum()),'visible_pixels':int(mm[rid].sum()),'source_fraction_visible':float(mm[rid].sum()/m.sum()) if m.any() else 0} for rid,m in baseline.items()},
          'context_pairs':{a+'--'+b:pair_measurement(im,mm,a,b) for a,b in itertools.combinations(sorted(mm),2)},
          'proposal_visibility':{pid:int(m[t:b,l:r].sum()) for pid,m in masks.items()},
          'context_scope':'Crop recomputed from the contour extent with declared padding. Region metrics use visible pixels; linked contour/mask associations remain source-wide.',
          'focus_reference':{'analysis_sha256':dependencies['contour_analysis_sha256'],'condition_id':condition['id'],'candidate_id':candidate['id']}}
    node={'id':vid,'kind':'detail','label':view['label'],'geometry':{'bounds':crop},'anchor':anchor,'origin':'declared_contour_focus','semantic_approval':False}
    edges=[{'from':vid,'to':'whole','type':'samples_source','origin':'declared_crop','semantic_approval':False}]
    for a in associations:
        if a['associated_chain_ids']:
            edges.append({'from':vid,'to':'proposal/'+a['proposal_id'],'type':'contour_near_proposed_boundary','origin':'source_sample_proximity',
                          'chain_ids':a['associated_chain_ids'],'semantic_approval':False})
    for row in role_rows:
        interior=[cid for cid,r in row['chains'].items() if r['role']=='interior']
        if interior:
            edges.append({'from':vid,'to':'proposal/'+row['proposal_id'],'type':'contour_samples_inside_proposed_region',
                          'origin':'source_sample_partition','chain_ids':interior,'semantic_approval':False,
                          'scope':'Spatial containment under declared thresholds; not brushwork, ownership or importance.'})
    return {'version':VERSION,**{k:base[k] for k in ['work_id','source_sha256','image_sha256','image_size','bindings']},
            'base_graph_sha256':basekey,'protocol':PROTOCOL,'focus_view':view,'focus_node':node,'focus_edges':edges,
            'dependencies':dependencies['files'],'evidence_references':{k:v for k,v in dependencies.items() if k!='files'},
            'contour_reference':view['focus_reference'],'contour_status':candidate['status'],'sample_points':points,'region_associations':associations,
            'joint_accounts':accounts,'documentary_account':documentary,'implementation':implementation or {},
            'region_roles':{'version':roles.VERSION,'protocol':roles.PROTOCOL,'rows':role_rows,'summary':role_summary},
            'search_scope':'All supplied masks; regional grouping accounts are considered when at least two group members have a qualifying contour-boundary association. This is scope, not a ranking of artistic significance.',
            'scope':'A relationship-focus view, declared geometric links and conditional accounts. Documentary evidence is parallel context and does not entail the local visual interpretation.',
            'semantic_approval':False,'independent_validation':False}


def create_focus(store,payload):
    from .grounded_response import Conflict,load,digest
    from .proposal_alternatives import read_masks
    work=store.work(payload.get('work_id'))
    if payload.get('source_sha256')!=work['source_sha256']:raise Conflict('Focus request belongs to another reproduction')
    wid=work['work_id'];basekey=payload.get('graph_sha256');graph=resolve_graph(store.root,wid,basekey)
    if graph.get('focus_extension'):
        basekey=graph['focus_extension']['base_graph_sha256'];graph=resolve_graph(store.root,wid,basekey)
    if graph['work_id']!=wid or graph['source_sha256']!=work['source_sha256'] or graph['bindings']!=work['files'] or graph['image_sha256']!=work['files'][work['image_url']]:raise Conflict('Base graph belongs to another source')
    context=payload.get('contour_context')
    if not isinstance(context,dict):raise ValueError('Select a contour relationship first')
    store.bind_contour_context(context,work,graph,'whole')
    ckey=context['analysis_sha256'];crel=f'contour-relations/{wid}/{ckey}/analysis.json';contour=verified(store.root,crel,ckey)
    condition=next(c for c in contour['conditions'] if c['id']==context['condition_id'])
    candidate=next((r for r in condition['candidates'] if r['id']==context['candidate_id']),None)
    dependencies={crel:ckey}
    if candidate is None:
        audit=contour['rejected_audits'][condition['id']];rel=f'contour-relations/{wid}/{ckey}/'+audit['file'];d=verified(store.root,rel,audit['sha256']);dependencies[rel]=audit['sha256']
        candidate=next(r for r in d['candidates'] if r['id']==context['candidate_id'])
    pkey=graph.get('proposal_catalog',{}).get('catalog_sha256');prel=f'proposals/{wid}/{pkey}/catalog.json';proposals=verified(store.root,prel,pkey)
    gkey=graph.get('composition_catalog',{}).get('analysis_sha256');grel=f'composition-groups/{wid}/{gkey}/analysis.json';groups=verified(store.root,grel,gkey)
    for artifact in [proposals,groups]:
        b=artifact['binding']
        if b['work_id']!=wid or b['source_sha256']!=work['source_sha256'] or b['files']!=work['files'] or b['image_sha256']!=work['files'][work['image_url']]:raise Conflict('Linked regional evidence belongs to another source')
    if groups['binding']['proposal_catalog_sha256']!=pkey:raise Conflict('Grouping and region catalogs differ')
    masks=read_masks(store.root,proposals);baseline={r['id']:masks['color/consensus/'+r['id']] for r in work['regions']}
    dependencies.update({prel:pkey,grel:gkey,**proposals['binding']['proposal_files']})
    documentary=None
    if payload.get('source_context'):
        from .context_evidence import load_bound
        source=store.bind_source_context(payload['source_context'],work);corpus,key=load_bound(store.root,work,source['corpus_sha256'])
        claim=next(c for c in corpus['claims'] if c['id']==source['claim_id'])
        documentary={**source,'limits':claim['limits'],'relation_to_visual_account':'parallel_context_not_entailment',
                     'passages':[p for p in corpus['passages'] if p['id'] in source['passage_ids']]}
        dependencies[f'context/{key}/corpus.json']=key
    paths=[Path(__file__),Path(__file__).with_name('multiscale.py'),Path(__file__).with_name('proposal_alternatives.py'),Path(__file__).with_name('regional_evidence.py'),Path(__file__).with_name('features.py'),Path(__file__).with_name('context_evidence.py'),Path(__file__).with_name('view_context.py'),Path(__file__).with_name('contour_region_roles.py')]
    implementation={p.name:digest(p) for p in paths}
    import scipy,PIL
    implementation.update(numpy=np.__version__,scipy=scipy.__version__,pillow=PIL.__version__)
    dep={'files':dependencies,'contour_analysis_sha256':ckey,'proposal_catalog_sha256':pkey,'composition_analysis_sha256':gkey}
    extension=build_extension(graph,basekey,Image.open(store.root/work['image_url']).convert('RGB'),baseline,masks,proposals,contour,condition,candidate,groups,dep,documentary,implementation)
    raw=encoded(extension);key=sha(raw);dest=store.root/'multiscale'/wid/key;dest.mkdir(parents=True,exist_ok=True);path=dest/'graph.json'
    if path.exists() and path.read_bytes()!=raw:raise Conflict('Immutable focus graph changed')
    if not path.exists():
        # Atomic publication avoids partial reads under concurrent requests.
        import os,tempfile
        fd,tmp=tempfile.mkstemp(dir=dest,suffix='.tmp')
        try:
            with os.fdopen(fd,'wb') as f:f.write(raw)
            os.replace(tmp,path)
        finally:
            if os.path.exists(tmp):os.unlink(tmp)
    snapshot=store.root/'multiscale/focus-implementations'/sha(encoded(implementation));snapshot.mkdir(parents=True,exist_ok=True)
    for p in paths:
        target=snapshot/p.name
        if target.exists() and target.read_bytes()!=p.read_bytes():raise Conflict('Focus implementation snapshot changed')
        if not target.exists():target.write_bytes(p.read_bytes())
    return {'work_id':wid,'graph_sha256':key,'graph_url':str(path.relative_to(store.root)),'view_id':extension['focus_view']['id'],
            'base_graph_sha256':basekey,'eligible_joint_accounts':sum(r['status']=='eligible_hypothesis' for r in extension['joint_accounts']),
            'associated_regions':sum(bool(r['associated_chain_ids']) for r in extension['region_associations'])}
