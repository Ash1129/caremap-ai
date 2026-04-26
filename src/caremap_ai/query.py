"""Natural language query agent with semantic retrieval and soft capability scoring."""

from __future__ import annotations

import re
import json
import logging
from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd

from caremap_ai.models import QueryResult, RankedFacility
from caremap_ai.triage import SymptomTriageAgent, SymptomTriageResult
from caremap_ai.utils import haversine_km, to_float

logger = logging.getLogger(__name__)


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
    pin_code: str | None = None
    latitude: float | None = None
    longitude: float | None = None


class QueryAgent:
    def __init__(
        self,
        facilities: pd.DataFrame,
        symptom_triage_agent: SymptomTriageAgent | None = None,
        semantic_retriever=None,
    ):
        self.facilities = facilities.copy()
        self.symptom_triage_agent = symptom_triage_agent or SymptomTriageAgent()
        self.semantic_retriever = semantic_retriever

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
        self._infer_location_from_facilities(query, intent, candidates)
        candidates, location_filter_note = self._apply_location_filter(candidates, intent)

        retrieval_note: str
        if self.semantic_retriever is not None:
            try:
                scored_facilities = self.facilities.copy()
                scored_facilities["_semantic_score"] = self.semantic_retriever.scores_for_query(query)[: len(scored_facilities)]
                candidates = candidates.join(scored_facilities["_semantic_score"], how="left")
                candidates["_semantic_score"] = candidates["_semantic_score"].fillna(0.0)
                retrieval_note = (
                    f"Semantic retriever scored {len(self.facilities)} facilities; "
                    f"ranking used {len(candidates)} location-aware candidates."
                )
            except Exception as exc:
                logger.warning("Semantic retriever failed (%s); falling back to TF-IDF.", exc)
                candidates["_semantic_score"] = self._tfidf_scores(query, candidates)
                retrieval_note = "Semantic retrieval failed; used TF-IDF fallback."
        else:
            candidates["_semantic_score"] = self._tfidf_scores(query, candidates)
            retrieval_note = "No semantic retriever configured; used TF-IDF for retrieval scores."

        # Soft geography signal: apply a state match bonus rather than a hard filter
        if intent.state and "state" in candidates.columns:
            state_match = candidates["state"].fillna("").astype(str).str.lower() == intent.state.lower()
            candidates["_state_bonus"] = state_match.astype(float) * 15.0
        else:
            candidates["_state_bonus"] = 0.0

        if intent.city and "district_city" in candidates.columns:
            city_match = candidates["district_city"].fillna("").astype(str).str.lower() == intent.city.lower()
            candidates["_city_bonus"] = city_match.astype(float) * 35.0
        else:
            candidates["_city_bonus"] = 0.0

        if intent.pin_code and "pin_code" in candidates.columns:
            pin_match = candidates["pin_code"].fillna("").astype(str).str.lower() == intent.pin_code.lower()
            candidates["_pin_bonus"] = pin_match.astype(float) * 45.0
        else:
            candidates["_pin_bonus"] = 0.0

        candidates = candidates.assign(
            _rank_score=candidates.apply(lambda r: self._rank_row(r, intent), axis=1)
        )
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

        cap_note = (
            f"Capabilities {intent.capabilities} used as soft scoring signals (not hard filters); "
            "facilities missing some capabilities are still surfaced with lower scores."
        ) if intent.capabilities else "No specific capabilities detected from query."

        return QueryResult(
            query=query,
            intent=intent.__dict__,
            ranked_facilities=rows,
            reasoning_steps=[
                "Parsed intent into capabilities and geography.",
                self._location_reasoning_step(intent),
                location_filter_note,
                self._triage_reasoning_step(intent),
                retrieval_note,
                cap_note,
                "Final rank = trust score + semantic similarity + capability/triage bonuses + local geography bonuses − contradiction penalty − distance penalty.",
            ],
        ).to_dict()

    @staticmethod
    def _rank_row(row: pd.Series, intent: ParsedIntent) -> float:
        trust = float(row.get("trust_score") or 0)
        # Capability match: bonus per matched capability (soft — missing ones just score 0)
        match_bonus = 6.0 * sum(bool(row.get(field)) for field in intent.capabilities)
        triage_bonus = 4.0 * sum(bool(row.get(field)) for field in intent.preferred_capabilities)
        # Semantic similarity scaled to the same range as trust (0–100)
        semantic_score = float(row.get("_semantic_score") or 0.0) * 40.0
        # Geography
        state_bonus = float(row.get("_state_bonus") or 0.0)
        city_bonus = float(row.get("_city_bonus") or 0.0)
        pin_bonus = float(row.get("_pin_bonus") or 0.0)
        contradictions = row.get("contradiction_flags") or []
        contradiction_penalty = 8.0 * len(contradictions)
        distance_penalty = 0.0
        if intent.latitude is not None and intent.longitude is not None:
            lat = to_float(row.get("latitude"))
            lon = to_float(row.get("longitude"))
            if lat is not None and lon is not None:
                distance_penalty = min(30.0, haversine_km(intent.latitude, intent.longitude, lat, lon) / 15.0)
        return (
            trust
            + semantic_score
            + match_bonus
            + triage_bonus
            + state_bonus
            + city_bonus
            + pin_bonus
            - contradiction_penalty
            - distance_penalty
        )

    @staticmethod
    def _clean_text_series(df: pd.DataFrame, column: str) -> pd.Series:
        if column not in df.columns:
            return pd.Series([""] * len(df), index=df.index)
        return df[column].fillna("").astype(str).str.strip()

    def _infer_location_from_facilities(self, query: str, intent: ParsedIntent, df: pd.DataFrame) -> None:
        """Map place names in the query to facility city/PIN metadata.

        The agent only receives text, not a geocoder. This method uses the
        already-governed facility table as a lightweight gazetteer so queries
        like "chest pain in Thrissur" can still receive geography-aware ranking.
        """

        lower = query.lower()
        pin_match = re.search(r"\b\d{6}\b", query)
        if pin_match:
            intent.pin_code = pin_match.group(0)

        city_series = self._clean_text_series(df, "district_city")
        state_series = self._clean_text_series(df, "state")
        pin_series = self._clean_text_series(df, "pin_code")

        if intent.pin_code:
            pin_rows = df[pin_series == intent.pin_code]
            if not pin_rows.empty:
                if not intent.city and "district_city" in pin_rows.columns:
                    intent.city = str(pin_rows["district_city"].dropna().astype(str).mode().iloc[0])
                if not intent.state and "state" in pin_rows.columns:
                    intent.state = str(pin_rows["state"].dropna().astype(str).mode().iloc[0])

        if not intent.city and "district_city" in df.columns:
            cities = [
                city
                for city in city_series.dropna().unique().tolist()
                if len(city) >= 3 and city.lower() not in {"unknown", "nan", "none"}
            ]
            for city in sorted(cities, key=len, reverse=True):
                if re.search(rf"(?<!\w){re.escape(city.lower())}(?!\w)", lower):
                    intent.city = city
                    city_rows = df[city_series.str.lower() == city.lower()]
                    if not intent.state and not city_rows.empty and "state" in city_rows.columns:
                        states = city_rows["state"].dropna().astype(str)
                        if not states.empty:
                            intent.state = str(states.mode().iloc[0])
                    break

        geo_rows = pd.DataFrame()
        if intent.pin_code:
            geo_rows = df[pin_series == intent.pin_code]
        if geo_rows.empty and intent.city:
            geo_rows = df[city_series.str.lower() == intent.city.lower()]
            if intent.state and not geo_rows.empty:
                same_state = geo_rows[state_series.loc[geo_rows.index].str.lower() == intent.state.lower()]
                if not same_state.empty:
                    geo_rows = same_state

        if (intent.latitude is None or intent.longitude is None) and not geo_rows.empty:
            latitudes = geo_rows["latitude"].map(to_float).dropna() if "latitude" in geo_rows.columns else pd.Series(dtype=float)
            longitudes = geo_rows["longitude"].map(to_float).dropna() if "longitude" in geo_rows.columns else pd.Series(dtype=float)
            if not latitudes.empty and not longitudes.empty:
                intent.latitude = float(latitudes.median())
                intent.longitude = float(longitudes.median())

    def _apply_location_filter(self, df: pd.DataFrame, intent: ParsedIntent) -> tuple[pd.DataFrame, str]:
        """Constrain search to explicit user geography when matching rows exist."""

        if intent.pin_code and "pin_code" in df.columns:
            pin_series = self._clean_text_series(df, "pin_code")
            matches = df[pin_series == intent.pin_code]
            if not matches.empty:
                return matches.copy(), f"Applied PIN filter: kept {len(matches)} facilities in {intent.pin_code}."

        if intent.city and "district_city" in df.columns:
            city_series = self._clean_text_series(df, "district_city")
            matches = df[city_series.str.lower() == intent.city.lower()]
            if intent.state and not matches.empty and "state" in matches.columns:
                state_series = self._clean_text_series(matches, "state")
                state_matches = matches[state_series.str.lower() == intent.state.lower()]
                if not state_matches.empty:
                    matches = state_matches
            if not matches.empty:
                return matches.copy(), f"Applied city filter: kept {len(matches)} facilities in {intent.city}."

        if intent.state and "state" in df.columns:
            state_series = self._clean_text_series(df, "state")
            matches = df[state_series.str.lower() == intent.state.lower()]
            if not matches.empty:
                return matches.copy(), f"Applied state filter: kept {len(matches)} facilities in {intent.state}."

        return df.copy(), "No location filter was applied; ranking used all facilities."

    @staticmethod
    def _tfidf_scores(query: str, df: pd.DataFrame) -> np.ndarray:
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.metrics.pairwise import cosine_similarity as cos_sim

        corpus = df["embedding_text"].fillna("").tolist()
        if not any(corpus):
            return np.zeros(len(corpus))
        vectorizer = TfidfVectorizer(stop_words="english")
        matrix = vectorizer.fit_transform(corpus + [query])
        scores = cos_sim(matrix[-1], matrix[:-1]).flatten()
        return scores

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

    @staticmethod
    def _location_reasoning_step(intent: ParsedIntent) -> str:
        parts = []
        if intent.city:
            parts.append(f"city={intent.city}")
        if intent.state:
            parts.append(f"state={intent.state}")
        if intent.pin_code:
            parts.append(f"PIN={intent.pin_code}")
        if intent.latitude is not None and intent.longitude is not None:
            parts.append(f"distance origin=({intent.latitude:.4f}, {intent.longitude:.4f})")
        if not parts:
            return "No city, state, PIN, or coordinate location was detected; distance was not applied."
        return "Location inference: " + ", ".join(parts) + "."
