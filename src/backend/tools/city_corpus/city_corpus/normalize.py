"""Wikitext → plain text, chunking and identifiers shared by every source."""

import html
import math
import re
import unicodedata
from collections.abc import Callable, Iterable
from urllib.parse import quote

import mwparserfromhell as mw
from mwparserfromhell.nodes import (
    Comment,
    ExternalLink,
    HTMLEntity,
    Node,
    Tag,
    Template,
    Text,
    Wikilink,
)
from mwparserfromhell.wikicode import Wikicode

HEADING_SEPARATOR = " \u203a "  # single right-pointing angle quotation mark
MIN_CHUNK_TOKENS = 250
MAX_CHUNK_TOKENS = 500
TOKENS_PER_WORD = 1.3

# Namespaces whose links are media or metadata, not prose (EN and ES wikis).
_DROPPED_LINK_PREFIXES = (
    "file:",
    "image:",
    "media:",
    "category:",
    "archivo:",
    "imagen:",
    "categoría:",
)
_INTERWIKI_RE = re.compile(r"^:?[a-z]{2,3}(-[a-z]+)?:", re.IGNORECASE)
_DROPPED_TAGS = {"ref", "references", "gallery", "table", "math", "timeline", "maplink"}
_SENTENCE_RE = re.compile(r"(?<=[.!?])\s+")


def _param(tpl: Template, key: str | int) -> str:
    name = str(key)
    if not tpl.has(name):
        return ""
    return to_text(tpl.get(name).value).strip()


def _unit(suffix: str) -> Callable[[Template], str]:
    return lambda t: f"{_param(t, 1)} {suffix}".strip()


# Inline templates whose output is part of the sentence; every other template
# (banners, maps, navigation, maintenance, listings) renders to nothing.
_INLINE_TEMPLATES: dict[str, Callable[[Template], str]] = {
    "station": lambda t: _param(t, 1),
    "huf": lambda t: f"HUF {_param(t, 1)}".strip(),
    "m": _unit("m"),
    "km": _unit("km"),
    "c": _unit("°C"),
    "phone": lambda t: _param(t, 1),
    "rint": lambda t: _param(t, 2),
    "iata": lambda t: _param(t, 1),
    "marker": lambda t: _param(t, "name"),
    "nowrap": lambda t: _param(t, 1),
    "nobr": lambda t: _param(t, 1),
    "lang": lambda t: _param(t, 2),
}


def _render_template(tpl: Template) -> str:
    name = str(tpl.name).strip().lower()
    render = _INLINE_TEMPLATES.get(name)
    if render is not None:
        return render(tpl)
    if name.startswith("lang-"):
        return _param(tpl, 1)
    return ""


def _render_node(node: Node) -> str:
    match node:
        case Text():
            return str(node.value)
        case Template():
            return _render_template(node)
        case Wikilink():
            title = str(node.title).strip()
            if title.lower().startswith(_DROPPED_LINK_PREFIXES):
                return ""
            if node.text is not None:
                return to_text(node.text)
            if _INTERWIKI_RE.match(title):
                return ""
            return title.lstrip(":").split("#")[0]
        case ExternalLink():
            if not node.brackets:  # a bare URL is its own text
                return str(node.url)
            return to_text(node.title) if node.title is not None else ""
        case Tag():
            tag = str(node.tag).lower()
            if tag in _DROPPED_TAGS or node.wiki_markup == "{|":
                return ""
            if tag == "br":
                return "\n"
            if tag == "li" and node.wiki_markup:
                return "\n"
            if node.contents is None:
                return ""
            return to_text(node.contents)
        case HTMLEntity():
            return node.normalize()
        case Comment():
            return ""
        case _:
            return ""


def to_text(wikitext: str | Wikicode) -> str:
    """Render wikitext as plain text: link labels kept, markup and templates gone."""
    code = mw.parse(wikitext) if isinstance(wikitext, str) else wikitext
    raw = "".join(_render_node(node) for node in code.nodes)
    return html.unescape(raw)


def clean_whitespace(text: str) -> str:
    """Collapse runs of spaces, strip list markers, keep paragraph breaks."""
    lines: list[str] = []
    for line in text.splitlines():
        stripped = re.sub(r"^[*#:;]+\s*", "", line.strip())
        stripped = re.sub(r"\s+", " ", stripped).strip()
        stripped = re.sub(r"\s+([,.;:!?)])", r"\1", stripped)
        stripped = re.sub(r"\(\s*\)", "", stripped).strip()
        if stripped == "----":
            stripped = ""
        lines.append(stripped)
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


def inline(text: str) -> str:
    """One-line plain text (listing fields)."""
    return re.sub(r"\s+", " ", clean_whitespace(text)).strip()


def paragraphs(text: str) -> list[str]:
    """Paragraphs of cleaned text; single list items stay on their own line."""
    return [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]


def estimate_tokens(text: str) -> int:
    return math.ceil(len(text.split()) * TOKENS_PER_WORD)


def _split_oversized(paragraph: str, max_tokens: int) -> list[str]:
    if estimate_tokens(paragraph) <= max_tokens:
        return [paragraph]
    max_words = int(max_tokens / TOKENS_PER_WORD)
    pieces: list[str] = []
    current: list[str] = []
    for sentence in _SENTENCE_RE.split(paragraph.replace("\n", " ")):
        words = sentence.split()
        while len(words) > max_words:
            if current:
                pieces.append(" ".join(current))
                current = []
            pieces.append(" ".join(words[:max_words]))
            words = words[max_words:]
        if current and len(current) + len(words) > max_words:
            pieces.append(" ".join(current))
            current = []
        current.extend(words)
    if current:
        pieces.append(" ".join(current))
    return pieces


def chunk_paragraphs(
    items: Iterable[str],
    *,
    min_tokens: int = MIN_CHUNK_TOKENS,
    max_tokens: int = MAX_CHUNK_TOKENS,
) -> list[str]:
    """Group paragraphs into chunks of at most `max_tokens` (approximated as
    words x 1.3), repeating the last paragraph of a chunk at the start of the next
    one. A short tail is folded into the previous chunk when it fits."""
    units = [u for p in items for u in _split_oversized(p, max_tokens)]
    chunks: list[list[str]] = []
    current: list[str] = []
    overlapped = False

    def size(parts: list[str]) -> int:
        return estimate_tokens(" ".join(parts))

    for unit in units:
        if current and size([*current, unit]) > max_tokens:
            chunks.append(current)
            previous = current[-1]
            overlapped = len(current) > 1 and size([previous, unit]) <= max_tokens
            current = [previous] if overlapped else []
        current.append(unit)

    if current:
        tail = current[1:] if overlapped else current
        if (
            chunks
            and size(current) < min_tokens
            and size(chunks[-1] + tail) <= max_tokens
        ):
            chunks[-1] = chunks[-1] + tail
        else:
            chunks.append(current)
    return ["\n\n".join(chunk) for chunk in chunks]


def slugify(value: str, max_length: int = 80) -> str:
    ascii_value = (
        unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    )
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_value.lower()).strip("-")
    return slug[:max_length].rstrip("-") or "untitled"


def wiki_url(host: str, title: str, anchor: str | None = None) -> str:
    url = f"https://{host}/wiki/{quote(title.replace(' ', '_'), safe='/(),:')}"
    if anchor:
        url += "#" + quote(anchor.replace(" ", "_"), safe="(),:")
    return url


def unique_ids() -> Callable[[str], str]:
    """Deterministic de-duplication: the second `x` becomes `x~2`, and so on."""
    seen: dict[str, int] = {}

    def claim(doc_id: str) -> str:
        count = seen.get(doc_id, 0) + 1
        seen[doc_id] = count
        return doc_id if count == 1 else f"{doc_id}~{count}"

    return claim
