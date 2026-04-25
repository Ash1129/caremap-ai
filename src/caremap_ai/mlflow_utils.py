"""MLflow tracing helpers with no-op fallback for local demos."""

from __future__ import annotations

from contextlib import contextmanager, nullcontext
from typing import Iterator


def setup_mlflow(experiment_name: str) -> None:
    try:
        import mlflow

        mlflow.set_experiment(experiment_name)
    except Exception:
        return


@contextmanager
def trace_span(name: str, **attributes: object) -> Iterator[None]:
    try:
        import mlflow

        if hasattr(mlflow, "start_span"):
            with mlflow.start_span(name=name) as span:
                for key, value in attributes.items():
                    try:
                        span.set_attribute(key, value)
                    except Exception:
                        pass
                yield
            return
    except Exception:
        pass
    with nullcontext():
        yield
