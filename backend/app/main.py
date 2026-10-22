import logging
from contextlib import asynccontextmanager
from urllib.parse import urlsplit
from uuid import uuid4

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import HTMLResponse, JSONResponse
from sqlalchemy import select, text
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.core.db import make_engine, session_factory
from app.core.security import (
    AppError,
    audit,
    authenticate,
    permitted_orgs,
    permitted_repositories,
    scope_checker,
    seed_repositories,
)
from app.core.settings import Settings, get_settings
from app.models.entities import Job, Report, Team, WorkItem
from app.schemas.contracts import ReportRequest

logger = logging.getLogger(__name__)


def create_app(settings: Settings | None = None, engine=None) -> FastAPI:
    settings = settings or get_settings()
    engine = engine or make_engine(settings.database_url)
    factory = session_factory(engine)
    from app.core.logging import configure_logging

    configure_logging(settings)

    @asynccontextmanager
    async def lifespan(app):
        with factory() as db:
            seed_repositories(db, settings)
        yield
        engine.dispose()

    app = FastAPI(
        title="DevBrief",
        version="0.1.0",
        lifespan=lifespan,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    app.state.settings, app.state.factory = settings, factory
    allowed_hosts = [
        urlsplit(settings.public_origin).hostname or "localhost",
        "localhost",
        "127.0.0.1",
        "[::1]",
    ]
    if settings.adapter_mode == "fake":
        allowed_hosts.append("testserver")
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=allowed_hosts)

    @app.middleware("http")
    async def boundary(request: Request, call_next):
        request.state.request_id = str(uuid4())
        origin = request.headers.get("origin")
        if request.method not in {"GET", "HEAD", "OPTIONS"} and origin and origin != settings.public_origin:
            response = JSONResponse(
                {
                    "code": "ORIGIN_DENIED",
                    "message_ko": "허용되지 않은 요청 출처입니다",
                    "request_id": request.state.request_id,
                    "details_safe": {},
                },
                status_code=403,
            )
        else:
            try:
                response = await call_next(request)
            except Exception as exc:
                # Class name only: exception text may carry upstream payloads or credentials.
                logger.error(
                    "unhandled %s on %s %s request_id=%s",
                    type(exc).__name__,
                    request.method,
                    request.url.path,
                    request.state.request_id,
                )
                response = JSONResponse(
                    {
                        "code": "INTERNAL_ERROR",
                        "message_ko": "서버 처리 중 오류가 발생했습니다",
                        "request_id": request.state.request_id,
                        "details_safe": {},
                    },
                    status_code=500,
                )
        response.headers["X-Request-ID"] = request.state.request_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Cache-Control"] = "no-store"
        response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
        return response

    @app.exception_handler(AppError)
    async def error_handler(request: Request, exc: AppError):
        return JSONResponse(
            {
                "code": exc.code,
                "message_ko": exc.message,
                "request_id": request.state.request_id,
                "details_safe": {},
            },
            status_code=exc.status,
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_error(request: Request, exc):
        return JSONResponse(
            {
                "code": f"HTTP_{exc.status_code}",
                "message_ko": "요청 경로나 메서드를 확인하세요",
                "request_id": request.state.request_id,
                "details_safe": {},
            },
            status_code=exc.status_code,
        )

    @app.exception_handler(RequestValidationError)
    async def validation_handler(request: Request, exc):
        return JSONResponse(
            {
                "code": "INVALID_INPUT",
                "message_ko": "입력 형식·날짜 범위·지원 정책을 확인하세요",
                "request_id": request.state.request_id,
                "details_safe": {"fields": [".".join(map(str, e["loc"])) for e in exc.errors()]},
            },
            status_code=422,
        )

    def db_session():
        with factory() as db:
            yield db

    def principal(request: Request, db=Depends(db_session)):
        return authenticate(request, db, settings)

    def visible_report(report_id, db, user):
        report = db.get(Report, report_id)
        if not report or (report.owner_id != user.id and user.role != "admin"):
            raise AppError("NOT_FOUND", "보고서를 찾을 수 없습니다", 404)
        req = db.get(Job, report.job_id).request_json
        if not scope_checker(db, user, settings)(req["repository_ids"], req.get("organizations")):
            raise AppError("NOT_FOUND", "보고서를 찾을 수 없습니다", 404)
        return report

    @app.get("/api/openapi.json", include_in_schema=False)
    def openapi_schema(user=Depends(principal)):
        return app.openapi()

    @app.get("/api/docs", include_in_schema=False, response_class=HTMLResponse)
    def api_docs(user=Depends(principal)):
        import html

        rows = []
        for path, methods in app.openapi()["paths"].items():
            for method, spec in methods.items():
                rows.append(
                    f"<tr><td>{html.escape(method.upper())}</td><td>{html.escape(path)}</td><td>{html.escape(spec.get('summary', ''))}</td></tr>"
                )
        return (
            '<!doctype html><html lang="ko"><meta charset="utf-8"><title>DevBrief API</title><body><h1>DevBrief API</h1><p>사내망에서 외부 CDN 없이 열람하는 API 목록입니다. 요청·응답 계약은 <a href="/api/openapi.json">OpenAPI JSON</a>을 참고하세요.</p><table><thead><tr><th>Method</th><th>Path</th><th>기능</th></tr></thead><tbody>'
            + "".join(rows)
            + "</tbody></table></body></html>"
        )

    @app.get("/api/v1/health/live")
    def live():
        return {"status": "ok"}

    @app.get("/api/v1/health/ready")
    def ready(user=Depends(principal), db=Depends(db_session)):
        db.execute(text("SELECT 1"))
        return {"status": "ready"}

    @app.get("/api/v1/me")
    def me(user=Depends(principal)):
        return vars(user)

    @app.get("/api/v1/settings/capabilities")
    def capabilities(user=Depends(principal)):
        return {
            "adapter_mode": settings.adapter_mode,
            "policy": "metadata_only",
            "include_diff": False,
            "single_user_mode": settings.single_user_mode,
            "llm_available": settings.adapter_mode == "fake" or bool(settings.llm_api_key_file),
            "demo_period": {"start_date": "2026-10-12", "end_date": "2026-10-18"},
            "ghes_api_version_header": settings.ghes_api_version or None,
        }

    @app.get("/api/v1/repositories")
    def repositories(org: str = "", q: str = "", user=Depends(principal), db=Depends(db_session)):
        return [
            {"id": r.id, "full_name": r.full_name, "access_state": r.access_state}
            for r in permitted_repositories(db, user, settings)
            if (not org or r.full_name.startswith(org.lower() + "/")) and q.lower() in r.full_name
        ]

    @app.get("/api/v1/organizations")
    def organizations(user=Depends(principal), db=Depends(db_session)):
        repos = permitted_repositories(db, user, settings)
        return [
            {
                "login": org,
                "repository_count": sum(r.full_name.split("/")[0] == org for r in repos),
            }
            for org in permitted_orgs(user, settings)
        ]

    @app.post("/api/v1/reports", status_code=202)
    def create_report(body: ReportRequest, user=Depends(principal), db=Depends(db_session)):
        permits = scope_checker(db, user, settings)
        if body.team_id:
            team = db.get(Team, body.team_id)
            if (
                not team
                or (team.created_by != user.id and user.role != "admin")
                or not permits(team.repository_ids, team.organizations)
            ):
                raise AppError("NOT_FOUND", "팀을 찾을 수 없습니다", 404)
        if not permits(body.repository_ids, body.organizations):
            raise AppError("REPO_FORBIDDEN", "허용되지 않은 저장소 또는 조직입니다", 403)
        pending = list(
            db.scalars(select(Job).where(Job.requested_by == user.id, Job.status.in_(["queued", "running"])))
        )
        payload = body.model_dump(mode="json")
        # A retried identical request reuses its job even when the user is at the limit.
        for job in pending:
            if job.request_json == payload:
                return {"job_id": job.id, "status": job.status, "status_url": f"/api/v1/jobs/{job.id}"}
        if len(pending) >= settings.max_pending_jobs:
            raise AppError("TOO_MANY_JOBS", "진행 중인 작업이 많습니다. 완료 후 다시 시도하세요", 429)
        job = Job(requested_by=user.id, request_json=payload)
        db.add(job)
        db.flush()
        audit(db, user, "report.requested", job.id)
        db.commit()
        return {"job_id": job.id, "status": job.status, "status_url": f"/api/v1/jobs/{job.id}"}

    @app.get("/api/v1/jobs/{job_id}")
    def get_job(job_id: str, user=Depends(principal), db=Depends(db_session)):
        job = db.get(Job, job_id)
        if (
            not job
            or (job.requested_by != user.id and user.role != "admin")
            or not scope_checker(db, user, settings)(
                job.request_json["repository_ids"], job.request_json.get("organizations")
            )
        ):
            raise AppError("NOT_FOUND", "작업을 찾을 수 없습니다", 404)
        report = db.scalar(select(Report).where(Report.job_id == job.id))
        return {
            "job_id": job.id,
            "status": job.status,
            "stage": job.stage,
            "progress_percent": job.progress,
            "report_id": report.id if report else None,
            "coverage": job.coverage_json,
            "warnings": job.warnings,
            "error_code": job.error_code,
        }

    @app.get("/api/v1/reports/{report_id}")
    def get_report(report_id: str, user=Depends(principal), db=Depends(db_session)):
        report = visible_report(report_id, db, user)
        items = list(
            db.scalars(select(WorkItem).where(WorkItem.report_id == report.id).order_by(WorkItem.id))
        )
        job = db.get(Job, report.job_id)
        audit(db, user, "report.viewed", report.id)
        db.commit()
        return {
            "id": report.id,
            "status": report.status,
            "revision": report.revision,
            "markdown": report.markdown,
            "coverage": report.coverage_json,
            "warnings": job.warnings,
            "request": job.request_json,
            "work_items": [{c.name: getattr(i, c.name) for c in WorkItem.__table__.columns} for i in items],
        }

    # Shared dependencies for additional API modules.
    from app.api.routes import register_routes

    register_routes(app, settings, db_session, principal, visible_report)
    return app


app = create_app()
