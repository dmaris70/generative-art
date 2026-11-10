"""Typed claims and deliberately conservative formal-relationship hypotheses."""
from __future__ import annotations

from datetime import date
import math


def confidence(measured=False):
    return {"label": "unassessed", "basis": "Deterministic measurement under recorded capture and processing assumptions." if measured else
            "Rule-generated formal hypothesis; no independent perceptual validation.",
            "calibration_note": "No calibrated probability or artistic-quality score is implied."}


def build_analysis(path, provenance, measurements, catalog=None):
    catalog = catalog or {}
    verified_association = catalog.get("_image_sha256") == provenance["input_sha256"]
    image_id = "image-overall"
    bounds = provenance.get("analysis_bounds_in_source", [0, 0, 1, 1])
    def source_bounds(box):
        x0, y0, x1, y1 = bounds
        return [x0 + box[0] * (x1 - x0), y0 + box[1] * (y1 - y0),
                x0 + box[2] * (x1 - x0), y0 + box[3] * (y1 - y0)]
    regions = [{"id": "whole", "image_id": image_id, "label": "Analyzed frame within the uncropped source", "bbox_normalized": bounds}]
    regions += [{"id": c["id"], "image_id": image_id,
                 "label": f"Grid cell {c['id'].removeprefix('cell-')}; analysis region, not a depicted object",
                 "bbox_normalized": source_bounds(c["bbox"])} for c in measurements["cells"]]
    claims, relationships = [], []

    def evidence(region="whole", locator=None, value=None, unit=None, method=None, note=None, source=False):
        return {"kind": "source" if source else "measurement" if locator else "image_region",
                "image_id": None if source else image_id, "region_id": None if source else region,
                "source_id": "catalog" if source else None, "locator": locator,
                "support_note": note or "Reproducible descriptor of the processed reproduction.",
                "method": method, "value": value, "unit": unit,
                "modality_or_conditions": provenance["color_note"]}

    def claim(domain, kind, statement, entries, alternatives=None):
        item = {"id": f"C{len(claims) + 1:03}", "domain": domain, "kind": kind,
                "statement": statement, "evidence": entries, "confidence": confidence(kind == "measurement"),
                "alternatives": alternatives or [],
                "scope": "This image reproduction at the recorded analysis scale; no claim about intent, authenticity or universal viewer response.",
                "missing_evidence": ["Independent perceptual review"] if kind == "interpretive_hypothesis" else []}
        claims.append(item)
        return item["id"]

    def configuration(domain, observations, statement, entries, alternatives):
        interpretation = claim(domain, "interpretive_hypothesis", statement, entries, alternatives)
        rel_id = f"R{len(relationships) + 1:03}"
        relationships.append({"id": rel_id, "domain": domain, "subject_claim_ids": observations,
                              "predicate": "supports_interpretation", "object_claim_ids": [interpretation],
                              "statement": "The linked observations jointly motivate this provisional formal interpretation.",
                              "epistemic_status": "hypothesized", "evidence": entries,
                              "confidence": confidence(), "scope_and_alternatives": " ".join(alternatives)})
        return rel_id, interpretation

    palette_ids = []
    for i, p in enumerate(measurements["palette"]):
        x, y = p["centroid"]
        palette_ids.append(claim("color", "measurement",
            f"Color family {i + 1} ({p['hex']}) occupies {p['share']:.1%} of analysis pixels; its potentially disconnected pixels have analysis-frame centroid ({x:.2f}, {y:.2f}).",
            [evidence(locator=f"measurements.json#/palette/{i}/share", value=p["share"], unit="fraction",
                      method=measurements["palette_method"], note=p["region_note"]),
             evidence(locator=f"measurements.json#/palette/{i}/centroid", value=f"{x:.6f},{y:.6f}", unit="normalized coordinates",
                      method="Arithmetic mean of assigned pixel-center coordinates.")]))

    distinctive, supports = [], []
    if len(palette_ids) >= 2:
        a, b = measurements["palette"][:2]
        distance = math.dist(a["centroid"], b["centroid"])
        if distance >= 0.12 and b["share"] >= 0.08:
            entries = [evidence(locator="measurements.json#/palette", value=distance, unit="normalized centroid distance",
                                method="Euclidean separation of the two largest color-family centroids.")]
            r, c = configuration("composition", palette_ids[:2],
                "The two largest color families have displaced centers, suggesting a broad spatial division of color rather than an evenly intermingled distribution.",
                entries, ["Centroids hide disconnected shapes and do not establish distinct objects or a focal point.",
                          "Inspect the palette map before judging a spatial division."])
            distinctive.append(r); supports.append(c)

    cells = measurements["cells"]
    bright = max(cells, key=lambda c: c["mean_lightness"])
    dark = min(cells, key=lambda c: c["mean_lightness"])
    if bright["mean_lightness"] - dark["mean_lightness"] >= 8:
        obs, entries = [], []
        for cell in (bright, dark):
            index = cells.index(cell)
            e = evidence(region=cell["id"], locator=f"measurements.json#/cells/{index}/mean_lightness",
                         value=cell["mean_lightness"], unit="L*", method="Mean CIELAB lightness within a fixed 3 by 3 grid cell.")
            entries.append(e)
            obs.append(claim("value_and_light", "measurement",
                             f"{cell['id']} has mean lightness L*={cell['mean_lightness']:.1f}.", [e]))
        r, c = configuration("composition", obs,
            f"The lighter {bright['id']} and darker {dark['id']} establish a large-scale value difference between these areas. This is a candidate division of light and dark masses.",
            entries, ["Grid cells are arbitrary; subjects or borders may cross them.",
                      "A lightness difference alone does not establish where viewers look."])
        distinctive.append(r); supports.append(c)

    edges = measurements["edges"]
    edge_id = claim("line_and_edge", "measurement",
                   f"Strong gradients occupy {edges['strong_edge_density']:.1%} of the image under the recorded threshold and smoothing.",
                   [evidence(locator="measurements.json#/edges/strong_edge_density", value=edges["strong_edge_density"],
                             unit="fraction", method=edges["method"])])
    if edges["dominant_tangent_degrees"] is not None and edges["dominant_bin_share"] >= 0.25:
        angle = edges["dominant_tangent_degrees"]
        entries = [evidence(locator="measurements.json#/edges/orientation_shares",
                            value=edges["dominant_bin_share"], unit="weighted fraction",
                            method=edges["method"], note=edges["angle_convention"])]
        direction_id = claim("line_and_edge", "measurement",
            f"The tangent bin centered at {angle:g} degrees carries {edges['dominant_bin_share']:.1%} of strong-gradient weight.", entries)
        r, c = configuration("line_and_edge", [edge_id, direction_id],
            f"A repeated edge direction near {angle:g} degrees is a candidate organizing feature at this scale.", entries,
            ["Detected gradients may describe object boundaries, framing, cracks or reproduction artifacts.",
             "An orientation histogram does not prove a gaze path or brushstroke direction."])
        distinctive.append(r); supports.append(c)

    dense = max(cells, key=lambda c: c["strong_edge_density"])
    sparse = min(cells, key=lambda c: c["strong_edge_density"])
    if dense["strong_edge_density"] - sparse["strong_edge_density"] >= 0.08:
        obs, entries = [], []
        for cell in (dense, sparse):
            index = cells.index(cell)
            e = evidence(region=cell["id"], locator=f"measurements.json#/cells/{index}/strong_edge_density",
                         value=cell["strong_edge_density"], unit="fraction", method=edges["method"])
            entries.append(e)
            obs.append(claim("line_and_edge", "measurement",
                f"{cell['id']} has strong-gradient density {cell['strong_edge_density']:.1%}.", [e]))
        r, c = configuration("composition", obs,
            f"Detected edge structure is denser in {dense['id']} than in {sparse['id']}, suggesting unequal distribution of articulated detail.",
            entries, ["Fine color variation may be missed by luminance gradients.",
                      "Higher edge density is not equivalent to artistic importance or psychological complexity."])
        distinctive.append(r); supports.append(c)

    sources = []
    metadata_claims = []
    if catalog:
        url = catalog.get("objectURL")
        if not url or not url.startswith("https://"):
            raise ValueError("A catalog record must have an HTTPS objectURL.")
        sources.append({"id": "catalog", "title": catalog.get("title") or "Museum catalog record",
                        "creator": "The Metropolitan Museum of Art", "url": url,
                        "accessed_on": date.today().isoformat(), "source_type": "museum_record",
                        "version_or_date": catalog.get("metadataDate"),
                        "access_note": "Local snapshot of the public museum API record; metadata is source-attributed."})
        if catalog.get("medium"):
            cid = claim("materials", "documented_assertion", "The museum catalog lists the medium as: " + catalog["medium"],
                        [evidence(source=True, locator="catalog.medium", value=catalog["medium"],
                                  note="Museum catalog assertion; not determined from image pixels.")])
            metadata_claims.append(claims.pop())
            metadata_claims[-1]["scope"] = "Assertion about the supplied catalog record. " + (
                "The acquisition record binds this downloaded image to the catalog via its SHA-256 hash."
                if verified_association else "Association of this catalog record with the input image is unverified.")

    image_width, image_height = provenance["oriented_size"]
    return {
        "schema_version": "0.1",
        "artwork": {"id": f"met-{catalog['objectID']}" if catalog else "image-" + provenance["input_sha256"][:12],
                    "title": catalog.get("title"), "artist": catalog.get("artistDisplayName") or None,
                    "identification_status": "documented" if verified_association else "candidate" if catalog else "unknown",
                    "catalog_identifiers": [{"authority": "The Metropolitan Museum of Art", "identifier": str(catalog["objectID"]),
                                             "url": catalog["objectURL"]}] if catalog else [],
                    "reported_metadata": metadata_claims},
        "images": [{"id": image_id, "uri": str(path.resolve()), "role": "overall",
                    "technical_modality": "visible_light", "source_url": catalog.get("primaryImageSmall"),
                    "width_px": image_width, "height_px": image_height,
                    "rights_note": "Museum API isPublicDomain=true; CC0 Open Access" if verified_association and catalog.get("isPublicDomain") is True else "Rights of this input image are not established by this local analysis.",
                    "capture_and_processing_note": provenance["processing"] + " " + provenance["color_note"],
                    "parent_image_id": None, "coordinate_transform_note": provenance["coordinate_mapping"]}],
        "sources": sources, "regions": regions, "claims": claims, "relationships": relationships,
        "synthesis": {"summary": f"The measurement baseline proposes {len(distinctive)} formal configurations for review. These connect pixel distributions and directional structure; subject, theme and emotional effect remain unassessed.",
                      "distinctive_relationship_ids": distinctive, "supporting_claim_ids": supports,
                      "alternative_readings": [],
                      "scope_and_limits": "Deterministic formal baseline, not a learned semantic or art-historical analysis. Thresholds are engineering heuristics, not validated aesthetic laws."},
        "open_questions": [
            {"question": question, "required_evidence": required, "related_claim_ids": []}
            for question, required in [
                ("Which depicted subjects and motifs are actually present?", ["Reviewed semantic regions or a validated vision-language component"]),
                ("Which interpretations of theme and atmosphere fit this work?", ["Localized interpretation, relevant scholarship and viewer-response evidence"]),
                ("What physical handling and construction produced the visible surface?", ["Adequate detail imaging and work-specific technical documentation"]),
                ("Which spatial system or perspective is being used?", ["Reviewed occlusion and convergence evidence"]),
                ("Do image margins, mounts or framing belong to the painting surface?", ["Review of image boundaries and documented dimensions"])
            ]]
    }
