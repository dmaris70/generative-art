"""Readable relational accounts first, with masks, controls and uncertainty underneath."""
import json
from pathlib import Path
from PIL import Image
from .understanding_report import page,esc
from .reporting import encoded

def fmt(value,digits=2):return 'unavailable' if value is None else f'{value:.{digits}f}'

def render_relational(r,folder):
    folder=Path(folder);title=r['identity'].get('title',r['work_id']);artist=r['identity'].get('artist','')
    images={key:encoded(Image.open(folder/name).convert('RGB')) for key,name in [('painting','image.png'),('regions','regions.png'),('uncertainty','disagreement.png'),('directions','directions.png')]}
    header='<header><div class="eyebrow">Relationships · version 0.10 · provisional</div><h1>'+esc(title)+'</h1><p>'+esc(artist)+'</p></header>'
    body='<style>main{max-width:1000px}.account{font:21px/1.55 Georgia,serif}.viewer-image img{max-height:43vh}.switches{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}details{margin:14px 0}.limits{color:#64716a;font-size:14px}h1{font-size:38px}.accounts{display:grid;gap:12px}.accounts section{margin:0;padding:18px}td,th{font-size:12px}figure{margin:0 0 10px}</style>'
    body+='<figure class="viewer-image"><img id="relation-image" src="'+images['regions']+'" alt="Proposed regions over the painting"><figcaption id="image-caption">Colored areas are region proposals. They are not independently verified object boundaries.</figcaption></figure>'
    body+='<div class="switches">'+''.join('<button type="button" data-view="'+key+'">'+label+'</button>' for key,label in [('painting','Painting'),('regions','Region proposals'),('uncertainty','Boundary disagreement'),('directions','Image directions')])+'</div>'
    body+='<p class="limits">'+('The cypress proposal covers its visible upper section. The lower tree/shrub merge is excluded; no full-tree proportion is inferred.' if r['work_id']=='met-436535' else 'Regions were proposed from connected color fields. They carry no transferred tree/sky/field labels or viewer feelings.')+'</p>'
    body+='<h2>Two possible accounts</h2><div class="accounts">'
    for a in r['analysis']['accounts'][:2]:
        body+='<section><div class="eyebrow">'+esc(a['id']+' · '+a['status'].replace('_',' '))+'</div><p class="account">'+esc(a['text'])+'</p><details><summary>Grounds, alternative and limits</summary><p>'+esc(a.get('selection_rule',''))+'</p><p>Supporting records: '+esc(', '.join(a['support_ids']) or 'none')+'</p><p>Challenging records: '+esc(', '.join(a['challenge_ids']) or 'none identified by this rule')+'</p><p>'+esc(a.get('alternative',''))+'</p><p>'+esc(a['missing'])+'</p></details></section>'
    body+='</div><p class="limits">These are declared constructions for inspection. Neither is selected as the meaning of the painting, and no independent interpretive ratings have been obtained.</p>'
    body+='<details><summary>Region boundaries and their sensitivity</summary><p>Three declared seed/ROI conditions were run. Agreement between them describes sensitivity, not boundary accuracy. Pink marks show disagreement.</p><div class="table-wrap"><table><thead><tr><th>Region</th><th>Area</th><th>Height</th><th>Shape axis</th><th>Condition intersection / union</th><th>Scope</th></tr></thead><tbody>'
    for region in r['analysis']['regions']:
        g=region['geometry'];body+='<tr><td>'+esc(region['label'])+'</td><td>'+fmt(100*g.get('area_fraction',0),1)+'%</td><td>'+fmt(100*g.get('height_fraction',0),1)+'%</td><td>'+fmt(g.get('principal_axis_degrees_clockwise_from_right'),1)+'°</td><td>'+fmt(region['boundary']['all_condition_iou'])+'</td><td>'+esc(region['annotation_scope'])+'</td></tr>'
    body+='</tbody></table></div><p>The shape axis describes a mask’s geometry, not a brushstroke direction. All masks still require independent boundary review.</p></details>'
    body+='<details><summary>Directions: local coherence, global agreement and bending</summary><p>Local coherence means nearby image gradients have an organized orientation. Global concentration asks whether those local orientations agree across the whole region. They are different quantities. Curvature describes an estimated tangent field, not physical strokes, closed cloud forms or feelings.</p><div class="table-wrap"><table><thead><tr><th>Region</th><th>Blur px</th><th>Samples</th><th>Locally coherent fraction</th><th>Global axial concentration</th><th>Curved fraction</th></tr></thead><tbody>'
    for region in r['analysis']['regions']:
        for scale in region['directions']:
            row=scale['primary'];body+='<tr><td>'+esc(region['label'])+'</td><td>'+fmt(row['blur_pixels'],1)+'</td><td>'+str(row['eligible_direction_pixels'])+'</td><td>'+fmt(row['locally_coherent_fraction_of_energetic'])+'</td><td>'+fmt(row['global_axial_concentration'])+'</td><td>'+fmt(row['curved_fraction_of_eligible'])+'</td></tr>'
    body+='</tbody></table></div><p>Insufficient samples yield unavailable values. Blur, coherence threshold, masks, margins and resolution affect these estimates.</p></details>'
    body+='<details><summary>Compare regions using the same method</summary><div class="table-wrap"><table><thead><tr><th>Pair</th><th>Signed L* A−B</th><th>Shape-axis separation</th><th>Direction similarities at three scales</th><th>Curved-fraction differences A−B</th></tr></thead><tbody>'
    for p in r['analysis']['pairs']:
        lab=p['signed_mean_lab_difference'];body+='<tr><td>'+esc(p['id'])+'</td><td>'+fmt(lab[0] if lab else None,1)+'</td><td>'+fmt(p['shape_axis_difference_degrees'],1)+'°</td><td>'+esc(' / '.join(fmt(s['orientation_histogram_cosine']) for s in p['direction_scales']))+'</td><td>'+esc(' / '.join(fmt(s['curved_fraction_difference_a_minus_b']) for s in p['direction_scales']))+'</td></tr>'
    body+='</tbody></table></div><p>Ratios and differences use the same descriptor definitions and eligibility rules on both regions. They do not prove causal importance.</p></details>'
    body+='<details><summary>Resolution and seed controls</summary><p>The analysis was repeated at a longest side of 256 pixels with the same normalized proposals. These values may change; differences are preserved.</p><ul>'+''.join('<li>'+esc(c['region_id'])+': mask agreement after rescaling '+fmt(c['mask_iou_after_nearest_rescaling'])+'</li>' for c in r['resolution_control']['comparison'])+'</ul><p>All seed-condition direction summaries and coherence-cutoff controls are in the technical record.</p></details>'
    body+='<details><summary>Complete evidence and review status</summary><p>No independent boundary or interpretive review has been supplied. The blank worksheet records no ratings.</p><p><a href="relations.json">All measurements and hypotheses</a> · <a href="review-worksheet.json">Blank review worksheet</a> · <a href="inputs/region-specs.json">Exact region/seed proposals</a> · <a href="inputs/protocol.json">Fixed protocol</a></p><pre>'+esc(json.dumps(r['analysis']['accounts'][-1],indent=2))+'</pre></details>'
    body+='<p class="limits">'+esc(' '.join(r['limits']))+'</p><p><a href="../index.html">All three works and transfer status</a> · <a href="/reading/met-436535/report.html">Your preserved reading</a></p>'
    data=json.dumps(images).replace('<','\\u003c');captions={'painting':'Source reproduction.','regions':'Colored areas are region proposals, not verified object boundaries.','uncertainty':'Pink marks show disagreement among seed/ROI conditions; agreement does not establish accuracy.','directions':'Estimated image-tangent segments at the middle blur scale; not authenticated physical brushstrokes.'}
    script='const views='+data+',captions='+json.dumps(captions)+';document.querySelectorAll("[data-view]").forEach(b=>b.addEventListener("click",()=>{document.getElementById("relation-image").src=views[b.dataset.view];document.getElementById("image-caption").textContent=captions[b.dataset.view];}));'
    return page(title,header,body+'<script>'+script+'</script>')
