# Ductus dialects — authoring with Claude Fable 5

Path C of the DMCF Radio ↔ Generative-art connection. The ductus engine
(`projects/012-ductus-wall/index.html`, symlinked as `ductus.html`) already treats
its parameter space as *"dialect unbound"* — the seed roams the whole space freely.
A **dialect** names and fences a region of that space so a family of sheets shares a
hand, while the seed still individuates every sheet inside it.

This document is the substrate for growing new dialects with Fable 5 at **authoring
time only**. Nothing here runs at play time: the radio and the gallery stay static,
serverless, and offline. Fable generates code; you commit it; the engines load it.

---

## 1 · What a dialect actually is

The engine's hand is governed by a small set of seed-drawn, hand-overridable
parameters (see `params` in the engine, ~line 732) plus a media family. A dialect is
a named preset over exactly these:

| Axis | In the engine | What a dialect fixes |
|---|---|---|
| Medium | `INKS` / `CLAWS` / `CAMISADO` / `IMPASTO` / graphite grades | which media family the hand may dip into |
| Fatigue | `params.fatigue` (κ, 0 = tireless) | how the hand tires across a load |
| Tremor | hand-tremor param | baseline unsteadiness |
| Lean | consistent top-left lean | the slant of the writing hand |
| Density | `params.density` | how full the registers pack |
| Weather | layered-noise pressure field | how darkness/length/skips drift across the sheet |
| Rest grammar | gutter = counted rest (`3R`), breaks | the meter of the page and the wall |
| Ink | reservoir · nib mm · sheet cm → metres per load | when the pen starves and dies |

A dialect is therefore **a named object of ranges over these axes** — not new drawing
code. That keeps every dialect deterministic and plotter-safe, and keeps the finite-pen
law intact.

## 2 · Dialect spec (the object Fable must emit)

```js
// DIALECTS[<key>] — additive; absence is legal (unbound = the whole space).
{
  key: "praktika",                 // stable id, lowercase
  name: "Πρακτικά — the minutes",  // display name (Greek/Latin parity welcome)
  note: "one clerk's hand keeping official minutes; the ink is asked for more than it holds",
  media: ["INKS"],                 // allowed media families, by name
  fatigue: [0.35, 0.55],           // κ range the seed may pick within
  tremor:  [0.04, 0.12],
  lean:    [0.10, 0.20],
  density: [0.55, 0.80],
  weather: "one-field",            // named weather regime
  rest:    { gutter: "3R", breaks: "grid-held" },
  ink:     { reservoirMl: [0.8, 1.2], nibMm: 0.30, runsDry: true }
}
```

Plug-in point (one small engine change, not yet made): a `DIALECTS` registry the seed
selects from when `?dialect=<key>` is present, falling back to unbound otherwise. This
preserves the current default exactly.

## 3 · The Fable 5 authoring prompt

Run at effort **high**. Paste the engine file and this spec as context first.

> I'm growing the *ductus* asemic-manuscript engine (`projects/012-ductus-wall/index.html`)
> for a private generative-art collection that also feeds DMCF Radio's image half. Each
> record airs with its own asemic sheet; a **dialect** fences a region of the engine's
> parameter space so a family of sheets shares one hand while the seed still individuates
> each one. I need dialects that are visually distinct from each other and legible as
> *different hands*, not different noise.
>
> Request: author **three** new dialects as `DIALECTS` objects conforming to the spec in
> `docs/ductus-dialects.md §2`, each with a one-paragraph rationale for the hand it evokes
> and which existing media family it draws from.
>
> Output format: a single committable JS file `assets/ductus-dialects.js` exporting a
> `DIALECTS` object keyed by `key`, plus the rationales as top-of-file comments. No prose
> outside the file.
>
> Constraints: only parameterize the axes in §1 — do not add new drawing code, new media,
> or new engine features. Every value must stay inside the engine's documented ranges so
> the result is deterministic and plotter-safe, and the finite-pen law (`runsDry`) must
> hold. Don't design for hypothetical future axes; three real, distinct dialects is the
> whole task.

Boundary to include for an autonomous run:

> When you have enough to act, act. Give a recommendation, not a survey. Before reporting
> done, audit each dialect's values against the ranges in §1 and say which you verified.

## 4 · Why this stays safe and in-doctrine

- **Static/offline preserved.** Fable authors code; the engines load committed files.
  No runtime model calls, so DMCF Radio invariant #1 (playlist derives from the feed and
  nothing else) and the zero-server design are untouched.
- **Determinism preserved.** A dialect only fences ranges; the same seed inside the same
  dialect still yields the same sheet.
- **The law preserved.** The seed remains the sole organ within a dialect; on the radio
  side the seed is `hash(id)` of the airing record.

## 5 · Source of truth

Fable prompting follows Anthropic's official guide (*Prompting Claude Fable 5*). There is
no `/loop` or `/goal` command and no "ultracode" effort level — autonomy comes from harness
design, and effort levels are only `low`/`medium`/`high`/`xhigh`.
