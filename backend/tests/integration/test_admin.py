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
