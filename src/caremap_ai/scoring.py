"""Trust scoring agent for healthcare facility claims."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Mapping

from caremap_ai.schema import CAPABILITY_FIELDS
from caremap_ai.utils import to_float, to_int


class TrustScoringAgent:
    def score(self, row: Mapping[str, object], extracted: Mapping[str, object], validation: Mapping[str, object]) -> dict[str, object]:
        score = 55
        reasons: list[str] = [
            "Base score 55 because facility claims are treated as noisy until supported by evidence."
        ]
        evidence = extracted.get("extracted_evidence") or {}
        evidence_source_count = len([k for k, v in evidence.items() if v])
        flags = set(validation.get("contradiction_flags") or [])
        unknown_count = sum(extracted.get(field) is None for field in CAPABILITY_FIELDS)

        if extracted.get("has_icu") and extracted.get("has_oxygen"):
            score += 10
            reasons.append("+10 ICU claim has oxygen evidence.")

        if extracted.get("has_icu") and extracted.get("has_oxygen") and extracted.get("has_ventilator"):
            score += 6
            reasons.append("+6 ICU claim also has ventilator support.")

        if (
            extracted.get("has_emergency_surgery")
            and extracted.get("has_anesthesiologist")
            and extracted.get("availability_24_7")
        ):
            score += 15
            reasons.append("+15 surgery claim is supported by anesthesiology and 24/7 availability.")

        if extracted.get("availability_24_7"):
            score += 8
            reasons.append("+8 round-the-clock availability found.")

        if evidence_source_count >= 3:
            score += 5
            reasons.append("+5 multiple independent capability evidence snippets found.")

        if "surgery_claim_without_anesthesiologist" in flags:
            score -= 25
            reasons.append("-25 surgery claim lacks anesthesiologist support.")

        if "icu_claim_without_oxygen_or_ventilator" in flags:
            score -= 25
            reasons.append("-25 ICU claim lacks oxygen or ventilator support.")

        if "emergency_claim_without_24_7_availability" in flags:
            score -= 15
            reasons.append("-15 emergency capability lacks 24/7 evidence.")

        unsupported_advanced = [flag for flag in flags if flag.endswith("_without_supporting_evidence")]
        if unsupported_advanced:
            penalty = min(18, 6 * len(unsupported_advanced))
            score -= penalty
            reasons.append(f"-{penalty} advanced claims lack supporting evidence.")

        if unknown_count >= 8:
            score -= 18
            reasons.append("-18 most capability fields remain unknown.")
        elif unknown_count >= 6:
            score -= 12
            reasons.append("-12 many capability fields remain unknown.")
        elif unknown_count >= 4:
            score -= 6
            reasons.append("-6 several capability fields remain unknown.")

        score, metric_reasons = self._enhance_with_operational_metrics(score, row)
        reasons.extend(metric_reasons)

        score, gate_reasons = self._apply_evidence_gates(
            score=score,
            extracted=extracted,
            validation=validation,
            evidence_source_count=evidence_source_count,
            unknown_count=unknown_count,
        )
        reasons.extend(gate_reasons)

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
    def _apply_evidence_gates(
        score: float,
        extracted: Mapping[str, object],
        validation: Mapping[str, object],
        evidence_source_count: int,
        unknown_count: int,
    ) -> tuple[float, list[str]]:
        """Cap trust when evidence quality does not justify a high score."""

        reasons: list[str] = []
        flags = set(validation.get("contradiction_flags") or [])
        severe_flags = {
            "surgery_claim_without_anesthesiologist",
            "icu_claim_without_oxygen_or_ventilator",
            "emergency_claim_without_24_7_availability",
        }
        advanced_capabilities = [
            "has_icu",
            "has_emergency_surgery",
            "has_dialysis",
            "has_oncology",
            "has_trauma_care",
            "has_neonatal_care",
        ]
        critical_capability_count = sum(extracted.get(field) is True for field in advanced_capabilities)

        if flags & severe_flags and score > 69:
            score = 69
            reasons.append("Score capped at 69 because severe contradiction flags are present.")

        if "too_many_unknown_capabilities" in flags and score > 72:
            score = 72
            reasons.append("Score capped at 72 because too many capability fields are unknown.")

        if evidence_source_count < 2 and score > 64:
            score = 64
            reasons.append("Score capped at 64 because fewer than two evidence-backed capability fields were found.")

        if critical_capability_count == 0 and score > 62:
            score = 62
            reasons.append("Score capped at 62 because no critical clinical capability was evidenced.")

        extraction_conf = float(extracted.get("extraction_confidence") or 0.0)
        validation_conf = float(validation.get("validation_confidence") or 0.0)
        if (extraction_conf < 0.55 or validation_conf < 0.55 or unknown_count >= 8) and score > 70:
            score = 70
            reasons.append("Score capped at 70 because extraction/validation confidence is limited.")

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
