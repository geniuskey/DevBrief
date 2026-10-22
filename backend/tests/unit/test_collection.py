from types import SimpleNamespace

import httpx

from app.core.settings import Settings
from app.integrations.fakes import FakeGHES, commit
from app.integrations.ghes_client import GHESClient
from app.schemas.contracts import ReportRequest
from app.services.collection import collect
from app.services.grouping import group_work


def request(logins=None, **kwargs):
    return ReportRequest(
        github_logins=logins or ["alice", "bob"],
        repository_ids=["repo"],
        start_date="2026-10-12",
        end_date="2026-10-18",
        **kwargs,
    )


def test_pr_branch_commits_dedupe_and_review_only():
    client = GHESClient(Settings(_env_file=None))
    repo = SimpleNamespace(id="repo", full_name="example-org/vision")
    result = collect(client, request(), [repo])
    assert len(result.commits) == 3
    assert len(result.reviews) == 1
    assert len(group_work(result)) == 1
    assert {c["login"]: c["role"] for c in group_work(result)[0].contributors} == {
        "alice": "author",
        "bob": "reviewer",
    }
    assert "PRIVATE DIFF" not in str(result)
    assert "비공개 리뷰 본문" not in str(result)
    review_only = group_work(collect(client, request(["bob"]), [repo]))
    assert review_only[0].contributors == [{"login": "bob", "role": "reviewer"}]
    assert all(e["event_type"] == "pr_reviewed" for e in review_only[0].evidence)
    client.close()


def test_exact_time_boundary_and_duplicates():
    fake = FakeGHES()

    def handler(req):
        if req.url.path.endswith("/pulls"):
            return httpx.Response(200, json=[])
        if req.url.path.endswith("/commits"):
            at_start = commit("a" * 40, "start", date="2026-10-11T15:00:00Z")
            at_end = commit("b" * 40, "end", date="2026-10-18T15:00:00Z")
            return httpx.Response(200, json=[at_start, at_start, at_end])
        return fake(req)

    client = GHESClient(Settings(_env_file=None), httpx.MockTransport(handler))
    result = collect(client, request(["alice"]), [SimpleNamespace(id="repo", full_name="example-org/vision")])
    assert len(result.events) == 1
    assert len(result.commits) == 1
    client.close()


def test_empty_period():
    client = GHESClient(Settings(_env_file=None))
    body = ReportRequest(
        github_logins=["alice"], repository_ids=["repo"], start_date="2026-09-01", end_date="2026-09-07"
    )
    result = collect(client, body, [SimpleNamespace(id="repo", full_name="example-org/vision")])
    assert not result.events
    assert result.coverage["status"] == "complete"
    client.close()


REPO = SimpleNamespace(id="repo", full_name="example-org/vision")


def test_unknown_login_warns_without_dropping_others():
    client = GHESClient(Settings(_env_file=None))
    result = collect(client, request(["alice", "nosuchuser"]), [REPO])
    assert result.coverage["status"] == "complete"
    assert result.commits
    assert [w["code"] for w in result.warnings if w["code"] == "USER_NOT_FOUND"] == ["USER_NOT_FOUND"]
    client.close()


def test_empty_commit_message_is_collected():
    fake = FakeGHES()

    def handler(req):
        if req.url.path.endswith("/pulls"):
            return httpx.Response(200, json=[])
        if req.url.path.endswith("/commits"):
            return httpx.Response(200, json=[commit("d" * 40, "")])
        return fake(req)

    client = GHESClient(Settings(_env_file=None), httpx.MockTransport(handler))
    result = collect(client, request(["alice"]), [REPO])
    assert result.coverage["status"] == "complete"
    assert len(result.commits) == 1
    client.close()


def test_truncated_pr_commits_keep_collecting_reviews():
    fake = FakeGHES()

    def handler(req):
        response = fake(req)
        if req.url.path.endswith("/pulls/42"):
            # The PR claims more commits than the commits API returned.
            return httpx.Response(200, json={**response.json(), "commits": 999})
        return response

    client = GHESClient(Settings(_env_file=None), httpx.MockTransport(handler))
    result = collect(client, request(), [REPO])
    assert result.coverage["status"] == "partial"
    assert result.coverage["is_complete"] is False
    assert result.coverage["failed_repos"] == []
    assert len(result.reviews) == 1
    assert any(w["code"] == "PR_COMMITS_TRUNCATED" for w in result.warnings)
    client.close()
