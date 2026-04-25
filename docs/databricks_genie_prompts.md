# Genie Code Prompts

Use these prompts inside Databricks Genie Code Agent mode while running the notebooks.

## Pipeline Run

Inspect the Unity Catalog tables in `workspace.caremap_ai`. Run the CareMap AI notebooks in order and stop if the raw dataset does not match the required schema. Summarize row counts from `raw_facilities`, `clean_facilities`, and `facility_capabilities`, plus the top data quality risks from `data_quality_profile`.

## Cleaning Review

Review `workspace.caremap_ai.data_quality_profile` and `workspace.caremap_ai.clean_facilities`. Identify columns with high missingness, rows without capability text, rows without coordinates, and any state/city normalization issues. Do not treat clinical claims as verified facts.

## Extraction Review

Review `workspace.caremap_ai.facility_capabilities`. Find examples where the Extraction Agent may have over-inferred capabilities. Focus on ICU, emergency surgery, anesthesiologist, oxygen, ventilator, and 24/7 availability. Return facility names, evidence snippets, and suggested rule changes.

## Contradiction Audit

Analyze contradiction flags in `workspace.caremap_ai.facility_capabilities`. Which states and facility types have the highest rates of inconsistent claims? Show supporting SQL and cite table rows.

## Medical Desert Report

Using `workspace.caremap_ai.medical_deserts`, identify high-risk districts and PIN codes with no trusted ICU, dialysis, oncology, trauma, or neonatal service. Produce a ranked list with service gaps and recommended next validation steps.

## Query Agent Debugging

Given a user query, inspect the Query Agent output and MLflow traces. Explain which explicit capabilities were parsed, whether the Symptom Triage Agent detected a symptom category, which preferred capabilities were added, which filters removed candidates, and whether ranking was driven more by trust, contradiction penalties, symptom-triage match, or distance.
