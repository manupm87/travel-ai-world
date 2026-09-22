# 0022 — Every hotel has a photo: resolved at build time, or it leaves the corpus

**Status:** Accepted
**Date:** 2026-09-22

## Context

A hotel card with no picture is the worst card the planner shows. Every other card is a
suggestion the traveller can take or leave; the stay is the one thing they are asked to commit
to, and the corpus was offering it blind. Before this change 36 of Budapest's 415 located `sleep`
documents carried an `image_url` — 9%. ADR 0021 pictures a venue live from the preview its own
site publishes, and that filled some hotel cards at request time, but only some: a lookup that
misses leaves the placeholder, and a placeholder under "sleep here" is not an offer.

Measured on those 415 hotels (2026-09-22): 36 were pictured by the corpus already; **+97** were
found on Wikimedia Commons by name or near their coordinates, which the live lookup never tried
for hotels; **+47** came from the site preview (the ADR 0021 rules); OpenStreetMap carries
`contact:facebook` on 137 of Budapest's 621 hotel elements, and a Facebook page's `og:image` is
its profile photo, which is reliably a picture of the place; and a
largest-image-on-the-homepage heuristic pictures about a third of what is left. About a third of
the hotel websites in a city are dead — DNS failures, timeouts, parked domains — and those
hotels can never be pictured at all.

Two things follow. First, most of this work is not request-time work: a Commons search, a page
fetch and a `HEAD` per hotel is 20–45 minutes for a city, which is a build, not a turn. Second,
whatever is left over after all four sources is a hotel nobody can see, and the planner is better
off not knowing about it: the traveller loses a name they could not have judged anyway, and every
stay the corpus does offer is a stay they can look at.

## Decision

**The corpus resolves the photo, at build time.** A new stage, `photos`
(`tools/city_corpus/city_corpus/sources/photos.py`), runs after Wikidata and the district
assignment and before climate. Its input is every `sleep` document with coordinates and no
`image_url`; for each it tries four sources in order and stops at the first hit:

1. **The hotel's own site preview** (`url`) — `og:image:secure_url` > `og:image` >
   `twitter:image` > `twitter:image:src` > `<link rel="image_src">`, under the rules of ADR 0021
   and TRA-207: at most 256 KiB of HTML, at most three redirects, every hop on the same
   registrable domain and through the same `fetchable` check, and one `HEAD` requiring a raster
   `image/*` of at least 15 KB whose name is not `logo`/`icon`/`favicon`/`sprite`.
2. **Its Facebook page** — the `facebook` field, which OpenStreetMap's `contact:facebook` tag
   now fills, read with the same preview rules.
3. **Wikimedia Commons, by name only** — `list=search` in the File namespace for
   `"<name> <city>"`, with the matching rules of `ai_api/infrastructure/commons_photos.py`
   (distinctive words, the generic-word list) copied into the stage; a file counts only when its
   title carries a distinctive word of the hotel's name, and non-free files are skipped. Stores
   `image_url`, `image_license` and `image_author` exactly as the Wikidata stage does.
4. **The largest picture on its homepage** — the `src`/`data-src` of each `<img>`, the first URL
   of a `srcset` and each CSS `background-image`, in document order, keeping only raster
   extensions whose path is not `logo|icon|sprite|flag|badge|payment|tripadvisor|booking|
   placeholder|blank|pixel|loading|avatar`; at most five are checked with a `HEAD`, and the first
   raster image of at least 40 KB wins. A stated length is required here: nothing else vouches
   for the picture.

**The hotel's own picture of itself comes first, and Commons is asked by name only.** The first
version of this stage put Commons first because it is the only licence-clean source, and it
accepted a file merely photographed within 30 m when nothing named the hotel. Both were wrong for
a stay: the picture a traveller wants is the one the hotel publishes of itself, and a file found
by coordinates is as likely to show the street, the neighbours' façade or a passing tram — a
plausible-looking card of the wrong building is worse than a plainer card of the right one. So
Commons now answers only when the hotel's name is written on the file, and it answers after the
site and the Facebook page, which is also why `geosearch` is gone from the stage. It stays in the
live finder (`commons_photos.py`) for `eat` and `drink`, where there is no site to ask, but there
too a file must name the venue.

The three sources that are not Commons store `image_credit`, the bare domain the picture came
from (`hotelgellert.hu`, `facebook.com`), which is a new optional document field;
`ai_api/application/cards.py` prints it in place of the Commons author-and-licence line when it
is there.

**A hotel that ends the stage without an `image_url` is removed from the corpus.** The manifest
records where every photo came from and how many hotels went (`enrichment.photos`), `report.md`
gets a **Hotels** section from it, and the readiness gate gains `pictured_sleep ≥ 10`, so a city
whose hotels cannot be pictured cannot be indexed.

**At request time the planner trusts the corpus but checks it anyway**: the hotel step and the
"choose for me" path drop `sleep` documents without an `image_url` before the model picks, and
search twice as wide to make up the numbers. An index built before this change therefore degrades
to fewer stays, never to a blank card. `ensure_photos` is unchanged and keeps doing the live
lookups for `eat`, `drink` and the rest.

All fetching goes through `city_corpus.http.ApiClient`, which gains `get_text` and `head`:
redirects followed by hand so the caller vets every hop, two attempts instead of ten, a
four-second timeout, and a cache of its own under `.cache/sites/<host>/` where a miss is stored
like a hit. `--offline` therefore works for this stage too, a rebuild with a warm cache is
byte-identical, and a dead hotel site is dialled once and never again. Commons is paced at one
second per request (`SLOW_HOSTS`).

## Consequences

- Every stay the planner offers has a picture of itself. Budapest keeps 247 of its 415 located
  hotels (36 already in the corpus, 69 from their own site, 27 from Facebook, 60 named on Commons,
  55 from a homepage), Berlin 402 of 649 and Madrid 316 of 527; the report's Hotels section names
  the ones that went.
- The corpus loses about a third of its hotels, mostly to dead websites. That is the intended
  trade: a name with no picture was not an offer. Hotels are plentiful, and the gate
  (`pictured_sleep`) is what stops the loss from going unnoticed.
- The site, Facebook and homepage sources are **hot-linked URLs on the venue's own server, not
  licence-clean material**. They are stored as URLs and credited by domain — never copied,
  never re-hosted — which is the same bargain as ADR 0021, and the reason `license` and
  `image_license` stay empty for them. A picture
  that moves or disappears leaves a broken image until the next rebuild; the card's `onError`
  hides it, and rebuilding a city is one command.
- The build costs 20–45 minutes more per city on a cold `.cache/sites/`, almost all of it waiting
  politely. A rebuild that only touches the other stages pays nothing.
- The Commons rules now live in two places, `tools/city_corpus/sources/photos.py` and
  `ai_api/infrastructure/commons_photos.py`, because the tool may not import a service. Both say
  so at the top; change one and read the other.
- The live lookups stay for `eat`, `drink` and `see`: those categories have no such rule, their
  cards are suggestions rather than commitments, and a restaurant with no photo is still worth
  offering.
- Revisit when a city's hotels come from somewhere other than OpenStreetMap, or when the
  homepage heuristic starts picking staff portraits and breakfast buffets often enough to
  notice — the answer then is a stricter fourth source, not a blank card.
