import hashlib
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from urllib.parse import quote

from app.core.security import AppError, redact, validated_url
from app.integrations.ghes_client import GHESClient, IntegrationError
from app.schemas.contracts import ReportRequest


@dataclass
class Collection:
    events: dict = field(default_factory=dict)
    commits: dict = field(default_factory=dict)
    pulls: dict = field(default_factory=dict)
    links: set = field(default_factory=set)
    reviews: dict = field(default_factory=dict)
    coverage: dict = field(default_factory=dict)
    warnings: list = field(default_factory=list)


def timestamp(value: str) -> datetime:
    result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if not result.tzinfo:
        raise IntegrationError("GHES_SCHEMA_ERROR", "활동 시간대가 누락되었습니다")
    return result.astimezone(UTC)


def collect(
    client: GHESClient, request: ReportRequest, repositories: list, progress=lambda *_: None
) -> Collection:
    result = Collection()
    start, end = request.window()
    logins = set()
    for login in request.github_logins:
        account = client.user(login)
        logins.add(account["login"].lower())
        if account.get("type") == "Bot":
            result.warnings.append(
                {"code": "BOT_ACCOUNT", "message_ko": f"{login}: 봇 계정 활동이 포함됩니다"}
            )
    failed, succeeded, branches = [], [], {}
    secret_values = (
        (client.settings.secret("ghes_pat_file"), client.settings.secret("llm_api_key_file"))
        if client.settings.adapter_mode == "real"
        else ()
    )

    def clean(value, limit=4000):
        return redact(str(value or ""), secret_values)[:limit]

    def link(url, repo):
        validated_url(url, client.settings.ghes_base_url, api=False)
        from urllib.parse import urlsplit

        if not urlsplit(url).path.startswith("/" + repo.full_name + "/"):
            raise IntegrationError("UNSAFE_EVIDENCE_URL")
        # Encode markdown delimiters and whitespace, preserving the actual URL semantics.
        return quote(url, safe=":/?#=&%+@,;_~-.")

    def event(repo, source_type, source_id, kind, when, actor, url, payload):
        if not when:
            return
        occurred = timestamp(when)
        if not start <= occurred < end or actor.lower() not in logins:
            return
        key = hashlib.sha256(
            f"{repo.id}|{source_type}|{source_id}|{kind}|{occurred.isoformat()}".encode()
        ).hexdigest()
        if key not in result.events and len(result.events) >= client.settings.max_events:
            raise IntegrationError("EVENT_LIMIT", "최대 활동 수에 도달했습니다")
        result.events[key] = {
            "id": key,
            "repo_id": repo.id,
            "source_type": source_type,
            "source_id": str(source_id),
            "event_type": kind,
            "occurred_at": occurred,
            "actor": actor.lower(),
            "url": link(url, repo),
            "payload_min_json": payload,
        }

    def save_commit(repo, c, pr_number=None):
        sha = c["sha"]
        if pr_number is not None:
            result.links.add((repo.id, sha, pr_number))
        author = (c.get("author") or {}).get("login")
        committer = (c.get("committer") or {}).get("login")
        if not author:
            result.warnings.append(
                {
                    "code": "UNLINKED_AUTHOR",
                    "repository": repo.full_name,
                    "message_ko": f"커밋 {sha[:7]}의 GitHub 작성자가 연결되지 않았습니다",
                }
            )
            return
        if author.lower() not in logins:
            return
        occurred = timestamp(c["commit"]["committer"]["date"])
        if not start <= occurred < end:
            return
        message = clean(c["commit"]["message"])
        url = link(c["html_url"], repo)
        result.commits[(repo.id, sha)] = {
            "repo_id": repo.id,
            "sha": sha,
            "author": author.lower(),
            "committer": committer,
            "committed_at": occurred,
            "message": message,
            "url": url,
        }
        if committer and committer.lower() != author.lower():
            result.warnings.append(
                {
                    "code": "AUTHOR_COMMITTER_DIFFER",
                    "repository": repo.full_name,
                    "message_ko": f"커밋 {sha[:7]}의 author와 committer가 다릅니다. push 실행자로 해석하지 않습니다",
                }
            )
        event(
            repo,
            "commit",
            sha,
            "commit_authored",
            occurred.isoformat(),
            author,
            url,
            {"title": message.splitlines()[0], "message": message},
        )

    for index, repo in enumerate(repositories):
        progress("collecting", 5 + int(index / len(repositories) * 55))
        try:
            if repo.full_name not in client.settings.allowed_repos:
                raise IntegrationError("REPO_NOT_ALLOWED")
            root = "repos/" + repo.full_name
            info = client.object(root)
            branches[repo.full_name] = [info["default_branch"]]
            # updated sorting is only candidate discovery. Actual event timestamps decide membership.
            for candidate in client.pages(
                root + "/pulls", {"state": "all", "sort": "updated", "direction": "desc"}
            ):
                if timestamp(candidate["updated_at"]) < start:
                    break
                number = candidate["number"]
                pr = client.object(f"{root}/pulls/{number}")
                title, body = clean(pr["title"], 300), clean(pr.get("body"), 6000)
                state = (
                    "PR 병합 완료"
                    if pr.get("merged_at")
                    else "PR 종료"
                    if pr["state"] == "closed"
                    else "작업 중"
                )
                url = link(pr["html_url"], repo)
                author = pr["user"]["login"].lower()
                result.pulls[(repo.id, number)] = {
                    "repo_id": repo.id,
                    "number": number,
                    "title": title,
                    "body_redacted": body,
                    "author": author,
                    "state": state,
                    "url": url,
                }
                payload = {
                    "title": title,
                    "body": body,
                    "pr_number": number,
                    "status": state,
                    "files": [],
                    "labels": [clean(v["name"], 80) for v in pr.get("labels", [])][:30],
                }
                for kind, when in [
                    ("pr_opened", pr.get("created_at")),
                    ("pr_merged", pr.get("merged_at")),
                    ("pr_closed", pr.get("closed_at") if not pr.get("merged_at") else None),
                ]:
                    event(repo, "pull_request", number, kind, when, author, url, dict(payload))
                commits = list(client.pages(f"{root}/pulls/{number}/commits"))
                branches[repo.full_name].append(f"PR #{number}")
                for c in commits:
                    save_commit(repo, c, number)
                if len(commits) >= 250 or pr.get("commits", len(commits)) > len(commits):
                    raise IntegrationError(
                        "PR_COMMITS_TRUNCATED", "PR 커밋 API 한도로 일부 브랜치 커밋이 누락될 수 있습니다"
                    )
                for review in client.pages(f"{root}/pulls/{number}/reviews"):
                    reviewer = (review.get("user") or {}).get("login", "").lower()
                    submitted = review.get("submitted_at")
                    if not submitted or reviewer not in logins or not start <= timestamp(submitted) < end:
                        continue
                    review_url = link(review["html_url"], repo)
                    result.reviews[(repo.id, str(review["id"]))] = {
                        "repo_id": repo.id,
                        "review_id": str(review["id"]),
                        "pr_number": number,
                        "reviewer": reviewer,
                        "submitted_at": timestamp(submitted),
                        "state": clean(review["state"], 40),
                        "url": review_url,
                    }
                    event(
                        repo,
                        "review",
                        review["id"],
                        "pr_reviewed",
                        submitted,
                        reviewer,
                        review_url,
                        {**payload, "review_state": clean(review["state"], 40)},
                    )
                # Paths only: the response's patch field and review bodies are never persisted or sent to LLM.
                if any(
                    e["repo_id"] == repo.id and e["payload_min_json"].get("pr_number") == number
                    for e in result.events.values()
                ):
                    files = [clean(f["filename"], 300) for f in client.pages(f"{root}/pulls/{number}/files")]
                    for e in result.events.values():
                        if e["repo_id"] == repo.id and e["payload_min_json"].get("pr_number") == number:
                            e["payload_min_json"]["files"] = files[:200]
                    if len(files) > 200:
                        result.warnings.append(
                            {
                                "code": "FILE_PATHS_TRUNCATED",
                                "repository": repo.full_name,
                                "message_ko": "LLM 입력 파일 경로는 200개로 제한됩니다",
                            }
                        )
            for login in sorted(logins):
                params = {
                    "author": login,
                    "sha": info["default_branch"],
                    "since": (start - timedelta(seconds=1)).isoformat(),
                    "until": (end + timedelta(seconds=1)).isoformat(),
                }
                for c in client.pages(root + "/commits", params):
                    save_commit(repo, c)
            succeeded.append(repo.full_name)
        except (AppError, KeyError, TypeError, ValueError) as exc:
            failed.append(repo.full_name)
            result.warnings.append(
                {
                    "code": exc.code if isinstance(exc, AppError) else "GHES_SCHEMA_ERROR",
                    "repository": repo.full_name,
                    "message_ko": exc.message
                    if isinstance(exc, AppError)
                    else "예상한 GHES 응답 형식과 다릅니다",
                }
            )
    status = "complete" if not failed else "partial" if succeeded or result.events else "failed"
    result.warnings.append(
        {
            "code": "COVERAGE_BOUNDARY",
            "message_ko": "기본 브랜치와 기간 관련 PR만 조사했습니다. 미연결 이메일·공동 저자·squash 귀속은 완전성을 보장하지 않습니다. PR 상태는 수집 시점 기준입니다",
        }
    )
    result.coverage = {
        "scope_repos": [r.full_name for r in repositories],
        "branches_checked": branches,
        "excluded_repos": [],
        "failed_repos": failed,
        "repositories_requested": len(repositories),
        "repositories_succeeded": len(succeeded),
        "repositories_failed": len(failed),
        "is_complete": not failed,
        "status": status,
        "collected_at": datetime.now(UTC).isoformat(),
        "counts": {
            "events": len(result.events),
            "commits": len(result.commits),
            "pull_requests": len(result.pulls),
            "reviews": len(result.reviews),
        },
    }
    return result
