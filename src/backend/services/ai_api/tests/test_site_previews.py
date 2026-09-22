"""SitePreviews against a mocked HTTP transport: no network, no key."""

import logging

import httpx
import pytest
from ai_api.infrastructure.commons_photos import USER_AGENT
from ai_api.infrastructure.site_previews import SitePreviews
from ai_api.testing import settings_for_tests

SITE = "https://restaurantesamm.com/"
IMAGE = "https://restaurantesamm.com/img/sala.jpg"


def _html(head: str) -> str:
    return f"<!doctype html><html><head>{head}</head><body><p>Hola</p></body></html>"


def _serving(
    html: str,
    *,
    status: int = 200,
    content_type: str = "text/html; charset=utf-8",
    final_url: str | None = None,
):
    """A handler answering this page, and the list of requests it saw."""
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if final_url is not None and str(request.url) != final_url:
            return httpx.Response(301, headers={"location": final_url})
        return httpx.Response(status, text=html, headers={"content-type": content_type})

    return handler, seen


def _previews(handler, **kwargs) -> SitePreviews:
    return SitePreviews(
        httpx.AsyncClient(
            transport=httpx.MockTransport(handler), follow_redirects=True
        ),
        **kwargs,
    )


# ─── What the page declares ──────────────────────────────────────────────────


async def test_an_absolute_og_image_is_the_photo_credited_with_the_domain() -> None:
    handler, seen = _serving(_html(f'<meta property="og:image" content="{IMAGE}">'))

    photo = await _previews(handler).preview(SITE)

    assert photo is not None
    assert photo.url == IMAGE
    assert photo.credit == "restaurantesamm.com"
    assert len(seen) == 1


async def test_a_relative_image_is_resolved_against_the_final_url() -> None:
    """The site redirects to www; the image hangs off where it ended up."""
    final = "https://www.samm.example/es/"
    handler, _ = _serving(
        _html('<meta property="og:image" content="../img/sala.jpg">'),
        final_url=final,
    )

    photo = await _previews(handler).preview("https://samm.example/")

    assert photo is not None
    assert photo.url == "https://www.samm.example/img/sala.jpg"
    # The credit is the bare domain: `www.` is noise.
    assert photo.credit == "samm.example"


async def test_an_http_image_is_rewritten_to_https() -> None:
    """The page is served over https: mixed content would never render."""
    handler, _ = _serving(
        _html('<meta property="og:image" content="http://cdn.samm.example/a.jpg">')
    )

    photo = await _previews(handler).preview(SITE)

    assert photo is not None
    assert photo.url == "https://cdn.samm.example/a.jpg"


async def test_the_secure_url_is_preferred_over_the_plain_og_image() -> None:
    handler, _ = _serving(
        _html(
            '<meta property="og:image" content="https://s.example/plain.jpg">'
            '<meta property="og:image:secure_url" content="https://s.example/s.jpg">'
        )
    )

    photo = await _previews(handler).preview(SITE)

    assert photo is not None and photo.url == "https://s.example/s.jpg"


async def test_the_first_og_image_wins_over_the_later_ones() -> None:
    handler, _ = _serving(
        _html(
            '<meta property="og:image" content="https://s.example/1.jpg">'
            '<meta property="og:image" content="https://s.example/2.jpg">'
        )
    )

    photo = await _previews(handler).preview(SITE)

    assert photo is not None and photo.url == "https://s.example/1.jpg"


async def test_twitter_image_is_used_when_there_is_no_og_image() -> None:
    handler, _ = _serving(
        _html('<meta name="twitter:image" content="https://s.example/t.jpg">')
    )

    photo = await _previews(handler).preview(SITE)

    assert photo is not None and photo.url == "https://s.example/t.jpg"


async def test_twitter_image_src_is_used_as_well() -> None:
    handler, _ = _serving(
        _html('<meta name="twitter:image:src" content="https://s.example/t.jpg">')
    )

    photo = await _previews(handler).preview(SITE)

    assert photo is not None and photo.url == "https://s.example/t.jpg"


async def test_link_rel_image_src_is_the_last_candidate() -> None:
    handler, _ = _serving(
        _html('<link rel="image_src" href="https://s.example/old.jpg">')
    )

    photo = await _previews(handler).preview(SITE)

    assert photo is not None and photo.url == "https://s.example/old.jpg"


async def test_a_page_that_declares_no_preview_is_none() -> None:
    handler, _ = _serving(_html('<meta name="description" content="Cocina de autor">'))

    assert await _previews(handler).preview(SITE) is None


async def test_a_data_uri_candidate_is_refused() -> None:
    handler, _ = _serving(
        _html('<meta property="og:image" content="data:image/png;base64,AAAA">')
    )

    assert await _previews(handler).preview(SITE) is None


async def test_a_page_that_is_not_html_is_none() -> None:
    handler, seen = _serving("{}", content_type="application/json")

    assert await _previews(handler).preview(SITE) is None
    assert len(seen) == 1


async def test_the_body_is_not_read_past_the_limit() -> None:
    """A preview in the head is found even on a page far over `max_bytes`,
    and what lies beyond the limit is never looked at."""
    padding = "<!--" + ("x" * 4000) + "-->"
    handler, _ = _serving(
        _html(
            f'<meta property="og:image" content="{IMAGE}">'
            + padding
            + '<meta property="og:image:secure_url" content="https://s.example/late.jpg">'
        )
    )

    photo = await _previews(handler, max_bytes=512).preview(SITE)

    # The better-ranked candidate past the limit was never seen.
    assert photo is not None and photo.url == IMAGE


# ─── Refused before any request ──────────────────────────────────────────────


@pytest.mark.parametrize(
    "url",
    [
        "ftp://samm.example/menu",
        "https://user:pass@samm.example/",
        "http://192.168.0.10/",
        "https://[2001:db8::1]/",
        "http://localhost:8000/",
        "http://intranet",
        "http://printer.local/",
        "https://wiki.internal/",
        "https://en.wikipedia.org/wiki/Budapest",
        "https://www.openstreetmap.org/node/1",
        "https://commons.wikimedia.org/wiki/File:A.jpg",
        "",
    ],
)
async def test_a_url_that_is_not_a_venues_public_site_makes_no_request(url) -> None:
    handler, seen = _serving(_html(f'<meta property="og:image" content="{IMAGE}">'))

    assert await _previews(handler).preview(url) is None
    assert seen == []


# ─── Failures answer None, never raise ───────────────────────────────────────


async def test_an_upstream_500_is_none(caplog) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="boom", headers={"content-type": "text/html"})

    with caplog.at_level(logging.WARNING):
        assert await _previews(handler).preview(SITE) is None


async def test_a_connection_error_is_none_and_warns(caplog) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("no route to host", request=request)

    with caplog.at_level(logging.WARNING):
        assert await _previews(handler).preview(SITE) is None

    assert "Site preview lookup failed" in caplog.text


async def test_an_unknown_charset_is_none_and_warns(caplog) -> None:
    handler, _ = _serving(
        _html(f'<meta property="og:image" content="{IMAGE}">'),
        content_type="text/html; charset=definitely-not-a-charset",
    )

    with caplog.at_level(logging.WARNING):
        assert await _previews(handler).preview(SITE) is None

    assert "Site preview lookup failed" in caplog.text


# ─── The cache ───────────────────────────────────────────────────────────────


async def test_a_second_lookup_of_the_same_site_makes_no_request() -> None:
    handler, seen = _serving(_html(f'<meta property="og:image" content="{IMAGE}">'))
    previews = _previews(handler)

    first = await previews.preview(SITE)
    second = await previews.preview(SITE)

    assert first == second
    assert len(seen) == 1


async def test_a_miss_is_cached_too() -> None:
    """A site without a preview must not be asked again for every card."""
    handler, seen = _serving(_html(""))
    previews = _previews(handler)

    assert await previews.preview(SITE) is None
    assert await previews.preview(SITE) is None
    assert len(seen) == 1


async def test_an_entry_older_than_the_ttl_is_fetched_again() -> None:
    handler, seen = _serving(_html(f'<meta property="og:image" content="{IMAGE}">'))
    now = [1000.0]
    previews = _previews(handler, cache_seconds=60, clock=lambda: now[0])

    await previews.preview(SITE)
    now[0] += 59
    await previews.preview(SITE)
    assert len(seen) == 1

    now[0] += 2
    await previews.preview(SITE)
    assert len(seen) == 2


async def test_the_cache_never_grows_past_its_size() -> None:
    handler, seen = _serving(_html(f'<meta property="og:image" content="{IMAGE}">'))
    previews = _previews(handler, cache_size=2)

    for i in range(5):
        await previews.preview(f"https://samm{i}.example/")

    assert len(previews._cache) == 2
    # The oldest went first: the first site is asked again.
    await previews.preview("https://samm0.example/")
    assert len(seen) == 6


# ─── Wiring ──────────────────────────────────────────────────────────────────


def test_from_settings_reads_the_timeout_and_sets_the_user_agent() -> None:
    settings = settings_for_tests()

    previews = SitePreviews.from_settings(settings)

    assert previews._client.headers["user-agent"] == USER_AGENT
    assert previews._client.timeout.read == settings.SITE_PREVIEW_TIMEOUT
    assert previews._client.timeout.connect == settings.SITE_PREVIEW_TIMEOUT
    assert previews._max_bytes == settings.SITE_PREVIEW_MAX_BYTES
    assert previews._cache_seconds == settings.SITE_PREVIEW_CACHE_SECONDS


async def test_the_client_closes() -> None:
    handler, _ = _serving(_html(""))

    previews = _previews(handler)
    await previews.aclose()

    assert previews._client.is_closed
