"""Portable HTML report, with embedded images and no external requests."""
from __future__ import annotations

import base64
import html
import io
import math

import numpy as np
from PIL import Image, ImageDraw


def encoded(image, format="PNG"):
    buffer = io.BytesIO()
    image.save(buffer, format=format)
    return "data:image/" + format.lower() + ";base64," + base64.b64encode(buffer.getvalue()).decode()


def views(image, measurements, arrays, source_image=None, semantic=None):
    gray = Image.fromarray(np.uint8(np.clip(arrays["lab"][..., 0] / 100, 0, 1) * 255)).convert("RGB")
    swatches = np.array([p["rgb"] for p in measurements["palette"]], dtype=np.uint8)
    quantized = Image.fromarray(swatches[arrays["labels"]])
    overlay = image.copy()
    draw = ImageDraw.Draw(overlay)
    w, h = image.size
    for cell in measurements["cells"]:
        x0, y0, x1, y1 = cell["bbox"]
        bounds = (round(x0 * w), round(y0 * h), min(w - 1, round(x1 * w)), min(h - 1, round(y1 * h)))
        draw.rectangle(bounds, outline="#ffeb94", width=1)
        label = cell["id"].removeprefix("cell-")
        draw.rectangle((bounds[0] + 2, bounds[1] + 2, bounds[0] + 32, bounds[1] + 19), fill="#152824")
        draw.text((bounds[0] + 5, bounds[1] + 4), label, fill="white")
    directions = image.copy()
    draw = ImageDraw.Draw(directions)
    step = max(16, round(min(w, h) / 12))
    for y in range(step // 2, h, step):
        for x in range(step // 2, w, step):
            y0, y1 = max(0, y - step // 2), min(h, y + step // 2)
            x0, x1 = max(0, x - step // 2), min(w, x + step // 2)
            weights = arrays["magnitude"][y0:y1, x0:x1] * arrays["strong_edges"][y0:y1, x0:x1]
            angles = arrays["tangent"][y0:y1, x0:x1]
            if weights.sum() <= 1e-8:
                continue
            z = np.sum(weights * np.exp(2j * angles)) / weights.sum()
            if abs(z) < 0.25:
                continue
            angle = np.angle(z) / 2
            length = step * 0.4 * abs(z)
            dx, dy = math.cos(angle) * length, math.sin(angle) * length
            line = (round(x - dx), round(y - dy), round(x + dx), round(y + dy))
            draw.line(line, fill="#162421", width=4)
            draw.line(line, fill="#ffe69a", width=2)
    result = {"Analyzed frame": image, "Grid": overlay, "Value": gray,
              "Color families": quantized, "Directions": directions}
    if source_image is not None:
        result["Full source"] = source_image
    if semantic:
        proposal = image.copy()
        draw = ImageDraw.Draw(proposal)
        colors = ["#ffed99", "#94f0d0", "#ffa7a7", "#b2baff", "#eeafff", "#a4d8ff"]
        for index, region in enumerate(semantic["regions"]):
            x0, y0, x1, y1 = region["bbox_1000"]
            box = [round(x0 / 1000 * w), round(y0 / 1000 * h),
                   min(w - 1, round(x1 / 1000 * w)), min(h - 1, round(y1 / 1000 * h))]
            color = colors[index % len(colors)]
            draw.rectangle(box, outline=color, width=2)
            label = region["id"] + " " + region["label"][:30]
            text_box = draw.textbbox((0, 0), label)
            width = text_box[2] + 8
            x = max(0, min(box[0], w - width))
            y = max(0, box[1] - 17)
            draw.rectangle((x, y, x + width, y + 17), fill="#152824")
            draw.text((x + 4, y + 2), label, fill=color)
        result = {"Model regions": proposal, **result}
    return result


def render(analysis, measurements, provenance, images, reference=None, formal=None):
    esc = lambda value: html.escape(str(value), quote=True)
    title = analysis["artwork"]["title"] or "Unidentified painting image"
    artist = analysis["artwork"]["artist"] or "Identity not supplied"
    is_semantic = any(c["id"].startswith("SO-") for c in analysis["claims"])
    stage_label = "Local semantic prototype 0.2 · proposals unreviewed" if is_semantic else "Measurement baseline 0.1"
    summary_text = analysis["synthesis"]["summary"]
    if formal is not None:
        stage_label = "Formal configurations 0.3 · explanations unreviewed"
        summary_text = (f'{len(formal["fields"])} connected fields and {len(formal["principal_configuration_ids"])} principal hypotheses connect value, color, spatial axes and detail distribution to available subject descriptions. '
                        'Inspect the proposed interactions, their evidence, alternatives and challenges below. All explanations remain unreviewed.')
    withheld = provenance.get("semantic", {}).get("withheld_clauses", [])
    audit_note = f'<p class="muted">{len(withheld)} inferred-effect sentence(s) were withheld from literal descriptions and retained in the generation audit.</p>' if withheld else ""
    image_tabs = []
    for i, (label, image) in enumerate(images.items()):
        image_tabs.append(f'<figure id="view-{i}" class="image-view" {"" if i == 0 else "hidden"}>'
                          f'<img src="{encoded(image)}" alt="{esc(label)} view of the supplied reproduction">'
                          f'<figcaption>{esc(label)}</figcaption></figure>')
    buttons = "".join(f'<button type="button" data-view="view-{i}" aria-pressed="{"true" if i == 0 else "false"}">{esc(label)}</button>'
                      for i, label in enumerate(images))
    claims = {c["id"]: c for c in analysis["claims"] + analysis["artwork"]["reported_metadata"]}
    relation_cards = []
    for relation in sorted(analysis["relationships"], key=lambda r: 0 if r["id"].startswith("SR-") else 1):
        observations = "".join(f'<li><a href="#{esc(cid)}">{esc(cid)}</a>: {esc(claims[cid]["statement"])}</li>'
                               for cid in relation["subject_claim_ids"])
        interpretations = " ".join(claims[cid]["statement"] for cid in relation["object_claim_ids"])
        review_notes = []
        for cid in relation["object_claim_ids"]:
            review_notes.extend(e for e in claims[cid]["missing_evidence"] if e.startswith("Documentary"))
        review_html = '<p class="muted"><b>Review needed:</b> ' + esc(" ".join(review_notes)) + '</p>' if review_notes else ""
        origin = "model interpretation · unreviewed" if relation["id"].startswith("SR-") else "formal hypothesis"
        relation_cards.append(f'<article class="relationship" id="{esc(relation["id"])}">'
                              f'<div class="eyebrow">{esc(relation["id"])} · {origin}</div>'
                              f'<p>{esc(interpretations)}</p><details><summary>Inspect supporting observations</summary><ul>{observations}</ul></details>'
                              f'<p class="muted">{esc(relation["scope_and_alternatives"])}</p>{review_html}</article>')
    claim_rows = []
    for item in claims.values():
        evidence_rows = []
        for entry in item["evidence"]:
            evidence_rows.append(f'<li>{esc(entry["locator"] or entry["region_id"] or "Whole image")} · {esc(entry["support_note"])}'
                                 f'{"<br>" + esc(entry["method"]) if entry["method"] else ""}</li>')
        claim_rows.append(f'<details id="{esc(item["id"])}"><summary><span class="tag">{esc(item["id"])}</span> '
                          f'{esc(item["statement"])}</summary><p class="muted">{esc(item["kind"])} · {esc(item["scope"])}</p>'
                          f'<ul>{"".join(evidence_rows)}</ul></details>')
    palette = "".join(f'<div class="swatch"><span style="background:{p["hex"]}"></span><b>{esc(p["hex"])}</b>'
                      f'<small>{p["share"]:.1%} · centroid {p["centroid"][0]:.2f}, {p["centroid"][1]:.2f}</small></div>'
                      for p in measurements["palette"])
    questions = "".join(f'<li>{esc(q["question"])}</li>' for q in analysis["open_questions"])
    sources = "".join(f'<li><a href="{esc(s["url"])}" target="_blank" rel="noopener">{esc(s["title"])}</a> · {esc(s["creator"])}</li>'
                      for s in analysis["sources"])
    reference_html = ""
    semantic_html = ""
    formal_html = ""
    review_html = ""
    if formal is not None:
        from .review_ui import review_section
        cards, supporting_cards = [], []
        for config in formal["configurations"]:
            supports = " · ".join(f'<a href="#{esc(cid)}">{esc(cid)}</a>' for cid in config["supporting_claim_ids"])
            (cards if config["hierarchy"] == "principal" else supporting_cards).append(f'<article class="relationship" id="{esc(config["claim_id"])}-configuration">'
                f'<div class="eyebrow">{esc(config["hierarchy"])} · {esc(config["id"])} · {esc(config["kind"].replace("_", " "))}</div>'
                f'<p>{esc(config["explanation"])}</p><p><b>Alternative:</b> {esc(config["alternative"])}</p>'
                f'<p class="muted"><b>Challenge:</b> {esc(config["challenge"])}</p><p class="muted">Evidence: {supports}</p></article>')
        formal_html = '<h2>How the parts work together</h2><p class="muted">Up to three principal hypotheses, followed by supporting configurations. Inspection order reflects affected area and distinct mechanisms; it is not a ranking of artistic significance.</p>' + (''.join(cards) or '<section>No supported configurations at this scale. The engine does not force a reading.</section>')
        for interaction in formal.get("interactions", []):
            formal_html += f'<article class="relationship" id="{esc(interaction["claim_id"])}-configuration"><div class="eyebrow">Joint reading · shared structures</div><p>{esc(interaction["explanation"])}</p><p><b>Alternative:</b> {esc(interaction["alternative"])}</p><p class="muted"><b>Challenge:</b> {esc(interaction["challenge"])}</p></article>'
        if supporting_cards:
            formal_html += '<details><summary>Supporting configurations</summary>'+''.join(supporting_cards)+'</details>'
        review_html = review_section(analysis, encoded(images["Analyzed frame"]))
    if is_semantic:
        descriptions = []
        for c in analysis["claims"]:
            if not c["id"].startswith("SO-"):
                continue
            notes = " ".join(e for e in c["missing_evidence"] if e.startswith("Material"))
            note_html = '<br><small><b>Review:</b> ' + esc(notes) + '</small>' if notes else ""
            descriptions.append(f'<li><a href="#{esc(c["id"])}">{esc(c["id"])}</a>: {esc(c["statement"])}{note_html}</li>')
        descriptions = "".join(descriptions)
        semantic_html = f'<section><h2>What the model describes</h2><p class="muted">Approximate boxes and visual descriptions were predicted locally. Inspect the Model regions view; these proposals require review.</p><ul>{descriptions}</ul></section>'
    if reference:
        entries = "".join(f'<li><b>{esc(c["kind"])}</b>: {esc(c["statement"])}</li>' for c in reference["claims"])
        reference_html = f'<section><h2>Development reference</h2><p class="muted">{esc(reference["reviewer"])}. {esc(reference["review_status"])} Reference prose is withheld from model input.</p><ul>{entries}</ul></section>'
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(title)} · Painting analysis</title><style>
:root{{--ink:#17342e;--paper:#f5f2e9;--muted:#5d6b64;--line:#d7ded5;--accent:#ac5d35}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--paper);color:var(--ink);font:16px/1.6 system-ui,sans-serif}}
main{{max-width:1320px;margin:auto;padding:36px}}h1{{font:clamp(28px,4vw,46px)/1.15 Georgia,serif;margin:8px 0}}h2{{font:26px Georgia,serif;margin-top:0}}
a{{color:var(--accent)}}.eyebrow{{text-transform:uppercase;letter-spacing:.12em;font-size:11px;font-weight:700}}.muted,small{{color:var(--muted)}}
.intro{{max-width:840px}}.layout{{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(300px,1fr);gap:28px;margin-top:28px;align-items:start}}
.visual{{position:sticky;top:20px}}.image-view{{margin:0;background:#e6e5dc;padding:14px;text-align:center}}.image-view img{{max-width:100%;max-height:70vh;object-fit:contain}}figcaption{{font-size:12px;color:var(--muted)}}
nav{{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}}button{{font:inherit;font-size:12px;background:transparent;border:1px solid var(--line);border-radius:20px;padding:7px 13px;cursor:pointer}}button[aria-pressed=true]{{background:var(--ink);color:white}}
.relationship,section{{background:#fffdf7;border:1px solid var(--line);padding:22px;margin:0 0 16px;border-radius:6px}}.relationship p:first-of-type{{font:20px/1.5 Georgia,serif}}.relationship .muted{{font-size:13px}}
.palette{{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:18px}}.swatch span{{height:36px;display:block;border-radius:3px;border:1px solid #ccc}}.swatch b,.swatch small{{display:block;font-size:11px}}
details{{border-top:1px solid var(--line);padding:12px 0}}summary{{cursor:pointer}}.tag{{font-size:11px;background:#e5eee6;border-radius:4px;padding:3px 6px;white-space:nowrap}}.bottom{{margin-top:28px}}pre{{font-size:11px;white-space:pre-wrap;overflow-wrap:anywhere}}
@media(max-width:850px){{main{{padding:20px}}.layout{{grid-template-columns:1fr}}.visual{{position:static}}}}[hidden]{{display:none!important}}
</style></head><body><main>
<header class="intro"><div class="eyebrow">Painting analysis · {esc(stage_label)}</div><h1>{esc(title)}</h1>
<p>{esc(artist)}</p><p>{esc(summary_text)}</p>{audit_note}{'<p><a href="#review-panel">Review this work</a> · <a href="formal.json">Inspect formal data</a> · <a href="../index.html">All works</a></p>' if formal is not None else ''}</header>
<div class="layout"><div class="visual"><nav aria-label="Image views">{buttons}</nav>{"".join(image_tabs)}
<div class="palette">{palette}</div><p class="muted"><small>Color families can be disconnected. Centroids are not focal points. Direction marks show local edge tangents, not eye movements.</small></p></div>
<div>{formal_html}{semantic_html}<details><summary>Earlier relationship proposals</summary>{"".join(relation_cards) or '<section>No supported formal configuration crossed the baseline thresholds.</section>'}</details></div></div>
<div class="bottom">{review_html}<section><h2>Evidence ledger</h2>{"".join(claim_rows)}</section>{reference_html}
<section><h2>Open questions</h2><ul>{questions}</ul><p class="muted">{esc(analysis["synthesis"]["scope_and_limits"])}</p></section>
<section><h2>Source and capture</h2><ul>{sources or '<li>No catalog context supplied.</li>'}</ul><pre>{esc(__import__('json').dumps(provenance,indent=2))}</pre></section></div>
</main><script>document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{{document.querySelectorAll('.image-view').forEach(view=>view.hidden=view.id!==button.dataset.view);document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));}}));</script></body></html>'''
