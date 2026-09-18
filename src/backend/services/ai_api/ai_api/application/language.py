"""Which language the user writes in, from the text alone.

The planner answers in the user's language but keeps no state, so every turn
decides again from the message and the transcript. A word count against two
small stop-word lists is enough to tell Spanish from English, the two the
product ships; anything else falls back to English.
"""

import re
from collections.abc import Iterable
from typing import Literal

Language = Literal["en", "es"]

_SPANISH = frozenset(
    re.split(
        r"\s+",
        "el la los las de del en para con desde hasta y un una unos unas que es "
        "quiero queremos viaje días día noches noche hotel barrio cerca más menos "
        "barato caro gracias hola por favor mañana tarde semana octubre noviembre "
        "diciembre enero febrero marzo abril mayo junio julio agosto septiembre "
        "adultos niños presupuesto medio alto bajo comida historia balnearios "
        "alternativas cambiar restaurante restaurantes cena comer",
    )
)
_ENGLISH = frozenset(
    re.split(
        r"\s+",
        "the a an and of to for with from in on at is are we i want would like "
        "trip days day nights night hotel neighbourhood near cheaper cheap thanks "
        "hello please morning afternoon evening week october november december "
        "january february march april may june july august september adults "
        "children budget mid high low food history baths alternatives change "
        "restaurant restaurants dinner eat generate",
    )
)
_WORDS = re.compile(r"[a-záéíóúñü]+", re.IGNORECASE)


def detect_language(texts: Iterable[str]) -> Language:
    """`es` when the texts read more Spanish than English, else `en`."""
    spanish = english = 0
    for text in texts:
        for word in _WORDS.findall(text.lower()):
            if word in _SPANISH:
                spanish += 1
            if word in _ENGLISH:
                english += 1
        if any(ch in text for ch in "¿¡ñ"):
            spanish += 2
    return "es" if spanish > english else "en"
