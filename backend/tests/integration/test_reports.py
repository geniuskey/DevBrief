from sqlalchemy import select

from app.models.entities import GitHubEvent, ReportRevision
from app.worker.runner import run_once


def generate(client, app, body):
    job_id = client.post("/api/v1/reports", json=body).json()["job_id"]
    assert run_once(app.state.factory, app.state.settings)
    job = client.get(f"/api/v1/jobs/{job_id}").json()
    assert job["report_id"], job
    return client.get(f"/api/v1/reports/{job['report_id']}").json()


def test_edit_conflict_exclusion_finalize_export(client, app, report_body):
    report = generate(client, app, report_body)
    rid = report["id"]
    item = report["work_items"][0]
    path = f"/api/v1/reports/{rid}/work-items/{item['id']}"
    updated = client.patch(
        path,
        json={"version": 1, "title_ko": "ROI 검증 완료", "summary_ko": "<script>alert(1)</script> 검토함"},
    )
    assert updated.status_code == 200
    assert client.patch(path, json={"version": 1, "title_ko": "stale"}).status_code == 409
    assert client.post(f"/api/v1/reports/{rid}/finalize", json={"revision": 1}).status_code == 409
    assert client.patch(path, json={"version": 2, "excluded": True}).status_code == 200
    hidden = client.get(f"/api/v1/reports/{rid}").json()
    assert "ROI 검증 완료" not in hidden["markdown"]
    assert client.patch(path, json={"version": 3, "excluded": False}).status_code == 200
    current = client.get(f"/api/v1/reports/{rid}").json()
    assert (
        client.post(f"/api/v1/reports/{rid}/finalize", json={"revision": current["revision"]}).status_code
        == 200
    )
    assert client.patch(path, json={"version": 4, "title_ko": "later"}).status_code == 409
    md = client.get(f"/api/v1/reports/{rid}/export?format=md")
    assert "attachment" in md.headers["content-disposition"]
    html = client.get(f"/api/v1/reports/{rid}/export?format=html")
    assert "<script>" not in html.text
    assert client.get("/api/v1/reports").json()[0]["id"] == rid
    with app.state.factory() as db:
        assert len(list(db.scalars(select(ReportRevision)))) == 5
        for evidence in item["evidence"]:
            assert db.get(GitHubEvent, evidence["id"]) is not None


def test_team_crud_and_snapshot(client, app, report_body):
    payload = {
        "name": "비전 팀",
        "github_logins": ["alice", "bob"],
        "repository_ids": report_body["repository_ids"],
    }
    created = client.post("/api/v1/teams", json=payload)
    assert created.status_code == 201
    tid = created.json()["id"]
    report = generate(client, app, {**report_body, "team_id": tid})
    assert client.put(f"/api/v1/teams/{tid}", json={**payload, "github_logins": ["carol"]}).status_code == 200
    assert client.get(f"/api/v1/reports/{report['id']}").json()["request"]["github_logins"] == [
        "alice",
        "bob",
    ]
    assert client.delete(f"/api/v1/teams/{tid}").status_code == 200
    assert client.get(f"/api/v1/teams/{tid}").status_code == 404


def test_duplicate_pending_job_and_cancel(client, app, report_body):
    first = client.post("/api/v1/reports", json=report_body).json()
    second = client.post("/api/v1/reports", json=report_body).json()
    assert first["job_id"] == second["job_id"]
    assert client.post(f"/api/v1/jobs/{first['job_id']}/cancel").status_code == 200
    assert not run_once(app.state.factory, app.state.settings)
    assert client.get(f"/api/v1/jobs/{first['job_id']}").json()["status"] == "cancelled"


def test_all_repositories_fail_is_not_success(client, app, report_body):
    restricted = next(
        r["id"] for r in client.get("/api/v1/repositories").json() if r["full_name"].endswith("restricted")
    )
    job_id = client.post("/api/v1/reports", json={**report_body, "repository_ids": [restricted]}).json()[
        "job_id"
    ]
    run_once(app.state.factory, app.state.settings)
    result = client.get(f"/api/v1/jobs/{job_id}").json()
    assert result["status"] == "failed"
    assert result["report_id"] is None
    assert result["coverage"]["is_complete"] is False


def test_admin_connections_and_audit(client):
    assert client.post("/api/v1/admin/connections/ghes/test").json()["version"] == "3.18.0"
    assert client.post("/api/v1/admin/connections/llm/test").json()["connected"] is True
    logs = client.get("/api/v1/admin/audit-logs").json()
    assert {r["action"] for r in logs} >= {"connection.ghes_tested", "connection.llm_tested"}


def test_pending_job_keeps_snapshot_after_team_deletion(client, app, report_body):
    team = client.post(
        "/api/v1/teams",
        json={
            "name": "삭제 테스트",
            "github_logins": ["alice"],
            "repository_ids": report_body["repository_ids"],
        },
    ).json()
    jid = client.post("/api/v1/reports", json={**report_body, "team_id": team["id"]}).json()["job_id"]
    assert client.delete(f"/api/v1/teams/{team['id']}").status_code == 200
    run_once(app.state.factory, app.state.settings)
    assert client.get(f"/api/v1/jobs/{jid}").json()["report_id"]


def test_oversized_version_numbers_are_rejected(client, app, report_body):
    report = generate(client, app, report_body)
    rid, item = report["id"], report["work_items"][0]
    huge = 2**70
    assert client.post(f"/api/v1/reports/{rid}/finalize", json={"revision": huge}).status_code == 422
    assert (
        client.patch(f"/api/v1/reports/{rid}/work-items/{item['id']}", json={"version": huge}).status_code
        == 422
    )


def test_identical_retry_reuses_job_at_pending_limit(client, app, report_body):
    limit = app.state.settings.max_pending_jobs
    first = client.post("/api/v1/reports", json=report_body).json()["job_id"]
    for day in range(1, limit):
        body = {**report_body, "start_date": f"2026-10-{12 - day:02d}"}
        assert client.post("/api/v1/reports", json=body).status_code == 202
    again = client.post("/api/v1/reports", json=report_body)
    assert again.status_code == 202
    assert again.json()["job_id"] == first
    other = {**report_body, "start_date": "2026-09-01", "end_date": "2026-09-07"}
    assert client.post("/api/v1/reports", json=other).status_code == 429
