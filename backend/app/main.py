from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy import select, text

from app.core.db import make_engine, session_factory
from app.core.security import AppError, audit, authenticate, permitted_repositories, seed_repositories
from app.core.settings import Settings, get_settings
from app.models.entities import Job, Report, WorkItem
from app.schemas.contracts import ReportRequest


def create_app(settings: Settings | None = None, engine=None) -> FastAPI:
    settings = settings or get_settings()
    engine = engine or make_engine(settings.database_url)
    factory = session_factory(engine)

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
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
    )
    app.state.settings, app.state.factory = settings, factory

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
            response = await call_next(request)
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
        job = db.get(Job, report.job_id)
        allowed = {r.id for r in permitted_repositories(db, user, settings)}
        if not set(job.request_json["repository_ids"]) <= allowed:
            raise AppError("NOT_FOUND", "보고서를 찾을 수 없습니다", 404)
        return report

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

    @app.post("/api/v1/reports", status_code=202)
    def create_report(body: ReportRequest, user=Depends(principal), db=Depends(db_session)):
        allowed = {r.id for r in permitted_repositories(db, user, settings)}
        if not set(body.repository_ids) <= allowed:
            raise AppError("REPO_FORBIDDEN", "허용되지 않은 저장소입니다", 403)
        pending = list(
            db.scalars(select(Job).where(Job.requested_by == user.id, Job.status.in_(["queued", "running"])))
        )
        if len(pending) >= settings.max_pending_jobs:
            raise AppError("TOO_MANY_JOBS", "진행 중인 작업이 많습니다. 완료 후 다시 시도하세요", 429)
        payload = body.model_dump(mode="json")
        for job in pending:
            if job.request_json == payload:
                return {"job_id": job.id, "status": job.status, "status_url": f"/api/v1/jobs/{job.id}"}
        job = Job(requested_by=user.id, request_json=payload)
        db.add(job)
        db.flush()
        audit(db, user, "report.requested", job.id)
        db.commit()
        return {"job_id": job.id, "status": job.status, "status_url": f"/api/v1/jobs/{job.id}"}

    @app.get("/api/v1/jobs/{job_id}")
    def get_job(job_id: str, user=Depends(principal), db=Depends(db_session)):
        job = db.get(Job, job_id)
        allowed = {r.id for r in permitted_repositories(db, user, settings)}
        if (
            not job
            or (job.requested_by != user.id and user.role != "admin")
            or not set(job.request_json["repository_ids"]) <= allowed
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
