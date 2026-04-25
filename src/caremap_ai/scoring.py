"""Trust scoring agent for healthcare facility claims."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Mapping

from caremap_ai.schema import CAPABILITY_FIELDS
from caremap_ai.utils import to_float, to_int


class TrustScoringAgent:
    def score(self, row: Mapping[str, object], extracted: Mapping[str, object], validation: Mapping[str, object]) -> dict[str, object]:
        score = 70
        reasons: list[str] = ["Base score 70 for listed healthcare facility."]

        if extracted.get("has_icu") and extracted.get("has_oxygen"):
            score += 10
            reasons.append("+10 ICU claim has oxygen evidence.")

        if extracted.get("has_emergency_surgery") and extracted.get("has_anesthesiologist"):
            score += 15
            reasons.append("+15 surgery claim is supported by anesthesiology availability.")

        if extracted.get("availability_24_7"):
            score += 10
            reasons.append("+10 round-the-clock availability found.")

        evidence = extracted.get("extracted_evidence") or {}
        evidence_source_count = len([k for k, v in evidence.items() if v])
        if evidence_source_count >= 3:
            score += 5
            reasons.append("+5 multiple independent capability evidence snippets found.")

        flags = set(validation.get("contradiction_flags") or [])
        if "surgery_claim_without_anesthesiologist" in flags:
            score -= 25
            reasons.append("-25 surgery claim lacks anesthesiologist support.")

        if "icu_claim_without_oxygen_or_ventilator" in flags:
            score -= 25
            reasons.append("-25 ICU claim lacks oxygen or ventilator support.")

        if "emergency_claim_without_24_7_availability" in flags:
            score -= 15
            reasons.append("-15 emergency capability lacks 24/7 evidence.")

        unknown_count = sum(extracted.get(field) is None for field in CAPABILITY_FIELDS)
        if unknown_count >= 5:
            score -= 10
            reasons.append("-10 many capability fields remain unknown.")

        score, metric_reasons = self._enhance_with_operational_metrics(score, row)
        reasons.extend(metric_reasons)

        score = int(max(0, min(100, score)))
        confidence = self._confidence(extracted, validation, evidence_source_count)
        return {
            "trust_score": score,
            "confidence_score": confidence,
            "explanation": " ".join(reasons),
        }

    @staticmethod
    def _enhance_with_operational_metrics(score: float, row: Mapping[str, object]) -> tuple[float, list[str]]:
        reasons: list[str] = []
        doctors = to_int(row.get("numberDoctors"), 0)
        capacity = to_int(row.get("capacity"), 0)
        social_count = to_int(row.get("distinct_social_media_presence_count"), 0)
        facts = to_int(row.get("number_of_facts_about_the_organization"), 0)
        recency_days = to_float(row.get("recency_of_page_update"))

        if doctors >= 10:
            score += 5
            reasons.append("+5 doctor count indicates operational depth.")
        elif doctors == 0:
            score -= 4
            reasons.append("-4 doctor count missing or zero.")

        if capacity >= 50:
            score += 4
            reasons.append("+4 bed capacity supports scale.")
        elif capacity == 0:
            score -= 3
            reasons.append("-3 capacity missing or zero.")

        if recency_days is not None:
            if recency_days <= 365:
                score += 4
                reasons.append("+4 page updated within the last year.")
            elif recency_days > 1095:
                score -= 6
                reasons.append("-6 page appears stale by recency metric.")

        if social_count >= 2:
            score += 2
            reasons.append("+2 multiple social channels present.")

        if facts >= 5:
            score += 2
            reasons.append("+2 organization has several structured facts.")

        return score, reasons

    @staticmethod
    def _confidence(
        extracted: Mapping[str, object],
        validation: Mapping[str, object],
        evidence_source_count: int,
    ) -> float:
        extraction_conf = float(extracted.get("extraction_confidence") or 0.0)
        validation_conf = float(validation.get("validation_confidence") or 0.0)
        evidence_boost = min(0.15, evidence_source_count * 0.03)
        return round(min(0.98, 0.45 * extraction_conf + 0.45 * validation_conf + evidence_boost), 2)
