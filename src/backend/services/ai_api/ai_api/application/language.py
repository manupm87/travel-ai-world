"""Which language the planner answers in (TRA-246).

The planner keeps no state, so every turn decides again. The page says which
language it is in, and that is the answer unless the traveller clearly writes
in the other one: a word count over their latest messages against two small
stop-word lists, where the other language has to lead by `MARGIN` words. A
tie, a bare city name or a one-word answer keeps the page's language, so a
turn never flips on its own. Spanish and English are the two the product ships.
"""

import re
from collections.abc import Iterable
from typing import Literal

Language = Literal["en", "es"]

MARGIN = 2
"""How far the other language must lead to override the page's."""

RECENT_MESSAGES = 4
"""How many of the traveller's latest messages are read."""

# No word may be in both lists by accident: `a` is the commonest Spanish
# preposition, so it is not counted as English ("voy a Bolonia").
_SPANISH = frozenset(
    re.split(
        r"\s+",
        "el la los las lo de del al en para por con sin desde hasta y o un una "
        "unos unas que es son somos soy estoy estamos hay mi mis tu nuestro "
        "nuestra nos quiero queremos quisiera gustaría prefiero voy vamos ir "
        "viaje días día noches noche barrio barrios zona cerca más menos otro "
        "otra algo también pero muy barato caro gracias hola por favor sí "
        "mañana tarde semana octubre noviembre diciembre enero febrero marzo "
        "abril mayo junio julio agosto septiembre adultos niños presupuesto "
        "medio alto bajo comida historia balnearios alternativas cambiar "
        "restaurante restaurantes cena comer dónde qué cómo cuándo cuánto",
    )
)
_ENGLISH = frozenset(
    re.split(
        r"\s+",
        "the an and or of to for with without from in on at is are am was we i "
        "my our you it this that there some something other another but very "
        "want would like prefer go going can could what where when how "
        "trip days day nights night neighbourhood neighborhood near cheaper "
        "cheap thanks hello please yes morning afternoon evening week october "
        "november december january february march april may june july august "
        "september adults children kids budget mid high low food history baths "
        "alternatives change restaurant restaurants dinner eat generate",
    )
)
_WORDS = re.compile(r"[a-záéíóúñü]+", re.IGNORECASE)


def _scores(texts: Iterable[str]) -> tuple[int, int]:
    spanish = english = 0
    for text in texts:
        for word in _WORDS.findall(text.lower()):
            if word in _SPANISH:
                spanish += 1
            if word in _ENGLISH:
                english += 1
        if any(ch in text for ch in "¿¡ñ"):
            spanish += 2
    return spanish, english


def detect_language(texts: Iterable[str], page: Language = "en") -> Language:
    """`page`, unless the texts read clearly as the other language."""
    spanish, english = _scores(texts)
    if page == "en" and spanish - english >= MARGIN:
        return "es"
    if page == "es" and english - spanish >= MARGIN:
        return "en"
    return page
