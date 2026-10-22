# DevBrief

GHES PR·커밋·리뷰를 업무 단위로 묶는 한국어 개발 주간보고. 기본은 외부 API 요청이 없는 Fake 데모이며 diff와 리뷰 본문을 수집하지 않습니다.

## 로컬 실행

Python 3.11+, uv, Node.js 22+가 필요합니다. 각각 별도 터미널에서 실행하세요.

```sh
cd backend
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --host 127.0.0.1 --no-proxy-headers
```

```sh
cd backend
uv run python -m app.worker.runner
```

```sh
cd frontend
npm ci
npm run dev
```

http://localhost:5173 에서 `alice, bob, carol`, `2026-10-12 ~ 2026-10-18`로 생성합니다. `restricted` 저장소를 선택하면 부분 실패를 확인할 수 있습니다. API 문서는 http://127.0.0.1:8000/api/docs 입니다.

설정은 `backend/.env`에 루트 `.env.example`을 복사해 조정하거나 환경변수로 제공합니다. 비밀은 파일로만 전달합니다. 운영 설정 및 검증 기록은 `docs/`를 참고하세요.

## 검증

```sh
cd backend
uv run pytest
uv run ruff check .
uv run mypy app
```

```sh
cd frontend
npm test
npm run lint
npm run build
```

## Compose 데모

```sh
export POSTGRES_PASSWORD='로컬에서-정한-비밀'
docker compose -f deploy/compose.yaml up --build
```

http://localhost:8080 에서 접속합니다. PoC는 localhost로만 노출합니다. 운영에는 사내 TLS·인증 프록시·egress 제한이 필요합니다.
