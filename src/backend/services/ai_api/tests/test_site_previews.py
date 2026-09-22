"""SitePreviews against a mocked HTTP transport: no network, no key."""

import logging

import httpx
import pytest
from ai_api.infrastructure.commons_photos import USER_AGENT
from ai_api.infrastructure.site_previews import (
    MAX_REDIRECTS,
    SitePreviews,
    registrable_domain,
)
from ai_api.testing import settings_for_tests

SITE = "https://restaurantesamm.com/"
IMAGE = "https://restaurantesamm.com/img/sala.jpg"
PICTURE_HEADERS = {"content-type": "image/jpeg", "content-length": "84213"}


def _html(head: str) -> str:
    return f"<!doctype html><html><head>{head}</head><body><p>Hola</p></body></html>"


def _serving(
    html: str,
    *,
    status: int = 200,
    content_type: str = "text/html; charset=utf-8",
    final_url: str | None = None,
    image_headers: dict[str, str] | None = None,
):
    """A handler answering this page, and the list of requests it saw."""
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if request.method == "HEAD":
            return httpx.Response(200, headers=image_headers or PICTURE_HEADERS)
        if final_url is not None and str(request.url) != final_url:
            return httpx.Response(301, headers={"location": final_url})
        return httpx.Response(status, text=html, headers={"content-type": content_type})

    return handler, seen


def _gets(seen: list[httpx.Request]) -> list[httpx.Request]:
    return [r for r in seen if r.method == "GET"]


def _previews(handler, **kwargs) -> SitePreviews:
    return SitePreviews(
        httpx.AsyncClient(
            transport=httpx.MockTransport(handler), follow_redirects=False
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
    assert len(_gets(seen)) == 1


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
    assert len(_gets(seen)) == 1


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


async def test_a_redirect_to_a_host_that_may_not_be_fetched_stops_there() -> None:
    """The refusal list applies to every hop, not only to the first URL."""
    handler, seen = _serving(
        _html(f'<meta property="og:image" content="{IMAGE}">'),
        final_url="http://127.0.0.1:8000/admin",
    )

    assert await _previews(handler).preview(SITE) is None
    assert [str(r.url) for r in seen] == [SITE]


async def test_more_hops_than_allowed_is_none() -> None:
    seen: list[httpx.Request] = []

    def bouncing(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        n = len(seen)
        return httpx.Response(302, headers={"location": f"{SITE}hop{n}/"})

    assert await _previews(bouncing).preview(SITE) is None
    assert len(seen) == MAX_REDIRECTS + 1


# ─── What is not a photo of the place (TRA-207) ──────────────────────────────


async def test_a_redirect_off_the_site_is_a_parked_or_moved_domain() -> None:
    """`acehostel.com` answers 301 to a domain broker whose page has an
    `og:image`: the venue is gone, and the broker's banner is not its photo."""
    handler, seen = _serving(
        _html('<meta property="og:image" content="https://cdn.broker.example/og.png">'),
        final_url="https://www.broker.example/domain/restaurantesamm.com",
    )

    assert await _previews(handler).preview(SITE) is None
    assert [str(r.url) for r in seen] == [SITE]


async def test_a_redirect_to_www_or_https_stays_on_the_site() -> None:
    handler, _ = _serving(
        _html(f'<meta property="og:image" content="{IMAGE}">'),
        final_url="https://www.restaurantesamm.com/en/",
    )

    photo = await _previews(handler).preview("http://restaurantesamm.com/")

    assert photo is not None and photo.url == IMAGE


@pytest.mark.parametrize(
    "headers",
    [
        {"content-type": "image/svg+xml", "content-length": "5472"},
        {"content-type": "text/html; charset=utf-8"},
        {"content-type": "image/png", "content-length": "9872"},
    ],
    ids=["svg logo", "an html page", "a 10 KB badge"],
)
async def test_an_image_that_is_not_a_picture_is_none(headers) -> None:
    handler, _ = _serving(
        _html(f'<meta property="og:image" content="{IMAGE}">'), image_headers=headers
    )

    assert await _previews(handler).preview(SITE) is None


@pytest.mark.parametrize(
    "path",
    [
        "/imgs/logo-desktop.svg",
        "/uploads/noun_leaf_icon.png",
        "/favicon-og.jpg",
        "/sprite.png",
    ],
)
async def test_a_file_named_like_a_logo_is_none_without_a_head(path) -> None:
    handler, seen = _serving(
        _html(f'<meta property="og:image" content="https://restaurantesamm.com{path}">')
    )

    assert await _previews(handler).preview(SITE) is None
    assert [r.method for r in seen] == ["GET"]


async def test_an_image_on_another_host_is_fine_when_the_page_is_the_sites() -> None:
    """Facebook pages, Accor, Wix: the page is the venue's, the picture is on a CDN."""
    cdn = "https://scontent.xx.fbcdn.net/v/t39/492152841_n.jpg"
    handler, _ = _serving(_html(f'<meta property="og:image" content="{cdn}">'))

    photo = await _previews(handler).preview("https://www.facebook.com/hazisarkany/")

    assert photo is not None and photo.url == cdn
    assert photo.credit == "facebook.com"


async def test_a_server_that_refuses_head_or_omits_the_length_is_trusted() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if request.method == "HEAD":
            return httpx.Response(405)
        return httpx.Response(
            200,
            text=_html(f'<meta property="og:image" content="{IMAGE}">'),
            headers={"content-type": "text/html"},
        )

    photo = await _previews(handler).preview(SITE)
    assert photo is not None and photo.url == IMAGE

    handler2, _ = _serving(
        _html(f'<meta property="og:image" content="{IMAGE}">'),
        image_headers={"content-type": "image/jpeg"},
    )
    assert await _previews(handler2).preview(SITE) is not None


async def test_a_head_that_fails_is_none_and_warns(caplog) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == "HEAD":
            raise httpx.ConnectError("boom")
        return httpx.Response(
            200,
            text=_html(f'<meta property="og:image" content="{IMAGE}">'),
            headers={"content-type": "text/html"},
        )

    with caplog.at_level(logging.WARNING):
        assert await _previews(handler).preview(SITE) is None
    assert "image check failed" in caplog.text


@pytest.mark.parametrize(
    ("host", "domain"),
    [
        ("www.restaurantesamm.com", "restaurantesamm.com"),
        ("all.accor.com", "accor.com"),
        ("www.hotel.co.uk", "hotel.co.uk"),
        ("shop.example.com.br", "example.com.br"),
        ("static.hugedomains.com", "hugedomains.com"),
        ("tf.hu", "tf.hu"),
    ],
)
def test_registrable_domain(host, domain) -> None:
    assert registrable_domain(host) == domain


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
    assert len(_gets(seen)) == 1


async def test_a_miss_is_cached_too() -> None:
    """A site without a preview must not be asked again for every card."""
    handler, seen = _serving(_html(""))
    previews = _previews(handler)

    assert await previews.preview(SITE) is None
    assert await previews.preview(SITE) is None
    assert len(_gets(seen)) == 1


async def test_an_entry_older_than_the_ttl_is_fetched_again() -> None:
    handler, seen = _serving(_html(f'<meta property="og:image" content="{IMAGE}">'))
    now = [1000.0]
    previews = _previews(handler, cache_seconds=60, clock=lambda: now[0])

    await previews.preview(SITE)
    now[0] += 59
    await previews.preview(SITE)
    assert len(_gets(seen)) == 1

    now[0] += 2
    await previews.preview(SITE)
    assert len(_gets(seen)) == 2


async def test_the_cache_never_grows_past_its_size() -> None:
    handler, seen = _serving(_html(f'<meta property="og:image" content="{IMAGE}">'))
    previews = _previews(handler, cache_size=2)

    for i in range(5):
        await previews.preview(f"https://samm{i}.example/")

    assert len(previews._cache) == 2
    # The oldest went first: the first site is asked again.
    await previews.preview("https://samm0.example/")
    assert len(_gets(seen)) == 6


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
