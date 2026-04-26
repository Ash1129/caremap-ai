"""Natural language query agent with local and Databricks retrieval hooks."""

from __future__ import annotations

import re
import json
from dataclasses import dataclass
from typing import Any

import pandas as pd

from caremap_ai.models import QueryResult, RankedFacility
from caremap_ai.triage import SymptomTriageAgent, SymptomTriageResult
from caremap_ai.utils import haversine_km, to_float


QUERY_CAPABILITY_PATTERNS = {
    "has_icu": (r"\bicu\b", r"critical care"),
    "has_oxygen": (r"oxygen", r"\bo2\b"),
    "has_ventilator": (r"ventilator",),
    "has_emergency_surgery": (r"emergency surgery", r"appendectomy", r"surgery", r"operation"),
    "has_anesthesiologist": (r"anesthe", r"anaesthe"),
    "has_dialysis": (r"dialysis", r"renal"),
    "has_oncology": (r"oncology", r"cancer", r"chemotherapy"),
    "has_trauma_care": (r"trauma", r"accident"),
    "has_neonatal_care": (r"neonatal", r"nicu", r"newborn"),
    "availability_24_7": (r"24\s*/\s*7", r"24x7", r"round the clock", r"emergency"),
}

INDIAN_STATES = [
    "andhra pradesh",
    "arunachal pradesh",
    "assam",
    "bihar",
    "chhattisgarh",
    "goa",
    "gujarat",
    "haryana",
    "himachal pradesh",
    "jharkhand",
    "karnataka",
    "kerala",
    "madhya pradesh",
    "maharashtra",
    "manipur",
    "meghalaya",
    "mizoram",
    "nagaland",
    "odisha",
    "punjab",
    "rajasthan",
    "sikkim",
    "tamil nadu",
    "telangana",
    "tripura",
    "uttar pradesh",
    "uttarakhand",
    "west bengal",
    "delhi",
    "jammu and kashmir",
    "ladakh",
]


@dataclass
class ParsedIntent:
    capabilities: list[str]
    preferred_capabilities: list[str]
    symptom_categories: list[str]
    urgency: str
    safety_note: str | None = None
    state: str | None = None
    city: str | None = None
    latitude: float | None = None
    longitude: float | None = None


class QueryAgent:
    def __init__(self, facilities: pd.DataFrame, symptom_triage_agent: SymptomTriageAgent | None = None):
        self.facilities = facilities.copy()
        self.symptom_triage_agent = symptom_triage_agent or SymptomTriageAgent()

    def parse_intent(self, query: str) -> ParsedIntent:
        lower = query.lower()
        explicit_capabilities = [
            field
            for field, patterns in QUERY_CAPABILITY_PATTERNS.items()
            if any(re.search(pattern, lower) for pattern in patterns)
        ]
        triage = self.symptom_triage_agent.triage(query)
        capabilities = self._dedupe(explicit_capabilities + triage.required_capabilities)
        preferred_capabilities = self._dedupe(triage.preferred_capabilities)
        state = next((s for s in INDIAN_STATES if re.search(rf"\b{re.escape(s)}\b", lower)), None)
        lat_lon = re.search(r"(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)", query)
        latitude = longitude = None
        if lat_lon:
            latitude = float(lat_lon.group(1))
            longitude = float(lat_lon.group(2))
        return ParsedIntent(
            capabilities=capabilities,
            preferred_capabilities=preferred_capabilities,
            symptom_categories=triage.symptom_categories,
            urgency=triage.urgency,
            safety_note=triage.safety_note,
            state=state.title() if state else None,
            latitude=latitude,
            longitude=longitude,
        )

    def answer(self, query: str, top_k: int = 5) -> dict[str, Any]:
        intent = self.parse_intent(query)
        candidates = self.facilities.copy()

        if intent.state and "state" in candidates:
            candidates = candidates[candidates["state"].str.lower() == intent.state.lower()]

        for capability in intent.capabilities:
            if capability in candidates:
                candidates = candidates[candidates[capability].fillna(False) == True]

        if candidates.empty:
            return QueryResult(
                query=query,
                intent=intent.__dict__,
                ranked_facilities=[],
                reasoning_steps=[
                    "Parsed required clinical capabilities.",
                    self._triage_reasoning_step(intent),
                    "No facilities satisfied all deterministic filters.",
                ],
            ).to_dict()

        candidates = candidates.assign(_rank_score=candidates.apply(lambda r: self._rank_row(r, intent), axis=1))
        ranked = candidates.sort_values("_rank_score", ascending=False).head(top_k)

        rows = []
        for _, row in ranked.iterrows():
            evidence = row.get("extracted_evidence", {})
            if isinstance(evidence, str):
                try:
                    evidence = json.loads(evidence)
                except json.JSONDecodeError:
                    evidence = {"raw": [evidence]}
            rows.append(
                RankedFacility(
                    name=row.get("name"),
                    state=row.get("state"),
                    district_city=row.get("district_city"),
                    pin_code=row.get("pin_code"),
                    trust_score=int(row.get("trust_score", 0)),
                    rank_score=round(float(row.get("_rank_score", 0)), 2),
                    contradiction_flags=row.get("contradiction_flags", []),
                    evidence=evidence,
                    explanation=row.get("explanation", ""),
                    symptom_triage={
                        "categories": intent.symptom_categories,
                        "urgency": intent.urgency,
                        "preferred_capabilities": intent.preferred_capabilities,
                        "safety_note": intent.safety_note,
                    },
                ).to_dict()
            )

        return QueryResult(
            query=query,
            intent=intent.__dict__,
            ranked_facilities=rows,
            reasoning_steps=[
                "Parsed intent into required capabilities and geography.",
                self._triage_reasoning_step(intent),
                "Retrieved and filtered candidates using extracted structured capabilities.",
                "Ranked by trust score, explicit capability coverage, symptom-triage capability coverage, distance when available, and contradiction penalties.",
            ],
        ).to_dict()

    @staticmethod
    def _rank_row(row: pd.Series, intent: ParsedIntent) -> float:
        trust = float(row.get("trust_score") or 0)
        match_bonus = 6 * sum(bool(row.get(field)) for field in intent.capabilities)
        triage_bonus = 4 * sum(bool(row.get(field)) for field in intent.preferred_capabilities)
        contradictions = row.get("contradiction_flags") or []
        contradiction_penalty = 8 * len(contradictions)
        distance_penalty = 0.0
        if intent.latitude is not None and intent.longitude is not None:
            lat = to_float(row.get("latitude"))
            lon = to_float(row.get("longitude"))
            if lat is not None and lon is not None:
                distance_penalty = min(30.0, haversine_km(intent.latitude, intent.longitude, lat, lon) / 15.0)
        return trust + match_bonus + triage_bonus - contradiction_penalty - distance_penalty

    @staticmethod
    def _dedupe(values: list[str]) -> list[str]:
        return list(dict.fromkeys(values))

    @staticmethod
    def _triage_reasoning_step(intent: ParsedIntent) -> str:
        if not intent.symptom_categories:
            return "No symptom-only triage category was detected; using explicit capability matching."
        return (
            "Symptom Triage Agent mapped symptoms to "
            f"{intent.symptom_categories} with urgency '{intent.urgency}' and preferred capabilities "
            f"{intent.preferred_capabilities}. {intent.safety_note}"
        )
