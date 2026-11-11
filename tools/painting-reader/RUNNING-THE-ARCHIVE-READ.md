# Reading the Colorist Archive on your own machine

The painting reader turns a museum photograph into measurements, and a work with a reading
composes through the full method (`engine.js: readBrief`) instead of from its five colours alone.
Reading more works is the only way to widen that, and no code change substitutes for it.

Most of what is left can only be read from a residential address. This note says why, what to run,
and what has to be fixed before a complete read can ship.

## Where the archive stands

Measured from `projects/060-poured-ground/archive/` on 11 November 2026:

| | works |
|---|---|
| In the archive | 20,367 |
| Not public domain (skipped by rule) | 2,611 |
| Public domain, with an image URL — eligible | **17,756** |
| Already read | 1,244 |
| **Left to read** | **16,512** |

Of those 16,512, **16,112 are on `upload.wikimedia.org`** and 393 sit on eleven museum hosts that
the `HOSTS` table in `read_works.py` does not list yet (Walters, Getty, Europeana, SMK, the
Smithsonian, the V&A, the National Gallery, Google Arts CDNs `lh3`/`lh4`/`lh6`, Culturalia, DIMU).
The six hosts that *are* configured — Met, Tate, Cleveland, NGA and two Google CDNs — are
exhausted: 1,244 of their 1,246 eligible works are read, and the two that are not return 403, so
their URLs have rotted.

`www.artic.edu` (5 works) returns 403 to a scripted request and is not worth pursuing.

## Why this cannot run in a cloud session

A request to `upload.wikimedia.org` from the cloud container is answered:

```
HTTP 429  Your request does not comply with our robot policy,
          https://w.wiki/4wJS
```

That is address-based, not a fault in the script. The same request from a residential connection
is served normally. Hence: your Mac.

## What Wikimedia asks of you

From the Wikimedia [Robot policy](https://wikitech.wikimedia.org/wiki/Robot_policy), the **Media
API rules** that govern `upload.wikimedia.org`:

- Total concurrency of **at most 2**.
- Total download speed **at most 25 Mbps**, measured over ten-second intervals.
- Use **originals or standard thumbnail sizes only**, and prefer thumbnails.
- Honour `Retry-After` when a 429 comes back.
- Identify your client accurately in the `User-Agent`.
- Consider Wikimedia Dumps rather than live requests where they would serve.

The script already complies with the ones it can: it rewrites every Commons URL to the standard
1280 px thumbnail (`readable_url`), sends a descriptive User-Agent naming the project and its
repository, and sleeps for `Retry-After` on a 429. **Concurrency is yours to set: do not run more
than `--workers 2`.** There is no stated per-second request ceiling for media, so concurrency and
bandwidth are the real limits — the "~120 seconds between requests" in the `--pace` help text
describes being blocked from a cloud address, not the policy.

Do not edit the User-Agent to look like a browser. That is the one thing the policy says will get
you blocked rather than throttled.

## Before you start: the 58 MB problem

**Do not run the complete read until the output is sharded.** Every reading is written into one
file, `projects/060-poured-ground/archive/readings.json`, and the studio downloads that whole file
before it can show any archive work:

```js
fetch('archive/readings.json').then(...)   // sketch.js, loadArchiveReadings
```

At 3,337 bytes per record, 1,244 readings are already 4.15 MB. A complete read would be
**about 58 MB**, fetched in full on every visit, and committed as one blob in git history.

Two options, in order of preference:

1. **Shard per artist**, as the archive's own work files already are
   (`archive/<artist-id>.json`), and load a work's reading with its artist. This is the right
   shape and matches what is there; it is a change to `read_works.py`, `loadArchiveReadings` and
   `readingFor`.
2. **Read in batches** with `--limit`, and stop while the file is still small.

Reading a few thousand works and shipping a 15 MB blob would be worse than not reading them. Ask
me to do the sharding first — it is a contained change, and then the full read is safe to ship.

## Setting up

Python 3.11 or newer (3.13.18 here), git, and about 200 MB of free space. Images are downloaded to
a temporary directory and deleted immediately after each read, so disk use stays flat; only the
readings file grows.

```sh
git clone https://github.com/dmaris70/generative-art.git     # or: git pull in your existing clone
cd generative-art/tools/painting-reader

python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt          # numpy, Pillow, jsonschema
```

Check the reader runs at all, on hosts that are not rate-limited:

```sh
python3 read_works.py --archive --hosts tate --resume --limit 5
```

You should see a line like `1246 eligible works on ['tate'] | 1244 already read | 0 to read`.

## The run

```sh
cd generative-art/tools/painting-reader
source .venv/bin/activate

# a small proving run first — twenty works, then look at the output
python3 read_works.py --archive --hosts wikimedia --resume --workers 2 --pace 0.5 --limit 20

# the full run
python3 read_works.py --archive --hosts wikimedia --resume --workers 2 --pace 0.5
```

What each flag does:

| flag | why |
|---|---|
| `--hosts wikimedia` | only Commons; the configured museum hosts are already exhausted |
| `--resume` | skips every id already in `readings.json`; always pass it |
| `--workers 2` | the policy ceiling. Do not raise it |
| `--pace 0.5` | minimum seconds between requests across all workers; raise it if you see 429s |
| `--limit N` | stop after N works, for a proving run or a batch |

Progress prints every 25 works, and **the readings file is written every 25 works**, so the run is
safe to interrupt with Ctrl-C: at most 24 works' work is lost and `--resume` picks up from there.
Works that fail are collected in `archive/readings.json.failures.json` with the reason.

## Expected time

Measured here: the reader itself takes **0.5–1.4 s of CPU per image** (900 px side, single thread),
and a fetch from a fast host 0.2–0.3 s. With two workers, a 1280 px Commons thumbnail and
`--pace 0.5`, expect roughly **0.6–1.0 s per work**, so **three to five hours** for 16,112 works,
plus whatever Commons adds in latency. Roughly 8 GB will cross the wire and be discarded.

Run it overnight. There is no harm in stopping and resuming the next day.

## If it stalls

Note a real limitation: on a 429 the script sleeps for `Retry-After` and retries **without
counting the attempt**, so a persistent rate-limit does not fail — the run simply stops making
progress, silently. If the `n of N` lines stop advancing for more than a few minutes:

1. Stop it (Ctrl-C). Nothing is lost beyond the last 25-work save.
2. Raise `--pace` to 2 or 5 and start again with `--resume`.
3. If it still stalls, your address is being throttled. The policy's own remedy is to ask for an
   exemption, or to use Wikimedia Dumps instead of live requests. Do not work around it.

## When the run finishes

```sh
cd generative-art
node tools/poured-ground-check.mjs          # expect: all NNNNN checks pass
git switch -c archive-readings-<date>
git add projects/060-poured-ground/archive/readings.json
git commit -m "Read N more Colorist Archive works"
git push -u origin archive-readings-<date>
```

Then tell me and I will check the new records against the reader's schema, confirm the studio
still loads, and open the pull request.

## What I can do without your Mac

The 393 works on the eleven unconfigured museum hosts. Every one of those hosts was reachable from
the cloud container when tested on 11 November 2026, and adding them to `HOSTS` would take the
corpus from 1,244 to about 1,637 readings — a 32% increase — in a single session. Ask and I will.
