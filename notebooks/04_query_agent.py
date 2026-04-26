# Databricks notebook source
# MAGIC %md
# MAGIC # CareMap AI - 04 Query Agent
# MAGIC
# MAGIC Accepts complex natural-language questions, retrieves semantic candidates from Mosaic AI
# MAGIC Vector Search, filters/reranks by extracted capabilities, and returns evidence.

# COMMAND ----------

dbutils.widgets.text("catalog", "workspace", "Unity Catalog catalog")
dbutils.widgets.text("schema", "caremap_ai", "Unity Catalog schema")
dbutils.widgets.text("query", "Chest pain in Bihar, need emergency care with oxygen and ICU support", "Natural language query")
dbutils.widgets.text("vector_endpoint", "caremap-vector-endpoint", "Mosaic Vector Search endpoint")
dbutils.widgets.text("vector_top_k", "100", "Number of semantic candidates to retrieve")
dbutils.widgets.dropdown("use_vector_search", "true", ["true", "false"], "Use Mosaic AI Vector Search")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
query = dbutils.widgets.get("query")
vector_endpoint = dbutils.widgets.get("vector_endpoint")

raw_top_k = dbutils.widgets.get("vector_top_k")
vector_top_k = int(raw_top_k) if raw_top_k else 100

use_vector_search = dbutils.widgets.get("use_vector_search").lower() == "true"

capability_table = "{}.{}.facility_capabilities".format(catalog, schema)
index_name = "{}.{}.facility_capabilities_index".format(catalog, schema)

print("Capability table:", capability_table)
print("Index name:", index_name)

# COMMAND ----------

import sys

notebook_path = dbutils.notebook.entry_point.getDbutils().notebook().getContext().notebookPath().get()
repo_root = "/Workspace/" + "/".join(notebook_path.strip("/").split("/")[:3])
repo_src = f"{repo_root}/src"
if repo_src not in sys.path:
    sys.path.append(repo_src)

from caremap_ai.mlflow_utils import setup_mlflow, trace_span
from caremap_ai.query import QueryAgent

# COMMAND ----------

import json
import mlflow
import numpy as np

mlflow.set_tracking_uri("databricks")
setup_mlflow("/Shared/caremap-ai-query-traces")

facilities = spark.table(capability_table).toPandas()


def normalize_list_value(value):
    if value is None:
        return []
    if isinstance(value, np.ndarray):
        return value.tolist()
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, list) else [value]
        except Exception:
            return [value]
    return [str(value)]


if "contradiction_flags" in facilities.columns:
    facilities["contradiction_flags"] = facilities["contradiction_flags"].apply(normalize_list_value)


def extract_vector_rows(search_results):
    """Normalize Vector Search SDK results across response shapes."""
    if isinstance(search_results, dict):
        result = search_results.get("result", search_results)
        data = result.get("data_array", result.get("data", []))
        columns = result.get("columns", [])
        column_names = [col.get("name", col) if isinstance(col, dict) else col for col in columns]
        if column_names and data:
            return [dict(zip(column_names, row)) for row in data]
        return data if isinstance(data, list) else []
    if hasattr(search_results, "get"):
        return extract_vector_rows(dict(search_results))
    return []


def retrieve_vector_candidates(query_text, top_k=100):
    from databricks.vector_search.client import VectorSearchClient

    client = VectorSearchClient(disable_notice=True)
    index = client.get_index(endpoint_name=vector_endpoint, index_name=index_name)
    results = index.similarity_search(
        query_text=query_text,
        columns=["facility_id", "name", "state", "district_city", "trust_score"],
        num_results=top_k,
    )
    rows = extract_vector_rows(results)
    candidate_ids = [str(row.get("facility_id")) for row in rows if isinstance(row, dict) and row.get("facility_id") is not None]
    return list(dict.fromkeys(candidate_ids))


candidate_ids = []
retrieval_note = "Vector Search disabled; Query Agent used all facility rows."
if use_vector_search:
    try:
        candidate_ids = retrieve_vector_candidates(query, top_k=vector_top_k)
        retrieval_note = f"Vector Search retrieved {len(candidate_ids)} semantic candidates from {index_name}."
    except Exception as exc:
        retrieval_note = f"Vector Search failed ({type(exc).__name__}: {exc}); Query Agent fell back to all facility rows."

if candidate_ids and "facility_id" in facilities.columns:
    candidate_facilities = facilities[facilities["facility_id"].astype(str).isin(candidate_ids)].copy()
else:
    candidate_facilities = facilities.copy()

agent = QueryAgent(candidate_facilities)

with mlflow.start_run(run_name="caremap_query_agent"):
    with trace_span("query_agent", query=query):
        answer = agent.answer(query, top_k=10)

answer["reasoning_steps"].insert(0, retrieval_note)
display(answer["ranked_facilities"])
print(answer["reasoning_steps"])

# COMMAND ----------

sample_queries = [
    "Chest pain in Bihar, need emergency care with oxygen and ICU support",
    "Newborn breathing difficulty near Assam",
    "Emergency surgery in rural Bihar with ICU and oxygen support",
    "Dialysis centers in underserved regions",
    "Trauma care facilities with high trust score",
    "Regions with no ICU access",
]

for sample in sample_queries:
    print("\nQUERY:", sample)
    sample_candidate_ids = []
    if use_vector_search:
        try:
            sample_candidate_ids = retrieve_vector_candidates(sample, top_k=vector_top_k)
        except Exception as exc:
            print(f"Vector Search fallback for sample query: {type(exc).__name__}: {exc}")
    if sample_candidate_ids and "facility_id" in facilities.columns:
        sample_facilities = facilities[facilities["facility_id"].astype(str).isin(sample_candidate_ids)].copy()
    else:
        sample_facilities = facilities.copy()
    print(QueryAgent(sample_facilities).answer(sample, top_k=3)["ranked_facilities"])
