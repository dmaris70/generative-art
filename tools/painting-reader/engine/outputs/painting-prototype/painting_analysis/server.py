"""Local-only report server with bounded, same-origin review persistence."""
from __future__ import annotations

import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import secrets
from urllib.parse import unquote, urlsplit

from .review import ReviewStore, Conflict
from .reasoning_jobs import JobManager
from .assessment_review import AssessmentReviewStore,RoleReviewStore,SynthesisReviewStore
from .reading_feedback import ReadingFeedbackStore


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, root, store, token, jobs=None, **kwargs):
        self.root, self.store, self.token = Path(root).resolve(), store, token
        self.jobs=jobs
        self.assessments=AssessmentReviewStore(self.root/"understanding",store.reviews)
        self.roles=RoleReviewStore(self.root/'composition',store.reviews)
        self.synthesis=SynthesisReviewStore(self.root/'synthesis',store.reviews)
        self.readings=ReadingFeedbackStore(self.root/'reading',store.reviews)
        super().__init__(*args, directory=str(root), **kwargs)

    def log_message(self, *args):
        pass

    def valid_host(self):
        return self.headers.get("Host") == f"127.0.0.1:{self.server.server_port}"

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Referrer-Policy", "same-origin")
        self.send_header("X-Frame-Options", "DENY")
        super().end_headers()

    def reply(self, status, value):
        body = json.dumps(value, ensure_ascii=False, allow_nan=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if not self.valid_host():
            return self.reply(403, {"error": "Use the 127.0.0.1 local address"})
        path = urlsplit(self.path).path
        if path == "/api/bootstrap":
            return self.reply(200, {"token": self.token})
        if path.startswith(("/api/jobs/","/api/clauses/","/api/reanalysis-state/","/api/assessment-reviews/","/api/role-reviews/","/api/synthesis-reviews/","/api/reading-feedback/","/api/reading-state/")):
            if not secrets.compare_digest(self.headers.get("X-Review-Token", ""), self.token):
                return self.reply(403,{"error":"Review token required"})
            try:
                parts=path.strip("/").split("/")
                if len(parts)==3 and parts[1]=='reading-state':return self.reply(200,self.jobs.reading_state(parts[2]))
                if len(parts)==3 and parts[1]=='reading-feedback':return self.reply(200,self.readings.read(parts[2]))
                if len(parts)==3 and parts[1]=="jobs":return self.reply(200,self.jobs.read(parts[2]))
                if len(parts)==4 and parts[1]=="clauses":return self.reply(200,self.jobs.clauses.read(parts[2],parts[3]))
                if len(parts)==3 and parts[1]=="reanalysis-state":return self.reply(200,self.jobs.state(parts[2]))
                if len(parts)==4 and parts[1]=="assessment-reviews":return self.reply(200,self.assessments.read(parts[2],parts[3]))
                if len(parts)==4 and parts[1]=='role-reviews':return self.reply(200,self.roles.read(parts[2],parts[3]))
                if len(parts)==4 and parts[1]=='synthesis-reviews':return self.reply(200,self.synthesis.read(parts[2],parts[3]))
                raise ValueError("Invalid endpoint")
            except Conflict as exc:return self.reply(409,{"error":str(exc)})
            except (ValueError,KeyError) as exc:return self.reply(400,{"error":str(exc)})
        if path.startswith("/api/review/"):
            if not secrets.compare_digest(self.headers.get("X-Review-Token", ""), self.token):
                return self.reply(403, {"error": "Review token required"})
            try:
                return self.reply(200, self.store.read(path.removeprefix("/api/review/")))
            except Conflict as exc:
                return self.reply(409, {"error": str(exc)})
            except ValueError as exc:
                return self.reply(400, {"error": str(exc)})
        if path.startswith("/api/"):
            return self.reply(404, {"error": "Unknown API endpoint"})
        target = self.root / unquote(path).lstrip("/")
        if not target.resolve().is_relative_to(self.root) or any(part.startswith(".") for part in target.relative_to(self.root).parts):
            return self.reply(403, {"error": "Invalid report path"})
        return super().do_GET()

    def do_HEAD(self):
        # HEAD goes through the same path/host checks; suppressing body is handled by static server.
        if not self.valid_host():
            return self.send_error(403)
        target = self.root / unquote(urlsplit(self.path).path).lstrip("/")
        if not target.resolve().is_relative_to(self.root) or any(part.startswith(".") for part in target.relative_to(self.root).parts):
            return self.send_error(403)
        return super().do_HEAD()

    def list_directory(self, path):
        self.send_error(403, "Directory listings disabled")
        return None

    def do_POST(self):
        origin = f"http://127.0.0.1:{self.server.server_port}"
        if not self.valid_host() or self.headers.get("Origin") != origin or not secrets.compare_digest(self.headers.get("X-Review-Token", ""), self.token):
            return self.reply(403, {"error": "Same-origin review token required"})
        if self.headers.get("Content-Type", "").split(";")[0] != "application/json":
            return self.reply(415, {"error": "JSON required"})
        path = urlsplit(self.path).path
        if not path.startswith(("/api/review/","/api/clauses/","/api/reanalyze/","/api/jobs/","/api/assessment-reviews/","/api/role-reviews/","/api/synthesis-reviews/","/api/reading-feedback/","/api/reading-revise/")):
            return self.reply(404, {"error": "Unknown endpoint"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 256_000 or self.headers.get("Transfer-Encoding"):
                return self.reply(413, {"error": "Review payload too large or missing"})
            payload = json.loads(self.rfile.read(length), parse_constant=lambda _: (_ for _ in ()).throw(ValueError("Nonfinite JSON")))
            if not isinstance(payload, dict):
                raise ValueError("Expected a JSON object")
            parts=path.strip("/").split("/")
            if len(parts)==3 and parts[1]=='reading-feedback':
                saved=self.readings.save(parts[2],payload)
                if saved.get('choice')=='missing' and saved.get('note') and saved['actor']=='local_viewer':
                    try:saved={**saved,'revision_job':self.jobs.submit_reading(parts[2],{'expected_revision':saved['revision'],'artifact_sha256':saved['artifact_sha256'],'reading_revision_id':saved.get('reading_revision_id','baseline')})}
                    except (ValueError,Conflict) as exc:saved={**saved,'apply_error':'Correction saved, but could not start its revision: '+str(exc)}
                return self.reply(200,saved)
            if len(parts)==3 and parts[1]=='reading-revise':return self.reply(202,self.jobs.submit_reading(parts[2],payload))
            if len(parts)==4 and parts[1]=="clauses":return self.reply(200,self.jobs.clauses.save(parts[2],parts[3],payload))
            if len(parts)==3 and parts[1]=="reanalyze":return self.reply(202,self.jobs.submit(parts[2],payload))
            if len(parts)==4 and parts[1]=="jobs" and parts[3]=="cancel":return self.reply(200,self.jobs.cancel(parts[2]))
            if len(parts)==4 and parts[1]=="assessment-reviews":return self.reply(200,self.assessments.save(parts[2],parts[3],payload))
            if len(parts)==4 and parts[1]=='role-reviews':return self.reply(200,self.roles.save(parts[2],parts[3],payload))
            if len(parts)==4 and parts[1]=='synthesis-reviews':return self.reply(200,self.synthesis.save(parts[2],parts[3],payload))
            if len(parts)!=3 or parts[1]!="review":raise ValueError("Invalid endpoint")
            return self.reply(200, self.store.save(path.removeprefix("/api/review/"), payload))
        except Conflict as exc:
            return self.reply(409, {"error": str(exc)})
        except (ValueError, TypeError, KeyError, UnicodeError) as exc:
            return self.reply(400, {"error": str(exc)})


def make_server(root, reviews, port=8765):
    from .reading_revision_report import render_current
    import shutil
    for file in (Path(root)/'reading').glob('met-*/reading.json'):
        original=file.parent/'initial-report.html'
        if not original.exists() and (file.parent/'report.html').exists():shutil.copyfile(file.parent/'report.html',original)
        (file.parent/'report.html').write_text(render_current(json.loads(file.read_text()),file.parent))
    store = ReviewStore(Path(root) / "articulation", reviews)
    jobs=JobManager(store,Path(root)/"reasoning")
    class LocalServer(ThreadingHTTPServer):
        def server_close(self):
            jobs.close()
            super().server_close()
    return LocalServer(("127.0.0.1", port), partial(Handler, root=root, store=store, token=secrets.token_urlsafe(32),jobs=jobs))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    server = make_server(root / "runs", root / "reviews", args.port)
    print(f"Local reasoning gallery: http://127.0.0.1:{args.port}/reasoning/index.html", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
