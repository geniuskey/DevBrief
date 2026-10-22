import json

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import select

from app.core.db import make_engine
from app.core.settings import Settings
from app.main import create_app
from app.models.entities import AppUser, Base
from app.worker.runner import run_once


@pytest.fixture
def oauth_app(tmp_path):
    settings = Settings(
        database_url=f"sqlite:///{tmp_path}/oauth.db",
        single_user_mode=False,
        proxy_auth_mode="oauth2_proxy",
        trusted_proxy_ips="127.0.0.1",
        admin_principals="admin",
        repo_acl_json=json.dumps({"alice": ["example-org/vision"]}),
        _env_file=None,
    )
    engine = make_engine(settings.database_url)
    Base.metadata.create_all(engine)
    return create_app(settings, engine)


@pytest.fixture
def oauth_client(oauth_app):
    with TestClient(oauth_app, client=("127.0.0.1", 5000)) as client:
        yield client


def identity_headers(username="alice", groups='["engineering"]'):
    return {
        "X-Forwarded-Preferred-Username": username,
        "X-Forwarded-Email": f"{username}@example.com",
        "X-Forwarded-Groups": groups,
    }


@pytest.mark.parametrize(
    ("groups", "expected"),
    [
        ('["engineering"]', "engineering"),
        ('["engineering", "admin"]', "engineering"),
        ("['engineering', 'admin']", "engineering"),
        (' [ " engineering ", "admin" ] ', "engineering"),
        ('["engineering, platform", "admin"]', "engineering, platform"),
        ('["\\uac1c\\ubc1c\\ud300"]', "개발팀"),
        ("engineering,admin", "engineering"),
        ("engineering", "engineering"),
        ("[]", None),
        ("", None),
        ('["", "admin"]', None),
    ],
)
def test_identity_and_first_group(oauth_client, groups, expected):
    response = oauth_client.get("/api/v1/me", headers=identity_headers(groups=groups))
    assert response.status_code == 200, response.text
    user = response.json()
    assert user == {
        "id": user["id"],
        "name": "alice",
        "role": "author",
        "email": "alice@example.com",
        "group": expected,
    }


def test_identity_metadata_is_optional_and_refreshed(oauth_client):
    original = oauth_client.get("/api/v1/me", headers=identity_headers()).json()
    headers = identity_headers(groups='["platform"]')
    headers["X-Forwarded-Email"] = "alice.new@example.com"
    updated = oauth_client.get("/api/v1/me", headers=headers).json()
    assert updated["id"] == original["id"]
    assert updated["email"] == "alice.new@example.com"
    assert updated["group"] == "platform"
    response = oauth_client.get("/api/v1/me", headers={"X-Forwarded-Preferred-Username": "alice"})
    assert response.status_code == 200
    assert response.json()["email"] is None
    assert response.json()["group"] is None


def test_custom_header_names_from_environment(oauth_app, monkeypatch):
    monkeypatch.setenv("SINGLE_USER_MODE", "false")
    monkeypatch.setenv("PROXY_AUTH_MODE", "oauth2_proxy")
    monkeypatch.setenv("TRUSTED_PROXY_IPS", "127.0.0.1")
    monkeypatch.setenv("OAUTH2_PROXY_PREFERRED_USERNAME_HEADER", "X-SSO-Username")
    monkeypatch.setenv("OAUTH2_PROXY_EMAIL_HEADER", "X-SSO-Email")
    monkeypatch.setenv("OAUTH2_PROXY_GROUPS_HEADER", "X-SSO-Groups")
    settings = Settings(database_url=oauth_app.state.settings.database_url, _env_file=None)
    app = create_app(settings)
    with TestClient(app, client=("127.0.0.1", 5000)) as client:
        assert client.get("/api/v1/me", headers=identity_headers()).status_code == 401
        response = client.get(
            "/api/v1/me",
            headers={
                "x-sso-username": "alice",
                "x-sso-email": "alice@example.com",
                "x-sso-groups": '["engineering", "admin"]',
            },
        )
        assert response.status_code == 200
        assert response.json()["name"] == "alice"
        assert response.json()["email"] == "alice@example.com"
        assert response.json()["group"] == "engineering"


def test_untrusted_peer_cannot_spoof_forwarded_headers(oauth_app):
    with TestClient(oauth_app, client=("203.0.113.10", 5000)) as client:
        headers = {**identity_headers("admin"), "X-Forwarded-For": "127.0.0.1", "X-Real-IP": "127.0.0.1"}
        response = client.get("/api/v1/me", headers=headers)
        assert response.status_code == 401
        assert response.json()["code"] == "UNAUTHENTICATED"
        assert client.get("/api/v1/health/live").status_code == 200


@pytest.mark.parametrize("username", ["", " ", "alice,bob", "alice\nadmin", "a" * 201])
def test_invalid_username_is_rejected(oauth_client, username):
    assert oauth_client.get("/api/v1/me", headers=identity_headers(username)).status_code == 401


def test_missing_username_does_not_fall_back_to_other_identity_headers(oauth_client):
    headers = {
        "X-Forwarded-Email": "admin@example.com",
        "X-Forwarded-User": "admin",
        "X-DevBrief-User": "admin",
    }
    assert oauth_client.get("/api/v1/me", headers=headers).status_code == 401


@pytest.mark.parametrize("header", list(identity_headers()))
def test_duplicate_identity_headers_are_rejected(oauth_client, header):
    headers = [*identity_headers().items(), (header.lower(), "admin")]
    assert oauth_client.get("/api/v1/me", headers=headers).status_code == 401


@pytest.mark.parametrize(
    "groups",
    [
        '["engineering"',
        "[42]",
        "[null]",
        '[{"name":"admin"}]',
        '[["admin"]]',
        '["engineering", 1]',
        '["a\\nb"]',
        "a" * 8193,
    ],
)
def test_invalid_groups_are_rejected(oauth_client, groups):
    response = oauth_client.get("/api/v1/me", headers=identity_headers(groups=groups))
    assert response.status_code == 401
    assert response.json()["code"] == "UNAUTHENTICATED"


def test_acl_roles_and_worker_use_username(oauth_client, oauth_app):
    headers = identity_headers(groups='["admin"]')
    headers["X-Forwarded-Email"] = "admin@example.com"
    response = oauth_client.get("/api/v1/repositories", headers=headers)
    assert response.status_code == 200
    repos = response.json()
    assert [r["full_name"] for r in repos] == ["example-org/vision"]
    assert oauth_client.get("/api/v1/admin/audit-logs", headers=headers).status_code == 403
    assert oauth_client.get("/api/v1/repositories", headers=identity_headers("bob")).json() == []
    assert oauth_client.get("/api/v1/admin/audit-logs", headers=identity_headers("admin")).status_code == 200

    response = oauth_client.post(
        "/api/v1/reports",
        headers=headers,
        json={
            "github_logins": ["alice"],
            "repository_ids": [repos[0]["id"]],
            "start_date": "2026-10-12",
            "end_date": "2026-10-18",
        },
    )
    assert response.status_code == 202, response.text
    job_path = f"/api/v1/jobs/{response.json()['job_id']}"
    assert run_once(oauth_app.state.factory, oauth_app.state.settings)
    job = oauth_client.get(job_path, headers=headers).json()
    assert job["status"] == "complete"
    report_path = f"/api/v1/reports/{job['report_id']}"
    assert oauth_client.get(report_path, headers=headers).status_code == 200
    assert oauth_client.get(report_path, headers=identity_headers("bob")).status_code == 404
    oauth_app.state.settings.repo_acl_json = "{}"
    assert oauth_client.get(report_path, headers=headers).status_code == 404


def test_disabled_user_is_rejected(oauth_client, oauth_app):
    assert oauth_client.get("/api/v1/me", headers=identity_headers()).status_code == 200
    with oauth_app.state.factory() as db:
        user = db.scalar(select(AppUser).where(AppUser.principal == "alice"))
        user.active = False
        db.commit()
    assert oauth_client.get("/api/v1/me", headers=identity_headers()).status_code == 403


def test_single_user_mode_ignores_oauth2_proxy_headers(client):
    response = client.get("/api/v1/me", headers=identity_headers("alice"))
    assert response.status_code == 200
    assert response.json()["name"] == "demo"
    assert response.json()["email"] is None
    assert response.json()["group"] is None


@pytest.mark.parametrize("mode", ["signed", "oauth2_proxy"])
@pytest.mark.parametrize("trusted", ["", " , "])
def test_multi_user_mode_requires_trusted_proxy(mode, trusted):
    with pytest.raises(ValidationError, match="신뢰 프록시 IP"):
        Settings(single_user_mode=False, proxy_auth_mode=mode, trusted_proxy_ips=trusted, _env_file=None)


def test_signed_mode_still_requires_secret():
    with pytest.raises(ValidationError, match="서명 secret 파일"):
        Settings(single_user_mode=False, trusted_proxy_ips="127.0.0.1", _env_file=None)


@pytest.mark.parametrize("secret", ["short", ""])
def test_signed_mode_rejects_short_secret(tmp_path, secret):
    path = tmp_path / "secret"
    path.write_text(secret)
    with pytest.raises(ValidationError, match="최소 32자"):
        Settings(
            single_user_mode=False, trusted_proxy_ips="127.0.0.1", proxy_secret_file=str(path), _env_file=None
        )


@pytest.mark.parametrize("header", ["", "X-SSO User", "X-SSO:User", "X-SSO\nUser", "x-forwarded-email"])
def test_invalid_header_configuration_is_rejected(header):
    with pytest.raises(ValidationError, match="헤더 이름"):
        Settings(
            single_user_mode=False,
            proxy_auth_mode="oauth2_proxy",
            trusted_proxy_ips="127.0.0.1",
            oauth2_proxy_preferred_username_header=header,
            _env_file=None,
        )
