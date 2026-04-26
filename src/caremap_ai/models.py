"""Pydantic models for CareMap AI structured outputs.

These models mirror the Virtue Foundation-style extraction contract: noisy
source data is converted into typed, inspectable objects before it is written
back to Delta tables.
"""

from __future__ import annotations

from typing import Any, Literal

class _SimpleBaseModel:
    """Tiny fallback so local demos still run if pydantic is not installed."""

    def __init__(self, **kwargs: Any):
        fields: dict[str, Any] = {}
        for cls in reversed(self.__class__.mro()):
            fields.update(getattr(cls, "__annotations__", {}))
        for field_name in fields:
            if field_name in kwargs:
                value = kwargs[field_name]
            else:
                default = getattr(self.__class__, field_name, None)
                if isinstance(default, (dict, list, set)):
                    value = default.copy()
                else:
                    value = default
            setattr(self, field_name, value)

    def dict(self) -> dict[str, Any]:
        fields: dict[str, Any] = {}
        for cls in reversed(self.__class__.mro()):
            fields.update(getattr(cls, "__annotations__", {}))
        return {field_name: getattr(self, field_name) for field_name in fields if not field_name.startswith("_")}


try:
    from pydantic import BaseModel, Field, validator
except ImportError:  # pragma: no cover - Databricks/local env should install pydantic.
    BaseModel = _SimpleBaseModel  # type: ignore[misc,assignment]
    Field = None  # type: ignore[assignment]

    def validator(*_args: object, **_kwargs: object):  # type: ignore[no-untyped-def]
        def wrapper(fn):
            return fn

        return wrapper


DoctorAvailability = Literal["full_time", "part_time", "visiting", "unknown"]
UrgencyLevel = Literal["routine_or_urgent", "urgent", "emergency"]


_UNSET = object()


def _field(default: Any = _UNSET, **kwargs: Any) -> Any:
    if Field is None:
        if "default_factory" in kwargs:
            return kwargs["default_factory"]()
        if default is _UNSET:
            return None
        return default
    if default is _UNSET:
        return Field(**kwargs)
    return Field(default, **kwargs)


class CareMapBaseModel(BaseModel):  # type: ignore[misc]
    """Base model with pydantic v1/v2 compatible serialization."""

    def to_dict(self) -> dict[str, Any]:
        if hasattr(self, "model_dump"):
            return self.model_dump()  # type: ignore[attr-defined]
        return self.dict()  # type: ignore[attr-defined]


class FacilityCapability(CareMapBaseModel):
    name: str
    state: str
    district_city: str
    pin_code: str
    latitude: float | None = None
    longitude: float | None = None

    has_icu: bool | None = None
    has_oxygen: bool | None = None
    has_ventilator: bool | None = None
    has_emergency_surgery: bool | None = None
    has_anesthesiologist: bool | None = None
    has_dialysis: bool | None = None
    has_oncology: bool | None = None
    has_trauma_care: bool | None = None
    has_neonatal_care: bool | None = None
    availability_24_7: bool | None = None
    doctor_availability: DoctorAvailability = "unknown"

    extracted_evidence: dict[str, list[str]] = _field(default_factory=dict)
    extraction_confidence: float = 0.0

    @validator("extraction_confidence")
    def confidence_between_zero_and_one(cls, value: float) -> float:
        return max(0.0, min(1.0, float(value)))


class ValidationResult(CareMapBaseModel):
    contradiction_flags: list[str] = _field(default_factory=list)
    validation_confidence: float = 0.0

    @validator("validation_confidence")
    def validation_confidence_between_zero_and_one(cls, value: float) -> float:
        return max(0.0, min(1.0, float(value)))


class TrustScoreResult(CareMapBaseModel):
    trust_score: int
    confidence_score: float
    explanation: str

    @validator("trust_score")
    def trust_score_between_zero_and_hundred(cls, value: int) -> int:
        return max(0, min(100, int(value)))

    @validator("confidence_score")
    def confidence_score_between_zero_and_one(cls, value: float) -> float:
        return max(0.0, min(1.0, float(value)))


class FacilityAgentResult(FacilityCapability, ValidationResult, TrustScoreResult):
    """Complete row-level agent output."""


class SymptomTriageModel(CareMapBaseModel):
    symptom_categories: list[str] = _field(default_factory=list)
    urgency: UrgencyLevel = "routine_or_urgent"
    preferred_capabilities: list[str] = _field(default_factory=list)
    required_capabilities: list[str] = _field(default_factory=list)
    reasoning: list[str] = _field(default_factory=list)
    safety_note: str | None = None


class RankedFacility(CareMapBaseModel):
    name: str | None = None
    state: str | None = None
    district_city: str | None = None
    pin_code: str | None = None
    trust_score: int = 0
    rank_score: float = 0.0
    contradiction_flags: list[str] = _field(default_factory=list)
    evidence: dict[str, Any] = _field(default_factory=dict)
    explanation: str = ""
    symptom_triage: dict[str, Any] = _field(default_factory=dict)


class QueryResult(CareMapBaseModel):
    query: str
    intent: dict[str, Any]
    ranked_facilities: list[RankedFacility] = _field(default_factory=list)
    reasoning_steps: list[str] = _field(default_factory=list)


class MedicalDesertRegion(CareMapBaseModel):
    state: str | None = None
    district_city: str | None = None
    pin_code: str | None = None
    facility_count: int
    trusted_facility_count: int
    missing_services: list[str] = _field(default_factory=list)
    risk_level: Literal["low", "medium", "high"]
