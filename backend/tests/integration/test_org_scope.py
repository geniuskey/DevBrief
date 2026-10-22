import json

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import select

from app.core.db import make_engine
from app.core.security import Principal, permitted_orgs, permitted_repositories
from app.core.settings import Settings
from app.main import create_app
from app.models.entities import Base, Repository
from app.services.discovery import sync_org_scopes
from app.worker.runner import run_once


def org_app(tmp_path, **overrides):
    settings = Settings(
        database_url=f"sqlite:///{tmp_path}/org.db",
        ghes_allowed_repos="example-org/*",
        _env_file=None,
        **overrides,
    )
    engine = make_engine(settings.database_url)
    Base.metadata.create_all(engine)
    return create_app(settings, engine)


BODY = {
    "github_logins": ["alice", "bob", "carol"],
    "organizations": ["example-org"],
    "start_date": "2026-10-12",
    "end_date": "2026-10-18",
}


def test_settings_accept_org_wildcards():
    settings = Settings(ghes_allowed_repos="example-org/*,example-org/vision", _env_file=None)
    assert settings.org_scopes == ["example-org"]
    assert settings.allowed_repos == ["example-org/vision"]
    assert settings.repo_allowed("Example-Org/new-repo")
    assert not settings.repo_allowed("other-org/vision")
    with pytest.raises(ValidationError):
        Settings(ghes_allowed_repos="example-org/*,other-org/*", _env_file=None)
    with pytest.raises(ValidationError):
        Settings(ghes_allowed_repos="example-org/vi*", _env_file=None)


def test_org_scope_report_discovers_and_skips_inactive(tmp_path):
    app = org_app(tmp_path)
    with TestClient(app) as client:
        assert client.get("/api/v1/repositories").json() == []
        assert client.get("/api/v1/organizations").json() == [{"login": "example-org", "repository_count": 0}]
        assert client.post("/api/v1/reports", json={**BODY, "organizations": []}).status_code == 422, (
            "a scope is required"
        )
        assert (
            client.post("/api/v1/reports", json={**BODY, "organizations": ["other-org"]}).status_code == 403
        )

        jid = client.post("/api/v1/reports", json=BODY).json()["job_id"]
        assert run_once(app.state.factory, app.state.settings)
        job = client.get(f"/api/v1/jobs/{jid}").json()
        # example-org/restricted is listed but not readable in the fake GHES.
        assert job["status"] == "partial"
        assert job["coverage"]["scope_repos"] == [
            "example-org/platform",
            "example-org/restricted",
            "example-org/vision",
        ]
        assert job["coverage"]["excluded_repos"] == ["example-org/legacy-tools"]
        assert "ORG_INACTIVE_SKIPPED" in {w["code"] for w in job["warnings"]}
        report = client.get(f"/api/v1/reports/{job['report_id']}").json()
        assert "조직 전체: example\\-org" in report["markdown"]
        assert report["work_items"]
        names = {r["full_name"] for r in client.get("/api/v1/repositories").json()}
        assert "example-org/legacy-tools" in names
        history = client.get("/api/v1/reports").json()
        assert history[0]["organizations"] == ["example-org"]
        assert history[0]["repository_count"] == 3


def test_org_repo_limit_marks_partial(tmp_path):
    app = org_app(tmp_path, org_max_repositories=1)
    with TestClient(app) as client:
        jid = client.post("/api/v1/reports", json=BODY).json()["job_id"]
        run_once(app.state.factory, app.state.settings)
        job = client.get(f"/api/v1/jobs/{jid}").json()
        assert job["coverage"]["scope_repos"] == ["example-org/vision"]
        assert job["status"] == "partial"
        assert "ORG_REPO_LIMIT" in {w["code"] for w in job["warnings"]}


def test_teams_admin_sync_and_disappeared_repositories(tmp_path):
    app = org_app(tmp_path)
    with TestClient(app) as client:
        team = client.post(
            "/api/v1/teams",
            json={"name": "전사", "github_logins": ["alice"], "organizations": ["example-org"]},
        )
        assert team.status_code == 201, team.text
        assert team.json()["organizations"] == ["example-org"]
        assert client.get("/api/v1/teams").json()[0]["repository_ids"] == []

        with app.state.factory() as db:
            db.add(Repository(full_name="example-org/gone", discovered=True))
            db.commit()
        synced = client.post("/api/v1/admin/organizations/sync").json()
        assert synced == [{"login": "example-org", "state": "synced", "repositories": 4}]
        with app.state.factory() as db:
            gone = db.scalar(select(Repository).where(Repository.full_name == "example-org/gone"))
            assert not gone.enabled and gone.access_state == "not_listed"
        assert client.get("/api/v1/organizations").json()[0]["repository_count"] == 4
        tested = client.post("/api/v1/admin/connections/ghes/test").json()
        assert tested["organizations"] == [{"login": "example-org", "state": "accessible"}]


def test_org_acl_requires_wildcard_entry(tmp_path):
    settings = Settings(
        ghes_allowed_repos="example-org/*",
        repo_acl_json=json.dumps({"alice": ["example-org/*"], "bob": ["example-org/vision"]}),
        _env_file=None,
    )
    engine = make_engine(f"sqlite:///{tmp_path}/acl.db")
    Base.metadata.create_all(engine)
    app = create_app(settings, engine)
    sync_org_scopes(app.state.factory, settings)
    alice, bob = Principal("1", "alice", "author"), Principal("2", "bob", "author")
    assert permitted_orgs(alice, settings) == ["example-org"]
    assert permitted_orgs(bob, settings) == []
    with app.state.factory() as db:
        assert len(permitted_repositories(db, alice, settings)) == 4
        assert [r.full_name for r in permitted_repositories(db, bob, settings)] == ["example-org/vision"]
