import { useState } from "react";
import { api, errorMessage } from "../../api/client";
import Icon from "../../components/Icon";
import type { IconName } from "../../components/Icon";
import { Banner, Button, Card, PageHeader } from "../../components/ui";
import { fullDateTime } from "../../lib/format";
import { useSession } from "../../lib/session";

type Result = Record<string, unknown> & {
  connected?: boolean;
  version?: string;
  model?: string;
  warning?: string;
  features?: Record<string, boolean>;
  repositories?: { full_name: string; state: string }[];
  organizations?: { login: string; state: string }[];
};

type SyncResult = { login: string; state: string; repositories: number | null };

const featureLabel: Record<string, string> = {
  rest_pull_reviews: "PR 리뷰 REST API",
  search_required: "검색 API 필요",
  diff_collection: "diff 수집 (비활성 정책)",
};

const services: {
  key: "ghes" | "llm";
  title: string;
  icon: IconName;
  description: string;
}[] = [
  {
    key: "ghes",
    title: "GitHub Enterprise Server",
    icon: "repo",
    description: "PAT로 API 버전과 허용 저장소 접근 권한을 확인합니다.",
  },
  {
    key: "llm",
    title: "사내 LLM",
    icon: "sparkle",
    description: "요약 모델 응답과 JSON 모드 지원을 확인합니다.",
  },
];

export default function AdminConnections() {
  const { isDemo } = useSession();
  const [results, setResults] = useState<
    Record<string, { at: string; data?: Result; error?: string }>
  >({});
  const [busy, setBusy] = useState("");
  const [sync, setSync] = useState<{ at: string; rows: SyncResult[] } | null>(
    null,
  );

  async function syncOrgs() {
    setBusy("sync");
    try {
      const rows = await api<SyncResult[]>("/admin/organizations/sync", {
        method: "POST",
      });
      setSync({ at: new Date().toISOString(), rows });
    } catch (e) {
      setSync({
        at: new Date().toISOString(),
        rows: [{ login: errorMessage(e), state: "error", repositories: null }],
      });
    } finally {
      setBusy("");
    }
  }

  async function test(service: string) {
    setBusy(service);
    try {
      const data = await api<Result>(`/admin/connections/${service}/test`, {
        method: "POST",
      });
      setResults((r) => ({
        ...r,
        [service]: { at: new Date().toISOString(), data },
      }));
    } catch (e) {
      setResults((r) => ({
        ...r,
        [service]: { at: new Date().toISOString(), error: errorMessage(e) },
      }));
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="관리자 콘솔"
        title="연결 상태"
        description="연결 정보와 비밀은 서버 배포 설정에서 관리하며, 이 화면에서는 검사만 수행합니다."
        actions={
          <Button
            variant="primary"
            icon="refresh"
            loading={!!busy}
            onClick={async () => {
              for (const s of services) await test(s.key);
            }}
          >
            전체 검사
          </Button>
        }
      />
      {isDemo && (
        <Banner tone="info" title="데모 환경">
          가상 어댑터가 응답합니다. 실제 사내 서버에는 요청하지 않습니다.
        </Banner>
      )}
      <div className="admin-grid">
        {services.map((svc) => {
          const r = results[svc.key];
          const ok = r?.data?.connected;
          return (
            <Card key={svc.key} className="conn-card">
              <header className="conn-head">
                <div className="team-icon">
                  <Icon name={svc.icon} size={18} />
                </div>
                <div>
                  <h2>{svc.title}</h2>
                  <p className="muted small">{svc.description}</p>
                </div>
                <span className={`conn-state ${!r ? "" : ok ? "ok" : "bad"}`}>
                  <span className="dot" />
                  {!r ? "미검사" : ok ? "정상" : "오류"}
                </span>
              </header>
              <div role="status" aria-live="polite" className="conn-body">
                {!r && <p className="muted small">아직 검사하지 않았습니다.</p>}
                {r?.error && (
                  <Banner tone="danger" title="연결 실패">
                    {r.error}
                  </Banner>
                )}
                {r?.data && (
                  <>
                    <dl className="kv kv-compact">
                      {r.data.version && (
                        <div>
                          <dt>서버 버전</dt>
                          <dd className="mono">{r.data.version}</dd>
                        </div>
                      )}
                      {r.data.model && (
                        <div>
                          <dt>모델</dt>
                          <dd className="mono">{r.data.model}</dd>
                        </div>
                      )}
                      {"json_mode" in r.data && (
                        <div>
                          <dt>JSON 모드</dt>
                          <dd>{r.data.json_mode ? "지원" : "미지원"}</dd>
                        </div>
                      )}
                      {"read_only_verified" in r.data && (
                        <div>
                          <dt>읽기 전용 확인</dt>
                          <dd>
                            {r.data.read_only_verified
                              ? "확인됨"
                              : "수동 확인 필요"}
                          </dd>
                        </div>
                      )}
                      <div>
                        <dt>검사 시각</dt>
                        <dd>{fullDateTime(r.at)}</dd>
                      </div>
                    </dl>
                    {r.data.features && (
                      <ul className="checklist">
                        {Object.entries(r.data.features).map(([k, v]) => (
                          <li key={k} className={v ? "yes" : "no"}>
                            <Icon name={v ? "check" : "x"} size={14} />
                            {featureLabel[k] ?? k}
                          </li>
                        ))}
                      </ul>
                    )}
                    {r.data.repositories && (
                      <table className="table table-compact">
                        <thead>
                          <tr>
                            <th>저장소</th>
                            <th>접근</th>
                          </tr>
                        </thead>
                        <tbody>
                          {r.data.repositories.map((repo) => (
                            <tr key={repo.full_name}>
                              <td className="mono">{repo.full_name}</td>
                              <td>
                                {repo.state === "accessible" ? (
                                  <span className="status-text status-success">
                                    <Icon name="check" size={14} /> 접근 가능
                                  </span>
                                ) : (
                                  <span className="status-text status-danger">
                                    <Icon name="alert" size={14} /> {repo.state}
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    {!!r.data.organizations?.length && (
                      <table className="table table-compact">
                        <thead>
                          <tr>
                            <th>조직 (전체 허용)</th>
                            <th>접근</th>
                          </tr>
                        </thead>
                        <tbody>
                          {r.data.organizations.map((o) => (
                            <tr key={o.login}>
                              <td className="mono">{o.login}/*</td>
                              <td>
                                {o.state === "accessible" ? (
                                  <span className="status-text status-success">
                                    <Icon name="check" size={14} /> 접근 가능
                                  </span>
                                ) : (
                                  <span className="status-text status-danger">
                                    <Icon name="alert" size={14} /> {o.state}
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    {svc.key === "ghes" && sync && (
                      <table className="table table-compact">
                        <thead>
                          <tr>
                            <th>동기화 ({fullDateTime(sync.at)})</th>
                            <th>저장소</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sync.rows.map((o) => (
                            <tr key={o.login}>
                              <td className="mono">{o.login}</td>
                              <td>
                                {o.state === "synced" ? (
                                  `${o.repositories}개`
                                ) : (
                                  <span className="status-text status-danger">
                                    <Icon name="alert" size={14} /> {o.state}
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    {r.data.warning && (
                      <Banner tone="warning">{r.data.warning}</Banner>
                    )}
                    <details className="raw">
                      <summary>원본 응답</summary>
                      <pre>{JSON.stringify(r.data, null, 2)}</pre>
                    </details>
                  </>
                )}
              </div>
              <footer className="conn-foot">
                <Button
                  icon="plug"
                  loading={busy === svc.key}
                  disabled={!!busy && busy !== svc.key}
                  onClick={() => void test(svc.key)}
                >
                  연결 검사
                </Button>
                {svc.key === "ghes" && (
                  <Button
                    icon="refresh"
                    variant="ghost"
                    loading={busy === "sync"}
                    disabled={!!busy && busy !== "sync"}
                    onClick={() => void syncOrgs()}
                  >
                    조직 저장소 동기화
                  </Button>
                )}
              </footer>
            </Card>
          );
        })}
      </div>
    </>
  );
}
