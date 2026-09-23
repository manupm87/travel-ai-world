"""What a turn cost, from a versioned price table (ADR 0024).

Prices are USD per million tokens `(input, output)`, keyed by a substring of
the model id so a cross-region profile (`eu.anthropic.claude-haiku-4-5-...`)
matches its base model. A model without a public price (the NVIDIA-hosted
ones) costs `None`: never a guess. Changing a price means a new
`PRICING_VERSION`, stored with every trace so old costs stay explainable.
"""

PRICING_VERSION = "2026-09"

PRICES: dict[str, tuple[float, float]] = {
    "anthropic.claude-haiku-4-5": (1.00, 5.00),
    "amazon.titan-embed-text-v2": (0.02, 0.0),
}

_PER_TOKEN = 1_000_000


def price_of(model: str | None) -> tuple[float, float] | None:
    """The `(input, output)` price per million tokens of `model`, or `None`."""
    if not model:
        return None
    for key, price in PRICES.items():
        if key in model:
            return price
    return None


def estimate(
    model: str | None,
    input_tokens: int,
    output_tokens: int,
    embed_model: str | None,
    embed_tokens: int,
) -> float | None:
    """USD for the chat model's tokens plus the embeddings', or `None` when
    the chat model has no known price."""
    chat = price_of(model)
    if chat is None:
        return None
    cost = (input_tokens * chat[0] + output_tokens * chat[1]) / _PER_TOKEN
    embed = price_of(embed_model)
    if embed is not None and embed_tokens:
        cost += embed_tokens * embed[0] / _PER_TOKEN
    return round(cost, 8)
