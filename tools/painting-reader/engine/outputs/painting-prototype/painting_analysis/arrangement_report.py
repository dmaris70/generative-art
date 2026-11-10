"""One spatial account first; located evidence and diagram experiments remain optional."""
import json
from pathlib import Path
import cv2
import numpy as np
from PIL import Image
from .understanding_report import page, esc
from .reporting import encoded

COLORS = ['#b86e62', '#6d92c2', '#cfb755', '#79a07d']


def mask_path(mask):
    contours, _ = cv2.findContours(mask.astype('uint8'), cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    paths = []
    for contour in contours:
        p = cv2.approxPolyDP(contour, .7, True).reshape(-1, 2)
        if len(p) < 3: continue
        paths.append('M' + ' L'.join(f'{int(x)},{int(y)}' for x, y in p) + ' Z')
    return ' '.join(paths)


def diagram_svg(case, size):
    w, h = size
    body = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" role="img" aria-label="{esc(case["label"])}; schematic mask diagram">'
    body += f'<rect width="{w}" height="{h}" fill="#eeeae0"/><path d="{mask_path(case["domain"])}" fill="#fffdf8" fill-rule="evenodd"/>'
    for i, (rid, mask) in enumerate(case['masks'].items()):
        body += f'<path d="{mask_path(mask)}" fill="{COLORS[i % len(COLORS)]}" fill-opacity=".68" stroke="#314b42" stroke-width=".8" fill-rule="evenodd"><title>{esc(rid)}: {int(mask.sum())} proposal pixels</title></path>'
    if case['status'] == 'executed':
        for node in case['graph']['nodes']:
            x, y = node['centroid_pixels']
            body += f'<circle cx="{x:.3f}" cy="{y:.3f}" r="10" fill="#fffdf8"/><text x="{x:.3f}" y="{y+3:.3f}" text-anchor="middle" font-size="9" fill="#1c352b">{esc(node["id"])}</text>'
    return body + '</svg>'


def network_svg(result, source):
    w, h = result['image_size']; net = result['analysis']['network']
    body = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" role="img" aria-label="Located straight-edge and near-junction proposals"><image width="{w}" height="{h}" href="{source}"/>'
    for s in net['segments']:
        (x1, y1), (x2, y2) = s['endpoints_pixels']
        body += f'<line data-line-id="{s["id"]}" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="#d51a78" stroke-width="2"><title>{s["id"]}: {s["length_shortside"]*100:.1f}% of short side, {s["angle_degrees"]:.1f} degrees</title></line>'
    for j in result['analysis']['junctions']:
        x, y = j['point_pixels']; body += f'<circle cx="{x}" cy="{y}" r="4" fill="none" stroke="#ffe353" stroke-width="2"><title>{j["id"]}: {esc(j["kind"])}, segments {esc(", ".join(j["segment_ids"]))}</title></circle>'
    return body + '</svg>'


def fmt(x, digits=2): return 'unavailable' if x is None else f'{x:.{digits}f}'


def percent(x): return 'unavailable' if x is None else fmt(100*x, 1)+'%'


def render_arrangement(result, folder):
    folder = Path(folder); a = result['analysis']; title = result['identity'].get('title', result['work_id'])
    source = encoded(Image.open(folder/'image.png').convert('RGB')); cases = result['diagram_experiments']
    diagrams = {c['id']: (folder/(c['id']+'.svg')).read_text() for c in cases}
    header = '<header><div class="eyebrow">Arrangement · version 0.11 · provisional</div><h1>'+esc(title)+'</h1><p>'+esc(result['identity'].get('artist', ''))+'</p></header>'
    body = '''<style>main{max-width:1030px}h1{font-size:36px}.stage{background:#e8e7df;text-align:center;padding:10px}.stage img,.stage svg{display:block;max-height:42vh;max-width:100%;width:auto;margin:auto}.stage svg{height:42vh}.stage [hidden]{display:none!important}.switches{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.switches button[aria-pressed=true]{background:#264c3d;color:#fff}figure{margin:0}.account{font:21px/1.55 Georgia,serif}.scope{font-size:14px;color:#59665f}details{margin:16px 0}td,th{font-size:12px}.experiment{background:#fffdf7;border:1px solid #d9dbd3;padding:16px}.experiment .stage svg{height:34vh}select{padding:9px;max-width:100%}.legend{display:flex;flex-wrap:wrap;gap:12px}.legend span:before{content:'●';color:var(--swatch);padding-right:5px}.evidence-item{border-top:1px solid #ddd;padding:12px 0}.line-list{max-height:260px;overflow:auto}pre{max-height:300px;overflow:auto}</style>'''
    body += '<figure><div class="stage"><img id="painting-view" src="'+source+'" alt="Source painting reproduction"><div id="line-view" hidden>'+network_svg(result, source)+'</div><div id="region-view" hidden>'+diagrams['identity']+'</div></div><figcaption id="view-caption">Source reproduction. The account below refers to proposed regions.</figcaption></figure>'
    body += '<div class="switches">'+''.join('<button type="button" data-view="'+key+'" aria-pressed="'+('true' if key == 'painting' else 'false')+'">'+label+'</button>' for key, label in [('painting', 'Painting'), ('line', 'Lines and junctions'), ('region', 'Region positions')])+'</div>'
    body += '<div class="legend">'+''.join('<span style="--swatch:'+COLORS[i % len(COLORS)]+'">'+esc(n['id']+' · '+n['label'])+'</span>' for i,n in enumerate(a['spatial_graph']['nodes']))+'</div>'
    body += '<h2>How the arrangement may work</h2><p class="account">'+esc(a['account']['text'])+'</p>'
    body += '<p class="scope">A constructed inspection hypothesis. Region size selects this account’s example; independent judgments of artistic importance and explanatory usefulness are still pending.</p>'
    body += '<details><summary>Why this account, and what could challenge it?</summary><p>'+esc(a['account'].get('alternative', ''))+'</p><p>'+esc(a['account'].get('missing', ''))+'</p>'
    for claim in a['account']['claims']:
        body += '<div class="evidence-item"><strong>'+esc(claim['kind'].replace('_',' '))+'</strong><p>'+esc(claim['text'])+'</p><p>Records: '+''.join('<a href="#e-'+esc(eid)+'">'+esc(eid)+'</a> ' for eid in claim['evidence_ids'])+'</p></div>'
    body += '</details>'
    body += '<details><summary>Try a change in arrangement</summary><p>These are schematic region experiments. Colors are diagram keys. They are not modified paintings. Fixed source color attributes accompany each mask; the line detector is not rerun on these diagrams.</p><label for="layout-condition">Arrangement condition</label><div class="switches"><select id="layout-condition">'+''.join('<option value="'+esc(c['id'])+'">'+esc(c['label'])+'</option>' for c in cases)+'</select></div><div class="experiment"><div class="stage" id="experiment-diagram">'+diagrams['identity']+'</div><p id="experiment-intervention">'+esc(cases[0]['intervention'])+'</p><p id="experiment-status">Original region diagram · executed</p><p class="account" id="experiment-account">'+esc(cases[0].get('account',{}).get('text','Unavailable'))+'</p><p id="experiment-checks"></p></div><p class="scope">Changes in a deterministic diagram account demonstrate mechanical sensitivity. They do not establish perceptual effects, artistic intention or improved interpretation. Translation may create overlaps; the technical record reports them.</p></details>'
    net = a['network']; orthogonal = net['axis_aligned_length_fraction']
    body += '<details><summary>Inspect lines, junctions and region contacts</summary><p>'+str(len(net['segments']))+' retained edge segments; '+str(len(a['junctions']))+' geometric near-junctions. '+fmt(100*orthogonal,1)+'% of retained segment length lies within 10° of horizontal or vertical.' if orthogonal is not None else '<details><summary>Inspect lines, junctions and region contacts</summary><p>No eligible long segments; orientation fraction unavailable.'
    body += '</p><p>Magenta marks straight-edge candidates; yellow circles mark geometric near-meetings. A dark band may contribute two edges. Curved contours and short accents can be missed. A near-meeting is not a verified painted junction.</p><label for="focus-line">Highlight a candidate</label><select id="focus-line"><option value="">All segments</option>'+''.join('<option value="'+s['id']+'">'+s['id']+' · '+fmt(s['length_shortside']*100,1)+'% short side · '+fmt(s['angle_degrees'],1)+'°</option>' for s in net['segments'])+'</select><p id="line-context">Select a segment to show its linked regions and opposite-side samples.</p><div class="line-list"><table><thead><tr><th>Junction</th><th>Proposed type</th><th>Segments</th></tr></thead><tbody>'+''.join('<tr><td>'+esc(j['id'])+'</td><td>'+esc(j['kind'].replace('_',' '))+'</td><td>'+esc(', '.join(j['segment_ids']))+'</td></tr>' for j in a['junctions'])+'</tbody></table></div></details>'
    body += '<details><summary>Spatial relations and distribution</summary><p>Area, proximity, alignment and enclosure refer to the selected masks. Area and color-contrast moments are declared distribution proxies; they are not calibrated measures of perceptual balance or attention.</p><div class="table-wrap"><table><thead><tr><th>Region</th><th>Domain area</th><th>Horizontal offset</th><th>Vertical offset</th><th>L*</th><th>Chroma</th></tr></thead><tbody>'
    for n in a['spatial_graph']['nodes']:
        body += '<tr><td>'+esc(n['id']+' '+n['label'])+'</td><td>'+fmt(n['area_fraction_of_domain']*100,1)+'%</td><td>'+fmt(n['offset_from_domain_center'][0],3)+'</td><td>'+fmt(n['offset_from_domain_center'][1],3)+'</td><td>'+fmt(n['mean_lab'][0],1)+'</td><td>'+fmt(n['chroma'],1)+'</td></tr>'
    distribution = a['spatial_graph']['distribution']
    body += '</tbody></table></div><p>Offsets use capture width/height; positive means right/down.</p><p>Area-centroid offset: '+esc(' / '.join(fmt(v,3) for v in distribution['area_centroid_offset']))+'. Color-contrast-centroid offset: '+esc(' / '.join(fmt(v,3) for v in distribution['contrast_centroid_offset']) if distribution['contrast_centroid_offset'] is not None else 'unavailable')+'. Both use selected proposals; overlapping pixels contribute to each proposal.</p><table><thead><tr><th>Pair</th><th>Nearest gap / short side</th><th>Area ratio A/B</th><th>Near adjacent</th><th>Overlap pixels</th></tr></thead><tbody>'+''.join('<tr><td>'+esc(p['id'])+'</td><td>'+fmt(p['nearest_gap_shortside'],3)+'</td><td>'+fmt(p['area_ratio_a_over_b'])+'</td><td>'+str(p['near_adjacent'])+'</td><td>'+str(p['overlap_pixels'])+'</td></tr>' for p in a['spatial_graph']['pairs'])+'</tbody></table><p>All alignments, hole-enclosure fractions and opposing contrast-moment contributions are retained in the complete record. Their presence does not establish a compositional role.</p></details>'
    c = result['pixel_controls']; resolution = c['resolution']; reflection = c['reflection']
    body += '<details><summary>How stable are these detections?</summary><p>At '+str(resolution['size'][0])+' × '+str(resolution['size'][1])+' pixels the detector retains '+str(len(resolution['network']['segments']))+' segments. Full-resolution segment match fraction: '+percent(resolution['segment_agreement']['full_matched_fraction'])+'. After reflecting the image and mapping detections back: '+percent(reflection['segment_agreement']['full_matched_fraction'])+'. These are repeatability diagnostics, not accuracy scores.</p><ul>'+''.join('<li>Minimum length '+fmt(t['minimum_length_shortside']*100,1)+'% of short side: '+str(len(t['network']['segments']))+' segments.</li>' for t in c['length_thresholds'])+'</ul><p>Endpoint matching can reject a split or merged line. Near-junction locations and types can change with scale. Low agreement remains a limitation.</p><p>'+esc(result['layout_diagnostics']['scope'])+'</p></details>'
    body += '<details><summary>Evidence, original boundary caveats and review status</summary><p><a href="arrangement.json">Complete analysis and controls</a> · <a href="inputs/protocol.json">Frozen protocol</a> · <a href="review-worksheet.json">Blank evaluation worksheet</a></p><p>No independent ratings have been supplied.</p><ul>'+''.join('<li>'+esc(x['id']+': '+x['scope'])+'</li>' for x in result['source_region_caveats'])+'</ul>'
    for e in a['evidence']:
        body += '<details id="e-'+esc(e['id'])+'"><summary>'+esc(e['id']+' · '+e['kind'].replace('_',' '))+'</summary><pre>'+esc(json.dumps(e['facts'],indent=2))+'</pre></details>'
    body += '</details><p class="scope">'+esc(' '.join(result['limits']))+'</p><p><a href="../index.html">Both arrangement studies</a> · <a href="/relations/'+esc(result['work_id'])+'/report.html">Earlier region analysis</a> · <a href="/reading/met-436535/report.html">Your accepted reading</a></p>'
    data = {'diagrams': diagrams, 'conditions': {c['id']: c for c in cases}, 'diagnostics': {r['condition']: r for r in result['layout_diagnostics']['conditions']},
        'links': a['line_region_links'], 'sides': a['line_side_fields']}
    payload = json.dumps(data).replace('<', '\\u003c')
    body += '''<script>const data='''+payload+''';const captions={painting:'Source reproduction. The account below refers to proposed regions.',line:'Magenta: straight-edge proposals. Yellow: geometric near-junctions. Counts do not represent painted strokes.',region:'Schematic mask diagram. Diagram colors are region keys, not the painting’s actual colors.'};function showView(key){['painting','line','region'].forEach(k=>document.getElementById(k+'-view').hidden=k!==key);document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===key)));document.getElementById('view-caption').textContent=captions[key];}document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));document.getElementById('layout-condition').addEventListener('change',e=>{const id=e.target.value,c=data.conditions[id],d=data.diagnostics[id];document.getElementById('experiment-diagram').innerHTML=data.diagrams[id];document.getElementById('experiment-intervention').textContent=c.intervention;document.getElementById('experiment-status').textContent=c.label+' · '+c.status;document.getElementById('experiment-account').textContent=c.account?c.account.text:'Unavailable: no accepted change within capture limits.';document.getElementById('experiment-checks').textContent=d.status==='unavailable'?'Condition unavailable.':'Mechanical checks: '+d.status+'. Layout-only wording changed: '+String(d.account_changed)+'. Overlap counted more than once: '+d.overlap_pixels_counted_more_than_once+' pixels.';});document.getElementById('focus-line').addEventListener('change',e=>{const id=e.target.value;showView('line');document.querySelectorAll('[data-line-id]').forEach(s=>{s.setAttribute('opacity',!id||s.dataset.lineId===id?'1':'.18');s.setAttribute('stroke-width',s.dataset.lineId===id?'4':'2');});const links=data.links.filter(l=>l.segment_id===id).map(l=>l.region_id+' ('+(l.boundary_contact_fraction*100).toFixed(0)+'% nearby)');const side=data.sides.find(s=>s.segment_id===id);const pairs=side?side.opposite_proposal_pairs.map(p=>p.negative_side_region+' / '+p.positive_side_region):[];document.getElementById('line-context').textContent=id?id+': boundary contacts '+(links.join(', ')||'none')+'; opposite-side proposal pairs '+(pairs.join(', ')||'none')+'.':'All retained candidates shown.';});</script>'''
    return page(title,header,body)
