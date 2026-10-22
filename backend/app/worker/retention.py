"""Clear expired source caches; retain report text, revision history and evidence URLs."""

import argparse
from datetime import timedelta

from sqlalchemy import delete, select, update

from app.core.db import make_engine, session_factory
from app.core.security import audit
from app.core.settings import get_settings
from app.models.entities import Commit, CommitPRLink, GitHubEvent, PullRequest, Review, SyncRun, utcnow


def purge_cache(factory, days: int, execute: bool = False) -> dict:
    cutoff = utcnow() - timedelta(days=days)
    with factory() as db:
        events = GitHubEvent.sync_run_id.in_(select(SyncRun.id).where(SyncRun.finished_at < cutoff))
        result = {
            "events": len(list(db.scalars(select(GitHubEvent.id).where(events)))),
            "commits": len(list(db.scalars(select(Commit.sha).where(Commit.committed_at < cutoff)))),
            "pull_requests": len(
                list(db.scalars(select(PullRequest.number).where(PullRequest.cached_at < cutoff)))
            ),
            "reviews": len(list(db.scalars(select(Review.review_id).where(Review.submitted_at < cutoff)))),
            "executed": execute,
        }
        if execute:
            db.execute(update(GitHubEvent).where(events).values(payload_min_json={"expired": True}))
            for commit in db.scalars(select(Commit).where(Commit.committed_at < cutoff)):
                db.execute(
                    delete(CommitPRLink)
                    .execution_options(synchronize_session=False)
                    .where(CommitPRLink.repo_id == commit.repo_id, CommitPRLink.sha == commit.sha)
                )
            db.execute(
                delete(Commit)
                .execution_options(synchronize_session=False)
                .where(Commit.committed_at < cutoff)
            )
            db.execute(
                delete(PullRequest)
                .execution_options(synchronize_session=False)
                .where(PullRequest.cached_at < cutoff)
            )
            db.execute(
                delete(Review)
                .execution_options(synchronize_session=False)
                .where(Review.submitted_at < cutoff)
            )
            audit(db, "retention-worker", "cache.expired")
            db.commit()
        return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--execute", action="store_true", help="Actually purge; default is a dry run")
    args = parser.parse_args()
    settings = get_settings()
    print(
        purge_cache(
            session_factory(make_engine(settings.database_url)), settings.retention_days, args.execute
        )
    )


if __name__ == "__main__":
    main()
