import hashlib
import hmac
import json
import time

from fastapi.testclient import TestClient

from app.core.db import make_engine
from app.core.settings import Settings
from app.main import create_app
from app.models.entities import Base
from app.worker.runner import run_once


def test_single_user_rejects_remote_even_with_spoofed_header(app):
    with TestClient(app, client=("203.0.113.10", 5000)) as client:
        assert (
            client.get("/api/v1/me", headers={"X-User": "demo", "X-Forwarded-For": "127.0.0.1"}).status_code
            == 403
        )
        assert client.get("/api/v1/health/live").status_code == 200


def test_origin_validation(client, report_body):
    response = client.post(
        "/api/v1/reports", json=report_body, headers={"Origin": "https://attacker.example"}
    )
    assert response.status_code == 403
    assert response.json()["code"] == "ORIGIN_DENIED"


def test_signed_proxy_acl_idor_and_revocation(tmp_path):
    secret = tmp_path / "proxy-secret"
    secret.write_text("test-proxy-secret-at-least-32-characters")
    settings = Settings(
        database_url=f"sqlite:///{tmp_path}/proxy.db",
        single_user_mode=False,
        trusted_proxy_ips="127.0.0.1",
        proxy_secret_file=str(secret),
        admin_principals="admin",
        repo_acl_json=json.dumps({"alice": ["example-org/vision"], "bob": ["example-org/vision"]}),
        _env_file=None,
    )
    engine = make_engine(settings.database_url)
    Base.metadata.create_all(engine)
    app = create_app(settings, engine)

    def headers(who, method, path, stamp=None):
        stamp = str(stamp or int(time.time()))
        signed = f"{stamp}\n{who}\n{method}\n{path}"
        return {
            "X-DevBrief-User": who,
            "X-DevBrief-Timestamp": stamp,
            "X-DevBrief-Signature": hmac.new(
                b"test-proxy-secret-at-least-32-characters", signed.encode(), hashlib.sha256
            ).hexdigest(),
        }

    with TestClient(app, client=("127.0.0.1", 5000)) as client:
        assert client.get("/api/v1/me", headers={"X-User": "admin"}).status_code == 401
        assert (
            client.get(
                "/api/v1/me",
                headers={"X-Forwarded-Preferred-Username": "admin", "X-Forwarded-Email": "admin@example.com"},
            ).status_code
            == 401
        )
        assert (
            client.get(
                "/api/v1/me", headers=headers("alice", "GET", "/api/v1/me", int(time.time()) - 120)
            ).status_code
            == 401
        )
        repos = client.get(
            "/api/v1/repositories", headers=headers("alice", "GET", "/api/v1/repositories")
        ).json()
        assert len(repos) == 1
        assert (
            client.get(
                "/api/v1/admin/audit-logs", headers=headers("alice", "GET", "/api/v1/admin/audit-logs")
            ).status_code
            == 403
        )
        body = {
            "github_logins": ["alice"],
            "repository_ids": [repos[0]["id"]],
            "start_date": "2026-10-12",
            "end_date": "2026-10-18",
        }
        result = client.post(
            "/api/v1/reports", json=body, headers=headers("alice", "POST", "/api/v1/reports")
        )
        assert result.status_code == 202, result.text
        jid = result.json()["job_id"]
        run_once(app.state.factory, settings)
        path = f"/api/v1/jobs/{jid}"
        assert client.get(path, headers=headers("bob", "GET", path)).status_code == 404
        rid = client.get(path, headers=headers("alice", "GET", path)).json()["report_id"]
        for path, method in [
            (f"/api/v1/reports/{rid}", "GET"),
            (f"/api/v1/reports/{rid}/export", "GET"),
            (f"/api/v1/reports/{rid}/finalize", "POST"),
        ]:
            response = client.request(
                method,
                path,
                headers=headers("bob", method, path),
                json={"revision": 1} if method == "POST" else None,
            )
            assert response.status_code == 404
        assert client.get("/api/v1/reports", headers=headers("bob", "GET", "/api/v1/reports")).json() == []
        settings.repo_acl_json = "{}"
        path = f"/api/v1/reports/{rid}"
        assert client.get(path, headers=headers("alice", "GET", path)).status_code == 404


def test_error_input_does_not_echo_secrets(client, report_body):
    response = client.post("/api/v1/reports", json={**report_body, "secret": "ghp_do_not_echo_12345"})
    assert response.status_code == 422
    assert "ghp_do_not_echo" not in response.text


def test_dns_rebinding_host_is_rejected(client):
    assert client.get("/api/v1/me", headers={"Host": "attacker.example"}).status_code == 400
