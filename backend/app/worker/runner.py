import threading
import time
from datetime import timedelta

from sqlalchemy import and_, or_, select, update

from app.core.db import make_engine, session_factory
from app.core.security import AppError, Principal, audit, permitted_repositories, seed_repositories
from app.core.settings import get_settings
from app.integrations.ghes_client import GHESClient
from app.models.entities import AppUser, Job, Report, ReportRevision, Repository, Team, WorkItem, uid, utcnow
from app.schemas.contracts import ReportRequest
from app.services.analysis import analyze_work
from app.services.collection import collect
from app.services.grouping import group_work
from app.services.persistence import store_collection
from app.services.reporting import render_report


class LeaseLost(Exception):
    pass


def claim_job(factory, settings):
    with factory() as db:
        now = utcnow()
        eligible = or_(Job.status == "queued", and_(Job.status == "running", Job.lease_until < now))
        job = db.scalar(
            select(Job).where(eligible).order_by(Job.created_at).with_for_update(skip_locked=True).limit(1)
        )
        if not job:
            return None
        if job.retry_count >= settings.job_max_attempts:
            job.status, job.error_code, job.finished_at = "failed", "WORKER_RETRY_EXHAUSTED", now
            db.commit()
            return None
        token = uid()
        result = db.execute(
            update(Job)
            .execution_options(synchronize_session=False)
            .where(Job.id == job.id, eligible)
            .values(
                status="running",
                stage="collecting",
                progress=5,
                retry_count=Job.retry_count + 1,
                lease_token=token,
                lease_until=now + timedelta(seconds=settings.lease_seconds),
            )
        )
        db.commit()
        return (job.id, token) if result.rowcount else None


def run_once(factory, settings) -> bool:
    claimed = claim_job(factory, settings)
    if not claimed:
        return False
    job_id, token = claimed
    started = time.monotonic()
    stop, lost = threading.Event(), threading.Event()

    def touch(stage=None, progress=None):
        if time.monotonic() - started > settings.job_timeout_seconds:
            raise AppError("JOB_TIMEOUT", "작업 시간 제한을 초과했습니다")
        values = {"lease_until": utcnow() + timedelta(seconds=settings.lease_seconds)}
        if stage is not None:
            values.update(stage=stage, progress=progress)
        with factory() as db:
            updated = db.execute(
                update(Job)
                .where(Job.id == job_id, Job.lease_token == token, Job.status == "running")
                .values(**values)
            )
            db.commit()
            if not updated.rowcount:
                lost.set()
                raise LeaseLost

    def heartbeat():
        while not stop.wait(max(settings.lease_seconds / 3, 0.2)):
            try:
                touch()
            except Exception:
                lost.set()
                return

    thread = threading.Thread(target=heartbeat, daemon=True)
    thread.start()
    try:
        with factory() as db:
            job = db.get(Job, job_id)
            request = ReportRequest.model_validate(job.request_json)
            user = db.get(AppUser, job.requested_by)
            role = (
                "admin"
                if user.principal in {x.strip() for x in settings.admin_principals.split(",")}
                else "author"
            )
            allowed = {
                r.id for r in permitted_repositories(db, Principal(user.id, user.principal, role), settings)
            }
            if not user.active or not set(request.repository_ids) <= allowed:
                raise AppError("REPO_PERMISSION_CHANGED", "요청 후 접근 권한이 변경되었습니다")
            repositories = list(
                db.scalars(
                    select(Repository)
                    .where(Repository.id.in_(request.repository_ids))
                    .order_by(Repository.full_name)
                )
            )
        client = GHESClient(settings)
        try:
            collection = collect(client, request, repositories, touch)
        finally:
            client.close()
        items = group_work(collection)
        coverage, warnings = collection.coverage, collection.warnings
        analyze_work(items, settings, warnings, touch)
        if any(i.unsupported_claims for i in items) and coverage["status"] == "complete":
            coverage["status"], coverage["is_complete"] = "partial", False
        touch("rendering", 95)
        stop.set()
        thread.join(timeout=2)
        if lost.is_set():
            raise LeaseLost
        with factory() as db:
            # Fencing: expired/cancelled/reclaimed workers cannot publish or overwrite a successor.
            fenced = db.execute(
                update(Job)
                .where(
                    Job.id == job_id,
                    Job.lease_token == token,
                    Job.status == "running",
                    Job.lease_until > utcnow(),
                )
                .values(stage="saving")
            )
            if not fenced.rowcount:
                raise LeaseLost
            job = db.get(Job, job_id)
            if coverage["status"] == "failed":
                job.status, job.stage, job.progress, job.error_code = (
                    "failed",
                    "failed",
                    100,
                    "COLLECTION_FAILED",
                )
            else:
                store_collection(db, job.id, request, collection)
                report = Report(
                    job_id=job.id,
                    owner_id=job.requested_by,
                    team_id=request.team_id if request.team_id and db.get(Team, request.team_id) else None,
                    coverage_json=coverage,
                )
                db.add(report)
                db.flush()
                stored = []
                for item in items:
                    values = {k: v for k, v in vars(item).items() if k != "source"}
                    row = WorkItem(report_id=report.id, **values)
                    # Evidence ID resolves to persisted normalized event, scoped to this sync run.
                    row.evidence = [{**e, "id": job.id + ":" + e["id"][:40]} for e in row.evidence]
                    db.add(row)
                    stored.append(row)
                db.flush()
                report.markdown = render_report(
                    job.request_json, sorted(stored, key=lambda i: i.id), coverage, warnings
                )
                db.add(
                    ReportRevision(
                        report_id=report.id,
                        revision=1,
                        editor_id=job.requested_by,
                        content_md=report.markdown,
                    )
                )
                job.status, job.stage, job.progress = coverage["status"], "report_ready", 100
                audit(db, "worker", "report.generated", report.id)
            job.coverage_json, job.warnings, job.finished_at, job.lease_until = (
                coverage,
                warnings,
                utcnow(),
                None,
            )
            job.lease_token = None
            db.commit()
    except LeaseLost:
        pass
    except Exception as exc:
        with factory() as db:
            code = exc.code if isinstance(exc, AppError) else "REPORT_GENERATION_FAILED"
            db.execute(
                update(Job)
                .where(Job.id == job_id, Job.lease_token == token, Job.status == "running")
                .values(
                    status="failed",
                    stage="failed",
                    error_code=code,
                    lease_until=None,
                    lease_token=None,
                    finished_at=utcnow(),
                )
            )
            audit(db, "worker", "job.failed", job_id, result=code)
            db.commit()
    finally:
        stop.set()
        thread.join(timeout=2)
    return True


def main():
    settings = get_settings()
    from app.core.logging import configure_logging

    configure_logging(settings)
    engine = make_engine(settings.database_url)
    factory = session_factory(engine)
    with factory() as db:
        seed_repositories(db, settings)
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
    except KeyboardInterrupt:
        pass
    finally:
        if lock_file:
            lock_file.close()


if __name__ == "__main__":
    main()
