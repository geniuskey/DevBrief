# 관리자 실행 안내

## 로컬 데모

루트 README의 API·worker·frontend 세 프로세스를 실행합니다. Fake는 HTTP MockTransport로 실제 어댑터와 동일한 페이지네이션·오류·LLM 계약을 실행하며, 자격증명이나 외부 API가 필요 없습니다. 고정 데이터 기간은 2026-10-12~2026-10-18, 사용자는 alice/bob/carol입니다. vision은 PR 1건·커밋 3건·리뷰 1건, platform은 독립 커밋, restricted는 접근 실패를 제공합니다.

SQLite는 한 호스트에서 worker 한 개만 실행합니다. 파일 잠금으로 중복 worker를 거부합니다. 다른 호스트에서 같은 SQLite 파일을 공유하면 안 됩니다. 운영은 PostgreSQL을 사용하세요.

설정은 **backend 작업 디렉터리의 `.env`** 또는 프로세스 환경변수에서 읽습니다. `.env.example`에는 비밀이 없습니다. API와 worker에 동일한 설정을 적용하고 함께 재시작하세요.

## 실제 GHES / 내부 LLM 연결

1. 설치 GHES 버전과 read-only 전용 계정, explicit org/repo allowlist, 사내 모델, CA, egress 허용 호스트를 승인받습니다.
2. `ADAPTER_MODE=real`, `GHES_BASE_URL`, `GHES_API_BASE_URL`, `GHES_ALLOWED_ORGS`, `GHES_ALLOWED_REPOS`, `LLM_BASE_URL`, `LLM_MODEL`, `APPROVED_EGRESS_HOSTS`를 설정합니다. LLM URL은 `/v1`까지 입력합니다.
3. PAT와 LLM API key는 서버 secret 파일로 마운트하고 `GHES_PAT_FILE`, `LLM_API_KEY_FILE`에 경로만 지정합니다. DB·브라우저에 비밀 값을 저장하지 않습니다. 실행 사용자만 읽도록 파일 권한을 제한하세요.
4. 사내 CA를 `GHES_CA_BUNDLE`, `LLM_CA_BUNDLE`에 지정합니다. 인증서 검증 해제 옵션은 없습니다. HTTP proxy 환경변수는 상속하지 않습니다.
5. `GHES_API_VERSION`은 설치 버전에서 확인 후 설정합니다. 빈 값이면 헤더를 생략합니다. JSON mode 미지원 모델은 `LLM_JSON_MODE=false`; 400/422 응답 시 자동으로 한 번 생략 재시도합니다.
6. 관리자 콘솔(`#/admin`)의 **연결 상태**에서 GHES/LLM 연결 검사를 실행합니다. GHES 검사는 각 허용 저장소 접근 결과와 서버 버전을 표시합니다. PAT가 실질적으로 읽기 전용인지는 검사만으로 증명하지 못합니다.
7. 저장소가 많으면 `GHES_ALLOWED_REPOS`에 `owner/*`를 넣어 조직 전체를 허용합니다(예: `GHES_ALLOWED_REPOS=example-org/*,other-org/tools`). 아래 [조직 전체 추적](#조직-전체-추적)을 참고하세요.
8. Fake 테스트와 별도로 실제 3~5명·3~10 저장소의 1주 자료를 수작업 비교하고, 잘못된 사실과 누락을 fixture로 추가하세요.

원문은 승인한 내부 호스트로만 전송하도록 애플리케이션에서 제한합니다. DNS·방화벽·네트워크 egress allowlist는 배포 환경에서 별도로 설정해야 합니다.

## 조직 전체 추적

- `GHES_ALLOWED_REPOS`의 `owner/*` 항목은 해당 조직의 모든 저장소를 허용합니다. 개별 `owner/repo` 항목과 함께 쓸 수 있으며, `GHES_ALLOWED_ORGS`를 설정했다면 그 조직도 포함되어야 합니다.
- 저장소 목록은 `GET /orgs/{org}/repos`(PAT가 볼 수 있는 저장소만)로 찾습니다. worker가 시작할 때와 유휴 상태에서 `ORG_SYNC_MINUTES`(기본 60분)마다, 그리고 조직 범위 보고서를 만들 때마다 갱신하므로 새 저장소가 자동으로 포함됩니다. 관리자 콘솔 **연결 상태 → 조직 저장소 동기화**로 즉시 갱신할 수도 있습니다. 목록에서 사라진 저장소는 비활성화하되 과거 보고서용 행은 유지합니다.
- 사용자는 보고서·팀에서 **조직 전체**를 선택할 수 있습니다. 실행 시점에 조직 저장소로 확장하며, 기간 시작 이후 push가 없는 저장소는 조사하지 않고 coverage의 `excluded_repos`와 경고로 표시합니다. 오래된 PR에만 남긴 리뷰는 이때 누락될 수 있습니다.
- 한 보고서가 조사하는 조직 저장소는 `ORG_MAX_REPOSITORIES`(기본 100)개까지이며 최근 push 순으로 고릅니다. 초과분은 제외 목록에 남고 보고서는 partial입니다. 저장소당 API 호출이 늘어나므로 대상자 수가 많으면 `MAX_API_CALLS`도 함께 검토하세요.
- 일반 사용자의 `REPO_ACL_JSON`에도 `"example-org/*"`를 쓸 수 있습니다. 조직 전체 선택은 `owner/*` ACL이 있는 사용자(또는 관리자)만 가능합니다.

## 인증·권한

- 기본 `SINGLE_USER_MODE=true`: 실제 TCP peer가 loopback일 때만 허용합니다. Uvicorn은 `--no-proxy-headers`로 실행하여 브라우저의 X-Forwarded-For를 신뢰하지 않습니다. 개발 Vite 서버도 127.0.0.1에만 바인딩합니다.
- Compose 데모는 web과 API의 network namespace를 공유합니다. API는 127.0.0.1:8000, 공개 포트는 호스트 127.0.0.1:8080입니다. PoC를 임의로 0.0.0.0에 노출하지 마세요.
- 다중 사용자: `SINGLE_USER_MODE=false`, `TRUSTED_PROXY_IPS`에 API에 직접 접속하는 신뢰 프록시의 실제 TCP IP 주소를 쉼표로 구분해 지정합니다. 프록시는 SSO 검증을 마친 사용자의 헤더만 생성하고 클라이언트가 보낸 동일 헤더는 반드시 제거해야 합니다. 모든 모드에서 Uvicorn의 `--no-proxy-headers`를 유지합니다.
- 기본 `PROXY_AUTH_MODE=signed`: `PROXY_SECRET_FILE`에 최소 32자 이상 무작위 HMAC secret 경로를 지정합니다. oauth2-proxy 연동은 아래 별도 모드를 사용합니다.
- 헤더: `X-DevBrief-User`, `X-DevBrief-Timestamp`(Unix 초), `X-DevBrief-Signature`(SHA256 HMAC hex).
- 서명 원문은 `timestamp + "\n" + principal + "\n" + HTTP_METHOD + "\n" + path`입니다. path는 query string을 제외한 `/api/v1/...`입니다. ±60초만 허용합니다. 프록시와 API 사이에는 격리 네트워크/TLS가 필요합니다. 서명은 SSO 검증을 대신하지 않습니다.
- `ADMIN_PRINCIPALS`는 쉼표로 구분합니다. 일반 사용자는 `REPO_ACL_JSON={"alice@example.com":["example-org/vision","other-org/*"]}`처럼 명시한 repo 또는 조직만 봅니다. 설정되지 않은 사용자는 repo 권한이 없습니다. 관리자는 allowlist 내 전체 저장소에 접근합니다.
- 일반 사용자의 보고서·팀은 소유자만 접근합니다. 팀 리더 공유 ACL은 후속 범위입니다. 모든 보고서 읽기·편집·확정·다운로드와 Job 조회에서 현재 repo 권한을 다시 확인합니다. 권한 회수 후 과거 보고서도 숨겨집니다.
- `PUBLIC_ORIGIN`은 브라우저의 정확한 scheme/host/port로 설정합니다. 외부 Origin의 변경 요청을 거부하고 Host도 제한합니다. nginx 배포 예시는 PoC 전용으로 인증 헤더를 제거합니다. 운영 프록시에는 선택한 인증 모드에 맞는 헤더 전달을 구성해야 합니다.

### oauth2-proxy 연동

DevBrief API와 worker의 환경변수 또는 `backend/.env`에 다음을 설정합니다. 아래 세 `OAUTH2_PROXY_*_HEADER` 변수는 **DevBrief가 읽을 헤더 이름**이며 표시된 값이 기본값입니다.

```dotenv
SINGLE_USER_MODE=false
PROXY_AUTH_MODE=oauth2_proxy
TRUSTED_PROXY_IPS=127.0.0.1
PUBLIC_ORIGIN=https://devbrief.internal.example
OAUTH2_PROXY_PREFERRED_USERNAME_HEADER=X-Forwarded-Preferred-Username
OAUTH2_PROXY_EMAIL_HEADER=X-Forwarded-Email
OAUTH2_PROXY_GROUPS_HEADER=X-Forwarded-Groups
ADMIN_PRINCIPALS=admin
REPO_ACL_JSON={"alice":["example-org/vision"]}
```

`TRUSTED_PROXY_IPS`는 배치에 맞게 변경합니다. 이 모드는 HMAC secret이나 `X-DevBrief-*` 서명을 요구하지 않으며, 신뢰한 프록시의 실제 접속 IP에서 받은 SSO 헤더를 사용합니다. API와 중간 nginx에 사용자가 직접 접근할 수 없도록 네트워크를 제한하고, 프록시에서 클라이언트의 인증 헤더를 제거한 뒤 검증된 값으로 덮어씁니다.

| 입력 헤더 | 사용 값 |
| --- | --- |
| `X-Forwarded-Preferred-Username` | 필수 사용자 식별자. `/api/v1/me`의 `name`, 관리자 목록과 저장소 ACL의 키로 사용합니다. 기존 principal과 동일하게 영문·숫자·`@._+-`, 1~200자를 허용합니다. |
| `X-Forwarded-Email` | `/api/v1/me`의 `email`. 없거나 비어 있으면 `null`입니다. |
| `X-Forwarded-Groups` | 목록의 첫 항목을 `/api/v1/me`의 `group`으로 제공합니다. `[]` 또는 헤더가 없으면 `null`입니다. |

그룹은 `["engineering", "platform"]` 또는 `['engineering', 'platform']`이면 `engineering`을 사용합니다. 쉼표로 구분한 `engineering,platform`과 단일 값도 지원합니다. 잘못된 목록과 중복 인증 헤더는 401로 거부합니다. 이메일·그룹은 매 요청의 검증된 헤더에서 읽으며 DB에 추가 저장하지 않습니다. 앱 권한은 `ADMIN_PRINCIPALS`와 사용자명 기준 `REPO_ACL_JSON`으로 결정하므로 그룹 이름이 `admin`이어도 자동 승격되지 않습니다.

oauth2-proxy가 직접 upstream으로 요청을 보내는 구성에서는 `--pass-user-headers=true`로 세 헤더를 전달합니다. nginx `auth_request` 구성의 `--set-xauthrequest=true`는 `X-Auth-Request-*` 응답 헤더를 생성하므로 nginx에서 위 `X-Forwarded-*` 요청 헤더로 매핑하거나 DevBrief 헤더 이름을 변경해야 합니다. 옵션은 [oauth2-proxy 공식 헤더 설정](https://oauth2-proxy.github.io/oauth2-proxy/configuration/overview/#header-options)을 참고하세요.

`브라우저 → oauth2-proxy → nginx → API`로 배치할 때는 oauth2-proxy에서만 접근 가능한 nginx에 아래 `/api/` location을 사용합니다. `TRUSTED_PROXY_IPS`에는 API에 직접 접속하는 nginx의 IP를 지정합니다. 아래 예시의 기본 헤더 이름을 변경했다면 전달 설정도 함께 맞춥니다.

```nginx
location /api/ {
  proxy_pass http://127.0.0.1:8000;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Preferred-Username $http_x_forwarded_preferred_username;
  proxy_set_header X-Forwarded-Email $http_x_forwarded_email;
  proxy_set_header X-Forwarded-Groups $http_x_forwarded_groups;
}
```

기본 `deploy/compose.yaml`은 단일 사용자 데모 설정을 고정하며 `deploy/env.example`을 자동 적용하지 않습니다. oauth2-proxy 배포에서는 위 환경변수를 API·worker에 전달하는 별도 Compose override 또는 배포 정의와 nginx 설정을 사용하세요.

## Job 및 장애 복구

API는 queued Job을 저장한 뒤 202를 반환합니다. worker는 PostgreSQL SKIP LOCKED로 한 건을 점유하고 주기적으로 lease를 갱신합니다. 죽은 worker의 만료된 Job은 재점유하며 최대 시도 횟수 이후 failed입니다. lease token fencing으로 취소·재점유된 worker의 늦은 저장을 막습니다. HTTP 호출은 timeout/retry, 전체 작업은 시간·호출·페이지·이벤트 예산을 가집니다. 실행 중 취소는 현재 HTTP 호출이 끝난 후 반영될 수 있습니다.

같은 사용자의 동일한 queued/running 요청은 기존 Job을 반환합니다. 여러 API 인스턴스에서 완전히 동시에 접수되는 중복을 DB unique로 막지는 않습니다. 완료·실패한 요청을 다시 생성하면 새로운 Job입니다.

`complete`: 명시한 범위에서 수집·분석을 마침. `partial`: 일부 repo/API/페이지/LLM 검증 실패. `failed`: 전체 조회 실패 또는 처리 오류. complete도 GHES 전체 개발 활동을 뜻하지 않습니다.

## 보존·백업

```sh
cd backend
uv run python -m app.worker.retention
uv run python -m app.worker.retention --execute
```

첫 명령은 대상 개수만 확인합니다. `--execute`는 `RETENTION_DAYS`를 넘긴 원본 event payload, 커밋/리뷰/PR 캐시를 정리합니다. 보고서·수정 이력·감사 로그와 증거 URL은 남습니다. 이 자료의 조직별 보관·삭제 정책은 별도 운영 정책으로 정해야 합니다. 정기 실행은 cron/사내 scheduler에 위 명령을 등록하세요. 기본 배포는 자동 삭제를 예약하지 않습니다.

PostgreSQL은 사내 백업 시스템 또는 pg_dump/pg_restore로 백업·복구하고 secret을 백업 데이터와 분리합니다. 이 저장소에서 SQLite/PostgreSQL 마이그레이션 왕복을 검증했지만 운영 백업 복구 리허설은 설치 환경에서 해야 합니다.

## 패키지·컨테이너

`uv.lock`, `requirements.lock`, `package-lock.json`으로 버전을 고정합니다. Python 변경 후 `uv export --no-dev --no-hashes --format requirements-txt --output-file requirements.lock`을 갱신하세요. uv 사내 미러는 `UV_DEFAULT_INDEX`, npm은 사내 registry 설정을 사용합니다. Docker 빌드 인자 `PIP_INDEX_URL`, `NPM_REGISTRY`, `PYTHON_IMAGE`, `NODE_IMAGE`, `NGINX_IMAGE`와 Compose `POSTGRES_IMAGE`로 승인 미러/이미지를 지정할 수 있습니다.

Compose의 POSTGRES_PASSWORD는 데모 DB 설정용 환경변수입니다. 운영은 secret manager와 별도 배포 정의를 사용하세요. API/worker 컨테이너는 UID 10001 비루트이며 filesystem을 read-only로 실행합니다. 운영 TLS 종료와 SSO 프록시 설정은 조직별로 추가해야 합니다.
