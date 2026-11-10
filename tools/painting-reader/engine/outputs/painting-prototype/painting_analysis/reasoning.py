"""Version 0.4: inspect, articulate atomic claims, probe evidence use, and revise."""
from __future__ import annotations

import copy
from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import random
import re
import uuid

import numpy as np
from PIL import Image,ImageDraw

from .features import load_image, measure
from .formal import articulate
from .review import ReviewStore, digest, working_snapshot
from .validation import validate
from .semantic import interpretive_language

ROOT = Path(__file__).resolve().parents[1]
REFERENCE_IDS = ["met-436535", "met-437881", "met-435866", "met-36005", "met-446161"]
VERSION = "0.4.0"
EXTERNAL = re.compile(r"\b(pigment|binder|(?:on|of|made of|painted on) (?:canvas|paper|silk)|oil paint|watercolou?r|impasto|palette knife|intended|artist wanted|symbolizes|symbolises)\b",re.I)


def dump(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True,exist_ok=True)
    temporary = path.with_name("."+path.name+"-"+uuid.uuid4().hex+".tmp")
    temporary.write_text(json.dumps(value,indent=2,ensure_ascii=False,allow_nan=False)+"\n")
    os.replace(temporary,path)


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def code_digest(root=None):
    root=Path(root or ROOT)
    paths = sorted(p for directory in (root/"painting_analysis",root/"schema") for p in directory.iterdir() if p.suffix in {".py",".js",".json"})
    return hashlib.sha256(b"".join(str(p.relative_to(root)).encode()+p.read_bytes() for p in paths)).hexdigest()


def crop_view(native, source_box, bounds, expansion=0, max_side=384):
    local = [(source_box[i]-bounds[i%2])/(bounds[i%2+2]-bounds[i%2]) for i in range(4)]
    if expansion:
        dx=max(.04,(local[2]-local[0])*expansion);dy=max(.04,(local[3]-local[1])*expansion)
        local = [max(0,local[0]-dx),max(0,local[1]-dy),min(1,local[2]+dx),min(1,local[3]+dy)]
    pixels = [round(local[i]*(native.width if i%2==0 else native.height)) for i in range(4)]
    if pixels[2] <= pixels[0] or pixels[3] <= pixels[1]:
        raise ValueError("Corrected crop has no pixels at available source resolution")
    crop = native.crop(pixels)
    source_pixels_size = list(crop.size)
    crop.thumbnail((max_side,max_side),Image.Resampling.LANCZOS)
    realized = [bounds[i%2]+pixels[i]/(native.width if i%2==0 else native.height)*(bounds[i%2+2]-bounds[i%2]) for i in range(4)]
    return crop, {"bbox_source":realized,"native_frame_pixels":pixels,"available_crop_size":source_pixels_size,
        "display_size":list(crop.size),"upsampled":False}


def neutral_image(image):
    """Neutral RGB reconstructed from CIELAB L*, subject to 8-bit rounding."""
    m,a = measure(image)
    lightness = a["lab"][...,0]
    y = np.where(lightness>8,((lightness+16)/116)**3,lightness/903.2962962962963)
    gray = np.where(y<=.0031308,12.92*y,1.055*np.maximum(y,0)**(1/2.4)-.055)
    return Image.fromarray(np.repeat(np.uint8(np.clip(np.rint(gray*255),0,255))[...,None],3,axis=2))


def metric_summary(image):
    m,a = measure(image)
    return {"size":list(image.size),"mean_L":m["lightness"]["mean"],"std_L":m["lightness"]["std"],
        "mean_chroma":float(np.sqrt(a["lab"][...,1]**2+a["lab"][...,2]**2).mean()),
        "edge_density":m["edges"]["strong_edge_density"],"dominant_edge_tangent":m["edges"]["dominant_tangent_degrees"],
        "palette_families":len(m["palette"])}


def make_cases(clauses, evidence):
    """Blind case IDs, paired cited-fact removal, distractor removal and empty evidence."""
    facts = {e["id"]:e for e in evidence}
    cases, plan = [], []
    for clause in clauses:
        cited = [facts[eid] for eid in clause["evidence_ids"]]
        distractor = next((e for e in evidence if e["id"] not in clause["evidence_ids"] and not set(e["region_ids"]) & set(r for c in cited for r in c["region_ids"])),None)
        if distractor is None:
            distractor = next((e for e in evidence if e["id"] not in clause["evidence_ids"]),None)
        conditions = [("cited_plus_distractor",cited+([distractor] if distractor else [])),
                      ("remove_uncited_control",cited),("remove_cited",cited[1:]),("empty_evidence",[])]
        for condition, available in conditions:
            case_id = "T"+str(len(cases)+1)
            cases.append({"case_id":case_id,"proposition":clause["statement"],
                "evidence":[{"id":e["id"],"kind":e["kind"],"statement":e["statement"],"limitations":e["limitations"]} for e in available]})
            plan.append({"case_id":case_id,"clause_id":clause["id"],"condition":condition,
                "available_evidence_ids":[e["id"] for e in available],"removed_evidence_id":cited[0]["id"] if condition=="remove_cited" else None,
                "control_available":distractor is not None})
    # Shuffle paired conditions while retaining deterministic replay and opaque IDs.
    random.Random(40).shuffle(cases)
    return cases,plan


def enforce_clause(clause, assessment, evidence):
    clause=copy.deepcopy(clause)
    status = assessment["assessment"]
    flags = []
    if clause["kind"]=="visual_description" and interpretive_language(clause["statement"]):
        clause["kind"]="interpretive_hypothesis"
        flags.append("Inferred-effect language was declared visual description; retained as an interpretive hypothesis")
    if EXTERNAL.search(clause["statement"]):
        status="requires_external_evidence";flags.append("Physical, historical or symbolic assertion requires evidence beyond supplied RGB/model descriptions")
    if clause["kind"] != "visual_description" and status == "directly_supported":
        status="plausible_inference";flags.append("Interpretation cannot be upgraded to established effect by a model self-check")
    if not clause["evidence_ids"]:
        status="unsupported"
    if len(re.findall(r"[.!?](?:\s|$)",clause["statement"])) > 1:
        flags.append("Multiple sentences: inspect whether the clause is atomic")
    if any(evidence[eid]["status"] in {"needs_review","rejected","requires_external_evidence"} for eid in clause["evidence_ids"]):
        if status!="requires_external_evidence":status="partly_supported"
        flags.append("A cited evidence item is unavailable or needs review")
    numerical=numeric_checks(clause,evidence)
    if numerical:status="unsupported";flags+=numerical
    return {**clause,"model_assessment":assessment,"support_status":status,
        "publication_status":"withheld" if status in {"unsupported","requires_external_evidence"} else "qualified" if status=="partly_supported" else "proposed",
        "flags":flags,"independent_review":"pending"}


def numeric_checks(clause,evidence):
    """Conservative checks of explicit field IDs, coordinate pairs and PCA angles."""
    text=clause["statement"]+" "+clause.get("reasoning","")
    facts=[evidence[eid].get("facts",{}) for eid in clause["evidence_ids"]]
    fields={f["field_id"]:f for f in facts if "field_id" in f}
    errors=[]
    for fid in set(re.findall(r"\bF[0-9]{2}\b",text)):
        if fid not in fields:errors.append("Field "+fid+" is named without its measured field evidence")
    centroids=[f["centroid_analysis"] for f in fields.values() if f.get('centroid_analysis') is not None]
    for x,y in re.findall(r"\(\s*(0?\.\d+|[01](?:\.\d+)?)\s*,\s*(0?\.\d+|[01](?:\.\d+)?)\s*\)",text):
        if centroids and not any(abs(float(x)-a)<=.015 and abs(float(y)-b)<=.015 for a,b in centroids):
            errors.append("Quoted coordinate pair does not match any cited field centroid")
    angles=[f["principal_axis_degrees"] for f in fields.values() if f.get('principal_axis_degrees') is not None]
    possible=angles+[min(abs(a-b),180-abs(a-b)) for a in angles for b in angles]+[0,90,180]
    for value in re.findall(r"(\d+(?:\.\d+)?)\s*°",text):
        if angles and not any(abs(float(value)-a)<=.6 for a in possible):errors.append("Quoted angle does not match a cited field axis or angular difference")
    for value,word in re.findall(r"(\d+(?:\.\d+)?)\s*°[^.]{0,20}?(vertical|horizontal)",text,re.I):
        angle=float(value)%180
        if word.lower()=="vertical" and abs(angle-90)>25 or word.lower()=="horizontal" and min(angle,180-angle)>25:
            errors.append("Axis orientation wording conflicts with the recorded angle convention")
    return list(dict.fromkeys(errors))


def validate_reasoning(result):
    from jsonschema import Draft202012Validator
    schema=json.loads((ROOT/"schema/reasoning.schema.json").read_text())
    Draft202012Validator(schema).validate(result)
    evidence={e["id"]:e for e in result["evidence"]}
    clauses={c["id"]:c for c in result["clauses"]}
    if len(evidence)!=len(result["evidence"]) or len(clauses)!=len(result["clauses"]):
        raise ValueError("Duplicate reasoning ID")
    views={v["id"] for v in result["views"]}
    for e in evidence.values():
        if not set(e["view_ids"])<=views:raise ValueError("Dangling evidence view")
    for c in clauses.values():
        if not set(c["evidence_ids"])<=evidence.keys():raise ValueError("Dangling clause evidence")
        if any(evidence[eid]["status"] in {"rejected","needs_review","requires_external_evidence"} for eid in c["evidence_ids"]):
            raise ValueError("Clause consumes rejected/stale evidence")
        if c["kind"]!="visual_description" and c["support_status"]=="directly_supported":raise ValueError("Interpretive status promoted to fact")
        if c["support_status"] in {"unsupported","requires_external_evidence"} and c["publication_status"]!="withheld":raise ValueError("Unsupported claim was published")
    if any(not set(x["clause_ids"])<=clauses.keys() for x in result["explanations"]):raise ValueError("Dangling explanation clause")
    plans={p["case_id"]:p for p in result["evidence_tests"]["plan"]}
    assessments={a["case_id"]:a for a in result["evidence_tests"]["assessments"]}
    if len(plans)!=len(result["evidence_tests"]["plan"]) or plans.keys()!=assessments.keys() or len(assessments)!=len(result["evidence_tests"]["assessments"]):raise ValueError("Incomplete evidence test cases")
    for p in plans.values():
        if p["clause_id"] not in clauses or not set(p["available_evidence_ids"])<=evidence.keys():raise ValueError("Dangling test reference")
    expected_conditions={"cited_plus_distractor","remove_uncited_control","remove_cited","empty_evidence"}
    for cid,clause in clauses.items():
        paired=[p for p in plans.values() if p["clause_id"]==cid]
        if len(paired)!=4 or {p["condition"] for p in paired}!=expected_conditions:raise ValueError("Incomplete paired conditions")
        by_condition={p["condition"]:p for p in paired}
        cited=set(clause["evidence_ids"])
        if set(by_condition["remove_uncited_control"]["available_evidence_ids"])!=cited or by_condition["empty_evidence"]["available_evidence_ids"]:
            raise ValueError("Invalid control/empty evidence condition")
        removed=by_condition["remove_cited"]["removed_evidence_id"]
        if removed not in cited or set(by_condition["remove_cited"]["available_evidence_ids"])!=cited-{removed}:raise ValueError("Removal case did not remove exactly its cited fact")
    if {v["id"] for v in result["visual_comparisons"]}!={"original","value_only","resolution_256"}:raise ValueError("Invalid visual comparison set")
    for variant in result["visual_comparisons"]:
        if variant["view_id"] not in views or {a["case_id"] for a in variant["assessments"]}!=clauses.keys() or len(variant["assessments"])!=len(clauses):raise ValueError("Invalid visual comparison references")
    def finite(value):
        if isinstance(value,dict):
            for child in value.values():finite(child)
        elif isinstance(value,list):
            for child in value:finite(child)
        elif isinstance(value,float) and not math.isfinite(value):raise ValueError("Nonfinite reasoning value")
    finite(result)
    return {"structural_validation":"passed","evidence_reference_validation":"passed","interpretive_accuracy":"Independent review pending"}


def run_reasoning(work_id, output, backend, review_record=None, progress=None, clause_feedback=None, previous_result=None):
    progress=progress or (lambda message:None)
    works=json.loads((ROOT/"data/pilot-manifest.json").read_text())["works"]
    work=next((w for w in works if w["id"]==work_id),None)
    if work is None:raise ValueError("Work is not in the development manifest")
    source=ROOT/"runs/articulation"/work_id
    original=json.loads((source/"analysis.json").read_text())
    formal=json.loads((source/"formal.json").read_text())
    original_provenance=json.loads((source/"provenance.json").read_text())
    store=ReviewStore(ROOT/"runs/articulation",ROOT/"reviews")
    record=review_record if review_record is not None else store.read(work_id)["record"]
    if record["base_sha256"]!=digest(source):raise ValueError("Review is bound to a different source analysis")
    reviewed=working_snapshot(original,record)
    image,capture=load_image(ROOT/work["image_path"],max_side=512,crop=work.get("analysis_bounds"))
    native,native_capture=load_image(ROOT/work["image_path"],max_side=2048,crop=work.get("analysis_bounds"))
    if capture["input_sha256"]!=original_provenance["input_sha256"] or capture["analysis_bounds_in_source"]!=original_provenance["analysis_bounds_in_source"]:
        raise ValueError("Source pixels or analysis crop changed")
    output=Path(output);output.mkdir(parents=True,exist_ok=True)
    execution_code=code_digest()
    for directory in ("painting_analysis","schema"):
        for file in (ROOT/directory).iterdir():
            if file.suffix in {".py",".js",".json"}:
                target=output/"inputs/runtime"/directory/file.name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(file.read_bytes())
    for name in ("analysis.json","formal.json","measurements.json","provenance.json"):
        target=output/"inputs"/name
        target.parent.mkdir(exist_ok=True)
        target.write_bytes((source/name).read_bytes())
    dump(output/"review-input.json",record)
    if clause_feedback is not None:dump(output/"clause-review-input.json",clause_feedback)
    views=[];inspections={};evidence=[];audit=[]
    def save_view(view_id,picture,metadata,scale):
        relative="images/"+view_id+".png"
        file=output/relative;file.parent.mkdir(exist_ok=True);picture.save(file)
        views.append({"id":view_id,"file":relative,"scale":scale,"pixel_sha256":hashlib.sha256(picture.tobytes()).hexdigest(),
            "file_sha256":sha(file),"size":list(picture.size),**metadata})
        return view_id
    whole_view=save_view("whole",image,{"bbox_source":capture["analysis_bounds_in_source"],"upsampled":False},"whole")
    regions=[r for r in reviewed["analysis"]["regions"] if r["id"].startswith("semantic-region-") and reviewed["review_status"].get(r["id"],{}).get("status")!="rejected"]
    if not regions:raise ValueError("No usable semantic regions; a reviewed region set is required for this stage")
    baseline=json.loads((source/"baseline-analysis.json").read_text())
    base_claims={c["id"]:c for c in original["claims"]}
    old_by_region={e["region_id"]:c for c in original["claims"] if c["id"].startswith("SO-") for e in c["evidence"]}
    edits={e["entity_id"]:e for e in record["edits"]}
    new_claims=[]
    for region in regions:
        rid=region["id"];short=rid.removeprefix("semantic-region-")
        progress("Inspecting "+short+" at whole, context and detail scales")
        context,context_meta=crop_view(native,region["bbox_normalized"],capture["analysis_bounds_in_source"],.4,512)
        detail,detail_meta=crop_view(native,region["bbox_normalized"],capture["analysis_bounds_in_source"],0,384)
        context_view=save_view(short+"-context",context,context_meta,"group")
        detail_view=save_view(short+"-detail",detail,detail_meta,"detail")
        bounds=capture["analysis_bounds_in_source"]
        box=[(region["bbox_normalized"][i]-bounds[i%2])/(bounds[i%2+2]-bounds[i%2]) for i in range(4)]
        localized=image.copy();draw=ImageDraw.Draw(localized)
        draw.rectangle([round(box[i]*(image.width if i%2==0 else image.height)) for i in range(4)],outline="#ffcf56",width=3)
        location_view=save_view(short+"-location",localized,{"bbox_source":bounds,"upsampled":False},"whole")
        location={"target_bbox_in_whole_analysis_frame":box,"is_whole":(box[2]-box[0])*(box[3]-box[1])>.95,
            "coordinate_convention":"normalized left,top,right,bottom; x rightward, y downward"}
        inspection=backend.inspect(short,[localized,context,detail],location=location)
        inspections[short]=inspection;audit.append(inspection)
        payload=inspection["payload"]
        old=old_by_region[rid]
        claim=copy.deepcopy(old)
        status=reviewed["review_status"].get(old["id"],{}).get("status","unreviewed")
        human=edits.get(old["id"],{})
        use_review="statement" in human and status in {"accepted","revised"}
        chosen=next(c for c in reviewed["analysis"]["claims"] if c["id"]==old["id"]) if use_review else None
        if chosen:
            claim=copy.deepcopy(chosen)
            for s in reviewed["analysis"]["sources"]:
                if s["id"] not in {x["id"] for x in baseline["sources"]}:baseline["sources"].append(s)
        else:
            claim["statement"]=payload["description"]
            claim["evidence"]=[{"kind":"image_region","image_id":"image-overall","region_id":rid,"source_id":None,
                "locator":"inspections.json#/"+short+"/payload/description","support_note":"New local model inspection of whole/context/detail views; unreviewed.",
                "method":backend.lock["model_id"]+" @ "+backend.lock["revision"],"value":None,"unit":None,"modality_or_conditions":"Source reproduction, capped at 2048 pixels; no physical-material determination."}]
            claim["missing_evidence"]=["Independent perceptual review",payload["limitation"]]
            claim["scope"]="Fresh model proposal after reinspection; not reviewer acceptance."
        new_claims.append(claim)
        new_region=copy.deepcopy(region)
        if "label" not in edits.get(rid,{}):new_region["label"]=payload["label"]+" (reinspected model proposal, unreviewed)"
        baseline["regions"].append(new_region)
        eid="E-"+short
        evidence.append({"id":eid,"kind":"reviewer_assertion" if use_review else "visual_description","scale":"group",
            "statement":claim["statement"],"region_ids":[rid],"view_ids":[location_view,context_view,detail_view],
            "source_claim_id":old["id"],"status":"reviewer_attributed" if use_review else "model_proposal_unreviewed",
            "limitations":[payload["limitation"],"Human text retained; model reinspection remains separate" if use_review else "Model output is not independent verification"]})
        for key,scale,view_id in (("context_relation","group",context_view),("detail_observation","detail",detail_view)):
            evidence.append({"id":eid+"-"+key,"kind":"visual_description","scale":scale,"statement":payload[key],
                "region_ids":[rid],"view_ids":[view_id],"source_claim_id":None,"status":"model_proposal_unreviewed",
                "limitations":[payload["limitation"],payload["detail_adequacy"] if scale=="detail" else "Context-crop positions are not necessarily whole-painting positions; inspect the location view",payload["scale_agreement"]]})
        evidence.append({"id":"B-"+short,"kind":"measurement","scale":"whole","statement":f'Proposed region {short} has analysis-frame box {box}; its width is {box[2]-box[0]:.3f} and height {box[3]-box[1]:.3f} of the frame. This is a proposed box envelope, not a measured object silhouette.',
            "region_ids":[rid],"view_ids":[location_view],"source_claim_id":None,"status":"measured",
            "limitations":["Coordinates measure the supplied model/reviewer box; identity and silhouette remain unverified"],"facts":{"bbox_analysis":box}})
    baseline["claims"]+=new_claims
    fresh_formal=copy.deepcopy(formal)
    recomputed=articulate(baseline,fresh_formal)
    measurements=json.loads((source/"measurements.json").read_text())
    validate(recomputed,measurements,{"formal.json":fresh_formal})
    for claim in recomputed["claims"]:
        if claim["kind"]!="measurement":continue
        item={"id":"M-"+claim["id"],"kind":"measurement","scale":"whole" if claim["id"].startswith("C") else "group",
            "statement":claim["statement"],"region_ids":list(dict.fromkeys(e["region_id"] for e in claim["evidence"] if e["region_id"])),
            "view_ids":[whole_view],"source_claim_id":claim["id"],"status":"measured","limitations":[claim["scope"]]}
        if claim["id"].startswith("FM-"):
            field=next(f for f in fresh_formal["fields"] if "FM-"+f["id"]==claim["id"])
            item["facts"]={k:field[k] for k in ("centroid_analysis","bbox_analysis","mean_lightness","principal_axis_degrees","axis_variance_ratio")}
            item["facts"]["field_id"]=field["id"]
            item["statement"]+=f' Field centroid: {field["centroid_analysis"]}. Principal axis: {field["principal_axis_degrees"]} degrees, 0/180 horizontal and 90 vertical. These values belong only to {field["id"]}.'
        evidence.append(item)
    for item in evidence:
        if item["kind"]!="measurement" and EXTERNAL.search(item["statement"]):
            item["status"]="requires_external_evidence"
            item["limitations"].append("Technical/history wording in an image-based description is unverified; excluded from reasoning input")
    usable=[e for e in evidence if e["status"] not in {"requires_external_evidence","rejected","needs_review"}]
    candidates=[{"id":c["id"],"mechanism":c["kind"],"field_ids":c["field_ids"],"origin":"unreviewed_rule"} for c in fresh_formal["configurations"] if c["hierarchy"]=="principal"]
    for eid,edit in edits.items():
        if eid.startswith(("SI-","FC-")) and reviewed["review_status"].get(eid,{}).get("status") in {"accepted","revised"}:
            c=next(c for c in reviewed["analysis"]["claims"] if c["id"]==eid)
            candidates.append({"id":eid,"statement":c["statement"],"alternative":" ".join(c["alternatives"]),"origin":"reviewer_hypothesis_not_observed_fact"})
        elif eid.startswith(("SI-","FC-")) and edit["status"]=="rejected":
            candidates.append({"id":eid,"statement":base_claims[eid]["statement"],"alternative":edit.get("note","Reviewer rejected this reading"),"origin":"rejected_by_reviewer_do_not_repeat_as_accepted"})
    for edit in (clause_feedback or {}).get("edits",[]):
        prior=next(c for c in previous_result["clauses"] if c["id"]==edit["clause_id"])
        candidates.append({"id":"prior-"+edit["clause_id"],"statement":edit.get("statement",prior["statement"]),
            "alternative":edit.get("note","No additional reviewer note"),"origin":"reviewer_"+edit["decision"]+"_hypothesis_not_observed_fact"})
    progress("Generating evidence-linked atomic clauses")
    generated=backend.explain(usable,candidates,image);audit.append(generated)
    initial_flags=[]
    for x in generated["payload"]["explanations"]:
        for c in x["clauses"]:
            issues=numeric_checks(c,{e["id"]:e for e in usable})
            if c["kind"]=="visual_description" and interpretive_language(c["statement"]):issues.append("Literal description includes an inferred effect")
            if issues:initial_flags.append({"statement":c["statement"],"issues":issues})
    if initial_flags:
        progress("Revising clauses once after deterministic reference/type checks")
        repaired=backend.explain(usable,candidates,image,repair={"earlier":generated["payload"],"problems":initial_flags})
        audit.append(repaired);generated=repaired
    clauses=[];explanations=[]
    for index,explanation in enumerate(generated["payload"]["explanations"],1):
        ids=[]
        for j,clause in enumerate(explanation["clauses"],1):
            cid=f"X{index}-C{j}";ids.append(cid);clauses.append({"id":cid,**clause})
        explanations.append({"id":f"X{index}","title":explanation["title"],"clause_ids":ids})
    cases,plan=make_cases(clauses,usable)
    assessments=[]
    for start in range(0,len(cases),9):
        progress(f"Testing evidence use: cases {start+1}–{min(len(cases),start+9)} of {len(cases)}")
        response=backend.assess(cases[start:start+9]);audit.append(response);assessments+=response["payload"]["assessments"]
    by_case={a["case_id"]:a for a in assessments}
    lookup={e["id"]:e for e in evidence}
    clauses=[enforce_clause(c,by_case[next(p["case_id"] for p in plan if p["clause_id"]==c["id"] and p["condition"]=="cited_plus_distractor")],lookup) for c in clauses]
    violations=[p["case_id"] for p in plan if p["condition"]=="empty_evidence" and by_case[p["case_id"]]["assessment"] not in {"unsupported","requires_external_evidence"}]
    factor=min(1,256/max(image.size))
    variant_images=[("original",image), ("value_only",neutral_image(image)),("resolution_256",image.resize((max(1,round(image.width*factor)),max(1,round(image.height*factor))),Image.Resampling.LANCZOS))]
    variants=[]
    visual_cases=[{"case_id":c["id"],"proposition":c["statement"],"evidence":[]} for c in clauses]
    for name,picture in variant_images:
        progress("Comparing visible support in "+name)
        view_id=save_view("variant-"+name,picture,{"bbox_source":capture["analysis_bounds_in_source"],"upsampled":False},"whole")
        response=backend.assess(visual_cases,picture,"visual-comparison");audit.append(response)
        variants.append({"id":name,"view_id":view_id,"metrics":metric_summary(picture),"assessments":response["payload"]["assessments"]})
    evidence_diff=[]
    for claim in new_claims:
        if claim["statement"]!=base_claims[claim["id"]]["statement"]:
            evidence_diff.append({"claim_id":claim["id"],"before":base_claims[claim["id"]]["statement"],"after":claim["statement"],"assessment":"Text changed; semantic agreement requires review"})
    result={"version":VERSION,"work_id":work_id,"generated_at":datetime.now(timezone.utc).isoformat(),
        "binding":{"base_sha256":record["base_sha256"],"review_revision":record["revision"],"image_sha256":capture["input_sha256"],"code_sha256":execution_code},
        "model":{"id":backend.lock["model_id"],"revision":backend.lock["revision"],"runtime":getattr(backend,"runtime",{}),"independent_validation":False},
        "views":views,"evidence":evidence,"explanations":explanations,"clauses":clauses,
        "evidence_tests":{"plan":plan,"assessments":assessments,"empty_evidence_violations":violations,
            "limits":"Text-only paired tests probe the model's use of supplied evidence. Cited-fact removal may leave redundant support. Distractors are uncited, not guaranteed semantically irrelevant. Raw model verdicts are retained; no aesthetic score or causal proof is inferred."},
        "visual_comparisons":variants,"reanalysis":{"changed_review_entities":list(edits),"description_changes":evidence_diff,
            "inspected_regions":[r["id"] for r in regions],"cache_hits":sum(bool(v.get("cache_hit")) for v in inspections.values()),
            "reviewer_text_preserved":[e["source_claim_id"] for e in evidence if e["kind"]=="reviewer_assertion"]},
        "open_question":generated["payload"]["open_question"],"limits":["Model reinspection, generation and auditing use the same checkpoint; errors can be shared.",
            "Visible marks at this source resolution do not establish physical materials or technique.","Controlled transformations test analysis sensitivity, not artistic intent, actual viewer response or a painting's value.",
            "No task-specific model training, scholarship retrieval or independent expert evaluation has been performed."]}
    result["reanalysis"]["clause_feedback"]=copy.deepcopy((clause_feedback or {}).get("edits",[]))
    result["reanalysis"]["clause_feedback_revision"]=(clause_feedback or {}).get("revision",0)
    result["reanalysis"]["clause_changes"]=[{"position":c["id"],"before":next((p["statement"] for p in previous_result["clauses"] if p["id"]==c["id"]),None),"after":c["statement"]} for c in clauses] if previous_result else []
    result["reanalysis"]["comparison_limit"]="Clause diffs are by output position, not a claim of semantic correspondence. Reviewer judgments remain bound to the earlier run; new clauses require new review."
    result["reanalysis"]["bounded_revision"]={"attempted":bool(initial_flags),"trigger_flags":initial_flags,"remaining_numeric_flags":[{"clause_id":c["id"],"issues":numeric_checks(c,lookup)} for c in clauses if numeric_checks(c,lookup)]}
    if code_digest()!=execution_code:raise RuntimeError("Runtime sources changed during analysis; cached native responses are retained, but this mixed-source run was not published")
    validation=validate_reasoning(result)
    for name,value in (("reasoning.json",result),("inspections.json",inspections),("inference-audit.json",audit),
                       ("recomputed-analysis.json",recomputed),("recomputed-formal.json",fresh_formal),("validation.json",validation)):
        dump(output/name,value)
    from .reasoning_report import render_reasoning
    (output/"report.html").write_text(render_reasoning(result,original,image,output))
    progress("Complete; proposals await review")
    return result
