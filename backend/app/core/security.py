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
    value = re.sub(r"(?s)-----BEGIN [^-]*PRIVATE KEY-----.*?-----END [^-]*PRIVATE KEY-----", "[REDACTED KEY]", value)
    value = re.sub(r"\b(?:gh[pousr]_[A-Za-z0-9_]{8,}|github_pat_[A-Za-z0-9_]+|sk-[A-Za-z0-9_-]{8,})\b", "[REDACTED]", value)
    value = re.sub(r"(?i)(authorization\s*[:=]\s*(?:bearer\s+)?|(?:api[_-]?key|password|secret|token)\s*[:=]\s*)[^\s,;]+", r"\1[REDACTED]", value)
    value = re.sub(r"\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b", "[EMAIL]", value)
    return value


def validated_url(url: str, base: str, api: bool = True) -> str:
    u, b = urlsplit(url), urlsplit(base)
    decoded = unquote(u.path)
    if (u.scheme != "https" or u.netloc != b.netloc or u.username or u.password
            or "\\" in decoded or any(p in {"..", "."} for p in decoded.split("/"))
            or any(ord(c) < 32 for c in url)):
        raise AppError("UNSAFE_URL", "허용되지 않은 외부 URL입니다", 502)
    if api and not (u.path == b.path.rstrip("/") or u.path.startswith(b.path.rstrip("/") + "/")):
        raise AppError("UNSAFE_URL", "허용 API 경로를 벗어났습니다", 502)
    return url


@dataclass
class Principal:
    id: str
    name: str
    role: str


def authenticate(request: Request, db, settings: Settings) -> Principal:
    host = request.client.host if request.client else ""
    if settings.single_user_mode:
        try:
            local = ipaddress.ip_address(host).is_loopback
        except ValueError:
            local = host == "testclient" and settings.adapter_mode == "fake"
        if not local:
            raise AppError("LOCAL_ONLY", "단일 사용자 모드는 localhost 접속만 허용합니다", 403)
        principal = settings.single_user_principal
    else:
        trusted = {s.strip() for s in settings.trusted_proxy_ips.split(",")}
        principal = request.headers.get("x-devbrief-user", "")
        timestamp = request.headers.get("x-devbrief-timestamp", "")
        signature = request.headers.get("x-devbrief-signature", "")
        if host not in trusted or not re.fullmatch(r"[A-Za-z0-9@._+-]{1,200}", principal):
            raise AppError("UNAUTHENTICATED", "인증된 프록시 접속이 필요합니다", 401)
        try:
            fresh = abs(time.time() - int(timestamp)) <= 60
        except ValueError:
            fresh = False
        signed = f"{timestamp}\n{principal}\n{request.method}\n{request.url.path}"
        expected = hmac.new(settings.secret("proxy_secret_file").encode(), signed.encode(), hashlib.sha256).hexdigest()
        if not fresh or not hmac.compare_digest(signature, expected):
            raise AppError("UNAUTHENTICATED", "프록시 인증 서명이 올바르지 않습니다", 401)
    role = "admin" if principal in {s.strip() for s in settings.admin_principals.split(",")} else "author"
    user = db.scalar(select(AppUser).where(AppUser.principal == principal))
    if user is None:
        user = AppUser(principal=principal, display_name=principal, role=role)
        db.add(user)
        db.commit()
    if not user.active:
        raise AppError("FORBIDDEN", "비활성 사용자입니다", 403)
    return Principal(user.id, principal, role)


def permitted_repositories(db, principal: Principal, settings: Settings) -> list[Repository]:
    allowed = set(settings.allowed_repos)
    if principal.role != "admin":
        acl = json.loads(settings.repo_acl_json)
        allowed &= set(acl.get(principal.name, []))
    return list(db.scalars(select(Repository).where(Repository.enabled.is_(True), Repository.full_name.in_(allowed))))


def audit(db, principal: Principal | str, action: str, resource_id: str = "", result: str = "ok"):
    db.add(AuditLog(principal=principal.name if isinstance(principal, Principal) else principal,
                    action=action, resource_id=resource_id, result=result))


def seed_repositories(db, settings: Settings):
    existing = set(db.scalars(select(Repository.full_name)))
    for name in settings.allowed_repos:
        if name not in existing:
            db.add(Repository(full_name=name))
    db.commit()
