import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from caremap_ai.orchestrator import CareMapAgentPipeline
from caremap_ai.models import FacilityCapability
from caremap_ai.query import QueryAgent
from caremap_ai.triage import SymptomTriageAgent


def test_pipeline_flags_surgery_without_anesthesiologist():
    row = {
        "name": "Test Hospital",
        "address_stateOrRegion": "Bihar",
        "address_city": "Test City",
        "address_zipOrPostcode": "800001",
        "description": "Emergency surgery and operation theatre. Oxygen available. OPD hours only.",
        "specialties": "General surgery",
        "procedure": "Appendectomy",
        "equipment": "Oxygen cylinder",
        "capability": "Emergency care",
        "numberDoctors": 3,
        "capacity": 20,
    }
    result = CareMapAgentPipeline().run_row(row)
    assert result["has_emergency_surgery"] is True
    assert "surgery_claim_without_anesthesiologist" in result["contradiction_flags"]
    assert result["trust_score"] < 70


def test_symptom_triage_maps_chest_pain_to_emergency_support():
    result = SymptomTriageAgent().triage("I have chest pain and shortness of breath in Bihar")
    assert result.urgency == "emergency"
    assert "possible_cardiac_emergency" in result.symptom_categories
    assert "availability_24_7" in result.preferred_capabilities
    assert "has_oxygen" in result.preferred_capabilities
    assert result.safety_note is not None


def test_facility_capability_model_serializes_core_schema():
    model = FacilityCapability(
        name="Example Hospital",
        state="Bihar",
        district_city="Patna",
        pin_code="800001",
        has_icu=True,
        doctor_availability="unknown",
    )
    data = model.to_dict()
    assert data["name"] == "Example Hospital"
    assert data["has_icu"] is True
    assert "extracted_evidence" in data


def test_query_agent_uses_city_distance_for_place_queries():
    import pandas as pd

    facilities = pd.DataFrame(
        [
            {
                "name": "Thrissur Care Hospital",
                "state": "Kerala",
                "district_city": "Thrissur",
                "pin_code": "680001",
                "latitude": 10.5276,
                "longitude": 76.2144,
                "trust_score": 70,
                "contradiction_flags": [],
                "embedding_text": "emergency oxygen icu chest pain care thrissur kerala",
                "has_icu": True,
                "has_oxygen": True,
                "availability_24_7": True,
            },
            {
                "name": "Far High Trust Hospital",
                "state": "Rajasthan",
                "district_city": "Pokaran",
                "pin_code": "345021",
                "latitude": 26.9200,
                "longitude": 71.9200,
                "trust_score": 100,
                "contradiction_flags": [],
                "embedding_text": "emergency oxygen icu chest pain care",
                "has_icu": True,
                "has_oxygen": True,
                "availability_24_7": True,
            },
        ]
    )

    answer = QueryAgent(facilities).answer("chest pain in thrissur", top_k=2)
    assert answer["intent"]["city"] == "Thrissur"
    assert answer["intent"]["state"] == "Kerala"
    assert answer["ranked_facilities"][0]["name"] == "Thrissur Care Hospital"
