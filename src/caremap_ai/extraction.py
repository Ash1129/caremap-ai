"""Extraction agent for noisy Indian healthcare facility records."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Callable, Mapping

from caremap_ai.schema import CAPABILITY_FIELDS, TEXT_COLUMNS
from caremap_ai.utils import clean_text, combined_text, row_get, to_float

LLMCallable = Callable[[str, Mapping[str, object]], Mapping[str, object]]


@dataclass(frozen=True)
class PatternSpec:
    positive: tuple[str, ...]
    negative: tuple[str, ...] = ()


PATTERNS: dict[str, PatternSpec] = {
    "has_icu": PatternSpec(
        positive=(r"\bicu\b", r"intensive care", r"critical care", r"high dependency unit", r"\bhdu\b"),
        negative=(r"no icu", r"without icu", r"icu not available"),
    ),
    "has_oxygen": PatternSpec(
        positive=(r"oxygen", r"\bo2\b", r"oxygen concentrator", r"oxygen cylinder", r"oxygen plant"),
        negative=(r"no oxygen", r"without oxygen"),
    ),
    "has_ventilator": PatternSpec(
        positive=(r"ventilator", r"ventilation support", r"mechanical ventilation"),
        negative=(r"no ventilator", r"without ventilator"),
    ),
    "has_emergency_surgery": PatternSpec(
        positive=(
            r"emergency surg",
            r"appendectomy",
            r"laparotomy",
            r"cesarean",
            r"c-section",
            r"operation theatre",
            r"\bot\b",
            r"surgical emergency",
        ),
        negative=(r"no surgery", r"minor procedure only", r"without operation theatre"),
    ),
    "has_anesthesiologist": PatternSpec(
        positive=(r"anaesthe", r"anesthe", r"anaesthesia", r"anesthesia"),
        negative=(r"no anaesthe", r"no anesthe", r"without anaesthe", r"without anesthe"),
    ),
    "has_dialysis": PatternSpec(
        positive=(r"dialysis", r"hemodialysis", r"haemodialysis", r"renal replacement"),
        negative=(r"no dialysis", r"without dialysis"),
    ),
    "has_oncology": PatternSpec(
        positive=(r"oncology", r"cancer care", r"chemotherapy", r"radiotherapy"),
        negative=(r"no oncology", r"without oncology", r"no cancer"),
    ),
    "has_trauma_care": PatternSpec(
        positive=(r"trauma", r"accident", r"polytrauma", r"fracture emergency"),
        negative=(r"no trauma", r"without trauma"),
    ),
    "has_neonatal_care": PatternSpec(
        positive=(r"nicu", r"neonatal", r"newborn", r"special newborn care", r"\bsncu\b"),
        negative=(r"no nicu", r"without neonatal", r"no neonatal"),
    ),
    "availability_24_7": PatternSpec(
        positive=(r"24\s*/\s*7", r"24x7", r"round the clock", r"24 hours", r"emergency.*always"),
        negative=(r"not 24", r"day time only", r"limited hours", r"opd hours only"),
    ),
}

DOCTOR_PATTERNS = {
    "full_time": (r"full[- ]time doctor", r"resident doctor", r"doctors available 24", r"full time"),
    "part_time": (r"part[- ]time doctor", r"part time"),
    "visiting": (r"visiting consultant", r"visiting doctor", r"on call"),
}


class ExtractionAgent:
    """Rule-first extractor with optional LLM repair for ambiguous cases."""

    def __init__(self, llm: LLMCallable | None = None, ambiguity_threshold: int = 2):
        self.llm = llm
        self.ambiguity_threshold = ambiguity_threshold

    def extract(self, row: Mapping[str, object]) -> dict[str, object]:
        text = combined_text(row, TEXT_COLUMNS)
        lower_text = text.lower()
        result: dict[str, object] = {
            "name": clean_text(row_get(row, "name")),
            "state": clean_text(row_get(row, "address_stateOrRegion")),
            "district_city": clean_text(row_get(row, "address_city")),
            "pin_code": clean_text(row_get(row, "address_zipOrPostcode")),
            "latitude": to_float(row_get(row, "latitude")),
            "longitude": to_float(row_get(row, "longitude")),
            "extracted_evidence": {},
            "extraction_confidence": 0.0,
        }

        evidence: dict[str, list[str]] = {}
        unknown_count = 0
        for field, spec in PATTERNS.items():
            is_negative, negative_snippets = self._match_any(lower_text, text, spec.negative)
            is_positive, positive_snippets = self._match_any(lower_text, text, spec.positive)
            if is_negative:
                result[field] = False
                evidence[field] = negative_snippets
            elif is_positive:
                result[field] = True
                evidence[field] = positive_snippets
            else:
                result[field] = None
                unknown_count += 1

        result["doctor_availability"] = self._doctor_availability(lower_text)
        if result["doctor_availability"] != "unknown":
            evidence["doctor_availability"] = [result["doctor_availability"]]

        confidence = self._confidence(result, evidence)
        result["extracted_evidence"] = evidence
        result["extraction_confidence"] = confidence

        if self.llm and unknown_count <= self.ambiguity_threshold:
            result = self._llm_repair(row, result)

        return result

    def _llm_repair(self, row: Mapping[str, object], result: dict[str, object]) -> dict[str, object]:
        prompt = (
            "Extract healthcare capabilities from noisy Indian facility text. "
            "Return strict JSON with booleans/null for capability fields, "
            "doctor_availability, exact evidence snippets, and confidence. "
            "Do not infer a capability without supporting text."
        )
        llm_result = dict(self.llm(prompt, row))
        for field in CAPABILITY_FIELDS:
            if result.get(field) is None and field in llm_result:
                result[field] = llm_result[field]
        if "doctor_availability" in llm_result and result.get("doctor_availability") == "unknown":
            result["doctor_availability"] = llm_result["doctor_availability"]
        if isinstance(llm_result.get("extracted_evidence"), dict):
            merged = dict(result.get("extracted_evidence") or {})
            merged.update(llm_result["extracted_evidence"])
            result["extracted_evidence"] = merged
        if "extraction_confidence" in llm_result:
            result["extraction_confidence"] = max(
                float(result.get("extraction_confidence") or 0),
                float(llm_result["extraction_confidence"]),
            )
        return result

    @staticmethod
    def _match_any(lower_text: str, original_text: str, patterns: tuple[str, ...]) -> tuple[bool, list[str]]:
        snippets: list[str] = []
        for pattern in patterns:
            match = re.search(pattern, lower_text, flags=re.IGNORECASE)
            if match:
                start = max(match.start() - 50, 0)
                end = min(match.end() + 80, len(original_text))
                snippets.append(clean_text(original_text[start:end]))
        return bool(snippets), snippets[:3]

    @staticmethod
    def _doctor_availability(lower_text: str) -> str:
        for label, patterns in DOCTOR_PATTERNS.items():
            if any(re.search(pattern, lower_text, flags=re.IGNORECASE) for pattern in patterns):
                return label
        return "unknown"

    @staticmethod
    def _confidence(result: Mapping[str, object], evidence: Mapping[str, list[str]]) -> float:
        known = sum(result.get(field) is not None for field in CAPABILITY_FIELDS)
        evidence_fields = len([field for field, snippets in evidence.items() if snippets])
        base = 0.35 + 0.04 * known + 0.03 * evidence_fields
        return round(min(base, 0.95), 2)


def databricks_agent_bricks_extractor(endpoint_name: str) -> LLMCallable:
    """Build an LLM callback for Databricks Model Serving / Agent Bricks.

    In Databricks, configure `endpoint_name` to an Agent Bricks Information
    Extraction or Foundation Model endpoint. The local demo leaves this unset.
    """

    def call_endpoint(prompt: str, row: Mapping[str, object]) -> Mapping[str, object]:
        from databricks.sdk import WorkspaceClient

        client = WorkspaceClient()
        text = combined_text(row, TEXT_COLUMNS)
        response = client.serving_endpoints.query(
            name=endpoint_name,
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": text},
            ],
            max_tokens=800,
        )
        content = response.choices[0].message.content
        return json.loads(content)

    return call_endpoint
