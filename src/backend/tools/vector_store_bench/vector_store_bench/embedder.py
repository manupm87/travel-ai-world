"""Titan Text Embeddings V2, the one contract both candidates share.

Same model, same dimensions and the same normalisation on each side (TRA-152 does
the same in `ai_api`), so the vectors a store receives are identical and the
comparison measures the store, not the embeddings.

Titan V2 takes `inputText`, `dimensions`, `normalize` and `embeddingTypes` only:
an `inputType` key (a Cohere parameter) is rejected with
`extraneous key [inputType] is not permitted`, so queries and documents are
embedded exactly the same way.
"""

import json
import logging
import time
from collections.abc import Sequence
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import Any

import numpy as np

MODEL_ID = "amazon.titan-embed-text-v2:0"
DIMENSIONS = 1024
REGION = "eu-west-1"
CONCURRENCY = 8
MAX_ATTEMPTS = 5

logger = logging.getLogger(__name__)


@dataclass
class EmbedStats:
    calls: int = 0
    tokens: int = 0
    seconds: float = 0.0

    @property
    def usd(self) -> float:
        return self.tokens / 1_000_000 * 0.02  # eu-west-1 list price, Titan V2


class TitanEmbedder:
    """One embedding per call (Titan V2 has no batch API); calls run in a small
    thread pool because boto3 is synchronous."""

    def __init__(
        self,
        client: Any = None,
        *,
        model_id: str = MODEL_ID,
        dimensions: int = DIMENSIONS,
        region: str = REGION,
        concurrency: int = CONCURRENCY,
        sleep: Any = time.sleep,
    ) -> None:
        if client is None:
            import boto3  # imported here so tests never need the dependency wired

            client = boto3.client("bedrock-runtime", region_name=region)
        self._client = client
        self._model_id = model_id
        self._dimensions = dimensions
        self._concurrency = concurrency
        self._sleep = sleep
        self.stats = EmbedStats()

    @property
    def model_id(self) -> str:
        return self._model_id

    @property
    def dimensions(self) -> int:
        return self._dimensions

    def embed_query(self, text: str) -> np.ndarray:
        return self._embed(text)

    def embed_documents(self, texts: Sequence[str]) -> np.ndarray:
        """(len(texts), dimensions) float32, in the order given."""
        with ThreadPoolExecutor(max_workers=self._concurrency) as pool:
            vectors = list(pool.map(self._embed, texts))
        return (
            np.vstack(vectors)
            if vectors
            else np.empty((0, self._dimensions), dtype=np.float32)
        )

    def _embed(self, text: str) -> np.ndarray:
        body = json.dumps(
            {
                "inputText": text,
                "dimensions": self._dimensions,
                "normalize": True,
                "embeddingTypes": ["float"],
            }
        )
        started = time.monotonic()
        payload = self._invoke(body)
        self.stats.calls += 1
        self.stats.tokens += int(payload.get("inputTextTokenCount", 0))
        self.stats.seconds += time.monotonic() - started
        vector = np.asarray(payload["embedding"], dtype=np.float32)
        if vector.shape != (self._dimensions,):
            raise ValueError(
                f"expected {self._dimensions} dimensions, got {vector.shape}"
            )
        return vector

    def _invoke(self, body: str) -> dict[str, Any]:
        delay = 1.0
        for attempt in range(1, MAX_ATTEMPTS + 1):
            try:
                response = self._client.invoke_model(
                    modelId=self._model_id, body=body, contentType="application/json"
                )
            except Exception as exc:  # boto3 raises client-specific error classes
                if attempt == MAX_ATTEMPTS or not _retryable(exc):
                    raise
                logger.warning("bedrock: %s (attempt %d)", exc, attempt)
                self._sleep(delay)
                delay *= 2
                continue
            return json.loads(response["body"].read())
        raise RuntimeError("unreachable")


def _retryable(exc: Exception) -> bool:
    name = type(exc).__name__
    return name in {
        "ThrottlingException",
        "ModelTimeoutException",
        "ServiceUnavailableException",
        "InternalServerException",
        "ConnectionError",
        "ReadTimeoutError",
    }
