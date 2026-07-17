/*
 * genart.js — a tiny, dependency-light harness for reproducible browser art.
 *
 * Inspired by the parameter/seed model of thi-ng/genart-api (MIT), reimplemented
 * from scratch so it carries no upstream code. Gives every sketch:
 *   - a deterministic PRNG seeded from the URL (?seed=…) — same seed → same art
 *   - declarative parameters rendered as a live lil-gui panel
 *   - seed + params serialized back into the URL for shareable links
 *
 * Usage (in a sketch, p5 global mode):
 *
 *   let G;
 *   function setup() {
 *     createCanvas(windowWidth, windowHeight);
 *     G = GenArt.create({
 *       title: 'My Piece',
 *       params: {
 *         count: { value: 1000, min: 100, max: 4000, step: 100, label: 'particles' },
 *       },
 *       onReset: reset,   // called on seed change / randomize / param tweak
 *     });
 *     reset();
 *   }
 *   function reset() {
 *     randomSeed(G.seed); noiseSeed(G.seed);   // make p5's rng deterministic too
 *     const n = G.param('count');
 *     const r = G.rng();                         // deterministic float in [0,1)
 *     ...
 *   }
 *
 * Depends on lil-gui (loaded via a <script> tag before this file).
 */
(function (global) {
  'use strict';

  // --- deterministic PRNG: mulberry32 (32-bit state, fast, good enough for art) ---
  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // FNV-1a hash so a string seed ("sunset") maps to a stable 32-bit number.
  function hashStr(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  // A seed can be a plain integer ("12345") or any string ("sunset" → hashed).
  function coerceSeed(raw) {
    if (raw === null || raw === undefined || raw === '') return null;
    const s = String(raw).trim();
    if (/^\d+$/.test(s)) return Number(s) >>> 0;
    return hashStr(s);
  }

  function readURL() {
    const params = {};
    let seedRaw = null;
    try {
      const u = new URL(global.location.href);
      seedRaw = u.searchParams.get('seed');
      for (const [k, v] of u.searchParams) {
        if (k.indexOf('p_') === 0) params[k.slice(2)] = parseFloat(v);
      }
    } catch (e) {
      /* file:// or no location — fall back to random */
    }
    return { seedRaw, params };
  }

  function create(config) {
    config = config || {};
    const title = config.title || 'Sketch';
    const defs = config.params || {};
    const onReset = typeof config.onReset === 'function' ? config.onReset : function () {};

    const fromURL = readURL();

    // Resolve the seed: URL wins, otherwise a fresh random one.
    let seed = coerceSeed(fromURL.seedRaw);
    if (seed === null) seed = (Math.random() * 4294967296) >>> 0;

    // Resolve params: URL value wins, otherwise the declared default.
    const values = {};
    for (const key in defs) {
      values[key] =
        key in fromURL.params && isFinite(fromURL.params[key])
          ? fromURL.params[key]
          : defs[key].value;
    }

    let _rng = mulberry32(seed);

    const api = {
      title: title,
      params: values,
      get seed() {
        return seed;
      },
      rng: function () {
        return _rng();
      },
      param: function (k) {
        return values[k];
      },
      randomize: function () {
        setSeed((Math.random() * 4294967296) >>> 0);
      },
      reset: function () {
        applyReset();
      },
    };

    function applyReset() {
      _rng = mulberry32(seed);
      syncURL();
      onReset();
    }

    function syncURL() {
      try {
        const u = new URL(global.location.href);
        u.searchParams.set('seed', String(seed));
        for (const key in values) u.searchParams.set('p_' + key, String(values[key]));
        global.history.replaceState(null, '', u.toString());
      } catch (e) {
        /* ignore on file:// */
      }
    }

    // ---- GUI ----
    let seedCtl, copyCtl;

    function setSeed(next) {
      seed = next >>> 0;
      ctrl.seed = String(seed);
      if (seedCtl) seedCtl.updateDisplay();
      applyReset();
    }

    const ctrl = {
      seed: String(seed),
      randomize: function () {
        setSeed((Math.random() * 4294967296) >>> 0);
      },
      copyLink: function () {
        const url = global.location.href;
        const done = function () {
          if (copyCtl) {
            copyCtl.name('Copied ✓');
            global.setTimeout(function () {
              copyCtl.name('Copy share link');
            }, 1200);
          }
        };
        if (global.navigator && global.navigator.clipboard) {
          global.navigator.clipboard.writeText(url).then(done, done);
        } else {
          done();
        }
      },
      savePNG: function () {
        if (typeof global.saveCanvas === 'function') {
          global.saveCanvas(
            title.replace(/\s+/g, '-').toLowerCase() + '-' + seed,
            'png'
          );
        }
      },
    };

    if (!global.lil || !global.lil.GUI) {
      console.warn('genart.js: lil-gui not found — GUI disabled.');
    } else {
      const gui = new global.lil.GUI({ title: title });
      seedCtl = gui
        .add(ctrl, 'seed')
        .name('seed')
        .onFinishChange(function (v) {
          const s = coerceSeed(v);
          setSeed(s === null ? seed : s);
        });
      gui.add(ctrl, 'randomize').name('🎲 randomize');

      const folder = gui.addFolder('parameters');
      for (const key in defs) {
        const d = defs[key];
        folder
          .add(values, key, d.min, d.max, d.step)
          .name(d.label || key)
          .onChange(function () {
            applyReset();
          });
      }

      copyCtl = gui.add(ctrl, 'copyLink').name('Copy share link');
      gui.add(ctrl, 'savePNG').name('Save PNG (S)');
    }

    syncURL(); // reflect initial state in the URL immediately
    return api;
  }

  global.GenArt = { create: create, _mulberry32: mulberry32, _hashStr: hashStr };
})(window);
