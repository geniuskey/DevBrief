from app.worker.runner import run_once


def test_demo_job_is_async_and_reports_partial(client, app, report_body):
    result = client.post("/api/v1/reports", json=report_body)
    assert result.status_code == 202
    job_id = result.json()["job_id"]
    assert client.get(f"/api/v1/jobs/{job_id}").json()["status"] == "queued"
    assert run_once(app.state.factory, app.state.settings)
    job = client.get(f"/api/v1/jobs/{job_id}").json()
    assert job["status"] == "partial"
    assert job["coverage"]["repositories_failed"] == 1
    report = client.get(f"/api/v1/reports/{job['report_id']}").json()
    assert len(report["work_items"]) == 1
    assert "ROI" in report["markdown"]
    assert "인사 평가" in report["markdown"]


def test_invalid_input_and_allowlist(client, report_body):
    assert client.post("/api/v1/reports", json={**report_body, "end_date": "2026-10-01"}).status_code == 422
    assert client.post("/api/v1/reports", json={**report_body, "repository_ids": ["other"]}).status_code == 403
    assert client.get("/api/v1/health/live").json() == {"status": "ok"}
