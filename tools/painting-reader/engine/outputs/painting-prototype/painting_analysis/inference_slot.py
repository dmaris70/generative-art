"""Serialize local GPU workers even across preview-server restarts or CLI runs."""
from contextlib import contextmanager
import fcntl
from .reasoning import ROOT

@contextmanager
def inference_slot():
    lock=ROOT/'runs/.inference.lock';lock.parent.mkdir(parents=True,exist_ok=True)
    with lock.open('a') as handle:
        fcntl.flock(handle,fcntl.LOCK_EX)
        try:yield
        finally:fcntl.flock(handle,fcntl.LOCK_UN)
