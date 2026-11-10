"""One low-effort response to a short reading, with immutable attributed history."""
from datetime import datetime,timezone
import json
import os
from pathlib import Path
import re
import uuid
from .reasoning import sha,dump
from .review import Conflict
from .assessment_review import LOCK


class ReadingFeedbackStore:
    def __init__(self,runs,reviews):self.runs=Path(runs).resolve();self.reviews=Path(reviews).resolve()
    def resolve(self,wid):
        if not re.fullmatch(r'met-[0-9]+',wid):raise ValueError('Invalid reading identity')
        file=self.runs/wid/'reading.json'
        if not file.is_file() or not file.resolve().is_relative_to(self.runs):raise ValueError('Unknown reading')
        result=json.loads(file.read_text())
        if result['work_id']!=wid:raise ValueError('Reading identity mismatch')
        return result,sha(file)
    def read(self,wid):
        _,binding=self.resolve(wid);folder=self.reviews/'reading-feedback'/wid/binding
        files=sorted((folder/'revisions').glob('[0-9][0-9][0-9][0-9][0-9][0-9].json'))
        record=json.loads(files[-1].read_text()) if files else {'revision':0,'artifact_sha256':binding,'choice':None,'note':None}
        if record['artifact_sha256']!=binding:raise Conflict('Reading feedback binding changed')
        return record
    def save(self,wid,payload):
        from .reading_revision_store import transaction,ReadingRevisionStore
        with transaction(self.runs,wid):
            current=self.read(wid)
            if type(payload.get('expected_revision')) is not int or payload['expected_revision']!=current['revision'] or payload.get('artifact_sha256')!=current['artifact_sha256']:raise Conflict('Reading changed; reload before saving')
            if payload.get('choice') not in {'fits','missing',None} or 'choice' not in payload:raise ValueError('Choose fits, missing or clear')
            if payload.get('actor') not in {'local_viewer','automated_test'}:raise ValueError('Reading feedback actor is required')
            rid=payload.get('reading_revision_id','baseline')
            if not isinstance(rid,str) or (rid!='baseline' and not re.fullmatch(r'[a-f0-9]{32}',rid)):raise ValueError('Invalid displayed reading')
            history=ReadingRevisionStore(self.runs,self.reviews).history(wid)
            if rid!=(history[-1]['revision_id'] if history else 'baseline'):raise Conflict('Displayed reading changed; reload before saving')
            note=payload.get('note')
            if note is not None and (not isinstance(note,str) or len(note)>2000):raise ValueError('Keep the note under 2000 characters')
            note=note.strip() or None if note is not None else None
            if payload['choice'] is None:note=None
            record={'version':'reading-feedback-0.1','work_id':wid,'artifact_sha256':current['artifact_sha256'],'revision':current['revision']+1,
                'recorded_at':datetime.now(timezone.utc).isoformat(),'choice':payload['choice'],'note':note,'actor':payload['actor'],
                'scope':'A response to whether this reading fits this viewer. Actor is client-declared; no expertise, independent accuracy or universal audience response is established.','model_judgments_changed':False}
            if 'reading_revision_id' in payload:record['reading_revision_id']=rid
            folder=self.reviews/'reading-feedback'/wid/record['artifact_sha256'];destination=folder/'revisions'/f'{record["revision"]:06}.json'
            temporary=destination.with_name('.publish-'+uuid.uuid4().hex+'.json');dump(temporary,record)
            try:os.link(temporary,destination)
            except FileExistsError as exc:raise Conflict('Reading feedback revision already published') from exc
            finally:temporary.unlink(missing_ok=True)
            dump(folder/'latest.json',record);return self.read(wid)
