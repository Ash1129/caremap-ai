# Databricks notebook source
# MAGIC %md
# MAGIC # CareMap AI - 04 Query Agent (v2 — OpenAI embeddings)
# MAGIC
# MAGIC Accepts complex natural-language questions and retrieves relevant facilities using
# MAGIC OpenAI semantic embeddings (`text-embedding-3-small`). Capabilities and geography
# MAGIC are used as soft scoring signals — no candidates are hard-filtered out.

# COMMAND ----------

catalog          = "workspace"
schema           = "caremap_ai"
openai_api_key   = None  # set to your key string, or leave None to use OPENAI_API_KEY env var
top_k            = 10
capability_table = f"{catalog}.{schema}.facility_capabilities"

# COMMAND ----------

import sys

repo_src = "/Workspace/Repos/ap2538@cornell.edu/caremap-ai/src"
if repo_src not in sys.path:
    sys.path.insert(0, repo_src)

from caremap_ai.mlflow_utils import setup_mlflow, trace_span
from caremap_ai.query import QueryAgent
from caremap_ai.vector_search import OpenAISemanticRetriever

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

# COMMAND ----------

# Build the semantic retriever once — embeddings are cached on the object so
# subsequent queries in this session don't re-embed the full dataset.
retriever = OpenAISemanticRetriever(facilities=facilities, api_key=openai_api_key)
agent = QueryAgent(facilities, semantic_retriever=retriever)

# COMMAND ----------

query = input("Enter your query: ")

with mlflow.start_run(run_name="caremap_query_agent"):
    with trace_span("query_agent", query=query):
        answer = agent.answer(query, top_k=top_k)

import pandas as pd
cols = ["name", "state", "district_city", "pin_code", "trust_score", "rank_score", "explanation"]
display(pd.DataFrame(answer["ranked_facilities"])[cols])
print("\n".join(answer["reasoning_steps"]))
