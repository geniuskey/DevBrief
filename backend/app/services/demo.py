from datetime import datetime
from types import SimpleNamespace

from app.integrations.fakes import BASE, pull


def generate_demo(request, repositories):
    start, end = request.window()
    items, warnings = [], []
    failed = []
    for repo in repositories:
        if repo.full_name.endswith("restricted"):
            failed.append(repo.full_name)
            warnings.append({"code": "REPO_ACCESS_DENIED", "repository": repo.full_name, "message_ko": "저장소 접근 권한이 없습니다"})
        elif repo.full_name.endswith("vision") and start <= datetime.fromisoformat(pull()["merged_at"]) < end:
            contributors = [{"login": login, "role": role} for login, role in [("alice", "author"), ("bob", "reviewer")] if login in request.github_logins]
            if contributors:
                items.append(SimpleNamespace(repo_id=repo.id, title_ko="ROI 경계 오류 수정", summary_ko="ROI 경계 오류 수정과 리팩터링·테스트 변경을 하나의 PR로 정리했습니다.",
                    status="PR 병합 완료", category="개발", evidence=[{"id": "demo-pr-42", "label": "PR #42", "url": f"{BASE}/{repo.full_name}/pull/42"}],
                    contributors=contributors, confidence=1.0, unsupported_claims=[], excluded=False))
    count = len(repositories)
    coverage = {"repositories_requested": count, "repositories_succeeded": count - len(failed), "repositories_failed": len(failed),
                "scope_repos": [r.full_name for r in repositories], "failed_repos": failed, "excluded_repos": [],
                "branches_checked": {r.full_name: ["main", "PR branches"] for r in repositories if r.full_name not in failed},
                "is_complete": not failed, "status": "partial" if failed else "complete", "collected_at": datetime.now().astimezone().isoformat()}
    return items, coverage, warnings
