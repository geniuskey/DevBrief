# 검증 기록

## Phase 0
- Python 3.11.16 / SQLite: pytest 3 passed (비동기 생성, partial, 입력·범위 검증, KST 경계).
- Alembic upgrade → downgrade base → upgrade 성공.
- Ruff / mypy: 통과 (19 modules).
- Frontend: Vitest 2 passed, ESLint, TypeScript + Vite production build 통과.
- 의존성 감사에서 구버전 Vitest의 개발 도구 취약점 발견. 패치된 최신 Vitest/Vite로 갱신 후 재검증.
