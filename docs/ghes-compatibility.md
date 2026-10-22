# GHES 호환 범위

공식 REST 계약을 참고해 GHES 3.x용 읽기 전용 REST 어댑터를 구현했습니다. 실제 서버 인증·버전 검증은 미실시입니다. 연결 검사에서 `X-GitHub-Enterprise-Version`을 기록합니다. 설치 버전의 헤더 지원을 확인한 후에만 `GHES_API_VERSION`을 설정하세요. 기본값은 헤더 생략입니다.

- PR 목록: state=all, sort=updated, direction=desc. 기간 필터를 서버가 지원한다고 가정하지 않으며 각 이벤트 날짜를 별도 검사합니다.
- 커밋: 기본 브랜치 + PR branch commits로 보완. PR commits API의 250개 한도/개수 불일치와 설정된 페이지 한도는 partial입니다.
- 리뷰: submitted_at으로 필터, 본문 미보관. 리뷰만 수행한 사용자를 구현자로 기록하지 않습니다.
- 모든 목록: per_page=100 및 Link rel=next. 동일 HTTPS 호스트·/api/v3 경로만 허용합니다.
- ETag는 단일 수집 client 안에서만 재사용하고 토큰 해시를 캐시 키에 포함합니다. 실행 간 증분 캐시는 후속 범위입니다.
- explicit repository allowlist만 지원합니다. 조직 전체 자동 discovery와 모든 branch 열거는 하지 않습니다.
- canonical ID는 /users/{login}으로 확인합니다. 미연결 이메일과 squash/coauthor 귀속은 경고합니다.

참고한 공식 계약: [GHES 3.18 PR](https://docs.github.com/en/enterprise-server@3.18/rest/pulls/pulls), [GHES 3.18 commits](https://docs.github.com/en/enterprise-server@3.18/rest/commits/commits), [GHES 3.17 reviews](https://docs.github.com/en/enterprise-server@3.17/rest/pulls/reviews). 버전 번호는 계약 참고용이며 운영 버전 추천이 아닙니다.
