from fastapi import Depends

from app.core.security import AppError, audit
from app.integrations.ghes_client import GHESClient


def register_routes(app, settings, db_session, principal, visible_report):
    def admin(user=Depends(principal)):
        if user.role != "admin":
            raise AppError("FORBIDDEN", "관리자 권한이 필요합니다", 403)
        return user

    @app.post("/api/v1/admin/connections/ghes/test")
    def test_ghes(user=Depends(admin), db=Depends(db_session)):
        client = GHESClient(settings)
        try:
            result = client.test_connection()
            result["repositories"] = []
            for name in settings.allowed_repos:
                try:
                    client.object("repos/" + name)
                    state = "accessible"
                except AppError as exc:
                    state = exc.code
                result["repositories"].append({"full_name": name, "state": state})
            audit(db, user, "connection.ghes_tested")
            db.commit()
            return result
        finally:
            client.close()

    @app.get("/api/v1/github/users")
    def github_users(q: str, user=Depends(principal)):
        import re

        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9-]{0,38}", q):
            raise AppError("INVALID_LOGIN", "정확한 GitHub ID를 입력하세요", 422)
        client = GHESClient(settings)
        try:
            account = client.user(q)
            return [
                {
                    "login": account["login"],
                    "github_numeric_id": account["id"],
                    "is_bot": account.get("type") == "Bot",
                }
            ]
        finally:
            client.close()

    @app.post("/api/v1/admin/connections/llm/test")
    def test_llm(user=Depends(admin), db=Depends(db_session)):
        from app.integrations.llm_client import LLMClient

        client = LLMClient(settings)
        try:
            result = client.test_connection()
            audit(db, user, "connection.llm_tested")
            db.commit()
            return result
        finally:
            client.close()
