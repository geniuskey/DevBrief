# DevBrief 구현 계획

설계 기준: `DevBrief_GHES_PRD_Architecture_Codex.md` v1.0. 실제 사내망 접근 없이 Fake 모드부터 구현한다. Phase 4는 시범 운영 후 범위다.

## Phase 0 — 기반 / 실행 가능한 데모
- [x] FastAPI / React TypeScript / uv 모노레포, SQLite 및 PostgreSQL 설정
- [x] SQLAlchemy 모델 / Alembic 마이그레이션 / 독립 DB Job worker
- [x] Fake GHES / Fake LLM, 기본 생성 화면 및 보고서 조회
- [x] Compose, 환경 설정, CI
- [x] pytest + frontend tests + lint/typecheck 결과 기록 및 커밋

## Phase 1 — GHES 수집
- [x] TLS / 호스트·경로 검증 / secret 파일 / 연결 검사
- [x] repo allowlist / 페이지네이션 / retry / 서버 기능 정보
- [x] 날짜 [start, end) 변환, PR·커밋·리뷰 수집 및 증거 저장
- [x] PR 커밋 중복 제거, 리뷰 전용 기여, 부분 실패 및 커버리지
- [x] 수집 / 시간 / 오류 / SSRF 회귀 검증 및 커밋

## Phase 2 — 보고 엔진
- [x] 결정론 PR 그룹, 보수적인 독립 커밋 그룹
- [x] 내부 OpenAI-compatible HTTP 어댑터 / 구조화 응답 / 제한 및 마스킹
- [x] evidence 검증 / 허구 수치 차단 / 실패 시 검증 필요 초안
- [x] 한국어 Markdown 렌더링 및 근거 링크
- [x] LLM 계약 / 보안 회귀 검증 및 커밋

## Phase 3 — UX / 접근 통제 / 운영
- [ ] 편집·제외 / 낙관적 잠금 / 확정 / MD·HTML export / 히스토리 / 팀
- [ ] single-user 경계 또는 신뢰 프록시 인증, repo ACL / IDOR / 감사
- [ ] 관리 화면 / 보존 정리 / worker lease 복구
- [ ] 사용자 매뉴얼 / API 문서 / 보안 기록 / 제한사항
- [ ] 통합 / 보안 / 브라우저 검증 및 커밋

## 검증 기록
각 Phase의 실제 실행 결과는 `docs/TEST_RESULTS.md`에 누적한다. 실제 GHES 버전·내부 LLM·인증 프록시·운영 PostgreSQL 부하·사내 TLS/egress와 수작업 사실 검토는 설치 환경에서 별도 확인한다.
