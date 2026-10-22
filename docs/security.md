# 보안 검토 기록

## 구현 및 자동 검증

- HTTPS와 사내 CA 검증을 유지합니다. 승인 egress 호스트를 실제 모드에서 필수로 지정합니다. redirect 자동 추종을 끄고 API Link/증거 URL에 동일 호스트·경로 검사를 적용합니다.
- PAT/LLM key는 server secret 파일만 사용합니다. 로그 필터와 LLM 입력 마스킹은 알려진 토큰 패턴·설정된 secret·비밀번호/키 표현·이메일을 가립니다. 일반 API/worker 예외는 원문 traceback이나 외부 응답 본문을 노출하지 않습니다.
- diff patch 및 리뷰 본문은 저장/분석하지 않습니다. GHES 파일 목록 응답에 patch가 포함될 수 있으나 filename만 추출하고 버립니다. 코드 본문 수집을 허용하는 모드는 구현하지 않았습니다.
- single-user의 remote peer·X-Forwarded-For 위조 거부, proxy 서명/시간 검증, 관리자 endpoint 차단, repo ACL/IDOR/권한 회수를 테스트했습니다.
- Origin/Host 검사, CSP/no-sniff/no-referrer, React 기본 escaping, Markdown escape, HTML allowlist sanitization을 적용합니다. API 문서는 외부 CDN 없는 정적 목록+OpenAPI JSON입니다.
- JSON/evidence/기여자/상태 검증과 추측 수치 차단을 테스트했습니다. 저장소 데이터는 user 메시지에만 들어갑니다. 프롬프트 인젝션의 의미적 성공이나 모든 환각을 자동 검증으로 제거했다고 주장하지 않습니다.
- 수정은 버전 충돌 409, 확정 후 편집 금지, 수정 이력 보존, 조회/생성/수정/확정/다운로드/관리 검사 감사 기록을 적용합니다.
- lease 복구·최대 재시도·취소 fencing을 SQLite와 PostgreSQL 테스트로 확인했습니다.

## 배포 환경에서 필요한 검증

- 실제 GHES 계정의 read-only 권한/만료/회수, 정확한 GHES 버전별 API 동작.
- 내부 LLM의 로그·학습·보관 정책, 실제 한국어 요약의 의미적 사실성, 고객 식별 정보 분류.
- 사내 egress 방화벽/DNS/CA/TLS와 SSO 프록시의 헤더 제거·서명·네트워크 격리.
- 운영 부하, 장애 알림 연동, 백업 복구, 보고서/감사로그의 개인정보 보관 정책.
- dependency audit는 실행 시점에만 유효합니다. 내부 레지스트리의 실제 배포 이미지도 조직 스캐너로 검사하세요.

## 의도적인 범위 제한

인사 평가·순위·직원 점수·추측 성과·외부 SaaS 업로드를 구현하지 않습니다. API는 제한된 PoC 운영을 위한 구현이며 실제 SSO 통합·권한 승인과 사용자 수작업 사실 검토를 마치기 전 운영 준비가 완료된 것으로 보지 않습니다.
