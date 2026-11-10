"""Evidence-linked comparison of two reproductions, with explicit scope/controls."""
from __future__ import annotations

from datetime import datetime,timezone
import copy
import json
import math
from pathlib import Path
import re

from PIL import Image
from jsonschema import Draft202012Validator

from .assessment import ROOT,VERSION,runtime_snapshot,facts_for_model,component_result,BAD,finite_values
from .reasoning import dump,sha,code_digest,metric_summary
from .features import measure
from .formal import extract_fields

DEFAULT_PAIR=("met-436535","met-36005")
METRICS=[("mean_L","Mean CIELAB lightness","L*"),("std_L","Lightness variation","L*"),
    ("mean_chroma","Mean chroma","CIELAB C*"),("edge_density","Strong-gradient density","fraction"),
    ("largest_sparse_fraction","Largest retained sparse field","fraction")]


def descriptors(image):
    summary=metric_summary(image)
    m,arrays=measure(image)
    fields=extract_fields(image,arrays,m,{"analysis_bounds_in_source":[0,0,1,1]})
    sparse=[f["area_fraction"] for f in fields["fields"] if f["kind"]=="sparse"]
    summary["largest_sparse_fraction"]=max(sparse) if sparse else None
    return summary


def trim_frame(image,fraction=.1):
    if not 0<=fraction<.45:raise ValueError("Invalid frame-control fraction")
    bounds=[round(image.width*fraction),round(image.height*fraction),round(image.width*(1-fraction)),round(image.height*(1-fraction))]
    if bounds[0]>=bounds[2] or bounds[1]>=bounds[3]:raise ValueError("Empty comparison frame")
    return image.crop(bounds),bounds


def measured_differences(left,right,trimmed_left,trimmed_right):
    rows=[]
    for index,(key,label,unit) in enumerate(METRICS,1):
        a,b=left[key],right[key];ta,tb=trimmed_left[key],trimmed_right[key]
        delta=a-b if a is not None and b is not None else None
        trimmed=ta-tb if ta is not None and tb is not None else None
        eps=.000001
        sign=lambda v:0 if abs(v)<=eps else (1 if v>0 else -1)
        stability="not_comparable" if delta is None or trimmed is None else "same_direction_under_trim" if sign(delta)==sign(trimmed) else "direction_changes_under_trim"
        rows.append({"id":f"D{index}","metric":key,"label":label,"unit":unit,"left":a,"right":b,"delta_left_minus_right":delta,
            "trim_left":ta,"trim_right":tb,"trim_delta_left_minus_right":trimmed,"framing_sensitivity":stability,
            "scope":"Digital reproduction descriptor under recorded processing; neither artistic significance nor an authenticated painting boundary"})
    return rows


def evidence_for_side(reasoning,alias,metrics):
    items=[]
    for e in reasoning["evidence"]:
        if e["status"] in {"rejected","needs_review","requires_external_evidence"}:continue
        if e["id"].startswith("E-") and not e["id"].endswith(("-context_relation","-detail_observation")) or e["id"].startswith("B-"):
            items.append({**e,"id":alias+":"+e["id"],"work_alias":alias,"original_evidence_id":e["id"]})
    for index,(key,label,unit) in enumerate(METRICS,1):
        value=metrics[key]
        if value is None:continue
        items.append({"id":f"{alias}:metric-{index}","kind":"measurement","scale":"whole",
            "statement":f'{label} of the analyzed reproduction is {value:.6f} {unit}.',"status":"measured",
            "limitations":["Includes the analyzed image frame, whose margins/mounts may affect the descriptor"],
            "region_ids":["whole"],"view_ids":["whole"],"source_claim_id":None,
            "work_alias":alias,"original_evidence_id":None,"facts":{"metric":key,"value":value,"unit":unit}})
    return items


def pair_cases(comparisons,left,right):
    la={e["id"]:e for e in left};rb={e["id"]:e for e in right}
    cases=[]
    for item in comparisons:
        a=[la[eid] for eid in item["left"]["evidence_ids"]]
        b=[rb[eid] for eid in item["right"]["evidence_ids"]]
        for part,text,available,kind in (("left",item["left"]["statement"],a,"visual_description"),
                ("right",item["right"]["statement"],b,"visual_description"),
                ("relation",item["statement"],a+b,"comparative_hypothesis"),
                ("bridge",item["reasoning"],a+b,"reasoning_bridge")):
            cases.append({"case_id":item["id"]+":"+part,"text":text,"kind":kind,
                "proposition":item["statement"] if part=="bridge" else None,"evidence":facts_for_model(available)})
    return cases


def validate_comparison(result):
    finite_values(result)
    Draft202012Validator(json.loads((ROOT/"schema/comparison.schema.json").read_text())).validate(result)
    left={e["id"] for e in result["evidence"]["A"]};right={e["id"] for e in result["evidence"]["B"]}
    if len(left)!=len(result["evidence"]["A"]) or len(right)!=len(result["evidence"]["B"]) or left&right:raise ValueError("Nonunique comparative evidence namespace")
    if [w["alias"] for w in result["works"]]!=["A","B"] or len({w["work_id"] for w in result["works"]})!=2:raise ValueError("Invalid comparative identities")
    seen=set()
    for c in result["comparisons"]:
        if c["id"] in seen:raise ValueError("Duplicate comparative claim")
        seen.add(c["id"])
        if not set(c["left"]["evidence_ids"])<=left or not set(c["right"]["evidence_ids"])<=right:raise ValueError("Cross-work or dangling comparative citation")
        if not c["left"]["evidence_ids"] or not c["right"]["evidence_ids"]:raise ValueError("Comparison requires evidence from both works")
        both=set(c["left"]["evidence_ids"]+c["right"]["evidence_ids"])
        if any(set(c[key]["evidence_ids"])!=both for key in ("relation_assessment","bridge_assessment")):raise ValueError("Comparative relation omitted a side's cited evidence")
        for side in ("left","right"):
            if c[side]["assessment"]["text"]!=c[side]["statement"] or c[side]["assessment"]["evidence_ids"]!=c[side]["evidence_ids"]:raise ValueError("Side assessment differs from its source proposition")
        for part in ("left","right","relation_assessment","bridge_assessment"):
            component=c[part]["assessment"] if part in {"left","right"} else c[part]
            if component["effective_status"] in BAD and component["disposition"]!="withheld":raise ValueError("Unsupported comparative component promoted")
        if c["scope"]!="this_pair_only":raise ValueError("Comparison exceeded pair scope")
    for row in result["measurement_differences"]:
        if row["left"] is not None and row["right"] is not None and not math.isclose(row["delta_left_minus_right"],row["left"]-row["right"],abs_tol=1e-9):raise ValueError("Incorrect measured pair difference")
        if row["trim_left"] is not None and row["trim_right"] is not None and not math.isclose(row["trim_delta_left_minus_right"],row["trim_left"]-row["trim_right"],abs_tol=1e-9):raise ValueError("Incorrect trimmed pair difference")
    cases={p+":"+q for p in seen for q in ("left","right","relation","bridge")}
    for label in ("original","reversed"):
        entries=result["order_control"][label]
        if {e["case_id"] for e in entries}!=cases or len(entries)!=len(cases):raise ValueError("Incomplete order-control judgments")
    original={j["case_id"]:j["status"] for j in result["order_control"]["original"]};reverse={j["case_id"]:j["status"] for j in result["order_control"]["reversed"]}
    changed={cid for cid in original if original[cid]!=reverse[cid]}
    if changed!={e["case_id"] for e in result["order_control"]["changed_judgments"]} or len(changed)!=len(result["order_control"]["changed_judgments"]):raise ValueError("Hidden or duplicate order sensitivity result")
    if result["same_image_control"]["pixels_equal"] is not True:raise ValueError("Same-image control has unequal pixels")
    expected=[c["id"] for c in result["same_image_control"]["raw_comparisons"] if c["relation"]=="different"]
    if expected!=result["same_image_control"]["unexpected_difference_ids"]:raise ValueError("Hidden same-image control failure")
    return {"structure":"passed","paired_evidence_references":"passed","scope":"pair-only","independent_expert_review":"not_obtained"}


def run_comparison(left_id,right_id,output,backend,progress=None,sources=None):
    if left_id==right_id:raise ValueError("Select two different works; the duplicate-image case is a separate control")
    progress=progress or (lambda text:None)
    sources=sources or {wid:ROOT/"runs/reasoning"/wid for wid in (left_id,right_id)}
    output=Path(output)
    if (output/"comparison.json").exists():raise ValueError("Completed comparison is immutable")
    execution=runtime_snapshot(output);audit=[];works=[];images=[];originals=[];full=[];trimmed=[]
    for alias,wid in zip(("A","B"),(left_id,right_id)):
        directory=Path(sources[wid]);reasoning=json.loads((directory/"reasoning.json").read_text())
        if reasoning["work_id"]!=wid:raise ValueError("Comparison input identity mismatch")
        image=Image.open(directory/"images/whole.png").convert("RGB")
        trim,bounds=trim_frame(image)
        image.save(output/(alias+".png"));trim.save(output/(alias+"-trim.png"))
        (output/"inputs"/(alias+"-reasoning.json")).write_bytes((directory/"reasoning.json").read_bytes())
        works.append({"alias":alias,"work_id":wid,"reasoning_sha256":sha(directory/"reasoning.json"),"image_sha256":sha(directory/"images/whole.png"),
            "image_file":alias+".png","trim_file":alias+"-trim.png","trim_bounds_pixels":bounds,"trim_sha256":sha(output/(alias+"-trim.png"))})
        images.append(image);originals.append(reasoning);full.append(descriptors(image));trimmed.append(descriptors(trim))
    left=evidence_for_side(originals[0],"A",full[0]);right=evidence_for_side(originals[1],"B",full[1])
    progress("Generating pair-specific shared features and differences")
    generated=backend.compare(facts_for_model(left),facts_for_model(right),images);audit.append(generated)
    revision={"attempted":False,"reason":"Not needed","initial_relations":[c["relation"] for c in generated["payload"]["comparisons"]]}
    measured=measured_differences(full[0],full[1],trimmed[0],trimmed[1])
    if not any(c["relation"]=="different" for c in generated["payload"]["comparisons"]) and any(r["delta_left_minus_right"] is not None and abs(r["delta_left_minus_right"])>1e-6 for r in measured):
        progress("Requesting one bounded contrast-focused revision; earlier response retained")
        revision.update(attempted=True,reason="Initial prose contained only similarities despite recorded descriptor differences")
        revised=backend.compare(facts_for_model(left),facts_for_model(right),images,feedback={"earlier":generated["payload"],"measured_differences":measured})
        audit.append(revised);generated=revised
    comparisons=[{"id":f"P{i}",**copy.deepcopy(c)} for i,c in enumerate(generated["payload"]["comparisons"],1)]
    cases=pair_cases(comparisons,left,right)
    original_judgments=[];reversed_judgments=[]
    for order,destination,pictures in ((["A","B"],original_judgments,images),(["B","A"],reversed_judgments,list(reversed(images)))):
        for start in range(0,len(cases),8):
            progress("Checking pair components in image order "+",".join(order))
            response=backend.assess_pair(cases[start:start+8],facts_for_model(left),facts_for_model(right),pictures,order)
            audit.append(response);destination+=response["payload"]["items"]
    original_map={j["case_id"]:j for j in original_judgments};reversed_map={j["case_id"]:j for j in reversed_judgments}
    for c in comparisons:
        cid=c["id"];aids=c["left"]["evidence_ids"];bids=c["right"]["evidence_ids"]
        c["left"]["assessment"]=component_result(c["left"]["statement"],"visual_description",aids,left,original_map[cid+":left"])
        c["right"]["assessment"]=component_result(c["right"]["statement"],"visual_description",bids,right,original_map[cid+":right"])
        c["relation_assessment"]=component_result(c["statement"],"interpretive_hypothesis",aids+bids,left+right,original_map[cid+":relation"])
        c["bridge_assessment"]=component_result(c["reasoning"],"interpretive_hypothesis",aids+bids,left+right,original_map[cid+":bridge"],bridge=True)
        c["scope"]="this_pair_only"
        if re.search(r"\b(unique|superior|inferior|all other paintings)\b",c["statement"]+" "+c["reasoning"],re.I):
            c["relation_assessment"].update(effective_status="unsupported",disposition="withheld")
            c["relation_assessment"]["deterministic_flags"].append("Pair evidence cannot establish uniqueness or artistic superiority")
    progress("Checking an identical-image control without invented differences")
    duplicate_right=evidence_for_side(originals[0],"B",full[0])
    duplicate=backend.compare(facts_for_model(left),facts_for_model(duplicate_right),[images[0],images[0]]);audit.append(duplicate)
    duplicate_claims=[{"id":f"C{i}",**copy.deepcopy(c)} for i,c in enumerate(duplicate["payload"]["comparisons"],1)]
    changes=[{"case_id":cid,"original_status":original_map[cid]["status"],"reversed_status":reversed_map[cid]["status"]} for cid in original_map if original_map[cid]["status"]!=reversed_map[cid]["status"]]
    result={"version":VERSION,"artifact_kind":"pair_comparison","pair_id":left_id+"--"+right_id,"generated_at":datetime.now(timezone.utc).isoformat(),
        "binding":{"code_sha256":execution},"works":works,"evidence":{"A":left,"B":right},"comparisons":comparisons,
        "measurement_differences":measured,"comparison_revision":revision,
        "order_control":{"original":original_judgments,"reversed":reversed_judgments,"changed_judgments":changes,
            "limits":"The same identities, propositions and facts are retained while image order and its mapping change; raw verdict changes indicate order sensitivity, not an accuracy score."},
        "same_image_control":{"pixels_equal":True,"work_id":left_id,"raw_comparisons":duplicate_claims,
            "unexpected_difference_ids":[c["id"] for c in duplicate_claims if c["relation"]=="different"],
            "limits":"Exact duplicate-image control only; the observations remain unreviewed model output."},
        "model":{"id":backend.lock["model_id"],"revision":backend.lock["revision"],"independent_validation":False},
        "selection_rationale":"Purpose-selected landscape contrast: vertical forms and open fields can be compared across these reproductions. This is not a matched-artist sample, a causal cultural comparison or a representative test set.",
        "limits":["All conclusions concern this pair and these reproductions; none establish artistic uniqueness, superiority or a general property of an artist/tradition.",
            "Frame-control trims 10% from each edge of both analyzed images. It is not an authenticated painting boundary; the model comparison itself uses the full analyzed images.",
            "Measurements can include mounts, inscriptions and reproduction effects. Shared model errors and incomplete observations remain possible.",generated["payload"]["limit"],
            "No independent expert evaluation, historical scholarship retrieval or physical-material determination has been performed."]}
    validation=validate_comparison(result)
    if code_digest()!=execution:raise RuntimeError("Runtime changed during comparison; native caches retained but result not published")
    dump(output/"comparison.json",result);dump(output/"inference-audit.json",audit);dump(output/"validation.json",validation)
    from .understanding_report import render_comparison
    (output/"report.html").write_text(render_comparison(result,output))
    progress("Comparison complete; pair-specific proposals require review")
    return result
