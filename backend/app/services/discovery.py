import re
from datetime import UTC, datetime
from urllib.parse import quote

from sqlalchemy import select

from app.core.security import AppError, Principal, insert_if_absent, permitted_repositories
from app.core.settings import Settings
from app.integrations.ghes_client import GHESClient
from app.models.entities import Repository
from app.schemas.contracts import ReportRequest
from app.services.collection import timestamp


def as_utc(value: datetime | None) -> datetime | None:
    # SQLite drops tzinfo; values are always stored as UTC.
    return value if value is None or value.tzinfo else value.replace(tzinfo=UTC)


def discover_org(db, client: GHESClient, org: str) -> int:
    """Upsert every repository the PAT can list in `org` and disable discovered ones that disappeared."""
    listed: dict[str, datetime | None] = {}
    for entry in client.pages(f"orgs/{quote(org, safe='')}/repos", {"type": "all"}):
        name = str(entry.get("full_name", "")).lower()
        # Transferred repositories can still appear under the old owner; keep only this org.
        if name.split("/")[0] != org or not re.fullmatch(r"[a-z0-9_.-]+/[a-z0-9_.-]+", name):
            continue
        listed[name] = timestamp(entry["pushed_at"]) if entry.get("pushed_at") else None
    existing = set(db.scalars(select(Repository.full_name)))
    for name in listed.keys() - existing:
        insert_if_absent(db, Repository, {"full_name": name, "discovered": True}, "full_name")
    for repo in db.scalars(select(Repository).where(Repository.full_name.like(org + "/%"))):
        if repo.full_name.split("/")[0] != org:
            continue
        if repo.full_name in listed:
            repo.pushed_at, repo.access_state = listed[repo.full_name], "accessible"
            if repo.discovered:
                repo.enabled = True
        elif repo.discovered:
            # Rows stay for historical reports (FK RESTRICT); they just leave the selectable scope.
            repo.enabled, repo.access_state = False, "not_listed"
    db.commit()
    return len(listed)


def sync_org_scopes(factory, settings: Settings) -> dict[str, dict]:
    results: dict[str, dict] = {}
    if not settings.org_scopes:
        return results
    client = GHESClient(settings)
    try:
        for org in settings.org_scopes:
            with factory() as db:
                try:
                    results[org] = {"state": "synced", "repositories": discover_org(db, client, org)}
                except (AppError, KeyError, TypeError, ValueError) as exc:
                    db.rollback()
                    code = exc.code if isinstance(exc, AppError) else "GHES_SCHEMA_ERROR"
                    results[org] = {"state": code, "repositories": None}
    finally:
        client.close()
    return results


def resolve_repositories(
    db, client: GHESClient, settings: Settings, principal: Principal, request: ReportRequest
) -> tuple[list[Repository], list[str], list[dict]]:
    """Expand org scopes at run time so repositories created after the request are included."""
    warnings: list[dict] = []
    for org in request.organizations:
        try:
            discover_org(db, client, org)
        except (AppError, KeyError, TypeError, ValueError) as exc:
            db.rollback()
            code = exc.code if isinstance(exc, AppError) else "GHES_SCHEMA_ERROR"
            warnings.append(
                {
                    "code": "ORG_DISCOVERY_FAILED",
                    "repository": org,
                    "message_ko": f"조직 저장소 목록을 갱신하지 못해 마지막으로 확인된 목록을 사용합니다 ({code})",
                }
            )
    permitted = permitted_repositories(db, principal, settings)
    explicit = [r for r in permitted if r.id in set(request.repository_ids)]
    start, _ = request.window()
    org_repos = [
        r for r in permitted if r.full_name.split("/")[0] in request.organizations and r not in explicit
    ]
    pushed = [as_utc(r.pushed_at) for r in org_repos]
    active = [r for r, at in zip(org_repos, pushed, strict=True) if at is None or at >= start]
    inactive = sorted(r.full_name for r in org_repos if r not in active)
    excluded = list(inactive)
    if inactive:
        warnings.append(
            {
                "code": "ORG_INACTIVE_SKIPPED",
                "message_ko": f"기간 내 push가 없는 조직 저장소 {len(inactive)}개는 조사하지 않았습니다. "
                "오래된 PR에만 남긴 리뷰는 누락될 수 있습니다",
            }
        )
    if len(active) > settings.org_max_repositories:
        latest = datetime.max.replace(tzinfo=UTC)
        active.sort(key=lambda r: as_utc(r.pushed_at) or latest, reverse=True)
        dropped = active[settings.org_max_repositories :]
        active = active[: settings.org_max_repositories]
        excluded += sorted(r.full_name for r in dropped)
        warnings.append(
            {
                "code": "ORG_REPO_LIMIT",
                "message_ko": f"조직 저장소 조사 한도({settings.org_max_repositories}개)를 넘어 "
                f"최근 push가 오래된 {len(dropped)}개 저장소를 제외했습니다",
            }
        )
    return sorted(explicit + active, key=lambda r: r.full_name), excluded, warnings
