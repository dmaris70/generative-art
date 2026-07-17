# Generative Art

A gallery of algorithmic / generative sketches, each running live in the browser.
The landing page (`index.html`) builds itself from `projects.json`, so publishing a
new piece is just: drop a folder + add one manifest entry.

Every sketch shares a tiny harness (`assets/genart.js`) that gives it a
**live parameter panel**, a **deterministic seed**, and **shareable URLs** — the
same seed and params always reproduce the same artwork.

**Live site:** https://dmaris70.github.io/generative-art/

## Structure

```
.
├── index.html            # gallery landing page (reads projects.json)
├── projects.json         # manifest — one entry per piece
├── assets/
│   └── genart.js         # shared harness: seed + params + GUI + share links
├── projects/
│   ├── 001-flow-field/   # a self-contained sketch
│   │   ├── index.html
│   │   └── sketch.js
│   └── 002-particle-life/
├── _template/            # copy this to start a new piece
└── assets/               # shared fonts, images, etc.
```

## The harness — `GenArt`

`assets/genart.js` is a small, dependency-light layer (its parameter/seed model is
inspired by [thi-ng/genart-api](https://github.com/thi-ng/genart-api), reimplemented
from scratch — no upstream code). In a sketch:

```js
let G;
function setup() {
  createCanvas(windowWidth, windowHeight);
  G = GenArt.create({
    title: 'My Piece',
    params: {
      count: { value: 1000, min: 100, max: 4000, step: 100, label: 'particles' },
    },
    onReset: reset,          // called on seed change / randomize / param tweak
  });
  reset();
}
function reset() {
  randomSeed(G.seed);        // make p5's random()/noise() deterministic too
  noiseSeed(G.seed);
  const n = G.param('count');
  const r = G.rng();         // deterministic float in [0, 1)
  // ...
}
```

What you get automatically:

- **Live GUI panel** (top-right, via [lil-gui](https://github.com/georgealways/lil-gui))
  with a slider per declared param, an editable **seed** field, a **🎲 randomize**
  button, **Copy share link**, and **Save PNG**.
- **Reproducibility** — `?seed=12345` in the URL reproduces the exact artwork.
  Seeds can be numbers or words (`?seed=sunset`).
- **Shareable state** — the seed and all params are written into the URL as you
  tweak, so "Copy share link" captures the exact frame's recipe.
- **Keys** — every sketch binds **R** (randomize) and **S** (save PNG).

## Add a new piece

1. Copy the template:
   ```sh
   cp -R _template projects/003-my-piece
   ```
2. Edit `projects/003-my-piece/sketch.js` — declare your `params`, write `reset()`
   and `draw()`. Edit the `<title>` in its `index.html`.
3. Add an entry to `projects.json`:
   ```json
   {
     "slug": "003-my-piece",
     "title": "My Piece",
     "year": 2026,
     "tools": ["p5.js"],
     "description": "One line about it.",
     "thumb": "thumb.png"
   }
   ```
4. Commit and push. The gallery updates automatically.

### Optional: thumbnails
Run a sketch, press **S** to save a PNG, drop it in the project folder as
`thumb.png`, and reference it via the `"thumb"` field. Without a thumb the card
shows the title on a gradient.

## Local preview

Because the gallery uses `fetch()`, open it through a local server rather than
`file://`:

```sh
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Tech

Vanilla HTML + [p5.js](https://p5js.org) and [lil-gui](https://github.com/georgealways/lil-gui),
both from a CDN. No build step, no dependencies to install. Each piece lives in its
own folder and is fully self-contained, and may use a different library if you like.
