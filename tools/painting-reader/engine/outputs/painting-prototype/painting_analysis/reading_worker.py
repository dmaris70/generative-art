"""Bounded local worker; publication is performed by the shared queue after rechecking inputs."""
import json
from pathlib import Path
import sys
from .reasoning import ROOT,dump,sha
from .reading_revision import run_revision
from .reading_revision_model import ReadingRevisionModel
from .reading_revision_store import ReadingRevisionStore

def main():
    folder=Path(sys.argv[1]).resolve();jobs=(ROOT/'runs/reasoning/jobs').resolve()
    if not folder.is_relative_to(jobs) or folder.parent!=jobs:raise ValueError('Worker folder outside job root')
    s=json.loads((folder/'submission.json').read_text());status=json.loads((folder/'status.json').read_text())
    def progress(message):status.update(status='running',message=message);dump(folder/'status.json',status)
    try:
        store=ReadingRevisionStore(ROOT/'runs/reading',ROOT/'reviews');base,binding=store.feedback.resolve(s['work_id'])
        parent,parent_hash=store.resolve(s['work_id'],s['parent_revision_id'])
        expected=ROOT/'runs/reading'/s['work_id']/'revisions'/s['job_id']
        if s['kind']!='reading_revision' or Path(s['output'])!=expected or folder.name!=s['job_id']:raise ValueError('Invalid revision submission')
        if binding!=s['base_sha256'] or parent_hash!=s['parent_sha256']:raise ValueError('Submitted source changed')
        progress('Loading the pinned local reading model')
        model=ReadingRevisionModel(ROOT/'runs/reading-revision-cache')
        run_revision(expected,base,s['feedback'],None if s['parent_revision_id']=='baseline' else parent,model,progress)
        status.update(status='generated',message='Checking that your correction and earlier reading are still current',
            report_url=f'/reading/{s["work_id"]}/revisions/{s["job_id"]}/report.html',result_sha256=sha(expected/'revision.json'))
        dump(folder/'status.json',status)
    except Exception as exc:
        status.update(status='failed',message=str(exc)[:800]);dump(folder/'status.json',status);raise

if __name__=='__main__':
    from .inference_slot import inference_slot
    with inference_slot():main()
