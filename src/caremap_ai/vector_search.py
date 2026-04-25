"""Mosaic AI Vector Search setup helpers plus local retrieval fallback."""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from caremap_ai.schema import TEXT_COLUMNS


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
