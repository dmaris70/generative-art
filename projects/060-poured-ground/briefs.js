// Composition briefs: one per colorlisa palette (same order as palettes.js). Each brief says
// how a generation is *after* that work: where its colours sit (fields) and what the hand
// does to them (gestures). The painting itself is never used, only a description of its layout.
//
// Coordinates: image uv, x right, y DOWN (as you look at the painting), 0..1. Colours are
// palette indices 0–4. `g` is the index laid as the ground. A field painted in the ground's
// index clears paint back to the ground (a cut-out).
//
//   fields   R(c, x0,y0,x1,y1, deg)    rectangle (deg: counter-clockwise tilt)
//            E(c, cx,cy, rx,ry, deg)   ellipse; radii in short-side units, so circles stay round
//            L(c, x0,y0,x1,y1, w)      a band from one point to another, width w (short-side units)
//            D(c, x0,y0,x1,y1, n, r)   n dabs of radius r scattered in a region (flatter than a pour)
//   gestures P(x0,y0,x1,y1, r)         one pull of the hand
//            B(cx,cy, a0,a1, len, n, r) a burst: n strokes outward between angles a0..a1 (90 = up)
//            C(x0,y0,x1,y1, deg, n, r)  a comb: n parallel strokes across a region
//            S(cx,cy, rad, turns, r)   a swirl around a centre
//            W(x0,y0,x1,y1, n, r)      n scribbled walks inside a region
//
// k: 1 = the layout is well documented and the brief follows it; 0 = inferred from the title and
// the artist's typical structure (stated as such in the caption and the file's provenance).
(function (global) {
  'use strict';
  const R = (c, x0, y0, x1, y1, a) => ['R', c, x0, y0, x1, y1, a || 0];
  const E = (c, x, y, rx, ry, a) => ['E', c, x, y, rx, ry === undefined ? rx : ry, a || 0];
  const L = (c, x0, y0, x1, y1, w) => ['L', c, x0, y0, x1, y1, w];
  const D = (c, x0, y0, x1, y1, n, r) => ['D', c, x0, y0, x1, y1, n, r];
  const P = (x0, y0, x1, y1, r) => ['P', x0, y0, x1, y1, r || 0.04];
  const B = (x, y, a0, a1, len, n, r) => ['B', x, y, a0, a1, len, n, r || 0.03];
  const C = (x0, y0, x1, y1, a, n, r) => ['C', x0, y0, x1, y1, a, n, r || 0.03];
  const S = (x, y, rad, turns, r) => ['S', x, y, rad, turns, r || 0.04];
  const W = (x0, y0, x1, y1, n, r) => ['W', x0, y0, x1, y1, n, r || 0.02];
  const A = (g, k, note, z, m) => ({ g: g, k: k, note: note, z: z, m: m });

  const BRIEFS = [
    // 0 Albers — Adobe (Variant): Luminous Day
    A(2, 0, 'Adobe variant: a doorway of nested frames rising from the base',
      [R(1, .12, .12, .88, .96), R(3, .24, .3, .76, .96), R(0, .36, .48, .64, .96), R(4, .44, .62, .56, .96)],
      [P(.5, .98, .5, .55, .05), C(.12, .12, .88, .4, 0, 2, .02)]),
    // 1 Albers — Homage to the Square (La Tehuana)
    A(0, 1, 'Homage to the Square: four nested squares set low on the field',
      [R(1, .1, .1, .9, .95), R(4, .2, .25, .8, .9), R(3, .3, .4, .7, .85), R(2, .4, .55, .6, .8)],
      [S(.5, .6, .2, .3, .04), P(.1, .5, .9, .5, .03)]),
    // 2 Albrecht — Golden Cloud
    A(0, 0, 'a gold cloud swelling over a dark ground',
      [R(1, 0, .62, 1, 1), E(2, .5, .62, .6, .12), E(3, .5, .42, .38, .24), E(4, .5, .38, .28, .16)],
      [S(.5, .42, .2, .5, .05), C(0, .55, 1, .95, 0, 3, .03)]),
    // 3 Billy Apple — Rainbow
    A(4, 0, 'rainbow arcs rising from the lower edge',
      [E(1, .5, 1, .62), E(0, .5, 1, .54), E(3, .5, 1, .46), E(2, .5, 1, .38), E(4, .5, 1, .3)],
      [B(.5, .98, 20, 160, .15, 5, .03)]),
    // 4 Per Arnoldi — Spar
    A(4, 0, 'poster geometry: a red disc against blue squares, a yellow sun',
      [E(0, .32, .35, .22), R(1, .45, .45, .92, .92), R(2, .52, .52, .85, .85), E(3, .72, .22, .1)],
      [P(.1, .1, .6, .6, .05), B(.32, .35, 0, 360, .18, 6, .03)]),
    // 5 Avery — Bicycle Rider by the Loire
    A(0, 0, 'a rider on the river road, in flat bands of land and water',
      [R(2, 0, 0, 1, .32), R(1, 0, .55, 1, .72), R(3, 0, .72, 1, 1), E(4, .55, .47, .035, .05), E(4, .49, .6, .04), E(4, .61, .6, .04)],
      [C(0, .55, 1, .72, 0, 3, .025), P(.3, .6, .8, .6, .03)]),
    // 6 Avery — Cello Player
    A(0, 0, 'a seated figure leaning into a cello',
      [R(1, 0, 0, 1, .4), E(3, .45, .28, .09, .11), R(2, .33, .42, .62, .88), E(4, .56, .68, .1, .2, 15), L(4, .58, .5, .5, .18, .015)],
      [P(.35, .68, .8, .62, .03), P(.4, .72, .75, .66, .025)]),
    // 7 Hilma af Klint — The Swan
    A(0, 1, 'The Swan: a black and a white swan meeting across the centre line',
      [R(4, 0, 0, 1, .5), E(0, .42, .3, .17, .08), L(0, .56, .28, .52, .47, .025), E(4, .58, .7, .17, .08), L(4, .44, .72, .48, .53, .025), E(3, .5, .5, .035), E(2, .5, .5, .02), E(1, .5, .92, .4, .04)],
      [P(.2, .3, .48, .47, .04), P(.8, .7, .52, .53, .04)]),
    // 8 Basquiat — Untitled (Black King Catch Scorpio)
    A(0, 0, 'a crowned figure among blocks of colour, scrawled over',
      [E(3, .5, .32, .13, .15), R(3, .4, .45, .6, .85), L(2, .38, .15, .44, .06, .02), L(2, .44, .06, .5, .15, .02), L(2, .5, .15, .56, .06, .02), L(2, .56, .06, .62, .15, .02), R(1, .68, .55, .9, .8), R(4, .1, .58, .3, .78)],
      [W(.1, .1, .9, .9, 6, .02), B(.5, .3, 0, 360, .2, 6, .025)]),
    // 9 Basquiat — DUSTHEADS
    A(4, 1, 'Dustheads: two frenzied skeletal figures on black',
      [E(1, .32, .24, .1), E(3, .68, .28, .1), L(0, .32, .34, .3, .85, .07), L(2, .68, .38, .7, .86, .07), L(1, .08, .45, .5, .52, .03), L(3, .5, .56, .92, .46, .03)],
      [W(.05, .05, .95, .95, 8, .02), B(.32, .24, 0, 360, .15, 5, .025), B(.68, .28, 0, 360, .15, 5, .025)]),
    // 10 Beckmann — Dancing Bar in Baden-Baden
    A(0, 0, 'couples pressed together on a crowded dance floor',
      [R(3, .18, .4, .45, .96, 4), R(4, .55, .36, .82, .96, -4), R(1, .4, .3, .6, .9), E(2, .31, .3, .06), E(2, .68, .26, .06), E(2, .5, .2, .05)],
      [S(.5, .6, .25, .4, .04), P(.2, .9, .8, .9, .03)]),
    // 11 Botero — Seated Nude
    A(0, 0, 'a single voluminous seated figure',
      [R(1, 0, .76, 1, 1), E(2, .5, .55, .25, .3), E(2, .5, .22, .09, .1), E(2, .5, .82, .24, .1), R(3, .24, .66, .76, .78), E(4, .5, .16, .11, .06)],
      [S(.5, .55, .25, .3, .04)]),
    // 12 Botticelli — The Birth of Venus
    A(0, 1, 'Venus on the shell, the winds blowing in from the left, the cloak offered from the right',
      [R(2, 0, 0, 1, .3), R(1, .82, .3, 1, 1), E(3, .48, .88, .15, .06), L(2, .48, .85, .48, .26, .07), E(2, .47, .22, .035), L(3, .46, .2, .53, .55, .02), E(2, .16, .3, .12, .15, 30), E(4, .83, .45, .1, .25)],
      [P(.08, .25, .44, .42, .05), C(0, .62, .8, 1, 0, 3, .02)]),
    // 13 Botticelli — Portrait of Dante
    A(0, 1, 'a profile in red cap and robe against dark',
      [R(2, .18, .6, .92, 1), E(3, .5, .24, .2, .12), L(3, .63, .24, .68, .55, .06), E(1, .45, .38, .12, .15), E(4, .44, .55, .12, .025)],
      [P(.3, .25, .3, .5, .03)]),
    // 14 Bruegel — Landscape with the Fall of Icarus
    A(0, 1, 'high horizon, the ploughman on the left, the sea taking the right, a small splash',
      [R(1, 0, .33, 1, 1), R(2, -.1, .48, .55, 1.1, -15), R(3, 0, .78, .42, 1), E(4, .3, .56, .025, .045), D(3, .76, .84, .82, .9, 3, .012), E(3, .7, .66, .06, .035)],
      [C(.45, .4, 1, 1, 0, 4, .02), P(.05, .62, .42, .72, .03)]),
    // 15 Jack Bush — Striped Column
    A(3, 1, 'a column of horizontal stripes standing in the field',
      [R(0, .36, .08, .64, .2), R(1, .36, .2, .64, .32), R(2, .36, .32, .64, .44), R(4, .36, .44, .64, .56), R(0, .36, .56, .64, .68), R(1, .36, .68, .64, .8), R(2, .36, .8, .64, .92)],
      [C(.36, .08, .64, .92, 0, 3, .015)]),
    // 16 Jack Bush — Nude
    A(1, 0, 'a warm torso-like form among flat shapes',
      [E(3, .5, .45, .22, .3), R(2, .3, .15, .7, .3), R(0, .2, .65, .55, .9), R(4, .55, .6, .85, .88)],
      [S(.5, .45, .2, .3, .04)]),
    // 17 Cassatt — The Letter
    A(1, 1, 'a woman in a blue patterned dress sealing a letter',
      [R(0, .2, .35, .8, 1), E(2, .5, .25, .1, .12), E(4, .5, .17, .1, .06), R(2, .38, .5, .62, .58), R(3, 0, 0, .25, 1)],
      [P(.3, .6, .7, .9, .03)]),
    // 18 Cézanne — The Bathers
    A(0, 1, 'trees leaning into a triangle over the bathers',
      [L(1, .12, 1, .42, .1, .1), L(1, .88, 1, .58, .1, .1), R(4, 0, .82, 1, 1), D(2, .15, .5, .85, .85, 9, .04), R(3, .3, .75, .7, .82)],
      [C(.1, .1, .9, .6, 60, 4, .03), P(.1, .9, .9, .9, .03)]),
    // 19 Chagall — La Mariée sous le Baldaquin
    A(0, 0, 'a bride under a canopy, figures floating in blue',
      [E(1, .5, .3, .3, .2), R(2, .3, .15, .7, .25), L(3, .45, .35, .45, .9, .1), E(4, .62, .6, .1, .18), E(3, .45, .3, .05)],
      [S(.5, .5, .3, .6, .05)]),
    // 20 Coolidge — Poker Game
    A(0, 0, 'dogs gathered round a green card table',
      [E(1, .5, .62, .4, .2), E(2, .5, .62, .2, .08), D(3, .12, .25, .88, .55, 6, .05), R(4, 0, .85, 1, 1)],
      [S(.5, .6, .3, .4, .04)]),
    // 21 Dalí — The Persistence of Memory
    A(1, 1, 'sea and cliff behind, a dark shore, watches melting over edges',
      [R(0, 0, 0, 1, .45), R(3, .62, .2, 1, .6), R(4, 0, .62, .6, 1), E(2, .35, .55, .12, .05, -20), E(2, .6, .7, .1, .04, 10), L(3, .1, .5, .32, .5, .02)],
      [P(.35, .52, .35, .68, .03), P(.6, .68, .62, .84, .03)]),
    // 22 Dalí — Apparition of Face and Fruit Dish on a Beach
    A(1, 0, 'a face that is also a fruit dish, set on a beach',
      [R(0, 0, 0, 1, .45), R(2, 0, .45, 1, 1), E(3, .5, .5, .2, .25), E(4, .42, .45, .05), E(4, .58, .45, .05), E(3, .5, .85, .3, .08)],
      [S(.5, .5, .25, .5, .04)]),
    // 23 Leonardo — Mona Lisa
    A(2, 1, 'a pyramid figure before a winding, hazy landscape',
      [R(3, 0, .45, 1, 1), L(4, .5, .95, .5, .45, .5), E(0, .5, .3, .09, .12), E(4, .5, .22, .13, .12), R(1, .32, .82, .68, .95)],
      [S(.25, .2, .12, .4, .03), S(.75, .25, .12, .4, .03)]),
    // 24 Gene Davis — Anthracite Minuet
    A(2, 1, 'vertical stripes in repeating intervals',
      [R(0, .05, 0, .13, 1), R(1, .13, 0, .21, 1), R(3, .21, 0, .29, 1), R(4, .29, 0, .37, 1), R(0, .45, 0, .53, 1), R(1, .53, 0, .61, 1), R(4, .61, 0, .69, 1), R(3, .77, 0, .85, 1), R(0, .85, 0, .93, 1)],
      [C(0, 0, 1, 1, 90, 3, .015)]),
    // 25 de Chirico — Mystery and Melancholy of a Street
    A(3, 1, 'a dark arcade, a long shadow, a girl with a hoop running into an empty street',
      [R(0, 0, 0, 1, .28), R(4, 0, .55, 1, 1), R(2, 0, .28, .35, .9), R(1, .7, .3, 1, .8), L(2, .6, .6, .66, .72, .05), E(2, .25, .8, .02)],
      [P(.15, .85, .6, .65, .03)]),
    // 26 de Chirico — The Red Tower
    A(1, 0, 'a red tower in an empty piazza, arcades at the sides',
      [R(0, 0, 0, 1, .3), R(4, .45, .25, .62, .75), E(4, .535, .25, .09, .04), R(2, 0, .75, 1, 1), R(3, 0, .35, .25, .8), R(2, .75, .5, 1, .75)],
      [P(.1, .9, .9, .8, .03)]),
    // 27 Degas — At the Milliner's
    A(0, 0, "a woman trying on hats, hats on their stands",
      [E(3, .35, .4, .15, .25), E(2, .62, .35, .12, .08), D(1, .55, .2, .85, .5, 4, .05), R(4, .6, .55, .95, 1)],
      [P(.3, .2, .4, .6, .03)]),
    // 28 Delaunay — Hommage à Blériot
    A(2, 1, 'concentric discs turning like propellers',
      [E(0, .35, .45, .3), E(4, .35, .45, .22), E(3, .35, .45, .14), E(1, .72, .3, .18), E(0, .72, .3, .1), E(4, .7, .78, .12)],
      [S(.35, .45, .25, .8, .05), S(.72, .3, .15, .7, .04)]),
    // 29 Delaunay — Air, Iron, and Water
    A(0, 0, 'the Eiffel Tower among discs of sky and water',
      [L(4, .5, 1, .5, .1, .06), E(2, .3, .3, .2), E(3, .3, .3, .12), R(1, 0, .7, 1, 1), R(4, .7, .4, .95, .7)],
      [S(.3, .3, .2, .6, .04), C(0, .7, 1, 1, 10, 3, .02)]),
    // 30 Demuth — I Saw the Figure 5 in Gold
    A(4, 1, "concentric fives rushing outward with the fire engine's lights",
      [E(0, .5, .5, .42), E(1, .5, .5, .3), E(3, .5, .5, .2), L(2, .4, .3, .62, .3, .05), L(2, .42, .3, .4, .5, .05), E(2, .5, .6, .1, .1)],
      [B(.5, .5, 0, 360, .45, 8, .03)]),
    // 31 Diebenkorn — Seawall (its second and third colours are identical on colorlisa)
    A(1, 0, 'flat bands of sea, wall and land',
      [R(0, 0, 0, 1, .4), R(2, 0, .4, 1, .55), R(3, 0, .55, .6, .75), R(4, .6, .55, 1, 1), R(0, 0, .8, .45, 1)],
      [C(0, 0, 1, .4, 0, 3, .025)]),
    // 32 Dix — The Nun
    A(0, 0, 'a habited figure, a pale face, hands clasped',
      [R(4, .2, .2, .8, 1), E(1, .5, .3, .12, .14), R(2, .25, .6, .75, .75), E(3, .5, .2, .18, .06)],
      [P(.5, .5, .5, .95, .03)]),
    // 33 Dix — Dr. Mayer-Hermann
    A(0, 1, 'a frontal seated doctor before a round lamp',
      [E(3, .5, .35, .2, .22), R(4, .2, .55, .8, 1), R(2, .35, .55, .65, .75), R(1, .6, .1, .95, .5), E(4, .55, .33, .1, .03)],
      [S(.5, .4, .25, .3, .04)]),
    // 34 Duchamp — Landscape
    A(0, 0, 'a slope of fields and a path, a red mark rising',
      [R(1, 0, .4, 1, .7), R(2, 0, .7, 1, 1), E(3, .3, .55, .12, .06), L(4, .65, .75, .7, .4, .03)],
      [C(0, .4, 1, 1, 20, 3, .03)]),
    // 35 Dürer — The Large Piece of Turf
    A(4, 1, 'a clump of grasses rising from the earth against a pale ground',
      [R(2, 0, .8, 1, 1), E(0, .5, .62, .35, .22), L(1, .3, .8, .25, .2, .02), L(1, .45, .8, .48, .1, .02), L(1, .6, .8, .7, .15, .02), L(0, .38, .8, .36, .3, .015), R(3, 0, .9, 1, 1)],
      [C(.15, .1, .85, .8, 90, 5, .015)]),
    // 36 Ernst — Woman, Old Man, and Flower
    A(2, 0, 'three totemic figures on a shore',
      [R(1, 0, 0, 1, .5), E(0, .3, .55, .1, .3), E(3, .65, .5, .12, .2), E(4, .5, .85, .4, .08)],
      [P(.2, .3, .8, .7, .03)]),
    // 37 Escher — Gravity
    A(4, 1, 'a star polyhedron with a creature in each point',
      [L(0, .5, .1, .5, .9, .12), L(1, .15, .3, .85, .7, .12), L(2, .85, .3, .15, .7, .12), E(3, .5, .5, .1)],
      [B(.5, .5, 0, 360, .35, 6, .03)]),
    // 38 Feeley — Untitled (April 15)
    A(1, 0, 'paired emblem forms on white',
      [E(0, .3, .3, .14, .2), E(4, .7, .3, .14, .2), E(2, .3, .72, .14, .2), E(3, .7, .72, .14, .2)],
      [P(.3, .1, .3, .95, .03), P(.7, .1, .7, .95, .03)]),
    // 39 Feitelson — Untitled (1964)
    A(0, 0, 'hard-edge lines crossing a dark field',
      [L(3, .1, .9, .9, .1, .012), L(4, .15, .95, .95, .15, .012), R(1, .6, .6, 1, 1), E(2, .25, .25, .08)],
      [P(.1, .5, .9, .5, .02)]),
    // 40 Frankenthaler — Mauve District
    A(2, 0, 'soak-stain pools of mauve, green and yellow',
      [E(3, .45, .5, .3, .25), E(0, .25, .25, .2, .12), E(1, .75, .7, .15, .1), E(4, .7, .2, .06)],
      [S(.45, .5, .25, .4, .05), P(.2, .8, .8, .2, .05)]),
    // 41 Freud — Girl with a Kitten
    A(3, 1, 'a close head and a hand gripping a kitten',
      [E(0, .5, .35, .17, .22), E(2, .5, .18, .2, .1), R(4, .25, .6, .75, 1), E(1, .5, .78, .1, .07)],
      [P(.5, .72, .5, .92, .03)]),
    // 42 Terry Frost — Suspended Forms
    A(0, 0, 'half-moon forms hanging in a red field',
      [E(1, .3, .3, .18, .12), E(2, .7, .45, .2, .12), E(3, .35, .72, .2, .12), E(4, .72, .8, .15, .1)],
      [P(.1, .3, .9, .3, .04), P(.1, .7, .9, .7, .04)]),
    // 43 Gauguin — The Siesta
    A(2, 0, 'women resting on a shaded veranda',
      [R(1, 0, 0, 1, .3), R(0, 0, .3, .25, .8), E(3, .4, .6, .12, .15), E(4, .6, .55, .1, .15), E(0, .75, .7, .1, .12), R(4, 0, .85, 1, 1)],
      [P(.1, .9, .9, .9, .03)]),
    // 44 Geiger — Untitled (Pink and orange)
    A(0, 0, 'a glowing colour form dissolving into its field',
      [E(1, .5, .5, .38, .34), E(3, .5, .5, .28, .24), E(2, .5, .5, .16), E(4, .5, .5, .08)],
      [S(.5, .5, .3, .3, .06)]),
    // 45 Hockney — A Bigger Splash
    A(0, 1, 'sky, the flat house with its windows, two palms, the terrace, the pool edge, a diving board, and the splash',
      [R(4, 0, .53, 1, .665), R(1, 0, .29, .32, .53), R(4, .32, .29, .63, .53), R(2, 0, .26, .66, .295), R(3, .38, .48, .6, .53),
        L(3, .585, .53, .585, .08, .009), L(3, .66, .53, .66, .06, .009), E(3, .585, .09, .035, .02), E(3, .66, .07, .035, .02),
        R(1, 0, .665, 1, .685), R(2, .55, .86, 1.05, .95, -22), D(2, .36, .62, .48, .76, 5, .015)],
      [B(.42, .7, 40, 140, .2, 8, .022), C(.02, .72, .98, .98, 0, 2, .015)]),
    // 46 Hockney — Man in Shower in Beverly Hills
    A(0, 1, 'a figure under a falling shower in a tiled stall',
      [R(2, .25, 0, .75, 1), R(1, 0, .8, 1, 1), L(3, .5, .25, .48, .85, .1), E(3, .5, .18, .05), E(4, .6, .06, .06, .03)],
      [C(.3, .1, .7, .9, -90, 5, .015)]),
    // 47 Hockney — George Lawson and Wayne Sleep
    A(1, 0, 'one man seated at a keyboard, another standing',
      [R(3, 0, .7, 1, 1), R(0, .15, .55, .45, .85), E(2, .3, .4, .1, .14), L(4, .7, .3, .7, .9, .07), E(4, .7, .22, .05)],
      [P(.1, .8, .9, .8, .03)]),
    // 48 Hofmann — The Wind
    A(4, 1, 'all-over poured skeins of blue on white',
      [D(0, .1, .1, .9, .9, 10, .03), D(1, .1, .1, .9, .9, 8, .03), D(2, .1, .1, .9, .9, 8, .025), D(3, .1, .1, .9, .9, 6, .02)],
      [W(.05, .05, .95, .95, 10, .02), C(0, 0, 1, 1, 30, 4, .02)]),
    // 49 Hokusai — The Great Wave off Kanagawa
    A(4, 1, 'the great wave clawing over the boats, Fuji small beneath it',
      [R(1, 0, .72, 1, 1), E(1, .3, .45, .3, .22), E(0, .24, .5, .18, .12), E(4, .44, .56, .17, .14), E(1, .82, .72, .22, .1), D(3, .05, .2, .52, .3, 8, .014),
        E(2, .55, .74, .12, .02, 10), E(2, .28, .84, .12, .02, -5), E(1, .72, .67, .06, .035), E(3, .72, .645, .025, .012)],
      [S(.3, .45, .22, .7, .04), B(.3, .25, 100, 200, .14, 6, .02), C(0, .75, 1, 1, 0, 2, .02)]),
    // 50 Homer — A Basket of Clams
    A(1, 1, 'two boys carrying a basket of clams along the beach',
      [R(3, 0, 0, 1, .35), R(0, 0, .6, 1, 1), E(2, .5, .62, .15, .07), E(4, .38, .4, .05, .08), E(4, .62, .38, .05, .08), L(2, .35, .45, .36, .7, .04), L(2, .65, .45, .64, .7, .04)],
      [P(.1, .8, .9, .8, .03)]),
    // 51 Hopper — Night Windows
    A(1, 1, 'three lit windows, a curtain blowing out, a figure inside',
      [R(2, .05, .35, .3, .95), R(2, .38, .35, .62, .95), R(2, .7, .35, .95, .95), R(0, .4, .4, .6, .6), E(3, .82, .75, .08, .05), R(4, 0, 0, 1, .3)],
      [P(.38, .45, .6, .4, .04)]),
    // 52 Indiana — Love
    A(0, 1, 'LOVE stacked in two rows, the O tilted',
      [R(2, 0, 0, .08, 1), R(3, .92, 0, 1, 1), L(4, .25, .15, .25, .45, .08), L(4, .25, .45, .42, .45, .07), E(4, .7, .3, .13, .13), E(1, .7, .3, .06, .08, -30),
        L(4, .18, .58, .3, .88, .07), L(4, .42, .58, .3, .88, .07), L(4, .6, .58, .6, .88, .07), L(4, .6, .6, .82, .6, .06), L(4, .6, .73, .78, .73, .06), L(4, .6, .86, .82, .86, .06)],
      [P(.1, .5, .9, .5, .02)]),
    // 53 James Jean — RIFT SCULL
    A(1, 0, 'a scull crossing a rift in a swirling field',
      [E(0, .5, .5, .35, .2, 20), R(3, 0, .65, 1, 1), E(4, .45, .45, .12, .05, -15), L(2, .3, .5, .65, .38, .02)],
      [S(.5, .5, .3, .6, .04), P(.1, .8, .9, .7, .03)]),
    // 54 Johns — Target
    A(0, 1, 'concentric rings of a target',
      [E(2, .5, .5, .42), E(4, .5, .5, .34), E(1, .5, .5, .26), E(3, .5, .5, .18), E(4, .5, .5, .1)],
      [S(.5, .5, .35, .2, .03)]),
    // 55 Kahlo — Self-Portrait
    A(1, 0, 'a frontal portrait framed by foliage',
      [E(2, .5, .38, .12, .16), E(0, .5, .25, .16, .1), R(4, .32, .55, .68, 1), D(3, .15, .05, .85, .35, 6, .03), E(0, .5, .33, .1, .015)],
      [P(.1, .2, .9, .2, .03)]),
    // 56 Kandinsky — Apple Tree
    A(4, 0, 'a tree crowned with fruit',
      [L(3, .5, 1, .5, .5, .06), E(1, .5, .38, .3, .22), D(2, .25, .2, .75, .55, 8, .02), R(0, 0, 0, 1, .15)],
      [S(.5, .38, .25, .5, .04)]),
    // 57 Kandinsky — Soft Pressure
    A(3, 0, 'circles and a tilted bar pressing softly together',
      [E(0, .4, .4, .2), E(1, .65, .6, .12), R(2, .2, .7, .6, .85, 15), E(4, .75, .25, .1)],
      [B(.4, .4, 0, 360, .2, 6, .025)]),
    // 58 Kandinsky — White Zig Zags
    A(3, 0, 'circles and bars cut by white zig-zags',
      [E(2, .3, .65, .15), E(1, .7, .65, .12), L(4, .6, .2, .9, .45, .03), E(0, .35, .25, .1), L(3, .15, .85, .35, .55, .025), L(3, .35, .55, .55, .85, .025), L(3, .55, .85, .75, .55, .025)],
      [P(.1, .5, .9, .5, .03)]),
    // 59 Klee — Destruction and Hope
    A(0, 0, 'a broken grid with floating planes and stars',
      [L(2, .1, .3, .9, .3, .01), L(2, .3, .1, .3, .9, .01), L(2, .7, .1, .6, .9, .01), R(1, .35, .35, .6, .6), R(3, .62, .62, .85, .85), E(4, .2, .75, .1), E(1, .8, .2, .06)],
      [P(.1, .9, .9, .1, .02)]),
    // 60 Klee — Fire Evening
    A(4, 1, 'horizontal bands with one burning orange block',
      [R(0, 0, .1, 1, .18), R(1, 0, .18, 1, .3), R(2, .3, .42, .65, .52), R(3, 0, .55, 1, .66), R(1, 0, .72, 1, .8), R(0, 0, .86, 1, .92), R(3, 0, .3, .3, .42)],
      [C(0, 0, 1, 1, 0, 3, .02)]),
    // 61 Klein — Anthropometry: Princess Helena
    A(4, 1, 'a blue body print pressed onto white',
      [E(0, .5, .3, .1, .12), E(0, .5, .52, .16, .18), L(1, .42, .66, .4, .92, .06), L(1, .58, .66, .6, .92, .06), E(2, .5, .5, .06), R(3, 0, .94, 1, 1)],
      [P(.5, .2, .5, .9, .06)]),
    // 62 Klimt — The Kiss
    A(1, 1, 'a gold cloak wrapping a couple on a flower meadow',
      [E(2, .5, .48, .2, .38), R(0, .42, .3, .58, .75), D(3, .1, .75, .9, .98, 8, .02), D(4, .4, .3, .6, .8, 6, .015), E(4, .52, .18, .05)],
      [S(.5, .48, .2, .3, .03)]),
    // 63 Koons — Pink Panther
    A(0, 0, 'a woman embracing a pink panther',
      [E(2, .45, .35, .1, .12), R(2, .35, .45, .6, .95), E(4, .65, .55, .08, .25, -10), E(3, .5, .12, .2, .05), E(1, .3, .9, .2, .06)],
      [S(.5, .5, .2, .2, .03)]),
    // 64 Krasner — Untitled (1949)
    A(4, 1, 'a hieroglyphic grid of small marks',
      [D(0, .08, .08, .92, .92, 16, .035), D(1, .08, .08, .92, .92, 8, .025), D(2, .08, .08, .92, .92, 8, .025), D(3, .08, .08, .92, .92, 8, .025)],
      [W(.08, .08, .92, .92, 8, .015)]),
    // 65 Jacob Lawrence — Street Shadows
    A(2, 0, 'flat facades, windows and figures in the street',
      [R(0, 0, 0, 1, .3), R(4, 0, .3, .3, .9), R(1, .35, .35, .65, .9), R(4, .7, .3, 1, .9), E(3, .5, .5, .05), E(3, .2, .6, .05), R(0, 0, .9, 1, 1)],
      [P(0, .95, 1, .95, .03)]),
    // 66 Jacob Lawrence — The Library
    A(1, 0, 'readers at long tables under shelves',
      [R(0, 0, 0, 1, .4), R(2, .1, .45, .4, .7), R(3, .5, .45, .9, .7), E(4, .25, .38, .05), E(4, .7, .38, .05), R(0, 0, .8, 1, 1)],
      [P(.1, .6, .9, .6, .03)]),
    // 67 LeWitt — Squiggles
    A(4, 1, 'squiggles filling the wall in four colours',
      [L(0, .05, .2, .95, .2, .04), L(1, .05, .4, .95, .4, .04), L(2, .05, .6, .95, .6, .04), L(3, .05, .8, .95, .8, .04)],
      [W(0, 0, 1, 1, 14, .02)]),
    // 68 Lichtenstein — Kiss II
    A(3, 0, 'a close embrace in flat comic colour with Ben-Day dots',
      [E(2, .4, .45, .18, .22), E(2, .62, .4, .12, .15), R(0, 0, 0, .3, 1), E(1, .48, .5, .03), E(4, .35, .3, .15, .12), D(0, .65, .6, .95, .95, 10, .01)],
      [P(.3, .4, .6, .4, .02)]),
    // 69 Lichtenstein — Hopeless
    A(1, 0, 'a tearful face, blonde hair, a thought balloon',
      [E(3, .5, .5, .25, .3), E(0, .5, .55, .02, .04), E(2, .6, .5, .03, .05), E(4, .5, .62, .06, .02), E(2, .3, .15, .25, .1)],
      [P(.6, .5, .62, .7, .02)]),
    // 70 Lichtenstein — Girl with Ball
    A(4, 1, 'a swimmer holding a ball overhead against the sky',
      [E(3, .5, .5, .12, .15), E(1, .5, .15, .15), L(3, .4, .4, .45, .18, .03), R(1, .35, .65, .65, 1), R(0, 0, .85, 1, 1), E(2, .5, .42, .13, .08)],
      [P(.5, .15, .5, .4, .03)]),
    // 71 Malevich — Suprematist Composition
    A(3, 0, 'rectangles flying on a diagonal',
      [R(0, .2, .3, .6, .4, 25), R(1, .4, .45, .75, .52, 25), R(2, .3, .6, .55, .66, 25), R(4, .6, .2, .75, .3, 25), L(0, .15, .8, .85, .2, .02)],
      [P(.1, .9, .9, .1, .04)]),
    // 72 Manet — Boating
    A(0, 1, 'water filling the frame behind a boat, a boater and a woman',
      [R(3, 0, .75, .8, 1, 8), R(1, .55, .25, .85, .75), E(2, .7, .22, .08, .03), E(4, .3, .6, .12, .15)],
      [C(0, 0, 1, .7, 0, 3, .02)]),
    // 73 Magritte — The Son of Man
    A(3, 1, 'a bowler-hatted man, an apple hiding the face, the sea wall behind',
      [R(1, .25, .4, .75, 1), E(1, .5, .12, .14, .06), E(3, .5, .3, .09, .11), E(2, .5, .3, .08), L(0, .5, .45, .5, .6, .02), R(4, 0, .7, 1, .73)],
      [P(.2, .75, .8, .75, .02)]),
    // 74 Magritte — The Menaced Assassin
    A(0, 0, 'figures waiting either side of a room, a window behind',
      [R(1, 0, 0, 1, .35), R(3, 0, .6, 1, 1), E(4, .15, .6, .05, .25), E(4, .85, .6, .05, .25), R(2, .4, .45, .6, .75), E(4, .5, .25, .05, .06)],
      [P(.15, .6, .5, .6, .03)]),
    // 75 Masaccio — The Tribute Money
    A(1, 1, 'the apostles in a ring around Christ, landscape behind',
      [R(0, 0, 0, 1, .15), D(2, .2, .35, .8, .7, 6, .05), D(3, .15, .35, .85, .7, 5, .05), D(4, .25, .4, .75, .65, 4, .04), R(0, 0, .85, 1, 1)],
      [P(.1, .5, .9, .5, .03)]),
    // 76 Matisse — Dance (I)
    A(0, 1, 'dancers in a ring on a green hill under blue',
      [R(2, 0, .6, 1, 1), R(3, 0, .68, .6, 1, -8), D(4, .2, .2, .8, .7, 5, .06), L(4, .25, .45, .75, .35, .03), R(1, 0, 0, 1, .15)],
      [S(.5, .45, .25, .8, .05)]),
    // 77 Matisse — Landscape at Collioure
    A(3, 0, 'trees in broken strokes over a coastal hill',
      [R(0, 0, 0, 1, .25), L(1, .3, 1, .35, .3, .05), L(4, .6, 1, .55, .35, .05), E(1, .35, .3, .15, .1), E(2, .65, .25, .15, .1), R(2, 0, .8, 1, 1)],
      [C(0, 0, 1, 1, 70, 5, .03)]),
    // 78 Michelangelo — The Creation of Adam
    A(2, 1, 'two figures reaching, a hair’s gap between the hands',
      [R(1, 0, .6, .45, 1, -10), E(2, .25, .62, .18, .07, -15), E(4, .75, .35, .22, .15), E(0, .78, .42, .15, .07), L(2, .38, .58, .47, .5, .015), L(2, .6, .47, .52, .5, .015), R(3, 0, .85, .4, 1)],
      [P(.45, .5, .55, .5, .015)]),
    // 79 Miró — Woman and Dog in Front of the Moon
    A(4, 0, 'a woman, a dog and a ladder under the moon',
      [R(3, 0, .75, 1, 1), E(2, .75, .2, .06), L(2, .15, .9, .45, .3, .015), E(0, .3, .7, .08, .12), E(1, .65, .72, .08, .04)],
      [P(.2, .5, .6, .5, .02)]),
    // 80 Modigliani — Anna Zborowska
    A(2, 0, 'an elongated seated figure, the neck long, the hands folded',
      [E(4, .5, .2, .07, .1), L(4, .5, .28, .5, .38, .03), R(3, .33, .38, .67, 1), R(0, 0, 0, .25, 1), R(1, .75, 0, 1, 1)],
      [P(.5, .1, .5, .9, .03)]),
    // 81 Mondrian — Broadway Boogie Woogie
    A(2, 1, 'a yellow street grid studded with red and blue blocks',
      [L(3, 0, .08, 1, .08, .025), L(3, 0, .3, 1, .3, .025), L(3, 0, .55, 1, .55, .025), L(3, 0, .72, 1, .72, .025), L(3, 0, .9, 1, .9, .025),
        L(3, .1, 0, .1, 1, .025), L(3, .32, 0, .32, 1, .025), L(3, .6, 0, .6, 1, .025), L(3, .85, 0, .85, 1, .025),
        R(4, 0.838, 0.338, 0.862, 0.362), R(0, 0.388, 0.888, 0.412, 0.912), R(4, 0.088, 0.178, 0.112, 0.202), R(4, 0.648, 0.708, 0.672, 0.732), R(0, 0.088, 0.858, 0.112, 0.882), R(4, 0.688, 0.538, 0.712, 0.562), R(4, 0.308, 0.308, 0.332, 0.332),
        R(0, 0.578, 0.288, 0.602, 0.312), R(4, 0.308, 0.498, 0.332, 0.522), R(4, 0.828, 0.538, 0.852, 0.562), R(0, 0.308, 0.938, 0.332, 0.962), R(4, 0.208, 0.538, 0.232, 0.562), R(4, 0.308, 0.628, 0.332, 0.652), R(0, 0.258, 0.708, 0.282, 0.732), R(1, .35, .6, .5, .7), R(4, .65, .15, .8, .25), R(0, .38, .62, .47, .68)],
      [C(0, 0, 1, 1, 0, 2, .012)]),
    // 82 Monet — Bouquet of Sunflowers
    A(0, 1, 'a vase of sunflowers spilling outward',
      [E(3, .5, .85, .18, .12), D(2, .25, .15, .75, .6, 9, .05), D(4, .3, .2, .7, .55, 4, .03), L(1, .5, .8, .4, .4, .03), L(1, .5, .8, .62, .42, .03)],
      [S(.5, .35, .25, .5, .04)]),
    // 83 Monet — Water Lilies (1906)
    A(1, 1, 'lily pads drifting over water and reflections',
      [R(2, 0, 0, 1, .4), D(3, .05, .3, 1, 1, 12, .04), D(4, .1, .4, .9, .9, 6, .015), D(0, .2, .5, .8, .9, 4, .015)],
      [C(0, 0, 1, 1, 0, 4, .03)]),
    // 84 Monet — Woman with a Parasol
    A(0, 1, 'a figure seen from below, a parasol against a windy sky',
      [R(3, 0, .8, 1, 1), R(2, 0, .88, 1, 1), L(4, .48, .3, .5, .85, .1), E(1, .45, .2, .2, .08, -15), E(4, .75, .35, .15, .1)],
      [C(0, 0, 1, .7, -30, 4, .03)]),
    // 85 Munch — The Scream (pastel)
    A(3, 1, 'a screaming figure on the bridge under a burning sky',
      [R(4, 0, 0, 1, .35), R(1, 0, .2, 1, .32), R(0, 0, .35, 1, .6), L(3, 0, .55, 1, 1.05, .25), E(2, .35, .7, .06, .09), L(2, .35, .75, .35, 1, .05)],
      [S(.3, .15, .3, 1, .05), C(0, .35, 1, .6, 10, 4, .03)]),
    // 86 Munch — The Scream (oil)
    A(1, 1, 'a screaming figure on the bridge under a burning sky',
      [R(3, 0, 0, 1, .2), R(2, 0, .2, 1, .3), R(4, 0, .35, 1, .6), L(0, 0, .5, 1, 1.05, .22), E(2, .38, .72, .06, .08), L(0, .38, .76, .38, 1, .04)],
      [S(.3, .12, .3, 1, .05), C(0, .35, 1, .6, 10, 4, .03)]),
    // 87 Newman — Vir Heroicus Sublimis
    A(4, 1, 'a red expanse cut by vertical zips',
      [L(1, .22, 0, .22, 1, .008), L(2, .4, 0, .4, 1, .01), L(0, .62, 0, .62, 1, .012), L(1, .78, 0, .78, 1, .006), R(3, .62, 0, .78, 1)],
      [P(.5, 1, .5, 0, .04)]),
    // 88 Noland — Turnsole
    A(4, 0, 'concentric rings floating on raw canvas',
      [E(1, .5, .5, .36), E(0, .5, .5, .3), E(3, .5, .5, .24), E(2, .5, .5, .16), E(4, .5, .5, .06)],
      [S(.5, .5, .2, .3, .03)]),
    // 89 O'Keeffe — Abstraction Blue
    A(4, 0, 'folding blue forms rising',
      [E(0, .5, .5, .15, .45), E(1, .38, .5, .08, .4), E(2, .62, .5, .08, .4), E(3, .5, .25, .05, .18)],
      [P(.5, .05, .5, .95, .04)]),
    // 90 Oldenburg — Red Tights with Fragment 9
    A(0, 0, 'a pair of red legs among loose painted fragments',
      [L(4, .4, .15, .35, .9, .12), L(4, .6, .15, .65, .9, .12), R(1, 0, .85, 1, 1), R(2, .7, .1, .95, .4), E(3, .2, .3, .1)],
      [P(.3, .2, .7, .2, .04), W(.1, .1, .9, .9, 4, .02)]),
    // 91 Picasso — Les Demoiselles d'Avignon
    A(1, 1, 'five angular figures between curtains, a still life below',
      [L(2, .12, .2, .15, .95, .12), L(4, .32, .15, .32, .95, .12), L(2, .5, .15, .5, .95, .12), L(4, .7, .2, .68, .95, .12), L(0, .88, .25, .85, .95, .12), E(3, .5, .92, .1, .05)],
      [C(0, 0, 1, 1, 70, 4, .03)]),
    // 92 Picasso — The Dream
    A(0, 1, 'a woman asleep in a red armchair',
      [R(1, .15, .05, .85, .95), E(4, .5, .3, .14, .17), E(4, .5, .62, .2, .15), E(3, .5, .6, .22, .08), E(2, .35, .75, .12, .08)],
      [S(.5, .4, .2, .4, .03)]),
    // 93 Pollock — Number 1
    A(2, 1, 'all-over poured and dripped skeins',
      [D(4, 0, 0, 1, 1, 10, .02), D(1, 0, 0, 1, 1, 8, .02), D(3, 0, 0, 1, 1, 8, .015), D(0, 0, 0, 1, 1, 6, .015)],
      [W(0, 0, 1, 1, 16, .012)]),
    // 94 Prince — Purple Rain
    A(0, 0, 'a gradient of purples streaked by falling rain',
      [R(1, 0, .2, 1, .4), R(2, 0, .4, 1, .6), R(3, 0, .6, 1, .8), R(4, 0, .8, 1, 1)],
      [C(0, 0, 1, 1, -90, 8, .012)]),
    // 95 Quidor — Leatherstocking's Rescue
    A(2, 0, 'figures caught in a glow inside a dark wood',
      [R(1, 0, .6, 1, 1), E(0, .5, .4, .25, .3), E(3, .45, .5, .06, .1), E(4, .6, .55, .05, .1)],
      [S(.5, .4, .3, .5, .04)]),
    // 96 Ramos — Tobacco Rose
    A(1, 0, 'a pin-up figure rising from a cigar box',
      [E(3, .5, .5, .3, .35), E(4, .5, .55, .12, .3), E(0, .5, .25, .08), E(2, .5, .8, .25, .05)],
      [S(.5, .5, .2, .3, .03)]),
    // 97 Redon — Large Green Vase with Mixed Flowers
    A(2, 1, 'a green vase with flowers floating above it',
      [E(3, .5, .8, .12, .18), D(1, .2, .1, .8, .6, 8, .05), D(4, .25, .15, .75, .55, 6, .03), D(0, .2, .1, .8, .6, 4, .03)],
      [S(.5, .35, .25, .5, .04)]),
    // 98 Rembrandt — The Night Watch
    A(4, 1, 'a company stepping out of shadow into a pool of light, the lieutenant in gold',
      [E(1, .5, .5, .4, .3), E(0, .6, .58, .06, .15), L(3, .4, .4, .42, .95, .06), E(2, .3, .5, .12, .2), E(2, .75, .45, .12, .2)],
      [B(.5, .5, 0, 180, .25, 6, .03)]),
    // 99 Renoir — Dance at Le Moulin de la Galette
    A(1, 1, 'a crowd dappled with sunlight through trees',
      [D(2, 0, 0, 1, 1, 14, .04), D(3, 0, 0, 1, 1, 10, .03), D(0, 0, .4, 1, 1, 8, .04), D(4, 0, .3, 1, 1, 5, .025)],
      [C(0, 0, 1, 1, 20, 4, .025)]),
    // 100 Renoir — Young Girls at the Piano
    A(2, 0, 'two girls leaning over a piano',
      [R(0, 0, 0, .3, 1), R(4, 0, .55, .45, 1), E(1, .55, .35, .08, .1), E(1, .7, .3, .07, .09), E(3, .6, .65, .15, .25), E(4, .75, .6, .1, .25)],
      [P(.2, .6, .6, .6, .03)]),
    // 101 Riley — Diver
    A(0, 0, 'diagonal colour stripes curving into a dive',
      [L(1, .1, 0, .3, 1, .04), L(2, .25, 0, .45, 1, .04), L(3, .4, 0, .6, 1, .04), L(4, .55, 0, .75, 1, .04), L(1, .7, 0, .9, 1, .04)],
      [C(0, 0, 1, 1, 0, 3, .02)]),
    // 102 Rosenquist — Marilyn Monroe, I
    A(4, 0, 'fragments of a face and lettering in billboard bands',
      [R(1, 0, .3, 1, .55), E(0, .6, .45, .15, .05), L(3, .1, .7, .9, .8, .08), R(2, 0, 0, .4, .3)],
      [P(0, .45, 1, .45, .03)]),
    // 103 Rothko — Untitled (1968)
    A(4, 1, 'stacked soft rectangles floating on a field',
      [R(0, .1, .08, .9, .45), R(2, .1, .52, .9, .92), R(1, .14, .12, .86, .4), R(3, .14, .58, .86, .88)],
      [C(.1, .08, .9, .92, 0, 3, .03)]),
    // 104 Rothko — Untitled (White, Black, Rust, on Brown)
    A(2, 1, 'white, black and rust bands stacked on brown',
      [R(0, .1, .06, .9, .3), R(1, .12, .08, .88, .28), R(4, .1, .38, .9, .68), R(3, .1, .74, .9, .94)],
      [C(.1, .06, .9, .94, 0, 3, .03)]),
    // 105 Sargent — Garden Study of the Vickers Children
    A(1, 0, 'two children among tall flowers',
      [E(2, .4, .6, .08, .12), E(2, .6, .55, .07, .11), D(0, 0, .6, 1, 1, 8, .03), R(3, 0, .85, 1, 1), R(4, 0, 0, 1, .15)],
      [C(0, 0, 1, 1, 80, 3, .03)]),
    // 106 Sargent — Villa di Marlia, Lucca
    A(1, 0, 'a garden pool between clipped hedges under sky',
      [R(0, 0, 0, 1, .35), R(2, 0, .35, 1, .6), R(3, 0, .6, .25, 1), R(3, .75, .6, 1, 1), R(4, .25, .85, .75, 1), E(0, .5, .7, .2, .06)],
      [P(.5, .65, .5, .35, .03)]),
    // 107 Sargent — Carnation, Lily, Lily, Rose
    A(3, 1, 'two girls lighting lanterns among lilies at dusk',
      [D(0, .1, .1, .9, .9, 8, .035), D(1, .1, .2, .9, .9, 6, .03), E(0, .35, .65, .07, .15), E(0, .6, .62, .07, .15), D(4, .1, .1, .9, .9, 6, .025), D(2, .1, .1, .9, .6, 5, .02)],
      [S(.3, .4, .1, .3, .02)]),
    // 108 Schlemmer — Bauhaus Stairway
    A(1, 1, 'figures climbing a staircase toward the light',
      [R(0, 0, 0, .3, 1), L(2, .3, .95, .95, .35, .06), E(3, .45, .6, .06, .15), E(4, .65, .45, .07, .2), E(0, .85, .3, .05, .12)],
      [P(.4, .9, .9, .3, .03)]),
    // 109 Seurat — A Sunday on La Grande Jatte
    A(3, 1, 'pointillist park: water at the top, figures in profile on the grass',
      [R(1, 0, .25, 1, .45), R(2, 0, 0, 1, .2), D(0, .05, .4, .95, .95, 12, .03), D(4, .05, .45, .95, .95, 8, .025), D(2, 0, .5, 1, 1, 8, .03)],
      [C(0, .4, 1, 1, 0, 2, .015)]),
    // 110 Skoglund — Radioactive Cats
    A(2, 1, 'green cats overrunning a grey kitchen with an elderly couple',
      [D(0, .05, .3, .95, .95, 12, .04), R(3, .1, .3, .35, .6), E(4, .7, .4, .06, .15), E(4, .5, .55, .06, .15), R(1, .6, .7, .95, .8)],
      [B(.5, .6, 0, 360, .25, 6, .025)]),
    // 111 Tchelitchew — Hide-and-Seek
    A(4, 1, 'a great tree whose branches hide children',
      [L(3, .5, 1, .5, .3, .18), L(3, .5, .5, .2, .15, .06), L(3, .5, .5, .8, .15, .06), D(1, .2, .1, .8, .6, 6, .04), D(0, .25, .2, .75, .8, 6, .03), E(2, .5, .9, .4, .08)],
      [S(.5, .4, .3, .6, .04)]),
    // 112 Turner — A mountain scene, Val d'Aosta
    A(0, 0, 'a mountain storm turning in a vortex of light',
      [E(1, .6, .35, .35, .25), E(2, .4, .5, .3, .2), R(4, 0, .75, 1, 1), E(3, .2, .6, .1, .3)],
      [S(.5, .45, .3, 1, .06)]),
    // 113 Twombly — Untitled, 1961
    A(3, 1, 'scribbled, smeared marks across a pale ground',
      [D(0, .1, .1, .9, .9, 8, .02), D(1, .1, .1, .9, .9, 6, .02), D(2, .1, .1, .9, .9, 6, .02), D(4, .1, .1, .9, .9, 8, .02)],
      [W(.05, .05, .95, .95, 14, .012)]),
    // 114 Ulrich — Wine Barrels Sailing Barge
    A(0, 0, 'a laden barge under sail on calm water',
      [R(1, 0, .55, 1, 1), E(3, .5, .6, .35, .06), L(4, .5, .58, .5, .15, .015), E(2, .5, .35, .12, .18), D(4, .3, .5, .7, .57, 4, .025)],
      [C(0, .6, 1, 1, 0, 3, .02)]),
    // 115 van Doesburg — Rhythm of a Russian Dance
    A(3, 1, 'short bars dancing on white',
      [R(0, .2, .1, .3, .35), R(1, .5, .2, .7, .28), R(2, .3, .45, .4, .7), R(4, .55, .5, .62, .85), R(0, .7, .6, .9, .68), R(1, .15, .75, .3, .82), R(4, .4, .05, .45, .2)],
      [P(.1, .1, .9, .9, .03)]),
    // 116 van Doesburg — Study for a Composition
    A(2, 0, 'a balanced grid of coloured planes',
      [R(0, .05, .05, .45, .45), R(1, .55, .05, .95, .3), R(3, .55, .4, .95, .95), R(4, .05, .55, .45, .95), L(4, .5, 0, .5, 1, .02)],
      [P(.1, .5, .9, .5, .02)]),
    // 117 van Eyck — The Arnolfini Portrait
    A(3, 1, 'a couple joining hands, the red bed, the round mirror between them',
      [R(4, .65, .3, 1, .85), E(0, .62, .6, .12, .32), L(2, .35, .25, .35, .9, .1), E(2, .35, .18, .08, .05), E(1, .5, .35, .04)],
      [P(.35, .5, .6, .5, .02)]),
    // 118 van Gogh — The Starry Night
    A(1, 1, 'a swirling night sky, a flame-like cypress, a sleeping village under the hills',
      [E(2, .35, .3, .25, .05, -10), E(2, .62, .22, .3, .04, 5), E(2, .72, .44, .2, .05, -5), E(2, .45, .5, .3, .04, 8),
        E(0, .7, .86, .45, .06), R(2, .32, .86, 1, 1), L(0, .15, 1, .2, .12, .1),
        E(4, .86, .12, .06), E(3, .45, .3, .045), E(3, .7, .24, .04), E(3, .25, .14, .035), E(3, .9, .4, .03), D(3, .4, .88, .95, .97, 5, .008)],
      [S(.42, .3, .12, 1.2, .035), S(.65, .22, .1, 1, .03), S(.75, .44, .09, 1, .03), C(.25, .05, 1, .6, 0, 3, .025), P(.17, .95, .19, .2, .03)]),
    // 119 van Gogh — Self-Portrait with a Straw Hat
    A(3, 1, 'a head under a straw hat in directional strokes',
      [E(0, .5, .22, .22, .1), E(2, .5, .4, .12, .15), R(4, .28, .6, .72, 1), D(1, 0, 0, 1, 1, 6, .03)],
      [C(0, 0, 1, 1, 60, 6, .02)]),
    // 120 van Gogh — Bedroom in Arles
    A(1, 1, 'a tilted room: the bed on the right, a chair, the door',
      [R(2, 0, .7, 1, 1), R(4, .55, .45, .95, .9, -10), R(3, .6, .4, .95, .5), R(0, .38, .15, .5, .45), E(3, .2, .7, .08, .12)],
      [P(.2, .95, .5, .6, .03)]),
    // 121 Varo — Harmony
    A(0, 0, 'a figure threading a musical staff',
      [E(2, .5, .5, .2, .3), R(1, 0, .75, 1, 1), L(3, .2, .3, .8, .3, .01), L(3, .2, .36, .8, .36, .01), L(3, .2, .42, .8, .42, .01), R(4, 0, 0, .2, 1)],
      [S(.5, .4, .2, .3, .03)]),
    // 122 Velázquez — Las Meninas
    A(0, 1, 'the Infanta among her attendants, the canvas edge, the lit doorway',
      [R(1, 0, 0, .25, 1), E(2, .5, .55, .08, .18), E(2, .4, .6, .06, .15), E(2, .62, .6, .06, .15), R(3, .75, .1, .82, .3), R(4, .3, .85, .8, 1)],
      [P(.5, .4, .5, .8, .02)]),
    // 123 Vermeer — Girl with a Pearl Earring
    A(0, 1, 'a turning head in a blue and yellow turban on dark',
      [E(2, .5, .5, .18, .25), E(1, .42, .25, .15, .12), E(3, .48, .12, .06, .14), R(3, .3, .75, .75, 1), E(4, .5, .62, .05, .02)],
      [P(.4, .25, .48, .05, .03)]),
    // 124 Vermeer — The Milkmaid
    A(2, 1, 'a woman pouring milk at a table by the window',
      [R(1, .35, .25, .65, .7), R(0, .3, .55, .7, .95), R(4, 0, .7, .45, 1), E(3, .65, .15, .05), D(4, .1, .65, .4, .8, 3, .02)],
      [P(.55, .5, .55, .8, .015)]),
    // 125 Warhol — Flowers, 1964
    A(2, 1, 'four flat flowers on a field of grass',
      [E(0, .3, .3, .15), E(4, .7, .3, .15), E(3, .3, .7, .15), E(1, .7, .7, .15)],
      [S(.3, .3, .08, .3, .02), S(.7, .7, .08, .3, .02)]),
    // 126 Warhol — Marilyn Monroe, 1967
    A(0, 1, 'a screen-printed face: hair, lips, eyeshadow, the colour off-register',
      [E(3, .5, .45, .2, .27), E(1, .5, .2, .28, .15), E(2, .5, .62, .07, .025), E(2, .43, .4, .04, .015), E(2, .57, .4, .04, .015), L(4, .32, .25, .3, .7, .01), L(4, .68, .25, .7, .7, .01)],
      [P(.3, .5, .7, .5, .02)]),
    // 127 Warhol — Liz
    A(2, 1, 'a screen-printed face on a turquoise ground',
      [E(4, .5, .45, .18, .24), E(1, .5, .25, .26, .16), E(0, .5, .63, .06, .02), E(3, .43, .38, .04, .015), E(3, .57, .38, .04, .015)],
      [P(.2, .5, .8, .5, .02)]),
    // 128 Warhol — Mick Jagger
    A(2, 0, 'a face with torn-paper colour blocks and drawn lines',
      [E(0, .5, .45, .2, .27), R(1, .2, .3, .45, .7), R(4, .55, .55, .85, .95), L(3, .3, .2, .75, .85, .012)],
      [W(.2, .2, .8, .8, 4, .01)]),
    // 129 Grant Wood — American Gothic
    A(0, 1, 'two figures before a gabled house, a pitchfork upright',
      [R(3, .25, 0, .75, .35), E(4, .36, .42, .07, .1), E(4, .62, .38, .07, .1), R(2, .25, .55, .48, 1), R(2, .52, .5, .8, 1), L(1, .6, 1, .6, .45, .02)],
      [P(.6, .95, .6, .5, .02)]),
    // 130 Xanto — An Urbino Maiolica Istoriato
    A(2, 0, 'a round painted plate with a narrative scene',
      [E(0, .5, .5, .45), E(4, .5, .55, .35, .15), E(1, .35, .4, .08, .15), E(3, .65, .4, .08, .15), E(2, .5, .5, .3)],
      [S(.5, .5, .38, .5, .03)]),
    // 131 Youngerman — Untitled, 1953
    A(1, 0, 'organic hard-edged shapes locked together',
      [E(0, .3, .3, .2, .12, 30), E(2, .65, .35, .15, .2, -20), E(3, .35, .7, .2, .1, -10), E(4, .7, .72, .12, .15, 40)],
      [P(.1, .5, .9, .5, .04)]),
    // 132 Zerbe — Harlem
    A(2, 0, 'a Harlem street of stacked building blocks',
      [R(3, 0, 0, 1, .25), R(0, 0, .25, .3, 1), R(4, .35, .3, .6, 1), R(1, .65, .25, 1, 1), R(0, .7, .4, .8, .5)],
      [P(0, .95, 1, .95, .03)]),
  ];

  global.BRIEFS = BRIEFS;
})(typeof window !== 'undefined' ? window : globalThis);
