"""Portable visual report for verified explanation-card compilations."""
import base64
import html
import io
from PIL import Image
from .explanation_cards import verify_compilation


def render_report(rows):
    sections=[];options=[]
    esc=lambda value:html.escape(str(value),quote=True)
    for index,row in enumerate(rows):
        bundle,candidates,gate=row['source_bundle'],row['candidates'],row['gate']
        result=row['result']['compiled']
        verify_compilation(bundle,candidates,gate,result)
        wid=row['work_id'];options.append(f'<option value="work-{index}">{esc(row["label"])}</option>')
        with Image.open(io.BytesIO(row['image_bytes'])) as im:width,height=im.size
        url='data:image/png;base64,'+base64.b64encode(row['image_bytes']).decode()
        lookup={(f['subject'],f['attribute']):f['value'] for f in bundle['facts']}
        markers=[]
        for rid in bundle['regions']:
            x,y=lookup.get((rid,'x')),lookup.get((rid,'y'))
            if x is None or y is None:continue
            markers.append(f'<g><circle cx="{x*width:.4f}" cy="{y*height:.4f}" r="13"/><text x="{x*width:.4f}" y="{y*height+4:.4f}">{esc(rid[1:])}</text></g>')
        cards=[]
        for card in result['cards']:
            observations=''.join('<li>'+esc(p['statement'])+'</li>' for p in card['checked_observations'])
            fact_rows=[];seen=set()
            for p in card['checked_observations']:
                for f in p['source_facts']:
                    if f['id'] in seen:continue
                    seen.add(f['id'])
                    value=f'{f["value"]:.6f}' if isinstance(f['value'],float) else str(f['value'])
                    fact_rows.append(f'<tr><td>{esc(f["id"])}</td><td>{esc(value)}</td><td>{esc(f["scope"])}</td></tr>')
            tests=card['sensitivity']['controls']
            removed=sum(t['kind']=='required_fact_removed' and not t['eligible_after_change'] for t in tests)
            neutral=sum(t['kind']=='prerequisite_neutralized' and not t['eligible_after_change'] for t in tests)
            areas=', '.join(r[1:] for r in card['region_ids'])
            cards.append(f'''<article class="card"><div class="eyebrow">Areas {esc(areas)} · possible effect</div>
<h2>{esc(card['title'])}</h2><p class="effect">{esc(card['possible_effect'])}</p>
<details><summary>Observations and reasoning</summary><h3>Supported by the recorded measurements</h3><ul>{observations}</ul>
<p class="note">R1, R2 and R3 refer to the numbered sampled areas. These measurements do not describe entire objects.</p>
<h3>Why consider this reading?</h3><p>{esc(card['bridge'])}</p>
<h3>Another possibility</h3><p>{esc(card['alternative'])}</p>
<h3>What would help us decide?</h3><p>{esc(card['next_evidence'])}</p>
<details><summary>Measurement values and dependency checks</summary><table><thead><tr><th>Fact</th><th>Value</th><th>Scope</th></tr></thead><tbody>{''.join(fact_rows)}</tbody></table>
<p>Removing each required fact withdrew this card in {removed} checks. Neutralizing its prerequisites withdrew it in {neutral} checks.</p>
<p class="note">These tests change source records only. They do not change the painting or measure a viewer's response.</p></details></details></article>''')
        if not cards:cards.append('<article class="card"><h2>No explanation selected</h2><p>The system abstained. The recorded measurements alone may be insufficient.</p></article>')
        earlier=''.join('<li>'+esc(r['interpretation'])+'</li>' for r in row.get('earlier_readings',[]))
        sections.append(f'''<section id="work-{index}" class="work" {'hidden' if index else ''}>
<div class="work-head"><h1>{esc(row['label'])}</h1><p>How might these sampled areas work together?</p></div>
<div class="layout"><div class="painting"><div class="image-wrap"><img src="{url}" alt="Painting reproduction for {esc(wid)}">
<svg class="markers" hidden viewBox="0 0 {width} {height}" role="img" aria-label="Numbered centroids of proposed sample masks">{''.join(markers)}</svg></div>
<button class="toggle" type="button" aria-pressed="false">Show sampled area centres</button>
<p class="note">Numbers locate the centres of proposed sample masks, not complete object boundaries.</p></div><div>{''.join(cards)}</div></div>
<details class="study"><summary>About this experimental reading</summary>
<p>The local model chose {len(result['cards'])} of {len(row['result']['catalogue'])} eligible cards. The wording of effects and alternatives is authored; it is not new model-written analysis. Observations are copied from checked records.</p>
<p>The same factual premises were used in the previous experiment. This makes the change in presentation inspectable, but does not demonstrate better artistic understanding. Small numerical differences can qualify without being perceptually important.</p>
<p>The possible effects have not been independently validated. Your accepted reading has not been replaced.</p>
<details><summary>Earlier model prose — unverified comparison</summary><ul>{earlier}</ul><p class="note">The earlier prose may introduce unsupported implications. It is retained here for comparison only.</p></details></details></section>''')
    return '''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>From observation to possible effect</title><style>
:root{color-scheme:light;font-family:system-ui,sans-serif;color:#292823;background:#f5f2ea}*{box-sizing:border-box}body{margin:0}main{max-width:1320px;margin:auto;padding:28px 36px 60px}header{border-bottom:1px solid #d6d0c5;padding-bottom:20px;display:flex;gap:20px;justify-content:space-between;align-items:center}header p{margin:4px 0}.eyebrow{font-size:12px;text-transform:uppercase;letter-spacing:.09em;color:#786047;font-weight:650}select,button{font:inherit;padding:10px 14px;border:1px solid #aca392;border-radius:6px;background:#fffdf8;color:inherit}select{max-width:100%}button{cursor:pointer}button:focus-visible,select:focus-visible,summary:focus-visible{outline:3px solid #386d96;outline-offset:3px}h1{font-family:Georgia,serif;font-weight:normal;font-size:36px;margin:26px 0 8px}h2{font-family:Georgia,serif;font-weight:normal;font-size:25px;margin:10px 0}h3{font-size:15px;margin-top:23px}p,li{line-height:1.6}.work-head p{margin:0 0 22px;color:#655d52}.layout{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:30px;align-items:start}.painting{position:sticky;top:20px}.image-wrap{position:relative;background:#e7e0d2}.image-wrap img{display:block;width:100%;height:auto}.markers{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}.markers circle{fill:#fff9ed;stroke:#292823;stroke-width:1.5}.markers text{fill:#292823;font-size:13px;text-anchor:middle;font-family:system-ui;font-weight:bold}.toggle{margin-top:14px}.note{font-size:13px;color:#70685d}.card{background:#fffdf8;border:1px solid #ded7ca;border-radius:9px;padding:23px;margin-bottom:16px}.effect{font-size:18px;margin-bottom:18px}summary{cursor:pointer;color:#684e30;line-height:1.5}details[open]>summary{margin-bottom:14px}.card details{border-top:1px solid #e1dbd1;padding-top:14px}.study{margin-top:25px;border-top:1px solid #d6d0c5;padding-top:20px}table{border-collapse:collapse;font-size:12px;width:100%;overflow-wrap:anywhere}th,td{text-align:left;border-bottom:1px solid #ddd5c8;padding:8px;vertical-align:top}footer{margin-top:36px;font-size:13px;color:#70685d}[hidden]{display:none!important}@media(max-width:800px){main{padding:20px}.layout{grid-template-columns:1fr}.painting{position:static}header{align-items:flex-start;flex-direction:column}h1{font-size:30px}}@media print{.work[hidden]{display:block!important}button,select{display:none}.painting{position:static}.layout{grid-template-columns:1fr 1fr}}
</style></head><body><main><header><div><div class="eyebrow">Painting study · experimental</div><p>From observation to possible effect</p></div><label>Painting <select id="work-select" aria-label="Choose painting">'''+''.join(options)+'''</select></label></header>'''+''.join(sections)+'''<footer>Measured relationships support questions about composition. They do not by themselves establish artistic intention, meaning or viewer response.</footer></main><script>
document.getElementById('work-select').addEventListener('change',e=>{document.querySelectorAll('.work').forEach(s=>s.hidden=s.id!==e.target.value)});
document.querySelectorAll('.toggle').forEach(button=>button.addEventListener('click',()=>{const marks=button.closest('.painting').querySelector('.markers');const hide=!marks.hasAttribute('hidden');marks.toggleAttribute('hidden',hide);button.setAttribute('aria-pressed',String(!hide));button.textContent=hide?'Show sampled area centres':'Hide sampled area centres'}));
</script></body></html>'''
