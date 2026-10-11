// Load: overpaint rounds for the p5.brush watercolour painters (036, 037, 038).
//
// At load n every wash in the painting is laid n times: the wash itself, then, once it has
// dried, n − 1 further coats over the same shape before the painter moves on to the next. A
// wet wash (a fill) goes on again as a wet wash with its granulation and dried edge but no
// bleed, since the paper under it is now dry; a glaze (a wash) as a glaze. Each further coat
// carries a share of the first one's strength and is shifted a little, so its edge does not
// fall exactly on the first. Watercolour cannot cover what is under it, so each coat deepens
// the value and the colour of that wash. Everything painted after a wash, the marks and the
// details, goes on over all of its coats, so nothing is veiled; the paper left bare stays
// bare. Dry-brush, rigger and pen strokes are not washes and are laid once.
//
// Usage: Overpaint.begin(n) before the painting, Overpaint.end() after it (both may be queued
// as tasks). With n = 1 nothing is changed: the painting is exactly as before.
const Overpaint = (() => {
  const S = { coats: 1, fill: null, wash: null, bleed: null, tex: null, wrapped: false, seed: 1 };
  // p5.brush's wet washes dry far lighter than their nominal strength, its glazes nearly at it
  const FILL_SHARE = 0.7, WASH_SHARE = 0.3, JITTER = 1.5;
  let raw = null;
  function wrap() {
    if (S.wrapped || typeof brush === 'undefined') return;
    S.wrapped = true;
    raw = { fill: brush.fill, noFill: brush.noFill, wash: brush.wash, noWash: brush.noWash, bleed: brush.fillBleed, tex: brush.fillTexture, polygon: brush.polygon };
    brush.fill = function (c, a) { S.fill = [c, a ?? 255]; return raw.fill.apply(this, arguments); };
    brush.noFill = function () { S.fill = null; return raw.noFill.apply(this, arguments); };
    brush.wash = function (c, a) { S.wash = [c, a ?? 255]; return raw.wash.apply(this, arguments); };
    brush.noWash = function () { S.wash = null; return raw.noWash.apply(this, arguments); };
    brush.fillBleed = function () { S.bleed = Array.from(arguments); return raw.bleed.apply(this, arguments); };
    brush.fillTexture = function () { S.tex = Array.from(arguments); return raw.tex.apply(this, arguments); };
    brush.polygon = function (P) {
      const out = raw.polygon.apply(this, arguments);
      if (S.coats > 1 && (S.fill || S.wash)) coatsOver(P);
      return out;
    };
  }
  // a small seeded generator, so the coats take nothing from p5's random stream (every other
  // mark in the painting stays where it was at load 1)
  const next = () => {
    let t = (S.seed = (S.seed + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // the further coats over one shape, then the brush as it was
  function coatsOver(P) {
    for (let k = 1; k < S.coats; k++) {
      const dx = (next() - 0.5) * 2 * JITTER, dy = (next() - 0.5) * 2 * JITTER;
      const Q = P.map((p) => [p[0] + dx, p[1] + dy]);
      if (S.wash) {
        raw.wash(S.wash[0], Math.min(255, S.wash[1] * WASH_SHARE));
        raw.polygon(Q);
        raw.wash(S.wash[0], S.wash[1]);
      } else {
        raw.fill(S.fill[0], Math.min(255, S.fill[1] * FILL_SHARE));
        raw.bleed(0, 'out');
        raw.polygon(Q);
        raw.fill(S.fill[0], S.fill[1]);
        if (S.bleed) raw.bleed.apply(brush, S.bleed);
      }
    }
  }
  return {
    begin(n) { S.coats = Math.max(1, Math.round(n || 1)); S.seed = 1; if (S.coats > 1) wrap(); },
    end() { S.coats = 1; },
  };
})();
