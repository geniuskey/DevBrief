from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def uid() -> str:
    return str(uuid4())


def utcnow() -> datetime:
    return datetime.now(UTC)


class Base(DeclarativeBase):
    pass


class AppUser(Base):
    __tablename__ = "app_users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    principal: Mapped[str] = mapped_column(String(200), unique=True)
    display_name: Mapped[str] = mapped_column(String(200))
    role: Mapped[str] = mapped_column(String(20), default="author")
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class Repository(Base):
    __tablename__ = "repositories"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    full_name: Mapped[str] = mapped_column(String(300), unique=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    access_state: Mapped[str] = mapped_column(String(30), default="unverified")


class Team(Base):
    __tablename__ = "teams"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String(100))
    created_by: Mapped[str] = mapped_column(ForeignKey("app_users.id", ondelete="RESTRICT"))
    github_logins: Mapped[list] = mapped_column(JSON)
    repository_ids: Mapped[list] = mapped_column(JSON)


class Job(Base):
    __tablename__ = "report_jobs"
    __table_args__ = (Index("ix_job_status_lease", "status", "lease_until"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    requested_by: Mapped[str] = mapped_column(ForeignKey("app_users.id", ondelete="RESTRICT"))
    request_json: Mapped[dict] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(20), default="queued")
    stage: Mapped[str] = mapped_column(String(40), default="queued")
    progress: Mapped[int] = mapped_column(Integer, default=0)
    error_code: Mapped[str | None] = mapped_column(String(80))
    retry_count: Mapped[int] = mapped_column(Integer, default=0)
    lease_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    lease_token: Mapped[str | None] = mapped_column(String(36))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    coverage_json: Mapped[dict] = mapped_column(JSON, default=dict)
    warnings: Mapped[list] = mapped_column(JSON, default=list)


class SyncRun(Base):
    __tablename__ = "sync_runs"
    id: Mapped[str] = mapped_column(ForeignKey("report_jobs.id", ondelete="CASCADE"), primary_key=True)
    start_utc: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    end_utc: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    scope_json: Mapped[list] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(20))
    coverage_json: Mapped[dict] = mapped_column(JSON)
    finished_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class GitHubEvent(Base):
    __tablename__ = "github_events"
    __table_args__ = (
        UniqueConstraint("sync_run_id", "repo_id", "source_type", "source_id", "event_type", "occurred_at"),
        Index("ix_event_repo_time", "repo_id", "occurred_at"),
        Index("ix_event_actor_time", "actor", "occurred_at"),
    )
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    sync_run_id: Mapped[str] = mapped_column(ForeignKey("sync_runs.id", ondelete="CASCADE"))
    repo_id: Mapped[str] = mapped_column(ForeignKey("repositories.id", ondelete="RESTRICT"))
    source_type: Mapped[str] = mapped_column(String(20))
    source_id: Mapped[str] = mapped_column(String(80))
    event_type: Mapped[str] = mapped_column(String(30))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    actor: Mapped[str] = mapped_column(String(100))
    url: Mapped[str] = mapped_column(Text)
    payload_min_json: Mapped[dict] = mapped_column(JSON)


class Commit(Base):
    __tablename__ = "commits"
    repo_id: Mapped[str] = mapped_column(ForeignKey("repositories.id", ondelete="CASCADE"), primary_key=True)
    sha: Mapped[str] = mapped_column(String(64), primary_key=True)
    author: Mapped[str | None] = mapped_column(String(100))
    committer: Mapped[str | None] = mapped_column(String(100))
    committed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    message: Mapped[str] = mapped_column(Text)
    url: Mapped[str] = mapped_column(Text)


class PullRequest(Base):
    __tablename__ = "pull_requests"
    repo_id: Mapped[str] = mapped_column(ForeignKey("repositories.id", ondelete="CASCADE"), primary_key=True)
    number: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(Text)
    body_redacted: Mapped[str] = mapped_column(Text)
    author: Mapped[str] = mapped_column(String(100))
    state: Mapped[str] = mapped_column(String(20))
    url: Mapped[str] = mapped_column(Text)


class CommitPRLink(Base):
    __tablename__ = "commit_pr_links"
    repo_id: Mapped[str] = mapped_column(ForeignKey("repositories.id", ondelete="CASCADE"), primary_key=True)
    sha: Mapped[str] = mapped_column(String(64), primary_key=True)
    pr_number: Mapped[int] = mapped_column(Integer, primary_key=True)


class Review(Base):
    __tablename__ = "reviews"
    __table_args__ = (Index("ix_review_actor_time", "reviewer", "submitted_at"),)
    repo_id: Mapped[str] = mapped_column(ForeignKey("repositories.id", ondelete="CASCADE"), primary_key=True)
    review_id: Mapped[str] = mapped_column(String(80), primary_key=True)
    pr_number: Mapped[int] = mapped_column(Integer)
    reviewer: Mapped[str] = mapped_column(String(100))
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    state: Mapped[str] = mapped_column(String(40))
    url: Mapped[str] = mapped_column(Text)


class Report(Base):
    __tablename__ = "reports"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    job_id: Mapped[str] = mapped_column(ForeignKey("report_jobs.id", ondelete="RESTRICT"), unique=True)
    owner_id: Mapped[str] = mapped_column(ForeignKey("app_users.id", ondelete="RESTRICT"))
    team_id: Mapped[str | None] = mapped_column(ForeignKey("teams.id", ondelete="SET NULL"))
    status: Mapped[str] = mapped_column(String(20), default="draft")
    revision: Mapped[int] = mapped_column(Integer, default=1)
    markdown: Mapped[str] = mapped_column(Text, default="")
    coverage_json: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    finalized_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class WorkItem(Base):
    __tablename__ = "work_items"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    report_id: Mapped[str] = mapped_column(ForeignKey("reports.id", ondelete="CASCADE"))
    repo_id: Mapped[str] = mapped_column(ForeignKey("repositories.id", ondelete="RESTRICT"))
    title_ko: Mapped[str] = mapped_column(Text)
    summary_ko: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(40), default="기타")
    status: Mapped[str] = mapped_column(String(40))
    confidence: Mapped[float] = mapped_column(Float, default=0)
    evidence: Mapped[list] = mapped_column(JSON)
    contributors: Mapped[list] = mapped_column(JSON)
    unsupported_claims: Mapped[list] = mapped_column(JSON, default=list)
    excluded: Mapped[bool] = mapped_column(Boolean, default=False)
    version: Mapped[int] = mapped_column(Integer, default=1)
    edited_by: Mapped[str | None] = mapped_column(ForeignKey("app_users.id", ondelete="RESTRICT"))


class ReportRevision(Base):
    __tablename__ = "report_revisions"
    report_id: Mapped[str] = mapped_column(ForeignKey("reports.id", ondelete="CASCADE"), primary_key=True)
    revision: Mapped[int] = mapped_column(Integer, primary_key=True)
    editor_id: Mapped[str] = mapped_column(ForeignKey("app_users.id", ondelete="RESTRICT"))
    content_md: Mapped[str] = mapped_column(Text)
    edited_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    principal: Mapped[str] = mapped_column(String(200))
    action: Mapped[str] = mapped_column(String(80))
    resource_id: Mapped[str] = mapped_column(String(100), default="")
    result: Mapped[str] = mapped_column(String(30), default="ok")
    metadata_redacted: Mapped[dict] = mapped_column(JSON, default=dict)
    time: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
