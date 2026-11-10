"""Self-contained review UI embedded in a portable report."""
import html
import json
from pathlib import Path


def review_section(analysis, image_url):
    from .review import targets
    entities = [{"entity_id": eid, "kind": kind, **item} for eid,(kind,item) in targets(analysis).items()]
    if not entities:
        return '<section id="review-panel"><h2>Reviewer workspace</h2><p>No semantic regions or configuration claims were proposed at this scale. Measurements remain read-only.</p></section>'
    options = ''.join(f'<option value="{html.escape(e["entity_id"], quote=True)}">{html.escape(e["entity_id"]+" · "+e.get("label", e.get("statement", ""))[:85])}</option>' for e in entities)
    whole = next(r["bbox_normalized"] for r in analysis["regions"] if r["id"] == "whole")
    data = json.dumps({"work_id": analysis["artwork"]["id"], "entities": entities, "bounds": whole}, ensure_ascii=False).replace("<", "\\u003c").replace("&", "\\u0026")
    script = (Path(__file__).with_name("review_ui.js")).read_text()
    return '''<section id="review-panel"><div class="eyebrow">Reviewer workspace · original output preserved</div><h2>Inspect and correct</h2>
<p>Correct subject boxes, descriptions or configuration explanations. Saving creates a new local revision. Changes to evidence flag dependent interpretations for review; image measurements and masks are not recomputed. The report outside this workspace shows the original engine output.</p>
<p id="review-message" role="status">Connecting to the local review server…</p>
<div class="review-columns"><div><label>Entity<select id="review-entity">'''+options+'''</select></label>
<label>Status<select id="review-status"><option value="unreviewed">Unreviewed</option><option value="accepted">Accepted by this reviewer</option><option value="revised">Revised by this reviewer</option><option value="rejected">Rejected by this reviewer</option></select></label>
<label id="review-text-label">Description or label<textarea id="review-text" rows="5"></textarea></label>
<div id="review-box-fields"><p>Source-normalized box: draw a replacement rectangle on the image, or enter bounds.</p><div class="review-box-inputs">'''+''.join(f'<label>{n}<input type="number" min="0" max="1" step="0.001" id="review-{n}" aria-label="Box {n}"></label>' for n in ("x0","y0","x1","y1"))+'''</div></div>
<div id="review-reading-fields"><label>Alternative reading<textarea id="review-alternative" rows="2"></textarea></label><label>Evidence that could challenge this<textarea id="review-challenge" rows="2"></textarea></label></div>
<label>Review note<textarea id="review-note" rows="2" placeholder="Reason for this decision"></textarea></label>
<div class="review-columns"><label>Reviewer name<input id="review-name" maxlength="200" placeholder="Your name"></label><label>Reviewer type<select id="review-type"><option value="human">Human</option><option value="assistant">Assistant</option><option value="automated_test">Automated test</option></select></label></div>
<p><button id="review-save" disabled>Save selected correction</button> <button id="review-reset" disabled>Restore original for selected entity</button> <button id="review-export">Export working JSON</button></p>
</div><div><div class="review-canvas"><img src="'''+image_url+'''" alt="Analyzed painting for source box correction"><svg id="review-svg" viewBox="0 0 1 1" preserveAspectRatio="none" aria-label="Draw replacement subject box"><rect id="review-rect" fill="#ffce5540" stroke="#fff1a8" stroke-width=".005"/></svg></div>
<p class="muted">Geometry editing is limited to model regions. A corrected box makes its original crop description stale. Formal masks remain measured, read-only evidence.</p><h3>Working review state</h3><div id="review-working"></div></div></div>
<style>.review-columns{display:grid;grid-template-columns:1fr 1fr;gap:20px}.review-columns label{display:block;margin-bottom:12px;font-size:13px}#review-panel input,#review-panel select,#review-panel textarea{display:block;width:100%;font:inherit;border:1px solid #bccbc0;border-radius:4px;background:#fffefa;color:#17342e;padding:9px;margin-top:5px}#review-panel button{margin:4px 0;background:#17342e;color:#fff}#review-panel button:disabled{opacity:.4;cursor:default}.review-box-inputs{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.review-canvas{position:relative;line-height:0;background:#e6e5dc}.review-canvas img{width:100%;display:block}.review-canvas svg{position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:crosshair}.review-badge{display:block;color:#923b20;font:12px/1.5 system-ui;margin:8px 0}#review-message{padding:10px;background:#e5eee6;overflow-wrap:anywhere}#review-working{font-size:13px;overflow-wrap:anywhere}#review-working article{border-top:1px solid #d7ded5;padding:10px 0}@media(max-width:850px){.review-columns{grid-template-columns:1fr}}</style>
<script type="application/json" id="review-data">'''+data+'''</script><script>'''+script+'''</script></section>'''
