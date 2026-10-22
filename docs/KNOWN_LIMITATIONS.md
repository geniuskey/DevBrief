# 현재 제한사항

이 구현은 Phase 0~3의 핵심 흐름을 검증 가능한 PoC로 제공합니다. Phase 3의 실제 사내 사용자 시범 운영·SSO 배포·수작업 사실성 비교는 아직 수행하지 않았습니다.

- 실제 GHES/LLM 자격증명은 제공되지 않았고 실제 연결을 시도하지 않았습니다. Fake HTTP 계약 검증을 실제 서버 호환성 보증으로 해석하면 안 됩니다.
- 조직 전체 자동 발견/조직·팀 동기화/사용자 그룹 ACL/팀 리더 공유 권한/Issue 이벤트/스케줄/Confluence/GitHub App은 미구현입니다. repo allowlist, 개인 소유 팀·보고서, 관리자 접근을 제공합니다.
- GHES instance 하나/PAT 하나를 전제로 합니다. PR·commit·review·event는 정규화 테이블에 저장하지만 github_accounts/ghes_instances/repo_acl 별도 테이블은 없습니다. repo ACL은 배포 JSON, WorkItem의 evidence/contributors는 JSON, 팀 구성의 이력은 Job 입력 스냅샷으로 보존합니다. 원 PR lifecycle 시간은 event에 보존합니다. event는 sync-run별 증거 스냅샷이며 같은 실행 안에서 중복을 제거합니다.
- PR 중심 그룹과 동일 SHA 중복 제거를 제공합니다. 독립 커밋은 보수적으로 각 한 건이며 fuzzy clustering·cross-PR 자동 그룹은 미구현입니다.
- 기본 브랜치+기간 관련 PR 범위입니다. 전체 브랜치·삭제된 기록·email 미연결/coauthor/squash 귀속을 완전히 파악하지 못합니다. PR 상태는 수집 시점 기준입니다.
- ETag와 LLM prompt cache는 수집 실행 내 메모리에만 존재합니다. 실행 간 증분 캐시/장기 암호화 캐시는 미구현입니다.
- LLM은 입력 크기 제한을 넘으면 fallback합니다. 모든 대형 PR을 자동 분할 요약하지 않습니다. JSON/evidence 존재 검증은 문장의 의미적 사실성을 증명하지 않습니다. 사람이 근거를 검토하고 확정해야 합니다.
- 감사 로그/보고서/수정 이력은 유지하고, 보존 명령은 원본 메타데이터 캐시만 정리합니다. 자동 스케줄과 보고서 최종 삭제 정책은 운영 환경에서 추가해야 합니다.
- 동일 pending 요청 재사용은 API 단일 요청 처리 기준입니다. 여러 API 서버의 완전 동시 접수를 DB unique로 차단하지 않습니다. PostgreSQL worker 점유/저장 fencing은 검증했습니다.
- 대규모 부하·장애 알림·운영 백업 복구·실제 TLS/SSO/egress 통합은 미검증입니다. Compose 전체 이미지 빌드와 PostgreSQL 17 데모 기동을 검증했고, 기본 Compose는 SQLite(WAL, 단일 worker)로 보고서 생성·재시작 후 보존·온라인 백업을 확인했습니다. 실제 사내망 배포는 별도 검증이 필요합니다.
