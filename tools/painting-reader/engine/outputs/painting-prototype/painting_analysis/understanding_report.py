"""Portable v0.5 reports and blank worksheets for independent component review."""
import csv
import html
import json
from pathlib import Path

from PIL import Image
from .reasoning import ROOT,sha,dump
from .reporting import encoded
from .assessment_review import review_targets

esc=lambda value:html.escape(str(value),quote=True)

STYLE='''
:root{--ink:#17342e;--paper:#f5f2e9;--line:#d7ded5;--muted:#5d6b64;--accent:#a65c35}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.6 system-ui}main{max-width:1400px;margin:auto;padding:32px}h1{font:clamp(30px,4vw,46px)/1.2 Georgia,serif;margin:12px 0}h2{font:27px Georgia,serif}h3{font:21px Georgia,serif;margin-top:0}header{max-width:1000px}a{color:var(--accent)}small,.muted{color:var(--muted)}.eyebrow{text-transform:uppercase;letter-spacing:.12em;font-size:11px;font-weight:700}.toolbar{display:flex;flex-wrap:wrap;gap:14px;margin:20px 0}.columns{display:grid;grid-template-columns:1fr 1fr;gap:18px;align-items:start}.component,section{padding:22px;border:1px solid var(--line);border-radius:6px;background:#fffdf7;margin:0 0 18px}.component.withheld{border-left:5px solid #a34b38}.component.qualified{border-left:5px solid #bc8c36}.proposition{font:21px/1.5 Georgia,serif}.badge{display:inline-block;background:#e5eee6;border-radius:4px;padding:4px 9px;font-size:12px}.alert,.reviewer-state{background:#f9e8dc;color:#873e27;padding:10px;font-size:13px}button{font:inherit;font-size:13px;border:1px solid #b8c8bc;border-radius:18px;padding:8px 13px;background:#fffdf7;color:var(--ink);cursor:pointer}button:disabled{opacity:.45;cursor:default}label{display:block;font-size:13px;margin:12px 0}select,input,textarea{display:block;width:100%;font:inherit;padding:10px;margin-top:5px;border:1px solid #bdcbc0;border-radius:4px;background:#fffefa;color:var(--ink)}input[type=checkbox]{display:inline-block;width:auto;margin-right:8px}figure{margin:0 0 20px;background:#e6e5dc;padding:14px;text-align:center}figure img{max-width:100%;max-height:65vh;object-fit:contain}figcaption{font-size:13px;color:var(--muted)}details{border-top:1px solid var(--line);padding:12px 0}summary{cursor:pointer}.table-wrap{overflow:auto}table{border-collapse:collapse;width:100%;font-size:13px}td,th{padding:10px;text-align:left;vertical-align:top;border-bottom:1px solid var(--line)}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}.hide-findings .model-findings{display:none!important}.message{padding:12px;background:#e5eee6;overflow-wrap:anywhere}.gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:20px}.card{color:inherit;text-decoration:none;background:#fffdf7;border:1px solid var(--line);border-radius:6px;overflow:hidden}.card img{width:100%;height:210px;object-fit:contain;padding:12px;background:#e6e5dc}.card div{padding:18px}[hidden]{display:none!important}@media(max-width:850px){main{padding:20px}.columns{grid-template-columns:1fr}}
'''


def title_for(work_id):
    try:
        w=next(w for w in json.loads((ROOT/"data/pilot-manifest.json").read_text())["works"] if w["id"]==work_id)
        return w["title"],w.get("artist") or "Museum attribution available in source record"
    except (OSError,StopIteration):return work_id,"Identity not supplied"


def judgment_html(judgment,label):
    if judgment is None:return ''
    return f'<p><b>{esc(label)}:</b> {esc(judgment["status"].replace("_"," "))}. {esc(judgment["reason"])}</p><p class="muted">Needed: {esc(judgment["missing_evidence"])}</p>'


def component_card(target_id,label,component):
    links=' · '.join(f'<a href="#evidence-{esc(eid)}">{esc(eid)}</a>' for eid in component["evidence_ids"])
    flags='<p class="alert">'+esc(' '.join(component["deterministic_flags"]))+'</p>' if component["deterministic_flags"] else ''
    return (f'<article class="component {esc(component["disposition"])}" id="component-{esc(target_id)}"><div class="eyebrow">{esc(label)} · {esc(target_id)}</div><p class="proposition">{esc(component["text"])}</p>'
        +f'<div class="model-findings"><span class="badge">{esc(component["effective_status"].replace("_"," "))} · {esc(component["disposition"])} · model check</span>{flags}<details><summary>Inspect separate assessments</summary>'
        +judgment_html(component["evidence_assessment"],"Support from supplied facts")+judgment_html(component["visual_assessment"],"Visible basis in the image")
        +f'<p class="muted">{esc(component["scope"])}</p></details></div><p class="muted">Citations: {links}</p><button data-component="{esc(target_id)}">Review this component</button></article>')


def review_panel(result,output,kind,identity,endpoint='assessment-reviews'):
    targets,_=review_targets(result)
    filename={'audits':'audit.json','comparisons':'comparison.json','roles':'roles.json','role-comparisons':'role-comparison.json','arguments':'synthesis.json','pairs':'synthesis-pair.json'}[kind]
    binding=sha(Path(output)/filename)
    data=json.dumps({"kind":kind,"identity":identity,"artifact_sha256":binding,"targets":targets,"endpoint":endpoint},ensure_ascii=False).replace('<','\\u003c').replace('&','\\u0026')
    options=''.join(f'<option value="{esc(eid)}">{esc(eid)} · {esc(text[:95])}</option>' for eid,text in targets.items())
    # Blank judgments do not copy model statuses into human annotation fields.
    worksheet={"version":result.get('version','0.5.0'),"artifact_kind":result["artifact_kind"],"artifact_sha256":binding,
        "independent_review":"not_obtained","instructions":"Assess each target independently. Model status is deliberately omitted. Record expertise/conditions separately if relevant; acceptance is not a calibrated probability.",
        "items":[{"target_id":eid,"text":text,"decision":None,"corrected_text":None,"evidence_needed":None,"note":None} for eid,text in targets.items()]}
    dump(Path(output)/"review-worksheet.json",worksheet)
    with (Path(output)/"review-worksheet.csv").open("w",newline="") as file:
        writer=csv.writer(file);writer.writerow(["artifact_sha256","target_id","text","decision","corrected_text","evidence_needed","note"])
        for eid,text in targets.items():writer.writerow([binding,eid,("'"+text if text.lstrip().startswith(('=','+','-','@')) else text),"","","",""])
    script=Path(__file__).with_name("understanding_ui.js").read_text()
    return '''<section id="component-review"><div class="eyebrow">Attributed reviewer decisions · original preserved</div><h2>Review a statement or its explanation</h2><p id="component-message" class="message" role="status">Connecting to the local review service…</p><label>Component<select id="component-target">'''+options+'''</select></label><label>Decision<select id="component-decision"><option value="">Choose a decision</option><option value="accepted">Accepted by this reviewer</option><option value="revised">Revised by this reviewer</option><option value="rejected">Rejected by this reviewer</option></select></label><label>Text<textarea id="component-text" rows="4"></textarea></label><label>Reason or note<textarea id="component-note" rows="2"></textarea></label><div class="columns"><label>Reviewer name<input id="component-name" maxlength="200"></label><label>Reviewer type<select id="component-type"><option value="human">Human</option><option value="assistant">Assistant</option><option value="automated_test">Automated test</option></select></label></div><button id="component-save" disabled>Save component judgment</button> <button id="component-reset" disabled>Remove selected judgment</button> <button id="component-export">Export reviewer overlay</button><p class="muted">Changing or rejecting a statement flags its dependent reasoning. A revised/rejected side observation flags the comparative relation and bridge. Human decisions remain separate from model checks; no expertise or accuracy is inferred from acceptance.</p><p><a href="review-worksheet.csv" download>Blank review worksheet · CSV</a> · <a href="review-worksheet.json" download>Blank worksheet · JSON</a></p><p class="muted">Model findings are omitted from the blank judgment fields. Independent expert review has not yet been obtained. Saved overlays do not silently regenerate this immutable analysis.</p></section><script type="application/json" id="component-data">'''+data+'''</script><script>'''+script+'''</script>'''


def ledger(items):
    return ''.join(f'<details id="evidence-{esc(e["id"])}"><summary>{esc(e["id"])} · {esc(e["kind"].replace("_"," "))}</summary><p>{esc(e["statement"])}</p><p class="muted">{esc(e["status"])} · {esc("; ".join(e.get("limitations",[])))}</p></details>' for e in items)


def page(title,header,body):
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(title)+' · Painting understanding</title><style>'+STYLE+'</style></head><body><main>'+header+body+'</main></body></html>'


def render_audit(result,output):
    title,artist=title_for(result["work_id"])
    image=encoded(Image.open(Path(output)/"image.png").convert("RGB"))
    body=f'<figure><img src="{image}" alt="Analyzed reproduction: {esc(title)}"><figcaption>Source reproduction preserved from the version 0.4 analysis.</figcaption></figure>'
    for clause in result["clauses"]:
        cid=clause["id"]
        body+=f'<h2>{esc(cid)} · statement and bridge</h2><p class="model-findings muted">Earlier combined status: {esc(clause["legacy_status"])}. Audit signals: {esc(", ".join(clause["failure_categories"]) or "none identified by these checks")}. Recommendation: {esc(clause["recommendation"].replace("_"," "))}.</p><div class="columns">'
        body+=component_card(cid+":statement","Statement",clause["statement"])+component_card(cid+":bridge","Original reasoning bridge",clause["bridge"])+"</div>"
        proposal=clause["bridge_proposal"]
        if proposal:
            body+='<details class="model-findings"><summary>Separate replacement bridge or abstention</summary>'
            if proposal["assessment"]:body+=component_card(cid+":proposal","New model proposal; original retained",proposal["assessment"])
            else:body+=f'<p>{esc(proposal["status"])} · {esc(proposal["raw"]["reason"])}</p>'
            body+=f'<p class="muted">Challenge: {esc(proposal["raw"]["challenge"])}</p></details>'
        body+=f'<details><summary>Alternative reading and challenge</summary><p>{esc(clause["alternative"])}</p><p>{esc(clause["challenge"])}</p></details>'
    body+=review_panel(result,output,"audits",result["work_id"])
    body+='<section><h2>Evidence ledger</h2>'+ledger(result["evidence"])+f'</section><section><h2>Limits</h2><ul>'+''.join('<li>'+esc(x)+'</li>' for x in result["limits"])+f'</ul><p><a href="audit.json">Machine-readable audit</a> · <a href="inference-audit.json">Native model requests and responses</a></p></section>'
    header=f'<header><div class="eyebrow">Painting understanding · version 0.5 · independent review pending</div><h1>{esc(title)}</h1><p>{esc(artist)}</p><p>Assess the statement and its reasoning bridge separately. A model-supported observation can remain available for review while an unsupported bridge is withheld. Neither assessment establishes expert agreement.</p><div class="toolbar"><a href="../../index.html">Audit and comparison gallery</a><a href="#component-review">Review components</a><a href="/reasoning/{esc(result["work_id"])}/report.html">Preserved version 0.4 report</a></div><label><input type="checkbox" id="hide-findings">Hide model findings while reviewing</label></header>'
    return page(title,header,body)


def render_comparison(result,output):
    names={w["alias"]:title_for(w["work_id"])[0] for w in result["works"]}
    figures=[]
    for w in result["works"]:
        image=encoded(Image.open(Path(output)/w["image_file"]).convert("RGB"));trim=encoded(Image.open(Path(output)/w["trim_file"]).convert("RGB"))
        figures.append(f'<div><figure><img src="{image}" alt="Work {w["alias"]}: {esc(names[w["alias"]])}"><figcaption>Work {w["alias"]} · {esc(names[w["alias"]])}</figcaption></figure><details><summary>Inspect the fixed frame-trim control</summary><figure><img src="{trim}" alt="Ten-percent margin trim of work {w["alias"]}"><figcaption>10% removed from each edge; this is not an authenticated painting boundary.</figcaption></figure></details></div>')
    body='<div class="columns">'+''.join(figures)+'</div><section><h2>Why this pair?</h2><p>'+esc(result["selection_rationale"])+'</p></section>'
    for c in result["comparisons"]:
        cid=c["id"]
        body+=f'<h2>{esc(cid)} · {esc(c["relation"])} · {esc(c["feature"])}</h2><div class="columns">'+component_card(cid+":left","Observation about work A",c["left"]["assessment"])+component_card(cid+":right","Observation about work B",c["right"]["assessment"])+"</div>"
        body+='<div class="columns">'+component_card(cid+":relation","Proposed comparison · this pair only",c["relation_assessment"])+component_card(cid+":bridge","Comparative reasoning bridge",c["bridge_assessment"])+"</div>"
        body+=f'<details><summary>Alternative and challenge</summary><p>{esc(c["alternative"])}</p><p>{esc(c["challenge"])}</p></details>'
    fmt=lambda v:'not available' if v is None else f'{v:.4f}'
    rows=''.join(f'<tr><td>{esc(r["label"])}<br><small>{esc(r["unit"])}</small></td><td>{fmt(r["left"])}</td><td>{fmt(r["right"])}</td><td>{fmt(r["delta_left_minus_right"])}</td><td>{fmt(r["trim_delta_left_minus_right"])}</td><td>{esc(r["framing_sensitivity"].replace("_"," "))}</td></tr>' for r in result["measurement_differences"])
    body+='<section><h2>Measured differences and frame sensitivity</h2><p>These descriptors belong to the analyzed reproductions. Positive differences mean A minus B. The control trims 10% from each edge of both images without enlarging them. Agreement in sign tests only this one framing change.</p><div class="table-wrap"><table><thead><tr><th>Descriptor</th><th>A</th><th>B</th><th>A − B</th><th>Trimmed A − B</th><th>Control result</th></tr></thead><tbody>'+rows+'</tbody></table></div><p class="muted">Model comparisons use the full analyzed images; trimmed descriptors are a separate deterministic control, not a second model interpretation.</p></section>'
    changes=''.join(f'<tr><td>{esc(x["case_id"])}</td><td>{esc(x["original_status"])}</td><td>{esc(x["reversed_status"])}</td></tr>' for x in result["order_control"]["changed_judgments"])
    body+='<section class="model-findings"><h2>Order and duplicate-image controls</h2><p>Changed verdicts after reversing image presentation: <b>'+str(len(result["order_control"]["changed_judgments"]))+'</b>. Work identities and propositions remain fixed.</p><div class="table-wrap"><table><thead><tr><th>Component</th><th>Original order</th><th>Reversed order</th></tr></thead><tbody>'+changes+'</tbody></table></div><p class="muted">'+esc(result["order_control"]["limits"])+'</p><p>Unexpected differences in the identical-image control: <b>'+str(len(result["same_image_control"]["unexpected_difference_ids"]))+'</b>.</p><details><summary>Inspect raw identical-image control claims</summary><pre>'+esc(json.dumps(result["same_image_control"]["raw_comparisons"],indent=2,ensure_ascii=False))+'</pre></details><p class="muted">'+esc(result["same_image_control"]["limits"])+'</p></section>'
    body+=review_panel(result,output,"comparisons",result["pair_id"])
    body+='<section><h2>Evidence from work A</h2>'+ledger(result["evidence"]["A"])+'</section><section><h2>Evidence from work B</h2>'+ledger(result["evidence"]["B"])+'</section><section><h2>Scope and limits</h2><ul>'+''.join('<li>'+esc(x)+'</li>' for x in result["limits"])+f'</ul><p><a href="comparison.json">Comparison data</a> · <a href="inference-audit.json">Native model audit</a></p></section>'
    header='<header><div class="eyebrow">Painting understanding · version 0.5 · two-work prototype</div><h1>What these works share, and where they differ</h1><p>Each proposed distinction cites both works. Observations, comparisons and reasoning bridges receive separate judgments. These findings do not establish uniqueness, superiority or general properties of an artist or tradition.</p><div class="toolbar"><a href="../../index.html">Audit and comparison gallery</a><a href="#component-review">Review comparative components</a></div><label><input type="checkbox" id="hide-findings">Hide model findings while reviewing</label></header>'
    return page('Two-painting comparison',header,body)
