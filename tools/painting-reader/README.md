# Painting reader (vendored)

The portable, measurement-only path of the **painting reader → creative-engine handoff** bundle
(`painting-reader-handoff.zip`, 2026-11-10), kept here so Poured Ground can read the paintings it
holds images of. `MANIFEST.sha256` lists the vendored files with the bundle's own hashes
(`sha256sum -c MANIFEST.sha256`). The bundle's research archive, example (a Cleveland Museum
reproduction), vision-model pilot code and tests are not vendored.

- `painting_handoff.py analyze --image X --output DIR` runs the reader on one image and writes a
  `handoff.json` (schema in `schemas/`), `CREATIVE_BRIEF.md` and `artifacts/` (measurements, formal
  fields, provenance, a copy of the image). CPU only; needs `numpy`, `Pillow`, `jsonschema`.
- The optional vision model (`--vision`, a pinned local MLX model on Apple Silicon) is **not used**.
  Every reading here has `coverage.visual_reading = unavailable`: no subject description exists or
  is invented. What the reader supplies is measurement: colour clusters with shares and pixel
  centroids, connected value masses, colour islands and a sparse-detail field (each with its box,
  centroid, principal axis, axis-variance ratio and occupancy), the configurations between them
  (`value_opposition`, `cross_axes`, `detail_interval`, `color_recurrence`), the dominant edge
  direction and the detail per 3 × 3 grid cell.
- `INTEGRATION.md` and `CAPABILITIES.md` are the bundle's own contract and limits. Poured Ground
  follows them: measurements are not objects, axes are not perceived lines, and the engine keeps
  its own medium, marks and algorithm.

## `read_works.py`: readings for Poured Ground

```sh
python3 -I tools/painting-reader/read_works.py --colorlisa
python3 -I tools/painting-reader/read_works.py --archive --hosts met,tate,cma,nga,google,google2 --resume
```

- `--colorlisa` reads the public-domain originals in `projects/060-poured-ground/originals/`
  (listed in `originals.js`) and writes `projects/060-poured-ground/readings.js` plus the full
  `readings/<id>.handoff.json` for audit.
- `--archive` reads Colorist Archive works that are public domain and whose image is served by one
  of the named museum hosts (the Met, Tate, Cleveland, National Gallery of Art, Google Arts &
  Culture). Images are downloaded into a temporary directory and deleted after reading; only the
  measurements, the image's SHA-256 and its URL are kept, in
  `projects/060-poured-ground/archive/readings/<artist-id>.json` — one file per artist, as the
  archive's own work files are, with `readings/index.json` naming the artists that have any. The
  studio loads a work's reading with its artist; it was one file until November 2026, which it had
  to fetch whole before it could show any archive work. Wikimedia (most of the archive) rate-limits
  requests and is not read by default (`--hosts wikimedia` reads it slowly). Commons refuses a
  cloud address outright, so that read has to be run from a personal machine:
  [RUNNING-THE-ARCHIVE-READ.md](RUNNING-THE-ARCHIVE-READ.md) has the policy limits, the commands
  and the timings.
- Each record compacts one handoff: five colours from the reader's six clusters (the two closest
  in CIELAB are merged, ΔE < 12, otherwise the smallest is folded into its nearest; `map6` records
  the mapping), the fields, configurations, shared fields, edges and cells.

How a record becomes a composition is in `projects/060-poured-ground/engine.js` (`readBrief`) and
the project README ("From the reading").
