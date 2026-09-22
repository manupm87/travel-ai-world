"""The photo stage (TRA-208): every located `sleep` document pictured or gone.

The client is the real `ApiClient` over an `httpx.MockTransport`, so the cache,
the redirect handling and the `--offline` path are exercised exactly as a build
exercises them. Every handler records its requests, which is how "the second run
makes no request" is asserted.
"""

import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

import httpx
import pytest
from city_corpus.config.cities import BUDAPEST
from city_corpus.http import ApiClient
from city_corpus.models import Category, CorpusDocument, Kind, Source
from city_corpus.sources import photos

TEXT = "A hotel of the city, described at length enough to pass validation."
GELLERT_IMAGE = "https://hotelgellert.hu/img/facade.jpg"


def _hotel(**overrides: Any) -> CorpusDocument:
    fields: dict[str, Any] = {
        "doc_id": "osm:way/1",
        "city": "budapest",
        "district": "Belváros",
        "category": Category.SLEEP,
        "kind": Kind.LISTING,
        "name": "Hotel Gellért",
        "text": TEXT,
        "heading_path": "Budapest › Belváros › Sleep",
        "lat": 47.4863,
        "lon": 19.0536,
        "source": Source.OPENSTREETMAP,
        "source_url": "https://www.openstreetmap.org/way/1",
        "license": "ODbL 1.0",
        "lang": "en",
    }
    return CorpusDocument.model_validate({**fields, **overrides})


def _json(**payload: Any) -> httpx.Response:
    return httpx.Response(200, json=payload)


def _search(*titles: str) -> httpx.Response:
    return _json(query={"search": [{"title": t} for t in titles]})


def _geosearch(*files: tuple[str, float]) -> httpx.Response:
    return _json(query={"geosearch": [{"title": t, "dist": d} for t, d in files]})


def _imageinfo(title: str, licence: str, author: str = "Jane") -> httpx.Response:
    return _json(
        query={
            "pages": [
                {
                    "title": title,
                    "imageinfo": [
                        {
                            "extmetadata": {
                                "LicenseShortName": {"value": licence},
                                "Artist": {"value": author},
                            }
                        }
                    ],
                }
            ]
        }
    )


def _html(body: str) -> httpx.Response:
    return httpx.Response(200, text=body, headers={"content-type": "text/html"})


def _image(
    length: str | None = "120000", content_type: str = "image/jpeg"
) -> httpx.Response:
    headers = {"content-type": content_type}
    if length is not None:
        headers["content-length"] = length
    return httpx.Response(200, headers=headers)


MISSING = _json(query={"search": []})
NO_FILES = _json(query={"geosearch": []})


class Recorder:
    """A transport that answers from a routing table and counts the calls."""

    def __init__(self, routes: dict[str, Callable[[httpx.Request], httpx.Response]]):
        self.routes = routes
        self.requests: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        for marker, answer in self.routes.items():
            if marker in str(request.url):
                return answer(request)
        return httpx.Response(404)

    @property
    def urls(self) -> list[str]:
        return [str(r.url) for r in self.requests]


def _client(recorder: Recorder, cache: Path, *, offline: bool = False) -> ApiClient:
    return ApiClient(
        cache,
        offline=offline,
        transport=httpx.MockTransport(recorder),
        sleep=lambda _: None,
    )


def _commons(*responses: httpx.Response) -> Callable[[httpx.Request], httpx.Response]:
    """Commons answers `search`, `geosearch` and `imageinfo` in that order."""

    def answer(request: httpx.Request) -> httpx.Response:
        action = request.url.params.get("list") or request.url.params.get("prop")
        index = {"search": 0, "geosearch": 1, "imageinfo": 2}[str(action)]
        return responses[index]

    return answer


# ─── 1. Commons ──────────────────────────────────────────────────────────────


def test_a_file_named_after_the_hotel_wins(tmp_path: Path) -> None:
    recorder = Recorder(
        {
            "commons.wikimedia.org": _commons(
                _search("File:Gellért Hotel front.jpg"),
                NO_FILES,
                _imageinfo("File:Gellért Hotel front.jpg", "CC BY-SA 4.0"),
            )
        }
    )
    with _client(recorder, tmp_path) as client:
        kept, stats = photos.resolve(client, BUDAPEST, [_hotel()])

    [document] = kept
    assert "Special:FilePath/Gell" in (document.image_url or "")
    assert document.image_license == "CC BY-SA 4.0"
    assert document.image_author == "Jane"
    assert document.image_credit is None  # the Commons line is derived from these
    assert (stats.commons, stats.dropped) == (1, 0)


def test_a_file_photographed_at_the_hotel_wins_when_none_is_named(
    tmp_path: Path,
) -> None:
    recorder = Recorder(
        {
            "commons.wikimedia.org": _commons(
                MISSING,
                _geosearch(("File:Szent Gellért tér 1.jpg", 12.0)),
                _imageinfo("File:Szent Gellért tér 1.jpg", "CC BY 4.0"),
            )
        }
    )
    with _client(recorder, tmp_path) as client:
        kept, stats = photos.resolve(client, BUDAPEST, [_hotel()])

    assert "Szent" in (kept[0].image_url or "")
    assert stats.commons == 1


def test_a_far_away_file_is_not_the_hotel(tmp_path: Path) -> None:
    recorder = Recorder(
        {
            "commons.wikimedia.org": _commons(
                MISSING, _geosearch(("File:A street.jpg", 55.0)), MISSING
            )
        }
    )
    with _client(recorder, tmp_path) as client:
        kept, stats = photos.resolve(client, BUDAPEST, [_hotel(url=None)])

    assert kept == [] and stats.dropped == 1


def test_a_non_free_commons_file_is_skipped_and_the_site_is_tried(
    tmp_path: Path,
) -> None:
    recorder = Recorder(
        {
            "commons.wikimedia.org": _commons(
                _search("File:Gellért lobby.jpg"),
                NO_FILES,
                _imageinfo("File:Gellért lobby.jpg", "CC BY-NC 2.0"),
            ),
            "hotelgellert.hu/img": lambda _: _image(),
            "hotelgellert.hu": lambda _: _html(
                f'<head><meta property="og:image" content="{GELLERT_IMAGE}"></head>'
            ),
        }
    )
    with _client(recorder, tmp_path) as client:
        kept, stats = photos.resolve(
            client, BUDAPEST, [_hotel(url="https://hotelgellert.hu/")]
        )

    assert kept[0].image_url == GELLERT_IMAGE
    assert kept[0].image_credit == "hotelgellert.hu"
    assert kept[0].image_license is None
    assert (stats.commons, stats.site) == (0, 1)


# ─── 2. The hotel's own site ─────────────────────────────────────────────────


def _no_commons() -> dict[str, Callable[[httpx.Request], httpx.Response]]:
    return {"commons.wikimedia.org": _commons(MISSING, NO_FILES, MISSING)}


def test_the_site_preview_is_credited_with_its_domain(tmp_path: Path) -> None:
    recorder = Recorder(
        {
            **_no_commons(),
            "hotelgellert.hu/img": lambda _: _image(),
            "hotelgellert.hu": lambda _: _html(
                '<head><meta name="twitter:image" content="/img/facade.jpg">'
                f'<meta property="og:image" content="{GELLERT_IMAGE}"></head>'
            ),
        }
    )
    with _client(recorder, tmp_path) as client:
        kept, stats = photos.resolve(
            client, BUDAPEST, [_hotel(url="https://www.hotelgellert.hu/")]
        )

    # `og:image` outranks `twitter:image`, and the credit drops the `www.`.
    assert kept[0].image_url == GELLERT_IMAGE
    assert kept[0].image_credit == "hotelgellert.hu"
    assert stats.site == 1


def test_a_parked_domain_that_redirects_off_site_is_refused(tmp_path: Path) -> None:
    def moved(request: httpx.Request) -> httpx.Response:
        return httpx.Response(302, headers={"location": "https://parking.example/ad"})

    recorder = Recorder(
        {
            **_no_commons(),
            "hotelgellert.hu": moved,
            "parking.example": lambda _: _html(
                '<head><meta property="og:image" content="https://parking.example/a.jpg">'
                "</head>"
            ),
        }
    )
    with _client(recorder, tmp_path) as client:
        kept, stats = photos.resolve(
            client, BUDAPEST, [_hotel(url="https://hotelgellert.hu/")]
        )

    assert kept == [] and stats.dropped == 1
    assert not any("parking.example" in url for url in recorder.urls)


@pytest.mark.parametrize(
    ("candidate", "head"),
    [
        ("https://hotelgellert.hu/img/logo.png", _image()),  # a logo by its name
        (
            "https://hotelgellert.hu/img/facade.svg",
            _image(content_type="image/svg+xml"),
        ),
        ("https://hotelgellert.hu/img/facade.jpg", _image(length="4000")),  # a badge
        ("https://hotelgellert.hu/img/facade.jpg", httpx.Response(404)),
    ],
)
def test_a_preview_that_is_not_a_photo_is_refused(
    tmp_path: Path, candidate: str, head: httpx.Response
) -> None:
    recorder = Recorder(
        {
            **_no_commons(),
            "hotelgellert.hu/img": lambda _: head,
            "hotelgellert.hu": lambda _: _html(
                f'<head><meta property="og:image" content="{candidate}"></head>'
            ),
        }
    )
    with _client(recorder, tmp_path) as client:
        kept, stats = photos.resolve(
            client, BUDAPEST, [_hotel(url="https://hotelgellert.hu/")]
        )

    assert kept == [] and stats.dropped == 1


def test_a_preview_whose_server_states_no_size_is_trusted(tmp_path: Path) -> None:
    recorder = Recorder(
        {
            **_no_commons(),
            "hotelgellert.hu/img": lambda _: _image(length=None),
            "hotelgellert.hu": lambda _: _html(
                f'<head><meta property="og:image" content="{GELLERT_IMAGE}"></head>'
            ),
        }
    )
    with _client(recorder, tmp_path) as client:
        kept, _ = photos.resolve(
            client, BUDAPEST, [_hotel(url="https://hotelgellert.hu/")]
        )

    assert kept[0].image_url == GELLERT_IMAGE


# ─── 3. The Facebook page ────────────────────────────────────────────────────


def test_the_facebook_page_pictures_a_hotel_whose_site_has_no_preview(
    tmp_path: Path,
) -> None:
    profile = "https://scontent.facebook.com/profile.jpg"
    recorder = Recorder(
        {
            **_no_commons(),
            "scontent.facebook.com": lambda _: _image(),
            "facebook.com/HotelGellert": lambda _: _html(
                f'<head><meta property="og:image" content="{profile}"></head>'
            ),
            "hotelgellert.hu": lambda _: _html("<head><title>Gellért</title></head>"),
        }
    )
    with _client(recorder, tmp_path) as client:
        kept, stats = photos.resolve(
            client,
            BUDAPEST,
            [
                _hotel(
                    url="https://hotelgellert.hu/",
                    facebook="https://www.facebook.com/HotelGellert",
                )
            ],
        )

    assert kept[0].image_url == profile
    assert kept[0].image_credit == "facebook.com"
    assert (stats.site, stats.facebook) == (0, 1)


# ─── 4. The largest picture on the homepage ──────────────────────────────────


HOMEPAGE = """<html><head><title>Gellért</title></head><body>
<img src="/img/logo.png" alt="logo">
<div style="background-image: url('/img/hero.jpg')"></div>
<img data-src="/img/room.jpg" srcset="/img/room-2x.jpg 2x">
<img src="/img/booking-badge.png">
</body></html>"""


def test_the_largest_picture_of_the_homepage_is_taken(tmp_path: Path) -> None:
    sizes = {"hero.jpg": "10000", "room.jpg": "500000"}

    def head(request: httpx.Request) -> httpx.Response:
        name = request.url.path.rsplit("/", 1)[-1]
        return _image(length=sizes.get(name, "0"))

    recorder = Recorder(
        {
            **_no_commons(),
            "hotelgellert.hu/img": head,
            "hotelgellert.hu": lambda _: _html(HOMEPAGE),
        }
    )
    with _client(recorder, tmp_path) as client:
        kept, stats = photos.resolve(
            client, BUDAPEST, [_hotel(url="https://hotelgellert.hu/")]
        )

    # The logo and the badge are never asked about; the hero is too small.
    assert kept[0].image_url == "https://hotelgellert.hu/img/room.jpg"
    assert kept[0].image_credit == "hotelgellert.hu"
    assert stats.page == 1
    asked = [u for u in recorder.urls if "/img/" in u]
    assert not any("logo" in u or "badge" in u for u in asked)


def test_a_homepage_picture_that_states_no_size_is_not_trusted(tmp_path: Path) -> None:
    recorder = Recorder(
        {
            **_no_commons(),
            "hotelgellert.hu/img": lambda _: _image(length=None),
            "hotelgellert.hu": lambda _: _html(HOMEPAGE),
        }
    )
    with _client(recorder, tmp_path) as client:
        kept, stats = photos.resolve(
            client, BUDAPEST, [_hotel(url="https://hotelgellert.hu/")]
        )

    assert kept == [] and stats.dropped == 1


def test_page_images_are_read_in_document_order() -> None:
    assert photos.page_images(HOMEPAGE) == [
        "/img/logo.png",
        "/img/hero.jpg",
        "/img/room.jpg",
        "/img/room-2x.jpg",
        "/img/booking-badge.png",
    ]


# ─── What the stage does not touch, and what it drops ────────────────────────


def test_pictured_and_unlocated_and_other_categories_are_left_alone(
    tmp_path: Path,
) -> None:
    documents = [
        _hotel(doc_id="osm:way/2", image_url="https://commons/already.jpg"),
        _hotel(doc_id="osm:way/3", lat=None, lon=None),  # city-wide sleep prose
        _hotel(doc_id="osm:way/4", category=Category.EAT, name="A restaurant"),
    ]
    recorder = Recorder({})
    with _client(recorder, tmp_path) as client:
        kept, stats = photos.resolve(client, BUDAPEST, documents)

    assert kept == documents
    assert recorder.requests == []
    assert stats.as_dict()["dropped"] == 0


def test_a_hotel_with_nothing_is_dropped_and_named(tmp_path: Path) -> None:
    recorder = Recorder(_no_commons())
    with _client(recorder, tmp_path) as client:
        kept, stats = photos.resolve(
            client,
            BUDAPEST,
            [_hotel(), _hotel(doc_id="osm:way/9", name="Hotel Astra", url=None)],
        )

    assert kept == []
    assert stats.as_dict() == {
        "commons": 0,
        "site": 0,
        "facebook": 0,
        "page": 0,
        "dropped": 2,
        "dropped_examples": ["Hotel Astra", "Hotel Gellért"],
    }


def test_a_dead_site_costs_the_hotel_its_place_not_the_build(tmp_path: Path) -> None:
    def refuse(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("name or service not known")

    recorder = Recorder({**_no_commons(), "hotelgellert.hu": refuse})
    with _client(recorder, tmp_path) as client:
        kept, stats = photos.resolve(
            client, BUDAPEST, [_hotel(url="https://hotelgellert.hu/")]
        )

    assert kept == [] and stats.dropped == 1


# ─── The cache and `--offline` ───────────────────────────────────────────────


def test_a_second_run_is_identical_and_makes_no_request(tmp_path: Path) -> None:
    routes = {
        **_no_commons(),
        "hotelgellert.hu/img": lambda _: _image(),
        "hotelgellert.hu": lambda _: _html(
            f'<head><meta property="og:image" content="{GELLERT_IMAGE}"></head>'
        ),
    }
    hotels = [_hotel(url="https://hotelgellert.hu/"), _hotel(doc_id="osm:way/9")]

    first_recorder = Recorder(routes)
    with _client(first_recorder, tmp_path) as client:
        first, first_stats = photos.resolve(client, BUDAPEST, hotels)
    assert first_recorder.requests

    offline_recorder = Recorder(routes)
    with _client(offline_recorder, tmp_path, offline=True) as client:
        second, second_stats = photos.resolve(client, BUDAPEST, hotels)

    assert first == second
    assert first_stats.as_dict() == second_stats.as_dict()
    assert offline_recorder.requests == []
    # Misses are cached too: the dead lookups of the second hotel cost nothing.
    assert json.loads(next(tmp_path.glob("sites/*/*.json")).read_text())["response"]
