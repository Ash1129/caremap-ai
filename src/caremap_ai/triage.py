"""Symptom triage agent for routing symptoms to facility capabilities.

This agent does not diagnose. It maps patient-described symptoms to the
facility capabilities that should be prioritized when searching.
"""

from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class SymptomTriageResult:
    symptom_categories: list[str]
    urgency: str
    preferred_capabilities: list[str]
    required_capabilities: list[str]
    reasoning: list[str]
    safety_note: str | None = None


SYMPTOM_RULES = [
    {
        "category": "possible_cardiac_emergency",
        "patterns": (
            r"chest pain",
            r"chest tightness",
            r"heart attack",
            r"shortness of breath",
            r"left arm pain",
            r"jaw pain",
        ),
        "urgency": "emergency",
        "preferred": ["availability_24_7", "has_oxygen", "has_icu", "has_ventilator"],
        "required": [],
        "reason": "Chest pain or breathing symptoms should prioritize emergency-ready facilities with oxygen and ICU support.",
    },
    {
        "category": "possible_stroke",
        "patterns": (
            r"stroke",
            r"face droop",
            r"facial droop",
            r"slurred speech",
            r"weakness.*arm",
            r"one side.*weak",
            r"sudden numbness",
        ),
        "urgency": "emergency",
        "preferred": ["availability_24_7", "has_icu", "has_oxygen", "has_ventilator"],
        "required": [],
        "reason": "Possible stroke symptoms should prioritize 24/7 emergency and critical care support.",
    },
    {
        "category": "trauma_or_accident",
        "patterns": (r"accident", r"trauma", r"bleeding", r"fracture", r"head injury", r"road crash"),
        "urgency": "emergency",
        "preferred": [
            "has_trauma_care",
            "has_emergency_surgery",
            "has_anesthesiologist",
            "availability_24_7",
            "has_oxygen",
            "has_icu",
        ],
        "required": [],
        "reason": "Trauma symptoms should prioritize trauma care, surgery readiness, anesthesia, oxygen, and ICU support.",
    },
    {
        "category": "pregnancy_or_delivery_emergency",
        "patterns": (
            r"pregnan",
            r"labor pain",
            r"labour pain",
            r"delivery",
            r"c[- ]?section",
            r"bleeding.*pregnan",
        ),
        "urgency": "emergency",
        "preferred": [
            "has_emergency_surgery",
            "has_anesthesiologist",
            "has_neonatal_care",
            "availability_24_7",
            "has_oxygen",
        ],
        "required": [],
        "reason": "Pregnancy emergencies should prioritize surgical, anesthesia, neonatal, oxygen, and 24/7 support.",
    },
    {
        "category": "kidney_failure_or_dialysis_need",
        "patterns": (r"dialysis", r"kidney failure", r"renal failure", r"missed dialysis", r"high creatinine"),
        "urgency": "urgent",
        "preferred": ["has_dialysis", "availability_24_7", "has_oxygen"],
        "required": [],
        "reason": "Kidney failure or dialysis needs should prioritize dialysis-capable facilities.",
    },
    {
        "category": "newborn_or_neonatal_distress",
        "patterns": (r"newborn", r"neonate", r"baby.*breath", r"infant.*breath", r"nicu", r"premature"),
        "urgency": "emergency",
        "preferred": ["has_neonatal_care", "has_oxygen", "availability_24_7", "has_icu"],
        "required": [],
        "reason": "Newborn distress should prioritize neonatal care, oxygen, and round-the-clock support.",
    },
    {
        "category": "possible_cancer_care",
        "patterns": (r"cancer", r"tumou?r", r"chemotherapy", r"oncology"),
        "urgency": "routine_or_urgent",
        "preferred": ["has_oncology"],
        "required": [],
        "reason": "Cancer-related queries should prioritize oncology-capable facilities.",
    },
]

URGENCY_ORDER = {"routine_or_urgent": 1, "urgent": 2, "emergency": 3}


class SymptomTriageAgent:
    def triage(self, query: str) -> SymptomTriageResult:
        lower = query.lower()
        categories: list[str] = []
        preferred: list[str] = []
        required: list[str] = []
        reasons: list[str] = []
        urgency = "routine_or_urgent"

        for rule in SYMPTOM_RULES:
            if any(re.search(pattern, lower) for pattern in rule["patterns"]):
                categories.append(rule["category"])
                preferred.extend(rule["preferred"])
                required.extend(rule["required"])
                reasons.append(rule["reason"])
                if URGENCY_ORDER[rule["urgency"]] > URGENCY_ORDER[urgency]:
                    urgency = rule["urgency"]

        return SymptomTriageResult(
            symptom_categories=self._dedupe(categories),
            urgency=urgency,
            preferred_capabilities=self._dedupe(preferred),
            required_capabilities=self._dedupe(required),
            reasoning=self._dedupe(reasons),
            safety_note=self._safety_note(urgency) if categories else None,
        )

    @staticmethod
    def _dedupe(values: list[str]) -> list[str]:
        return list(dict.fromkeys(values))

    @staticmethod
    def _safety_note(urgency: str) -> str:
        if urgency == "emergency":
            return (
                "This is not a diagnosis. For emergency symptoms, seek immediate medical help "
                "or contact local emergency services."
            )
        return "This is not a diagnosis. Use results for facility routing, not medical advice."
