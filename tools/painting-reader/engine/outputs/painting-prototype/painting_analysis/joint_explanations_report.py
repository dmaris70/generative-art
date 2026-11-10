"""Visual joint-explanation study with precomputed dependency interventions."""
import base64
import html
from .joint_explanations import verify_compilation,evaluate
from .regional_evidence_report import mask_svg

LABELS={'eligible_hypothesis':'Meets exploratory rules','not_eligible':'Rule conditions not met','undetermined':'Insufficient evidence'}
FAMILIES={'lightness_overlap':'Lightness-distribution overlap','direction_overlap':'Image-direction overlap','edge_excess_L':'Local lightness contrast above the mean difference'}
def esc(v):return html.escape(str(v),quote=True)

def clause_table(decision):
    rows=[]
    for c in decision['clauses']:
        percent=c['family']!='edge_excess_L';factor=100 if percent else 1;unit='%' if percent else ' L*'
        measured='Unavailable' if c['range'] is None else f'{c["range"][0]*factor:.1f}–{c["range"][1]*factor:.1f}{unit}'
        rule=('≤' if c['operator']=='le' else '≥')+f' {c["threshold"]*factor:g}{unit}'
        rows.append(f'<tr><td>{esc(FAMILIES[c["family"]])}</td><td>{esc(measured)}<br><small>{c["available"]}/{c["expected"]} available</small></td><td>{esc(rule)}<br><small>{esc(c["status"].replace("_"," "))}</small></td></tr>')
    return '<table><thead><tr><th>Required evidence</th><th>Observed range</th><th>Every value must be</th></tr></thead><tbody>'+''.join(rows)+'</tbody></table>'

def render_report(rows):
    options=[];works=[]
    for i,row in enumerate(rows):
        source,study=row['source'],row['study'];verify_compilation(source,study)
        options.append(f'<option value="work-{i}">{esc(row["label"])}</option>')
        pair_options=[];pair_panels=[]
        for j,pair in enumerate(study['pairs']):
            a,b=pair['region_ids'];pid=f'pair-{i}-{j}'
            pair_options.append(f'<option value="{pid}">Areas {esc(a[1:])} and {esc(b[1:])}</option>')
            eligible=[c for c in pair['candidates'] if c['decision']['status']=='eligible_hypothesis'];cards=[]
            for c in eligible:
                tests=c['dependency_tests']['checks'];choices=['<option value="eligible_hypothesis">Keep all evidence</option>']
                for clause in c['decision']['clauses']:
                    test=next(t for t in tests if t['operation']=='remove_one_required_fact' and t['fact_ids']==[clause['fact_ids'][0]])
                    choices.append(f'<option value="{test["after"]}">Remove one {esc(clause["family"].replace("_"," "))} measurement</option>')
                    test=next(t for t in tests if t['operation']=='neutralize_required_family' and t['family']==clause['family'])
                    choices.append(f'<option value="{test["after"]}">Neutralize {esc(clause["family"].replace("_"," "))}</option>')
                control=next(t for t in tests if t['operation']=='remove_unrelated_facts')
                choices.append(f'<option value="{control["after"]}">Remove unrelated evidence</option>')
                profiles=''.join(f'<tr><td>{esc(p.title())}</td><td>{esc(LABELS[state])}</td></tr>' for p,state in c['profile_sensitivity'].items())
                strict=c['profile_sensitivity']['stricter']
                sensitivity='Also meets the stricter cutoffs; the artistic effect remains unvalidated.' if strict=='eligible_hypothesis' else 'Insufficient evidence under stricter cutoffs.' if strict=='undetermined' else 'Does not meet the stricter cutoffs. This candidate depends on the chosen rules.'
                cards.append(f'''<article class="card"><div class="eyebrow">Candidate explanation · areas {esc(a[1:])} and {esc(b[1:])}</div><h2>{esc(c['title'])}</h2>
<p class="hypothesis">{esc(c['possible_effect'])}</p><p class="withdrawn" hidden>This explanation is withheld under the selected evidence change.</p><p class="status" role="status">Meets the primary exploratory rules; the artistic effect remains unverified.</p>
<p class="sensitivity">{esc(sensitivity)}</p>
<h3>A competing account</h3><p>{esc(c['alternative'])}</p>
<details><summary>Evidence and what would help us decide</summary>{clause_table(c['decision'])}<p>{esc(c['next_evidence'])}</p><p class="quiet">Ranges include every declared mask condition and relevant histogram grid or blur scale. Overlap is a numerical descriptor, not a probability of perceptual similarity.</p></details>
<details class="test"><summary>Test what this explanation depends on</summary><label>Evidence change <select class="intervention" aria-label="Choose evidence change">{''.join(choices)}</select></label><p class="quiet">A precomputed dependency check changes a copy of the evidence record. It does not edit the painting, remeasure pixels or predict a viewer's response.</p><p>{len([t for t in tests if t['operation']=='remove_one_required_fact'])} individual fact-removal tests and two family-neutralization tests withdrew this candidate. Removing unrelated facts preserved it.</p></details>
<details><summary>Stricter and looser rules</summary><table><tr><th>Profile</th><th>Outcome</th></tr>{profiles}</table><p class="quiet">These profiles were designed with the development measurements already known. None is an independently validated perceptual threshold.</p></details></article>''')
            if not eligible:
                cards.append('<article class="card"><h2>No joint explanation clears these rules</h2><p>The engine withholds a joint reading for this pair. Some conditions fail or evidence is missing. This does not establish that the areas have no meaningful relationship.</p></article>')
            audit=[]
            for c in pair['candidates']:
                profile_details=''.join(f'<details><summary>{esc(p.title())} rule details</summary>{clause_table(evaluate(pair["ledger"],c["kind"],p))}</details>' for p in ['stricter','looser'])
                audit.append(f'<details class="candidate"><summary>{esc(c["title"])} — {esc(LABELS[c["decision"]["status"]])}</summary>{clause_table(c["decision"])}{profile_details}</details>')
            pair_panels.append(f'<div class="pair" id="{pid}" {"hidden" if j else ""}>{"".join(cards)}<details class="audit"><summary>All three explanations checked</summary>{"".join(audit)}</details></div>')
        image='data:image/png;base64,'+base64.b64encode(row['image_bytes']).decode()
        overlay=mask_svg(row['masks'],source['conditions']['consensus']['regions'],source['image_size'])
        works.append(f'''<section class="work" id="work-{i}" {'hidden' if i else ''}><h1>{esc(row['label'])}</h1><p class="subtitle">How might tone, boundaries and direction work together?</p><div class="layout"><div class="painting"><div class="image"><img src="{image}" alt="{esc(row['label'])} reproduction">{overlay}</div><button class="toggle" aria-pressed="false">Show sampled areas</button><p class="quiet">Numbered masks are proposals, not verified object outlines.</p></div><div><label>Compare <select class="pair-select" aria-label="Choose region pair">{''.join(pair_options)}</select></label>{''.join(pair_panels)}</div></div></section>''')
    return '''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Joint explanations and evidence tests</title><style>
*{box-sizing:border-box}body{margin:0;background:#f5f2ea;color:#292823;font-family:system-ui,sans-serif}main{max-width:1360px;margin:auto;padding:28px 32px 60px}header{display:flex;justify-content:space-between;align-items:center;gap:20px;border-bottom:1px solid #d5cec0;padding-bottom:18px}.eyebrow{font-size:12px;letter-spacing:.09em;text-transform:uppercase;color:#7c6142}header p{margin:6px 0}h1,h2{font-family:Georgia,serif;font-weight:normal}h1{font-size:36px;margin:26px 0 8px}h2{font-size:25px;margin:12px 0}h3{font-size:16px}.subtitle,.quiet{color:#746b5d}.quiet,small{font-size:13px}p{line-height:1.6}.layout{display:grid;grid-template-columns:1fr 1fr;gap:30px;align-items:start}.painting{position:sticky;top:20px}.image{position:relative}.image img{width:100%;height:auto;display:block}.overlay{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}.overlay text{font-size:13px;font-weight:bold}button,select{font:inherit;color:inherit;background:#fffdf8;border:1px solid #b8ad9a;border-radius:6px;padding:10px 13px;max-width:100%}button{margin-top:12px;cursor:pointer}button:focus-visible,select:focus-visible,summary:focus-visible{outline:3px solid #367699;outline-offset:2px}.card{padding:24px;border:1px solid #ddd4c3;border-radius:9px;background:#fffdf8;margin-top:18px}.hypothesis{font-size:19px}.status{font-size:14px;color:#65553d}.withdrawn{padding:14px;background:#f5e6dc;color:#7a4027}.sensitivity{font-size:13px;border-left:3px solid #b78b4c;padding-left:12px}.card details,.audit{border-top:1px solid #e1d8c8;margin-top:18px;padding-top:15px}summary{cursor:pointer;color:#684e30;line-height:1.5}table{width:100%;border-collapse:collapse;font-size:13px;margin-top:12px}td,th{text-align:left;padding:8px;border-bottom:1px solid #ddd4c3;vertical-align:top}.test select{width:100%;margin-top:10px}.candidate{margin:15px 0}.candidate details{margin:12px 0}footer{border-top:1px solid #d5cec0;margin-top:35px;padding-top:20px;color:#746b5d;font-size:13px;line-height:1.6}[hidden]{display:none!important}@media(max-width:850px){main{padding:20px}.layout{grid-template-columns:1fr}.painting{position:static}header{align-items:flex-start;flex-direction:column}.card{padding:18px}}
</style></head><body><main><header><div><div class="eyebrow">Painting study · joint explanations</div><p>From measured relationships to testable readings</p></div><label>Painting <select id="work-select" aria-label="Choose painting">'''+''.join(options)+'''</select></label></header>'''+''.join(works)+'''<footer>The possible readings are authored development hypotheses. No model generated or independently validated them. Evidence tests establish dependencies, not perceptual causation. Your accepted reading remains unchanged.</footer></main><script>
document.getElementById('work-select').addEventListener('change',e=>document.querySelectorAll('.work').forEach(w=>w.hidden=w.id!==e.target.value));
document.querySelectorAll('.pair-select').forEach(s=>s.addEventListener('change',()=>s.closest('.work').querySelectorAll('.pair').forEach(p=>p.hidden=p.id!==s.value)));
document.querySelectorAll('.toggle').forEach(b=>b.addEventListener('click',()=>{const o=b.closest('.painting').querySelector('.overlay');const hide=!o.hasAttribute('hidden');o.toggleAttribute('hidden',hide);b.setAttribute('aria-pressed',String(!hide));b.textContent=hide?'Show sampled areas':'Hide sampled areas'}));
document.querySelectorAll('.intervention').forEach(s=>s.addEventListener('change',()=>{const card=s.closest('.card');const qualifies=s.value==='eligible_hypothesis';card.querySelector('.hypothesis').hidden=!qualifies;card.querySelector('.withdrawn').hidden=qualifies;card.querySelector('.status').textContent=s.selectedIndex===0?'Meets the primary exploratory rules; the artistic effect remains unverified.':qualifies?'Simulation: removing unrelated evidence preserves this candidate.':s.value==='undetermined'?'Simulation: a required observation is missing; the explanation is withheld.':'Simulation: neutralizing a required relationship makes the rule fail; the explanation is withheld.'}));
</script></body></html>'''
