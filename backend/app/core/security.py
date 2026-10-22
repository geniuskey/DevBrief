import ast
import hashlib
import hmac
import ipaddress
import json
import re
import time
from dataclasses import dataclass
from urllib.parse import unquote, urlsplit

from fastapi import Request
from sqlalchemy import select

from app.core.settings import Settings
from app.models.entities import AppUser, AuditLog, Repository


class AppError(Exception):
    def __init__(self, code: str, message: str, status: int = 400):
        self.code, self.message, self.status = code, message, status


def redact(value: str, secrets: tuple[str, ...] = ()) -> str:
    for secret in secrets:
        if secret:
            value = value.replace(secret, "[REDACTED]")
    value = re.sub(
        r"(?s)-----BEGIN [^-]*PRIVATE KEY-----.*?-----END [^-]*PRIVATE KEY-----", "[REDACTED KEY]", value
    )
    value = re.sub(
        r"\b(?:gh[pousr]_[A-Za-z0-9_]{8,}|github_pat_[A-Za-z0-9_]+|sk-[A-Za-z0-9_-]{8,})\b",
        "[REDACTED]",
        value,
    )
    value = re.sub(
        r"(?i)(authorization\s*[:=]\s*(?:bearer\s+)?|(?:api[_-]?key|password|secret|token)\s*[:=]\s*)[^\s,;]+",
        r"\1[REDACTED]",
        value,
    )
    value = re.sub(r"\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b", "[EMAIL]", value)
    return value


def validated_url(url: str, base: str, api: bool = True) -> str:
    u, b = urlsplit(url), urlsplit(base)
    decoded = u.path
    for _ in range(4):
        decoded_next = unquote(decoded)
        if decoded_next == decoded:
            break
        decoded = decoded_next
    if "%" in decoded:
        raise AppError("UNSAFE_URL", "중첩 URL 인코딩은 허용되지 않습니다", 502)
    if (
        u.scheme != "https"
        or u.netloc != b.netloc
        or u.username
        or u.password
        or "\\" in decoded
        or any(p in {"..", "."} for p in decoded.split("/"))
        or any(ord(c) < 32 for c in url)
    ):
        raise AppError("UNSAFE_URL", "허용되지 않은 외부 URL입니다", 502)
    if api and not (decoded == b.path.rstrip("/") or decoded.startswith(b.path.rstrip("/") + "/")):
        raise AppError("UNSAFE_URL", "허용 API 경로를 벗어났습니다", 502)
    return url


@dataclass
class Principal:
    id: str
    name: str
    role: str
    email: str | None = None
    group: str | None = None


def oauth2_proxy_header(request: Request, name: str, limit: int) -> str:
    values = request.headers.getlist(name)
    if len(values) > 1:
        raise AppError("UNAUTHENTICATED", "중복된 oauth2-proxy 인증 헤더입니다", 401)
    value = values[0] if values else ""
    if len(value) > limit or any(ord(c) < 32 or ord(c) == 127 for c in value):
        raise AppError("UNAUTHENTICATED", "oauth2-proxy 인증 헤더가 올바르지 않습니다", 401)
    return value.strip()


def oauth2_proxy_group(value: str) -> str | None:
    if value.startswith("["):
        try:
            try:
                groups = json.loads(value)
            except json.JSONDecodeError:
                # Some SSO gateways serialize a Python-style list with single quotes.
                groups = ast.literal_eval(value)
            if not isinstance(groups, list) or any(not isinstance(g, str) for g in groups):
                raise ValueError
        except (ValueError, SyntaxError, RecursionError) as exc:
            raise AppError("UNAUTHENTICATED", "oauth2-proxy 그룹 목록이 올바르지 않습니다", 401) from exc
    else:
        # Also accept the comma-separated header emitted by oauth2-proxy itself.
        groups = value.split(",")
    group = groups[0].strip() if groups else ""
    if any(ord(c) < 32 or ord(c) == 127 for c in group):
        raise AppError("UNAUTHENTICATED", "oauth2-proxy 그룹 값이 올바르지 않습니다", 401)
    return group or None


def insert_if_absent(db, model, values: dict, unique_column: str):
    from sqlalchemy.dialects.postgresql import insert as pg_insert
    from sqlalchemy.dialects.sqlite import insert as sqlite_insert

    insert_fn = pg_insert if db.bind.dialect.name == "postgresql" else sqlite_insert
    db.execute(insert_fn(model).values(**values).on_conflict_do_nothing(index_elements=[unique_column]))


def authenticate(request: Request, db, settings: Settings) -> Principal:
    host = request.client.host if request.client else ""
    email = group = None
    if settings.single_user_mode:
        try:
            local = ipaddress.ip_address(host).is_loopback
        except ValueError:
            local = host == "testclient" and settings.adapter_mode == "fake"
        if not local:
            raise AppError("LOCAL_ONLY", "단일 사용자 모드는 localhost 접속만 허용합니다", 403)
        principal = settings.single_user_principal
    else:
        trusted = {s.strip() for s in settings.trusted_proxy_ips.split(",") if s.strip()}
        if host not in trusted:
            raise AppError("UNAUTHENTICATED", "인증된 프록시 접속이 필요합니다", 401)
        principal = (
            oauth2_proxy_header(request, settings.oauth2_proxy_preferred_username_header, 200)
            if settings.proxy_auth_mode == "oauth2_proxy"
            else request.headers.get("x-devbrief-user", "")
        )
        if not re.fullmatch(r"[A-Za-z0-9@._+-]{1,200}", principal):
            raise AppError("UNAUTHENTICATED", "인증된 프록시 접속이 필요합니다", 401)
        if settings.proxy_auth_mode == "oauth2_proxy":
            email = oauth2_proxy_header(request, settings.oauth2_proxy_email_header, 254) or None
            group = oauth2_proxy_group(
                oauth2_proxy_header(request, settings.oauth2_proxy_groups_header, 8192)
            )
        else:
            timestamp = request.headers.get("x-devbrief-timestamp", "")
            signature = request.headers.get("x-devbrief-signature", "")
            try:
                fresh = abs(time.time() - int(timestamp)) <= 60
            except ValueError:
                fresh = False
            signed = f"{timestamp}\n{principal}\n{request.method}\n{request.url.path}"
            expected = hmac.new(
                settings.secret("proxy_secret_file").encode(), signed.encode(), hashlib.sha256
            ).hexdigest()
            if not fresh or not hmac.compare_digest(signature, expected):
                raise AppError("UNAUTHENTICATED", "프록시 인증 서명이 올바르지 않습니다", 401)
    role = "admin" if principal in {s.strip() for s in settings.admin_principals.split(",")} else "author"
    user = db.scalar(select(AppUser).where(AppUser.principal == principal))
    if user is None:
        insert_if_absent(
            db, AppUser, {"principal": principal, "display_name": principal, "role": role}, "principal"
        )
        db.commit()
        user = db.scalar(select(AppUser).where(AppUser.principal == principal))
    if not user.active:
        raise AppError("FORBIDDEN", "비활성 사용자입니다", 403)
    return Principal(user.id, principal, role, email=email, group=group)


def acl_entries(principal: Principal, settings: Settings) -> set[str] | None:
    """Repository ACL entries (`owner/repo` or `owner/*`) for a principal; None means unrestricted."""
    if principal.role == "admin":
        return None
    return {str(x).lower() for x in json.loads(settings.repo_acl_json).get(principal.name, [])}


def permitted_repositories(db, principal: Principal, settings: Settings) -> list[Repository]:
    acl = acl_entries(principal, settings)
    rows = db.scalars(select(Repository).where(Repository.enabled.is_(True)).order_by(Repository.full_name))
    return [
        r
        for r in rows
        if settings.repo_allowed(r.full_name)
        and (acl is None or r.full_name in acl or r.full_name.split("/")[0] + "/*" in acl)
    ]


def permitted_orgs(principal: Principal, settings: Settings) -> list[str]:
    """Organizations the principal may request as a whole, including repositories added later."""
    acl = acl_entries(principal, settings)
    return [o for o in settings.org_scopes if acl is None or o + "/*" in acl]


def scope_checker(db, principal: Principal, settings: Settings):
    repos = {r.id for r in permitted_repositories(db, principal, settings)}
    orgs = set(permitted_orgs(principal, settings))

    def permits(repository_ids, organizations=None) -> bool:
        return set(repository_ids) <= repos and set(organizations or ()) <= orgs

    return permits


def audit(db, principal: Principal | str, action: str, resource_id: str = "", result: str = "ok"):
    db.add(
        AuditLog(
            principal=principal.name if isinstance(principal, Principal) else principal,
            action=action,
            resource_id=resource_id,
            result=result,
        )
    )


def seed_repositories(db, settings: Settings):
    existing = set(db.scalars(select(Repository.full_name)))
    for name in settings.allowed_repos:
        if name not in existing:
            insert_if_absent(db, Repository, {"full_name": name}, "full_name")
    db.commit()
