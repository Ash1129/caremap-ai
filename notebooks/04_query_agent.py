# Databricks notebook source
# MAGIC %md
# MAGIC # CareMap AI - 04 Query Agent
# MAGIC
# MAGIC Accepts complex natural-language questions and uses the CareMap Query Agent's
# MAGIC local semantic retrieval path. This version intentionally avoids external
# MAGIC embedding services so the demo can run from the Delta capability table alone.

# COMMAND ----------

catalog = "workspace"
schema = "caremap_ai"
top_k = 10
capability_table = f"{catalog}.{schema}.facility_capabilities"

# COMMAND ----------

import sys

repo_src = "/Workspace/Repos/ap2538@cornell.edu/caremap-ai/src"
if repo_src not in sys.path:
    sys.path.insert(0, repo_src)

from caremap_ai.mlflow_utils import setup_mlflow, trace_span
from caremap_ai.query import QueryAgent

# COMMAND ----------

import json
import mlflow
import numpy as np
import pandas as pd

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
            return [] if value.strip() in {"", "[]"} else [value]
    return [str(value)]


if "contradiction_flags" in facilities.columns:
    facilities["contradiction_flags"] = facilities["contradiction_flags"].apply(normalize_list_value)

agent = QueryAgent(facilities)

# COMMAND ----------

query = input("Enter your query: ").strip() or "Chest pain in Bihar, need emergency care with oxygen and ICU support"

with mlflow.start_run(run_name="caremap_query_agent"):
    with trace_span("query_agent", query=query):
        answer = agent.answer(query, top_k=top_k)

result_df = pd.DataFrame(answer["ranked_facilities"])
display_cols = ["name", "state", "district_city", "pin_code", "trust_score", "rank_score", "explanation"]
display(result_df[[col for col in display_cols if col in result_df.columns]])
print("\n".join(answer["reasoning_steps"]))

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
    sample_answer = agent.answer(sample, top_k=3)
    display(pd.DataFrame(sample_answer["ranked_facilities"]))
