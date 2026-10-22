from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from app.models.entities import Commit, CommitPRLink, GitHubEvent, PullRequest, Review, SyncRun, utcnow


def upsert(db, model, values: dict):
    """Atomic insert-or-update: concurrent workers share these cache rows, and
    `merge` (SELECT then INSERT) lets the slower one fail on the primary key."""
    insert_fn = pg_insert if db.bind.dialect.name == "postgresql" else sqlite_insert
    stmt = insert_fn(model).values(**values)
    keys = [c.name for c in model.__table__.primary_key.columns]
    changes = {k: stmt.excluded[k] for k in values if k not in keys}
    db.execute(
        stmt.on_conflict_do_update(index_elements=keys, set_=changes)
        if changes
        else stmt.on_conflict_do_nothing(index_elements=keys)
    )


def store_collection(db, job_id, request, collection):
    start, end = request.window()
    db.add(
        SyncRun(
            id=job_id,
            start_utc=start,
            end_utc=end,
            scope_json=collection.coverage["scope_repos"],
            status=collection.coverage["status"],
            coverage_json=collection.coverage,
        )
    )
    db.flush()
    for event in collection.events.values():
        row = {**event, "id": job_id + ":" + event["id"][:40], "sync_run_id": job_id}
        db.add(GitHubEvent(**row))
    for model, entries in [
        (Commit, collection.commits),
        (PullRequest, collection.pulls),
        (Review, collection.reviews),
    ]:
        for entry in entries.values():
            values = {**entry, "cached_at": utcnow()} if model is PullRequest else entry
            upsert(db, model, values)
    for repo, sha, number in collection.links:
        upsert(db, CommitPRLink, {"repo_id": repo, "sha": sha, "pr_number": number})
