// Load: overpaint rounds for the p5.brush watercolour painters (036, 037, 038).
//
// While recording, every polygon laid with a fill (a wet wash) or a wash (a glaze) is logged
// with its colour and strength, in the order it was painted. A further round lays the whole
// log again, in the same order, as glazes on the dried sheet at a share of the original
// strength: a second coat of the painting's washes. Watercolour cannot cover what is under
// it, so each round deepens the values and the colour where washes were laid, and the paper
// left bare stays bare. Line work laid after the rounds (pen, rigger, spatter) stays on top.
//
// Usage, in a task list:
//   T.push(() => Overpaint.start());            // where the washes begin
//   ...the painting's washes...
//   for (const t of Overpaint.rounds(load - 1)) T.push(t);   // stops recording, then replays
// With load 1 nothing is recorded or laid: the painting is exactly as before.
const Overpaint = (() => {
  const S = { rec: false, log: [], fill: null, wash: null, wrapped: false };
  // follow p5.brush's fill and wash state, and log the polygons laid under either
  function wrap() {
    if (S.wrapped || typeof brush === 'undefined') return;
    S.wrapped = true;
    const f = brush.fill, nf = brush.noFill, w = brush.wash, nw = brush.noWash, pg = brush.polygon;
    brush.fill = function (c, a) { S.fill = [c, a ?? 255]; return f.apply(this, arguments); };
    brush.noFill = function () { S.fill = null; return nf.apply(this, arguments); };
    brush.wash = function (c, a) { S.wash = [c, a ?? 255]; return w.apply(this, arguments); };
    brush.noWash = function () { S.wash = null; return nw.apply(this, arguments); };
    brush.polygon = function (P) {
      if (S.rec && (S.fill || S.wash)) {
        const st = S.wash || S.fill;
        S.log.push({ P: P.map((p) => [p[0], p[1]]), c: st[0], a: st[1] });
      }
      return pg.apply(this, arguments);
    };
  }
  // a small seeded generator, so the rounds take nothing from p5's random stream (the line
  // work after them is the same at every load)
  const rnd = (seed) => () => ((seed = (seed + 0x6d2b79f5) | 0), (((seed ^ (seed >>> 15)) * (seed | 1)) >>> 0) / 4294967296);
  const CHUNKS = 40;
  return {
    start() { wrap(); S.log = []; S.rec = S.wrapped; },
    stop() { S.rec = false; },
    count() { return S.log.length; },
    // tasks laying `n` rounds: each replays the log as glazes at `share` of each wash's
    // strength, every shape shifted by up to `jitter` canvas px so the edges do not coincide
    rounds(n, share = 0.5, jitter = 1.5) {
      if (!(n > 0)) return [() => Overpaint.stop()];
      const T = [() => Overpaint.stop()];
      for (let r = 0; r < n; r++) {
        for (let k = 0; k < CHUNKS; k++) {
          T.push(() => {
            const L = S.log, i0 = Math.floor((k * L.length) / CHUNKS), i1 = Math.floor(((k + 1) * L.length) / CHUNKS);
            const g = rnd(1009 * (r + 1) + k);
            brush.noStroke();
            brush.noFill();
            for (let i = i0; i < i1; i++) {
              const e = L[i], dx = (g() - 0.5) * 2 * jitter, dy = (g() - 0.5) * 2 * jitter;
              brush.wash(e.c, Math.min(255, e.a * share));
              brush.polygon(e.P.map(([x, y]) => [x + dx, y + dy]));
            }
            brush.noWash();
          });
        }
      }
      return T;
    },
  };
})();
