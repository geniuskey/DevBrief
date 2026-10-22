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


def test_logging_filter_masks_secret_and_exception_payload():
    import logging

    from app.core.logging import RedactingFilter

    record = logging.LogRecord(
        "test", logging.ERROR, "test", 1, "Authorization: Bearer %s", ("ghp_123456789secret",), None
    )
    assert RedactingFilter().filter(record)
    assert "ghp_" not in record.getMessage()
    record.exc_info = (ValueError, ValueError("sensitive body"), None)
    RedactingFilter().filter(record)
    assert record.exc_info is None


def test_access_log_redaction_preserves_uvicorn_formatter_contract():
    import logging

    from uvicorn.logging import AccessFormatter

    from app.core.logging import RedactingFilter

    record = logging.LogRecord(
        "uvicorn.access",
        logging.INFO,
        "test",
        1,
        '%s - "%s %s HTTP/%s" %d',
        ("127.0.0.1:5000", "GET", "/api/v1/test?token=ghp_123456789secret", "1.1", 200),
        None,
    )
    RedactingFilter().filter(record)
    rendered = AccessFormatter("%(client_addr)s %(request_line)s %(status_code)s", use_colors=False).format(
        record
    )
    assert "200 OK" in rendered
    assert "ghp_" not in rendered
