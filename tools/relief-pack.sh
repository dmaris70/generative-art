#!/usr/bin/env bash
# Build the contractor's pack for the relief of 045: tools/relief-pack.sh [out.zip]
set -euo pipefail
cd "$(dirname "$0")/.."
P=projects/045-every-25-token-sketch; R=$P/relief; OUT=${1:-every-25-token-sketch-relief-pack.zip}; case "$OUT" in /*) ;; *) OUT="$PWD/$OUT";; esac
T=$(mktemp -d); D=$T/every-25-token-sketch-relief-pack
mkdir -p "$D"/{00-read-first,01-specification,02-drawings,03-engraving,04-design-reference,05-software,06-firmware}
cp $R/HANDOVER.md "$D/00-read-first/"
cp $R/CONSTRUCTION.md "$D/01-specification/"
cp $R/{elevation,section-a-a,detail-pocket,wiring,address-map,carrier}.svg "$D/02-drawings/"
for n in elevation section-a-a detail-pocket wiring address-map carrier; do [ -f "$R/$n.png" ] && cp "$R/$n.png" "$D/02-drawings/" || true; done
cp $R/{engraving-face,engraving-ruler}.svg "$D/03-engraving/"
cp $R/DESIGN.md $R/{model,model-receipt,model-plate,simulator,tile-test}.png $R/model.html "$D/04-design-reference/"
cp $P/babel.js $R/controller.js $R/simulator.html "$D/05-software/"; mkdir -p "$D/05-software/receipt"; cp $P/receipt/receipt.js $P/receipt/BUILD.md "$D/05-software/receipt/"
cp -r $R/firmware/motion "$D/06-firmware/"
( cd "$T" && zip -qr "$OUT" every-25-token-sketch-relief-pack )
rm -rf "$T"; echo "pack: $OUT"; unzip -l "$OUT" | tail -1
