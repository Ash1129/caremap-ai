import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from caremap_ai.orchestrator import CareMapAgentPipeline


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
