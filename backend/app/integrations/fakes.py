"""Deterministic GHES/OpenAI HTTP fixtures; real adapters use the same HTTP contract."""

import json

import httpx

BASE = "https://github.internal.example"


def account(login):
    return {
        "id": {"alice": 1, "bob": 2, "carol": 3}.get(login, 4),
        "login": login,
        "name": login.title(),
        "type": "Bot" if login.endswith("[bot]") else "User",
    }


def commit(sha, message, date="2026-10-13T02:00:00Z", login="alice", repo="example-org/vision"):
    return {
        "sha": sha,
        "author": account(login) if login else None,
        "committer": account(login) if login else None,
        "html_url": f"{BASE}/{repo}/commit/{sha}",
        "commit": {"message": message, "committer": {"date": date}, "author": {"date": date}},
    }


def pull(number=42, repo="example-org/vision"):
    return {
        "id": number,
        "number": number,
        "title": "ROI bounds fix",
        "body": "ROI 경계 오류 수정 및 회귀 테스트 추가",
        "user": account("alice"),
        "state": "closed",
        "created_at": "2026-10-12T01:00:00Z",
        "updated_at": "2026-10-16T01:00:00Z",
        "merged_at": "2026-10-16T01:00:00Z",
        "closed_at": "2026-10-16T01:00:00Z",
        "html_url": f"{BASE}/{repo}/pull/{number}",
        "commits": 3,
        "labels": [{"name": "bug"}],
    }


class FakeGHES:
    def __init__(self):
        self.requests: list[str] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(str(request.url))
        path = request.url.path.removeprefix("/api/v3")
        headers = {"x-github-enterprise-version": "3.18.0", "x-ratelimit-remaining": "4999"}
        if path in {"/user", "/meta"}:
            data = account("demo") if path == "/user" else {"installed_version": "3.18.0"}
        elif path.startswith("/users/"):
            login = path.split("/")[-1].lower()
            if login not in {"alice", "bob", "carol", "build-bot"}:
                return httpx.Response(404, json={"message": "Not Found"})
            data = account(login)
        elif path.startswith("/repos/"):
            parts = path.split("/")
            repo = "/".join(parts[2:4])
            suffix = "/".join(parts[4:])
            if repo.endswith("/restricted"):
                return httpx.Response(403, json={"message": "Resource not accessible"})
            if not suffix:
                data = {
                    "id": 10 if repo.endswith("vision") else 11,
                    "full_name": repo,
                    "default_branch": "main",
                    "private": True,
                }
            elif suffix == "pulls":
                data = [pull(repo=repo)] if repo.endswith("vision") else []
            elif suffix == "pulls/42":
                data = pull(repo=repo)
            elif suffix == "pulls/42/commits":
                entries = [
                    commit("a" * 40, "ROI bounds fix"),
                    commit("b" * 40, "refactor statistics"),
                    commit("c" * 40, "add tests"),
                ]
                # Deliberately short pages exercise Link navigation even with per_page=100.
                page = int(request.url.params.get("page", 1))
                data = entries[:2] if page == 1 else entries[2:]
                if page == 1:
                    headers["link"] = (
                        f'<{BASE}/api/v3/repos/{repo}/pulls/42/commits?page=2&per_page=100>; rel="next"'
                    )
            elif suffix == "pulls/42/reviews":
                data = [
                    {
                        "id": 701,
                        "user": account("bob"),
                        "state": "APPROVED",
                        "submitted_at": "2026-10-15T04:00:00Z",
                        "html_url": f"{BASE}/{repo}/pull/42#pullrequestreview-701",
                        "body": "비공개 리뷰 본문: 수집 금지",
                    }
                ]
            elif suffix == "pulls/42/files":
                data = [
                    {
                        "filename": "src/roi.py",
                        "additions": 12,
                        "deletions": 3,
                        "patch": "PRIVATE DIFF MUST NOT LEAK",
                    }
                ]
            elif suffix == "commits":
                data = (
                    [commit("a" * 40, "ROI bounds fix")]
                    if repo.endswith("vision")
                    else [commit("d" * 40, "운영 설정 문서 갱신", repo=repo, login="carol")]
                )
                author = request.url.params.get("author")
                data = [c for c in data if not author or c["author"]["login"] == author]
            else:
                return httpx.Response(404, json={"message": "Not Found"})
        else:
            return httpx.Response(404, json={"message": "Not Found"})
        return httpx.Response(200, json=data, headers=headers)


class FakeLLM:
    def __call__(self, request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        data = json.loads(body["messages"][-1]["content"])
        title = data.get("title", "연결 검사")
        result = {
            "title_ko": "ROI 경계 오류 수정" if title == "ROI bounds fix" else title,
            "summary_ko": "ROI 경계 오류 수정과 관련 리팩터링·테스트 변경이 기록되었습니다."
            if title == "ROI bounds fix"
            else "제공된 변경 내역을 검토했습니다.",
            "category": "개발",
            "status": data.get("status", "검증 필요"),
            "contributors": data.get("contributors", []),
            "evidence_ids": [e["id"] for e in data.get("evidence", [])],
            "confidence": 0.9,
            "unsupported_claims": [],
        }
        return httpx.Response(
            200, json={"choices": [{"message": {"content": json.dumps(result, ensure_ascii=False)}}]}
        )
