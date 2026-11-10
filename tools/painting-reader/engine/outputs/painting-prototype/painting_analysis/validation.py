"""Structural and semantic evidence checks; these do not validate interpretation."""
from __future__ import annotations

import json
import math
from pathlib import Path


def validate(analysis, measurements, artifacts=None):
    try:
        from jsonschema import Draft202012Validator, FormatChecker
    except ImportError as exc:
        raise RuntimeError("Install requirements.txt before running the prototype; jsonschema is required.") from exc
    schema_path = Path(__file__).resolve().parents[1] / "schema" / "analysis.schema.json"
    schema = json.loads(schema_path.read_text())
    Draft202012Validator(schema, format_checker=FormatChecker()).validate(analysis)
    entities = {
        "image": analysis["images"], "region": analysis["regions"],
        "source": analysis["sources"],
        "claim": analysis["claims"] + analysis["artwork"]["reported_metadata"],
        "relationship": analysis["relationships"]
    }
    identifiers = {}
    all_ids = []
    for kind, items in entities.items():
        identifiers[kind] = {item["id"] for item in items}
        if len(identifiers[kind]) != len(items):
            raise ValueError(f"Duplicate {kind} ID")
        all_ids.extend(identifiers[kind])
    if len(set(all_ids)) != len(all_ids):
        raise ValueError("IDs must be unique across entity types")
    for region in analysis["regions"]:
        if region["image_id"] not in identifiers["image"]:
            raise ValueError("Dangling region image reference")
        x0, y0, x1, y1 = region["bbox_normalized"]
        if not (0 <= x0 < x1 <= 1 and 0 <= y0 < y1 <= 1):
            raise ValueError("Invalid region bounds")
    region_images = {r["id"]: r["image_id"] for r in analysis["regions"]}
    for item in entities["claim"] + entities["relationship"]:
        if item.get("kind") in {"measurement", "documented_assertion", "interpretive_hypothesis"} and not item["evidence"]:
            raise ValueError("Claim requires evidence")
        for entry in item["evidence"]:
            for field, kind in (("image_id", "image"), ("region_id", "region"), ("source_id", "source")):
                if entry[field] is not None and entry[field] not in identifiers[kind]:
                    raise ValueError(f"Dangling evidence {field}")
            if entry["region_id"] and region_images[entry["region_id"]] != entry["image_id"]:
                raise ValueError("Evidence region belongs to another image")
            if entry["kind"] == "source" and not entry["source_id"]:
                raise ValueError("Source evidence needs a source reference")
            if entry["kind"] == "measurement":
                locator = entry["locator"] or ""
                documents = {"measurements.json": measurements, **(artifacts or {})}
                document, marker, pointer = locator.partition("#/")
                if not marker or document not in documents:
                    raise ValueError("Measurement needs a resolvable locator")
                target = documents[document]
                for token in pointer.split("/"):
                    token = token.replace("~1", "/").replace("~0", "~")
                    target = target[int(token)] if isinstance(target, list) else target[token]
    for relation in analysis["relationships"]:
        if not set(relation["subject_claim_ids"] + relation["object_claim_ids"]) <= identifiers["claim"]:
            raise ValueError("Dangling relationship claim reference")
    claims_by_id = {c["id"]: c for c in entities["claim"]}
    for claim in entities["claim"]:
        if claim["kind"] == "documented_assertion" and not any(e["kind"] == "source" for e in claim["evidence"]):
            raise ValueError("Documented assertion needs source evidence")
        if claim["kind"] == "interpretive_hypothesis":
            parents = [r for r in analysis["relationships"] if claim["id"] in r["object_claim_ids"] and r["predicate"] == "supports_interpretation"]
            grounded = any(all(claims_by_id[cid]["kind"] in {"measurement", "visual_description", "documented_assertion", "viewer_response"}
                               for cid in r["subject_claim_ids"]) for r in parents)
            if not grounded:
                raise ValueError("Interpretation needs explicit observational dependencies")
    for key, kind in (("distinctive_relationship_ids", "relationship"), ("supporting_claim_ids", "claim")):
        if not set(analysis["synthesis"][key]) <= identifiers[kind]:
            raise ValueError("Dangling synthesis reference")
    for item in analysis["synthesis"]["alternative_readings"] + analysis["open_questions"]:
        for key in ("supporting_claim_ids", "related_claim_ids"):
            if key in item and not set(item[key]) <= identifiers["claim"]:
                raise ValueError("Dangling reading or question claim reference")
    if abs(sum(p["share"] for p in measurements["palette"]) - 1) > 1e-8:
        raise ValueError("Palette proportions do not sum to one")
    def finite(value):
        if isinstance(value, dict):
            for child in value.values(): finite(child)
        elif isinstance(value, list):
            for child in value: finite(child)
        elif isinstance(value, float) and not math.isfinite(value):
            raise ValueError("Non-finite numeric value")
    finite(analysis); finite(measurements); finite(artifacts or {})
    if artifacts and "formal.json" in artifacts:
        validate_formal(artifacts["formal.json"], analysis, measurements)
    return {"schema": "draft-2020-12", "schema_version": "0.1", "structural_validation": "passed",
            "semantic_reference_validation": "passed", "interpretation_review": "pending"}


def validate_formal(formal, analysis, measurements):
    """Check field masks, source transforms and configuration links, not their meaning."""
    from jsonschema import Draft202012Validator
    schema = json.loads((Path(__file__).resolve().parents[1] / "schema/formal.schema.json").read_text())
    Draft202012Validator(schema).validate(formal)
    grid = formal["grid"]
    xs, ys = grid["x_pixel_boundaries"], grid["y_pixel_boundaries"]
    if len(xs) != grid["columns"]+1 or len(ys) != grid["rows"]+1 or xs[0] != 0 or ys[0] != 0 or any(a >= b for axis in (xs,ys) for a,b in zip(axis,axis[1:])):
        raise ValueError("Invalid formal grid boundaries")
    width,height = xs[-1],ys[-1]
    fields = {f["id"]: f for f in formal["fields"]}
    configs = {c["id"]: c for c in formal["configurations"]}
    if len(fields) != len(formal["fields"]) or len(configs) != len(formal["configurations"]):
        raise ValueError("Duplicate formal ID")
    whole = next(r["bbox_normalized"] for r in analysis["regions"] if r["id"] == "whole")
    for field in fields.values():
        cells = field["cells_xy"]
        if any(x >= grid["columns"] or y >= grid["rows"] for x,y in cells):
            raise ValueError("Mask cell outside formal grid")
        weights = [(xs[x+1]-xs[x])*(ys[y+1]-ys[y]) for x,y in cells]
        area = sum(weights)
        if abs(area/(width*height)-field["area_fraction"]) > 1e-8:
            raise ValueError("Formal mask area disagrees with recorded cells")
        centroid = [sum(((xs[x]+xs[x+1])/2 if axis == 0 else (ys[y]+ys[y+1])/2)*weight for (x,y),weight in zip(cells,weights))/area/(width if axis==0 else height) for axis in (0,1)]
        if any(abs(a-b)>1e-8 for a,b in zip(centroid,field["centroid_analysis"])):
            raise ValueError("Formal centroid disagrees with mask")
        x0,y0 = min(x for x,y in cells),min(y for x,y in cells)
        x1,y1 = max(x for x,y in cells)+1,max(y for x,y in cells)+1
        box = [xs[x0]/width,ys[y0]/height,xs[x1]/width,ys[y1]/height]
        source_box = [whole[i%2]+box[i]*(whole[i%2+2]-whole[i%2]) for i in range(4)]
        if any(abs(a-b)>1e-8 for a,b in zip(box,field["bbox_analysis"])) or any(abs(a-b)>1e-8 for a,b in zip(source_box,field["bbox_source"])):
            raise ValueError("Formal bounds disagree with mask or source transform")
        family = field["palette_index"]
        if family is not None and family >= len(measurements["palette"]):
            raise ValueError("Unknown formal palette family")
    claims = {c["id"] for c in analysis["claims"]}
    relationships = {r["id"] for r in analysis["relationships"]}
    for config in formal["configurations"]:
        if not set(config["field_ids"]) <= fields.keys() or not set(config["supporting_claim_ids"]) <= claims or config["claim_id"] not in claims or config["relationship_id"] not in relationships:
            raise ValueError("Dangling formal configuration reference")
    if set(formal["principal_configuration_ids"]) != {c["id"] for c in configs.values() if c["hierarchy"] == "principal"}:
        raise ValueError("Principal hierarchy disagrees with configuration records")
    for interaction in formal["interactions"]:
        if not set(interaction["configuration_ids"]) <= configs.keys() or not set(interaction["shared_field_ids"]) <= fields.keys() or not set(interaction["supporting_claim_ids"]) <= claims or interaction["claim_id"] not in claims:
            raise ValueError("Dangling formal interaction reference")
        for fid in interaction["shared_field_ids"]:
            if sum(fid in configs[cid]["field_ids"] for cid in interaction["configuration_ids"]) < 2:
                raise ValueError("Interaction field is not actually shared")
