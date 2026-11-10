"""Separate support for a proposition from support for its reasoning bridge."""
from __future__ import annotations

import copy
from datetime import datetime,timezone
import hashlib
import json
import math
from pathlib import Path

from PIL import Image
from jsonschema import Draft202012Validator

from .reasoning import ROOT,REFERENCE_IDS,code_digest,dump,sha,numeric_checks,EXTERNAL
from .semantic import interpretive_language

VERSION="0.5.0"
BAD={"unsupported","requires_external_evidence"}


def finite_values(value):
    if isinstance(value,dict):
        for item in value.values():finite_values(item)
    elif isinstance(value,list):
        for item in value:finite_values(item)
    elif isinstance(value,float) and not math.isfinite(value):raise ValueError("Nonfinite assessment value")


def runtime_snapshot(output):
    output=Path(output);output.mkdir(parents=True,exist_ok=True)
    fingerprint=code_digest()
    for directory in ("painting_analysis","schema"):
        for path in (ROOT/directory).iterdir():
            if path.suffix in {".py",".js",".json"}:
                target=output/"inputs/runtime"/directory/path.name
                target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(path.read_bytes())
    return fingerprint


def facts_for_model(evidence):
    return [{k:e[k] for k in ("id","kind","scale","statement","status","limitations","facts") if k in e} for e in evidence]


def disposition(status):
    return "withheld" if status in BAD else "qualified" if status=="partly_supported" else "proposed"


def component_result(text,kind,evidence_ids,evidence,judgment,visual=None,bridge=False):
    """Retain raw judgments, apply explicit limits, and never infer expert approval."""
    facts={e["id"]:e for e in evidence}
    if not set(evidence_ids)<=facts.keys():raise ValueError("Unknown component evidence")
    flags=numeric_checks({"statement":text,"reasoning":"","evidence_ids":evidence_ids},facts)
    effective_kind=kind
    if kind=="visual_description" and interpretive_language(text):
        effective_kind="interpretive_hypothesis"
        flags.append("Description contains inferred-effect language; assessed as a hypothesis")
    status=judgment["status"]
    if bridge or effective_kind!="visual_description":
        if status=="directly_supported":status="plausible_inference"
    if visual is not None:
        image_status=visual["status"]
        if status=="requires_external_evidence" or image_status=="requires_external_evidence":status="requires_external_evidence"
        elif {status,image_status} & {"unsupported","partly_supported"}:
            status="unsupported" if status==image_status=="unsupported" else "partly_supported"
        elif effective_kind!="visual_description" or "plausible_inference" in {status,image_status}:status="plausible_inference"
        else:status="directly_supported"
    if not evidence_ids:
        status="unsupported";flags.append("No cited evidence")
    if any(facts[eid]["status"] in {"needs_review","rejected","requires_external_evidence"} for eid in evidence_ids):
        status="unsupported";flags.append("A cited item is unavailable for reasoning")
    numeric=[f for f in flags if f.startswith(("Field ","Quoted ","Axis "))]
    if numeric:status="unsupported"
    if EXTERNAL.search(text):
        status="requires_external_evidence";flags.append("Material/history/intent wording requires additional evidence; lexical screen is heuristic")
    return {"text":text,"declared_kind":kind,"effective_kind":effective_kind,"evidence_ids":list(evidence_ids),
        "evidence_assessment":judgment,"visual_assessment":visual,"deterministic_flags":flags,
        "effective_status":status,"disposition":disposition(status),"independent_review":"pending",
        "scope":"Same-model assessments relative to supplied evidence; no independent perceptual, scholarly or viewer-response validation"}


def failure_categories(statement,bridge):
    signals=set()
    for component in (statement,bridge):
        for flag in component["deterministic_flags"]:
            if flag.startswith("Field "):signals.add("uncited_field_reference")
            elif flag.startswith(("Quoted ","Axis ")):signals.add("numerical_or_orientation_conflict")
            elif "inferred-effect" in flag:signals.add("description_inference_mixture")
        if component["effective_status"]=="requires_external_evidence":signals.add("documentary_or_response_evidence_needed")
        if component["evidence_assessment"]["status"] in {"partly_supported","unsupported"}:signals.add("citation_or_evidence_scope")
    if statement["visual_assessment"] and statement["visual_assessment"]["status"] in {"unsupported","partly_supported"}:
        signals.add("visual_recognition_or_scope_review")
    if bridge["effective_status"] in {"unsupported","partly_supported"}:signals.add("reasoning_bridge_gap")
    return sorted(signals)


def recommendation(statement,bridge):
    if statement["effective_status"]=="requires_external_evidence":return "obtain_external_evidence"
    if statement["disposition"]=="withheld":return "reinspect_statement_before_explaining_it"
    if bridge["disposition"]!="proposed":return "retain_statement_for_review_and_rework_bridge"
    return "inspect_proposed_statement_and_bridge_separately"


def validate_audit(result):
    finite_values(result)
    Draft202012Validator(json.loads((ROOT/"schema/assessment.schema.json").read_text())).validate(result)
    evidence={e["id"]:e for e in result["evidence"]}
    if len(evidence)!=len(result["evidence"]):raise ValueError("Duplicate audit evidence ID")
    clauses={c["id"]:c for c in result["clauses"]}
    if len(clauses)!=len(result["clauses"]):raise ValueError("Duplicate audited clause ID")
    for clause in clauses.values():
        for component in (clause["statement"],clause["bridge"]):
            if not set(component["evidence_ids"])<=evidence.keys():raise ValueError("Dangling component citation")
            if component["effective_status"] in BAD and component["disposition"]!="withheld":raise ValueError("Unsupported component was promoted")
            if (component is clause["bridge"] or component["effective_kind"]!="visual_description") and component["effective_status"]=="directly_supported":raise ValueError("Inference promoted to literal fact")
        proposal=clause["bridge_proposal"]
        if proposal and proposal["assessment"]:
            if not set(proposal["assessment"]["evidence_ids"])<=evidence.keys():raise ValueError("Dangling proposed bridge evidence")
            if proposal["assessment"]["effective_status"] in BAD and proposal["assessment"]["disposition"]!="withheld":raise ValueError("Invalid bridge proposal disposition")
        if proposal and proposal["status"]=="awaiting_check":raise ValueError("Unchecked bridge proposal cannot be published")
    if any(not set(e["clause_ids"])<=clauses.keys() for e in result["source_explanations"]):raise ValueError("Dangling source explanation")
    return {"structure":"passed","component_references":"passed","independent_expert_review":"not_obtained"}


def run_audit(work_id,output,backend,source_dir=None,progress=None):
    progress=progress or (lambda text:None)
    source=Path(source_dir or ROOT/"runs/reasoning"/work_id)
    source_file=source/"reasoning.json"
    old=json.loads(source_file.read_text())
    if old["work_id"]!=work_id:raise ValueError("Audit source identity mismatch")
    output=Path(output)
    if (output/"audit.json").exists():raise ValueError("Completed audit is immutable; use a separate output directory")
    execution=runtime_snapshot(output)
    (output/"inputs/reasoning.json").write_bytes(source_file.read_bytes())
    image_path=source/"images/whole.png"
    image=Image.open(image_path).convert("RGB");image.save(output/"image.png")
    evidence=old["evidence"];lookup={e["id"]:e for e in evidence}
    audit=[];statement_cases=[];bridge_cases=[]
    for clause in old["clauses"]:
        cited=facts_for_model([lookup[eid] for eid in clause["evidence_ids"]])
        statement_cases.append({"case_id":clause["id"],"text":clause["statement"],"kind":clause["kind"],"evidence":cited})
        bridge_cases.append({"case_id":clause["id"],"text":clause["reasoning"],"proposition":clause["statement"],"kind":"reasoning_bridge","evidence":cited})
    progress("Assessing statements against their cited facts")
    statements=backend.assess_components(statement_cases);audit.append(statements)
    progress("Assessing statements against visible image evidence")
    visuals=backend.assess_components(statement_cases,image=image);audit.append(visuals)
    progress("Assessing reasoning bridges independently")
    bridges=backend.assess_components(bridge_cases,bridge=True);audit.append(bridges)
    def index(response):
        entries=response["payload"]["items"]
        ids=[e["case_id"] for e in entries]
        if len(set(ids))!=len(ids) or set(ids)!={c["id"] for c in old["clauses"]}:raise ValueError("Incomplete or duplicate component judgments")
        return {e["case_id"]:e for e in entries}
    statement_map,visual_map,bridge_map=map(index,(statements,visuals,bridges))
    clauses=[]
    for old_clause in old["clauses"]:
        cid=old_clause["id"];ids=old_clause["evidence_ids"]
        s=component_result(old_clause["statement"],old_clause["kind"],ids,evidence,statement_map[cid],visual_map[cid])
        b=component_result(old_clause["reasoning"],"interpretive_hypothesis",ids,evidence,bridge_map[cid],bridge=True)
        clauses.append({"id":cid,"legacy_status":old_clause["publication_status"],"statement":s,"bridge":b,
            "failure_categories":failure_categories(s,b),"recommendation":recommendation(s,b),"bridge_proposal":None,
            "alternative":old_clause["alternative"],"challenge":old_clause["challenge"]})
    targets=[c for c in clauses if c["legacy_status"]!="proposed" or c["bridge"]["disposition"]!="proposed"]
    if targets:
        progress("Proposing bounded replacement bridges or explicit abstention")
        cases=[{"case_id":c["id"],"statement":c["statement"]["text"],"earlier_bridge":c["bridge"]["text"],"flags":c["bridge"]["deterministic_flags"],"assessment":c["bridge"]["evidence_assessment"]} for c in targets]
        available=[e for e in evidence if e["status"] not in {"rejected","needs_review","requires_external_evidence"}]
        proposed=backend.propose_bridges(cases,facts_for_model(available));audit.append(proposed)
        proposals=proposed["payload"]["items"]
        if {p["case_id"] for p in proposals}!={c["id"] for c in targets} or len(proposals)!=len(targets):raise ValueError("Incomplete bridge proposals")
        proposed_cases=[]
        for proposal in proposals:
            clause=next(c for c in clauses if c["id"]==proposal["case_id"])
            valid=proposal["action"]=="propose_revision" and isinstance(proposal["bridge"],str) and bool(proposal["bridge"].strip()) and bool(proposal["evidence_ids"]) and set(proposal["evidence_ids"])<={e["id"] for e in available}
            clause["bridge_proposal"]={"raw":proposal,"assessment":None,"status":"awaiting_check" if valid else "abstained" if proposal["action"]=="abstain" else "invalid_proposal"}
            if valid:proposed_cases.append({"case_id":clause["id"],"text":proposal["bridge"],"proposition":clause["statement"]["text"],"kind":"reasoning_bridge","evidence":facts_for_model([lookup[eid] for eid in proposal["evidence_ids"]])})
        if proposed_cases:
            progress("Checking proposed bridges without replacing original explanations")
            checked=backend.assess_components(proposed_cases,bridge=True,stage="proposed-bridge-support");audit.append(checked)
            checked_map={c["case_id"]:c for c in checked["payload"]["items"]}
            if len(checked_map)!=len(proposed_cases) or set(checked_map)!={c["case_id"] for c in proposed_cases}:raise ValueError("Incomplete revised bridge checks")
            for case in proposed_cases:
                clause=next(c for c in clauses if c["id"]==case["case_id"])
                p=clause["bridge_proposal"]
                p["assessment"]=component_result(case["text"],"interpretive_hypothesis",p["raw"]["evidence_ids"],evidence,checked_map[case["case_id"]],bridge=True)
                p["status"]="checked_model_proposal"
    result={"version":VERSION,"artifact_kind":"clause_audit","work_id":work_id,"generated_at":datetime.now(timezone.utc).isoformat(),
        "binding":{"reasoning_sha256":sha(source_file),"image_sha256":sha(image_path),"code_sha256":execution,"source_review_revision":old["binding"]["review_revision"]},
        "model":{"id":backend.lock["model_id"],"revision":backend.lock["revision"],"independent_validation":False},
        "evidence":evidence,"clauses":clauses,"source_explanations":old["explanations"],
        "source_locator":str(source.relative_to(ROOT)) if source.is_relative_to(ROOT) else "external test fixture",
        "limits":["Statements, images and reasoning bridges are assessed separately by the same local model; shared errors remain possible.",
            "Failure categories are review signals, not expert diagnoses. Numerical screening covers explicit supported patterns, not all mathematics.",
            "New bridges are alternatives with their own citations and judgments; originals are preserved. No human acceptance is inherited.",
            "No independent expert review or calibrated correctness probability has been obtained."]}
    validation=validate_audit(result)
    if code_digest()!=execution:raise RuntimeError("Runtime changed during audit; native caches retained but result not published")
    dump(output/"audit.json",result);dump(output/"inference-audit.json",audit);dump(output/"validation.json",validation)
    from .understanding_report import render_audit
    (output/"report.html").write_text(render_audit(result,output))
    progress("Audit complete; components remain open to review")
    return result
