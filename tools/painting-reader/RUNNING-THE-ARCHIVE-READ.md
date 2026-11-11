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
| Already read | 1,635 |
| **Left to read** | **16,121** |

Every one of those 16,121 is on `upload.wikimedia.org`, bar nine. **The museum hosts are
exhausted**: all 1,635 of their eligible works are read — the Met, Tate, Cleveland, the NGA, four
Google Arts CDNs, the Walters, the Getty, Europeana, SMK, the Smithsonian, the V&A, the National
Gallery in London, Culturalia and DigitaltMuseum. The nine left there cannot be had: four images
have gone (two at the Met, two at the Getty) and `www.artic.edu`'s five refuse a scripted request.

So this run is Wikimedia, and only Wikimedia.

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

## Where the readings go

One file per artist, `projects/060-poured-ground/archive/readings/<artist-id>.json`, with
`readings/index.json` naming the artists that have any. `read_works.py` writes that shape directly
and resumes from it, so there is nothing to split afterwards and nothing to do before you start.

It was a single `archive/readings.json` until 11 November 2026, which the studio had to fetch whole
before it could show any archive work: 4.15 MB for 1,244 readings, and some 58 MB had the archive
been read out. That blocked this read, and was fixed first. A visit now fetches the index (about
4 kB) and one artist's shard, so reading the archive out adds files rather than growing one.

If you are working from a checkout older than that, migrate it before you start:

```sh
node tools/shard-archive-readings.mjs       # verifies every record through the round trip
```

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
python3 read_works.py --archive --hosts museums --resume --limit 5
```

You should see `1639 eligible works on [...] | 1635 already read | 4 to read`, and those four will
fail: their images have gone. That is the expected state before the Wikimedia run.

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

## What was done without your Mac

Everything the museum hosts hold. On 11 November 2026 the `HOSTS` table named six hosts and all
six were exhausted, while 393 works sat on eleven hosts it did not list — excluded by a hostname
list, not by any policy. Ten were added and read, taking the corpus from 1,244 to 1,635. Every
reading was then re-read so that all of them carry the grain bins the hand follows.

What remains is Wikimedia's 16,112, and that is the run this note is for.
