# 검증 기록

## Phase 0
- Python 3.11.16 / SQLite: pytest 3 passed (비동기 생성, partial, 입력·범위 검증, KST 경계).
- Alembic upgrade → downgrade base → upgrade 성공.
- Ruff / mypy: 통과 (19 modules).
- Frontend: Vitest 2 passed, ESLint, TypeScript + Vite production build 통과.
- 의존성 감사에서 구버전 Vitest의 개발 도구 취약점 발견. 패치된 최신 Vitest/Vite로 갱신 후 재검증.

## Phase 1
- pytest: 15 passed (pagination/ETag, 401/403/404/429/503, retry, SSRF, page cap, PR branch dedupe, review-only attribution, exact date boundary, empty window).
- Ruff / mypy (22 modules), frontend Vitest 2 tests / ESLint / production build: 통과.
- npm audit: 0 vulnerabilities (Vitest 5.0.5 / Vite 8.3.5로 업데이트).
- 실제 GHES 연결은 수행하지 않았습니다. Fake HTTP 계약과 구현 범위는 ghes-compatibility.md 참고.

## Phase 2
- pytest: 30 passed. LLM schema/evidence hallucination/30% 성능 수치/기여자 변경/JSON mode fallback/민감값 마스킹/SSRF/XSS 검증 포함.
- Ruff format/check, mypy (24 modules), frontend Vitest 2 tests / ESLint / production build: 통과.
- 실제 사내 모델 출력의 품질·사실성은 미검증. 의미적 근거 일치는 사람의 확인이 필요합니다.

## Phase 3 — 2026-10-22 최종 검증

- Backend: **51 passed**. SQLite 테스트와 별도 PostgreSQL 16 컨테이너의 SKIP LOCKED 동시 claim·전체 보고 생성 테스트를 함께 실행했습니다.
- 추가 검증: 편집 충돌, 제외/복원, 확정 후 변경 금지, HTML/MD export, 팀 삭제 후 pending Job snapshot, IDOR/ACL 회수, remote peer/header 위조, proxy HMAC, DNS rebinding Host, Origin, 취소 fencing, 만료 lease 재점유, 최대 재시도, metadata 보존 정리, 101페이지, 긴 Retry-After, Uvicorn access formatter와 레드액션.
- Ruff check/format 및 mypy: 통과 (app 26 modules). Alembic schema drift 없음.
- SQLite 및 PostgreSQL: upgrade head → downgrade base → upgrade head 통과. 기존 PR 데이터가 있는 SQLite의 cache timestamp 추가 migration도 성공했습니다.
- Frontend: Vitest **2 passed**, ESLint, Prettier, TypeScript + Vite production build 통과.
- Playwright/Chromium: **2 passed**. 생성 → partial 표시 → 수정 → 제외/복원 → 확정 → MD 다운로드 → 히스토리 재열람, 모바일 390px overflow 없음, 관리자 GHES 검사. 로컬 Vite 환경과 **Compose PostgreSQL 17 + nginx production build** 환경 모두 통과했습니다.
- Docker Compose: API/worker/web 이미지 빌드, DB healthcheck, migration, 전체 기동, ready endpoint 성공. API/worker UID **10001**, read-only filesystem 설정 확인. macOS 키체인 초기 문제는 사용자 Docker 설정을 변경하지 않고 임시 익명 registry 설정으로 해결했습니다.
- npm audit: **0 vulnerabilities**. pip-audit(고정된 production requirements 전체): **No known vulnerabilities found**.
- CI에 위 검사와 PostgreSQL service, Playwright 회귀 흐름을 등록했습니다. 실제 원격 CI 실행은 하지 않았습니다.

검증 중 수정한 문제: SQLite naive/aware datetime의 lease 재점유 비교, 프런트 polling effect cleanup으로 완료 보고서가 사라지는 문제, Uvicorn 구조화 access log와 레드액션 필터의 형식 충돌, 초기 API/worker 동시 repository/user 등록 충돌 방지.

비차단 경고: 최신 Starlette TestClient가 httpx 대신 httpx2로의 향후 이동을 권고하는 deprecation warning 1건. 테스트는 성공했습니다.

실제 GHES/내부 LLM/SSO/TLS/egress, 운영 부하·백업 복구, 3~5명 수작업 사실성 비교는 미실시입니다. 내부 자격증명은 사용하지 않았습니다. 후속 범위는 KNOWN_LIMITATIONS.md를 참고하세요.

## oauth2-proxy 지원 — 2026-10-22

- Backend: **96 passed, 1 skipped**. 이번 실행은 `POSTGRES_TEST_URL` 없이 SQLite로 검증하여 PostgreSQL 전용 테스트 1건을 건너뛰었습니다.
- 인증 회귀: 기본/변경된 헤더 이름, 사용자명·이메일·첫 그룹 추출, 여러 그룹·빈 목록·문자열 목록 형식, 메타데이터 변경, 미신뢰 TCP peer와 전달 IP 위조, 필수 사용자명 누락·중복 헤더·잘못된 목록 거부, 비활성 사용자, 기존 HMAC/단일 사용자 모드를 확인했습니다.
- oauth2-proxy 사용자로 저장소 ACL·관리자 제한·worker 보고서 생성·IDOR 차단·권한 회수를 검증했습니다.
- Ruff check/format, mypy (26 modules), nginx `-t`: 통과했습니다. nginx 검사는 기존 로컬 web 이미지에 변경한 설정을 마운트한 임시 컨테이너에서 실행했습니다.
- 실제 oauth2-proxy/IdP 로그인과 사내 배포 연결은 실행하지 않았습니다.
