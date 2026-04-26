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


def test_trust_score_stays_low_for_sparse_noncritical_claims():
    row = {
        "name": "Sparse Dental Clinic",
        "address_stateOrRegion": "Kerala",
        "address_city": "Thrissur",
        "address_zipOrPostcode": "680001",
        "description": "Dental clinic with routine consultations.",
        "specialties": "Dental",
        "procedure": "",
        "equipment": "",
        "capability": "",
        "numberDoctors": 0,
        "capacity": 0,
        "distinct_social_media_presence_count": 3,
        "number_of_facts_about_the_organization": 8,
    }
    result = CareMapAgentPipeline().run_row(row)
    assert result["trust_score"] <= 62
    assert "too_many_unknown_capabilities" in result["contradiction_flags"]


def test_trust_score_rewards_complete_emergency_evidence():
    row = {
        "name": "Evidence Backed Hospital",
        "address_stateOrRegion": "Bihar",
        "address_city": "Gaya",
        "address_zipOrPostcode": "823001",
        "description": "24x7 emergency hospital with ICU, central oxygen, ventilators, operation theatre, anesthesia team and trauma care.",
        "specialties": "Emergency medicine, critical care, anesthesiology",
        "procedure": "Emergency surgery and appendectomy",
        "equipment": "Ventilator, oxygen plant, anesthesia machine",
        "capability": "ICU trauma emergency surgery",
        "numberDoctors": 12,
        "capacity": 80,
        "distinct_social_media_presence_count": 2,
        "number_of_facts_about_the_organization": 6,
        "recency_of_page_update": 120,
    }
    result = CareMapAgentPipeline().run_row(row)
    assert result["trust_score"] >= 85
    assert not result["contradiction_flags"]


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


def test_query_agent_filters_to_explicit_state_when_available():
    import pandas as pd

    facilities = pd.DataFrame(
        [
            {
                "name": "National High Trust Hospital",
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
            {
                "name": "Bihar Emergency Hospital",
                "state": "Bihar",
                "district_city": "Gaya",
                "pin_code": "823001",
                "latitude": 24.7914,
                "longitude": 85.0002,
                "trust_score": 70,
                "contradiction_flags": [],
                "embedding_text": "emergency oxygen icu chest pain care bihar",
                "has_icu": True,
                "has_oxygen": True,
                "availability_24_7": True,
            },
        ]
    )

    answer = QueryAgent(facilities).answer("chest pain in Bihar", top_k=3)
    assert [row["state"] for row in answer["ranked_facilities"]] == ["Bihar"]
    assert "Applied state filter" in answer["reasoning_steps"][2]
