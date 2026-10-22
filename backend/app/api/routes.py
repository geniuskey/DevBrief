from fastapi import Depends

from app.core.security import AppError, audit
from app.integrations.ghes_client import GHESClient


def register_routes(app, settings, db_session, principal, visible_report):
    def admin(user=Depends(principal)):
        if user.role != "admin":
            raise AppError("FORBIDDEN", "관리자 권한이 필요합니다", 403)
        return user

    @app.post("/api/v1/admin/connections/ghes/test")
    def test_ghes(user=Depends(admin), db=Depends(db_session)):
        client = GHESClient(settings)
        try:
            result = client.test_connection()
            result["repositories"] = []
            for name in settings.allowed_repos:
                try:
                    client.object("repos/" + name)
                    state = "accessible"
                except AppError as exc:
                    state = exc.code
                result["repositories"].append({"full_name": name, "state": state})
            audit(db, user, "connection.ghes_tested")
            db.commit()
            return result
        finally:
            client.close()

    @app.get("/api/v1/github/users")
    def github_users(q: str, user=Depends(principal)):
        import re

        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9-]{0,38}", q):
            raise AppError("INVALID_LOGIN", "정확한 GitHub ID를 입력하세요", 422)
        client = GHESClient(settings)
        try:
            account = client.user(q)
            return [
                {
                    "login": account["login"],
                    "github_numeric_id": account["id"],
                    "is_bot": account.get("type") == "Bot",
                }
            ]
        finally:
            client.close()

    @app.post("/api/v1/admin/connections/llm/test")
    def test_llm(user=Depends(admin), db=Depends(db_session)):
        from app.integrations.llm_client import LLMClient

        client = LLMClient(settings)
        try:
            result = client.test_connection()
            audit(db, user, "connection.llm_tested")
            db.commit()
            return result
        finally:
            client.close()

    from datetime import date

    from fastapi import Query, Response
    from sqlalchemy import select, update

    from app.core.security import permitted_repositories, redact
    from app.models.entities import AuditLog, Job, Report, ReportRevision, Team, WorkItem, utcnow
    from app.schemas.contracts import FinalizeRequest, TeamInput, WorkItemPatch
    from app.services.reporting import render_html, render_report

    def check_repos(repo_ids, db, user):
        allowed = {r.id for r in permitted_repositories(db, user, settings)}
        if not set(repo_ids) <= allowed:
            raise AppError("REPO_FORBIDDEN", "허용되지 않은 저장소입니다", 403)

    def accessible_team(team_id, db, user):
        team = db.get(Team, team_id)
        if not team or (team.created_by != user.id and user.role != "admin"):
            raise AppError("NOT_FOUND", "팀을 찾을 수 없습니다", 404)
        check_repos(team.repository_ids, db, user)
        return team

    def team_json(team):
        return {
            "id": team.id,
            "name": team.name,
            "github_logins": team.github_logins,
            "repository_ids": team.repository_ids,
        }

    @app.get("/api/v1/teams")
    def teams(user=Depends(principal), db=Depends(db_session)):
        rows = db.scalars(
            select(Team).where(Team.created_by == user.id) if user.role != "admin" else select(Team)
        )
        allowed = {r.id for r in permitted_repositories(db, user, settings)}
        return [team_json(t) for t in rows if set(t.repository_ids) <= allowed]

    @app.post("/api/v1/teams", status_code=201)
    def create_team(body: TeamInput, user=Depends(principal), db=Depends(db_session)):
        check_repos(body.repository_ids, db, user)
        team = Team(created_by=user.id, **body.model_dump())
        team.name = redact(team.name)
        db.add(team)
        db.flush()
        audit(db, user, "team.created", team.id)
        db.commit()
        return team_json(team)

    @app.get("/api/v1/teams/{team_id}")
    def get_team(team_id: str, user=Depends(principal), db=Depends(db_session)):
        return team_json(accessible_team(team_id, db, user))

    @app.put("/api/v1/teams/{team_id}")
    def edit_team(team_id: str, body: TeamInput, user=Depends(principal), db=Depends(db_session)):
        team = accessible_team(team_id, db, user)
        check_repos(body.repository_ids, db, user)
        team.name, team.github_logins, team.repository_ids = (
            redact(body.name),
            body.github_logins,
            body.repository_ids,
        )
        audit(db, user, "team.updated", team.id)
        db.commit()
        return team_json(team)

    @app.delete("/api/v1/teams/{team_id}")
    def delete_team(team_id: str, user=Depends(principal), db=Depends(db_session)):
        team = accessible_team(team_id, db, user)
        audit(db, user, "team.deleted", team.id)
        db.delete(team)
        db.commit()
        return {"deleted": True}

    @app.get("/api/v1/reports")
    def history(
        team_id: str | None = None,
        from_date: date | None = Query(None, alias="from"),
        to_date: date | None = Query(None, alias="to"),
        user=Depends(principal),
        db=Depends(db_session),
    ):
        stmt = select(Report, Job).join(Job, Report.job_id == Job.id).order_by(Report.created_at.desc())
        if user.role != "admin":
            stmt = stmt.where(Report.owner_id == user.id)
        if team_id:
            accessible_team(team_id, db, user)
            stmt = stmt.where(Report.team_id == team_id)
        allowed = {r.id for r in permitted_repositories(db, user, settings)}
        results = []
        for report, job in db.execute(stmt.limit(500)):
            req = job.request_json
            if not set(req["repository_ids"]) <= allowed:
                continue
            if from_date and req["end_date"] < from_date.isoformat():
                continue
            if to_date and req["start_date"] > to_date.isoformat():
                continue
            results.append(
                {
                    "id": report.id,
                    "status": report.status,
                    "created_at": report.created_at,
                    "start_date": req["start_date"],
                    "end_date": req["end_date"],
                    "team_id": report.team_id,
                    "coverage_status": report.coverage_json["status"],
                }
            )
        audit(db, user, "report.history_viewed")
        db.commit()
        return results

    @app.patch("/api/v1/reports/{report_id}/work-items/{work_item_id}")
    def edit_item(
        report_id: str,
        work_item_id: str,
        body: WorkItemPatch,
        user=Depends(principal),
        db=Depends(db_session),
    ):
        report = visible_report(report_id, db, user)
        item = db.get(WorkItem, work_item_id)
        if not item or item.report_id != report.id:
            raise AppError("NOT_FOUND", "업무를 찾을 수 없습니다", 404)
        if report.status != "draft":
            raise AppError("REPORT_FINALIZED", "확정된 보고서는 수정할 수 없습니다", 409)
        if item.version != body.version:
            raise AppError("VERSION_CONFLICT", "다른 편집 내용이 있습니다. 새로고침 후 다시 시도하세요", 409)
        revision = report.revision
        locked = db.execute(
            update(Report)
            .where(Report.id == report.id, Report.revision == revision, Report.status == "draft")
            .values(revision=revision + 1)
        )
        if not locked.rowcount:
            raise AppError("VERSION_CONFLICT", "보고서가 변경되었습니다. 다시 불러오세요", 409)
        secrets = (
            (settings.secret("ghes_pat_file"), settings.secret("llm_api_key_file"))
            if settings.adapter_mode == "real"
            else ()
        )
        for key, value in body.model_dump(exclude_unset=True, exclude={"version"}).items():
            if value is not None:
                setattr(item, key, redact(value, secrets) if isinstance(value, str) else value)
        item.version += 1
        item.edited_by = user.id
        db.flush()
        job = db.get(Job, report.job_id)
        rows = list(db.scalars(select(WorkItem).where(WorkItem.report_id == report.id).order_by(WorkItem.id)))
        report.markdown = render_report(job.request_json, rows, report.coverage_json, job.warnings)
        db.add(
            ReportRevision(
                report_id=report.id, revision=revision + 1, editor_id=user.id, content_md=report.markdown
            )
        )
        audit(db, user, "work_item.updated", item.id)
        db.commit()
        return {"id": item.id, "version": item.version, "report_revision": revision + 1}

    @app.post("/api/v1/reports/{report_id}/finalize")
    def finalize(report_id: str, body: FinalizeRequest, user=Depends(principal), db=Depends(db_session)):
        report = visible_report(report_id, db, user)
        result = db.execute(
            update(Report)
            .where(Report.id == report.id, Report.status == "draft", Report.revision == body.revision)
            .values(status="finalized", finalized_at=utcnow(), revision=body.revision + 1)
        )
        if not result.rowcount:
            raise AppError("VERSION_CONFLICT", "보고서가 변경되었거나 이미 확정되었습니다", 409)
        db.add(
            ReportRevision(
                report_id=report.id, revision=body.revision + 1, editor_id=user.id, content_md=report.markdown
            )
        )
        audit(db, user, "report.finalized", report.id)
        db.commit()
        return {"id": report.id, "status": "finalized", "revision": body.revision + 1}

    @app.get("/api/v1/reports/{report_id}/export")
    def export_report(report_id: str, format: str = "md", user=Depends(principal), db=Depends(db_session)):
        report = visible_report(report_id, db, user)
        if format not in {"md", "html"}:
            raise AppError("INVALID_FORMAT", "md 또는 html 형식만 지원합니다", 422)
        audit(db, user, "report.exported", report.id)
        db.commit()
        content = (
            report.markdown
            if format == "md"
            else '<!doctype html><html lang="ko"><meta charset="utf-8"><title>DevBrief</title><body>'
            + render_html(report.markdown)
            + "</body></html>"
        )
        return Response(
            content,
            media_type="text/markdown" if format == "md" else "text/html",
            headers={"Content-Disposition": f'attachment; filename="devbrief-{report.id}.{format}"'},
        )

    @app.post("/api/v1/jobs/{job_id}/cancel")
    def cancel_job(job_id: str, user=Depends(principal), db=Depends(db_session)):
        job = db.get(Job, job_id)
        if not job or (job.requested_by != user.id and user.role != "admin"):
            raise AppError("NOT_FOUND", "작업을 찾을 수 없습니다", 404)
        check_repos(job.request_json["repository_ids"], db, user)
        result = db.execute(
            update(Job)
            .where(Job.id == job.id, Job.status.in_(["queued", "running"]))
            .values(
                status="cancelled",
                stage="cancelled",
                lease_until=None,
                lease_token=None,
                finished_at=utcnow(),
            )
        )
        if not result.rowcount:
            raise AppError("JOB_FINISHED", "이미 종료된 작업입니다", 409)
        audit(db, user, "job.cancelled", job.id)
        db.commit()
        return {"job_id": job.id, "status": "cancelled"}

    @app.get("/api/v1/admin/audit-logs")
    def audit_logs(limit: int = Query(100, ge=1, le=500), user=Depends(admin), db=Depends(db_session)):
        rows = list(db.scalars(select(AuditLog).order_by(AuditLog.time.desc()).limit(limit)))
        audit(db, user, "audit.viewed")
        db.commit()
        return [
            {
                "id": r.id,
                "principal": r.principal,
                "action": r.action,
                "resource_id": r.resource_id,
                "result": r.result,
                "time": r.time,
            }
            for r in rows
        ]

    @app.get("/api/v1/admin/policy")
    def policy(user=Depends(admin)):
        return {
            "allowed_repositories": settings.allowed_repos,
            "allowed_orgs": sorted(settings.allowed_orgs),
            "data_policy": settings.data_policy,
            "retention_days": settings.retention_days,
            "max_pages": settings.max_pages,
            "max_events": settings.max_events,
            "settings_source": "deployment_environment",
            "note_ko": "허용 범위와 보존 정책은 배포 환경변수로 변경한 뒤 API와 worker를 함께 재시작합니다",
        }
