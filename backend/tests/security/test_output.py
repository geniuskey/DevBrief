import pytest

from app.core.security import AppError, redact, validated_url
from app.services.reporting import md_text, render_html


@pytest.mark.parametrize(
    "url",
    [
        "http://github.internal.example/api/v3/user",
        "https://evil.example/api/v3/user",
        "https://github.internal.example/admin",
        "https://github.internal.example/api/v3/../admin",
        "https://github.internal.example/api/v3/%2e%2e/admin",
        "https://user:pass@github.internal.example/api/v3/user",
    ],
)
def test_ssrf_validation(url):
    with pytest.raises(AppError):
        validated_url(url, "https://github.internal.example/api/v3")


def test_redaction_and_xss():
    secret = "ghp_abcdefghijklmnopqrstuvwxyz"
    assert secret not in redact(f"token={secret} private internal-secret", ("internal-secret",))
    html = render_html(md_text("<script>alert(1)</script> [link](javascript:alert(2))"))
    assert "<script>" not in html
    assert 'href="javascript:' not in html
