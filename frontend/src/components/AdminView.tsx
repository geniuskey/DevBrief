import { useEffect, useState } from "react";
import { api } from "../api/client";
type Policy = {
  allowed_repositories: string[];
  data_policy: string;
  retention_days: number;
  note_ko: string;
};
type Audit = {
  id: string;
  time: string;
  principal: string;
  action: string;
  result: string;
};
export default function AdminView({
  onError,
}: {
  onError: (s: string) => void;
}) {
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [logs, setLogs] = useState<Audit[]>([]);
  const [results, setResults] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  useEffect(() => {
    api<Policy>("/admin/policy")
      .then(setPolicy)
      .catch((e) => onError(e.message));
    api<Audit[]>("/admin/audit-logs")
      .then(setLogs)
      .catch((e) => onError(e.message));
  }, [onError]);
  async function test(service: string) {
    setBusy(service);
    try {
      const result = await api<Record<string, unknown>>(
        `/admin/connections/${service}/test`,
        { method: "POST" },
      );
      setResults((prev) => ({
        ...prev,
        [service]: JSON.stringify(result, null, 2),
      }));
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <>
      <div className="admin-grid">
        <section className="panel">
          <h2>내부 서비스 연결</h2>
          <p className="muted">연결 정보와 비밀은 서버에서 관리합니다.</p>
          {["ghes", "llm"].map((service) => (
            <div key={service}>
              <div className="toolbar">
                <strong>{service.toUpperCase()}</strong>
                <button
                  className="secondary"
                  disabled={!!busy}
                  onClick={() => void test(service)}
                >
                  {busy === service ? "검사 중…" : "연결 검사"}
                </button>
              </div>
              {results[service] && <pre role="status">{results[service]}</pre>}
            </div>
          ))}
        </section>
        <section className="panel">
          <h2>수집·보관 정책</h2>
          {policy && (
            <>
              <p>수집 모드: {policy.data_policy}</p>
              <p>메타데이터 보관: {policy.retention_days}일</p>
              <ul>
                {policy.allowed_repositories.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
              <p className="muted">{policy.note_ko}</p>
            </>
          )}
        </section>
      </div>
      <section className="panel audit">
        <h2>최근 감사 기록</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>시간</th>
                <th>사용자</th>
                <th>작업</th>
                <th>결과</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td>{new Date(log.time).toLocaleString("ko-KR")}</td>
                  <td>{log.principal}</td>
                  <td>{log.action}</td>
                  <td>{log.result}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
