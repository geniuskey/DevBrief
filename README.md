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

oauth2-proxy 연동은 `SINGLE_USER_MODE=false`, `PROXY_AUTH_MODE=oauth2_proxy`, `TRUSTED_PROXY_IPS`로 활성화합니다. 사용자명·이메일·그룹 헤더를 읽고 그룹 목록의 첫 값을 사용합니다. 헤더 이름과 프록시 배치는 [관리자 안내](docs/admin-guide.md#oauth2-proxy-연동)를 참고하세요.

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

문서: [관리자 안내](docs/admin-guide.md) · [API](docs/api.md) · [보안 검토](docs/security.md) · [검증 결과](docs/TEST_RESULTS.md) · [알려진 제한](docs/KNOWN_LIMITATIONS.md)

브라우저 회귀 검증은 API의 `PUBLIC_ORIGIN=http://127.0.0.1:5174`, Vite의 `--port 5174 --strictPort`로 세 프로세스를 시작한 뒤 실행합니다.

```sh
cd frontend
npx playwright install chromium
npm run test:e2e
```

기본 데모는 API/worker 분리 실행이 필요합니다. 내부 서버 연동과 시범 운영은 관리자 안내의 설치 환경 검증을 거쳐야 합니다.
