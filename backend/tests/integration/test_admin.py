from datetime import timedelta

from app.models.entities import Job, Report, utcnow
from tests.integration.test_reports import generate


def test_history_summary_fields(client, app, report_body):
    report = generate(client, app, report_body)
    [row] = client.get("/api/v1/reports").json()
    assert row["id"] == report["id"]
    assert row["type"] == "team"
    assert row["github_logins"] == ["alice", "bob"]
    assert row["repository_count"] == len(report_body["repository_ids"])
    assert row["work_item_count"] == sum(not i["excluded"] for i in report["work_items"])
    assert row["finalized_at"] is None


def test_history_filters_before_capping(client, app, report_body):
    report = generate(client, app, report_body)
    with app.state.factory() as db:
        original = db.get(Report, report["id"])
        owner, coverage = original.owner_id, original.coverage_json
        later = utcnow() + timedelta(minutes=1)
        # 500 newer reports outside the requested period must not hide the older match.
        for n in range(500):
            job = Job(
                requested_by=owner,
                status="complete",
                request_json={**report_body, "start_date": "2026-09-01", "end_date": "2026-09-07"},
            )
            db.add(job)
            db.flush()
            db.add(
                Report(
                    job_id=job.id,
                    owner_id=owner,
                    coverage_json=coverage,
                    created_at=later + timedelta(seconds=n),
                )
            )
        db.commit()
    rows = client.get("/api/v1/reports", params={"from": "2026-10-12"}).json()
    assert [r["id"] for r in rows] == [report["id"]]
    assert len(client.get("/api/v1/reports").json()) == 500


def test_admin_overview_jobs_and_users(client, app, report_body):
    report = generate(client, app, report_body)
    overview = client.get("/api/v1/admin/overview").json()
    assert overview["counts"]["reports"] == 1
    assert overview["counts"]["drafts"] == 1
    assert overview["counts"]["users"] == 1
    assert sum(overview["jobs_by_status"].values()) == 1
    assert len(overview["daily_reports"]) == 14
    assert overview["daily_reports"][-1]["count"] == 1

    [job] = client.get("/api/v1/admin/jobs").json()
    assert job["principal"] == "demo"
    assert job["report_id"] == report["id"]
    assert job["duration_seconds"] is not None
    assert client.get("/api/v1/admin/jobs?status=failed").json() == []

    [user] = client.get("/api/v1/admin/users").json()
    assert user["principal"] == "demo"
    assert user["role"] == "admin"
    assert user["report_count"] == 1
    assert user["last_seen_at"]
