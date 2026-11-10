"""A simple, portable view of richer regional measurements and their limits."""
import base64
import html
import numpy as np
import cv2
from .regional_evidence import evidence_cards

COLORS=['#9d3b36','#246f94','#936b0c']

def e(value):return html.escape(str(value),quote=True)

def ranges(value,percent=False):
    if value['range'] is None:return 'Unavailable'
    lo,hi=value['range'];scale=100 if percent else 1
    return f'{lo*scale:.1f}–{hi*scale:.1f}'+('%' if percent else '')

def distribution_chart(regions):
    parts=['<svg viewBox="0 0 500 160" role="img" aria-label="Lightness ranges: thin lines show the fifth to ninety-fifth percentiles, thick lines the middle half, and circles the median">']
    for i,(rid,region) in enumerate(regions.items()):
        y=30+i*40;d=region['distribution'];parts.append(f'<text x="0" y="{y+4}" fill="{COLORS[i%3]}">Area {e(rid[1:])}</text>')
        if d['status']!='measured':continue
        q=[r[0] for r in d['lab_quantiles']];xs=[90+3.7*x for x in q]
        parts.append(f'<line x1="{xs[0]}" x2="{xs[4]}" y1="{y}" y2="{y}" stroke="{COLORS[i%3]}" stroke-width="2"/><line x1="{xs[1]}" x2="{xs[3]}" y1="{y}" y2="{y}" stroke="{COLORS[i%3]}" stroke-width="8"/><circle cx="{xs[2]}" cy="{y}" r="5" fill="white" stroke="{COLORS[i%3]}" stroke-width="2"/>')
    parts.append('<text x="90" y="151">0 · dark</text><text x="398" y="151">100 · light</text></svg>')
    return ''.join(parts)

def mask_svg(masks,regions,size):
    parts=[]
    for i,(rid,mask) in enumerate(masks.items()):
        contours,_=cv2.findContours(mask.astype(np.uint8),cv2.RETR_LIST,cv2.CHAIN_APPROX_SIMPLE)
        paths=[]
        for contour in contours:
            points=contour[:,0,:]
            if len(points)<3:continue
            paths.append('M'+' L'.join(f'{x},{y}' for x,y in points)+' Z')
        parts.append(f'<path d="{" ".join(paths)}" fill="{COLORS[i%3]}" fill-opacity=".18" fill-rule="evenodd" stroke="{COLORS[i%3]}" stroke-width="1"/>')
        center=regions[rid]['centroid_normalized']
        if center:
            x,y=center[0]*size[0],center[1]*size[1]
            parts.append(f'<circle cx="{x}" cy="{y}" r="12" fill="white" stroke="{COLORS[i%3]}" stroke-width="2"/><text x="{x}" y="{y+4}" text-anchor="middle" fill="{COLORS[i%3]}">{e(rid[1:])}</text>')
    return f'<svg class="overlay" viewBox="0 0 {size[0]} {size[1]}" hidden role="img" aria-label="Proposed sample masks with numbered centres">'+''.join(parts)+'</svg>'

def render_report(rows):
    sections=[];options=[]
    for i,row in enumerate(rows):
        d=row['measurements'];cards=evidence_cards(d)
        if cards!=row['cards']:raise ValueError('Cards differ from measured artifact')
        options.append(f'<option value="work-{i}">{e(row["label"])}</option>')
        base=d['conditions']['consensus'];regions=base['regions'];pair_options=[];pair_sections=[]
        for j,card in enumerate(cards):
            key=card['id'];a,b=card['region_ids'];pair=base['pairs'][key];s=d['sensitivity'][key]
            pair_options.append(f'<option value="pair-{i}-{j}">Areas {e(a[1:])} and {e(b[1:])}</option>')
            overlap=pair['color_overlap'];boundary=pair['direct_boundary'];direct=boundary['status']=='measured'
            if overlap['status']=='measured':
                diff=pair['signed_mean_lab_B_minus_A'][0]
                intro=f'Area {b[1:]} is {abs(diff):.1f} L* '+('lighter' if diff>0 else 'darker' if diff<0 else 'different')+f' on average than area {a[1:]}.'
                ov=f"{100*overlap['lightness_histogram_intersection'][0]['intersection']:.1f}%"
            else:intro='Too few sampled pixels for a color comparison.';ov='Unavailable'
            boundary_metric=f"{boundary['delta_e76_quantiles'][2]:.1f}" if direct else 'Unavailable'
            boundary_note=f"Median Delta E76 · {boundary['edge_count']} contacting edges" if direct else ('No direct mask contact' if boundary['edge_count']==0 else 'Too few contacting edges')
            directional=s['direction_overlap_across_masks_and_scales']
            allfacts=''.join('<li>'+e(f['statement'])+'</li>' for f in card['checked_observations'])
            order=f'The lightness order stays the same in all {len(d["conditions"])} mask conditions.' if s['same_nonzero_lightness_order_in_all_conditions'] else 'The lightness order changes or is unavailable in at least one mask condition.'
            state_rows=''.join(f'<tr><td>{e(name)}</td><td>{e(status.replace("_"," "))}</td></tr>' for name,status in s['boundary_statuses'].items())
            angles=ranges(s['direction_mean_angle_difference_across_masks_and_scales'])
            pair_sections.append(f'''<div class="pair" id="pair-{i}-{j}" {'hidden' if j else ''}>
<p class="intro">{e(intro)}</p><div class="metrics"><div><strong>{e(ov)}</strong><span>Lightness overlap<br>20 fixed bins</span></div><div><strong>{e(boundary_metric)}</strong><span>Boundary color difference<br>{e(boundary_note)}</span></div><div><strong>{e(ranges(directional,True))}</strong><span>Direction overlap<br>{directional['available']}/{directional['total']} mask/scale comparisons available</span></div></div>
<div class="reading"><h2>A possible reading to examine</h2><p>{e(card['possible_effect'])}</p><p class="quiet">{e(order)} Mask stability does not establish perceptual importance.</p></div>
<details><summary>Evidence, alternatives and limits</summary><ul>{allfacts}</ul><h3>Another possibility</h3><p>{e(card['alternative'])}</p><h3>What changes with the masks?</h3><p>Signed mean-lightness difference: {e(ranges(s['signed_mean_L_difference']))} L*. Lightness overlap: {e(ranges(s['lightness_overlap'],True))}. These are observed ranges, not confidence intervals.</p><table><tr><th>Mask condition</th><th>Direct boundary</th></tr>{state_rows}</table>
<p>Mean axial-direction difference, where available: {e(angles)} degrees. These are image-tangent estimates after excluding mask margins. They can follow edges or reproduction texture; they are not authenticated brushstrokes. An axial estimate treats opposite directions along the same line as equivalent.</p>
<h3>What would help us decide?</h3><p>{e(card['next_evidence'])}</p></details></div>''')
        region_rows=[]
        for rid,r in regions.items():
            dist=r['distribution'];edge=r['surround_boundary']
            spread=f"{dist['distance_from_region_mean_delta_e76_quantiles'][2]:.2f}" if dist['status']=='measured' else 'Unavailable'
            boundary=f"{edge['delta_e76_quantiles'][2]:.2f} ({edge['edge_count']} edges)" if edge['status']=='measured' else 'Unavailable'
            region_rows.append(f'<tr><td>Area {e(rid[1:])}</td><td>{spread}</td><td>{boundary}</td></tr>')
        url='data:image/png;base64,'+base64.b64encode(row['image_bytes']).decode()
        sections.append(f'''<section class="work" id="work-{i}" {'hidden' if i else ''}><h1>{e(row['label'])}</h1><p class="subtitle">Look beyond average colors: variation, boundaries and directions.</p>
<div class="layout"><div class="painting"><div class="image"><img src="{url}" alt="{e(row['label'])} painting reproduction">{mask_svg(row['masks'],regions,d['image_size'])}</div><button class="toggle" aria-pressed="false">Show sampled areas</button><p class="quiet">Proposed pixel masks, not verified object outlines. Area numbers stay consistent with the earlier studies.</p></div>
<div><label class="pairlabel">Compare <select class="pair-select">{''.join(pair_options)}</select></label>{''.join(pair_sections)}</div></div>
<details class="distribution"><summary>Variation within each area</summary><h2>Lightness ranges</h2>{distribution_chart(regions)}<p class="quiet">Thin line: 5th–95th percentiles. Thick line: middle half. Circle: median. These describe sampled pixels, not uncertainty in a population estimate.</p><table><tr><th>Sample</th><th>Median color distance from its mean<br>Delta E76</th><th>Median difference at immediate surroundings<br>Delta E76</th></tr>{''.join(region_rows)}</table><p>Surrounding-edge samples compare each mask with its immediate outside pixels inside the painting domain. They do not assume that the outside belongs to another named region.</p></details></section>''')
    return '''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Richer painting evidence</title><style>
*{box-sizing:border-box}body{margin:0;background:#f5f2ea;color:#292823;font-family:system-ui,sans-serif}main{max-width:1360px;margin:auto;padding:28px 32px 60px}header{display:flex;justify-content:space-between;align-items:center;gap:20px;border-bottom:1px solid #d5cec0;padding-bottom:18px}.eyebrow{font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#7c6142}header p{margin:6px 0}h1,h2{font-family:Georgia,serif;font-weight:normal}h1{font-size:36px;margin:26px 0 8px}h2{font-size:24px;margin:10px 0}h3{font-size:16px}.subtitle,.quiet{color:#746b5d}.quiet{font-size:13px}p,li{line-height:1.6}.layout{display:grid;grid-template-columns:1fr 1fr;gap:30px;align-items:start}.painting{position:sticky;top:20px}.image{position:relative}.image img{display:block;width:100%;height:auto}.overlay{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}.overlay text{font-size:13px;font-weight:bold}select,button{font:inherit;color:inherit;border:1px solid #b8ad9a;background:#fffdf8;border-radius:6px;padding:10px 13px;max-width:100%}button{cursor:pointer;margin-top:12px}button:focus-visible,select:focus-visible,summary:focus-visible{outline:3px solid #367699;outline-offset:2px}.intro{font-size:20px}.metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.metrics div{background:#fffdf8;border:1px solid #e0d7c7;border-radius:8px;padding:14px 10px}.metrics strong{display:block;font-size:23px;font-weight:550;overflow-wrap:anywhere}.metrics span{display:block;font-size:12px;line-height:1.5;margin-top:8px;color:#756a59}.reading{padding:18px 0}.pair details,.distribution{border-top:1px solid #d5cec0;padding-top:16px}.distribution{margin-top:28px}.distribution svg{display:block;max-width:650px;width:100%;font-size:14px}summary{cursor:pointer;color:#684e30;line-height:1.5}table{width:100%;border-collapse:collapse;font-size:13px}td,th{text-align:left;padding:9px;border-bottom:1px solid #ddd4c3}footer{margin-top:35px;border-top:1px solid #d5cec0;padding-top:20px;font-size:13px;color:#746b5d}[hidden]{display:none!important}@media(max-width:850px){main{padding:20px}.layout{grid-template-columns:1fr}.painting{position:static}header{align-items:flex-start;flex-direction:column}.metrics strong{font-size:20px}}@media(max-width:420px){.metrics{grid-template-columns:1fr}.metrics div{display:flex;gap:15px;align-items:center}.metrics strong{min-width:110px}}
</style></head><body><main><header><div><div class="eyebrow">Painting study · measured evidence</div><p>How do the areas differ and connect?</p></div><label>Painting <select id="work-select" aria-label="Choose painting">'''+''.join(options)+'''</select></label></header>'''+''.join(sections)+'''<footer>All values describe reproduction pixels and proposed masks. The possible readings are authored hypotheses, not validated artistic conclusions. No materials, intentions or viewer emotions are inferred. Earlier accepted readings remain unchanged.</footer></main><script>
document.getElementById('work-select').addEventListener('change',e=>document.querySelectorAll('.work').forEach(w=>w.hidden=w.id!==e.target.value));
document.querySelectorAll('.pair-select').forEach(s=>s.addEventListener('change',e=>s.closest('.work').querySelectorAll('.pair').forEach(p=>p.hidden=p.id!==s.value)));
document.querySelectorAll('.toggle').forEach(b=>b.addEventListener('click',()=>{const o=b.closest('.painting').querySelector('.overlay');const hide=!o.hasAttribute('hidden');o.toggleAttribute('hidden',hide);b.setAttribute('aria-pressed',String(!hide));b.textContent=hide?'Show sampled areas':'Hide sampled areas'}));
</script></body></html>'''
