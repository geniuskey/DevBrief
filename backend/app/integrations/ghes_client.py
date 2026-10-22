import hashlib
import random
import ssl
import time
from collections.abc import Callable, Iterator
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from urllib.parse import quote, urljoin

import httpx

from app.core.security import AppError, validated_url
from app.core.settings import Settings
from app.integrations.fakes import FakeGHES


class IntegrationError(AppError):
    def __init__(self, code: str, message: str = "내부 API 조회를 완료하지 못했습니다"):
        super().__init__(code, message, 502)


class GHESClient:
    def __init__(self, settings: Settings, transport=None, sleep: Callable = time.sleep):
        self.settings, self.sleep = settings, sleep
        self.calls = 0
        self.started = time.monotonic()
        self.version: str | None = None
        self.cache: dict[str, tuple[str, object, dict]] = {}
        pat = settings.secret("ghes_pat_file") if settings.adapter_mode == "real" else "fake"
        self.credential_scope = hashlib.sha256(pat.encode()).hexdigest()
        headers = {"Accept": "application/vnd.github+json", "Authorization": f"Bearer {pat}"}
        if settings.ghes_api_version:
            headers["X-GitHub-Api-Version"] = settings.ghes_api_version
        context = ssl.create_default_context(cafile=settings.ghes_ca_bundle or None)
        if settings.adapter_mode == "fake" and transport is None:
            transport = httpx.MockTransport(FakeGHES())
        self.client = httpx.Client(
            headers=headers,
            verify=context,
            transport=transport,
            timeout=settings.http_timeout_seconds,
            follow_redirects=False,
            trust_env=False,
        )

    def close(self):
        self.client.close()

    def get(self, path: str, params: dict | None = None) -> tuple[object, dict]:
        base = self.settings.ghes_api_base_url.rstrip("/")
        url = path if path.startswith("https://") else base + "/" + path.lstrip("/")
        validated_url(url, base)
        cache_key = self.credential_scope + str(httpx.URL(url, params=params))
        cached = self.cache.get(cache_key)
        headers = {"If-None-Match": cached[0]} if cached else {}
        for attempt in range(self.settings.http_retries + 1):
            self.calls += 1
            if (
                self.calls > self.settings.max_api_calls
                or time.monotonic() - self.started > self.settings.job_timeout_seconds
            ):
                raise IntegrationError("COLLECTION_LIMIT", "수집 호출 또는 시간 제한에 도달했습니다")
            try:
                response = self.client.get(url, params=params, headers=headers)
            except (httpx.TimeoutException, httpx.NetworkError) as exc:
                if attempt == self.settings.http_retries:
                    raise IntegrationError("GHES_UNAVAILABLE") from exc
                self.sleep(min(2**attempt + random.random(), 10))
                continue
            self.version = response.headers.get("x-github-enterprise-version", self.version)
            if response.status_code == 304 and cached:
                return cached[1], cached[2]
            limited = response.status_code == 429 or (
                response.status_code == 403
                and (
                    "retry-after" in response.headers or response.headers.get("x-ratelimit-remaining") == "0"
                )
            )
            transient = limited or response.status_code in {500, 502, 503, 504}
            if transient and attempt < self.settings.http_retries:
                delay = self.retry_delay(response, attempt)
                # Never retry earlier than the server permits; long waits become a visible partial result.
                if delay > 30:
                    raise IntegrationError("RATE_LIMITED", "API 호출 제한으로 수집이 중단되었습니다")
                self.sleep(delay)
                continue
            if response.status_code == 401:
                raise IntegrationError("GHES_UNAUTHORIZED", "GHES 인증 또는 토큰 만료를 확인하세요")
            if response.status_code in {403, 404} and not limited:
                raise IntegrationError("REPO_NOT_ACCESSIBLE", "저장소 또는 API에 접근할 수 없습니다")
            if limited:
                raise IntegrationError("RATE_LIMITED", "API 호출 제한에 도달했습니다")
            if response.status_code != 200:
                raise IntegrationError("GHES_RESPONSE_ERROR")
            if len(response.content) > 8_000_000:
                raise IntegrationError("RESPONSE_TOO_LARGE")
            try:
                data = response.json()
            except ValueError as exc:
                raise IntegrationError("GHES_INVALID_JSON") from exc
            response_headers = dict(response.headers)
            if response.headers.get("etag"):
                self.cache[cache_key] = (response.headers["etag"], data, response_headers)
            return data, response_headers
        raise IntegrationError("GHES_UNAVAILABLE")

    @staticmethod
    def retry_delay(response, attempt) -> float:
        retry = response.headers.get("retry-after")
        if retry:
            try:
                return max(float(retry), 0)
            except ValueError:
                try:
                    return max((parsedate_to_datetime(retry) - datetime.now(UTC)).total_seconds(), 0)
                except (ValueError, TypeError):
                    pass
        reset = response.headers.get("x-ratelimit-reset")
        if reset and response.headers.get("x-ratelimit-remaining") == "0":
            try:
                return max(float(reset) - time.time(), 0) + 1
            except ValueError:
                pass
        return min(2**attempt + random.random(), 15)

    def pages(self, path: str, params: dict | None = None) -> Iterator[dict]:
        params = {**(params or {}), "per_page": 100}
        seen = set()
        for _ in range(self.settings.max_pages):
            if path in seen:
                raise IntegrationError("PAGINATION_CYCLE")
            seen.add(path)
            data, headers = self.get(path, params)
            if not isinstance(data, list):
                raise IntegrationError("GHES_SCHEMA_ERROR")
            for entry in data:
                if not isinstance(entry, dict):
                    raise IntegrationError("GHES_SCHEMA_ERROR")
                yield entry
            # httpx parses RFC Link headers including links with multiple parameters.
            links = httpx.Response(200, headers=headers).links
            if "next" not in links:
                return
            path = urljoin(self.settings.ghes_api_base_url + "/", links["next"]["url"])
            validated_url(path, self.settings.ghes_api_base_url)
            params = None
        raise IntegrationError("PAGE_LIMIT", "최대 페이지 수에 도달하여 일부 데이터가 누락되었습니다")

    def object(self, path: str) -> dict:
        data, _ = self.get(path)
        if not isinstance(data, dict):
            raise IntegrationError("GHES_SCHEMA_ERROR")
        return data

    def user(self, login: str) -> dict:
        return self.object("users/" + quote(login, safe=""))

    def test_connection(self) -> dict:
        self.object("user")
        return {
            "connected": True,
            "version": self.version,
            "api_version_header": self.settings.ghes_api_version or None,
            "features": {"rest_pull_reviews": True, "search_required": False, "diff_collection": False},
            "read_only_verified": False,
            "warning": "PAT의 실질적 읽기 전용 권한은 전용 계정과 GHES 정책에서 확인해야 합니다",
        }
