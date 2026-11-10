"""Independent reviewer judgments bound to a particular immutable reasoning run."""
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import threading
import uuid

from .reasoning import dump, sha
from .review import Conflict

CLAUSE_LOCK=threading.RLock()


class ClauseReviewStore:
    def __init__(self, runs, reviews):
        self.runs,self.reviews=Path(runs).resolve(),Path(reviews).resolve()

    def resolve(self,work_id,run_id):
        if not re.fullmatch(r"met-[0-9]+",work_id) or not (run_id=="baseline" or re.fullmatch(r"[a-f0-9]{32}",run_id)):
            raise ValueError("Invalid reasoning run identity")
        directory=self.runs/work_id if run_id=="baseline" else self.runs/work_id/"reanalyses"/run_id
        file=directory/"reasoning.json"
        if not file.is_file() or not file.resolve().is_relative_to(self.runs):raise ValueError("Unknown completed reasoning run")
        result=json.loads(file.read_text())
        if result["work_id"]!=work_id:raise ValueError("Reasoning work ID mismatch")
        return directory,result,sha(file)

    def read(self,work_id,run_id):
        _,result,binding=self.resolve(work_id,run_id)
        history=self.reviews/work_id/"clauses"/binding/"revisions"
        files=sorted(history.glob("[0-9][0-9][0-9][0-9][0-9][0-9].json")) if history.exists() else []
        record=json.loads(files[-1].read_text()) if files else {"revision":0,"result_sha256":binding,"edits":[]}
        if record["result_sha256"]!=binding:raise Conflict("Clause review is bound to another reasoning result")
        clauses={c["id"]:c for c in result["clauses"]}
        for edit in record["edits"]:
            if edit["clause_id"] not in clauses:raise ValueError("Dangling reviewed clause")
        return {"record":record,"explanation_status":{x["id"]:("needs_review" if any(e["clause_id"] in x["clause_ids"] and e["decision"] in {"rejected","revised"} for e in record["edits"]) else "unreviewed") for x in result["explanations"]}}

    def save(self,work_id,run_id,payload):
        with CLAUSE_LOCK:
            current=self.read(work_id,run_id)["record"]
            if payload.get("expected_revision")!=current["revision"] or type(payload.get("expected_revision")) is not int or payload.get("result_sha256")!=current["result_sha256"]:
                raise Conflict("Clause review changed; reload before saving")
            reviewer=payload.get("reviewer",{})
            if not isinstance(reviewer,dict) or reviewer.get("type") not in {"human","assistant","automated_test"} or not isinstance(reviewer.get("name"),str) or not 1<=len(reviewer["name"].strip())<=200:
                raise ValueError("Reviewer name and type required")
            _,result,_=self.resolve(work_id,run_id)
            ids={c["id"] for c in result["clauses"]}
            edits=payload.get("edits")
            if not isinstance(edits,list) or len(edits)>len(ids):raise ValueError("Invalid clause edits")
            seen=set()
            for e in edits:
                if not isinstance(e,dict) or set(e)-{"clause_id","decision","statement","note"} or e.get("clause_id") not in ids or e["clause_id"] in seen or e.get("decision") not in {"accepted","revised","rejected"}:
                    raise ValueError("Invalid or duplicate clause judgment")
                seen.add(e["clause_id"])
                for field in ("statement","note"):
                    if field in e and (not isinstance(e[field],str) or not 1<=len(e[field].strip())<=6000):raise ValueError("Clause review text must contain 1–6000 characters")
                if "statement" in e and e["decision"]!="revised":raise ValueError("Changed wording requires revised decision")
            record={"version":"clause-review-0.4","revision":current["revision"]+1,"result_sha256":current["result_sha256"],
                "work_id":work_id,"run_id":run_id,"saved_at":datetime.now(timezone.utc).isoformat(),
                "reviewer":{"name":reviewer["name"].strip(),"type":reviewer["type"]},"edits":edits}
            previous={e["clause_id"]:e for e in current["edits"]}
            record["edit_origins"]={e["clause_id"]:(current.get("edit_origins",{}).get(e["clause_id"],{k:current[k] for k in ("revision","reviewer","saved_at")}) if previous.get(e["clause_id"])==e else {k:record[k] for k in ("revision","reviewer","saved_at")}) for e in edits}
            destination=self.reviews/work_id/"clauses"/record["result_sha256"]
            path=destination/"revisions"/f'{record["revision"]:06}.json'
            temporary=path.with_name(".publish-"+uuid.uuid4().hex+".json")
            dump(temporary,record)
            try:os.link(temporary,path)
            except FileExistsError as exc:raise Conflict("Clause revision already exists") from exc
            finally:temporary.unlink(missing_ok=True)
            dump(destination/"latest.json",record)
            return self.read(work_id,run_id)
