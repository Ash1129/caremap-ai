import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from caremap_ai.orchestrator import CareMapAgentPipeline
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
