"""Optional LLM-based query fit scoring for ranked facility candidates."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any, Mapping

import pandas as pd


CAPABILITY_LABELS = {
    "has_icu": "ICU",
    "has_oxygen": "oxygen",
    "has_ventilator": "ventilator",
    "has_emergency_surgery": "emergency surgery",
    "has_anesthesiologist": "anesthesiologist",
    "has_dialysis": "dialysis",
    "has_oncology": "oncology",
    "has_trauma_care": "trauma care",
    "has_neonatal_care": "neonatal care",
    "availability_24_7": "24/7 availability",
}


@dataclass
class LLMScore:
    llm_fit_score: float
    llm_score_reason: str


class EvidenceBoundLLMScorer:
    """Score query-specific facility fit using only extracted evidence.

    This scorer is intentionally bounded: it does not diagnose, and it should
    not invent capabilities. It only scores how well the existing extracted
    facility record fits the user's query.
    """

    def __init__(self, api_key: str | None = None, model: str = "gpt-4o-mini"):
        self.api_key = api_key or os.environ.get("OPENAI_API_KEY")
        self.model = model
        if not self.api_key:
            raise ValueError("OPENAI_API_KEY is required for EvidenceBoundLLMScorer.")

    def score_candidates(self, query: str, candidates: pd.DataFrame, max_candidates: int = 12) -> dict[int, LLMScore]:
        payload = [
            self._candidate_payload(idx, row)
            for idx, row in candidates.head(max_candidates).iterrows()
        ]
        if not payload:
            return {}

        response_text = self._call_openai(query=query, candidates=payload)
        parsed = self._parse_response(response_text)
        scores: dict[int, LLMScore] = {}
        for item in parsed:
            try:
                idx = int(item["candidate_id"])
                fit_score = float(item.get("llm_fit_score", 0))
            except (KeyError, TypeError, ValueError):
                continue
            scores[idx] = LLMScore(
                llm_fit_score=max(0.0, min(100.0, fit_score)),
                llm_score_reason=str(item.get("llm_score_reason", ""))[:600],
            )
        return scores

    def _call_openai(self, query: str, candidates: list[dict[str, Any]]) -> str:
        try:
            from openai import OpenAI
        except ImportError as exc:
            raise ImportError("Install the OpenAI SDK with: pip install openai") from exc

        client = OpenAI(api_key=self.api_key)
        response = client.chat.completions.create(
            model=self.model,
            temperature=0,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a cautious healthcare facility routing evaluator for India. "
                        "Score facility fit for the user's query using only the provided extracted "
                        "capabilities, contradictions, trust score, location, and evidence snippets. "
                        "Do not diagnose. Do not invent missing capabilities. Penalize contradictions, "
                        "unknowns, weak evidence, and geographic mismatch. Return strict JSON only."
                    ),
                },
                {
                    "role": "user",
                    "content": json.dumps(
                        {
                            "query": query,
                            "scoring_scale": "0 means not suitable; 100 means very strong fit for this query",
                            "required_output_schema": [
                                {
                                    "candidate_id": "integer",
                                    "llm_fit_score": "number 0-100",
                                    "llm_score_reason": "one short evidence-grounded sentence",
                                }
                            ],
                            "candidates": candidates,
                        },
                        ensure_ascii=True,
                    ),
                },
            ],
        )
        return response.choices[0].message.content or "[]"

    @staticmethod
    def _parse_response(text: str) -> list[Mapping[str, Any]]:
        cleaned = text.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.strip("`")
            cleaned = cleaned.removeprefix("json").strip()
        data = json.loads(cleaned)
        if isinstance(data, dict):
            data = data.get("scores", data.get("results", []))
        return data if isinstance(data, list) else []

    @staticmethod
    def _candidate_payload(index: int, row: pd.Series) -> dict[str, Any]:
        evidence = row.get("extracted_evidence") or row.get("evidence") or {}
        if isinstance(evidence, str):
            try:
                evidence = json.loads(evidence)
            except json.JSONDecodeError:
                evidence = {"raw": [evidence]}

        capabilities = {
            label: row.get(field)
            for field, label in CAPABILITY_LABELS.items()
        }
        evidence_summary = {}
        if isinstance(evidence, Mapping):
            for key, snippets in evidence.items():
                if isinstance(snippets, list):
                    evidence_summary[key] = [str(item)[:220] for item in snippets[:2]]
                else:
                    evidence_summary[key] = [str(snippets)[:220]]

        return {
            "candidate_id": int(index),
            "name": row.get("name"),
            "state": row.get("state"),
            "district_city": row.get("district_city"),
            "pin_code": row.get("pin_code"),
            "trust_score": row.get("trust_score"),
            "deterministic_rank_score": row.get("_rank_score"),
            "contradiction_flags": row.get("contradiction_flags") or [],
            "capabilities": capabilities,
            "evidence": evidence_summary,
            "scoring_explanation": row.get("explanation"),
        }
