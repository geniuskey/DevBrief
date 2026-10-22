from datetime import timedelta

from sqlalchemy import select, update

from app.models.entities import Job, Report, utcnow
from app.worker.runner import claim_job, run_once


def test_expired_lease_recovers_once(client, app, report_body):
    jid = client.post("/api/v1/reports", json=report_body).json()["job_id"]
    old = claim_job(app.state.factory, app.state.settings)
    assert old[0] == jid
    with app.state.factory() as db:
        db.execute(update(Job).where(Job.id == jid).values(lease_until=utcnow() - timedelta(seconds=1)))
        db.commit()
    assert run_once(app.state.factory, app.state.settings)
    assert not run_once(app.state.factory, app.state.settings)
    with app.state.factory() as db:
        assert len(list(db.scalars(select(Report).where(Report.job_id == jid)))) == 1
        assert db.get(Job, jid).retry_count == 2


def test_retry_exhaustion(client, app, report_body):
    jid = client.post("/api/v1/reports", json=report_body).json()["job_id"]
    with app.state.factory() as db:
        db.execute(
            update(Job)
            .where(Job.id == jid)
            .values(
                status="running",
                retry_count=app.state.settings.job_max_attempts,
                lease_until=utcnow() - timedelta(seconds=1),
            )
        )
        db.commit()
    assert not run_once(app.state.factory, app.state.settings)
    job = client.get(f"/api/v1/jobs/{jid}").json()
    assert job["status"] == "failed"
    assert job["error_code"] == "WORKER_RETRY_EXHAUSTED"


def test_cancel_during_analysis_does_not_publish(client, app, report_body, monkeypatch):
    jid = client.post("/api/v1/reports", json=report_body).json()["job_id"]

    def cancel(*args):
        assert client.post(f"/api/v1/jobs/{jid}/cancel").status_code == 200

    monkeypatch.setattr("app.worker.runner.analyze_work", cancel)
    run_once(app.state.factory, app.state.settings)
    job = client.get(f"/api/v1/jobs/{jid}").json()
    assert job["status"] == "cancelled"
    assert job["report_id"] is None
