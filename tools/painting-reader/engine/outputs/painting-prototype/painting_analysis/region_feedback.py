"""Append-only viewer corrections bound to exact region and displayed evidence."""
import contextlib,fcntl,hashlib,json,os,re,tempfile
from datetime import datetime,timezone
from pathlib import Path

class FeedbackConflict(ValueError):pass
def encoded(value):return (json.dumps(value,sort_keys=True,ensure_ascii=False,allow_nan=False,indent=2)+'\n').encode()
def fingerprint(value):return hashlib.sha256(encoded(value)).hexdigest()

class RegionFeedbackStore:
    def __init__(self,catalog,root,*,actor='local_viewer'):
        self.catalog=json.loads(json.dumps(catalog));self.root=Path(root).resolve();self.root.mkdir(parents=True,exist_ok=True)
        if actor not in {'local_viewer','integration_test'}:raise ValueError('Explicit feedback actor required')
        self.actor=actor
    def binding(self,case_id,region_id):
        if not isinstance(case_id,str) or not re.fullmatch(r'(?:aic|met)-[0-9]+',case_id):raise ValueError('Invalid painting ID')
        if not isinstance(region_id,str) or not re.fullmatch(r'[A-Za-z][A-Za-z0-9_-]{0,79}',region_id):raise ValueError('Invalid region ID')
        try:return dict(self.catalog['cases'][case_id][region_id])
        except KeyError as exc:raise ValueError('Unknown painting or region') from exc
    def folder(self,case_id,region_id):
        return self.root/case_id/region_id/fingerprint(self.binding(case_id,region_id))
    @contextlib.contextmanager
    def locked(self):
        with (self.root/'.lock').open('a+b') as lock:
            fcntl.flock(lock,fcntl.LOCK_EX)
            try:yield
            finally:fcntl.flock(lock,fcntl.LOCK_UN)
    def _records(self,case_id,region_id):
        folder=self.folder(case_id,region_id)
        records=[json.loads(p.read_text()) for p in sorted(folder.glob('[0-9]*.json'))]
        for i,r in enumerate(records,1):
            if r['revision']!=i or r['source_binding']!=self.binding(case_id,region_id):raise FeedbackConflict('Saved history needs inspection')
        return records
    def history(self,case_id,region_id):
        with self.locked():
            records=self._records(case_id,region_id)
            return {'case_id':case_id,'region_id':region_id,'binding':self.binding(case_id,region_id),
                'revision':len(records),'records':records,'independent_validation':False}
    def save(self,payload):
        required={'case_id','region_id','source_binding','expected_revision','request_id','choice','note','view_id'}
        if not isinstance(payload,dict) or set(payload)!=required:raise ValueError('Explicit feedback fields required')
        cid,rid=payload['case_id'],payload['region_id'];binding=self.binding(cid,rid)
        if payload['source_binding']!=binding:raise FeedbackConflict('The displayed region or model proposal changed; reload before saving')
        if type(payload['expected_revision']) is not int or payload['expected_revision']<0:raise ValueError('Invalid revision')
        if not isinstance(payload['request_id'],str) or not re.fullmatch(r'[a-f0-9]{32}',payload['request_id']):raise ValueError('Invalid request ID')
        if payload['choice'] not in {'fits','does_not_fit','uncertain'}:raise ValueError('Unknown feedback choice')
        if not isinstance(payload['note'],str) or len(payload['note'])>2000:raise ValueError('Note must contain at most2000characters')
        if payload['view_id']!='localized_context_and_selected_pixels':raise ValueError('Record the actual supported display context')
        with self.locked():
            previous=self._records(cid,rid)
            repeated=next((r for r in previous if r['request_id']==payload['request_id']),None)
            if repeated:
                if repeated['request_fingerprint']!=fingerprint(payload):raise FeedbackConflict('Request ID reused for different content')
                return repeated
            if payload['expected_revision']!=len(previous):raise FeedbackConflict('Another response was saved; refresh the history before saving')
            record={'revision':len(previous)+1,'id':payload['request_id'],'request_id':payload['request_id'],
                'request_fingerprint':fingerprint(payload),'case_id':cid,'region_id':rid,'source_binding':binding,
                'view_id':payload['view_id'],'choice':payload['choice'],'verbatim_note':payload['note'],
                'actor':self.actor,'recorded_at':datetime.now(timezone.utc).isoformat(),
                'status':'attributed_viewer_response' if self.actor=='local_viewer' else 'integration_test_fixture',
                'semantic_approval':False,'independent_validation':False,
                'scope':'A response to this displayed region and model description. Does not overwrite model outputs, establish a consensus, or constitute independent validation.'}
            folder=self.folder(cid,rid);folder.mkdir(parents=True,exist_ok=True);target=folder/(f'{record["revision"]:08d}.json')
            if target.exists():raise FeedbackConflict('History revision already exists')
            fd,tmp=tempfile.mkstemp(prefix='.pending-',dir=folder)
            try:
                with os.fdopen(fd,'wb') as stream:stream.write(encoded(record));stream.flush();os.fsync(stream.fileno())
                os.replace(tmp,target)
            finally:
                if os.path.exists(tmp):os.unlink(tmp)
            return record
