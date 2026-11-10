"""A reproducible geometry-diversity budget, not an artistic-importance selector."""
import itertools,math
from .region_hypotheses import verify_graph,digest

def iou(a,b):
    union=int((a|b).sum())
    return int((a&b).sum())/union if union else None

def scope_metrics(masks,ids,whole_id):
    local=[r for r in ids if r!=whole_id]
    pairs=[{'a':a,'b':b,'iou':iou(masks[a],masks[b])} for a,b in itertools.combinations(local,2)]
    return {'local_scopes':len(local),'pairs':pairs,'maximum_local_iou':max((p['iou'] for p in pairs),default=None)}

def select_scopes(graph,masks,max_local=2,min_jaccard_distance=.1):
    regions=verify_graph(graph,masks)
    if not isinstance(max_local,int) or isinstance(max_local,bool) or max_local<1:raise ValueError('Positive integer budget required')
    if not math.isfinite(min_jaccard_distance) or not 0<=min_jaccard_distance<=1:raise ValueError('Distance must be in [0,1]')
    whole=graph['whole_region_id'];pool=sorted({h['region_id'] for h in graph['hypotheses'] if h['inspection_default'] and h['region_id']!=whole and not regions[h['region_id']]['empty']})
    def balance(rid):
        a=regions[rid]['descriptor']['area_fraction'];return a*(1-a)
    chosen=[];steps=[];remaining=list(pool)
    if remaining:
        first=min(remaining,key=lambda r:(-balance(r),r));chosen.append(first);remaining.remove(first)
        steps.append({'id':first,'method':'largest_area_fraction_times_complement','score':balance(first),'meaning':'Balanced pixel extent for inspection, not a focal point or artistic significance.'})
    while remaining and len(chosen)<max_local:
        scores={rid:min(1-iou(masks[rid],masks[s]) for s in chosen) for rid in remaining}
        best=min(remaining,key=lambda r:(-scores[r],-balance(r),r))
        if scores[best]<min_jaccard_distance:break
        chosen.append(best);remaining.remove(best);steps.append({'id':best,'method':'farthest_from_existing_pixel_sets','score':scores[best],'meaning':'Jaccard distance between masks, not distinct depicted objects.'})
    # If only one distinct default survives, offer its exact complementary pixels as context.
    if len(chosen)==1 and max_local>1:
        comp=next((c['complement_region_id'] for c in graph['complements'] if c['region_id']==chosen[0]),None)
        if comp and comp!=whole and comp not in chosen and not regions[comp]['empty']:
            chosen.append(comp);steps.append({'id':comp,'method':'complement_context_fallback','score':1.0,'meaning':'Other pixels, not verified background or negative space.'})
    deferred=[]
    for rid in pool:
        if rid in chosen:continue
        nearest=min(chosen,key=lambda s:(-iou(masks[rid],masks[s]),s))
        overlap=iou(masks[rid],masks[nearest])
        deferred.append({'id':rid,'nearest_selected':nearest,'iou':overlap,
            'reason':'near_duplicate_for_this_budget' if 1-overlap<min_jaccard_distance else 'inspection_budget','retained_in_graph':True})
    result={'graph_sha256':graph['sha256'],'region_ids':chosen+[whole],'local_region_ids':chosen,'whole_region_id':whole,
        'candidate_default_regions':pool,'selection_steps':steps,'deferred':deferred,
        'max_local':max_local,'min_jaccard_distance':min_jaccard_distance,
        'all_native_hypotheses_retained':len(graph['hypotheses']),'metrics':scope_metrics(masks,chosen,whole),
        'semantic_approval':False,'independent_validation':False,
        'limits':['Geometry-only inspection heuristic; no class score, reference mask or label meaning is used.',
          'Candidates outside this budget and all native alternatives remain in the original graph.',
          'Diversity can prefer a wrong or irrelevant mask. Lower overlap does not demonstrate better composition analysis.',
          'Whole-image context is mandatory but excluded from the diversity score. Multiple scales remain hypotheses, not established object/part/group roles.']}
    result['sha256']=digest(result);return result
