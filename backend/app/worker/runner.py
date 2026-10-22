import time
from datetime import timedelta

from sqlalchemy import and_, or_, select, update

from app.core.db import make_engine, session_factory
from app.core.security import audit, seed_repositories
from app.core.settings import get_settings
from app.integrations.ghes_client import GHESClient
from app.models.entities import Job, Report, ReportRevision, Repository, WorkItem, uid, utcnow
from app.schemas.contracts import ReportRequest
from app.services.collection import collect
from app.services.grouping import group_work
from app.services.persistence import store_collection
from app.services.reporting import render_report


def claim_job(factory, settings):
    with factory() as db:
        now = utcnow()
        eligible = or_(Job.status == "queued", and_(Job.status == "running", Job.lease_until < now))
        job = db.scalar(select(Job).where(eligible).order_by(Job.created_at).with_for_update(skip_locked=True).limit(1))
        if not job:
            return None
        if job.retry_count >= settings.job_max_attempts:
            job.status, job.error_code, job.finished_at = "failed", "WORKER_RETRY_EXHAUSTED", now
            db.commit()
            return None
        token = uid()
        result = db.execute(update(Job).where(Job.id == job.id, eligible).values(
            status="running", stage="collecting", progress=5, retry_count=Job.retry_count + 1,
            lease_token=token, lease_until=now + timedelta(seconds=settings.lease_seconds)))
        db.commit()
        return (job.id, token) if result.rowcount else None


def run_once(factory, settings) -> bool:
    claimed = claim_job(factory, settings)
    if not claimed:
        return False
    job_id, token = claimed
    try:
        with factory() as db:
            job = db.get(Job, job_id)
            request = ReportRequest.model_validate(job.request_json)
            repositories = list(db.scalars(select(Repository).where(Repository.id.in_(request.repository_ids))))
            client = GHESClient(settings)
            try:
                collection = collect(client, request, repositories)
            finally:
                client.close()
            items = group_work(collection)
            coverage, warnings = collection.coverage, collection.warnings
            store_collection(db, job.id, request, collection)
            report = Report(job_id=job.id, owner_id=job.requested_by, team_id=request.team_id, coverage_json=coverage)
            db.add(report)
            db.flush()
            stored = []
            for item in items:
                values = {k: v for k, v in vars(item).items() if k != "source"}
                row = WorkItem(report_id=report.id, **values)
                db.add(row)
                stored.append(row)
            db.flush()
            report.markdown = render_report(job.request_json, stored, coverage, warnings)
            db.add(ReportRevision(report_id=report.id, revision=1, editor_id=job.requested_by, content_md=report.markdown))
            job.status, job.stage, job.progress = coverage["status"], "report_ready", 100
            job.coverage_json, job.warnings, job.finished_at, job.lease_until = coverage, warnings, utcnow(), None
            audit(db, "worker", "report.generated", report.id)
            db.commit()
    except Exception:
        with factory() as db:
            db.execute(update(Job).where(Job.id == job_id, Job.lease_token == token).values(
                status="failed", stage="failed", error_code="REPORT_GENERATION_FAILED", lease_until=None, finished_at=utcnow()))
            db.commit()
    return True


def main():
    settings = get_settings()
    engine = make_engine(settings.database_url)
    factory = session_factory(engine)
    with factory() as db:
        seed_repositories(db, settings)
    # OS lock prevents competing SQLite workers across processes on one host.
    lock_file = None
    if settings.database_url.startswith("sqlite"):
        import fcntl
        from pathlib import Path
        lock_path = str(Path(engine.url.database).resolve()) + ".worker.lock"
        lock_file = open(lock_path, "w")
        fcntl.flock(lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
    try:
        while True:
            if not run_once(factory, settings):
                time.sleep(1)
    finally:
        if lock_file:
            lock_file.close()


if __name__ == "__main__":
    main()
