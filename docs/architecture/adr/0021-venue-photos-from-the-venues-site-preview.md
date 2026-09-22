# 0021 — A venue with no photo shows the preview of its own site, never another venue's

**Status:** Accepted
**Date:** 2026-09-22

## Context

Sights are pictured, venues are not. In the three cities in the corpus today, 80–84% of the
`see`/`do`/`history` documents carry an `image_url`, against 0–2% of `eat`, 3–4% of `drink` and
6–12% of `sleep`: a sight is a Wikivoyage or Wikipedia subject with a Commons photo, while a
restaurant is an OpenStreetMap node with a name, a cuisine and, often, a website. Wikimedia
Commons is asked for those (TRA-161, `infrastructure/commons_photos.py`) and answers for a few —
a geotagged photo of the street, of the building — but most cards came out of that lookup with
nothing.

What filled them was the corpus fallback: a pictured place of the same city and category stood in
for the card, credited as that place's photo. That is the problem this ADR closes. A card is an
offer — "have dinner here" — and the picture beside the offer showed a different restaurant. The
credit line said so, in small print, over the image; nobody reads it that way. Showing nothing is
more honest than showing the wrong place.

The venue's own site is the material nobody else has: Madrid's corpus carries the operator's URL
(`metadata.url`, the card's `deep_link`) for 1,611 of its 3,527 restaurants and for 476 of its 527
hotels. Every site of that kind publishes a link preview — the `og:image` a chat, a search engine
or a social network shows when the link is pasted — which is a picture the venue chose of itself,
published for exactly this use.

Two commercial sources were rejected before this one. **Google Places Photos**: its terms forbid
storing the content, and forbid showing it beside a map that is not Google's — the planner's map
is MapLibre over OpenFreeMap (ADR 0016). **TripAdvisor**: its content API requires its logo, its
name and its ratings displayed beside every photo, which is a different product than a card.
Both are already forbidden sources for the corpus (`tools/city_corpus/README.md`).

## Decision

`ai_api` gains a second photo port, `SitePreviewFinder` (`domain/ports.py`), and its adapter
`SitePreviews` (`infrastructure/site_previews.py`). `application/photos.ensure_photos` asks, per
card, in this order:

1. the card's own `image_url` (the corpus);
2. `PhotoFinder` — Wikimedia Commons, by name and coordinates, or the lead image of the card's
   wiki page;
3. `SitePreviewFinder.preview(card.deep_link)`, when the card links to the venue's own site;
4. the caller's fallback, which is now **only** a sight of the district for a neighbourhood card
   (`PlanTrip._corpus_photo`): a district *is* its landmarks, a restaurant is not another
   restaurant;
5. the neutral placeholder, credited `Illustrative photo`.

The preview is fetched live and never written to the corpus: the corpus is licence-clean by
construction, and a site's own preview is not licensed to us — it is displayed the way a link
preview is, credited with the site's bare domain (`Photo: restaurantesamm.com`) and hot-linked
from the venue's own server. One streamed `GET` per site, at most 256 KiB of HTML parsed with the
standard library's `html.parser`; `og:image:secure_url`, `og:image`, `twitter:image`,
`twitter:image:src`, `<link rel="image_src">`, in that order of preference; relative URLs resolved
against the final URL and `http://` rewritten to `https://`. Answers are kept in process memory
for a day, **hits and misses alike**, bounded to 2,000 entries.

Before any request the adapter refuses anything that is not a venue's public site: a scheme other
than http(s), credentials in the URL, an IP literal, `localhost`, a host without a dot or ending
in `.local`/`.internal`, and the hosts that are never the venue's own (`wikipedia.org`,
`wikivoyage.org`, `wikimedia.org`, `wikidata.org`, `openstreetmap.org`). Redirects are followed by
hand, at most three, and every hop passes the same check, so a site cannot redirect the lookup
where the first URL could not go. A lookup that fails for any reason logs a warning and answers
None, like the Commons one.

It is wired in `main.lifespan` behind `SITE_PREVIEWS_ENABLED` (`SITE_PREVIEW_TIMEOUT`,
`SITE_PREVIEW_MAX_BYTES`, `SITE_PREVIEW_CACHE_SECONDS`) and reaches both the planner and the card
detail endpoint. No schema changes: `OptionCard.image_url` / `image_credit` carry it. The card's
credit line in the frontend now prints the photo's credit alone — the corpus document's licence is
not the picture's.

## Consequences

- A restaurant, bar or hotel card shows a picture of *that* place or no picture at all. Venue
  coverage rises with the share of the city's corpus that carries an operator URL (about half of
  Madrid's restaurants, 90% of its hotels), and a card with nothing shows the placeholder.
- The image is not licence-clean the way Commons is, which is exactly why it is never persisted,
  never indexed and never part of a corpus release. It is fetched at request time, from the
  venue's own host, and disappears from memory a day later.
- A card can now cost up to one extra request after a Commons miss, bounded by the two-second
  timeout, by the existing six-lookup semaphore and by the cache, which makes the second turn of
  a session free.
- A venue that changes its preview changes its card, with no deploy and no rebuild. A venue that
  publishes a logo as its `og:image` shows a logo: still the right place.
- Broken images are the page's business, not the service's: the card's `onError` already hides
  them, so nothing verifies the image URL.
- If a site objects to being previewed, its host goes on `DENIED_HOSTS` and the card falls back
  to the placeholder. Should this become common, the next step is a per-city opt-out in the
  city's TOML, not a licence negotiation.
