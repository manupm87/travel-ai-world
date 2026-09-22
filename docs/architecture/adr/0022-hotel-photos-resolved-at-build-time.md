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
   and TRA-207: at most 256 KiB of HTML, at most three redirects, the URL itself and every hop
   after it on the same registrable domain and through the same `fetchable` check, and one `HEAD`
   requiring a raster `image/*` of at least 15 KB whose name is not `logo`/`icon`/`favicon`/
   `sprite` nor one of the placeholders a site serves when it has no picture (`platzhalter`,
   `placeholder`, `404`, `pattern`, `stripe`, `shop.`, `default`, `dummy`, `sample`, `noimage`).
2. **Its Facebook page** — the `facebook` field, which OpenStreetMap's `contact:facebook` tag
   now fills, read with the same preview rules.
3. **Wikimedia Commons, by name only** — `list=search` in the File namespace for
   `"<name> <city>"`, matched by `choose_named`, the block this stage and
   `ai_api/infrastructure/commons_photos.py` hold word for word. Commons search answers with
   whatever shares a word with the query, so sharing a word proves nothing: a search result is the
   hotel only when its title carries the **whole** name in order (once both sides drop `hotel`,
   `panzió`, `hostal` and the like), or **both** of the name's distinctive words, or its one
   distinctive word **written beside** a word for a place to sleep. Everything is compared as
   whole words, case-folded and stripped of accents. Non-free files are skipped, and so are
   plaques, coins, drawings and postcards. **The file must also say it was taken there**: the
   licence call asks `prop=imageinfo|coordinates` in one request, and the file is the hotel's only
   when Commons places it within 500 m of the hotel's own coordinates. A file with no coordinates
   is refused. A title names a hotel, never which town's — `Park Hotel, Cortina` is in the
   Dolomites, `Austria Classic Hotel Wien` in Vienna, and both answered a search for a hotel
   elsewhere. Stores `image_url`, `image_license` and `image_author` exactly as the Wikidata stage
   does.
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

**A picture two hotels of the same city both claim is neither one's.** A chain runs one website
for all its houses and a booking widget serves them the same hero shot, so the stage's last pass
counts the pictures it assigned: any URL that reached two or more `sleep` documents is taken from
all of them, and those hotels fall to the drop rule like any other unpictured hotel (counted as
`shared` in the manifest and in the report). Twenty-odd hotels a city leave this way, which is the
right trade: the same room offered as three different stays is a lie the traveller finds out at
the door.

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
redirects followed by hand so the caller vets the URL it asked for **and** every hop after it —
an OpenStreetMap `website` tag is a stranger's string, and `http://169.254.169.254/` is a string
like any other — two attempts instead of ten, a
four-second timeout, and a cache of its own under `.cache/sites/<host>/` where a miss is stored
like a hit. `--offline` therefore works for this stage too, a rebuild with a warm cache is
byte-identical, and a dead hotel site is dialled once and never again. Commons is paced at one
second per request (`SLOW_HOSTS`).

## Chains (amended 2026-09-22, TRA-211)

The first version of this stage dropped 156 chain hotels across the three cities — Budapest 21,
Berlin 71, Madrid 65 — and a corpus that offers every hostal in Madrid and no Four Seasons is not
offering Madrid. Measured on those 156: **41** sites answer 403 to any client that is not a
browser (Marriott, Hilton, NH, Radisson), and when a chain does answer, its `og:image` is a logo
or a brand banner — IHG serves a Maldives resort for the Crowne Plaza Madrid; **16** have a brand
URL that redirects to the group's platform (`ibis.com` → `all.accor.com`) and were refused by the
same-site rule, although the page the hop lands on carries the hotel's own photograph; **19**
answered a perfectly good `og:image` and were dropped anyway, because the same hotel appears twice
(OpenStreetMap and Wikivoyage) and the shared-picture rule read the duplicate as a chain asset;
**32** have no URL at all; **17** sites are dead; **6** point at booking.com. Wikidata's 176 items
for those hotels carry almost no media (P18 0, P373 2, sitelinks 5), but a *search by name* finds
the flagships with a photograph: Hilton Budapest, Hotel Adlon, the Banco Español de Crédito
building the Four Seasons Madrid was built into.

Each of those is a different mistake, so each gets its own rule.

1. **A picture two documents of the same hotel share is still that hotel's.** The shared-picture
   rule now asks whether the claimants are one hotel or several: the same `entity_id`, the same
   folded name, or fifty metres apart with one name written inside the other. Only distinct
   hotels sharing a picture lose it, and `shared` in the manifest counts only those.
2. **Hotel groups are listed** (`tools/city_corpus/city_corpus/config/hotel_groups.py`, copied
   into `ai_api/infrastructure/site_previews.py`, which may not import the tool). A redirect
   whose target's registrable domain is a listed group is the hotel's own site, subdomains
   included. On such a page the preview is refused when its path is a brand asset
   (`logo|brand|generic|default|placeholder|maldives`), and for a group that publishes one global
   banner on every page (IHG) the preview is not read at all: the largest-picture rule finds the
   house's own photograph further down. Nothing else changes for the rest of the web — the
   allowlist is a list of twenty-six domains, not a relaxation of the same-site rule.
3. **The hotel's Wikidata item, found by name near its coordinates**, is a new tier between
   Commons and the homepage. `wbsearchentities` for the name with its lodging words stripped, in
   English, in Spanish and in the city's language; an item is the hotel only when its P625 is
   within 300 m of it — tighter than the 500 m a photograph is allowed, because an item is the
   building and the next hotel down the road is a different one. Then P18, else the first free
   geotagged file of its P373 Commons category, else its article's lead picture, every one of
   them licence-checked as usual. It runs for a hotel that already carries a `wikidata` id too:
   the enrichment stage found no free P18, but the item may still have a category or an article.
4. **A person is the last source.** `curated/<city>/hotels.toml` holds `[[hotel]]` entries with a
   `match`, the `image_url` of the picture the hotel publishes of itself, its `credit`, the
   `source_url` it was read on and a `checked` date — the twin of `curated/<city>/tours.toml`,
   with the same discipline: the hotel's own site, never a reseller, nothing copied. It is applied
   **before** every other source, verified with the same `HEAD`, and a failing entry is a warning
   that lets the hotel fall through. A `match` that names no hotel or several stops the build.
   The report's new **Notable hotels without a photo** list, from a chain-name regex, says which
   hotels want an entry and why the rules could not picture them (`403`, `no url`, `dead`,
   `no picture`, `shared picture`). The readiness gate does not fail on it: a curated file is a
   person's afternoon, and a city should not be un-indexable for want of one.

What did **not** change: a hotel without a photo still leaves the corpus, Commons is still asked
by name and place, and the hot-linking bargain is the same for a curated URL as for a preview.

## Consequences

- Every stay the planner offers has a picture of itself. Budapest keeps 206 of its 415 located
  hotels (36 already in the corpus, 53 from their own site, 28 from Facebook, 31 named on Commons,
  58 from a homepage), Berlin 338 of 649 and Madrid 279 of 527; the report's Hotels section names
  the ones that went.
- The corpus loses about half of its hotels, mostly to dead websites. That is the intended
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
  `ai_api/infrastructure/commons_photos.py`, because the tool may not import a service. The block
  is identical in both, says so above itself, and a test in the tool's suite compares the two
  files; change one and change the other.
- The name match and the location check cost real photos as well as junk: a hotel whose Commons
  file spells its name differently (`Margitsziget-GreenIslandHostel`), and every hotel whose file
  was uploaded without a geotag, is now dropped rather than shown someone else's building. Fewer
  hits was the trade asked for, and the Commons tier is the one source of the four that can be
  checked this way — the hotel's own site vouches for its own picture by publishing it.
- The live finder (`commons_photos.py`) applies the same location check to what it finds by name,
  and only to that: a file found by `geosearch` was chosen for being within 60 m. A named file
  taken elsewhere now falls through to the geosearch instead of being returned.
- The live lookups stay for `eat`, `drink` and `see`: those categories have no such rule, their
  cards are suggestions rather than commitments, and a restaurant with no photo is still worth
  offering.
- The chains are back (TRA-211), and the corpus now has a hand-written input for photographs as
  well as for tours. That is a maintenance cost with no automatic check behind it: a curated URL
  can rot, and only the `checked` date and the 400-day warning say when someone last looked. It is
  the cost of a Four Seasons card, and the alternative — a scraper against a booking platform —
  is neither licence-clean nor allowed.
- Revisit when a city's hotels come from somewhere other than OpenStreetMap, or when the
  homepage heuristic starts picking staff portraits and breakfast buffets often enough to
  notice — the answer then is a stricter fourth source, not a blank card.
