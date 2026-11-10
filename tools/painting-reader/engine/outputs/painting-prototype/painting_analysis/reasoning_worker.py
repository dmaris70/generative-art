"""Executed by the localhost queue; no user-controlled command or image path."""
import json
from pathlib import Path
import sys

from .reasoning import ROOT, run_reasoning, dump, sha
from .reasoning_model import ReasoningModel


def main():
    folder=Path(sys.argv[1]).resolve()
    if not folder.is_relative_to(ROOT/"runs/reasoning/jobs"):raise ValueError("Worker folder outside job root")
    submission=json.loads((folder/"submission.json").read_text())
    status=json.loads((folder/"status.json").read_text())
    def progress(message):
        status.update(status="running",message=message);dump(folder/"status.json",status)
    try:
        if sha(submission["previous_result"])!=submission["previous_result_sha256"]:raise ValueError("Previous result changed since submission")
        progress("Loading pinned local model; source/review records preserved")
        model=ReasoningModel(ROOT/"runs/reasoning-cache")
        result=run_reasoning(submission["work_id"],submission["output"],model,submission["review_record"],progress,
            clause_feedback=submission["clause_review"],previous_result=json.loads(Path(submission["previous_result"]).read_text()))
        status.update(status="generated",message="Generated; checking whether review inputs are still current",
            report_url="/reasoning/"+submission["work_id"]+"/reanalyses/"+submission["job_id"]+"/report.html",
            result_sha256=sha(Path(submission["output"])/"reasoning.json"))
        dump(folder/"status.json",status)
    except Exception as exc:
        status.update(status="failed",message=str(exc)[:1000]);dump(folder/"status.json",status)
        raise


if __name__=="__main__":
    from .inference_slot import inference_slot
    with inference_slot():main()
