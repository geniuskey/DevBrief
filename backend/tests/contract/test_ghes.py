import httpx
import pytest

from app.core.security import AppError
from app.core.settings import Settings
from app.integrations.ghes_client import GHESClient, IntegrationError


def test_pagination_and_etag():
    seen = []

    def handler(request):
        seen.append(request)
        if request.headers.get("if-none-match"):
            return httpx.Response(304)
        page = request.url.params.get("page", "1")
        headers = {"etag": '"v1"'}
        if page == "1":
            headers["link"] = '<https://github.internal.example/api/v3/items?page=2>; rel="next"'
        return httpx.Response(200, json=[{"page": page}], headers=headers)

    client = GHESClient(Settings(_env_file=None), httpx.MockTransport(handler))
    assert list(client.pages("items")) == [{"page": "1"}, {"page": "2"}]
    assert list(client.pages("items")) == [{"page": "1"}, {"page": "2"}]
    assert seen[0].url.params["per_page"] == "100"
    assert seen[2].headers["if-none-match"] == '"v1"'
    client.close()


@pytest.mark.parametrize(
    "status,code",
    [
        (401, "GHES_UNAUTHORIZED"),
        (403, "REPO_NOT_ACCESSIBLE"),
        (404, "REPO_NOT_ACCESSIBLE"),
        (429, "RATE_LIMITED"),
        (503, "GHES_RESPONSE_ERROR"),
    ],
)
def test_error_classification(status, code):
    client = GHESClient(
        Settings(http_retries=0, _env_file=None), httpx.MockTransport(lambda _: httpx.Response(status))
    )
    with pytest.raises(IntegrationError) as error:
        client.get("user")
    assert error.value.code == code
    client.close()


def test_rate_limit_then_retry():
    calls, sleeps = [], []

    def handler(request):
        calls.append(request)
        return (
            httpx.Response(429, headers={"retry-after": "0"})
            if len(calls) == 1
            else httpx.Response(200, json={"ok": True})
        )

    client = GHESClient(Settings(_env_file=None), httpx.MockTransport(handler), sleep=sleeps.append)
    assert client.object("user") == {"ok": True}
    assert sleeps == [0]
    client.close()


def test_untrusted_pagination_does_not_receive_token():
    calls = []

    def handler(request):
        calls.append(str(request.url))
        return httpx.Response(200, json=[{}], headers={"link": '<https://evil.example/steal>; rel="next"'})

    client = GHESClient(Settings(_env_file=None), httpx.MockTransport(handler))
    with pytest.raises(AppError):
        list(client.pages("items"))
    assert len(calls) == 1
    client.close()


def test_page_cap_is_visible():
    client = GHESClient(Settings(max_pages=1, _env_file=None))
    with pytest.raises(IntegrationError, match="최대 페이지"):
        list(client.pages("repos/example-org/vision/pulls/42/commits"))
    client.close()


def test_more_than_100_pages_when_policy_allows():
    def handler(request):
        page = int(request.url.params.get("page", 1))
        headers = (
            {"link": f'<https://github.internal.example/api/v3/items?page={page + 1}>; rel="next"'}
            if page < 101
            else {}
        )
        return httpx.Response(200, json=[{"id": page}], headers=headers)

    client = GHESClient(Settings(max_pages=101, _env_file=None), httpx.MockTransport(handler))
    assert len(list(client.pages("items"))) == 101
    client.close()


def test_long_retry_after_is_not_ignored():
    sleeps = []
    client = GHESClient(
        Settings(_env_file=None),
        httpx.MockTransport(lambda _: httpx.Response(429, headers={"retry-after": "120"})),
        sleep=sleeps.append,
    )
    with pytest.raises(IntegrationError) as error:
        client.get("user")
    assert error.value.code == "RATE_LIMITED"
    assert sleeps == []
    client.close()
