# DevBrief — 사내 GitHub Enterprise Server 한국어 개발 주간보고

> 문서 버전: 1.0 / 2026-10-22  
> 목적: Codex가 단계별로 구현하고, 보안 담당자·실무자가 검토할 수 있는 PRD + 기술설계 + API 계약 + 개발 지시서  
> 대상: 자체 설치형 GitHub Enterprise Server(GHES) 3.x, PAT, 사내 OpenAI 호환 LLM, 사내망 배포

## 0. 핵심 의사결정

- **자체 구축**: FastAPI + React/TypeScript + PostgreSQL(운영) + SQLite(로컬 개발) + 내부 LLM API. 오픈소스는 라이브러리 단위로만 재사용.
- **Repo-first 검색**: GHES 전역 검색을 유일한 정답으로 사용하지 않는다. 권한 있는 조직/저장소를 먼저 확정하고 해당 저장소의 PR·커밋·리뷰를 조사한다.
- **사실 기반 보고**: GitHub 이벤트를 작업 묶음으로 정규화하고, 근거가 있는 문장만 한국어로 생성한다. LLM 추론과 측정된 성과를 구별한다.
- **안전한 단위 권한**: PoC는 관리자가 제공하는 *read-only PAT* 1개로 한정된 저장소만 조회. 이후 사용자별 접근제어/권한을 확대한다.
- **기본값은 코드 본문 미수집**: PR 제목·본문·레이블·파일 경로·커밋 메시지로 분석; diff와 리뷰 본문은 별도 허용 정책에서만 수집.
- **비동기 Job**: 사용자 요청 시 Job 생성 → 수집/분석/보고서 생성 → 진행률 확인. Web 요청을 긴 시간 점유하지 않는다.
- **범위 명시**: 보고서는 조회 가능한 저장소 목록, 제외/실패한 항목, 데이터 수집 시각을 보여준다. GitHub 전체 개발량이나 인사 평가를 대표하지 않는다.

## 1. PRD

### 1.1 문제 정의

개발자들이 다수의 사내 저장소에서 만든 커밋, PR, 리뷰, Issue 처리 내용을 매주 수작업으로 모아 한국어 보고서로 다시 적는다. 동일 업무에 속한 여러 커밋이 중복 기록되고, 팀의 공동 성과와 개인의 역할을 일관되게 파악하기 어렵다.

### 1.2 사용자·역할

| 역할 | 주요 시나리오 | 접근 범위 |
|---|---|---|
| 작성자 | 자신의 ID/기간/저장소를 선택하여 보고서 생성·수정·복사 | 권한 부여된 저장소 및 자신의 보고서 |
| 팀 리더 | 등록된 팀원들의 활동을 팀 단위 과제로 통합 | 관리자 허용 팀/저장소/보고서 |
| 관리자 | GHES/LLM 연결, 팀 구성, 수집 정책, 감사로그, 토큰 운영 | 시스템 설정/감사 |

**인증 주의:** GHES PAT는 API 인증 수단이지 DevBrief 웹 사용자 로그인 수단이 아니다. MVP는 사내 인증 프록시가 제공하는 검증된 사용자 헤더(프록시 IP·서명/네트워크 신뢰 경계 검사) 또는 사내 SSO가 있는 환경에서만 다중 사용자 운영. 해당 환경이 없다면 `SINGLE_USER_MODE=true`와 localhost/Tailscale 유사 승인된 사내 접속 경계로 PoC를 제한한다. 브라우저가 임의 설정한 `X-User`를 그대로 신뢰하지 않는다.

### 1.3 사용자 흐름

1. 로그인 → GitHub ID 여러 개 입력 또는 저장된 팀 선택.
2. 조회 기간 [시작, 종료) KST 날짜 및 저장소/조직 범위 선택.
3. 수집 모드 선택: `metadata_only`(기본) / `include_diff`(별도 권한·경고).
4. 보고서 생성 Job 시작 → 수집 대상/진행률/실패 건수 표시.
5. PR·커밋·리뷰를 업무 그룹으로 정리 → 한국어 보고 초안, 항목별 근거 확인.
6. 사람이 업무 제목·내용을 수정/제외하고 확정 → Markdown/HTML 내보내기.
7. (후속) 정기 생성, 이전 주차 연결, Confluence 업로드.

### 1.4 Must/Should/Won't

**MVP Must:** GHES 연결 검사, PAT 보안 저장, 명시적 대상 org/repo 설정, 다중 ID·기간, 커밋/PR/리뷰 수집, 페이지네이션/재시도, 업무 그룹화, 한국어 LLM 요약, 출처 링크, 편집·확정, MD 출력, 수집 범위/실패 표시, 로그 레드액션, 통합 테스트.

**Next Should:** Issue 이벤트, 조직/팀 동기화, 활동 비교, 저장소별 템플릿, 자동 스케줄, Confluence, 사용자별 ACL, 추가 GitHub App 인증 옵션.

**Not MVP:** 생산성 순위화, 직원 점수화, 코드 품질 자동 평가, 변경 코드 전체 색인, 대규모 RAG/벡터DB, 외부 클라우드 업로드.

### 1.5 성공 기준 (시작점; PoC에서 보정)

- 관리자가 허용한 테스트 저장소 3~10개, 사용자 3~5명, 1주 기간 보고서 생성 완료.
- 동일 PR과 관련 커밋이 업무 항목에서 이중 집계되지 않음.
- 보고서의 모든 사실성 있는 성과 문장에 1개 이상 증거 URL 또는 `근거 부족` 표기.
- 사용자 수작업 검토에서 **사실 오류 0건**을 목표로 하고 오류 사례를 회귀 테스트로 축적.
- 임의의 토큰·자격증명·비공개 diff가 브라우저/로그/예외 추적에 노출되지 않음.
- 수집 불완전 상태를 성공으로 위장하지 않음(`complete/partial/failed`).
- 보고서 1건을 Markdown으로 복사해 현업 양식에 활용 가능.

## 2. 권장 구조

```text
[사내 사용자 브라우저]
       │ 사내 TLS + 인증 프록시/SSO
       ▼
[React SPA]  ──────> [FastAPI REST]
                         │       │
                         │       ├── [PostgreSQL: 팀/활동/작업그룹/보고서/감사]
                         │       └── [Job Worker: 처음에는 DB 큐+독립 프로세스]
                         │                    │
                         │                    ├── [GHES REST API /api/v3]
                         │                    └── [사내 OpenAI 호환 LLM]
                         └── [Health/metrics/audit]
```

- 개발 환경: Python 3.11+, uv, FastAPI, httpx, Pydantic v2, SQLAlchemy 2, Alembic, PostgreSQL, React/Vite/TypeScript, pytest, Playwright.
- 처음에는 Redis/Celery 불필요. PostgreSQL `jobs` 행을 worker가 `FOR UPDATE SKIP LOCKED`로 점유하고 재시작/임대시간을 관리. SQLite 개발 시 단일 worker만 허용.
- 프로젝트 구조:

```text
devbrief/
  backend/
    app/api/{auth,health,config,users,repositories,teams,reports,jobs}.py
    app/core/{settings,security,logging}.py
    app/integrations/{ghes_client,llm_client}.py
    app/services/{discovery,collection,normalization,grouping,reporting,export}.py
    app/models/  app/schemas/  app/worker/  alembic/
    tests/{unit,integration,contract,security}/
  frontend/src/{pages,components,api,hooks,types}/
  deploy/{compose.yaml,env.example,nginx.conf}/
  docs/{admin-guide,security,api,report-style}.md
```

## 3. GHES 연결 및 수집 설계

### 3.1 연결 설정

```dotenv
GHES_BASE_URL=https://github.internal.example
GHES_API_BASE_URL=https://github.internal.example/api/v3
GHES_API_VERSION=2022-11-28  # 해당 GHES 버전에서 지원 여부 확인 후 사용. 미지원 시 헤더 제거 가능하도록 구성
GHES_CA_BUNDLE=/etc/ssl/certs/company-ca.pem
GHES_PAT_FILE=/run/secrets/ghes_pat
GHES_ALLOWED_ORGS=example-org
GHES_ALLOWED_REPOS=example-org/repo-a,example-org/repo-b
LLM_BASE_URL=https://llm.internal.example/v1
LLM_MODEL=company-model-name
LLM_API_KEY_FILE=/run/secrets/llm_api_key
LLM_CA_BUNDLE=/etc/ssl/certs/company-ca.pem
DATA_POLICY=metadata_only
REPORT_TIMEZONE=Asia/Seoul
```

- TLS 검증 **항상 활성화**. 인증서 오류는 사내 CA 설치로 해결; `verify=False` 금지.
- URL은 관리자가 정한 허용 호스트/경로만 사용. GitHub API의 `Link` 헤더/HTML URL을 추종할 때도 동일 호스트/허용 프로토콜 검사(SSRF 방지).
- GHES 정확한 3.x 버전·API 헤더 지원 여부는 시작 시 `GET /meta` 또는 `GET /user` 등 검증된 API와 응답 헤더로 확인하고 feature flags 기록.
- PAT는 배포 secret 파일/env에서 서버만 읽음. 브라우저 입력·전달·저장 금지. 가능한 경우 fine-grained read-only; GHES 버전/조직 정책상 불가하면 만료일 짧은 classic PAT를 엄격히 제한된 계정으로 사용. classic `repo` 권한은 읽기 전용 범위를 보장하지 못하므로 계정 자체를 read-only collaborator로 두어야 함.
- 운영 서버에서 PAT로 읽은 데이터는 해당 PAT가 볼 수 있는 모든 정보를 노출할 가능성이 있다. **허용 org/repo allowlist와 앱 자체 사용자 ACL을 둘 다 적용**.

### 3.2 데이터 범위 발견 (가장 어려운 부분)

1. 운영자가 org/repo allowlist 지정 → 접근 테스트 → 목록 캐시.
2. 지정된 저장소에서 기간 관련 PR을 찾음: PR `updated_at` 윈도우 후보를 확보하되 `created_at`, `merged_at`, `closed_at`와 각 리뷰 시간으로 실제 이벤트 판정.
3. 저장소별 커밋 목록 조회: `GET /repos/{owner}/{repo}/commits?author={login}&since=...&until=...`, 필요 시 `sha={branch}`. 기본 브랜치에 없는 PR 브랜치 커밋은 PR 커밋 목록에서 보완.
4. PR 관련 커밋은 `GET /repos/{owner}/{repo}/pulls/{number}/commits`로 연계하여 독립 커밋과 중복 제거.
5. PR 리뷰는 `GET /repos/{owner}/{repo}/pulls/{number}/reviews`; `submitted_at`으로 기간 판정. 리뷰 코멘트는 정책에 따라 제외 가능.
6. Issues는 2차: PR과 issues API의 객체 중복(`pull_request` 존재 여부) 주의.
7. GitHub 전역 검색 API는 후보 발견용 *보조 수단*. 인덱싱/쿼리·결과 수 제한 및 접근 범위 문제 때문에 전체성 보장 불가.
8. 사용자가 요청한 GitHub ID의 `GET /users/{username}`로 canonical ID 확인; 이메일 기반 커밋 미연결, bot, 공동 작성자, squash merge는 불확실성 표시.
9. 조회 완료 메타데이터: `scope_repos`, `branches_checked`, `excluded_repos`, `failed_repos`, `collected_at`, `is_complete`, `warnings`.

**기간 원칙:** 사용자 UI에서 `2026-10-12 ~ 2026-10-18`을 선택하면 KST 기준 `[2026-10-12T00:00+09:00, 2026-10-19T00:00+09:00)`으로 정규화하고 API 호출 시 UTC로 변환. 경계 데이터는 안전 마진을 두고 가져온 뒤 클라이언트에서 정확히 필터링. 활동 종류별 `occurred_at` 사용(커밋 `committer.date` / PR created·merged·closed / review submitted).

### 3.3 호출 안정성

- 모든 리스트 API는 `per_page=100` + 응답 `Link rel=next` 순회; 최대 페이지/호출 시간·총 이벤트 수를 정책으로 제한하고 잘림을 `partial`로 표시.
- Rate limit 헤더와 `Retry-After`·backoff+jitter에 따라 403/429 및 일시적 5xx 재시도, 401 토큰 만료/403 권한 문제/404 숨겨진 저장소 구분 시도. 실질적으로 구분할 수 없으면 `not_accessible`로 기록.
- ETag/If-None-Match 및 마지막 수집 시각으로 재수집 비용 절감; 최근 7~14일은 늦게 merge/review된 건 반영 위해 재조회.
- API 기본 응답·민감한 본문 전체를 INFO 로그에 남기지 않음.
- PAT 별 접근 제한을 캐시 키에 포함하여 권한이 다른 사용자 사이 캐시 재사용하지 않음.

### 3.4 공식 REST 엔드포인트 매핑

| 목적 | HTTP / 엔드포인트 |
|---|---|
| 인증 확인 | `GET /user` |
| 사용자 식별 | `GET /users/{login}` |
| 저장소 확인 | `GET /repos/{owner}/{repo}` |
| 조직 저장소 조회(허용 시) | `GET /orgs/{org}/repos` |
| 커밋 | `GET /repos/{owner}/{repo}/commits` |
| PR 목록 | `GET /repos/{owner}/{repo}/pulls` 또는 이슈 검색으로 후보 좁히기 |
| PR 상세 | `GET /repos/{owner}/{repo}/pulls/{number}` |
| PR 커밋 | `GET /repos/{owner}/{repo}/pulls/{number}/commits` |
| PR 리뷰 | `GET /repos/{owner}/{repo}/pulls/{number}/reviews` |
| PR 파일명(선택) | `GET /repos/{owner}/{repo}/pulls/{number}/files` |

정확한 엔드포인트/헤더 및 PAT 허용 범위는 **설치된 GHES의 정확한 3.x 버전 문서**에서 확인한다. `pulls` 목록을 단순 `updated_at`으로 검색한다고 가정하지 말고, 실제 API 필터 가능 항목(일부는 `sort`, `direction`, `state`)과 기간 필터링을 구별한다.

## 4. 정규화/집계 알고리즘

### 4.1 Activity 종류

`commit_authored`, `pr_opened`, `pr_merged`, `pr_closed`, `pr_updated`(정확한 변경 시각 판단 가능할 때만), `pr_reviewed`, `issue_closed`(후속).

- 활동 원본의 식별 키: `(ghes_instance_id, repository_id, source_type, source_id, event_type, occurred_at)`; PR opened와 merged는 각각 별도 이벤트.
- 커밋 저장 키: `(repository_id, sha)`; 같은 SHA의 PR 포함은 `commit_pr_links` 테이블로 표시.
- 사용자 기여 역할: `author`, `committer`, `reviewer`, `coauthor`(근거가 있을 때만) / `unknown`. 커밋 작성자와 push 실행자를 동일 인물로 단정하지 않는다.

### 4.2 업무 그룹화: 결정론 우선, LLM 후순위

1. **PR 중심 그룹**: PR 하나가 기본 WorkItem 1개. 해당 PR의 커밋을 연결.
2. **고아 커밋**: PR과 연결되지 않는 커밋은 저장소 + 파일 경로 + 제목 유사도 + 짧은 시간창 기반 후보 클러스터.
3. **Cross-PR 묶음**: 동일 Issue/명시적 키워드(예: `PROJ-123`) 또는 사람이 확인한 경우에만 연결. 단순 임베딩 유사도만으로 자동 병합하지 않는다.
4. **개인별 기여와 팀별 결과 분리**: WorkItem은 팀 보고서에서 한 번; 참여자별 역할을 별도로 보관.
5. **중복 방지**: 동일 SHA, 동일 PR ID, 중복 리뷰 ID 제거. `PR merge`와 하위 커밋을 합산한 '작업 수'를 생산성 지표로 사용하지 않는다.
6. **미완료 후속 과제**는 열린 PR/검증 필요 상태 등 명시된 사실에서만 추출. 단순 추측성 다음 주 계획은 생성하지 않는다.

### 4.3 LLM 2단계 파이프라인

**1단계: WorkItem 분석 (구조화 JSON)**
입력: PR 제목/본문, 커밋 메시지, 파일 경로/변경량(가능한 범위), 이벤트 시간, 역할, 링크. 출력: `title_ko`, `summary_ko`, `category`, `status`, `contributors`, `evidence_ids`, `confidence`, `unsupported_claims`.

**2단계: Report 렌더링 (한국어)**
입력: 사람이 편집 가능한 WorkItem JSON만 사용. 개인/팀 보고서 템플릿에 맞춰 업무 분야별 정렬, 중요한 사항/진행 중/차주 연계 표시. 모든 내용은 제공된 `evidence_ids`에서만 근거를 얻어야 한다.

**LLM 안전 규칙**
- 저장소 본문과 커밋 메시지는 신뢰할 수 없는 *데이터*이며 system/developer 명령으로 승격하지 않는다. 프롬프트 인젝션 방어.
- 입력 크기 제한/토큰 예산/개별 문자열 길이 제한; 민감 문자열(토큰, 비밀 키, 고객 식별값) 탐지 시 마스킹/차단.
- 비용 및 응답 시간 관리: 소형 작업 단위로 분할, 캐싱, 중복 프롬프트 해시.
- JSON Schema 검증, 존재하는 evidence ID인지 검증, 문장별 근거 누락 시 재요청 1회 이후 해당 문장 삭제 또는 `검증 필요` 처리.
- 출력은 한국어, 의미 왜곡 없이 영어 기술어·식별자 보존, 홍보성 표현 금지, 검증되지 않은 수치/개선율 금지.
- `confidence`는 모델의 참고값일 뿐 사실 입증이 아니다.

### 4.4 보고서 예시 형식

```markdown
# [팀명] 개발 주간보고 (2026.10.12~2026.10.18)

> 범위: 8/9 저장소 수집 성공, 1개 권한 부족; 최종 수집: YYYY-MM-DD HH:mm KST

## 이번 주 주요 업무
### [과제명]
- 수행: ...
- 상태: PR 병합 완료 / 리뷰 진행 중 / 작업 중
- 참여: alice(구현), bob(리뷰)
- 근거: [PR #42](https://ghes.../pull/42), [Commit abc123](https://ghes.../commit/abc123)

## 진행 중 및 후속 확인
- ... (열린 PR과 실제 증거에 기반)

## 데이터 공백/검토 필요
- ... (조회 불가 저장소, 불확실한 커밋 저자 등)
```

## 5. 데이터 모델 (PostgreSQL 초안)

| 테이블 | 대표 필드 | 제약·용도 |
|---|---|---|
| `app_users` | `id UUID PK`, `principal UNIQUE`, `display_name`, `role`, `active` | 앱 웹 인증 주체 |
| `github_accounts` | `id`, `instance_id`, `github_numeric_id`, `login`, `display_name`, `is_bot` | `(instance_id, github_numeric_id)` 유니크 |
| `teams` | `id`, `name`, `created_by` | 사용자 정의 팀 |
| `team_members` | `team_id`, `github_account_id`, `valid_from`, `valid_until` | 과거 팀 구성 보존 |
| `ghes_instances` | `id`, `host`, `api_base`, `version`, `ca_ref`, `auth_credential_ref` | 비밀 원문 DB 금지 |
| `repositories` | `id`, `instance_id`, `ghes_repo_id`, `full_name`, `private`, `enabled`, `access_state` | `(instance_id, ghes_repo_id)` 유니크 |
| `repo_acl` | `repo_id`, `app_principal_or_group`, `permission` | 앱별 열람 권한 |
| `sync_runs` | `id`, `requested_by`, `start_utc`, `end_utc`, `scope_json`, `status`, `coverage_json`, `started_at`, `finished_at` | 범위·완전성 추적 |
| `github_events` | `id`, `repo_id`, `source_type`, `source_id`, `event_type`, `occurred_at`, `actor_id`, `url`, `payload_min_json`, `sync_run_id` | 원본 데이터 정규화/중복 제거 |
| `commits` | `repo_id`, `sha`, `author_id`, `committer_id`, `committed_at`, `message`, `url` | 복합 UNIQUE |
| `pull_requests` | `repo_id`, `number`, `author_id`, `title`, `body_redacted`, `state`, `created_at`, `merged_at`, `closed_at`, `url` | 복합 UNIQUE |
| `commit_pr_links` | `repo_id`, `sha`, `pr_number` | PR-커밋 관계 |
| `reviews` | `repo_id`, `review_id`, `pr_number`, `reviewer_id`, `state`, `submitted_at`, `url` | 리뷰 고유 키 |
| `work_items` | `id`, `sync_run_id`, `repo_id`, `title_ko`, `summary_ko`, `category`, `status`, `confidence`, `edited_by`, `version` | 추출·수정 가능한 과제 |
| `work_item_evidence` | `work_item_id`, `github_event_id`, `role` | 문장 근거 참조 |
| `work_item_contributors` | `work_item_id`, `github_account_id`, `contribution_role` | 팀 기여 분리 |
| `report_jobs` | `id`, `requested_by`, `type`, `period_start`, `period_end`, `status`, `progress`, `error_code`, `retry_count`, `lease_until`, `created_at` | 비동기 실행 |
| `reports` | `id`, `job_id`, `team_id`, `owner_id`, `status`, `revision`, `markdown`, `coverage_json`, `created_at`, `finalized_at` | 초안·확정 |
| `report_revisions` | `report_id`, `revision`, `editor_id`, `content_md`, `edited_at` | 편집 추적 |
| `audit_logs` | `id`, `principal`, `action`, `resource_type`, `resource_id`, `time`, `result`, `metadata_redacted` | 누가 무엇을 조회·수정·다운로드했는지 |

필수 인덱스: `github_events(repo_id, occurred_at)`, `github_events(actor_id, occurred_at)`, `pull_requests(repo_id, number)`, `reviews(reviewer_id, submitted_at)`, `report_jobs(status, lease_until)`. 모든 FK/NOT NULL/unique 및 삭제 정책 Alembic에서 정의. 개인정보 최소 보존, 관리자 설정 보존기간에 따른 삭제 Job 제공. 보고서가 참조하는 증거 삭제 시 출처 링크는 남기되 캐시된 민감 데이터는 정리.

## 6. DevBrief 자체 REST API (`/api/v1`)

인증: 서버 측 인증된 principal 기반. 모든 API는 권한 체크; 관리자 API 별도 역할 검증. 에러 공통 포맷 `{code, message_ko, request_id, details_safe}`.

| Method | Path | 기능 |
|---|---|---|
| GET | `/health/live` | 앱 프로세스 상태(비인증·민감 내용 없음) |
| GET | `/health/ready` | DB/내부 종속성 연결(접근 제한) |
| GET | `/me` | 인증 사용자/권한 |
| GET | `/settings/capabilities` | GHES 기능·허용 범위·LLM 사용 가능 여부(비밀 제거) |
| POST | `/admin/connections/ghes/test` | 관리자 GHES 인증/버전/권한 확인 |
| POST | `/admin/connections/llm/test` | 관리자 LLM 연결 검증 |
| GET | `/github/users?q=` | 접근 가능한 범위에서 계정 찾기 |
| GET | `/repositories?org=&q=` | allowlist + ACL 적용 저장소 조회 |
| GET/POST | `/teams` | 팀 목록/생성 |
| GET/PUT/DELETE | `/teams/{team_id}` | 팀 상세/수정/삭제 |
| POST | `/reports` | 보고서 생성 Job 접수(202) |
| GET | `/jobs/{job_id}` | 단계별 상태/진행률/경고 |
| GET | `/reports/{report_id}` | 보고서 본문 + evidence + coverage |
| PATCH | `/reports/{report_id}/work-items/{work_item_id}` | 업무별 수정/제외(버전 충돌 감지) |
| POST | `/reports/{report_id}/finalize` | 최종 확정 |
| GET | `/reports/{report_id}/export?format=md` | Markdown 내보내기 |
| GET | `/reports?team_id=&from=&to=` | 열람 허용된 히스토리 |
| GET | `/admin/audit-logs` | 감사 로그(관리자만) |

### 6.1 요청 예시

```http
POST /api/v1/reports
Content-Type: application/json

{
  "type": "team",
  "github_logins": ["alice", "bob"],
  "repository_ids": ["<UUID repo A>", "<UUID repo B>"],
  "start_date": "2026-10-12",
  "end_date": "2026-10-18",
  "timezone": "Asia/Seoul",
  "policy": "metadata_only",
  "template": "technical_weekly_ko"
}
```

```json
{
  "job_id": "<UUID>",
  "status": "queued",
  "status_url": "/api/v1/jobs/<UUID>"
}
```

### 6.2 상태 및 경고 예시

```json
{
  "job_id": "<UUID>",
  "status": "partial",
  "stage": "report_ready",
  "progress_percent": 100,
  "report_id": "<UUID>",
  "coverage": {
    "repositories_requested": 3,
    "repositories_succeeded": 2,
    "repositories_failed": 1,
    "is_complete": false
  },
  "warnings": [{"code": "REPO_ACCESS_DENIED", "repository": "org/repo-x"}]
}
```

**HTTP 응답 정책:** 접수 202; 잘못된 날짜·입력 422; 인증 401; 권한 403; 비공개 경로의 존재 은닉을 위해 필요한 경우 404; 낙관적 편집 충돌 409; 제한 초과 429. 작업 자체 실패/부분 성공은 job 상태로 표시.

## 7. 화면 설계

1. **보고서 생성**: 개발자 ID 칩 입력, 팀 선택, 날짜 범위, 저장소 다중 선택, 분석 모드, 생성 버튼. 선택한 저장소 수와 권한 경고 표시.
2. **진행 상황**: 저장소 스캔 수/커밋/PR/리뷰 수(계산값), LLM 단계, 부분 실패 이유.
3. **보고서 뷰어**: 업무 카테고리, 개인별/팀별 토글, 각 문장 근거 링크, 근거 부족 표시, 수정/제외, Markdown 복사, 확정.
4. **히스토리**: 생성 주차/팀/요청자/완료 상태/조회 범위 검색.
5. **관리자**: GHES/LLM 연결 테스트, 조직/저장소 allowlist, 보존 기간, 민감 본문 수집 정책, 감사 로그.

국문 UI 원칙: 버튼/오류/경고/보고서는 기본 한국어. 저장소명·클래스명·영문 기술어는 원문 유지. 다크모드 후순위, 접근성(키보드/라벨/상태 메시지) 확보.

## 8. 배포·보안 체크리스트

- [ ] GHES/LLM 요청이 사내망 경계 내에서만 나가도록 egress allowlist 적용.
- [ ] 내부 TLS 인증서 체인 검증, Docker 이미지·Python/JS 패키지는 승인된 사내 미러/레지스트리에서 설치.
- [ ] 비밀은 Docker secrets 또는 사내 Secret Manager; `.env`와 Git 커밋, 브라우저 응답, 로그에 값 삽입 금지.
- [ ] 접속 인증, 서비스 역할별 권한, repo ACL, 보고서 목록/다운로드 권한 검사(IDOR 테스트).
- [ ] 웹 입력·PR Markdown 출력 XSS 방지(서버/클라이언트 sanitization), CSP, CSRF 정책(SameSite/anti-CSRF) 적용.
- [ ] 프롬프트 인젝션, 모델 hallucination, 민감 데이터 LLM 반출 정책 검사.
- [ ] 스키마·설정 마이그레이션, DB 백업/복구 리허설, 로그·데이터 보관기간 설정.
- [ ] TLS 강제, 보안 헤더, 의존성 취약점 점검, 서비스 전용 비루트 컨테이너, read-only FS(가능한 곳).
- [ ] 실패/취소/재실행/timeout/worker crash 시 복구, rate-limit, 페이지 잘림 테스트.
- [ ] 직원의 개인 성과 평가 지표로 사용하지 않는다는 안내 및 접근 감사.

## 9. 단계별 개발 로드맵 / Definition of Done

### Phase 0 — 기반 및 Mock (완료 조건: 실제 사내망 없이 demo 가능)
- monorepo 초기화, README/설정 예시, backend/frontend, DB migration, Docker Compose.
- Fake GHES server (PR/commit/review/권한 오류/페이지네이션/한글/영어) 및 Fake OpenAI-compatible LLM.
- `/health` 및 기본 보고서 생성 화면, CI 테스트.

### Phase 1 — GHES 어댑터 (완료 조건: 허용 저장소에서 정확하게 수집)
- 연결/토큰 검사, 기본 repo allowlist, 인증 사용자 확인, 페이지네이션, 재시도, 시간 변환, 증거 저장.
- commit / PR / review 수집 및 부분 실패·커버리지 표시.
- PR와 커밋 연계, 중복 제거, 봇/저자 불일치 경고.

### Phase 2 — AI 보고서 엔진 (완료 조건: 한국어·근거검증 보고서)
- WorkItem 결정론 그룹화 → LLM JSON 구조화 → 스키마 및 evidence 검증 → Markdown 작성.
- 회사 내부 OpenAI 호환 `chat.completions` 어댑터, timeout/retry, 모델별 JSON mode 미지원 fallback.
- 기술 용어 사전, 문체 템플릿, 잘못된 정량 성과 방지 테스트.

### Phase 3 — UX·보안·시범 운영 (완료 조건: 제한된 사내 그룹에서 사용)
- 보고서 편집·확정·내보내기, 히스토리, 권한·감사로그, 관리자 설정.
- SSO/인증 프록시 연계 또는 single-user PoC 모드 고정, 접근/LLM 정책 감사.
- 3~5명·3~10 저장소로 수작업 보고와 비교; 실패 사례 테스트 고정.

### Phase 4 — 운영 확장 (시범 운영 이후)
- PostgreSQL 다중 Worker 성능, 팀 스케줄, 변경 사항 증분 동기화, Confluence, GHES App/SSO 정식 인증, 관리자 운영 화면.

## 10. 테스트 설계

| 구분 | 필수 검증 케이스 |
|---|---|
| 수집 | 빈 기간, 100+ 페이지, API 부분 실패, 401/403/404, 429/5xx, 오래된 서버의 API 차이 |
| 범위 | 기본 브랜치 밖 커밋, 같은 커밋 중복, squash merge, PR 리뷰만 수행한 사용자 |
| 시간 | KST 자정 경계, DST 보유 해외 TZ 입력, 미래 날짜 거부, 정확한 날짜 포함 범위 |
| 귀속 | GitHub 로그인과 커밋 이메일 불일치, 봇, 공동 작업, author vs reviewer |
| LLM | 영어 커밋 → 자연스러운 한국어, 원문 기술어 보존, 측정값 환각 방지, JSON 파손/근거 ID 환각 |
| 보안 | PAT 로그 미노출, 인증 프록시 헤더 위조, ACL 우회/IDOR, XSS, SSRF, 프롬프트 인젝션 |
| 운영 | 중간 중단 재시작, 중복 Job, DB migration rollback, 데이터 보존/삭제, 장애 알림 |

**고정 픽스처 예시:** `ROI bounds fix` + `refactor statistics` + `add tests`가 하나의 PR이면 하나의 WorkItem으로 묶기. 리뷰만 한 사용자에게 구현자로 잘못 귀속하지 않기. `performance improvements`만 보고 처리 속도 30% 향상이라고 만들지 않기.

## 11. Codex용 실행 지시서 (그대로 복사 가능)

> 당신은 숙련된 풀스택/보안 엔지니어다. 현 저장소에서 **DevBrief**를 구현한다. 사내망 GitHub Enterprise Server 3.x REST API, PAT 인증, 내부 OpenAI 호환 API, 한국어 개발 주간보고를 전제로 한다.
>
> **요구사항:** 이 문서의 PRD, 테이블, 엔드포인트, 단계별 DoD를 기준으로 동작하는 앱을 구현한다. 사내 API에 직접 접근하지 못하는 상황을 고려하여 `FakeGHES`·`FakeLLM`과 현실적인 픽스처를 포함하고, 환경변수로 Fake/Real 어댑터를 교체 가능하게 한다. 보안 승인 없이 외부 네트워크로 데이터/토큰을 전송하지 않는다.
>
> **진행 순서:** 먼저 `docs/IMPLEMENTATION_PLAN.md`에 Phase 0~3 체크리스트를 작성하고 Phase 0을 즉시 구현하라. 중간 확인을 기다리지 말고 테스트 가능한 작은 단위로 이어 진행하라. 각 Phase 종료 시 pytest + frontend 테스트 + 린트/타입체크를 실행하고 결과를 기록하라. 불명확한 GHES 3.x API 기능은 버전 호환 feature flag로 분리하고 문서에 지원 범위를 기록하라.
>
> **기술:** Python 3.11, uv, FastAPI, httpx, SQLAlchemy 2, Alembic, Pydantic 2, PostgreSQL(운영), SQLite(로컬), React + Vite + TypeScript, Docker Compose. 사내 미러가 필요한 설치 상황은 사전 설정 방식으로 구현. 서버는 비루트 실행. 암호/토큰은 파일 secret 지원.
>
> **최소 기능:** ① 관리자 GHES/LLM 연결 확인 ② 조직/저장소 allowlist ③ GitHub ID 여러 개/날짜 범위 ④ commits/PR/reviews 페이지네이션 수집과 partial 경고 ⑤ PR 중심 중복 제거 ⑥ structured WorkItem JSON과 evidence 검증 ⑦ 한국어 Markdown 보고서 ⑧ 수정·복사·확정 ⑨ Job progress ⑩ 단위/통합/보안 테스트.
>
> **보안 금지사항:** TLS verify 끄기, 토큰 브라우저 전달, 외부 모델 API에 사내 내용 보내기, 검증되지 않은 사용자 헤더 신뢰, 검색 결과를 전체 활동인 것처럼 보고하기, 근거 없는 성능 개선 수치 생성, 사람별 커밋 개수로 직원 순위 매기기.
>
> **중요 동작:** 기본 `metadata_only`; diff 미수집. 기본 브랜치 외 커밋과 리뷰만 한 기여자도 가능한 범위 내에서 파악. 보고서는 범위/누락/실패를 밝히고 사실마다 내부 GHES의 원문 링크가 있어야 한다.
>
> **완료 산출물:** 실행 가능한 소스, `deploy/compose.yaml`, `.env.example`(비밀 없음), DB migration, mock 데이터, 관리자 매뉴얼, API 문서(OpenAPI), 테스트 결과, 보안 점검 기록, 미구현 제한사항. 커밋은 Phase별로 나누고 최종 상태/실행 명령/known limitations를 요약한다.

## 12. 인프라 관리자에게 확인할 항목 (설치 전에 필수)

1. **정확한 GHES 3.x 버전**과 지원 REST API 버전 헤더.
2. GHES 웹/API 호스트, DNS/내부 CA, 서버에서 접근 가능한 네트워크 범위.
3. PAT 사용 정책(fine-grained 가능 여부, classic scope, 만료/갱신, read-only 전용 계정 가능 여부).
4. 앱에서 접근 허용할 org/repo 목록과 팀원 GitHub ID(개인정보 최소화).
5. 사내 OpenAI 호환 API base URL, model ID, `chat.completions`/structured output 지원 여부, TLS/인증/로깅·보존 정책.
6. 사내 인증 프록시/SSO 존재 여부, Docker 배포 허용 여부, 내부 패키지 미러/이미지 레지스트리.
7. 보고서·메타데이터 보존기간과 코드/리뷰 본문 LLM 전송 허용 범위.

## 13. 공식 참고 문서

- GHES REST API / Commit: https://docs.github.com/en/enterprise-server@3.18/rest/commits/commits
- GHES REST API / Pull request reviews: https://docs.github.com/en/enterprise-server@3.17/rest/pulls/reviews?apiVersion=2022-11-28
- REST pagination: https://docs.github.com/en/rest/using-the-rest-api/using-pagination-in-the-rest-api
- GHES Developer learning path(PAT): https://learn.github.com/learning-pathways/ghes-developer

> 문서의 3.17/3.18은 **참고 예시 버전**이며, 실제 설치 서버 버전과 일치하지 않을 수 있다. 구현 전 실제 GHES 릴리스에 대응하는 공식 문서와 테스트 서버에서 확인할 것.

