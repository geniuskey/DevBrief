import logging

from app.core.security import redact


class RedactingFilter(logging.Filter):
    def __init__(self, secrets=()):
        super().__init__()
        self.secrets = secrets

    def filter(self, record):
        if record.name == "uvicorn.access" and isinstance(record.args, tuple):
            # Uvicorn AccessFormatter requires the original five structured arguments.
            record.args = tuple(redact(v, self.secrets) if isinstance(v, str) else v for v in record.args)
        else:
            record.msg = redact(record.getMessage(), self.secrets)
            record.args = ()
        # Exception payloads from upstream services may contain credentials or repository bodies.
        if record.exc_info:
            record.msg += " [exception details omitted]"
            record.exc_info = None
            record.exc_text = None
        return True


def configure_logging(settings):
    secrets: tuple[str, ...] = ()
    if settings.adapter_mode == "real":
        secrets = (settings.secret("ghes_pat_file"), settings.secret("llm_api_key_file"))
    filter_ = RedactingFilter(secrets)
    for name in ("", "uvicorn", "uvicorn.error", "uvicorn.access", "httpx", "httpcore"):
        logger = logging.getLogger(name)
        logger.addFilter(filter_)
        for handler in logger.handlers:
            handler.addFilter(filter_)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
