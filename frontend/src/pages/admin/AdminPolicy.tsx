import { useEffect, useState } from "react";
import { api, errorMessage } from "../../api/client";
import Icon from "../../components/Icon";
import { useToast } from "../../components/Toast";
import { Badge, Banner, Card, PageHeader, Skeleton } from "../../components/ui";
import type { Policy } from "./types";

export default function AdminPolicy() {
  const toast = useToast();
  const [policy, setPolicy] = useState<Policy | null>(null);
  useEffect(() => {
    api<Policy>("/admin/policy")
      .then(setPolicy)
      .catch((e) => toast.error(errorMessage(e)));
  }, [toast]);
  const dep = policy?.deployment;
  return (
    <>
      <PageHeader
        eyebrow="관리자 콘솔"
        title="정책·설정"
        description="수집 범위, 보관 기간, 배포 설정을 확인합니다."
      />
      {policy && (
        <Banner tone="info" title="설정 변경 방법">
          {policy.note_ko}.
        </Banner>
      )}
      {!policy ? (
        <Skeleton h={240} />
      ) : (
        <div className="admin-grid">
          <Card
            title="수집 범위"
            description="허용 목록에 있는 조직·저장소만 수집합니다."
          >
            <div className="field">
              <span className="field-label">허용 조직</span>
              <div className="chip-row">
                {policy.allowed_orgs.map((o) => (
                  <Badge key={o}>{o}</Badge>
                ))}
              </div>
            </div>
            <div className="field">
              <span className="field-label">
                허용 저장소 {policy.allowed_repositories.length}개
              </span>
              <ul className="repo-mini">
                {policy.allowed_repositories.map((r) => (
                  <li key={r}>
                    <Icon name="repo" size={12} />
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          </Card>
          <Card title="데이터 정책">
            <ul className="checklist">
              <li className="yes">
                <Icon name="check" size={14} /> PR 제목·본문, 커밋 메시지, 파일
                경로 사용
              </li>
              <li className="no">
                <Icon name="x" size={14} /> 코드 diff 수집·저장 안 함
              </li>
              <li className="no">
                <Icon name="x" size={14} /> 리뷰 본문 수집·저장 안 함
              </li>
            </ul>
            <dl className="kv">
              <div>
                <dt>수집 모드</dt>
                <dd className="mono">{policy.data_policy}</dd>
              </div>
              <div>
                <dt>메타데이터 보관</dt>
                <dd>{policy.retention_days}일</dd>
              </div>
              <div>
                <dt>수집 한도</dt>
                <dd>
                  페이지 {policy.max_pages.toLocaleString()} · 이벤트{" "}
                  {policy.max_events.toLocaleString()}
                </dd>
              </div>
            </dl>
          </Card>
          {dep && (
            <Card
              title="배포 설정"
              description="환경변수에서 읽은 현재 값입니다."
            >
              <dl className="kv">
                <div>
                  <dt>어댑터</dt>
                  <dd>
                    <Badge
                      tone={dep.adapter_mode === "fake" ? "warning" : "success"}
                    >
                      {dep.adapter_mode === "fake"
                        ? "fake · 데모"
                        : "real · 사내"}
                    </Badge>
                  </dd>
                </div>
                <div>
                  <dt>인증 방식</dt>
                  <dd>
                    {dep.single_user_mode
                      ? "단일 사용자 (localhost 전용)"
                      : dep.proxy_auth_mode === "oauth2_proxy"
                        ? "oauth2-proxy SSO 헤더"
                        : "HMAC 서명 프록시"}
                  </dd>
                </div>
                <div>
                  <dt>GHES</dt>
                  <dd className="mono">{dep.ghes_base_url}</dd>
                </div>
                <div>
                  <dt>LLM 모델</dt>
                  <dd className="mono">{dep.llm_model}</dd>
                </div>
                <div>
                  <dt>보고 시간대</dt>
                  <dd>{dep.report_timezone}</dd>
                </div>
                <div>
                  <dt>사용자당 동시 작업</dt>
                  <dd>{dep.max_pending_jobs}건</dd>
                </div>
                <div>
                  <dt>작업 제한 시간</dt>
                  <dd>{Math.round(dep.job_timeout_seconds / 60)}분</dd>
                </div>
              </dl>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
