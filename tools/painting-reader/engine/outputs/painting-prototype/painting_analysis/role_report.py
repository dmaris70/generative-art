"""Portable compositional-role workspaces, with measurements and hypotheses separate."""
import json
from pathlib import Path

from PIL import Image
from .reporting import encoded
from .reasoning import dump,sha
from .understanding_report import esc,page,title_for,component_card,review_panel
from .role_model import QUESTIONS


def sources(result):
    return '<p>Method readings: '+ ' · '.join(f'<a href="{esc(s["url"])}">{esc(s["title"])}</a>' for s in result['method_sources'])+'</p>'


def evidence_ledger(items):
    return ''.join(f'<details id="evidence-{esc(e["id"])}"><summary>{esc(e["id"])} · {esc(e["kind"].replace("_"," "))}</summary><p>{esc(e["statement"])}</p><p class="muted">{esc(e["status"])} · {esc("; ".join(e.get("limitations",[])))}</p>'+('<pre>'+esc(json.dumps(e['facts'],indent=2))+'</pre>' if 'facts' in e else '')+'</details>' for e in items)


def end(result,filename):
    return '<section><h2>Scope and open questions</h2><ul>'+''.join('<li>'+esc(x)+'</li>' for x in result['limits'])+'</ul>'+sources(result)+f'<p><a href="{filename}">Structured result</a> · <a href="inference-audit.json">Native model requests and responses</a></p></section>'


def render_roles(result,output):
    output=Path(output);wid=result['work_id'];title,artist=title_for(wid);m=result['measurements']
    header=f'<header><div class="eyebrow">Painting understanding · version 0.6 · compositional roles</div><h1>{esc(title)}</h1><p>{esc(artist)}</p><p>How might emphasis and figure–ground relationships organize this painting? Inspect the located evidence, the proposed role and its explanation separately.</p><div class="toolbar"><a href="../../index.html">Composition gallery</a><a href="#component-review">Review components</a><a href="/understanding/audits/{esc(wid)}/report.html">Earlier statement/bridge audit</a></div><label><input type="checkbox" id="hide-findings">Hide model findings while reviewing</label></header>'
    body='<div class="columns">'
    for filename,label in [('image.png','Unaltered analyzed reproduction'),('overlay.png','Red boxes: candidate envelopes. Colored cells: coarse low-detail fields.')]:
        body+=f'<figure><img src="{encoded(Image.open(output/filename).convert("RGB"))}" alt="{esc(label)}"><figcaption>{esc(label)}</figcaption></figure>'
    body+='</div><section><h2>Located relationships, before interpretation</h2><p>'+esc(m['selection'])+'</p><p>'+esc(m['method'])+'</p><div class="table-wrap"><table><tr><th>Candidate</th><th>Box area</th><th>Box − near ring L*</th><th>Box − wide ring L*</th><th>Ring-width control</th></tr>'
    lookup={e['id']:e for e in m['evidence']}
    number=lambda x:'unavailable' if x is None else f'{x:.3f}'
    for c in m['candidates']:
        e=lookup[c['id']+'-N'];f=e['facts']
        body+=f'<tr><td><a href="#evidence-{esc(c["id"])}-N">{esc(c["id"])}</a></td><td>{f["area_fraction"]:.1%}</td><td>{number(f["near_ring"]["signed_lightness_difference"])}</td><td>{number(f["wide_ring"]["signed_lightness_difference"])}</td><td>{esc(f["lightness_direction_control"].replace("_"," "))}</td></tr>'
    colors=['#2d879b','#ae702b','#794ba3','#409255','#b24657']
    legend=' · '.join('<span style="border-left:12px solid '+colors[i%len(colors)]+';padding-left:6px">'+esc(f['id'])+'</span>' for i,f in enumerate(m['sparse_fields'])) or 'none retained'
    body+='</table></div><p class="muted">No aggregate importance score or focal winner is calculated. Low-detail mask legend: '+legend+'. Box-to-box intervals: '+str(len(m['intervals']))+'. Exact color distances, detail differences, field intersections and interval bounds are in the evidence ledger.</p></section>'
    questions={q['id']:q for q in QUESTIONS}
    for a in result['answers']:
        qid=a['case_id'];body+=f'<h2>{esc(qid)} · {esc(questions[qid]["text"])}</h2><p class="model-findings muted">Model state: {esc(a["state"])}. Referenced candidates: {esc(", ".join(a["candidate_ids"]) or "none")}.</p><div class="columns">'
        for part,label in [('observation','Visible observation'),('role','Proposed compositional role'),('bridge','Reasoning from relationships'),('effect','Possible experienced effect')]:
            if a[part]['assessment'] is not None:body+=component_card(qid+':'+part,label,a[part]['assessment'])
            else:body+='<article class="component"><div class="eyebrow">Possible experienced effect · abstained</div><p>'+esc(a[part]['text'])+'</p></article>'
        body+='</div><details><summary>Competing account and challenge</summary><p>'+esc(a['alternative'])+'</p><p>'+esc(a['challenge'])+'</p></details>'
        for candidate in result['candidate_accounts']:
            if candidate['question_id']!=qid:continue
            body+='<section><div class="eyebrow">Transparent candidate construction · separate model critique</div><p>This account was constructed from measured relationships by an explicit rule. It is preserved alongside the model’s free answer and does not inherit its verdict.</p><p class="muted">Selection: '+esc(candidate['selection'])+'</p><div class="columns">'
            for part,label in [('statement','Candidate organizing account'),('bridge','Measured premises and candidate bridge')]:
                body+=component_card(candidate['id']+':'+part,label,candidate[part]['assessment'])
            body+='</div><p>Alternative: '+esc(candidate['alternative'])+'</p><p>Challenge: '+esc(candidate['challenge'])+'</p></section>'
    body+=review_panel(result,output,'roles',wid,'role-reviews')
    body+='<section><h2>Evidence ledger · exact measurements and source descriptions</h2>'+evidence_ledger(m['evidence'])+'</section>'+end(result,'roles.json')
    return page(title,header,body)


def render_role_comparison(result,output):
    output=Path(output)
    header='<header><div class="eyebrow">Painting understanding · version 0.6 · aligned comparison</div><h1>Two paintings, the same questions</h1><p>Compare how emphasis and figure–ground relationships are supported in each work. Shared, different, mixed and unresolved outcomes remain possible.</p><div class="toolbar"><a href="../../index.html">Composition gallery</a><a href="#component-review">Review comparative components</a></div><label><input type="checkbox" id="hide-findings">Hide model findings while reviewing</label></header>'
    body='<div class="columns">';originals={}
    for w in result['works']:
        alias=w['alias'];originals[alias]=json.loads((output/'inputs'/(alias+'-roles.json')).read_text())
        title,_=title_for(w['work_id']);image=encoded(Image.open(output/(alias+'.png')).convert('RGB'))
        body+=f'<figure><img src="{image}" alt="Work {alias}: {esc(title)}"><figcaption>Work {alias} · {esc(title)} · <a href="../../roles/{esc(w["work_id"])}/report.html">Inspect role analysis</a></figcaption></figure>'
    body+='</div>'
    for c,q in zip(result['comparisons'],QUESTIONS):
        qid=c['case_id'];body+=f'<h2>{esc(qid)} · {esc(q["text"])}</h2><div class="columns">'
        for alias in ('A','B'):
            a=next(a for a in originals[alias]['answers'] if a['case_id']==qid)
            body+='<div><section><div class="eyebrow">Source account · work '+alias+'</div><p><b>Observation:</b> '+esc(a['observation']['text'])+'</p><p><b>Proposed role:</b> '+esc(a['role']['text'])+'</p><p class="model-findings muted">Source role disposition: '+esc(a['role']['assessment']['disposition'])+'. Independent review pending.</p></section>'
            for candidate in originals[alias]['candidate_accounts']:
                if candidate['question_id']==qid:body+='<section><div class="eyebrow">Additional transparent candidate · work '+alias+'</div><p>'+esc(candidate['statement']['text'])+'</p><p class="model-findings muted">Separate model critique: '+esc(candidate['statement']['assessment']['disposition'])+'. Inspect its measured premises in the source workspace.</p></section>'
            body+='</div>'
        body+='</div><p class="model-findings"><span class="badge">Relation: '+esc(c['relation'])+'</span></p><div class="columns">'
        body+=component_card(qid+':statement','Question-aligned comparison',c['statement']['assessment'])+component_card(qid+':bridge','Comparative reasoning bridge',c['bridge']['assessment'])+'</div>'
        body+='<details><summary>Alternative and challenge</summary><p>'+esc(c['alternative'])+'</p><p>'+esc(c['challenge'])+'</p></details>'
    control=result['duplicate_control']
    body+='<section class="model-findings"><h2>Diagnostic controls</h2><p>Changed verdicts after reversing image presentation: '+str(len(result['order_control']['changed_case_ids']))+'. Unexpected distinctions in the identical-image control: '+str(len(control['unexpected_difference_ids']))+'.</p><p>Fixed propositions and stable work identities are retained in the order check. Control outcomes do not measure interpretive accuracy.</p><details><summary>Inspect raw control outcomes, including failures</summary><pre>'+esc(json.dumps({'order':result['order_control'],'duplicate':control},indent=2))+'</pre></details></section>'
    body+=review_panel(result,output,'role-comparisons',result['pair_id'],'role-reviews')
    body+='<p class="muted">Changing an observation, role or bridge in either source role workspace flags the corresponding paired question for review on reload. Comparison judgments cannot override changed premises.</p>'
    body+='<section><h2>Paired evidence ledger</h2>'+evidence_ledger(result['evidence'])+'</section>'+end(result,'role-comparison.json')
    return page('Question-aligned comparison',header,body)


def evaluation_packet(directory,results):
    """Blank assessment preparation; no invented expert ratings."""
    packet={'version':'0.6.0','independent_review':'not_obtained','development_collection_only':True,
        'instructions':'Review image and accounts before looking at model verdicts. Rate each criterion 0, 1 or 2 and cite target IDs; record disagreements and viewing conditions. This is preparation, not a held-out experiment or artistic-quality rating.',
        'criteria':{'visual_correctness':['Consequential misdescription','Mixed accuracy','Consequential observations are checkable'],
            'particularity':['Fits many unrelated works','Some localized detail','Distinguishes nearby alternatives'],
            'relationships':['Isolated features','Some connections','Consequential configuration explained'],
            'evidence_fit':['Claims exceed evidence','Some unsupported extensions','Strength matches evidence']},
        'items':[{'work_id':r['work_id'],'artifact_sha256':sha(directory/'roles'/r['work_id']/'roles.json'),'ratings':None,'reviewer':None,'viewing_conditions':None,'target_ids':None,'notes':None} for r in results]}
    dump(directory/'evaluation-worksheet.json',packet)
