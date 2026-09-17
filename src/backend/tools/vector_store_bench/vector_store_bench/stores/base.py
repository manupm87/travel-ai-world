"""What the benchmark needs from a candidate store, and nothing else.

Deliberately narrower than `ai_api`'s `Retriever`: no `Document`, no filters
beyond what the eval set uses. The spike measures search, it does not ship one.
"""

from typing import Protocol

import numpy as np

from vector_store_bench.search import Hit


class VectorStore(Protocol):
    name: str

    def search(self, vector: np.ndarray, limit: int) -> list[Hit]:
        """Nearest documents by cosine, best first."""
        ...


class HybridStore(VectorStore, Protocol):
    def search_hybrid(self, vector: np.ndarray, text: str, limit: int) -> list[Hit]:
        """Dense and keyword search fused, best first."""
        ...
