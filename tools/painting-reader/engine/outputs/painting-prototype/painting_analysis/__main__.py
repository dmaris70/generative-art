from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
from pathlib import Path
import platform
import time

import numpy
import PIL

from . import __version__
from .features import load_image, measure
from .evidence import build_analysis
from .validation import validate
from .reporting import views, render


def run(image_path, output, catalog_path=None, reference_path=None, max_side=512, crop=None,
        semantic_backend=None, semantic_cache=None, formal_layer=False):
    started = time.perf_counter()
    if max_side < 16 or max_side > 2048:
        raise ValueError("max_side must be between 16 and 2048 analysis pixels.")
    image, provenance = load_image(Path(image_path), max_side=max_side, crop=crop)
    code_root = Path(__file__).resolve().parent
    code_bytes = b"".join(p.name.encode() + p.read_bytes() for p in sorted(code_root.iterdir()) if p.suffix in {".py", ".js"})
    provenance["code_sha256"] = hashlib.sha256(code_bytes).hexdigest()
    provenance["catalog_sha256"] = hashlib.sha256(Path(catalog_path).read_bytes()).hexdigest() if catalog_path else None
    provenance["reference_sha256"] = hashlib.sha256(Path(reference_path).read_bytes()).hexdigest() if reference_path else None
    provenance["environment"] = {"prototype": __version__, "python": platform.python_version(),
                                 "numpy": numpy.__version__, "pillow": PIL.__version__,
                                 "jsonschema": importlib.metadata.version("jsonschema")}
    measurements, arrays = measure(image)
    catalog = json.loads(Path(catalog_path).read_text()) if catalog_path else None
    reference = json.loads(Path(reference_path).read_text()) if reference_path else None
    analysis = build_analysis(Path(image_path), provenance, measurements, catalog)
    validation = validate(analysis, measurements)
    baseline = analysis
    output = Path(output)
    if output.resolve() == Path(image_path).resolve().parent:
        raise ValueError("Choose a separate output directory to preserve source images.")
    output.mkdir(parents=True, exist_ok=True)
    semantic_result = None
    if semantic_backend is not None:
        from .semantic import merge_semantics
        (output / "baseline-analysis.json").write_text(json.dumps(baseline, indent=2, ensure_ascii=False) + "\n")
        try:
            semantic_result = semantic_backend.analyze(image, baseline, semantic_cache)
            label = semantic_result["request"]["model_id"] + " @ " + semantic_result["request"]["revision"]
            analysis = merge_semantics(baseline, semantic_result["payload"], provenance, label)
            validation = validate(analysis, measurements)
        except Exception as exc:
            (output / "semantic-error.json").write_text(json.dumps({"status": "failed", "error": str(exc)}) + "\n")
            (output / "analysis.json").write_text(json.dumps(baseline, indent=2, ensure_ascii=False) + "\n")
            (output / "semantic.json").write_text(json.dumps({"status": "failed", "error": str(exc)}) + "\n")
            import html
            failure_report = '<!doctype html><html lang="en"><meta charset="utf-8"><title>Semantic stage failed</title><h1>Semantic stage failed</h1><p>' + html.escape(str(exc)) + '</p><p>The baseline snapshot is preserved in baseline-analysis.json. A previous successful semantic report is not presented as the current result.</p></html>'
            (output / "report.html").write_text(failure_report)
            raise RuntimeError("Semantic stage failed; baseline snapshot preserved: " + str(exc)) from exc
        (output / "semantic.json").write_text(json.dumps(semantic_result, indent=2, ensure_ascii=False, allow_nan=False) + "\n")
        provenance["semantic"] = {"model_id": semantic_result["request"]["model_id"],
                                  "revision": semantic_result["request"]["revision"],
                                  "request_sha256": semantic_result["request_sha256"],
                                  "runtime": semantic_result["request"]["runtime"],
                                  "generation": semantic_result["generation"],
                                  "cache_hit": semantic_result["cache_hit"],
                                  "quality_flag_count": len(semantic_result.get("quality_flags", [])),
                                  "withheld_clauses": [item for attempt in semantic_result.get("attempts", [])
                                                       if attempt.get("validation") == "passed"
                                                       for item in attempt.get("withheld_clauses", [])],
                                  "catalog_and_reference_prose_in_model_input": False}
        if (output / "semantic-error.json").exists():
            (output / "semantic-error.json").unlink()
    formal = None
    if formal_layer:
        from .formal import extract_fields, articulate
        formal = extract_fields(image, arrays, measurements, provenance)
        analysis = articulate(analysis, formal)
        validation = validate(analysis, measurements, {"formal.json": formal})
        (output / "formal.json").write_text(json.dumps(formal, indent=2, allow_nan=False)+"\n")
        provenance["formal_layer"] = formal["version"]
        provenance["formal_schema_sha256"] = hashlib.sha256((code_root.parent / "schema/formal.schema.json").read_bytes()).hexdigest()
    for name, data in (("analysis.json", analysis), ("measurements.json", measurements),
                       ("validation.json", validation)):
        (output / name).write_text(json.dumps(data, indent=2, ensure_ascii=False, allow_nan=False) + "\n")
    source_image = load_image(Path(image_path), max_side=max_side)[0] if crop is not None else None
    images = views(image, measurements, arrays, source_image,
                   semantic_result["payload"] if semantic_result else None)
    if formal is not None:
        from .formal import field_views
        images = {**field_views(image, formal), **images}
    (output / "report.html").write_text(render(analysis, measurements, provenance, images, reference, formal))
    provenance["parameters"] = {"max_side": max_side, "palette_seed": 0, "palette_colors": 6,
                                "grid": [3, 3], "edge_blur_radius": 1}
    provenance["elapsed_seconds"] = round(time.perf_counter() - started, 4)
    (output / "provenance.json").write_text(json.dumps(provenance, indent=2, allow_nan=False) + "\n")
    return analysis, measurements, provenance


def main():
    parser = argparse.ArgumentParser(description="Inspect formal relationships in a painting reproduction.")
    parser.add_argument("image", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--catalog", type=Path)
    parser.add_argument("--reference", type=Path)
    parser.add_argument("--max-side", type=int, default=512)
    parser.add_argument("--crop", type=float, nargs=4, metavar=("X0", "Y0", "X1", "Y1"),
                        help="Explicit normalized bounds within the EXIF-oriented source; full image is preserved.")
    parser.add_argument("--semantic", action="store_true", help="Add offline local model proposals; requires optional model environment and checkpoint.")
    parser.add_argument("--formal", action="store_true", help="Add connected formal fields, configurations and reviewer controls.")
    args = parser.parse_args()
    try:
        backend = None
        if args.semantic:
            from .semantic import LocalVisionModel
            backend = LocalVisionModel()
        analysis, _, provenance = run(args.image, args.output, args.catalog, args.reference, args.max_side, args.crop,
                                     semantic_backend=backend,
                                     semantic_cache=Path(__file__).resolve().parents[1] / "runs/semantic-cache", formal_layer=args.formal)
    except (ValueError, RuntimeError, OSError) as exc:
        parser.exit(2, f"Analysis could not complete: {exc}\n")
    print(f"Report: {args.output.resolve() / 'report.html'}")
    print(f"{len(analysis['claims'])} claims; {len(analysis['relationships'])} configurations; {provenance['elapsed_seconds']} seconds")


if __name__ == "__main__":
    main()
