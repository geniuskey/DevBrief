from app.models.entities import Commit, CommitPRLink, GitHubEvent, PullRequest, Review, SyncRun


def store_collection(db, job_id, request, collection):
    start, end = request.window()
    db.add(SyncRun(id=job_id, start_utc=start, end_utc=end, scope_json=collection.coverage["scope_repos"],
                   status=collection.coverage["status"], coverage_json=collection.coverage))
    db.flush()
    for event in collection.events.values():
        row = {**event, "id": job_id + ":" + event["id"][:40], "sync_run_id": job_id}
        db.add(GitHubEvent(**row))
    for model, entries in [(Commit, collection.commits), (PullRequest, collection.pulls), (Review, collection.reviews)]:
        for entry in entries.values():
            db.merge(model(**entry))
    for repo, sha, number in collection.links:
        db.merge(CommitPRLink(repo_id=repo, sha=sha, pr_number=number))
