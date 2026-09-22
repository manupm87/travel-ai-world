"""CommonsPhotos against a mocked HTTP transport: no network, no key."""

import logging

import httpx
import pytest
from ai_api.domain.models import Photo
from ai_api.infrastructure.commons_photos import (
    RADIUS_M,
    USER_AGENT,
    CommonsPhotos,
    choose_file,
    choose_named,
    credit_line,
    file_url,
)
from ai_api.testing import settings_for_tests

API_URL = "https://commons.test/w/api.php"


def _photos(handler, **kwargs) -> CommonsPhotos:
    return CommonsPhotos(
        httpx.AsyncClient(transport=httpx.MockTransport(handler)),
        api_url=API_URL,
        **kwargs,
    )


def _geosearch_response(files: list[dict[str, object]]) -> httpx.Response:
    return httpx.Response(200, json={"query": {"geosearch": files}})


def _imageinfo_response(
    title: str, *, artist: str | None, licence: str | None
) -> httpx.Response:
    extmetadata: dict[str, object] = {}
    if artist is not None:
        extmetadata["Artist"] = {
            "value": f'<a href="//commons.wikimedia.org/wiki/User:{artist}">{artist}</a>'
        }
    if licence is not None:
        extmetadata["LicenseShortName"] = {"value": licence}
    return httpx.Response(
        200,
        json={
            "query": {
                "pages": {
                    "123": {
                        "title": title,
                        "imageinfo": [{"extmetadata": extmetadata}],
                    }
                }
            }
        },
    )


def _found(
    geosearch_files: list[dict[str, object]],
    *,
    artist: str | None = "Antissimo",
    licence: str | None = "CC BY-SA 3.0",
):
    """A handler that answers an empty name search, the geosearch, then
    imageinfo for the chosen file."""
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        params = request.url.params
        if params.get("list") == "search":
            return httpx.Response(200, json={"query": {"search": []}})
        if params.get("list") == "geosearch":
            return _geosearch_response(geosearch_files)
        title = params["titles"]
        return _imageinfo_response(title, artist=artist, licence=licence)

    return handler, seen


# ─── choose_file: pure selection logic ───────────────────────────────────────


class TestChooseFile:
    def test_a_title_naming_the_venue_wins_over_a_nearer_file(self) -> None:
        files = [
            {"title": "File:Andrássy út corner.jpg", "dist": 8.0},
            {"title": "File:Náncsi néni Restaurant.jpg", "dist": 45.0},
        ]
        assert choose_file("Náncsi néni Restaurant", files) == (
            "File:Náncsi néni Restaurant.jpg"
        )

    def test_without_a_name_match_nothing_wins(self) -> None:
        """However close it was taken, a file that does not name the venue is
        the street, the neighbours or a passing tram (TRA-208)."""
        files = [
            {"title": "File:Street view one.jpg", "dist": 2.0},
            {"title": "File:Street view two.jpg", "dist": 25.0},
            {"title": "File:Far away shot.jpg", "dist": 55.0},
        ]
        assert choose_file("Some Bistro", files) is None

    @pytest.mark.parametrize(
        "title",
        [
            "File:Commemorative plaque for the poet.jpg",
            "File:Bronze relief on the wall.jpg",
            "File:Byzantine mosaic detail.jpg",
            "File:Liturgical chasuble displayed.jpg",
            "File:Tourist map of the district.jpg",
        ],
    )
    def test_skip_word_titles_are_never_chosen(self, title: str) -> None:
        files = [{"title": title, "dist": 2.0}]
        assert choose_file("Anything", files) is None

    @pytest.mark.parametrize(
        "title",
        [
            "File:Site plan diagram.svg",
            "File:Menu scan document.pdf",
        ],
    )
    def test_non_image_extensions_are_never_chosen(self, title: str) -> None:
        files = [{"title": title, "dist": 2.0}]
        assert choose_file("Anything", files) is None

    def test_stop_words_in_the_name_do_not_count_as_a_match(self) -> None:
        """ "Bar" and "Restaurant" are stop words and the city names the town,
        not the venue: nothing is left to match, so the file at the door is
        not this bar's photo however close it was taken."""
        files = [{"title": "File:Building facade shot.jpg", "dist": 2.0}]
        assert choose_file("Budapest Bar Restaurant", files, city="Budapest") is None


# ─── file_url / credit_line: pure formatting ─────────────────────────────────


class TestFileUrl:
    def test_percent_encodes_the_filename(self) -> None:
        url = file_url("File:Náncsi néni Restaurant.jpg", 800)
        assert url == (
            "https://commons.wikimedia.org/wiki/Special:FilePath/"
            "N%C3%A1ncsi%20n%C3%A9ni%20Restaurant.jpg?width=800"
        )

    def test_a_custom_width_travels(self) -> None:
        assert file_url("File:Plain.jpg", 400).endswith("?width=400")


class TestCreditLine:
    def test_author_and_licence(self) -> None:
        assert credit_line("Antissimo", "CC BY-SA 3.0") == (
            "Antissimo (CC BY-SA 3.0) · Wikimedia Commons"
        )

    def test_author_only(self) -> None:
        assert credit_line("Antissimo", None) == "Antissimo · Wikimedia Commons"

    def test_licence_only(self) -> None:
        assert credit_line(None, "CC0") == "(CC0) · Wikimedia Commons"

    def test_neither_is_wikimedia_commons_alone(self) -> None:
        assert credit_line(None, None) == "Wikimedia Commons"


# ─── CommonsPhotos.find: the two-call happy path ─────────────────────────────


async def test_a_named_match_is_returned_with_its_credit() -> None:
    handler, seen = _found(
        [{"title": "File:Náncsi néni Restaurant.jpg", "dist": 12.0}],
        artist="Antissimo",
        licence="CC BY-SA 3.0",
    )

    photo = await _photos(handler).find(
        "Náncsi néni Restaurant", 47.5, 19.05, city="Budapest"
    )

    assert photo == Photo(
        url=(
            "https://commons.wikimedia.org/wiki/Special:FilePath/"
            "N%C3%A1ncsi%20n%C3%A9ni%20Restaurant.jpg?width=800"
        ),
        credit="Antissimo (CC BY-SA 3.0) · Wikimedia Commons",
    )
    assert [r.url.params.get("list") for r in seen] == ["search", "geosearch", None]


async def test_the_credit_strips_html_from_the_artist_field() -> None:
    handler, _ = _found(
        [{"title": "File:Courtyard view.jpg", "dist": 5.0}],
        artist="J. Doe",
        licence="CC BY-SA 4.0",
    )

    photo = await _photos(handler).find(
        "Courtyard Bistro", 47.5, 19.05, city="Budapest"
    )

    assert photo is not None
    assert photo.credit == "J. Doe (CC BY-SA 4.0) · Wikimedia Commons"
    assert "<a" not in photo.credit


async def test_no_author_or_licence_credits_wikimedia_commons_alone() -> None:
    handler, _ = _found(
        [{"title": "File:Courtyard view.jpg", "dist": 5.0}], artist=None, licence=None
    )

    photo = await _photos(handler).find(
        "Courtyard Bistro", 47.5, 19.05, city="Budapest"
    )

    assert photo is not None
    assert photo.credit == "Wikimedia Commons"


async def test_a_file_that_does_not_name_the_venue_is_none() -> None:
    handler, seen = _found([{"title": "File:A street corner.jpg", "dist": 5.0}])

    photo = await _photos(handler).find("Some Place", 47.5, 19.05, city="Budapest")

    assert photo is None
    assert [r.url.params.get("list") for r in seen] == ["geosearch"]


# ─── The geosearch request shape ─────────────────────────────────────────────


async def test_geosearch_request_carries_the_expected_params() -> None:
    handler, seen = _found([{"title": "File:Courtyard view.jpg", "dist": 5.0}])

    await _photos(handler).find("Some Place", 47.5071, 19.0458, city="Budapest")

    params = seen[0].url.params
    assert str(seen[0].url).startswith(f"{API_URL}?")
    assert params["action"] == "query"
    assert params["list"] == "geosearch"
    assert params["gscoord"] == "47.5071|19.0458"
    assert params["gsradius"] == str(RADIUS_M)
    assert params["gsnamespace"] == "6"
    assert params["format"] == "json"


def test_from_settings_sets_the_api_url_and_the_user_agent() -> None:
    photos = CommonsPhotos.from_settings(settings_for_tests())

    assert photos._api_url == settings_for_tests().COMMONS_API_URL
    assert photos._client.headers["user-agent"] == USER_AGENT
    assert photos._client.timeout.read == settings_for_tests().COMMONS_TIMEOUT


# ─── Failures answer None, never raise ───────────────────────────────────────


async def test_an_upstream_500_is_none_not_an_exception(caplog) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="upstream detail")

    with caplog.at_level(logging.WARNING):
        photo = await _photos(handler).find("Some Place", 47.5, 19.05, city="Budapest")

    assert photo is None
    assert "Commons photo lookup failed" in caplog.text


async def test_a_connection_error_is_none(caplog) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("no route to host", request=request)

    with caplog.at_level(logging.WARNING):
        photo = await _photos(handler).find("Some Place", 47.5, 19.05, city="Budapest")

    assert photo is None
    assert "Commons photo lookup failed" in caplog.text


async def test_malformed_json_is_none(caplog) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="<html>not json</html>")

    with caplog.at_level(logging.WARNING):
        photo = await _photos(handler).find("Some Place", 47.5, 19.05, city="Budapest")

    assert photo is None
    assert "Commons photo lookup failed" in caplog.text


async def test_the_client_closes() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return _geosearch_response([])

    photos = _photos(handler)
    await photos.aclose()
    assert photos._client.is_closed


# ─── Search by name first (TRA-162) ──────────────────────────────────────────


def _search_hits(*titles: str) -> dict:
    return {"query": {"search": [{"title": t} for t in titles]}}


def _by_list(handlers: dict[str, dict | int]) -> tuple[httpx.MockTransport, list[str]]:
    """Answers per `list=`/`prop=` parameter; an int answers that status."""
    seen: list[str] = []

    def handle(request: httpx.Request) -> httpx.Response:
        asked = request.url.params.get("list") or request.url.params.get("prop") or ""
        kind = asked.split("|")[0]  # `imageinfo|coordinates` is one answer
        seen.append(kind)
        answer = handlers.get(kind, 404)
        if isinstance(answer, int):
            return httpx.Response(answer, json={"error": "nope"})
        return httpx.Response(200, json=answer)

    return httpx.MockTransport(handle), seen


VENUE = (47.47, 19.05)
FAR_AWAY = (41.89, 12.49)  # Rome: the same name, another country


def _described(where: tuple[float, float] | None = VENUE) -> dict:
    """What `prop=imageinfo|coordinates` answers for one file."""
    page: dict = {
        "imageinfo": [
            {
                "extmetadata": {
                    "Artist": {"value": "Someone"},
                    "LicenseShortName": {"value": "CC BY 4.0"},
                }
            }
        ]
    }
    if where is not None:
        page["coordinates"] = [{"lat": where[0], "lon": where[1], "primary": ""}]
    return {"query": {"pages": {"1": page}}}


CREDIT = _described()


async def test_a_photo_named_after_the_venue_wins_without_a_geosearch():
    transport, seen = _by_list(
        {
            "search": _search_hits("File:Fruska bisztró sign, Lágymányos Bay Park.jpg"),
            "geosearch": {"query": {"geosearch": []}},
            "imageinfo": CREDIT,
        }
    )
    finder = CommonsPhotos(httpx.AsyncClient(transport=transport))

    photo = await finder.find("Fruska bisztró", 47.47, 19.05, city="Budapest")

    assert photo is not None and "Fruska%20bisztr" in photo.url
    assert photo.credit == "Someone (CC BY 4.0) · Wikimedia Commons"
    assert seen == ["search", "imageinfo"]


async def test_a_title_sharing_one_word_is_not_the_venue(caplog):
    """`Fruska bistro` is not `Fruska bisztró`: one word in common is what
    every ship, flower and footballer on Commons has (TRA-208)."""
    transport, seen = _by_list(
        {
            "search": _search_hits("File:Fruska bistro sign, Lágymányos Bay.jpg"),
            "geosearch": {"query": {"geosearch": []}},
        }
    )
    finder = CommonsPhotos(httpx.AsyncClient(transport=transport))

    assert await finder.find("Fruska bisztró", 47.47, 19.05, city="Budapest") is None
    assert seen == ["search", "geosearch"]


async def test_a_generic_word_in_a_search_result_is_not_a_match():
    transport, seen = _by_list(
        {
            "search": _search_hits(
                "File:Pflum building, Park street, Pesterzsébet.jpg"
            ),
            "geosearch": {"query": {"geosearch": []}},
        }
    )
    finder = CommonsPhotos(httpx.AsyncClient(transport=transport))

    photo = await finder.find("Stefánia Park Cafe", 47.43, 19.11, city="Budapest")

    assert photo is None
    assert seen == ["search", "geosearch"]


async def test_a_rate_limited_search_still_tries_the_geosearch(caplog):
    transport, seen = _by_list(
        {
            "search": 429,
            "geosearch": {
                "query": {"geosearch": [{"title": "File:Cortile front.jpg", "dist": 4}]}
            },
            "imageinfo": CREDIT,
        }
    )
    finder = CommonsPhotos(httpx.AsyncClient(transport=transport))

    photo = await finder.find("Cortile Hotel", 47.51, 19.06, city="Budapest")

    assert photo is not None and "Cortile%20front" in photo.url
    assert seen == ["search", "geosearch", "imageinfo"]
    assert "Commons name search failed" in caplog.text


async def test_a_file_named_after_the_venue_elsewhere_is_refused():
    """A title says which hotel, never which town's: `Park Hotel, Cortina` is
    in the Dolomites (TRA-208). The geosearch still gets its turn."""
    transport, seen = _by_list(
        {
            "search": _search_hits("File:Fruska bisztró, Roma.jpg"),
            "geosearch": {"query": {"geosearch": []}},
            "imageinfo": _described(FAR_AWAY),
        }
    )
    finder = CommonsPhotos(httpx.AsyncClient(transport=transport))

    photo = await finder.find("Fruska bisztró", 47.47, 19.05, city="Budapest")

    assert photo is None
    assert seen == ["search", "imageinfo", "geosearch"]


async def test_a_file_that_does_not_say_where_it_was_taken_is_refused():
    transport, _ = _by_list(
        {
            "search": _search_hits("File:Fruska bisztró sign.jpg"),
            "geosearch": {"query": {"geosearch": []}},
            "imageinfo": _described(None),
        }
    )
    finder = CommonsPhotos(httpx.AsyncClient(transport=transport))

    assert await finder.find("Fruska bisztró", 47.47, 19.05, city="Budapest") is None


async def test_a_file_found_by_geosearch_is_not_asked_where_it_was_taken():
    """It was chosen for being within 60 m of the venue (TRA-208)."""
    transport, seen = _by_list(
        {
            "search": {"query": {"search": []}},
            "geosearch": {
                "query": {"geosearch": [{"title": "File:Cortile front.jpg", "dist": 4}]}
            },
            "imageinfo": _described(None),
        }
    )
    finder = CommonsPhotos(httpx.AsyncClient(transport=transport))

    photo = await finder.find("Cortile Hotel", 47.51, 19.06, city="Budapest")

    assert photo is not None and "Cortile%20front" in photo.url
    assert seen == ["search", "geosearch", "imageinfo"]


def test_metres_between_two_points():
    from ai_api.infrastructure.commons_photos import haversine_m

    assert haversine_m(47.4863, 19.0536, 47.4874, 19.0536) == pytest.approx(122, abs=5)
    assert haversine_m(*VENUE, *FAR_AWAY) > 800_000


def test_names_made_of_generic_words_skip_the_search():
    from ai_api.infrastructure.commons_photos import distinctive_words

    assert distinctive_words("Green House Cafe") == set()
    assert distinctive_words("Chop Chop") == set()
    assert distinctive_words("Cortile Hotel") == {"cortile"}
    # Folded, because a file title spells `Stefánia` both ways (TRA-208).
    assert distinctive_words("Stefánia Park Cafe") == {"stefania"}


class TestChooseNamed:
    """The gate shared word for word with the corpus tool's `sources/photos.py`
    (TRA-208): what a search result has to say to be this venue."""

    def _files(self, *titles: str) -> list[dict[str, object]]:
        return [{"title": t} for t in titles]

    def test_the_whole_name_written_in_the_title_is_the_venue(self):
        assert (
            choose_named(
                "Ritz-Carlton", self._files("File:The Ritz-Carlton, Budapest.jpg")
            )
            == "File:The Ritz-Carlton, Budapest.jpg"
        )

    def test_two_distinctive_words_both_written_are_enough(self):
        title = "File:Sofitel Budapest Chain Bridge. NE.jpg"
        assert (
            choose_named(
                "Sofitel Budapest Chain Bridge", self._files(title), city="Budapest"
            )
            == title
        )

    def test_a_single_word_needs_a_lodging_word_beside_it(self):
        title = "File:Carlton Hotel Budapest, 2017.jpg"
        assert choose_named("Carlton Hotel", self._files(title)) == title

    def test_a_single_word_alone_is_the_ship_the_flower_or_the_footballer(self):
        assert (
            choose_named(
                "Hotel Amadeus", self._files("File:Amadeus (ship, 1997) at dawn.jpg")
            )
            is None
        )
        assert (
            choose_named(
                "Aster Budapest", self._files("File:Aster amellus.jpg"), city="Budapest"
            )
            is None
        )
        assert (
            choose_named(
                "Hostal Casillas", self._files("File:Casillas besando la Copa.jpg")
            )
            is None
        )


# ─── Page images (TRA-163) ───────────────────────────────────────────────────


def test_wiki_page_reads_host_and_title_from_an_article_url():
    from ai_api.infrastructure.commons_photos import wiki_page

    assert wiki_page("https://en.wikivoyage.org/wiki/Budapest/Belv%C3%A1ros") == (
        "en.wikivoyage.org",
        "Budapest/Belváros",
    )
    assert wiki_page("https://en.wikipedia.org/wiki/Buda_Castle#History") == (
        "en.wikipedia.org",
        "Buda Castle",
    )
    assert wiki_page("https://www.openstreetmap.org/node/1") is None
    assert wiki_page("https://en.wikivoyage.org/") is None


async def test_a_pages_lead_image_is_returned_with_its_credit():
    def handle(request: httpx.Request) -> httpx.Response:
        params = request.url.params
        if params.get("prop") == "pageimages":
            assert request.url.host == "en.wikivoyage.org"
            assert params["titles"] == "Budapest/Belváros"
            return httpx.Response(
                200,
                json={
                    "query": {
                        "pages": {"7": {"pageimage": "Hungary_budapest_district_5.jpg"}}
                    }
                },
            )
        assert params["titles"] == "File:Hungary budapest district 5.jpg"
        return httpx.Response(200, json=CREDIT)

    finder = CommonsPhotos(httpx.AsyncClient(transport=httpx.MockTransport(handle)))

    photo = await finder.find_for_page(
        "https://en.wikivoyage.org/wiki/Budapest/Belv%C3%A1ros"
    )

    assert photo == Photo(
        url=(
            "https://commons.wikimedia.org/wiki/Special:FilePath/"
            "Hungary%20budapest%20district%205.jpg?width=800"
        ),
        credit="Someone (CC BY 4.0) · Wikimedia Commons",
    )


async def test_a_page_without_a_lead_image_or_off_wiki_is_none():
    def handle(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"query": {"pages": {"9": {"title": "x"}}}})

    finder = CommonsPhotos(httpx.AsyncClient(transport=httpx.MockTransport(handle)))

    assert (
        await finder.find_for_page("https://en.wikivoyage.org/wiki/Budapest/North_Buda")
        is None
    )
    assert await finder.find_for_page("https://example.com/wiki/Whatever") is None


async def test_a_failing_wiki_api_is_none_with_a_warning(caplog):
    def handle(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, json={"error": "down"})

    finder = CommonsPhotos(httpx.AsyncClient(transport=httpx.MockTransport(handle)))

    assert (
        await finder.find_for_page("https://en.wikivoyage.org/wiki/Budapest/Zugl%C3%B3")
        is None
    )
    assert "Wiki page image lookup failed" in caplog.text


# ─── The city is the caller's, never hard-coded (TRA-168) ────────────────────


async def test_the_name_search_carries_the_callers_city():
    seen_queries: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        params = request.url.params
        if params.get("list") == "search":
            seen_queries.append(params["srsearch"])
            return httpx.Response(200, json={"query": {"search": []}})
        return httpx.Response(200, json={"query": {"geosearch": []}})

    finder = CommonsPhotos(httpx.AsyncClient(transport=httpx.MockTransport(handler)))

    await finder.find("Osteria dell'Orsa", 44.49, 11.34, city="Bologna")

    assert seen_queries == ["Osteria dell'Orsa Bologna"]


def test_the_citys_own_name_is_not_a_distinctive_word():
    from ai_api.infrastructure.commons_photos import choose_named, distinctive_words

    assert distinctive_words("Hotel Bologna", city="Bologna") == set()
    assert distinctive_words("Bologna Welcome Hotel", city="Bologna") == {"welcome"}
    assert distinctive_words("Budapest Marriott", city="Budapest") == {"marriott"}
    # A file merely named after the city does not picture the venue.
    files = [{"title": "File:Bologna skyline at dusk.jpg"}]
    assert choose_named("Bologna Welcome Hotel", files, city="Bologna") is None
