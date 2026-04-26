"""Mosaic AI Vector Search setup helpers plus local and OpenAI retrieval."""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from caremap_ai.schema import TEXT_COLUMNS

logger = logging.getLogger(__name__)


def build_embedding_text(row: pd.Series) -> str:
    parts = [str(row.get(col, "") or "") for col in TEXT_COLUMNS]
    summary_bits = []
    for field in [
        "has_icu",
        "has_oxygen",
        "has_ventilator",
        "has_emergency_surgery",
        "has_dialysis",
        "has_oncology",
        "has_trauma_care",
        "has_neonatal_care",
    ]:
        if row.get(field) is True:
            summary_bits.append(field.replace("has_", "").replace("_", " "))
    if summary_bits:
        parts.append("Extracted capabilities: " + ", ".join(summary_bits))
    return " | ".join(part for part in parts if part and part != "nan")


def create_mosaic_delta_sync_index(
    endpoint_name: str,
    source_table_name: str,
    index_name: str,
    primary_key: str,
    embedding_source_column: str,
    embedding_model_endpoint_name: str,
) -> None:
    """Create/sync a Mosaic AI Vector Search Delta Sync index in Databricks."""

    from databricks.vector_search.client import VectorSearchClient

    client = VectorSearchClient()
    existing_endpoints = [ep["name"] for ep in client.list_endpoints().get("endpoints", [])]
    if endpoint_name not in existing_endpoints:
        client.create_endpoint(name=endpoint_name, endpoint_type="STANDARD")

    try:
        client.create_delta_sync_index(
            endpoint_name=endpoint_name,
            source_table_name=source_table_name,
            index_name=index_name,
            pipeline_type="TRIGGERED",
            primary_key=primary_key,
            embedding_source_column=embedding_source_column,
            embedding_model_endpoint_name=embedding_model_endpoint_name,
        )
    except Exception:
        index = client.get_index(endpoint_name=endpoint_name, index_name=index_name)
        index.sync()


@dataclass
class LocalVectorFallback:
    facilities: pd.DataFrame

    def query(self, text: str, top_k: int = 20) -> pd.DataFrame:
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.metrics.pairwise import cosine_similarity

        corpus = self.facilities["embedding_text"].fillna("").tolist()
        vectorizer = TfidfVectorizer(stop_words="english")
        matrix = vectorizer.fit_transform(corpus + [text])
        scores = cosine_similarity(matrix[-1], matrix[:-1]).flatten()
        df = self.facilities.copy()
        df["_retrieval_score"] = scores
        return df.sort_values("_retrieval_score", ascending=False).head(top_k)


@dataclass
class OpenAISemanticRetriever:
    """Retrieve facility candidates using OpenAI text embeddings.

    Embeds all facility ``embedding_text`` values once on first query, then
    re-uses the matrix for subsequent calls. Uses cosine similarity — no hard
    threshold, so every facility gets a score and nothing is silently dropped.
    """

    facilities: pd.DataFrame
    api_key: str | None = None
    model: str = "text-embedding-3-small"
    _matrix: np.ndarray | None = field(default=None, init=False, repr=False)

    def _get_client(self):
        try:
            from openai import OpenAI
        except ImportError as exc:
            raise ImportError("Install openai: pip install openai") from exc
        return OpenAI(api_key=self.api_key or os.environ.get("OPENAI_API_KEY"))

    def _embed(self, texts: list[str]) -> np.ndarray:
        client = self._get_client()
        # OpenAI recommends replacing newlines for embedding quality
        cleaned = [t.replace("\n", " ") for t in texts]
        response = client.embeddings.create(model=self.model, input=cleaned)
        return np.array([item.embedding for item in response.data], dtype=np.float32)

    def _build_matrix(self) -> np.ndarray:
        if self._matrix is not None:
            return self._matrix
        corpus = self.facilities["embedding_text"].fillna("").tolist()
        logger.info("Building OpenAI embedding matrix for %d facilities…", len(corpus))
        # Batch in chunks of 100 to stay well within the API limit
        chunks = [corpus[i : i + 100] for i in range(0, len(corpus), 100)]
        parts = [self._embed(chunk) for chunk in chunks]
        self._matrix = np.vstack(parts)
        return self._matrix

    def scores_for_query(self, query: str) -> np.ndarray:
        """Return a cosine-similarity score in [0, 1] for every facility row."""
        matrix = self._build_matrix()
        q_vec = self._embed([query])[0]
        # Cosine similarity: dot product of unit-normalised vectors
        matrix_norm = matrix / (np.linalg.norm(matrix, axis=1, keepdims=True) + 1e-9)
        q_norm = q_vec / (np.linalg.norm(q_vec) + 1e-9)
        sims = matrix_norm @ q_norm
        # Shift from [-1, 1] to [0, 1]
        return (sims + 1.0) / 2.0

    def query(self, text: str, top_k: int = 50) -> pd.DataFrame:
        """Return up to *top_k* facilities ranked by semantic similarity."""
        scores = self.scores_for_query(text)
        df = self.facilities.copy()
        df["_retrieval_score"] = scores
        return df.sort_values("_retrieval_score", ascending=False).head(top_k)
