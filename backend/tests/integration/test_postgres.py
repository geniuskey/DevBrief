import os
from concurrent.futures import ThreadPoolExecutor

import pytest
from sqlalchemy import select

from app.core.db import make_engine, session_factory
from app.core.security import seed_repositories
from app.core.settings import Settings
from app.models.entities import AppUser, Job, Report, Repository
from app.worker.runner import claim_job, run_once


@pytest.mark.skipif(
    not os.getenv("POSTGRES_TEST_URL"), reason="Dedicated PostgreSQL test instance not configured"
)
def test_postgres_skip_locked_and_end_to_end():
    settings = Settings(database_url=os.environ["POSTGRES_TEST_URL"], _env_file=None)
    engine = make_engine(settings.database_url)
    factory = session_factory(engine)
    with factory() as db:
        seed_repositories(db, settings)
        user = db.scalar(select(AppUser).where(AppUser.principal == "demo"))
        if user is None:
            user = AppUser(principal="demo", display_name="demo", role="admin")
            db.add(user)
            db.flush()
        repo = db.scalar(select(Repository).where(Repository.full_name == "example-org/vision"))
        job = Job(
            requested_by=user.id,
            request_json={
                "type": "team",
                "github_logins": ["alice", "bob"],
                "repository_ids": [repo.id],
                "start_date": "2026-10-12",
                "end_date": "2026-10-18",
                "timezone": "Asia/Seoul",
                "policy": "metadata_only",
            },
        )
        db.add(job)
        db.commit()
        jid = job.id
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: claim_job(factory, settings), range(2)))
    assert sum(r is not None for r in results) == 1
    with factory() as db:
        row = db.get(Job, jid)
        row.status = "queued"
        row.lease_token = None
        row.lease_until = None
        db.commit()
    assert run_once(factory, settings)
    with factory() as db:
        row = db.get(Job, jid)
        assert row.status == "complete", row.error_code
        report = db.scalar(select(Report).where(Report.job_id == jid))
        assert "ROI" in report.markdown
    engine.dispose()
