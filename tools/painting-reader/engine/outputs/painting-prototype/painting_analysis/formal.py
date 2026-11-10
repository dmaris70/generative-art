"""Spatial fields and explicit, reviewable configuration hypotheses (no learned detector)."""
from __future__ import annotations

import copy
import math
import numpy as np
from PIL import Image, ImageDraw

from .evidence import confidence

VERSION = "formal-fields-0.3.0"


def components(mask):
    """Four-neighbour connected sets; diagonal contact alone does not join fields."""
    unseen = set(map(tuple, np.argwhere(mask)))
    while unseen:
        seed = min(unseen)
        unseen.remove(seed)
        stack, cells = [seed], []
        while stack:
            y, x = stack.pop()
            cells.append([int(x), int(y)])
            for point in ((y-1, x), (y+1, x), (y, x-1), (y, x+1)):
                if point in unseen:
                    unseen.remove(point)
                    stack.append(point)
        yield sorted(cells, key=lambda c: (c[1], c[0]))


def extract_fields(image, arrays, measurements, provenance):
    width, height = image.size
    nx = min(width, max(8, round(32 * width / max(width, height))))
    ny = min(height, max(8, round(32 * height / max(width, height))))
    xs = np.linspace(0, width, nx+1).astype(int)
    ys = np.linspace(0, height, ny+1).astype(int)
    light, edges, energy, labels = (np.zeros((ny, nx)) for _ in range(4))
    weights = np.zeros((ny, nx))
    for y in range(ny):
        for x in range(nx):
            sl = np.s_[ys[y]:ys[y+1], xs[x]:xs[x+1]]
            light[y, x] = arrays["lab"][sl][..., 0].mean()
            edges[y, x] = arrays["strong_edges"][sl].mean()
            energy[y, x] = arrays["magnitude"][sl].mean()
            labels[y, x] = np.bincount(arrays["labels"][sl].ravel()).argmax()
            weights[y, x] = (xs[x+1]-xs[x]) * (ys[y+1]-ys[y]) / (width*height)
    lo, hi = np.quantile(light, [.35, .65])
    if hi-lo < 8:
        lo, hi = np.quantile(light, [.10, .90])
    masks = []
    thresholds = {"dark_max_L": float(lo) if hi-lo >= 8 else None, "light_min_L": float(hi) if hi-lo >= 8 else None,
                  "sparse_max_edge_density": None, "sparse_max_gradient_energy": None}
    if hi-lo >= 8:
        masks += [("dark", "Darker value mass", light <= lo, None),
                  ("light", "Lighter value mass", light >= hi, None)]
    # A monochrome field has no contrast-based sparse interval to report.
    if float(energy.max()-energy.min()) > .005:
        threshold = min(float(np.quantile(edges, .35)), max(.015, float(np.median(edges))*.6))
        thresholds.update(sparse_max_edge_density=threshold, sparse_max_gradient_energy=float(np.quantile(energy, .45)))
        masks += [("sparse", "Sparse-detail field", (edges <= threshold) &
                   (energy <= np.quantile(energy, .45)), None)]
    if len(measurements["palette"]) > 1:
        for i, palette in enumerate(measurements["palette"]):
            masks.append(("color", "Color island " + palette["hex"], labels == i, i))
    candidates = []
    bounds = provenance.get("analysis_bounds_in_source", [0, 0, 1, 1])
    for kind, label, mask, family in masks:
        for cells in components(mask):
            cy, cx = np.array(cells).T[::-1]
            area = float(weights[cy, cx].sum())
            if area < .02:
                continue
            x0, x1 = int(cx.min()), int(cx.max())+1
            y0, y1 = int(cy.min()), int(cy.max())+1
            box = [xs[x0]/width, ys[y0]/height, xs[x1]/width, ys[y1]/height]
            selected_weights = weights[cy, cx]
            centroid = [float(np.average((xs[cx]+xs[cx+1])/(2*width), weights=selected_weights)),
                        float(np.average((ys[cy]+ys[cy+1])/(2*height), weights=selected_weights))]
            source_box = [bounds[0]+box[0]*(bounds[2]-bounds[0]), bounds[1]+box[1]*(bounds[3]-bounds[1]),
                          bounds[0]+box[2]*(bounds[2]-bounds[0]), bounds[1]+box[3]*(bounds[3]-bounds[1])]
            points = np.column_stack(((xs[cx]+xs[cx+1])/2, (ys[cy]+ys[cy+1])/2))
            centered = points-np.average(points, axis=0, weights=selected_weights)
            covariance = (centered.T*selected_weights) @ centered / selected_weights.sum()
            eigenvalues, eigenvectors = np.linalg.eigh(covariance)
            elongation = float(eigenvalues[1]/max(eigenvalues[0], 1e-8))
            angle = float(np.degrees(np.arctan2(eigenvectors[1,1], eigenvectors[0,1])) % 180) if elongation >= 2 else None
            candidates.append({"kind": kind, "label": label, "palette_index": family,
                "cells_xy": cells, "area_fraction": area, "bbox_analysis": box,
                "bbox_source": source_box, "centroid_analysis": centroid,
                "mean_lightness": float(np.average(light[cy, cx], weights=selected_weights)),
                "edge_density": float(np.average(edges[cy, cx], weights=selected_weights)),
                "touches_boundary": x0 == 0 or y0 == 0 or x1 == nx or y1 == ny,
                "principal_axis_degrees": angle, "axis_variance_ratio": elongation,
                "extent_ratio": (xs[x1]-xs[x0])/(ys[y1]-ys[y0]),
                "occupancy_in_bbox": area / ((box[2]-box[0])*(box[3]-box[1]))})
    # Keep at most five components per kind, eighteen overall; ordering is deterministic.
    candidates.sort(key=lambda f: (-f["area_fraction"], f["kind"], f["cells_xy"][0]))
    fields, counts = [], {}
    for item in candidates:
        if counts.get(item["kind"], 0) >= 5 or len(fields) >= 18:
            continue
        counts[item["kind"]] = counts.get(item["kind"], 0)+1
        fields.append({"id": f"F{len(fields)+1:02}", **item})
    return {"version": VERSION, "coordinate_frame": "Analysis frame for cells/centroids; source frame for bbox_source",
        "grid": {"columns": nx, "rows": ny, "x_pixel_boundaries": xs.tolist(), "y_pixel_boundaries": ys.tolist()},
        "method": "32-cell longest-side grid (minimum 8 cells per axis, capped at pixel count); cell means; 4-neighbour components; minimum 2% image area. Value masks use 35th/65th percentiles, falling back to 10th/90th when needed, and require >=8 L* separation. Color masks use modal existing palette assignments. Sparse masks require low strong-edge density and low mean gradient energy. Axes are weighted cell-center covariance eigenvectors in analysis-pixel coordinates, reported only at variance ratio >=2. Masks can overlap across kinds.",
        "limits": "Coarse masks describe this reproduction, not objects, brushwork or physical paint. Sparse fields can include sky, fabric, damage or margins; they are not automatically negative space. Boundaries are scale-dependent.",
        "thresholds": thresholds, "fields": fields, "configurations": [], "interactions": [], "principal_configuration_ids": []}


def articulate(analysis, formal):
    """Join field measurements to supported hypotheses without changing earlier proposals."""
    result = copy.deepcopy(analysis)
    fields = formal["fields"]
    image_id = result["images"][0]["id"]
    def entry(f):
        return {"kind": "measurement", "image_id": image_id, "region_id": "formal-"+f["id"],
            "source_id": None, "locator": f"formal.json#/fields/{fields.index(f)}", "support_note": "Connected coarse mask; inspect actual cells, not only its enclosing rectangle.",
            "method": formal["method"], "value": f["area_fraction"], "unit": "fraction of analyzed pixels",
            "modality_or_conditions": "Visible-light reproduction at the recorded scale."}
    for f in fields:
        result["regions"].append({"id": "formal-"+f["id"], "image_id": image_id,
            "label": f["label"]+" (coarse mask; bbox is an envelope)", "bbox_normalized": f["bbox_source"]})
        result["claims"].append({"id": "FM-"+f["id"], "domain": "composition", "kind": "measurement",
            "statement": f'{f["id"]}: {f["label"]} occupies {f["area_fraction"]:.1%} of the analysis frame; mean L* {f["mean_lightness"]:.1f}, strong-edge density {f["edge_density"]:.1%}.',
            "evidence": [entry(f)], "confidence": confidence(True), "alternatives": [],
            "scope": formal["limits"], "missing_evidence": []})
    candidates = []
    def candidate(kind, members, explanation, alternative, challenge, semantic_ids=None):
        score = sum(f["area_fraction"] for f in members)
        candidates.append({"id": f"K{len(candidates)+1:02}", "kind": kind,
            "field_ids": [f["id"] for f in members],
            "supporting_claim_ids": ["FM-"+f["id"] for f in members]+(semantic_ids or []),
            "explanation": explanation, "alternative": alternative, "challenge": challenge,
            "selection_weight": round(score, 6), "review_status": "unreviewed"})
    dark = [f for f in fields if f["kind"] == "dark"]
    light = [f for f in fields if f["kind"] == "light"]
    if dark and light:
        a, b = dark[0], light[0]
        separation = math.dist(a["centroid_analysis"], b["centroid_analysis"])
        if separation >= .15:
            candidate("value_opposition", [a, b],
                f'{a["id"]} and {b["id"]} place darker and lighter masses at separated centers ({separation:.2f} normalized distance), with {abs(a["mean_lightness"]-b["mean_lightness"]):.1f} L* difference. Their joint placement is a candidate scaffold for the composition: local subjects are encountered within this larger division of value.',
                "The division may describe illumination or the reproduction rather than a dominant organizing relation.",
                "Inspect silhouettes and subject boundaries; a reviewer could find the strongest visual organization crosses these value masks.")
    sparse = [f for f in fields if f["kind"] == "sparse"]
    detailed = [f for f in fields if f["kind"] != "sparse"]
    if sparse and detailed:
        a = sparse[0]
        b = max(detailed, key=lambda f: f["edge_density"])
        if b["edge_density"]-a["edge_density"] >= .05:
            candidate("detail_interval", [a, b],
                f'{a["id"]} provides a connected low-detail area ({a["area_fraction"]:.1%} of the frame), in comparison with the more articulated field {b["id"]}. Together they distribute detail unevenly; the sparse field is a candidate interval against which articulated forms can become distinct.',
                "The sparse area may be a depicted surface or an image margin, and may have no special compositional role.",
                "Check the sparse mask against the painting boundary and the depicted forms before calling it negative space or inferring atmosphere.")
    colors = [f for f in fields if f["kind"] == "color"]
    for i, a in enumerate(colors):
        for b in colors[i+1:]:
            if a["palette_index"] == b["palette_index"] and math.dist(a["centroid_analysis"], b["centroid_analysis"]) >= .25:
                candidate("color_recurrence", [a, b],
                    f'{a["id"]} and {b["id"]} repeat the same measured color family in separate connected islands. Their separation makes recurrence across an interval a plausible link between parts of the work.',
                    "Clustering may merge perceptually different colors; the recurrence could be incidental.",
                    "Compare the original color image and neighbouring hues; changing palette resolution may break this grouping.")
                break
        if candidates and candidates[-1]["kind"] == "color_recurrence":
            break
    axial = [f for f in fields if f["principal_axis_degrees"] is not None and f["area_fraction"] >= .05 and f["kind"] != "sparse"]
    for i,a in enumerate(axial):
        for b in axial[i+1:]:
            difference = abs(a["principal_axis_degrees"]-b["principal_axis_degrees"])
            difference = min(difference, 180-difference)
            overlap = len(set(map(tuple,a["cells_xy"])) & set(map(tuple,b["cells_xy"]))) / min(len(a["cells_xy"]),len(b["cells_xy"]))
            if difference >= 55 and overlap < .5:
                candidate("cross_axes", [a,b],
                    f'{a["id"]} and {b["id"]} have elongated spatial distributions with principal axes {a["principal_axis_degrees"]:.0f}° and {b["principal_axis_degrees"]:.0f}° (0° rightward, 90° downward). The contrasting extents form a candidate counterweight between two larger structures.',
                    "A curved or fragmented field can have a straight statistical axis that viewers do not perceive as a line.",
                    "Inspect the masks and silhouettes; these axes measure spatial extent, not perspective, brushstroke direction or eye movement.")
                break
        if candidates and candidates[-1]["kind"] == "cross_axes":
            break
    # Contextualize a model subject through a measured field. No object recognition is inferred from color.
    region_map = {r["id"]: r for r in analysis["regions"] if r["id"].startswith("semantic-region-") and not r["id"].endswith("r9")}
    for claim in analysis["claims"]:
        if not claim["id"].startswith("SO-"):
            continue
        region = next((region_map[e["region_id"]] for e in claim["evidence"] if e["region_id"] in region_map), None)
        if not region:
            continue
        box = region["bbox_normalized"]
        best, fraction = None, 0
        for f in fields:
            if f["kind"] not in {"dark", "light"}:
                continue
            # Count actual field cells whose centers lie in the source-space subject box.
            whole = next(r["bbox_normalized"] for r in analysis["regions"] if r["id"] == "whole")
            g = formal["grid"]
            inside = sum(box[0] <= whole[0]+(x+.5)/g["columns"]*(whole[2]-whole[0]) <= box[2] and
                         box[1] <= whole[1]+(y+.5)/g["rows"]*(whole[3]-whole[1]) <= box[3] for x,y in f["cells_xy"])
            share = inside / len(f["cells_xy"])
            if share > fraction:
                best, fraction = f, share
        if best and fraction >= .4:
            candidate("subject_field", [best],
                f'{fraction:.0%} of {best["id"]}\'s coarse cell centers fall inside the proposed box “{region["label"]}”. Read together with {claim["id"]}, this locates a model-described subject within a larger value mass, linking depicted content to the tonal scaffold.',
                "A loose or incorrect model box can create this association. Box containment does not establish the subject’s silhouette or importance.",
                "Correct the subject box and description first; the relation must be recomputed if either changes.", [claim["id"]])
            break
    # Diverse selection: one per mechanism, ranked by affected area; no aesthetic or confidence ranking.
    candidates.sort(key=lambda c: (-c["selection_weight"], c["id"]))
    for index, config in enumerate(candidates):
        config["hierarchy"] = "principal" if index < 3 else "supporting"
        config["selection_note"] = "Affected field area (overlaps counted) orders distinct mechanisms; this is an inspection priority, not artistic significance."
        members = [f for f in fields if f["id"] in config["field_ids"]]
        cid, rid = "FC-"+config["id"], "FR-"+config["id"]
        config["claim_id"], config["relationship_id"] = cid, rid
        result["claims"].append({"id": cid, "domain": "composition", "kind": "interpretive_hypothesis",
            "statement": config["explanation"], "evidence": [entry(f) for f in members],
            "confidence": confidence(), "alternatives": [config["alternative"]], "scope": formal["limits"],
            "missing_evidence": [config["challenge"], "Independent perceptual review"]})
        result["relationships"].append({"id": rid, "domain": "composition",
            "subject_claim_ids": config["supporting_claim_ids"], "predicate": "supports_interpretation",
            "object_claim_ids": [cid], "statement": config["explanation"], "epistemic_status": "hypothesized",
            "evidence": [entry(f) for f in members], "confidence": confidence(),
            "scope_and_alternatives": config["alternative"]+" Challenge: "+config["challenge"]})
    formal["configurations"] = candidates
    formal["principal_configuration_ids"] = [c["id"] for c in candidates[:3]]
    principal = candidates[:3]
    shared = [f["id"] for f in fields if sum(f["id"] in c["field_ids"] for c in principal) >= 2]
    union = [f for f in fields if any(f["id"] in c["field_ids"] for c in principal)]
    if shared and len(union) >= 3:
        support_ids = list(dict.fromkeys(cid for c in principal for cid in c["supporting_claim_ids"]))
        mechanisms = ", ".join(c["kind"].replace("_", " ") for c in principal)
        explanation = f'The principal hypotheses ({mechanisms}) share measured field(s) {", ".join(shared)}. This proposes a hierarchy in which the same structure participates in several relations: its tonal or color extent supplies a broad division, while its shape or association with a subject connects that division to local forms. The hypotheses are interdependent because they reuse the same image evidence.'
        alternative = "These mechanisms may describe the same visual difference several times rather than separate organizing effects. Shared evidence is not independent corroboration."
        challenge = "Inspect the shared masks and subject proposals together; if a field boundary or subject label changes, reassess the joint reading. No overall theme, intent or atmosphere follows automatically."
        formal["interactions"] = [{"id": "H01", "configuration_ids": [c["id"] for c in principal],
            "shared_field_ids": shared, "supporting_claim_ids": support_ids, "claim_id": "FC-H01",
            "explanation": explanation, "alternative": alternative, "challenge": challenge, "review_status": "unreviewed"}]
        result["claims"].append({"id": "FC-H01", "domain": "composition", "kind": "interpretive_hypothesis",
            "statement": explanation, "evidence": [entry(f) for f in union], "confidence": confidence(),
            "alternatives": [alternative], "scope": formal["limits"], "missing_evidence": [challenge, "Independent perceptual review"]})
        result["relationships"].append({"id": "FR-H01", "domain": "composition", "subject_claim_ids": support_ids,
            "predicate": "supports_interpretation", "object_claim_ids": ["FC-H01"], "statement": explanation,
            "epistemic_status": "hypothesized", "evidence": [entry(f) for f in union], "confidence": confidence(),
            "scope_and_alternatives": alternative+" "+challenge})
        result["relationships"].append({"id": "FR-H01-config", "domain": "composition",
            "subject_claim_ids": [c["claim_id"] for c in principal], "predicate": "supports_interpretation",
            "object_claim_ids": ["FC-H01"], "statement": "The joint reading depends on these unreviewed configuration hypotheses as well as their shared observations.",
            "epistemic_status": "hypothesized", "evidence": [entry(f) for f in union], "confidence": confidence(),
            "scope_and_alternatives": "Shared evidence is not independent corroboration; correcting a constituent hypothesis invalidates this joint reading."})
        result["synthesis"]["supporting_claim_ids"].append("FC-H01")
    result["synthesis"]["distinctive_relationship_ids"] = [c["relationship_id"] for c in candidates[:3]] + result["synthesis"]["distinctive_relationship_ids"]
    result["synthesis"]["supporting_claim_ids"] += [c["claim_id"] for c in candidates[:3]]
    result["synthesis"]["summary"] = f'{len(fields)} connected formal fields and {min(3,len(candidates))} principal configuration hypotheses connect value, color, detail distribution and available subject proposals. All explanations remain reviewable hypotheses. ' + analysis["synthesis"]["summary"]
    return result


def field_views(image, formal):
    """Actual coarse cells, not filled bounding rectangles."""
    output = {}
    grid = formal["grid"]
    colors = [(233, 112, 72), (51, 171, 147), (120, 119, 226), (226, 179, 50), (210, 102, 168)]
    for label, kinds in (("Value masses", {"dark", "light"}), ("Sparse fields", {"sparse"}), ("Color islands", {"color"})):
        layer = Image.new("RGBA", image.size)
        draw = ImageDraw.Draw(layer)
        for i, field in enumerate(formal["fields"]):
            if field["kind"] not in kinds:
                continue
            color = colors[i % len(colors)]
            for x,y in field["cells_xy"]:
                draw.rectangle((grid["x_pixel_boundaries"][x], grid["y_pixel_boundaries"][y],
                    grid["x_pixel_boundaries"][x+1]-1, grid["y_pixel_boundaries"][y+1]-1), fill=color+(105,))
            cx,cy = field["centroid_analysis"]
            x,y = round(cx*image.width), round(cy*image.height)
            draw.rectangle((x-2,y-2,x+25,y+14), fill=(15,35,30,255))
            draw.text((x,y), field["id"], fill=(255,255,255,255))
        output[label] = Image.alpha_composite(image.convert("RGBA"), layer).convert("RGB")
    axes = image.copy()
    draw = ImageDraw.Draw(axes)
    for field in formal["fields"]:
        angle = field["principal_axis_degrees"]
        if angle is None or field["area_fraction"] < .05 or field["kind"] == "sparse":
            continue
        cx,cy = field["centroid_analysis"]
        x,y = cx*image.width,cy*image.height
        box = field["bbox_analysis"]
        length = min(image.width,image.height)*.16
        dx,dy = math.cos(math.radians(angle))*length,math.sin(math.radians(angle))*length
        draw.line((x-dx,y-dy,x+dx,y+dy),fill="#122c27",width=5)
        draw.line((x-dx,y-dy,x+dx,y+dy),fill="#ffde7b",width=2)
        draw.rectangle((x,y,x+27,y+15),fill="#122c27")
        draw.text((x+2,y+1),field["id"],fill="white")
    output["Field axes"] = axes
    return output
