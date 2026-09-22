"""The photo stage (TRA-208): every located `sleep` document pictured or gone.

The client is the real `ApiClient` over an `httpx.MockTransport`, so the cache,
the redirect handling and the `--offline` path are exercised exactly as a build
exercises them. Every handler records its requests, which is how "the second run
makes no request" is asserted.
"""

import datetime as dt
import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

import httpx
import pytest
from city_corpus.config.cities import BUDAPEST
from city_corpus.http import ApiClient
from city_corpus.models import Category, CorpusDocument, Kind, Source
from city_corpus.sources import curated_hotels, photos, wikidata

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
        "lat": HOTEL_LAT,
        "lon": HOTEL_LON,
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


# The hotel of `_hotel()`, and three places a file could have been taken.
HOTEL_LAT, HOTEL_LON = 47.4863, 19.0536
AT_THE_HOTEL = (47.4874, 19.0536)  # 120 m north
ANOTHER_TOWN = (49.2863, 19.0536)  # 200 km north


def _imageinfo(
    title: str,
    licence: str,
    author: str = "Jane",
    where: tuple[float, float] | None = AT_THE_HOTEL,
) -> httpx.Response:
    """One answer for `prop=imageinfo|coordinates`: what the file is and,
    unless `where` is None, where Commons says it was photographed."""
    page: dict[str, Any] = {
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
    if where is not None:
        page["coordinates"] = [{"lat": where[0], "lon": where[1], "primary": ""}]
    return _json(query={"pages": [page]})


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
    """Commons answers `search` and then `imageinfo|coordinates`, which is the
    whole conversation: two calls per hotel, and nothing else is asked."""

    def answer(request: httpx.Request) -> httpx.Response:
        params = request.url.params
        asked = str(params.get("list") or params.get("prop"))
        return responses[0 if asked == "search" else 1]

    return answer


# ─── 1. The hotel's own site ─────────────────────────────────────────────────


def _no_wikimedia() -> dict[str, Callable[[httpx.Request], httpx.Response]]:
    """Neither Commons nor Wikidata knows this hotel — the usual case, and never
    the reason a hotel keeps its place: the site is asked first."""
    return {
        "commons.wikimedia.org": _commons(MISSING, MISSING),
        "wikidata.org": lambda _: _json(search=[], entities={}),
    }


def test_the_site_preview_is_credited_with_its_domain(tmp_path: Path) -> None:
    recorder = Recorder(
        {
            **_no_wikimedia(),
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
            **_no_wikimedia(),
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
            **_no_wikimedia(),
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
            **_no_wikimedia(),
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


# ─── 2. The Facebook page ────────────────────────────────────────────────────


def test_the_facebook_page_pictures_a_hotel_whose_site_has_no_preview(
    tmp_path: Path,
) -> None:
    profile = "https://scontent.facebook.com/profile.jpg"
    recorder = Recorder(
        {
            **_no_wikimedia(),
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


# ─── 3. Wikimedia Commons, by name only ──────────────────────────────────────


def test_a_file_named_after_the_hotel_wins(tmp_path: Path) -> None:
    recorder = Recorder(
        {
            "commons.wikimedia.org": _commons(
                _search("File:Gellért Hotel front.jpg"),
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


def test_commons_is_searched_by_name_only(tmp_path: Path) -> None:
    """A photo taken at the hotel's corner is the street, not the hotel: only
    a file whose title carries the name counts, and `geosearch` is never asked.
    """
    recorder = Recorder(
        {"commons.wikimedia.org": _commons(_search("File:Szabadság híd.jpg"), MISSING)}
    )
    with _client(recorder, tmp_path) as client:
        kept, stats = photos.resolve(client, BUDAPEST, [_hotel(url=None)])

    assert kept == [] and stats.dropped == 1
    assert stats.commons == 0
    assert not any("geosearch" in url for url in recorder.urls)


def test_the_hotels_own_site_beats_commons(tmp_path: Path) -> None:
    """The hotel's own picture of itself is the one a traveller wants, so a
    named Commons file is not even looked for while the site answers."""
    recorder = Recorder(
        {
            "commons.wikimedia.org": _commons(
                _search("File:Gellért Hotel front.jpg"),
                _imageinfo("File:Gellért Hotel front.jpg", "CC BY-SA 4.0"),
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
    assert (stats.site, stats.commons) == (1, 0)
    assert not any("commons.wikimedia.org" in url for url in recorder.urls)


def test_a_file_of_the_same_name_in_another_town_is_refused(tmp_path: Path) -> None:
    """`Park Hotel, Cortina` is a hotel of that name in the Dolomites and
    `Austria Classic Hotel Wien` one in Vienna; both answered a search for a
    hotel elsewhere. A title says which hotel, never which town's."""
    recorder = Recorder(
        {
            "commons.wikimedia.org": _commons(
                _search("File:Gellért Hotel front.jpg"),
                _imageinfo(
                    "File:Gellért Hotel front.jpg", "CC BY-SA 4.0", where=ANOTHER_TOWN
                ),
            )
        }
    )
    with _client(recorder, tmp_path) as client:
        kept, stats = photos.resolve(client, BUDAPEST, [_hotel(url=None)])

    assert kept == [] and stats.dropped == 1
    assert stats.commons == 0


def test_a_file_that_does_not_say_where_it_was_taken_is_refused(
    tmp_path: Path,
) -> None:
    """The tier is worth having only while it is right: a name is not a place."""
    recorder = Recorder(
        {
            "commons.wikimedia.org": _commons(
                _search("File:Gellért Hotel front.jpg"),
                _imageinfo("File:Gellért Hotel front.jpg", "CC BY-SA 4.0", where=None),
            )
        }
    )
    with _client(recorder, tmp_path) as client:
        kept, stats = photos.resolve(client, BUDAPEST, [_hotel(url=None)])

    assert kept == [] and stats.dropped == 1
    assert stats.commons == 0


def test_the_location_check_costs_no_extra_request(tmp_path: Path) -> None:
    """`coordinates` rides along with `imageinfo`: still two calls a hotel."""
    recorder = Recorder(
        {
            "commons.wikimedia.org": _commons(
                _search("File:Gellért Hotel front.jpg"),
                _imageinfo("File:Gellért Hotel front.jpg", "CC BY-SA 4.0"),
            )
        }
    )
    with _client(recorder, tmp_path) as client:
        kept, stats = photos.resolve(client, BUDAPEST, [_hotel(url=None)])

    assert len(kept) == 1 and stats.commons == 1
    asked = [
        r.url.params.get("list") or r.url.params.get("prop") for r in recorder.requests
    ]
    assert asked == ["search", "imageinfo|coordinates"]


def test_metres_between_two_points() -> None:
    assert photos.haversine_m(*AT_THE_HOTEL, HOTEL_LAT, HOTEL_LON) == pytest.approx(
        122, abs=5
    )
    assert photos.haversine_m(*ANOTHER_TOWN, HOTEL_LAT, HOTEL_LON) > 190_000


def test_a_non_free_commons_file_is_not_used(tmp_path: Path) -> None:
    recorder = Recorder(
        {
            "commons.wikimedia.org": _commons(
                _search("File:Gellért lobby.jpg"),
                _imageinfo("File:Gellért lobby.jpg", "CC BY-NC 2.0"),
            )
        }
    )
    with _client(recorder, tmp_path) as client:
        kept, stats = photos.resolve(client, BUDAPEST, [_hotel(url=None)])

    assert kept == [] and stats.dropped == 1
    assert stats.commons == 0


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
            **_no_wikimedia(),
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
            **_no_wikimedia(),
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
    recorder = Recorder(_no_wikimedia())
    with _client(recorder, tmp_path) as client:
        kept, stats = photos.resolve(
            client,
            BUDAPEST,
            [_hotel(), _hotel(doc_id="osm:way/9", name="Hotel Astra", url=None)],
        )

    assert kept == []
    assert stats.as_dict() == {
        "curated": 0,
        "site": 0,
        "facebook": 0,
        "commons": 0,
        "wikidata": 0,
        "page": 0,
        "dropped": 2,
        "shared": 0,
        "dropped_examples": ["Hotel Astra", "Hotel Gellért"],
        "notable_without_photo": [],
    }


def test_a_dead_site_costs_the_hotel_its_place_not_the_build(tmp_path: Path) -> None:
    def refuse(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("name or service not known")

    recorder = Recorder({**_no_wikimedia(), "hotelgellert.hu": refuse})
    with _client(recorder, tmp_path) as client:
        kept, stats = photos.resolve(
            client, BUDAPEST, [_hotel(url="https://hotelgellert.hu/")]
        )

    assert kept == [] and stats.dropped == 1


# ─── The cache and `--offline` ───────────────────────────────────────────────


def test_a_second_run_is_identical_and_makes_no_request(tmp_path: Path) -> None:
    routes = {
        **_no_wikimedia(),
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


# ─── Reading a file title as the hotel's name (TRA-208 review) ───────────────


def _files(*titles: str) -> list[dict[str, Any]]:
    return [{"title": t} for t in titles]


@pytest.mark.parametrize(
    ("name", "title"),
    [
        # A person, a ship, a flower, a footballer, a memorial stone and a
        # metro station, each of them the first thing Commons answers with.
        ("Timon", "File:5th Budapest Cup 2019 Timon Sternad Hiter.jpg"),
        (
            "Hotel Amadeus",
            "File:Amadeus (ship, 1997), Hotel Gellért, Liberty Bridge.jpg",
        ),
        ("Aster Budapest", "File:Aster amellus.jpg"),
        ("Kleist", "File:Stolperstein Weddigenweg 70 Marie von Kleist.jpg"),
        ("Hostal Casillas", "File:Casillas besando la Copa del Mundo.jpg"),
        ("Hotel Metro", "File:Deák Ferenc tér M1 metro station, 2024.jpg"),
        ("Night Hotel", "File:Over Night bridge at dawn.jpg"),
        ("Monarchy Residence", "File:Listed Baroque house. - 21 Országház Street.jpg"),
        # A comma is a full stop for this purpose: the street is named first
        # and the hotel second, so `Allee` is not written beside `Hotel`.
        (
            "Allee-Hotel Berlin",
            "File:Bundesarchiv Bild 183, Karl-Marx-Allee, Hotel Berolina.jpg",
        ),
        ("Cortina", "File:Park Hotel, Cortina.jpg"),
        # A postcard of the square the hotel took its name from, a century ago.
        ("Hotel Bellevue", "File:Potsdamer Platz 1930s Bellevue postcard.jpg"),
    ],
)
def test_a_title_that_merely_shares_a_word_is_not_the_hotel(
    name: str, title: str
) -> None:
    assert photos.choose_named(name, _files(title), city="Budapest") is None


@pytest.mark.parametrize(
    ("name", "title"),
    [
        # The whole name, in order, once both sides drop their lodging words.
        ("Ritz-Carlton", "File:The Ritz-Carlton, Budapest.jpg"),
        ("K+K Opera Hotel", "File:Bud VI. K+K Hotel Opera.JPG"),
        # Two distinctive words, both written in the title.
        (
            "Sofitel Budapest Chain Bridge",
            "File:Sofitel Budapest Chain Bridge. NE.JPG",
        ),
        ("Danubius Hotel Astoria", "File:Danubius Hotel Astoria (Budapest).jpg"),
        # One distinctive word, written beside a word for a place to sleep.
        ("Carlton Hotel", "File:Carlton Hotel Budapest, 2017.jpg"),
        ("Baltazár", "File:Hotel Baltazar Budapest, Orszaghaz Street.jpg"),
        ("Adina Apartment Hotel Budapest", "File:Adina Apartment Hotel. Entrance.JPG"),
        # Written together inside one phrase of a title that names three things.
        (
            "Gat Point Charlie",
            "File:Berlin, Mitte, Mauerstrasse 81-82, Hotel Gat Point Charlie.jpg",
        ),
    ],
)
def test_a_title_that_names_the_hotel_is_taken(name: str, title: str) -> None:
    assert photos.choose_named(name, _files(title), city="Budapest") == title


def test_a_name_of_nothing_but_generic_words_matches_nothing() -> None:
    """`Central Park Hotel` says what every third hotel says."""
    assert (
        photos.choose_named(
            "Central Park Hotel",
            _files("File:Central Park, New York.jpg"),
            city="Budapest",
        )
        is None
    )


def test_the_twin_in_ai_api_is_kept_word_for_word() -> None:
    """`ai_api/infrastructure/commons_photos.py` holds the same block; the tool
    may not import a service, so this is how the copies are checked."""
    header = "# ─── Reading a Commons file title as a venue's name"
    twin = (
        Path(photos.__file__).parents[4]
        / "services/ai_api/ai_api/infrastructure/commons_photos.py"
    )
    if not twin.exists():  # the tool alone, without the services tree
        pytest.skip("ai_api is not checked out beside the tool")
    tool = Path(photos.__file__).read_text(encoding="utf-8")
    service = twin.read_text(encoding="utf-8")

    def block(text: str) -> str:
        start = text.index(header)
        return text[
            start : text.index("\n\n\n", text.index("def choose_named(", start))
        ]

    assert block(tool) == block(service)


# ─── A picture two hotels claim is neither one's ─────────────────────────────


def test_a_picture_two_hotels_share_is_taken_from_both(tmp_path: Path) -> None:
    """A chain runs one site for every house and serves them all the same hero
    shot; the traveller would be offered the same room three times."""
    chain = "https://chainhotels.example/img/hero.jpg"
    recorder = Recorder(
        {
            **_no_wikimedia(),
            "chainhotels.example/img": lambda _: _image(),
            "chainhotels.example": lambda _: _html(
                f'<head><meta property="og:image" content="{chain}"></head>'
            ),
            "hotelgellert.hu/img": lambda _: _image(),
            "hotelgellert.hu": lambda _: _html(
                f'<head><meta property="og:image" content="{GELLERT_IMAGE}"></head>'
            ),
        }
    )
    hotels = [
        _hotel(
            doc_id="osm:way/1", name="Chain One", url="https://chainhotels.example/hbf"
        ),
        _hotel(
            doc_id="osm:way/2",
            name="Chain Two",
            url="https://chainhotels.example/mitte",
        ),
        _hotel(doc_id="osm:way/3", url="https://hotelgellert.hu/"),
    ]
    with _client(recorder, tmp_path) as client:
        kept, stats = photos.resolve(client, BUDAPEST, hotels)

    assert [d.doc_id for d in kept] == ["osm:way/3"]
    assert (stats.site, stats.shared, stats.dropped) == (1, 2, 2)
    assert sorted(stats.dropped_names) == ["Chain One", "Chain Two"]


def test_two_hotels_with_their_own_pictures_keep_them(tmp_path: Path) -> None:
    recorder = Recorder(
        {
            **_no_wikimedia(),
            "hotelgellert.hu/img": lambda _: _image(),
            "hotelgellert.hu": lambda _: _html(
                f'<head><meta property="og:image" content="{GELLERT_IMAGE}"></head>'
            ),
            "astra.hu/img": lambda _: _image(),
            "astra.hu": lambda _: _html(
                '<head><meta property="og:image" content="https://astra.hu/img/a.jpg">'
                "</head>"
            ),
        }
    )
    hotels = [
        _hotel(url="https://hotelgellert.hu/"),
        _hotel(doc_id="osm:way/9", name="Hotel Astra", url="https://astra.hu/"),
    ]
    with _client(recorder, tmp_path) as client:
        kept, stats = photos.resolve(client, BUDAPEST, hotels)

    assert len(kept) == 2
    assert (stats.site, stats.shared, stats.dropped) == (2, 0, 0)


# ─── Chain hotels are not left out (TRA-211) ─────────────────────────────────


def _curated(**overrides: Any) -> curated_hotels.CuratedHotel:
    fields: dict[str, Any] = {
        "match": "Hotel Gellért",
        "image_url": "https://marriott.com/photos/gellert-facade.jpg",
        "credit": "marriott.com",
        "source_url": "https://marriott.com/hotels/budapest",
        "checked": dt.date(2026, 9, 22),
    }
    return curated_hotels.CuratedHotel.model_validate({**fields, **overrides})


def _wikidata_api(
    *, search: tuple[str, ...] = (), entities: dict[str, Any] | None = None
) -> Callable[[httpx.Request], httpx.Response]:
    """Wikidata answers `wbsearchentities`, then `wbgetentities`."""

    def answer(request: httpx.Request) -> httpx.Response:
        if str(request.url.params.get("action")) == "wbsearchentities":
            return _json(search=[{"id": qid} for qid in search])
        return _json(entities=entities or {})

    return answer


def _commons_api(
    handlers: dict[str, Callable[[httpx.Request], httpx.Response]],
) -> Callable[[httpx.Request], httpx.Response]:
    """Commons answers by what was asked: `search`, `categorymembers`,
    `imageinfo` (a licence) or `imageinfo|coordinates` (a licence and a place)."""

    def answer(request: httpx.Request) -> httpx.Response:
        params = request.url.params
        asked = str(params.get("list") or params.get("prop") or "")
        handler = handlers.get(asked)
        return handler(request) if handler else _json(query={})

    return answer


def _entity(
    qid: str,
    where: tuple[float, float],
    *,
    image: str | None = None,
    category: str | None = None,
    sitelinks: dict[str, str] | None = None,
) -> dict[str, Any]:
    def claim(value: Any) -> list[dict[str, Any]]:
        return [{"mainsnak": {"datavalue": {"value": value}}}]

    claims: dict[str, Any] = {
        "P625": claim({"latitude": where[0], "longitude": where[1]})
    }
    if image:
        claims["P18"] = claim(image)
    if category:
        claims["P373"] = claim(category)
    return {
        "id": qid,
        "claims": claims,
        "sitelinks": {
            site: {"title": title} for site, title in (sitelinks or {}).items()
        },
    }


def _thumbnail(filename: str) -> str:
    return wikidata.thumbnail_url(filename)


# ── The same hotel twice may share its picture ───────────────────────────────


def _two_documents_of(
    image: str, first: dict[str, Any], second: dict[str, Any]
) -> tuple[Recorder, list[CorpusDocument]]:
    recorder = Recorder(
        {
            **_no_wikimedia(),
            "hotelgellert.hu/img": lambda _: _image(),
            "hotelgellert.hu": lambda _: _html(
                f'<head><meta property="og:image" content="{image}"></head>'
            ),
        }
    )
    return recorder, [
        _hotel(url="https://hotelgellert.hu/", **first),
        _hotel(url="https://hotelgellert.hu/", **second),
    ]


@pytest.mark.parametrize(
    ("first", "second"),
    [
        # Wikidata says they are one building.
        (
            {"doc_id": "osm:way/1", "entity_id": "Q42", "name": "Gellért"},
            {
                "doc_id": "wv:en:Budapest#sleep:gellert",
                "entity_id": "Q42",
                "name": "Danubius Hotel Gellért",
            },
        ),
        # The names fold to the same string (an accent and a case apart).
        (
            {"doc_id": "osm:way/1", "name": "Hotel Gellért"},
            {"doc_id": "wv:en:Budapest#sleep:gellert", "name": "HOTEL GELLERT"},
        ),
        # Same doorstep, and one name is written inside the other.
        (
            {"doc_id": "osm:way/1", "name": "Gellért"},
            {
                "doc_id": "wv:en:Budapest#sleep:gellert",
                "name": "Danubius Gellért Budapest",
                "lat": HOTEL_LAT + 0.0002,
                "lon": HOTEL_LON,
            },
        ),
    ],
)
def test_one_hotel_listed_twice_keeps_its_picture(
    tmp_path: Path, first: dict[str, Any], second: dict[str, Any]
) -> None:
    """OpenStreetMap has the hotel and so does the Wikivoyage guide. The two
    documents agree on the hotel's own photograph, which is not a chain serving
    one hero shot to three houses (TRA-211)."""
    recorder, hotels = _two_documents_of(GELLERT_IMAGE, first, second)
    with _client(recorder, tmp_path) as client:
        kept, stats = photos.resolve(client, BUDAPEST, hotels)

    assert len(kept) == 2
    assert all(d.image_url == GELLERT_IMAGE for d in kept)
    assert (stats.site, stats.shared, stats.dropped) == (2, 0, 0)


def test_two_different_hotels_of_a_chain_still_lose_a_shared_picture(
    tmp_path: Path,
) -> None:
    """Different names, three hundred metres apart: two houses, one banner."""
    recorder, hotels = _two_documents_of(
        GELLERT_IMAGE,
        {"doc_id": "osm:way/1", "name": "ibis Budapest Centrum"},
        {
            "doc_id": "osm:way/2",
            "name": "ibis Budapest Citysouth",
            "lat": HOTEL_LAT + 0.003,
            "lon": HOTEL_LON,
        },
    )
    with _client(recorder, tmp_path) as client:
        kept, stats = photos.resolve(client, BUDAPEST, hotels)

    assert kept == []
    assert (stats.site, stats.shared, stats.dropped) == (0, 2, 2)
    # Both are chain hotels, so the report tells the curator where to look.
    assert stats.as_dict()["notable_without_photo"] == [
        {"name": "ibis Budapest Centrum", "reason": "shared picture"},
        {"name": "ibis Budapest Citysouth", "reason": "shared picture"},
    ]


def test_same_hotel_needs_a_name_on_both_sides() -> None:
    """A document with no name cannot be told from any other hotel."""
    named = _hotel(name="Hotel Gellért")
    assert not photos.same_hotel(named, _hotel(doc_id="osm:way/2", name=None))
    assert photos.one_hotel([named])


# ── A brand domain redirects to its group ────────────────────────────────────


def _accor(image: str) -> dict[str, Callable[[httpx.Request], httpx.Response]]:
    return {
        "all.accor.com/img": lambda _: _image(),
        "all.accor.com": lambda _: _html(
            f'<head><meta property="og:image" content="{image}"></head>'
        ),
        "ibis.com": lambda _: httpx.Response(
            302, headers={"location": "https://all.accor.com/hotel/3560/index.shtml"}
        ),
    }


def test_a_redirect_into_the_hotels_own_group_is_followed(tmp_path: Path) -> None:
    """`ibis.com` → `all.accor.com` is where Accor keeps the hotel's page, and
    the photograph on it is the hotel's (TRA-211)."""
    image = "https://all.accor.com/img/facade.jpg"
    recorder = Recorder({**_no_wikimedia(), **_accor(image)})
    with _client(recorder, tmp_path) as client:
        kept, stats = photos.resolve(
            client,
            BUDAPEST,
            [_hotel(name="ibis Budapest Centrum", url="https://ibis.com/budapest")],
        )

    assert kept[0].image_url == image
    assert kept[0].image_credit == "all.accor.com"
    assert stats.site == 1


def test_a_redirect_to_a_domain_outside_the_groups_is_still_refused(
    tmp_path: Path,
) -> None:
    recorder = Recorder(
        {
            **_no_wikimedia(),
            "ibis.com": lambda _: httpx.Response(
                302, headers={"location": "https://parking.example/ad"}
            ),
            "parking.example": lambda _: _html(
                '<head><meta property="og:image" content="https://parking.example/a.jpg">'
                "</head>"
            ),
        }
    )
    with _client(recorder, tmp_path) as client:
        kept, stats = photos.resolve(
            client,
            BUDAPEST,
            [_hotel(name="ibis Budapest Centrum", url="https://ibis.com/budapest")],
        )

    assert kept == [] and stats.dropped == 1
    assert not any("parking.example" in url for url in recorder.urls)


def test_a_groups_brand_asset_is_not_the_hotel(tmp_path: Path) -> None:
    """NH publishes its own banner as the preview of every hotel's page."""
    recorder = Recorder(
        {
            **_no_wikimedia(),
            "nh-hotels.com/img": lambda _: _image(),
            "nh-hotels.com": lambda _: _html(
                '<head><meta property="og:image" '
                'content="https://nh-hotels.com/img/brand-campaign.jpg"></head>'
            ),
        }
    )
    with _client(recorder, tmp_path) as client:
        kept, stats = photos.resolve(
            client,
            BUDAPEST,
            [
                _hotel(
                    name="NH Collection Budapest", url="https://nh-hotels.com/hotel/1"
                )
            ],
        )

    assert kept == []
    assert (stats.site, stats.dropped) == (0, 1)
    assert stats.as_dict()["notable_without_photo"] == [
        {"name": "NH Collection Budapest", "reason": "no picture"}
    ]


def test_a_campaign_banner_falls_to_the_largest_picture_of_the_page(
    tmp_path: Path,
) -> None:
    """IHG offers a Maldives resort as the `og:image` of a Madrid hotel. The
    path says so, and the house's own photograph is further down the page —
    which is why the whole group's preview is read rather than skipped: for the
    Crowne Plaza Budapest the same site publishes the right picture."""
    facade = "https://ihg.com/media/crowne-plaza-facade.jpg"
    recorder = Recorder(
        {
            **_no_wikimedia(),
            "ihg.com/media": lambda _: _image(),
            "ihg.com": lambda _: _html(
                '<head><meta property="og:image" '
                'content="https://ihg.com/img/maldives-hero.jpg"></head>'
                f'<body><img src="{facade}"></body>'
            ),
        }
    )
    with _client(recorder, tmp_path) as client:
        kept, stats = photos.resolve(
            client,
            BUDAPEST,
            [_hotel(name="Crowne Plaza", url="https://ihg.com/crowneplaza/1")],
        )

    assert kept[0].image_url == facade
    assert (stats.site, stats.page) == (0, 1)


def test_a_group_that_publishes_the_right_picture_keeps_it(tmp_path: Path) -> None:
    """The same group, a page whose preview is the hotel: nothing is skipped."""
    facade = "https://digital.ihg.com/is/image/ihg/crowne-plaza-budapest.jpg"
    recorder = Recorder(
        {
            **_no_wikimedia(),
            "digital.ihg.com": lambda _: _image(),
            "ihg.com/crowneplaza": lambda _: _html(
                f'<head><meta property="og:image" content="{facade}"></head>'
            ),
        }
    )
    with _client(recorder, tmp_path) as client:
        kept, stats = photos.resolve(
            client,
            BUDAPEST,
            [_hotel(name="Crowne Plaza", url="https://ihg.com/crowneplaza/budapest")],
        )

    assert kept[0].image_url == facade
    assert stats.site == 1


def test_each_house_of_a_banner_group_gets_its_own_gallery_picture(
    tmp_path: Path,
) -> None:
    """a&o publishes the lobby of its Venice hostel as the preview of every house
    it runs, and a gallery per property below it. Skipping the preview turns one
    picture claimed by five hostels into five pictures of five hostels."""
    venice = "https://cdn.aohostels.com/img/socialMediaTags/AOVeneziaLobby.jpg"

    def house(slug: str) -> Callable[[httpx.Request], httpx.Response]:
        return lambda _: _html(
            f'<head><meta property="og:image" content="{venice}"></head>'
            f'<body><img src="https://cdn.aohostels.com/img/house/{slug}/1.jpg">'
            "</body>"
        )

    recorder = Recorder(
        {
            **_no_wikimedia(),
            "cdn.aohostels.com": lambda _: _image(),
            "aohostels.com/en/berlin/hauptbahnhof": house("hauptbahnhof"),
            "aohostels.com/en/berlin/mitte": house("mitte"),
        }
    )
    hotels = [
        _hotel(
            doc_id="osm:way/1",
            name="a&o Berlin Hauptbahnhof",
            url="https://www.aohostels.com/en/berlin/hauptbahnhof/",
        ),
        _hotel(
            doc_id="osm:way/2",
            name="a&o Berlin Mitte",
            url="https://www.aohostels.com/en/berlin/mitte/",
        ),
    ]
    with _client(recorder, tmp_path) as client:
        kept, stats = photos.resolve(client, BUDAPEST, hotels)

    assert [d.image_url for d in kept] == [
        "https://cdn.aohostels.com/img/house/hauptbahnhof/1.jpg",
        "https://cdn.aohostels.com/img/house/mitte/1.jpg",
    ]
    assert (stats.site, stats.page, stats.shared) == (0, 2, 0)


# ── Its Wikidata item, found by name near its coordinates ────────────────────


def _unpictured_hotel(**overrides: Any) -> CorpusDocument:
    """A hotel the site, Facebook, Commons and homepage tiers cannot picture."""
    return _hotel(name="Hilton Budapest", url=None, facebook=None, **overrides)


def test_an_item_found_by_name_at_the_hotel_pictures_it(tmp_path: Path) -> None:
    recorder = Recorder(
        {
            "wikidata.org": _wikidata_api(
                search=("Q42",),
                entities={"Q42": _entity("Q42", AT_THE_HOTEL, image="Hilton.jpg")},
            ),
            "commons.wikimedia.org": _commons_api(
                {
                    "search": lambda _: MISSING,
                    "imageinfo": lambda _: _imageinfo(
                        "File:Hilton.jpg", "CC BY-SA 4.0"
                    ),
                }
            ),
        }
    )
    with _client(recorder, tmp_path) as client:
        kept, stats = photos.resolve(client, BUDAPEST, [_unpictured_hotel()])

    assert kept[0].image_url == _thumbnail("Hilton.jpg")
    assert kept[0].image_license == "CC BY-SA 4.0"
    assert kept[0].image_author == "Jane"
    assert stats.wikidata == 1


def test_an_item_of_the_same_name_elsewhere_is_refused(tmp_path: Path) -> None:
    """There is a Hilton in every city; only the one here is this one."""
    far = (HOTEL_LAT + 0.05, HOTEL_LON)  # 5 km north
    recorder = Recorder(
        {
            "wikidata.org": _wikidata_api(
                search=("Q42",),
                entities={"Q42": _entity("Q42", far, image="Hilton.jpg")},
            ),
            "commons.wikimedia.org": _commons_api({"search": lambda _: MISSING}),
        }
    )
    with _client(recorder, tmp_path) as client:
        kept, stats = photos.resolve(client, BUDAPEST, [_unpictured_hotel()])

    assert kept == [] and stats.wikidata == 0


def test_a_non_free_item_picture_falls_through_to_the_commons_category(
    tmp_path: Path,
) -> None:
    """P18 first, then P373: the order the tier tries, and the licence decides."""
    recorder = Recorder(
        {
            "wikidata.org": _wikidata_api(
                search=("Q42",),
                entities={
                    "Q42": _entity(
                        "Q42",
                        AT_THE_HOTEL,
                        image="Hilton.jpg",
                        category="Hilton Budapest",
                    )
                },
            ),
            "commons.wikimedia.org": _commons_api(
                {
                    "search": lambda _: MISSING,
                    "imageinfo": lambda _: _imageinfo(
                        "File:Hilton.jpg", "CC BY-NC 2.0"
                    ),
                    "categorymembers": lambda _: _json(
                        query={
                            "categorymembers": [{"title": "File:Hilton at night.jpg"}]
                        }
                    ),
                    "imageinfo|coordinates": lambda _: _imageinfo(
                        "File:Hilton at night.jpg", "CC BY 4.0"
                    ),
                }
            ),
        }
    )
    with _client(recorder, tmp_path) as client:
        kept, stats = photos.resolve(client, BUDAPEST, [_unpictured_hotel()])

    assert kept[0].image_url == _thumbnail("Hilton at night.jpg")
    assert stats.wikidata == 1


def test_a_category_file_taken_elsewhere_is_refused(tmp_path: Path) -> None:
    recorder = Recorder(
        {
            "wikidata.org": _wikidata_api(
                search=("Q42",),
                entities={
                    "Q42": _entity("Q42", AT_THE_HOTEL, category="Hilton Budapest")
                },
            ),
            "commons.wikimedia.org": _commons_api(
                {
                    "search": lambda _: MISSING,
                    "categorymembers": lambda _: _json(
                        query={"categorymembers": [{"title": "File:Hilton logo.jpg"}]}
                    ),
                    "imageinfo|coordinates": lambda _: _imageinfo(
                        "File:Hilton logo.jpg", "CC BY 4.0", where=ANOTHER_TOWN
                    ),
                }
            ),
        }
    )
    with _client(recorder, tmp_path) as client:
        kept, stats = photos.resolve(client, BUDAPEST, [_unpictured_hotel()])

    assert kept == [] and stats.wikidata == 0


def test_the_articles_lead_picture_is_the_last_of_the_three(tmp_path: Path) -> None:
    """No P18, no P373: the item's Wikipedia article still has a picture."""
    recorder = Recorder(
        {
            "wikidata.org": _wikidata_api(
                search=("Q42",),
                entities={
                    "Q42": _entity(
                        "Q42", AT_THE_HOTEL, sitelinks={"enwiki": "Hilton Budapest"}
                    )
                },
            ),
            "en.wikipedia.org": lambda _: _json(
                query={"pages": [{"pageimage": "Hilton lead.jpg"}]}
            ),
            "commons.wikimedia.org": _commons_api(
                {
                    "search": lambda _: MISSING,
                    "imageinfo": lambda _: _imageinfo(
                        "File:Hilton lead.jpg", "CC BY-SA 4.0"
                    ),
                }
            ),
        }
    )
    with _client(recorder, tmp_path) as client:
        kept, stats = photos.resolve(client, BUDAPEST, [_unpictured_hotel()])

    assert kept[0].image_url == _thumbnail("Hilton lead.jpg")
    assert stats.wikidata == 1


def test_a_hotel_that_carries_a_wikidata_id_without_a_picture_uses_the_step(
    tmp_path: Path,
) -> None:
    """The enrichment stage found no free P18 on it; the item has a category."""
    recorder = Recorder(
        {
            "wikidata.org": _wikidata_api(
                entities={
                    "Q7777": _entity("Q7777", AT_THE_HOTEL, category="Hilton Budapest")
                },
            ),
            "commons.wikimedia.org": _commons_api(
                {
                    "search": lambda _: MISSING,
                    "categorymembers": lambda _: _json(
                        query={"categorymembers": [{"title": "File:Hilton day.jpg"}]}
                    ),
                    "imageinfo|coordinates": lambda _: _imageinfo(
                        "File:Hilton day.jpg", "CC BY 4.0"
                    ),
                }
            ),
        }
    )
    with _client(recorder, tmp_path) as client:
        kept, stats = photos.resolve(
            client, BUDAPEST, [_unpictured_hotel(wikidata="Q7777")]
        )

    assert kept[0].image_url == _thumbnail("Hilton day.jpg")
    assert stats.wikidata == 1
    # The id it already carries is asked about without being searched for.
    assert not any("wbsearchentities" in url for url in recorder.urls if "Q7777" in url)


# ── A curated entry, applied first ───────────────────────────────────────────


def _site_and_curated_image() -> dict[str, Callable[[httpx.Request], httpx.Response]]:
    return {
        **_no_wikimedia(),
        "marriott.com/photos": lambda _: _image(),
        "hotelgellert.hu/img": lambda _: _image(),
        "hotelgellert.hu": lambda _: _html(
            f'<head><meta property="og:image" content="{GELLERT_IMAGE}"></head>'
        ),
    }


def test_a_curated_entry_is_applied_before_every_other_source(tmp_path: Path) -> None:
    recorder = Recorder(_site_and_curated_image())
    with _client(recorder, tmp_path) as client:
        kept, stats = photos.resolve(
            client,
            BUDAPEST,
            [_hotel(url="https://hotelgellert.hu/")],
            [_curated()],
        )

    assert kept[0].image_url == "https://marriott.com/photos/gellert-facade.jpg"
    assert kept[0].image_credit == "marriott.com"
    assert (stats.curated, stats.site) == (1, 0)


def test_a_curated_photo_that_no_longer_answers_falls_through(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    routes = _site_and_curated_image()
    routes["marriott.com/photos"] = lambda _: httpx.Response(404)
    recorder = Recorder(routes)
    with caplog.at_level("WARNING"), _client(recorder, tmp_path) as client:
        kept, stats = photos.resolve(
            client,
            BUDAPEST,
            [_hotel(url="https://hotelgellert.hu/")],
            [_curated()],
        )

    assert kept[0].image_url == GELLERT_IMAGE
    assert (stats.curated, stats.site) == (0, 1)
    assert "no longer answers as a picture" in caplog.text


def test_a_curated_entry_matches_by_osm_id(tmp_path: Path) -> None:
    recorder = Recorder(_site_and_curated_image())
    entry = _curated(match="osm:node/4553094489")
    with _client(recorder, tmp_path) as client:
        kept, stats = photos.resolve(
            client,
            BUDAPEST,
            [_hotel(osm_id="node/4553094489", url="https://hotelgellert.hu/")],
            [entry],
        )

    assert kept[0].image_credit == "marriott.com"
    assert stats.curated == 1


@pytest.mark.parametrize(
    ("match", "expected"),
    [("Hotel Nowhere", "matches 0"), ("Hotel Gellért", "matches 2")],
)
def test_a_curated_entry_has_to_name_exactly_one_hotel(
    match: str, expected: str
) -> None:
    documents = [_hotel(doc_id="osm:way/1"), _hotel(doc_id="osm:way/2")]
    with pytest.raises(curated_hotels.HotelDataError) as error:
        photos.bind_curated([_curated(match=match)], documents)

    assert expected in str(error.value)


def test_a_curated_entry_for_a_pictured_hotel_is_a_warning(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    """Nothing to do, and the curator has to hear about it."""
    recorder = Recorder(_site_and_curated_image())
    pictured = _hotel(image_url="https://commons.example/gellert.jpg")
    with caplog.at_level("WARNING"), _client(recorder, tmp_path) as client:
        kept, stats = photos.resolve(client, BUDAPEST, [pictured], [_curated()])

    assert kept == [pictured] and stats.curated == 0
    assert "already pictured" in caplog.text


@pytest.mark.parametrize(
    ("url", "allowed"),
    [
        ("https://marriott.com/photos/a.jpg", True),
        # A curator may point at Commons on purpose; no automatic source can.
        (
            "https://commons.wikimedia.org/w/index.php?title=Special:FilePath/A.jpg",
            True,
        ),
        ("https://upload.wikimedia.org/wikipedia/commons/a/a1/A.jpg", True),
        ("http://169.254.169.254/latest/meta-data/", False),
        ("https://localhost/a.jpg", False),
        ("file:///etc/passwd", False),
        ("http://commons.wikimedia.org/a.jpg", False),  # https only for the exception
    ],
)
def test_where_a_curated_image_may_point(url: str, allowed: bool) -> None:
    assert photos.curated_image_allowed(url) is allowed


def test_a_curated_commons_file_is_fetched_although_the_site_rules_refuse_one(
    tmp_path: Path,
) -> None:
    """`DENIED_HOSTS` stops a hotel's `website` tag being an encyclopaedia page.
    It must not stop a curator handing the build a licence-clean photograph of a
    chain whose own site answers 403 to everything (TRA-211)."""
    image = (
        "https://commons.wikimedia.org/w/index.php"
        "?title=Special:FilePath/Adria_Palace.jpg&width=640"
    )
    recorder = Recorder({"FilePath": lambda _: _image(), **_no_wikimedia()})
    entry = _curated(image_url=image, credit="Fred (CC BY 2.0) · Wikimedia Commons")
    with _client(recorder, tmp_path) as client:
        kept, stats = photos.resolve(client, BUDAPEST, [_hotel(url=None)], [entry])

    assert kept[0].image_url == image
    assert kept[0].image_credit == "Fred (CC BY 2.0) · Wikimedia Commons"
    assert stats.curated == 1
