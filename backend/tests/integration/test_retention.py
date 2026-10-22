from datetime import timedelta

from sqlalchemy import select, update

from app.models.entities import GitHubEvent, Job, Report, SyncRun, utcnow
from app.worker.retention import purge_cache
from app.worker.runner import run_once


def test_expiry_removes_cached_payload_but_preserves_report_and_evidence(client, app, report_body):
    jid = client.post("/api/v1/reports", json=report_body).json()["job_id"]
    run_once(app.state.factory, app.state.settings)
    with app.state.factory() as db:
        db.execute(
            update(SyncRun).where(SyncRun.id == jid).values(finished_at=utcnow() - timedelta(days=100))
        )
        before = db.scalar(select(Report.markdown).where(Report.job_id == jid))
        db.commit()
    assert purge_cache(app.state.factory, 90)["events"] > 0
    purge_cache(app.state.factory, 90, execute=True)
    with app.state.factory() as db:
        events = list(db.scalars(select(GitHubEvent)))
        assert all(e.payload_min_json == {"expired": True} for e in events)
        assert all(e.url.startswith("https://") for e in events)
        assert db.scalar(select(Report.markdown).where(Report.job_id == jid)) == before
        assert db.get(Job, jid).status == "partial"
