"""Artifact-bound reading history; publish only against unchanged feedback and parent."""
from contextlib import contextmanager
import fcntl
import json
from pathlib import Path
import re
from .assessment_review import LOCK
from .reasoning import sha,dump
from .review import Conflict
from .reading_feedback import ReadingFeedbackStore

@contextmanager
def transaction(runs,wid):
    if not re.fullmatch(r'met-\d+',wid):raise ValueError('Invalid work identity')
    root=Path(runs).resolve();folder=root/wid
    if not folder.resolve().is_relative_to(root) or not folder.is_dir():raise ValueError('Unknown reading')
    with LOCK:
        with (folder/'.revision.lock').open('a') as handle:
            fcntl.flock(handle,fcntl.LOCK_EX)
            try:yield
            finally:fcntl.flock(handle,fcntl.LOCK_UN)

class ReadingRevisionStore:
    def __init__(self,runs,reviews):
        self.runs=Path(runs).resolve();self.feedback=ReadingFeedbackStore(self.runs,reviews)
    def resolve(self,wid,rid):
        base,binding=self.feedback.resolve(wid)
        if rid=='baseline':return base,binding
        if not isinstance(rid,str) or not re.fullmatch(r'[a-f0-9]{32}',rid):raise ValueError('Invalid reading revision')
        file=self.runs/wid/'revisions'/rid/'revision.json'
        if not file.resolve().is_relative_to(self.runs) or not file.is_file():raise ValueError('Unknown reading revision')
        r=json.loads(file.read_text())
        if r['work_id']!=wid or r['revision_id']!=rid or r['binding']['base_sha256']!=binding:raise Conflict('Revision source binding changed')
        return r,sha(file)
    def history(self,wid):
        _,binding=self.feedback.resolve(wid);out=[]
        for path in (self.runs/wid/'revisions').glob('*/published.json'):
            if not path.resolve().is_relative_to(self.runs):raise ValueError('Invalid history path')
            p=json.loads(path.read_text());r,digest=self.resolve(wid,path.parent.name)
            if p['artifact_sha256']!=digest or p['base_sha256']!=binding or not r['display']['eligible_for_display']:raise Conflict('Published revision changed')
            out.append(p)
        out.sort(key=lambda p:p['ordinal'])
        if [p['ordinal'] for p in out]!=list(range(1,len(out)+1)):raise Conflict('Incomplete reading publication history')
        parent='baseline'
        for p in out:
            if p['parent_revision_id']!=parent:raise Conflict('Reading history parent mismatch')
            parent=p['revision_id']
        return out
    def state(self,wid):
        with transaction(self.runs,wid):
            base,binding=self.feedback.resolve(wid);history=self.history(wid);latest=history[-1] if history else None
            r,_=self.resolve(wid,latest['revision_id']) if latest else (None,None)
            return {'work_id':wid,'base_sha256':binding,'revision_id':latest['revision_id'] if latest else 'baseline',
                'paragraph':r['display']['paragraph'] if r else base['display']['paragraph'],
                'paragraph_origin':r['display'].get('origin','native_revision_draft') if r else base['display']['origin'],
                'changes':r['changes'] if r else None,'history':history,'feedback':self.feedback.read(wid),
                'scope':'Your reading and revision history; automated checks are not expert validation.'}
    def publish(self,wid,rid,expected_feedback,expected_parent):
        with transaction(self.runs,wid):
            r,digest=self.resolve(wid,rid);current=self.feedback.read(wid);history=self.history(wid)
            from .reading_revision import validate_revision,revision_evidence
            validate_revision(r)
            base,binding=self.feedback.resolve(wid)
            if r['evidence']!=revision_evidence(base):raise Conflict('Revision evidence no longer matches its source')
            current_parent=history[-1]['revision_id'] if history else 'baseline'
            if current!=expected_feedback or current_parent!=expected_parent:raise Conflict('Correction or displayed reading changed during inference')
            if r['correction']!=expected_feedback or r['binding']['parent_revision_id']!=expected_parent:raise Conflict('Revision does not match submitted correction')
            _,parent_digest=self.resolve(wid,expected_parent)
            if r['binding']['parent_sha256']!=parent_digest:raise Conflict('Parent reading changed during inference')
            if not r['display']['eligible_for_display']:return False
            publication={'ordinal':len(history)+1,'work_id':wid,'revision_id':rid,'artifact_sha256':digest,
                'base_sha256':current['artifact_sha256'],'feedback_revision':current['revision'],'parent_revision_id':expected_parent,
                'report_url':f'/reading/{wid}/revisions/{rid}/report.html'}
            file=self.runs/wid/'revisions'/rid/'published.json'
            with file.open('x') as handle:json.dump(publication,handle,indent=2,ensure_ascii=False);handle.write('\n')
            dump(self.runs/wid/'latest-revision.json',publication)
            return True
