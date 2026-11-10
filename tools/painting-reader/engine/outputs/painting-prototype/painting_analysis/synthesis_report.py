"""Inspect fixed contexts, argument dependencies and separate assessment dimensions."""
import json
from pathlib import Path
from PIL import Image
from .reporting import encoded
from .understanding_report import page,esc,title_for,review_panel
from .grounded_synthesis import dependency_removal


def node_card(n):
    a=n['assessment'];j=a['raw']
    body=f'<article class="component {esc(a["disposition"])}" id="component-{esc(n["id"])}"><div class="eyebrow">{esc(n["kind"])} · {esc(n["id"])}</div><p class="proposition">{esc(n["text"])}</p><div class="model-findings"><span class="badge">{esc(a["disposition"])} · same-model audit</span>'
    body+='<details><summary>Inspect premises, inference and qualification separately</summary>'
    for dim,key in [('premises','premise_reason'),('inference','inference_reason'),('qualification','qualification_reason')]:
        body+='<p><b>'+esc(dim.capitalize())+': '+esc(j[dim].replace('_',' '))+'</b> · '+esc(j[key])+'</p>'
    body+='<p>Needed: '+esc(j['missing_evidence'])+'</p></details>'
    if a['flags']:body+='<p class="alert">'+esc(' '.join(a['flags']))+'</p>'
    body+='</div><p class="muted">Fixed support context: '+(' · '.join('<a href="#evidence-'+esc(i)+'">'+esc(i)+'</a>' for i in n['support_ids']) or 'upstream argument components')+'.</p>'
    if n['challenge_ids']:body+='<p class="muted">Challenging context: '+', '.join(map(esc,n['challenge_ids']))+'</p>'
    if n['depends_on']:body+='<p class="muted">Depends on: '+', '.join('<a href="#component-'+esc(i)+'">'+esc(i)+'</a>' for i in n['depends_on'])+'</p>'
    return body+f'<button data-component="{esc(n["id"])}">Review this component</button></article>'


def ledger(evidence):
    body=''
    for e in evidence:
        body+='<details id="evidence-'+esc(e['id'])+'"><summary>'+esc(e['id'])+' · '+esc(e['kind'])+'</summary><p>'+esc(e['statement'])+'</p>'
        if 'value' in e:body+='<pre>'+esc(json.dumps({'value':e['value'],'unit':e['unit']},ensure_ascii=False))+'</pre>'
        body+='<p class="muted">'+esc(e.get('status',''))+' · '+esc('; '.join(e.get('limitations',[])))+'</p>'
        if e.get('source_locator'):body+='<p class="muted">Source: '+esc(e['source_locator'])+'</p>'
        if e.get('source_disposition'):body+='<p class="model-findings">Source disposition: '+esc(e['source_disposition'])+'</p>'
        body+='</details>'
    return body


def graph_explorer(result):
    effects={e['id']:dependency_removal(result['nodes'],e['id'],result['evidence']) for e in result['evidence']}
    data=json.dumps(effects).replace('<','\\u003c').replace('&','\\u0026')
    options=''.join('<option value="'+esc(e['id'])+'">'+esc(e['id'])+' · '+esc(e['statement'][:80])+'</option>' for e in result['evidence'])
    script="""(()=>{const data=JSON.parse(document.getElementById('removal-data').textContent);document.getElementById('remove-premise').addEventListener('change',e=>{document.querySelectorAll('.removal-state').forEach(n=>n.remove());const ids=data[e.target.value]||[];for(const id of ids){const card=document.getElementById('component-'+id),p=document.createElement('p');p.className='removal-state alert';p.textContent='Graph diagnostic: selected premise removed; this component requires reinspection.';card.prepend(p);}document.getElementById('removal-message').textContent=ids.length?ids.length+' declared dependents require reinspection. No new model judgment was run.':'No premise removed, or this premise has no declared dependents.';});})();"""
    return '<section><h2>Explore a missing premise</h2><p>This changes a dependency diagnostic only. It does not alter the saved analysis or simulate a viewer’s perception.</p><label>Temporarily remove a premise<select id="remove-premise"><option value="">Keep all premises</option>'+options+'</select></label><p id="removal-message" role="status">Keep all premises to view the original argument.</p></section><script id="removal-data" type="application/json">'+data+'</script><script>'+script+'</script>'


def finish(result,filename):
    return '<section><h2>Evidence ledger</h2>'+ledger(result['evidence'])+'</section><section><h2>Limits</h2><ul>'+''.join('<li>'+esc(x)+'</li>' for x in result['limits'])+'</ul><p><a href="'+filename+'">Structured argument</a> · <a href="selection-before-generation.json">Premise selection recorded before generation</a> · <a href="inference-audit.json">Native audit trail</a></p></section>'


def render_synthesis(r,output):
    output=Path(output);title,artist=title_for(r['work_id'])
    header=f'<header><div class="eyebrow">Painting understanding · version 0.7 · grounded synthesis</div><h1>{esc(title)}</h1><p>{esc(artist)}</p><p>Follow the argument from located observations through measured relationships to a qualified whole-work account. Evidence selection precedes explanation; factual support, inference and qualification are checked separately.</p><div class="toolbar"><a href="../../index.html">Synthesis gallery</a><a href="#component-review">Review argument components</a><a href="/composition/roles/{esc(r["work_id"])}/report.html">Preserved version 0.6 account</a></div><label><input id="hide-findings" type="checkbox">Hide model findings while reviewing</label></header>'
    body='<div class="columns">'
    for file,label in [('image.png','Unaltered analyzed reproduction'),('overlay.png','Inherited box envelopes and coarse low-detail masks; coordinate aid only')]:
        if (output/file).exists():body+='<figure><img src="'+encoded(Image.open(output/file).convert('RGB'))+'" alt="'+esc(label)+'"><figcaption>'+esc(label)+'</figcaption></figure>'
    body+='</div><h2>Whole-work synthesis</h2>'+node_card(r['nodes'][-1])+graph_explorer(r)
    for selected,generated in zip(r['selection'],r['generation']['items']):
        qid=selected['question_id'];body+='<h2>'+esc(next(q['text'] for q in r['questions'] if q['id']==qid))+'</h2>'
        body+='<details><summary>Premises selected before this account was written</summary><pre>'+esc(json.dumps(selected,indent=2))+'</pre></details><div class="columns">'
        body+=''.join(node_card(n) for n in r['nodes'] if n['question_id']==qid)+'</div><details><summary>Alternative and challenge</summary><p>'+esc(generated['alternative'])+'</p><p>'+esc(generated['challenge'])+'</p></details>'
    body+='<section class="model-findings"><h2>Textual premise-removal controls</h2><p>The same bridge is audited with full selected support, one selected measurement removed, and an uncited distractor removed. No image is supplied. A stable verdict may reflect redundancy or insensitivity; no accuracy score is inferred.</p><details><summary>Inspect shuffled cases, raw dimension judgments and graph consequences</summary><pre>'+esc(json.dumps(r['removal_controls'],indent=2))+'</pre></details></section>'
    body+=review_panel(r,output,'arguments',r['work_id'],'synthesis-reviews')+finish(r,'synthesis.json')
    return page(title,header,body)


def render_synthesis_pair(r,output):
    output=Path(output);header='<header><div class="eyebrow">Painting understanding · version 0.7 · grounded comparison</div><h1>Compare the arguments and their grounds</h1><p>Each side’s observation, source account and measurements were selected before the comparison was written. Their uncertainty remains part of the result.</p><div class="toolbar"><a href="../../index.html">Synthesis gallery</a><a href="#component-review">Review paired components</a></div><label><input id="hide-findings" type="checkbox">Hide model findings while reviewing</label></header>'
    body='<div class="columns">'
    for w in r['works']:
        title,_=title_for(w['work_id']);body+='<figure><img src="'+encoded(Image.open(output/(w['alias']+'.png')).convert('RGB'))+'" alt="Work '+w['alias']+': '+esc(title)+'"><figcaption>Work '+w['alias']+' · '+esc(title)+' · <a href="../../arguments/'+esc(w['work_id'])+'/report.html">Inspect source argument</a></figcaption></figure>'
    body+='</div>'+graph_explorer(r)
    for selection,item in zip(r['selection'],r['generation']['items']):
        qid=selection['question_id'];body+='<h2>'+esc(next(q['text'] for q in r['questions'] if q['id']==qid))+'</h2><p class="model-findings"><span class="badge">Relation: '+esc(item['relation'])+'</span></p><div class="columns">'
        for alias in ('A','B'):
            ids=[selection[alias]['observation_id'],selection[alias]['account_id']]+selection[alias]['measurement_ids'];lookup={e['id']:e for e in r['evidence']}
            body+='<section><div class="eyebrow">Fixed context · work '+alias+'</div>'+''.join('<p><a href="#evidence-'+esc(eid)+'">'+esc(eid)+'</a> · '+esc(lookup[eid]['statement'])+'</p>' for eid in ids)+'</section>'
        body+='</div><div class="columns">'+''.join(node_card(n) for n in r['nodes'] if n['question_id']==qid)+'</div><details><summary>Alternative and challenge</summary><p>'+esc(item['alternative'])+'</p><p>'+esc(item['challenge'])+'</p></details>'
    body+='<section class="model-findings"><h2>Order and identical-input controls</h2><p>Dimension changes after reversing image presentation: '+str(len(r['order_control']['changed_case_ids']))+'. Unexpected identical-input distinctions: '+str(len(r['duplicate_control']['unexpected_difference_ids']))+'.</p><details><summary>Inspect raw controls, including failures</summary><pre>'+esc(json.dumps({'order':r['order_control'],'duplicate':r['duplicate_control']},indent=2))+'</pre></details></section>'
    body+=review_panel(r,output,'pairs',r['pair_id'],'synthesis-reviews')+'<p>Changing a selected source observation/account flags the paired question on reload; acceptance cannot override a changed premise.</p>'+finish(r,'synthesis-pair.json')
    return page('Grounded comparison',header,body)
