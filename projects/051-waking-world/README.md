# 051 — The Waking World

Wikipedia editing across the world, drawn under the real day and night. Each edit is a spark at the
place where that language's readers live. The titles of the articles being written appear in their
own script, with Wikipedia's own English title beneath. A 24-hour rhythm panel shows each language's
editing day, plotted against UTC or against its readers' local sun time.

This is an **evaluation screen**: a 2D-canvas prototype. The wall version would move to the
GPU kernel used in 049 and 050.

## What is real and what is modelled

| Part | Source |
|---|---|
| Day, night, twilight, the waking front, the point where the sun is overhead | Calculated from the sun's position (NOAA approximation) |
| Land | Natural Earth, 1° cells, taken from 049's geography data |
| Sparks and titles, **LIVE** | Wikimedia EventStreams `recentchange`: human (non-bot) edits to Wikipedia articles (namespace 0) |
| Sparks and titles, **RECORDED** | A real recording of the same stream, already checked (below), embedded in the page and replayed at its own times |
| Sparks, **MODEL** | Poisson edits from an assumed human day by local sun time. Illustrative only; no titles |
| Where each language sits | Approximate speaker centroids; languages spoken in many regions are split, and each edit is credited to the region most awake at that moment |
| Rhythm panel | LIVE: hourly counts measured since the page opened, with the model dashed for comparison. Otherwise the model |

## Titles: the rules

- **Only edits Wikipedia kept.** In live mode an edit waits 15 minutes. It is then looked up
  (`action=query&prop=revisions&rvprop=ids|tags`) and shown only if the revision still exists and
  is not tagged `mw-reverted`. Reverted vandalism and deleted new pages never appear. Sparks are
  immediate; titles run 15 minutes behind.
- **English title:** taken from Wikipedia's own interlanguage link (`prop=langlinks&lllang=en`),
  not machine translation. It is left out when no English article exists.
- **No people:** usernames, temporary-account names, IP addresses and edit summaries are never read
  into the display.
- **Articles only:** talk pages, user pages, logs and bot edits are excluded.
- **Pace:** at most one new title every 1.1 s, and at most 3–16 on screen depending on size. Each
  title stays 7.5 s. The language shown least recently goes first, so English does not dominate.
  New articles are drawn in amber.
- **Typography:** each title is set in its own script (Noto Sans for Arabic, Hebrew, Japanese,
  Korean, Simplified and Traditional Chinese, Devanagari, Bengali, Tamil, Thai, Georgian and
  Armenian), right to left where the script is, and tagged with its language so Chinese and
  Japanese use the correct glyphs.
- **Load on Wikimedia:** in live mode, at most 8 wikis are queried every 30 s, two calls each,
  through the anonymous CORS API (`origin=*`).

## The recording

`record.mjs` (kept outside the repo) listened to the stream for 20 minutes. It then waited 15
minutes after the last edit, applied the same survival check and fetched the English titles. The
recording's time window and counts are in the page and in the commit message.

## Settings

The buttons are **DATA** (LIVE / RECORDED / MODEL), **SPEED** (model only), **RHYTHM BY** (UTC /
LOCAL SUN TIME) and **LABELS**. Controls fade after 8 s without input. If the live stream cannot be
reached, the page falls back to the recording.

## Not yet checked

- A full 24 hours of live data, to see whether real editing collapses onto one curve in local sun
  time. The model assumes that it does.
- Rate limits on the survival check during busy hours.
- Readability on the wall at its viewing distance.
