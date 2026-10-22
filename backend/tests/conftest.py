import pytest
from fastapi.testclient import TestClient

from app.core.db import make_engine
from app.core.settings import Settings
from app.main import create_app
from app.models.entities import Base


@pytest.fixture
def app(tmp_path):
    settings = Settings(database_url=f"sqlite:///{tmp_path}/test.db", _env_file=None)
    engine = make_engine(settings.database_url)
    Base.metadata.create_all(engine)
    return create_app(settings, engine)


@pytest.fixture
def client(app):
    with TestClient(app) as client:
        yield client


@pytest.fixture
def report_body(client):
    repos = client.get("/api/v1/repositories").json()
    return {"type": "team", "github_logins": ["alice", "bob"], "repository_ids": [r["id"] for r in repos],
            "start_date": "2026-10-12", "end_date": "2026-10-18", "timezone": "Asia/Seoul", "policy": "metadata_only"}
