# Databricks notebook source
# MAGIC %md
# MAGIC # CareMap AI - 02 Mosaic AI Vector Search
# MAGIC
# MAGIC Creates a Delta Sync index over the extracted summary and messy source fields.

# COMMAND ----------

dbutils.widgets.text("catalog", "workspace", "Unity Catalog catalog")
dbutils.widgets.text("schema", "caremap_ai", "Unity Catalog schema")
dbutils.widgets.text("vector_endpoint", "caremap-vector-endpoint", "Mosaic Vector Search endpoint")
dbutils.widgets.text("embedding_endpoint", "databricks-gte-large-en", "Embedding model serving endpoint")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
vector_endpoint = dbutils.widgets.get("vector_endpoint")
embedding_endpoint = dbutils.widgets.get("embedding_endpoint")

capability_table = f"{catalog}.{schema}.facility_capabilities"
index_name = f"{catalog}.{schema}.facility_capabilities_index"

# COMMAND ----------

import sys

notebook_path = dbutils.notebook.entry_point.getDbutils().notebook().getContext().notebookPath().get()
repo_root = "/Workspace/" + "/".join(notebook_path.strip("/").split("/")[:3])
repo_src = f"{repo_root}/src"
if repo_src not in sys.path:
    sys.path.append(repo_src)

from caremap_ai.vector_search import create_mosaic_delta_sync_index

# COMMAND ----------

create_mosaic_delta_sync_index(
    endpoint_name=vector_endpoint,
    source_table_name=capability_table,
    index_name=index_name,
    primary_key="facility_id",
    embedding_source_column="embedding_text",
    embedding_model_endpoint_name=embedding_endpoint,
)

print(f"Vector index ready: {index_name}")

# COMMAND ----------

from databricks.vector_search.client import VectorSearchClient

client = VectorSearchClient()
index = client.get_index(endpoint_name=vector_endpoint, index_name=index_name)
results = index.similarity_search(
    query_text="emergency appendectomy with ICU oxygen support in Bihar",
    columns=["facility_id", "name", "state", "district_city", "trust_score", "embedding_text"],
    num_results=5,
)
display(results)
