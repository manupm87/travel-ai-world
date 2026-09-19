"""`application.cards`: pure hydration from a retrieved document's metadata.

Uses the real Budapest sample (`tests/fixtures/budapest_sample.jsonl`)
through `ai_api.testing.documents_from_corpus`, so these tests exercise the
same metadata shape `indexing.metadata_for` produces in production, plus a
handful of synthetic documents for edge cases the sample does not carry.
"""

from pathlib import Path

import pytest
from ai_api.application.cards import (
    MAX_DESCRIPTION_CHARS,
    _description,
    card_from_document,
    cards_for,
    detail_from_card,
    detail_from_document,
    title_of,
)
from ai_api.domain.models import Document
from ai_api.schemas.planner_events import MAX_WHY_CHARS
from ai_api.testing import documents_from_corpus

FIXTURE = Path(__file__).parent / "fixtures" / "budapest_sample.jsonl"

FOUR_SEASONS = "wv:en:Budapest/Belváros#sleep:four-seasons-hotel-gresham-palace"
MAZEL_TOV = "osm:node/3990944430"
TOUR_EN = "tour:budapest:by-locals-pest-english"
CLIMATE_JAN = "om:climate:budapest:01"
PARLIAMENT = "wv:en:Budapest/Belváros#see:parliament"
BELVAROS_INTRO = "wv:en:Budapest/Belváros#section:intro:c1"


@pytest.fixture(scope="module")
def documents() -> dict[str, Document]:
    return {doc.id: doc for doc in documents_from_corpus(FIXTURE)}


def _doc(**metadata: object) -> Document:
    return Document(id="synthetic", content="text", metadata=metadata)  # type: ignore[arg-type]


class TestFourSeasons:
    """A wikivoyage `sleep` listing with an image, a price tier and an address."""

    def test_hydration(self, documents: dict[str, Document]) -> None:
        card = card_from_document(
            documents[FOUR_SEASONS], why="Iconic 5-star riverside stay."
        )
        assert card.id == FOUR_SEASONS
        assert card.title == "Four Seasons Hotel Gresham Palace"
        assert card.subtitle == "Széchenyi István tér, 5"
        assert card.district == "Belváros"
        assert card.category == "sleep"
        assert card.image_url is not None
        assert "Gresham" in card.image_url
        assert (
            card.image_credit
            == "michael clarke stuff (CC BY-SA 2.0) · Wikimedia Commons"
        )
        assert card.price_tier == 3
        assert card.rating_text is None
        assert card.hours is None
        assert card.lat == pytest.approx(47.4996)
        assert card.lon == pytest.approx(19.04807)
        assert card.why == "Iconic 5-star riverside stay."
        assert card.source == "Wikivoyage"
        assert card.source_url == (
            "https://en.wikivoyage.org/wiki/Budapest/Belv%C3%A1ros#Splurge"
        )
        assert card.license == "CC BY-SA 4.0"
        assert card.deep_link == "http://www.fourseasons.com"


class TestMazelTov:
    """An OpenStreetMap `drink` listing: opening hours, cuisine, no image."""

    def test_hydration(self, documents: dict[str, Document]) -> None:
        card = card_from_document(documents[MAZEL_TOV])
        assert card.title == "Mazel Tov"
        assert card.subtitle == "Akácfa utca 47, 1073"
        assert card.category == "drink"
        assert card.image_url is None
        assert card.image_credit is None
        assert card.price_tier is None
        assert card.hours == "Mo-Su 12:00-24:00"
        assert card.source == "OpenStreetMap"
        assert card.license == "ODbL 1.0"
        assert card.deep_link == "https://mazeltov.hu/en/"
        assert card.why == ""


class TestCuratedTour:
    """A curated tour: an operator and a meeting address, tip-based pricing."""

    def test_hydration(self, documents: dict[str, Document]) -> None:
        card = card_from_document(documents[TOUR_EN])
        assert card.title == "Free Budapest Walking Tour By Locals"
        assert card.subtitle == "Andrássy út 22, 1061 Budapest"
        assert card.category == "tour"
        assert card.hours == "daily at 11:00"
        assert card.price_tier is None
        assert card.source == "Travel AI World"
        assert card.license == "CC BY-SA 4.0"
        assert card.deep_link == "https://freebudapesttour.com/"


class TestClimateDocument:
    """Climate prose carries no coordinates and no address; falls back to
    the heading path (minus its city segment) for a subtitle."""

    def test_hydration(self, documents: dict[str, Document]) -> None:
        card = card_from_document(documents[CLIMATE_JAN])
        assert card.title == "Budapest climate in January"
        assert card.subtitle == "Climate › January"  # noqa: RUF001
        assert card.lat is None
        assert card.lon is None
        assert card.source == "Open-Meteo"


class TestBelvarosIntro:
    """No `name`: the title falls back to the heading path's last segment."""

    def test_hydration(self, documents: dict[str, Document]) -> None:
        card = documents[BELVAROS_INTRO]
        hydrated = card_from_document(card)
        assert hydrated.title == "Belváros"
        # The heading path minus its city segment: just the district itself.
        assert hydrated.subtitle == "Belváros"


class TestParliament:
    """Hours prose with no weekday word at all: never treated as `closed`
    material here — that is `validate.is_closed_on`'s job, not hydration's."""

    def test_hydration(self, documents: dict[str, Document]) -> None:
        card = card_from_document(documents[PARLIAMENT])
        assert card.hours is not None
        assert len(card.hours) <= 120
        assert card.image_credit == "OGYK (CC BY-SA 4.0) · Wikimedia Commons"


class TestWhyTruncation:
    def test_short_why_is_kept_as_is(self, documents: dict[str, Document]) -> None:
        card = card_from_document(documents[MAZEL_TOV], why="  a good  spot  ")
        assert card.why == "a good spot"

    def test_long_why_is_cut_at_a_word_boundary(
        self, documents: dict[str, Document]
    ) -> None:
        long_why = " ".join(["word"] * 40)  # far past MAX_WHY_CHARS
        card = card_from_document(documents[MAZEL_TOV], why=long_why)
        assert len(card.why) <= MAX_WHY_CHARS
        assert card.why.endswith("…")
        assert not card.why[:-1].endswith(" ")  # cut before the trailing space
        assert "word" in card.why

    def test_why_exactly_at_the_limit_is_untouched(self) -> None:
        why = "a" * MAX_WHY_CHARS
        card = card_from_document(_doc(category="see"), why=why)
        assert card.why == why


class TestMissingOrMalformedExtra:
    def test_missing_extra_key(self) -> None:
        card = card_from_document(_doc(category="see", name="Place"))
        assert card.subtitle is None
        assert card.image_url is None
        assert card.license == ""

    def test_malformed_extra_json(self) -> None:
        card = card_from_document(
            _doc(category="see", name="Place", extra="{not valid json")
        )
        assert card.subtitle is None
        assert card.image_url is None

    def test_extra_that_is_not_an_object(self) -> None:
        card = card_from_document(_doc(category="see", name="Place", extra="[1, 2, 3]"))
        assert card.subtitle is None


class TestSourceDisplayNames:
    @pytest.mark.parametrize(
        ("source", "expected"),
        [
            ("wikivoyage", "Wikivoyage"),
            ("wikipedia", "Wikipedia"),
            ("openstreetmap", "OpenStreetMap"),
            ("open-meteo", "Open-Meteo"),
            ("curated", "Travel AI World"),
        ],
    )
    def test_known_sources(self, source: str, expected: str) -> None:
        card = card_from_document(_doc(category="see", source=source))
        assert card.source == expected

    def test_unknown_source_is_capitalised_as_is(self) -> None:
        card = card_from_document(_doc(category="see", source="foobar"))
        assert card.source == "Foobar"

    def test_missing_source(self) -> None:
        card = card_from_document(_doc(category="see"))
        assert card.source == ""


class TestLicenseDefaults:
    @pytest.mark.parametrize(
        ("source", "expected"),
        [
            ("wikivoyage", "CC BY-SA 4.0"),
            ("wikipedia", "CC BY-SA 4.0"),
            ("openstreetmap", "ODbL"),
            ("curated", ""),
        ],
    )
    def test_default_by_source(self, source: str, expected: str) -> None:
        card = card_from_document(_doc(category="see", source=source))
        assert card.license == expected

    def test_extra_license_overrides_the_default(self) -> None:
        card = card_from_document(
            _doc(
                category="see", source="wikivoyage", extra='{"license":"Public domain"}'
            )
        )
        assert card.license == "Public domain"


class TestImageCredit:
    def test_author_only(self) -> None:
        card = card_from_document(
            _doc(
                category="see",
                extra='{"image_url":"https://x/y.jpg","image_author":"Jane Doe"}',
            )
        )
        assert card.image_credit == "Jane Doe · Wikimedia Commons"

    def test_license_only(self) -> None:
        card = card_from_document(
            _doc(
                category="see",
                extra='{"image_url":"https://x/y.jpg","image_license":"CC0"}',
            )
        )
        assert card.image_credit == "CC0 · Wikimedia Commons"

    def test_no_image_means_no_credit_even_with_author(self) -> None:
        card = card_from_document(
            _doc(category="see", extra='{"image_author":"Jane Doe"}')
        )
        assert card.image_url is None
        assert card.image_credit is None


class TestPriceTier:
    @pytest.mark.parametrize("raw", [1, 2, 3])
    def test_accepted_tiers(self, raw: int) -> None:
        card = card_from_document(_doc(category="sleep", price_tier=raw))
        assert card.price_tier == raw

    def test_out_of_range_tier_is_dropped(self) -> None:
        card = card_from_document(_doc(category="sleep", price_tier=4))
        assert card.price_tier is None

    def test_missing_tier(self) -> None:
        card = card_from_document(_doc(category="sleep"))
        assert card.price_tier is None


class TestCardsFor:
    def test_order_and_default_why(self, documents: dict[str, Document]) -> None:
        ordered = [documents[TOUR_EN], documents[MAZEL_TOV], documents[FOUR_SEASONS]]
        cards = cards_for(ordered, {MAZEL_TOV: "Great cocktails."})
        assert [c.id for c in cards] == [TOUR_EN, MAZEL_TOV, FOUR_SEASONS]
        assert cards[0].why == ""
        assert cards[1].why == "Great cocktails."
        assert cards[2].why == ""

    def test_why_for_an_id_not_in_the_list_is_simply_unused(
        self, documents: dict[str, Document]
    ) -> None:
        cards = cards_for(
            [documents[MAZEL_TOV]], {"some-other-id": "irrelevant", MAZEL_TOV: "Nice."}
        )
        assert len(cards) == 1
        assert cards[0].why == "Nice."


class TestTitleOf:
    def test_matches_the_hydrated_card_title(
        self, documents: dict[str, Document]
    ) -> None:
        for doc_id in (FOUR_SEASONS, MAZEL_TOV, BELVAROS_INTRO, CLIMATE_JAN):
            assert (
                title_of(documents[doc_id])
                == card_from_document(documents[doc_id]).title
            )


class TestDetailFromDocument:
    """`detail_from_document` = the card plus the article behind it (TRA-178)."""

    def test_keeps_every_card_field(self, documents: dict[str, Document]) -> None:
        document = documents[FOUR_SEASONS]
        card = card_from_document(document, why="Iconic riverside stay.")
        detail = detail_from_document(document, why="Iconic riverside stay.")
        assert detail.model_dump(include=set(card.model_dump())) == card.model_dump()

    def test_description_address_phone_and_website(
        self, documents: dict[str, Document]
    ) -> None:
        detail = detail_from_document(documents[MAZEL_TOV])
        assert detail.description.startswith("Mazel Tov — bar in Erzsébetváros")
        assert detail.address == "Akácfa utca 47, 1073"
        assert detail.phone == "+36 70 626 4280"
        assert detail.website == "https://mazeltov.hu/en/"
        assert detail.heading_path == "Budapest › Erzsébetváros › Drink"  # noqa: RUF001

    def test_a_url_that_is_the_source_page_is_not_a_website(
        self, documents: dict[str, Document]
    ) -> None:
        """The curated tours point `url` at the operator's page they came from."""
        detail = detail_from_document(documents[TOUR_EN])
        assert detail.source_url == "https://freebudapesttour.com/"
        assert detail.website is None

    def test_the_photo_and_the_why_are_the_corpus_s_own(
        self, documents: dict[str, Document]
    ) -> None:
        """The corpus has no photo of most bars, so the detail has none either.

        The streamed card does (Commons, a same-category corpus photo or the
        placeholder, from `application/photos`) and carries the model's `why`:
        the contract is that a client merges the detail onto the card it
        holds, so pin what the builder alone can answer.
        """
        detail = detail_from_document(documents[MAZEL_TOV])

        assert detail.image_url is None
        assert detail.image_credit is None
        assert detail.why == ""
        assert detail.license == "ODbL 1.0"  # a licence is metadata, not a photo

    def test_a_pictured_card_carries_its_photo_into_the_detail(self) -> None:
        """What `ensure_photos` filled in survives `detail_from_card`."""
        document = Document(
            id="osm:node/1", content="A bar.", metadata={"category": "drink"}
        )
        pictured = card_from_document(document, why="Late and loud.").model_copy(
            update={
                "image_url": "https://example.org/bar.jpg",
                "image_credit": "Someone",
            }
        )

        detail = detail_from_card(pictured, document)

        assert detail.image_url == "https://example.org/bar.jpg"
        assert detail.image_credit == "Someone"
        assert detail.why == "Late and loud."
        assert detail.description == "A bar."

    def test_a_document_without_text_has_an_empty_description(self) -> None:
        detail = detail_from_document(
            Document(id="synthetic", content="  ", metadata={"category": "see"})
        )
        assert detail.description == ""
        assert detail.address is None
        assert detail.phone is None
        assert detail.website is None
        assert detail.heading_path is None

    def test_every_sample_document_gets_a_description(
        self, documents: dict[str, Document]
    ) -> None:
        for document in documents.values():
            detail = detail_from_document(document)
            assert detail.description
            assert len(detail.description) <= MAX_DESCRIPTION_CHARS


class TestDescriptionTrim:
    def test_a_short_text_is_kept_whole_with_its_paragraphs(self) -> None:
        text = "First paragraph.\n\nSecond paragraph."
        assert _description(text) == text

    def test_surrounding_whitespace_is_dropped(self) -> None:
        assert _description("\n  Hello there.  \n") == "Hello there."

    def test_a_long_text_is_cut_at_the_last_full_sentence(self) -> None:
        sentence = "Budapest is lovely in the spring. "
        text = sentence * 60  # far past MAX_DESCRIPTION_CHARS
        trimmed = _description(text)

        assert len(trimmed) <= MAX_DESCRIPTION_CHARS
        assert trimmed.endswith("spring.")
        assert trimmed.count("spring.") == MAX_DESCRIPTION_CHARS // len(sentence)

    def test_a_question_mark_also_ends_a_sentence(self) -> None:
        text = "a" * (MAX_DESCRIPTION_CHARS - 10) + "? " + "b" * 200
        trimmed = _description(text)
        assert trimmed.endswith("?")
        assert "b" not in trimmed

    def test_a_long_text_with_no_sentence_end_is_cut_at_a_word(self) -> None:
        text = " ".join(["word"] * 1_000)
        trimmed = _description(text)

        assert len(trimmed) <= MAX_DESCRIPTION_CHARS
        assert trimmed.endswith("word…")

    def test_exactly_at_the_limit_is_untouched(self) -> None:
        text = "a" * MAX_DESCRIPTION_CHARS
        assert _description(text) == text
