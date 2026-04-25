"""CareMap AI agent modules.

Imports are intentionally lazy so row-level agents can run in minimal
Databricks jobs even when optional local-demo dependencies are absent.
"""

__all__ = ["ExtractionAgent", "ValidationAgent", "TrustScoringAgent", "QueryAgent", "DesertDetectionAgent"]


def __getattr__(name: str):
    if name == "ExtractionAgent":
        from caremap_ai.extraction import ExtractionAgent

        return ExtractionAgent
    if name == "ValidationAgent":
        from caremap_ai.validation import ValidationAgent

        return ValidationAgent
    if name == "TrustScoringAgent":
        from caremap_ai.scoring import TrustScoringAgent

        return TrustScoringAgent
    if name == "QueryAgent":
        from caremap_ai.query import QueryAgent

        return QueryAgent
    if name == "DesertDetectionAgent":
        from caremap_ai.desert import DesertDetectionAgent

        return DesertDetectionAgent
    raise AttributeError(name)
