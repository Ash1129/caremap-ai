"""Genie Code-friendly multi-agent pipeline orchestration."""

from __future__ import annotations

from typing import TYPE_CHECKING, Mapping

from caremap_ai.extraction import ExtractionAgent
from caremap_ai.scoring import TrustScoringAgent
from caremap_ai.validation import ValidationAgent

if TYPE_CHECKING:
    import pandas as pd


class CareMapAgentPipeline:
    """Runs extraction, validation, and scoring as explicit traceable steps."""

    def __init__(
        self,
        extraction_agent: ExtractionAgent | None = None,
        validation_agent: ValidationAgent | None = None,
        scoring_agent: TrustScoringAgent | None = None,
    ):
        self.extraction_agent = extraction_agent or ExtractionAgent()
        self.validation_agent = validation_agent or ValidationAgent()
        self.scoring_agent = scoring_agent or TrustScoringAgent()

    def run_row(self, row: Mapping[str, object]) -> dict[str, object]:
        extracted = self.extraction_agent.extract(row)
        validation = self.validation_agent.validate(extracted)
        scoring = self.scoring_agent.score(row, extracted, validation)
        return {**extracted, **validation, **scoring}

    def run_pandas(self, source: "pd.DataFrame") -> "pd.DataFrame":
        import pandas as pd

        records = []
        for _, row in source.iterrows():
            records.append(self.run_row(row.to_dict()))
        return pd.DataFrame(records)
