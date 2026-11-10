"""Artifact-bound component judgments; source analyses are never overwritten."""
from datetime import datetime,timezone
import json
import os
from pathlib import Path
import re
import threading
import uuid

from .reasoning import dump,sha
from .review import Conflict

LOCK=threading.RLock()


def review_targets(result):
    targets={};dependencies={}
    if result['artifact_kind'] in {'grounded_synthesis','grounded_synthesis_pair'}:
        for n in result['nodes']:
            targets[n['id']]=n['text'];dependencies[n['id']]=n['depends_on'][:]
    elif result["artifact_kind"]=="clause_audit":
        for clause in result["clauses"]:
            cid=clause["id"]
            for part in ("statement","bridge"):targets[cid+":"+part]=clause[part]["text"]
            dependencies[cid+":bridge"]=[cid+":statement"]
            proposal=clause["bridge_proposal"]
            if proposal and proposal["assessment"]:
                targets[cid+":proposal"]=proposal["assessment"]["text"];dependencies[cid+":proposal"]=[cid+":statement"]
    elif result['artifact_kind']=='compositional_roles':
        for answer in result['answers']:
            cid=answer['case_id']
            for part in ('observation','role','bridge','effect'):
                if part=='effect' and answer[part]['action']=='abstain':continue
                targets[cid+':'+part]=answer[part]['text']
            dependencies[cid+':role']=[cid+':observation']
            dependencies[cid+':bridge']=[cid+':observation',cid+':role']
            if cid+':effect' in targets:dependencies[cid+':effect']=[cid+':observation',cid+':role',cid+':bridge']
        for a in result['candidate_accounts']:
            for part in ('statement','bridge'):targets[a['id']+':'+part]=a[part]['text']
            dependencies[a['id']+':bridge']=[a['id']+':statement']
    elif result['artifact_kind']=='role_comparison':
        for item in result['comparisons']:
            cid=item['case_id']
            for part in ('statement','bridge'):targets[cid+':'+part]=item[part]['text']
            dependencies[cid+':bridge']=[cid+':statement']
    else:
        for item in result["comparisons"]:
            cid=item["id"]
            targets.update({cid+":left":item["left"]["statement"],cid+":right":item["right"]["statement"],cid+":relation":item["statement"],cid+":bridge":item["reasoning"]})
            dependencies[cid+":relation"]=[cid+":left",cid+":right"]
            dependencies[cid+":bridge"]=[cid+":left",cid+":right",cid+":relation"]
    return targets,dependencies


def component_review_state(result,record):
    targets,dependencies=review_targets(result)
    states={eid:{"status":"unreviewed","reasons":[]} for eid in targets}
    edits={e["target_id"]:e for e in record["edits"]}
    changed=set()
    for eid,e in edits.items():
        if eid not in targets:raise ValueError("Dangling reviewed component")
        states[eid]["status"]=e["decision"]
        if e["decision"]=="rejected" or "text" in e and e["text"]!=targets[eid]:changed.add(eid)
    for _ in range(len(targets)):
        before=len(changed)
        for eid,parents in dependencies.items():
            affected=sorted(set(parents)&changed)
            if affected:
                if states[eid]["status"]!="rejected":states[eid]["status"]="needs_review"
                states[eid]["reasons"]=["Changed/rejected component: "+", ".join(affected)]
                changed.add(eid)
        if len(changed)==before:break
    return states


class AssessmentReviewStore:
    def __init__(self,runs,reviews):
        self.runs,self.reviews=Path(runs).resolve(),Path(reviews).resolve()

    def resolve(self,kind,identity):
        valid=kind in {'audits','roles','arguments'} and re.fullmatch(r"met-[0-9]+",identity) or kind in {'comparisons','role-comparisons','pairs'} and re.fullmatch(r"met-[0-9]+--met-[0-9]+",identity)
        if not valid:raise ValueError("Invalid assessment identity")
        directory=self.runs/kind/identity
        path=directory/{'audits':'audit.json','comparisons':'comparison.json','roles':'roles.json','role-comparisons':'role-comparison.json','arguments':'synthesis.json','pairs':'synthesis-pair.json'}[kind]
        if not path.is_file() or not path.resolve().is_relative_to(self.runs):raise ValueError("Unknown assessment artifact")
        result=json.loads(path.read_text())
        if result.get("work_id" if kind in {'audits','roles','arguments'} else "pair_id")!=identity:raise ValueError("Assessment identity mismatch")
        return result,sha(path)

    def read(self,kind,identity):
        result,binding=self.resolve(kind,identity)
        directory=self.reviews/"assessments"/kind/identity/binding
        files=sorted((directory/"revisions").glob("[0-9][0-9][0-9][0-9][0-9][0-9].json")) if directory.exists() else []
        record=json.loads(files[-1].read_text()) if files else {"revision":0,"artifact_sha256":binding,"edits":[]}
        if record["artifact_sha256"]!=binding:raise Conflict("Review is bound to a different assessment")
        return {"record":record,"component_status":component_review_state(result,record)}

    def save(self,kind,identity,payload):
        with LOCK:
            current=self.read(kind,identity)["record"]
            if type(payload.get("expected_revision")) is not int or payload["expected_revision"]!=current["revision"] or payload.get("artifact_sha256")!=current["artifact_sha256"]:raise Conflict("Assessment or review changed; reload before saving")
            reviewer=payload.get("reviewer",{})
            if not isinstance(reviewer,dict) or reviewer.get("type") not in {"human","assistant","automated_test"} or not isinstance(reviewer.get("name"),str) or not 1<=len(reviewer["name"].strip())<=200:raise ValueError("Reviewer name and type required")
            result,_=self.resolve(kind,identity);targets,_=review_targets(result)
            edits=payload.get("edits")
            if not isinstance(edits,list) or len(edits)>len(targets):raise ValueError("Invalid component edits")
            seen=set()
            for edit in edits:
                if not isinstance(edit,dict) or set(edit)-{"target_id","decision","text","note"} or edit.get("target_id") not in targets or edit["target_id"] in seen or edit.get("decision") not in {"accepted","revised","rejected"}:raise ValueError("Invalid/duplicate component judgment")
                seen.add(edit["target_id"])
                for field in ("text","note"):
                    if field in edit and (not isinstance(edit[field],str) or not 1<=len(edit[field].strip())<=6000):raise ValueError("Review text must contain 1–6000 characters")
                if "text" in edit and edit["decision"]!="revised":raise ValueError("Changed wording requires a revised decision")
            record={"version":"component-review-0.5","kind":kind,"identity":identity,"artifact_sha256":current["artifact_sha256"],"revision":current["revision"]+1,
                "saved_at":datetime.now(timezone.utc).isoformat(),"reviewer":{"name":reviewer["name"].strip(),"type":reviewer["type"]},"edits":edits}
            prior={e["target_id"]:e for e in current["edits"]}
            record["edit_origins"]={e["target_id"]:(current.get("edit_origins",{}).get(e["target_id"],{k:current[k] for k in ("revision","reviewer","saved_at")}) if prior.get(e["target_id"])==e else {k:record[k] for k in ("revision","reviewer","saved_at")}) for e in edits}
            destination=self.reviews/"assessments"/kind/identity/record["artifact_sha256"]
            path=destination/"revisions"/f'{record["revision"]:06}.json'
            temporary=path.with_name(".publish-"+uuid.uuid4().hex+".json");dump(temporary,record)
            try:os.link(temporary,path)
            except FileExistsError as exc:raise Conflict("Component revision already exists") from exc
            finally:temporary.unlink(missing_ok=True)
            dump(destination/"latest.json",record)
            return self.read(kind,identity)


class RoleReviewStore(AssessmentReviewStore):
    """Live source-review dependency flags, without rewriting a paired artifact."""
    def read(self,kind,identity):
        if kind not in {'roles','role-comparisons'}:raise ValueError('Invalid compositional review kind')
        state=super().read(kind,identity)
        if kind=='role-comparisons':
            result,_=self.resolve(kind,identity)
            for work in result['works']:
                source,binding=self.resolve('roles',work['work_id'])
                if binding!=work['roles_sha256']:raise Conflict('Comparison source changed; regenerate in a new artifact')
                current=super().read('roles',work['work_id'])
                for item in result['comparisons']:
                    qid=item['case_id']
                    changed=[qid+':'+part for part in ('observation','role','bridge') if current['component_status'][qid+':'+part]['status'] in {'revised','rejected','needs_review'}]
                    changed += [eid for eid,s in current['component_status'].items() if eid.startswith(qid+'-H:') and s['status'] in {'revised','rejected','needs_review'}]
                    if changed:
                        for part in ('statement','bridge'):
                            s=state['component_status'][qid+':'+part]
                            if s['status']!='rejected':s['status']='needs_review'
                            s['reasons'].append('Source '+work['alias']+' reviewed premises changed: '+', '.join(changed))
        return state


class SynthesisReviewStore(AssessmentReviewStore):
    def read(self,kind,identity):
        if kind not in {'arguments','pairs'}:raise ValueError('Invalid synthesis review kind')
        state=super().read(kind,identity)
        if kind=='pairs':
            result,_=self.resolve(kind,identity)
            for work in result['works']:
                source,binding=self.resolve('arguments',work['work_id'])
                if binding!=work['synthesis_sha256']:raise Conflict('Paired synthesis source changed')
                reviewed=super().read('arguments',work['work_id'])['component_status']
                for selection in result['selection']:
                    own=selection[work['alias']];pids=[own['observation_id'].split(':',1)[1],own['account_id'].split(':',1)[1]]
                    changed=[pid for pid in pids if reviewed[pid]['status'] in {'revised','rejected','needs_review'}]
                    if changed:
                        for part in ('statement','bridge'):
                            s=state['component_status'][selection['question_id']+':'+part]
                            if s['status']!='rejected':s['status']='needs_review'
                            s['reasons'].append('Source '+work['alias']+' selected premises changed: '+', '.join(changed))
        return state
