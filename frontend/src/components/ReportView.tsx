import { useState } from "react";
import { api, safeEvidenceUrl } from "../api/client";
import type { Report, WorkItem } from "../types";

const roles: Record<string, string> = {
  author: "작성",
  reviewer: "리뷰",
  committer: "커밋 반영",
  coauthor: "공동 작성",
  unknown: "확인 필요",
};
export default function ReportView({
  report,
  onChange,
  onError,
}: {
  report: Report;
  onChange: (r: Report) => void;
  onError: (s: string) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [person, setPerson] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [reviewed, setReviewed] = useState(false);
  async function refresh() {
    onChange(await api<Report>(`/reports/${report.id}`));
  }
  async function save(item: WorkItem, patch: Record<string, unknown>) {
    setBusy(true);
    setNotice("");
    try {
      await api(`/reports/${report.id}/work-items/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ version: item.version, ...patch }),
      });
      setEditing(null);
      setReviewed(false);
      await refresh();
      setNotice("수정 내용을 저장했습니다.");
    } catch (e) {
      onError((e as Error).message);
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  async function finalize() {
    setBusy(true);
    try {
      await api(`/reports/${report.id}/finalize`, {
        method: "POST",
        body: JSON.stringify({ revision: report.revision }),
      });
      await refresh();
      setNotice("보고서를 확정했습니다.");
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(report.markdown);
      setNotice("Markdown을 복사했습니다.");
    } catch {
      onError(
        "클립보드 접근이 차단되었습니다. Markdown 다운로드를 이용하세요.",
      );
    }
  }
  const people = [
    ...new Set(
      report.work_items.flatMap((i) => i.contributors.map((c) => c.login)),
    ),
  ];
  const visible = report.work_items.filter(
    (i) => !person || i.contributors.some((c) => c.login === person),
  );
  return (
    <>
      <div className="coverage">
        {report.coverage.repositories_succeeded}/
        {report.coverage.repositories_requested}개 저장소 수집 완료 ·{" "}
        {report.work_items.filter((i) => !i.excluded).length}개 업무 ·{" "}
        {report.status === "finalized" ? "확정" : "초안"} v{report.revision}
      </div>
      {notice && (
        <p role="status" className="toast">
          {notice}
        </p>
      )}
      {report.warnings.map((w, i) => (
        <p className="warning" key={i}>
          {w.message_ko || w.code} {w.repository}
        </p>
      ))}
      <details className="coverage-detail">
        <summary>수집 범위·실패·수집 시각 확인</summary>
        <p>
          최종 수집:{" "}
          {new Date(report.coverage.collected_at).toLocaleString("ko-KR", {
            timeZone: "Asia/Seoul",
          })}{" "}
          KST
        </p>
        <ul>
          {report.coverage.scope_repos.map((r) => (
            <li key={r}>
              {r} ·{" "}
              {report.coverage.failed_repos.includes(r)
                ? "일부 또는 전체 조회 실패"
                : "수집 완료"}
              <br />
              {report.coverage.branches_checked[r]?.join(", ")}
            </li>
          ))}
        </ul>
      </details>
      <label className="person-filter">
        기여자별 보기
        <select value={person} onChange={(e) => setPerson(e.target.value)}>
          <option value="">팀 전체</option>
          {people.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <small>공동 업무는 한 번 표시하고 참여 역할을 구분합니다.</small>
      </label>
      {!visible.length && (
        <p className="muted">선택한 기간에 해당하는 활동이 없습니다.</p>
      )}
      {visible.map((item) => (
        <article
          className={`work-item ${item.excluded ? "excluded" : ""}`}
          key={item.id}
        >
          <span className="item-status">
            {item.status}
            {item.excluded ? " · 보고서에서 제외" : ""}
          </span>
          {editing === item.id ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void save(item, { title_ko: title, summary_ko: summary });
              }}
            >
              <label>
                업무 제목
                <input
                  required
                  maxLength={300}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <label>
                수행 내용
                <textarea
                  required
                  maxLength={4000}
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                />
              </label>
              <div className="toolbar">
                <button className="primary" disabled={busy}>
                  수정 저장
                </button>
                <button
                  className="secondary"
                  type="button"
                  onClick={() => setEditing(null)}
                >
                  취소
                </button>
              </div>
            </form>
          ) : (
            <>
              <h3>{item.title_ko}</h3>
              <p>{item.summary_ko}</p>
            </>
          )}
          <p className="contributors">
            {item.contributors
              .map((c) => `${c.login} (${roles[c.role] || c.role})`)
              .join(" · ")}
          </p>
          <div className="evidence">
            {item.evidence.map((e) => (
              <a
                key={e.id}
                href={safeEvidenceUrl(e.url)}
                target="_blank"
                rel="noreferrer"
              >
                ↗ {e.label}
              </a>
            ))}
          </div>
          {item.unsupported_claims.map((claim, i) => (
            <p className="warning" key={i}>
              {claim}
            </p>
          ))}
          {report.status === "draft" && editing !== item.id && (
            <div className="toolbar">
              <button
                className="secondary"
                disabled={busy}
                onClick={() => {
                  setEditing(item.id);
                  setTitle(item.title_ko);
                  setSummary(item.summary_ko);
                }}
              >
                수정
              </button>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => void save(item, { excluded: !item.excluded })}
              >
                {item.excluded ? "다시 포함" : "제외"}
              </button>
            </div>
          )}
        </article>
      ))}
      <div className="toolbar">
        <button className="secondary" onClick={() => void copy()}>
          Markdown 복사
        </button>
        <a
          className="secondary"
          href={`/api/v1/reports/${report.id}/export?format=md`}
        >
          MD 다운로드
        </a>
        <a
          className="secondary"
          href={`/api/v1/reports/${report.id}/export?format=html`}
        >
          HTML 다운로드
        </a>
      </div>
      {report.status === "draft" && (
        <div className="finalize">
          <label className="inline-check">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(e) => setReviewed(e.target.checked)}
            />
            근거 링크와 수집 누락을 확인했습니다.
          </label>
          <button
            className="primary"
            disabled={busy || !reviewed || editing !== null}
            onClick={() => void finalize()}
          >
            보고서 확정
          </button>
        </div>
      )}
      <details>
        <summary>Markdown 원문</summary>
        <pre>{report.markdown}</pre>
      </details>
    </>
  );
}
