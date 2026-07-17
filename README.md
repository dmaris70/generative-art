# Generative Art

A gallery of algorithmic / generative sketches, each running live in the browser.
The landing page (`index.html`) builds itself from `projects.json`, so publishing a
new piece is just: drop a folder + add one manifest entry.

**Live site:** _(GitHub Pages URL appears here once Pages is enabled)_

## Structure

```
.
├── index.html          # gallery landing page (reads projects.json)
├── projects.json       # manifest — one entry per piece
├── projects/
│   └── 001-flow-field/ # a self-contained sketch
│       ├── index.html
│       └── sketch.js
├── _template/          # copy this to start a new piece
└── assets/             # shared fonts, images, etc.
```

## Add a new piece

1. Copy the template:
   ```sh
   cp -R _template projects/002-my-piece
   ```
2. Edit `projects/002-my-piece/sketch.js` (and `index.html` title).
3. Add an entry to `projects.json`:
   ```json
   {
     "slug": "002-my-piece",
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

Vanilla HTML + [p5.js](https://p5js.org) loaded from a CDN. No build step, no
dependencies to install. Any project can use a different library — each lives in
its own folder and is fully self-contained.
