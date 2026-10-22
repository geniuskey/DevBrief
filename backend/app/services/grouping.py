from collections import defaultdict
from types import SimpleNamespace

LABELS = {
    "pr_opened": "PR 생성",
    "pr_merged": "PR 병합",
    "pr_closed": "PR 종료",
    "pr_reviewed": "리뷰",
    "commit_authored": "커밋",
}


def group_work(collection):
    linked = defaultdict(list)
    for repo, sha, number in sorted(collection.links):
        linked[(repo, sha)].append(number)
    groups = defaultdict(list)
    for event in collection.events.values():
        repo = event["repo_id"]
        pr = event["payload_min_json"].get("pr_number")
        if event["source_type"] == "commit" and linked[(repo, event["source_id"])]:
            # One SHA linked to multiple PRs is credited once, deterministically to the lowest PR number.
            pr = min(linked[(repo, event["source_id"])])
        key = (repo, f"pr:{pr}" if pr is not None else f"commit:{event['source_id']}")
        groups[key].append(event)
    items = []
    for (repo, group_key), events in sorted(groups.items()):
        pr = (
            collection.pulls.get((repo, int(group_key.split(":")[1])))
            if group_key.startswith("pr:")
            else None
        )
        title = pr["title"] if pr else events[0]["payload_min_json"]["title"]
        contributors = sorted(
            {(e["actor"], "reviewer" if e["event_type"] == "pr_reviewed" else "author") for e in events}
        )
        evidence = [
            {
                "id": e["id"],
                "url": e["url"],
                "label": f"{LABELS[e['event_type']]} {e['source_id'][:7]}",
                "event_type": e["event_type"],
                "occurred_at": e["occurred_at"].isoformat(),
            }
            for e in events
        ]
        actions = " · ".join(dict.fromkeys(LABELS[e["event_type"]] for e in events))
        items.append(
            SimpleNamespace(
                repo_id=repo,
                title_ko=title,
                summary_ko=f"{title}: {actions} 활동이 기록되었습니다.",
                category="개발",
                status=pr["state"] if pr else "커밋 기록",
                confidence=1.0,
                evidence=evidence,
                contributors=[{"login": login, "role": role} for login, role in contributors],
                unsupported_claims=[],
                excluded=False,
                source={
                    "title": title,
                    "body": pr["body_redacted"] if pr else "",
                    "events": [e["payload_min_json"] for e in events],
                },
            )
        )
    return items
