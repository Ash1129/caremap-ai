-- CareMap AI dashboard starter queries.

-- 1. High-risk medical desert regions.
SELECT
  state,
  district_city,
  pin_code,
  facility_count,
  trusted_facility_count,
  missing_services
FROM workspace.caremap_ai.medical_deserts
WHERE risk_level = 'high'
ORDER BY trusted_facility_count ASC, facility_count ASC;

-- 2. Trusted service coverage by state.
SELECT
  state,
  COUNT(*) AS total_facilities,
  SUM(CASE WHEN trust_score > 70 THEN 1 ELSE 0 END) AS high_trust_facilities,
  SUM(CASE WHEN has_icu = true AND trust_score > 70 THEN 1 ELSE 0 END) AS trusted_icu,
  SUM(CASE WHEN has_dialysis = true AND trust_score > 70 THEN 1 ELSE 0 END) AS trusted_dialysis,
  SUM(CASE WHEN has_oncology = true AND trust_score > 70 THEN 1 ELSE 0 END) AS trusted_oncology,
  SUM(CASE WHEN has_trauma_care = true AND trust_score > 70 THEN 1 ELSE 0 END) AS trusted_trauma,
  SUM(CASE WHEN has_neonatal_care = true AND trust_score > 70 THEN 1 ELSE 0 END) AS trusted_neonatal
FROM workspace.caremap_ai.facility_capabilities
GROUP BY state
ORDER BY high_trust_facilities ASC;

-- 3. Facilities with high-risk contradictions.
SELECT
  name,
  state,
  district_city,
  pin_code,
  trust_score,
  contradiction_flags,
  extracted_evidence
FROM workspace.caremap_ai.facility_capabilities
WHERE size(contradiction_flags) > 0
ORDER BY trust_score ASC;

-- 4. High-trust trauma and emergency surgery facilities.
SELECT
  name,
  state,
  district_city,
  pin_code,
  trust_score,
  explanation,
  extracted_evidence
FROM workspace.caremap_ai.facility_capabilities
WHERE trust_score > 70
  AND (has_trauma_care = true OR has_emergency_surgery = true)
ORDER BY trust_score DESC;
