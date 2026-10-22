# API 안내

- 기본 경로 `/api/v1`; 인증 principal은 localhost PoC 또는 검증된 프록시에서 가져옵니다.
- `/api/docs`: 외부 CDN 없는 endpoint 목록. `/api/openapi.json`: 실행 중 앱에서 생성한 OpenAPI 3 계약. 저장소 스냅샷은 [openapi.json](openapi.json)입니다.
- 오류: `{code, message_ko, request_id, details_safe}`. 입력 오류 422, 인증 401, 범위 권한 403, 다른 사용자의 비공개 객체 404, 버전 충돌 409, Job 제한 429.
- `/health/live`만 비인증입니다. `/health/ready`는 인증 후 DB 상태를 확인합니다. 내부 서비스 상태는 관리자 연결 검사로 별도 확인합니다.
- `GET /me`는 `{id, name, role, email, group}`을 반환합니다. oauth2-proxy 모드의 `name`은 preferred username, `email`은 이메일 헤더, `group`은 그룹 목록의 첫 값입니다. 이메일·그룹이 없거나 다른 인증 모드이면 해당 값은 `null`입니다. 설정은 [관리자 안내](admin-guide.md#oauth2-proxy-연동)를 참고하세요.

## 생성 → 조회 → 편집 → 확정

```http
POST /api/v1/reports
Content-Type: application/json

{"type":"team","github_logins":["alice","bob"],"repository_ids":["저장소 UUID"],"start_date":"2026-10-12","end_date":"2026-10-18","timezone":"Asia/Seoul","policy":"metadata_only"}
```

202 응답의 job_id로 `GET /jobs/{job_id}`를 조회합니다. status가 complete/partial이면 report_id로 `GET /reports/{report_id}`를 조회합니다. failed에는 안전한 error_code가 있습니다. coverage는 요청·성공·실패 repo 수, 실제 범위·branch, 실패 목록, 수집 시각, completeness와 측정한 event 수를 제공합니다.

`PATCH /reports/{id}/work-items/{item_id}`에 `{version:1,title_ko:"...",summary_ko:"...",excluded:false}` 중 수정할 필드를 전달합니다. stale version은 409이며 최신 보고서를 다시 조회해야 합니다. 수정 시 report revision도 증가합니다.

`POST /reports/{id}/finalize`에 최신 `{revision:2}`를 보냅니다. 이후 수정은 409입니다. `GET /reports/{id}/export?format=md` 또는 `format=html`은 attachment를 반환합니다. HTML은 sanitization과 CSP를 적용합니다.

## 그 외

- `GET /me`, `/settings/capabilities`, `/repositories?org=&q=`, `/github/users?q=정확한ID`.
- `GET/POST /teams`, `GET/PUT/DELETE /teams/{id}`. 생성한 Job은 팀 구성의 입력 스냅샷을 유지합니다.
- `GET /reports?team_id=&from=YYYY-MM-DD&to=YYYY-MM-DD`: 권한 내 최근 최대 500건에서 필터링합니다.
- `POST /jobs/{id}/cancel`: queued/running만 취소합니다. 종료된 작업은 409입니다.
- `POST /admin/connections/ghes/test`, `/admin/connections/llm/test`.
- `GET /admin/policy`: 비밀을 제외한 배포 정책. 정책 변경은 배포 설정에서 수행합니다.
- `GET /admin/audit-logs?limit=100`: 관리자, 최대 500건.

PAT와 LLM key를 받거나 반환하는 API는 없습니다. 모든 응답과 설정은 metadata_only를 전제로 합니다.
