"""Single-GPU queue with immutable inputs, revision checks and bounded local processes."""
from __future__ import annotations

import json
import os
from pathlib import Path
import queue
import re
import subprocess
import sys
import threading
import uuid
from datetime import datetime,timezone

from .reasoning import ROOT, dump
from .reasoning_review import ClauseReviewStore
from .review import Conflict

def owner_alive(status):
    pid=status.get('owner_pid')
    if type(pid) is not int:return False
    try:os.kill(pid,0);return True
    except ProcessLookupError:return False
    except PermissionError:return True


class JobManager:
    def __init__(self,store,runs=None,python=None):
        self.store=store
        self.runs=Path(runs or ROOT/"runs/reasoning")
        self.jobs=self.runs/"jobs"
        self.clauses=ClauseReviewStore(self.runs,store.reviews)
        from .reading_revision_store import ReadingRevisionStore
        self.readings=ReadingRevisionStore(self.runs.parent/'reading',store.reviews)
        prepared=ROOT/"../../work/painting-vlm-env/bin/python"
        # Preserve the venv executable path; resolving its symlink loses pyvenv.cfg.
        self.python=str(python or (os.path.abspath(prepared) if prepared.is_file() else sys.executable))
        self.queue=queue.Queue(maxsize=4);self.lock=threading.RLock();self.active={};self.processes={};self.stopping=False
        for path in self.jobs.glob('*/status.json'):
            status=json.loads(path.read_text())
            if status.get('kind')=='reading_revision' and status['status'] in {'queued','running','generated'} and not owner_alive(status):
                status.update(status='failed',message='The local server stopped before publication. Your correction and earlier reading are preserved; retry is available.')
                dump(path,status)
        self.thread=threading.Thread(target=self._work,daemon=True);self.thread.start()

    def submit_reading(self,work_id,payload):
        from .reading_revision_store import transaction
        with self.lock,transaction(self.readings.runs,work_id):
            feedback=self.readings.feedback.read(work_id)
            if type(payload.get('expected_revision')) is not int or payload['expected_revision']!=feedback['revision'] or payload.get('artifact_sha256')!=feedback['artifact_sha256']:
                raise Conflict('Correction changed; reload before applying it')
            if feedback.get('choice')!='missing' or not feedback.get('note'):raise ValueError('No correction to apply')
            rid=feedback.get('reading_revision_id','baseline');history=self.readings.history(work_id)
            if rid!=(history[-1]['revision_id'] if history else 'baseline'):raise Conflict('This correction belongs to an earlier reading')
            if payload.get('reading_revision_id',rid)!=rid:raise Conflict('Displayed reading changed')
            key='reading:'+work_id
            if key in self.active:return self.read(self.active[key])
            for path in self.jobs.glob('*/status.json'):
                existing=json.loads(path.read_text())
                if existing.get('kind')=='reading_revision' and existing['work_id']==work_id and existing['status'] in {'queued','running','generated'} and owner_alive(existing):return existing
            if self.queue.full() or self.stopping:raise Conflict('Local inference queue is full or stopping')
            parent,parent_hash=self.readings.resolve(work_id,rid);base,binding=self.readings.feedback.resolve(work_id)
            job_id=uuid.uuid4().hex;folder=self.jobs/job_id;folder.mkdir(parents=True)
            output=self.readings.runs/work_id/'revisions'/job_id
            submission={'kind':'reading_revision','job_id':job_id,'work_id':work_id,'feedback':feedback,
                'base_sha256':binding,'parent_revision_id':rid,'parent_sha256':parent_hash,'output':str(output)}
            dump(folder/'submission.json',submission)
            status={'kind':'reading_revision','job_id':job_id,'work_id':work_id,'status':'queued',
                'owner_pid':os.getpid(),
                'submitted_at':datetime.now(timezone.utc).isoformat(),
                'feedback_revision':feedback['revision'],'message':'Your correction is saved; waiting for the local reading worker'}
            dump(folder/'status.json',status);self.active[key]=job_id;self.queue.put(job_id);return status

    def reading_state(self,work_id):
        with self.lock:
            state=self.readings.state(work_id);active_id=self.active.get('reading:'+work_id)
            active=self.read(active_id) if active_id else None
            jobs=[]
            for path in self.jobs.glob('*/status.json'):
                s=json.loads(path.read_text())
                if s.get('kind')=='reading_revision' and s['work_id']==work_id:jobs.append(s)
            jobs.sort(key=lambda s:(s['feedback_revision'],s.get('submitted_at',''),s['job_id']))
            if not active:active=next((s for s in reversed(jobs) if s['status'] in {'queued','running','generated'} and owner_alive(s)),None)
            state.update(active=active,last_job=active or (jobs[-1] if jobs else None))
            return state

    def submit(self,work_id,payload):
        with self.lock:
            state=self.store.read(work_id)
            record=state["record"]
            if payload.get("expected_revision")!=record["revision"] or type(payload.get("expected_revision")) is not int or payload.get("base_sha256")!=record["base_sha256"]:
                raise Conflict("Review changed; reload before requesting reanalysis")
            if work_id in self.active:raise Conflict("A reanalysis is already queued/running for this work")
            if self.queue.full() or self.stopping:raise Conflict("Local inference queue is full or stopping")
            run_id=payload.get("from_run","baseline")
            directory,previous,result_hash=self.clauses.resolve(work_id,run_id)
            feedback=self.clauses.read(work_id,run_id)["record"]
            if type(payload.get("clause_review_revision")) is not int or payload.get("clause_review_revision")!=feedback["revision"] or payload.get("result_sha256")!=result_hash:
                raise Conflict("Reasoning or clause judgments changed; reload before reanalysis")
            job_id=uuid.uuid4().hex
            folder=self.jobs/job_id;folder.mkdir(parents=True)
            output=self.runs/work_id/"reanalyses"/job_id
            submission={"job_id":job_id,"work_id":work_id,"review_record":record,"clause_review":feedback,
                "from_run":run_id,
                "previous_result":str(directory/"reasoning.json"),"previous_result_sha256":result_hash,"output":str(output)}
            dump(folder/"submission.json",submission)
            status={"job_id":job_id,"work_id":work_id,"status":"queued","message":"Waiting for the local GPU worker", "review_revision":record["revision"],"clause_review_revision":feedback["revision"]}
            dump(folder/"status.json",status)
            self.active[work_id]=job_id;self.queue.put(job_id)
            return status

    def read(self,job_id):
        if not re.fullmatch(r"[a-f0-9]{32}",job_id):raise ValueError("Invalid job ID")
        path=self.jobs/job_id/"status.json"
        if not path.is_file():raise ValueError("Unknown reanalysis job")
        return json.loads(path.read_text())

    def state(self,work_id):
        current=self.store.read(work_id)["record"]
        latest_path=self.runs/work_id/"latest-reanalysis.json"
        latest=json.loads(latest_path.read_text()) if latest_path.exists() else None
        if latest:
            latest["is_current"]=latest["review_revision"]==current["revision"]
            try:
                clause=self.clauses.read(work_id,latest["source_run_id"])["record"]
                latest["is_current"] &= clause["revision"]==latest["clause_review_revision"]
            except (ValueError,KeyError):latest["is_current"]=False
        with self.lock:
            active_id=self.active.get(work_id)
            active=self.read(active_id) if active_id else None
        return {"active":active,"latest":latest}

    def cancel(self,job_id):
        with self.lock:
            status=self.read(job_id)
            if status["status"] not in {"queued","running","generated"}:raise Conflict("Job is already finished")
            process=self.processes.get(job_id)
            if process is not None:process.terminate()
            status.update(status="cancelled",message="Cancelled; original and earlier successful outputs remain available")
            dump(self.jobs/job_id/"status.json",status)
            return status

    def _work(self):
        while not self.stopping:
            try:job_id=self.queue.get(timeout=.5)
            except queue.Empty:continue
            folder=self.jobs/job_id
            try:
                status=self.read(job_id)
                if status["status"]=="cancelled":continue
                with self.lock:
                    submission=json.loads((folder/'submission.json').read_text())
                    worker='painting_analysis.reading_worker' if submission.get('kind')=='reading_revision' else 'painting_analysis.reasoning_worker'
                    with (folder/"worker.log").open("w") as log:
                        process=subprocess.Popen([self.python,"-m",worker,str(folder)],cwd=ROOT,stdout=log,stderr=subprocess.STDOUT)
                    self.processes[job_id]=process
                code=process.wait()
                with self.lock:
                    latest=self.read(job_id)
                    if latest["status"]=="cancelled":continue
                    if code!=0:
                        latest.update(status="failed",message="Local inference failed; inspect the saved worker log. Earlier successful results are preserved.")
                    elif latest["status"]=="generated":
                        submission=json.loads((folder/"submission.json").read_text())
                        if submission.get('kind')=='reading_revision':
                            try:
                                published=self.readings.publish(latest['work_id'],job_id,submission['feedback'],submission['parent_revision_id'])
                                latest.update(status='complete' if published else 'rejected',message='Your correction has been applied; the earlier reading is preserved.' if published else 'The proposed revision failed its evidence or wording checks. Your correction is saved; the earlier reading remains visible.')
                            except Conflict:
                                latest.update(status='superseded',message='A newer correction or reading arrived; this proposal is preserved but was not applied.')
                            dump(folder/'status.json',latest)
                            continue
                        current=self.store.read(latest["work_id"])["record"]
                        prior_path=Path(submission["previous_result"])
                        from .reasoning import sha
                        clause_current=self.clauses.read(latest["work_id"],submission["from_run"])["record"]
                        latest["source_run_id"]=submission["from_run"]
                        if current["revision"]!=submission["review_record"]["revision"] or current["base_sha256"]!=submission["review_record"]["base_sha256"] or sha(prior_path)!=submission["previous_result_sha256"] or clause_current["revision"]!=submission["clause_review"]["revision"]:
                            latest.update(status="superseded",message="Completed against older review inputs; retained for inspection but not published as current")
                        else:
                            latest.update(status="complete",message="Reanalysis complete; new proposals await review")
                            dump(self.runs/latest["work_id"]/"latest-reanalysis.json",latest)
                    dump(folder/"status.json",latest)
            except Exception as exc:
                status=self.read(job_id);status.update(status="failed",message=str(exc)[:600]);dump(folder/"status.json",status)
            finally:
                with self.lock:
                    key=('reading:' if status.get('kind')=='reading_revision' else '')+status['work_id']
                    self.active.pop(key,None);self.processes.pop(job_id,None)
                    if status.get('kind')=='reading_revision' and not self.stopping:
                        newer=self.readings.feedback.read(status['work_id'])
                        if newer['revision']>status['feedback_revision'] and newer.get('choice')=='missing' and newer.get('note') and newer.get('actor')=='local_viewer':
                            try:self.submit_reading(status['work_id'],{'expected_revision':newer['revision'],'artifact_sha256':newer['artifact_sha256']})
                            except (Conflict,ValueError):pass
                self.queue.task_done()

    def close(self):
        with self.lock:
            self.stopping=True
            for job_id in list(self.active.values()):
                if self.read(job_id)["status"] in {"queued","running","generated"}:self.cancel(job_id)

