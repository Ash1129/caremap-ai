"""Validation agent that reasons over extracted facility claims."""

from __future__ import annotations

from typing import Mapping

from caremap_ai.schema import CAPABILITY_FIELDS


class ValidationAgent:
    def validate(self, extracted: Mapping[str, object]) -> dict[str, object]:
        flags: list[str] = []

        if extracted.get("has_emergency_surgery") is True and extracted.get("has_anesthesiologist") is not True:
            flags.append("surgery_claim_without_anesthesiologist")

        if extracted.get("has_icu") is True and (
            extracted.get("has_oxygen") is not True or extracted.get("has_ventilator") is not True
        ):
            flags.append("icu_claim_without_oxygen_or_ventilator")

        if (
            extracted.get("has_emergency_surgery") is True
            or extracted.get("has_trauma_care") is True
        ) and extracted.get("availability_24_7") is not True:
            flags.append("emergency_claim_without_24_7_availability")

        advanced = [
            "has_icu",
            "has_emergency_surgery",
            "has_dialysis",
            "has_oncology",
            "has_trauma_care",
            "has_neonatal_care",
        ]
        evidence = extracted.get("extracted_evidence") or {}
        for field in advanced:
            if extracted.get(field) is True and not evidence.get(field):
                flags.append(f"{field}_without_supporting_evidence")

        unknown_count = sum(extracted.get(field) is None for field in CAPABILITY_FIELDS)
        if unknown_count >= 6:
            flags.append("too_many_unknown_capabilities")

        confidence = 0.9 - 0.08 * len(flags)
        if unknown_count:
            confidence -= min(0.25, unknown_count * 0.02)

        return {
            "contradiction_flags": flags,
            "validation_confidence": round(max(confidence, 0.25), 2),
        }
