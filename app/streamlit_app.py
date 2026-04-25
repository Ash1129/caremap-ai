"""Local CareMap AI demo.

Run with:
    streamlit run app/streamlit_app.py
"""

from __future__ import annotations

import ast
import sys
from pathlib import Path

import pandas as pd
import streamlit as st

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from caremap_ai.desert import DesertDetectionAgent
from caremap_ai.orchestrator import CareMapAgentPipeline
from caremap_ai.query import QueryAgent
from caremap_ai.vector_search import build_embedding_text


@st.cache_data
def load_source(path: str) -> pd.DataFrame:
    file_path = Path(path)
    if file_path.suffix.lower() in {".xlsx", ".xls"}:
        return pd.read_excel(file_path)
    return pd.read_csv(file_path)


@st.cache_data
def run_pipeline(source_json: str) -> pd.DataFrame:
    source = pd.read_json(source_json)
    pipeline = CareMapAgentPipeline()
    result = pipeline.run_pandas(source)
    for column in source.columns:
        if column not in result:
            result[column] = source[column]
    result["facility_id"] = result.index.astype(str)
    result["embedding_text"] = result.apply(build_embedding_text, axis=1)
    return result


def render_score(score: int) -> str:
    if score >= 80:
        return "High"
    if score >= 60:
        return "Medium"
    return "Low"


st.set_page_config(page_title="CareMap AI", layout="wide")
st.title("CareMap AI")
st.caption("Agentic Healthcare Intelligence System for India")

default_path = str(ROOT / "data" / "sample_facilities.csv")
data_path = st.sidebar.text_input("Dataset path", default_path)
source_df = load_source(data_path)
facilities = run_pipeline(source_df.to_json())

tab_search, tab_deserts, tab_data = st.tabs(["Search", "Medical Deserts", "Evidence Table"])

with tab_search:
    query = st.text_input(
        "Ask a clinical access question",
        "Find nearest facility in Bihar that can perform emergency appendectomy and has oxygen and ICU support",
    )
    agent = QueryAgent(facilities)
    answer = agent.answer(query, top_k=10)
    st.write("Reasoning")
    for step in answer["reasoning_steps"]:
        st.write(f"- {step}")

    for facility in answer["ranked_facilities"]:
        with st.container(border=True):
            left, right = st.columns([3, 1])
            left.subheader(facility["name"])
            left.write(f'{facility["district_city"]}, {facility["state"]} - {facility["pin_code"]}')
            right.metric("Trust", facility["trust_score"], render_score(facility["trust_score"]))
            if facility["contradiction_flags"]:
                st.warning(", ".join(facility["contradiction_flags"]))
            st.write(facility["explanation"])
            with st.expander("Evidence snippets"):
                st.json(facility["evidence"])

with tab_deserts:
    deserts = DesertDetectionAgent().detect(facilities)
    st.dataframe(deserts, use_container_width=True)
    map_df = facilities.dropna(subset=["latitude", "longitude"])
    if not map_df.empty:
        st.map(map_df.rename(columns={"latitude": "lat", "longitude": "lon"}), latitude="lat", longitude="lon")

with tab_data:
    display_df = facilities.copy()
    for column in ["extracted_evidence", "contradiction_flags"]:
        if column in display_df:
            display_df[column] = display_df[column].apply(lambda x: x if isinstance(x, str) else repr(x))
    st.dataframe(display_df, use_container_width=True)
