from functools import lru_cache
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    database_url: str = "sqlite:///./devbrief.db"
    adapter_mode: Literal["fake", "real"] = "fake"
    single_user_mode: bool = True
    single_user_principal: str = "demo"
    proxy_auth_mode: Literal["signed", "oauth2_proxy"] = "signed"
    trusted_proxy_ips: str = ""
    proxy_secret_file: str = ""
    oauth2_proxy_preferred_username_header: str = "X-Forwarded-Preferred-Username"
    oauth2_proxy_email_header: str = "X-Forwarded-Email"
    oauth2_proxy_groups_header: str = "X-Forwarded-Groups"
    admin_principals: str = "demo"
    repo_acl_json: str = "{}"
    public_origin: str = "http://localhost:5173"
    ghes_base_url: str = "https://github.internal.example"
    ghes_api_base_url: str = "https://github.internal.example/api/v3"
    ghes_api_version: str = ""
    ghes_ca_bundle: str = ""
    ghes_pat_file: str = ""
    ghes_allowed_orgs: str = "example-org"
    ghes_allowed_repos: str = "example-org/vision,example-org/platform,example-org/restricted"
    llm_base_url: str = "https://llm.internal.example/v1"
    llm_model: str = "company-model"
    llm_api_key_file: str = ""
    llm_ca_bundle: str = ""
    llm_json_mode: bool = True
    approved_egress_hosts: str = ""
    data_policy: Literal["metadata_only"] = "metadata_only"
    report_timezone: str = "Asia/Seoul"
    max_pages: int = 100
    max_events: int = 10000
    max_api_calls: int = 2000
    http_timeout_seconds: float = 20
    http_retries: int = 3
    job_timeout_seconds: int = 900
    job_max_attempts: int = 3
    lease_seconds: int = 60
    max_pending_jobs: int = 5
    retention_days: int = 90

    @property
    def allowed_repos(self) -> list[str]:
        return list(dict.fromkeys(x.strip().lower() for x in self.ghes_allowed_repos.split(",") if x.strip()))

    @property
    def allowed_orgs(self) -> set[str]:
        return {x.strip().lower() for x in self.ghes_allowed_orgs.split(",") if x.strip()}

    @model_validator(mode="after")
    def validate_security(self):
        import re

        if not self.allowed_repos or any(
            not re.fullmatch(r"[a-z0-9_.-]+/[a-z0-9_.-]+", r) for r in self.allowed_repos
        ):
            raise ValueError("명시적인 GHES_ALLOWED_REPOS가 필요합니다")
        if self.allowed_orgs and any(r.split("/")[0] not in self.allowed_orgs for r in self.allowed_repos):
            raise ValueError("저장소의 조직이 허용 목록에 없습니다")
        if (
            min(self.max_pages, self.max_events, self.max_api_calls, self.lease_seconds, self.retention_days)
            < 1
        ):
            raise ValueError("수집 및 보관 제한은 양수여야 합니다")
        if not self.single_user_mode:
            if not any(ip.strip() for ip in self.trusted_proxy_ips.split(",")):
                raise ValueError("다중 사용자 모드에는 신뢰 프록시 IP가 필요합니다")
            if self.proxy_auth_mode == "signed":
                if not self.proxy_secret_file:
                    raise ValueError("서명 프록시 인증에는 서명 secret 파일이 필요합니다")
                if len(self.secret("proxy_secret_file")) < 32:
                    raise ValueError("프록시 서명 secret은 최소 32자여야 합니다")
            else:
                headers = (
                    self.oauth2_proxy_preferred_username_header,
                    self.oauth2_proxy_email_header,
                    self.oauth2_proxy_groups_header,
                )
                if any(not re.fullmatch(r"[!#$%&'*+.^_`|~0-9A-Za-z-]+", h) for h in headers):
                    raise ValueError("oauth2-proxy 헤더 이름이 올바르지 않습니다")
                if len({h.lower() for h in headers}) != len(headers):
                    raise ValueError("oauth2-proxy 헤더 이름은 서로 달라야 합니다")
        if self.adapter_mode == "real":
            approved = {h.strip().lower() for h in self.approved_egress_hosts.split(",")}
            for value in (self.ghes_base_url, self.ghes_api_base_url, self.llm_base_url):
                u = urlsplit(value)
                if u.scheme != "https" or not u.hostname or u.username or u.password or u.query or u.fragment:
                    raise ValueError("내부 HTTPS URL만 허용됩니다")
                if u.hostname.lower() not in approved:
                    raise ValueError("관리자가 승인한 egress 호스트를 명시해야 합니다")
            if urlsplit(self.ghes_base_url).netloc != urlsplit(self.ghes_api_base_url).netloc:
                raise ValueError("GHES 웹/API 호스트가 같아야 합니다")
            if urlsplit(self.ghes_api_base_url).path.rstrip("/") != "/api/v3":
                raise ValueError("GHES API 경로는 /api/v3이어야 합니다")
            if not self.ghes_pat_file or not self.llm_api_key_file:
                raise ValueError("실제 연결에는 secret 파일이 필요합니다")
        return self

    def secret(self, name: str) -> str:
        path = getattr(self, name)
        return Path(path).read_text().strip() if path else ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
