// The 024/025 diptych taken apart. Every number here was measured on the two sheets (panorama
// coordinates: x 0…2 across both pictures, the cut at 1; y 0…1 down the picture; tones 0…255).
const PARTS = {
  sheet: { W: 1080, H: 1350, pic: [900, 1193], top: 78, mat: [247, 247, 245] },   // each picture sits against the inner mat edge
  // 1 · cloud: the luminous ground, a darker band across the middle, one bright knot
  cloud: { tone: 203, band: { y: 0.50, h: 0.13, tone: 140 }, knot: { x: 0.68, y: 0.41, r: 0.07, lift: 14 } },
  // 2 · hollow: the soft dark mass the slope rises out of
  hollow: { x: 0.40, y: 0.68, rx: 0.52, ry: 0.17, tone: 74 },
  // 3 · skyline: a long rise, a knuckled crag, the summit leaving the sheet
  profile: [[0, 0.845], [0.25, 0.79], [0.5, 0.70], [0.78, 0.60], [1, 0.52], [1.2, 0.46], [1.42, 0.37], [1.58, 0.30],
            [1.68, 0.245], [1.71, 0.215], [1.76, 0.22], [1.84, 0.205], [2, 0.195]],
  // 4 · rock: body tone, strata running with the skyline, broken blocks
  rock: { tone: 100, strata: 20, blocks: 26 },
  // 5 · spine: the dark band falling from the crag
  spine: { x: 1.70, lean: 0.10, width: 0.035, tone: 56 },
  // 6 · pale flank: the lit, movement-smeared near side beyond the spine
  flank: { tone: 188 },
  // 7 · smear: the camera's movement, strongest in the near corner
  smear: { corner: [2, 1], angle: -62, reach: 0.95, length: 0.05 },
  // 8 · track: one pale line at the foot of the hollow
  track: { x0: 0, x1: 0.47, lift: 95 },
  // 9 · fog tongues: cloud eating the skyline
  tongues: { bite: 0.09, soft: 0.05 },
  // 10 · grain law (mean of the two sheets)
  grainL: [30, 55, 80, 105, 130, 155, 180, 205, 230],
  grainSD: [8.5, 8.5, 8.7, 9.1, 9.0, 8.9, 7.8, 6.75, 6.75], grainRho: 0.36,
};
if (typeof module !== 'undefined' && module.exports) module.exports = PARTS;
