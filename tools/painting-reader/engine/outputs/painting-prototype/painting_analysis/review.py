"""Versioned reviewer overlays. Original model, measurement and formal files stay immutable."""
from __future__ import annotations

import copy
from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import re
import threading

LOCK = threading.RLock()
STATUSES = {"unreviewed", "accepted", "revised", "rejected"}


class Conflict(ValueError):
    pass


def digest(directory):
    return hashlib.sha256(b"".join((directory / n).read_bytes() for n in ("analysis.json", "formal.json"))).hexdigest()


def targets(analysis):
    return {item["id"]: (kind, item) for kind, items in (
        ("region", [r for r in analysis["regions"] if r["id"].startswith("semantic-region-")]),
        ("claim", [c for c in analysis["claims"] if c["id"].startswith(("SO-", "SI-", "FC-"))])) for item in items}


def checked_edits(analysis, edits):
    if not isinstance(edits, list) or len(edits) > 100:
        raise ValueError("Expected at most 100 edits")
    available, seen = targets(analysis), set()
    for edit in edits:
        if not isinstance(edit, dict) or edit.get("entity_id") not in available:
            raise ValueError("Unknown or read-only entity")
        eid = edit["entity_id"]
        if eid in seen:
            raise ValueError("Duplicate edited entity")
        seen.add(eid)
        kind, _ = available[eid]
        allowed = {"entity_id", "status", "note"} | ({"label", "bbox_normalized"} if kind == "region" else {"statement", "alternative", "challenge"})
        if set(edit)-allowed or edit.get("status") not in STATUSES:
            raise ValueError("Unsupported review field or status")
        if "bbox_normalized" in edit:
            box = edit["bbox_normalized"]
            if not isinstance(box, list) or len(box) != 4 or any(type(n) not in {int, float} or not math.isfinite(n) for n in box):
                raise ValueError("Box must have four finite numbers")
            x0,y0,x1,y1 = box
            if not 0 <= x0 < x1 <= 1 or not 0 <= y0 < y1 <= 1:
                raise ValueError("Box must be ordered within source coordinates")
            whole = next(r["bbox_normalized"] for r in analysis["regions"] if r["id"] == "whole")
            if x0 < whole[0] or y0 < whole[1] or x1 > whole[2] or y1 > whole[3]:
                raise ValueError("Box must remain inside analyzed source bounds")
        for key in allowed-{"entity_id", "status", "bbox_normalized"}:
            if key in edit and (not isinstance(edit[key], str) or not 1 <= len(edit[key].strip()) <= 6000):
                raise ValueError("Review text must contain 1–6000 characters")
        if (set(edit) & {"statement", "label", "bbox_normalized", "alternative", "challenge"}) and edit["status"] == "unreviewed":
            raise ValueError("A content correction requires an explicit review status")
    return copy.deepcopy(edits)


def working_snapshot(analysis, record):
    result = copy.deepcopy(analysis)
    available = targets(result)
    edits = {e["entity_id"]: e for e in checked_edits(analysis, record.get("edits", []))}
    states = {eid: {"status": e["status"], "reasons": []} for eid,e in edits.items()}
    stale = {}
    def mark(eid, reason):
        stale.setdefault(eid, set()).add(reason)
    for eid, edit in edits.items():
        kind, item = available[eid]
        if kind == "region":
            changed = "bbox_normalized" in edit and edit["bbox_normalized"] != item["bbox_normalized"]
            if "label" in edit:
                item["label"] = edit["label"]
            if changed:
                item["bbox_normalized"] = edit["bbox_normalized"]
            # item may already contain the edited label, so compare against immutable analysis.
            relabeled = "label" in edit and edit["label"] != targets(analysis)[eid][1]["label"]
            if changed or relabeled or edit["status"] == "rejected":
                reason = "geometry changed; original crop evidence needs reinspection" if changed else "label changed; crop description needs reinspection" if relabeled else "region rejected; its descriptions need reinspection"
                for claim in result["claims"]:
                    if any(e["region_id"] == eid for e in claim["evidence"]):
                        mark(claim["id"], f"{eid} {reason}")
        else:
            if any(key in edit for key in ("statement", "alternative", "challenge")) or edit["status"] == "rejected":
                mark(eid, "content correction" if edit["status"] != "rejected" else "rejected support")
            if "statement" in edit:
                item["statement"] = edit["statement"]
            if "alternative" in edit:
                item["alternatives"] = [edit["alternative"]]
            if "challenge" in edit:
                item["missing_evidence"] += [edit["challenge"]]
    # Transitive dependency invalidation. A corrected statement is reviewable; dependent prose is not recomputed.
    for _ in range(len(result["claims"])+1):
        before = len(stale)
        for rel in result["relationships"]:
            affected = set(rel["subject_claim_ids"]) & set(stale)
            if affected:
                for eid in rel["object_claim_ids"]:
                    mark(eid, "Dependency changed/rejected: "+", ".join(sorted(affected)))
        if len(stale) == before:
            break
    for eid, reasons in stale.items():
        effective = states.setdefault(eid, {"status": "unreviewed", "reasons": []})
        effective["reasons"] = sorted(reasons)
        # A direct text correction itself is not stale unless an upstream dependency also changed.
        if reasons != {"content correction"} and effective["status"] != "rejected":
            effective["status"] = "needs_review"
    if edits:
        origins = record.get("edit_origins", {})
        source_ids = set()
        for eid, edit in edits.items():
            if available[eid][0] != "claim":
                continue
            item = available[eid][1]
            if any(k in edit for k in ("statement", "alternative", "challenge")):
                origin = origins.get(eid, record)
                source_id = "review-revision-"+str(origin["revision"])
                if source_id not in source_ids:
                    result["sources"].append({"id": source_id, "title": "Reviewer overlay revision "+str(origin["revision"]),
                        "creator": origin["reviewer"]["name"]+" ("+origin["reviewer"]["type"]+")",
                        "url": "urn:painting-review:"+record["base_sha256"]+":"+str(origin["revision"]),
                        "accessed_on": origin["saved_at"][:10], "source_type": "other", "version_or_date": origin["saved_at"],
                        "access_note": "Reviewer statement; not independent expert validation. Original bytes remain bound by base_sha256."})
                    source_ids.add(source_id)
                item["evidence"] = [{"kind": "source", "source_id": source_id, "image_id": None, "region_id": None,
                    "locator": f'Reviewer revision {origin["revision"]}; entity {eid}', "method": "Attributed reviewer correction",
                    "support_note": "Original model/formal evidence is preserved in the immutable source analysis; changed wording is attributed to this review.",
                    "value": None, "unit": None, "modality_or_conditions": "Review overlay; no recalculation of image measurements."}]
                item["scope"] += " Working copy edited in reviewer overlay; inspect review_status before reuse."
                item["confidence"]["basis"] = "Reviewer overlay; acceptance is not calibrated accuracy."
    # Keep relationship wording synchronized with explicitly corrected interpretation text.
    claims = {c["id"]: c for c in result["claims"]}
    for relation in result["relationships"]:
        changed = [cid for cid in relation["object_claim_ids"] if cid in edits and "statement" in edits[cid]]
        if changed:
            relation["statement"] = " ".join(claims[cid]["statement"] for cid in relation["object_claim_ids"])
    return {"analysis": result, "review_status": states,
        "limits": "Working overlay; unchanged observations can still be wrong. needs_review propagates to dependent claims. Rejected/stale claims remain visible for audit and must not be consumed as accepted evidence.",
        "base_sha256": record.get("base_sha256"), "revision": record.get("revision", 0)}


class ReviewStore:
    def __init__(self, runs, reviews):
        self.runs, self.reviews = Path(runs).resolve(), Path(reviews).resolve()

    def directory(self, work_id):
        if not re.fullmatch(r"(?:met-[0-9]+|image-[a-f0-9]{12})", work_id):
            raise ValueError("Invalid work ID")
        path = self.runs / work_id
        if not path.is_dir():
            matches = []
            for candidate in self.runs.iterdir():
                if not candidate.is_dir() or candidate.is_symlink() or not (candidate / "formal.json").is_file() or not (candidate / "analysis.json").is_file():
                    continue
                if json.loads((candidate / "analysis.json").read_text())["artwork"]["id"] == work_id:
                    matches.append(candidate)
            if len(matches) != 1:
                raise ValueError("Unknown or ambiguous articulated work; use a unique directory under runs/articulation")
            path = matches[0]
        if not path.is_dir() or path.is_symlink() or not (path / "formal.json").is_file() or not (path / "analysis.json").is_file():
            raise ValueError("Unknown articulated work")
        if json.loads((path / "analysis.json").read_text())["artwork"]["id"] != work_id:
            raise ValueError("Work ID disagrees with saved analysis")
        return path

    def read(self, work_id):
        directory = self.directory(work_id)
        analysis = json.loads((directory / "analysis.json").read_text())
        fingerprint = digest(directory)
        history = self.reviews / work_id / "revisions"
        revisions = sorted(history.glob("[0-9][0-9][0-9][0-9][0-9][0-9].json")) if history.exists() else []
        record = json.loads(revisions[-1].read_text()) if revisions else {"revision": 0, "base_sha256": fingerprint, "edits": []}
        if record["base_sha256"] != fingerprint:
            raise Conflict("Analysis changed since this review; migrate the review explicitly before editing")
        return {"record": record, "snapshot": working_snapshot(analysis, record)}

    def save(self, work_id, payload):
        with LOCK:
            current = self.read(work_id)
            previous = current["record"]
            if type(payload.get("expected_revision")) is not int or payload["expected_revision"] != previous["revision"] or payload.get("base_sha256") != previous["base_sha256"]:
                raise Conflict("Revision or analysis changed; reload before saving")
            reviewer = payload.get("reviewer")
            if not isinstance(reviewer, dict) or reviewer.get("type") not in {"human", "assistant", "automated_test"} or not isinstance(reviewer.get("name"), str) or not 1 <= len(reviewer["name"].strip()) <= 200:
                raise ValueError("Reviewer name and type are required")
            analysis = json.loads((self.directory(work_id) / "analysis.json").read_text())
            record = {"version": "review-0.3", "revision": previous["revision"]+1,
                "base_sha256": previous["base_sha256"], "saved_at": datetime.now(timezone.utc).isoformat(),
                "reviewer": {"name": reviewer["name"].strip(), "type": reviewer["type"]},
                "edits": checked_edits(analysis, payload.get("edits"))}
            previous_edits = {e["entity_id"]: e for e in previous["edits"]}
            record["edit_origins"] = {e["entity_id"]: (
                previous.get("edit_origins", {}).get(e["entity_id"], {k: previous[k] for k in ("revision", "reviewer", "saved_at")})
                if previous_edits.get(e["entity_id"]) == e else {k: record[k] for k in ("revision", "reviewer", "saved_at")}) for e in record["edits"]}
            snapshot = working_snapshot(analysis, record)
            from .validation import validate
            validate(snapshot["analysis"], json.loads((self.directory(work_id) / "measurements.json").read_text()),
                     {"formal.json": json.loads((self.directory(work_id) / "formal.json").read_text())})
            destination = self.reviews / work_id
            history = destination / "revisions"
            history.mkdir(parents=True, exist_ok=True)
            revision_path = history / f'{record["revision"]:06}.json'
            # Exclusive creation prevents silent history replacement even after an interrupted latest write.
            data = json.dumps(record, indent=2, ensure_ascii=False, allow_nan=False)+"\n"
            temporary_revision = history / ".revision.tmp"
            with temporary_revision.open("w") as file:
                file.write(data)
                file.flush()
                os.fsync(file.fileno())
            os.link(temporary_revision, revision_path)
            temporary_revision.unlink()
            temp = destination / "latest.tmp"
            temp.write_text(data)
            os.replace(temp, destination / "latest.json")
            snapshot_path = destination / f'working-{record["revision"]:06}.json'
            snapshot_path.write_text(json.dumps(snapshot, indent=2, ensure_ascii=False, allow_nan=False)+"\n")
            return {"record": record, "snapshot": snapshot}
